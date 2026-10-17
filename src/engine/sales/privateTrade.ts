/**
 * 내부거래 제안(M4-C7a): 관계·명성이 충분한 AI 오너브리더가 자기 생산 2세 유망주(미출주)를 플레이어에게 개인적으로 판다.
 * 주간 시스템(id 'private_trade', 세일 다음·전속 계약 앞): 만료·무효 제안 정리 → PRIVATE_OFFER_WEEKS 주에만 새 제안 생성.
 * 난수: 제안 생성은 `${initialSeed}:private:${year}:${week}` 스트림만 쓰고 ctx.rng 는 쓰지 않는다.
 * 가격 평가는 말마다 `${initialSeed}:privval:${horseId}` 스트림을 쓴다(목록 화면 추정과 가격이 같은 평가를 본다).
 * 플레이어 API(accept·decline·view·inspect)는 입력 state 를 바꾸지 않는다.
 */
import {
  OWNER_RELATION_PRIVATE_PURCHASE,
  PRIVATE_OFFER_BASE_WEIGHT,
  PRIVATE_OFFER_DISCOUNT_CAP,
  PRIVATE_OFFER_DISCOUNT_DIVISOR,
  PRIVATE_OFFER_HORSE_AGE,
  PRIVATE_OFFER_MAX_ACTIVE,
  PRIVATE_OFFER_MIN_PRICE,
  PRIVATE_OFFER_MIN_RELATION,
  PRIVATE_OFFER_MIN_REPUTATION,
  PRIVATE_OFFER_PER_RUN,
  PRIVATE_OFFER_PREMIUM,
  PRIVATE_OFFER_REPUTATION_WEIGHT_DIVISOR,
  PRIVATE_OFFER_ROUND,
  PRIVATE_OFFER_TIERS,
  PRIVATE_OFFER_VALID_WEEKS,
  PRIVATE_OFFER_WEEKS,
} from '../config/privateTrade';
import { recordMoney } from '../economy/ledger';
import { adjustRelation, relationKey, relationOf } from '../economy/relations';
import { canSpendDiscretionary } from '../economy/solvency';
import { mareCapacity, playerBroodmareCount } from '../farm/purchase';
import { assessHorse } from '../horse/assessment';
import { stageFor, trainerAssessorSkill } from '../horse/playerView';
import type { PlayerResult } from '../season/player';
import { createRng } from '../rng';
import { compareDates } from '../time/calendar';
import type {
  Assessment,
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  Money,
  Owner,
  OwnerId,
  PerformanceEntry,
  PrivateOffer,
  Rng,
  SaleKind,
  Sex,
  TrainerId,
  WeekContext,
  Week,
  WeeklySystem,
} from '../types';
import { PRIVATE_OR_BAND_WIDTH } from '../config/sales';
import { eligibleInspectors } from './inspection';
import { estimateRange, valueLot } from './valuation';

/** farm_full: 번식 암말을 사는데 목장이 없거나 번식 암말 수용 두수가 찼다(M7-G1) */
export type AcceptPrivateOfferError = 'offer_not_found' | 'offer_invalid' | 'insufficient_funds' | 'farm_full';
export type DeclinePrivateOfferError = 'offer_not_found';
export type InspectOfferError = 'offer_not_found' | 'not_eligible';

/** 제안 출처(PrivateOffer.source 가 없으면 relation) */
export type PrivateOfferSource = 'relation' | 'market' | 'enquiry';
/** 화면용 말 종류: 미출주 2세 / 현역마(3세 이상) / 번식 암말 */
export type PrivateOfferKind = 'two_year_old' | 'racehorse' | 'broodmare';

/** 화면용 최근 성적 요약(통산 + 올해 마지막 출주 착순). 원값 그대로 보여도 되는 공개 기록만 쓴다 */
export interface OfferRecordSummary {
  starts: number;
  wins: number;
  groupWins: number;
  /** 올해 마지막 출주의 착순. 올해 출주가 없으면 null */
  lastPosition: number | null;
}

/** 화면용 제안 한 줄. 가치 원값은 없고 추정 범위(estimate)만 있다. 공식 레이팅도 원값 대신 구간(orBand)만 준다 */
export interface PrivateOfferView {
  offerId: string;
  horseId: HorseId;
  horseName: string;
  sex: Sex;
  /** 올해 기준 나이 */
  age: number;
  sireId: HorseId | null;
  ownerId: OwnerId;
  ownerName: string;
  price: Money;
  estimate: { low: Money; high: Money };
  expiresYear: number;
  expiresWeek: Week;
  /** 제안 출처(M7-G1). 옛 제안(출처 없음)은 'relation' */
  source: PrivateOfferSource;
  kind: PrivateOfferKind;
  /** 공식 레이팅 추정 구간(PRIVATE_OR_BAND_WIDTH 폭). 레이팅이 없으면 null */
  orBand: { low: number; high: number } | null;
  record: OfferRecordSummary;
}

export type InspectOfferResult = { ok: true; assessment: Assessment } | { ok: false; error: InspectOfferError };

/** 마주 추첨 후보 한 줄 */
interface OfferPoolEntry {
  ownerId: OwnerId;
  weight: number;
  horses: Horse[];
}

function fail<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/** 제안 유효 기간이 지났는가(date 가 expiresYear/expiresWeek 보다 뒤) */
function isExpiredAt(offer: PrivateOffer, date: GameDate): boolean {
  if (date.year !== offer.expiresYear) return date.year > offer.expiresYear;
  return date.week > offer.expiresWeek;
}

/** 제안 출처. source 가 없는 옛 제안은 관계 제안 */
export function offerSourceOf(offer: PrivateOffer): PrivateOfferSource {
  return offer.source ?? 'relation';
}

/** 이 말이 아직 출주 신청 전(선언이 열려 있는 레이스에 없다)인가: open·closed 개최 레이스의 선언에 없어야 한다 */
export function declaredInPendingRace(state: GameState, horseId: HorseId): boolean {
  return state.seasonState.meetings.some((meeting) =>
    meeting.races.some(
      (sr) => (sr.status === 'open' || sr.status === 'closed') && sr.declarations.some((d) => d.horseId === horseId),
    ),
  );
}

/** 올해 G1 우승이 있는가(올해 퍼포먼스 기록의 G1 1착). 연도 전환 때 기록이 비므로 올해 것만 본다 */
export function groupOneWinThisYear(state: GameState, horseId: HorseId): boolean {
  return (state.seasonState.performances[horseId] ?? []).some(
    (run) => run.grade === 'G1' && run.position === 1 && run.date.year === state.date.year,
  );
}

/**
 * 시장·문의 제안의 말이 아직 팔 수 있는가: 제안한 마주 소유, 현역마(in_training) 또는 번식 암말(broodmare),
 * 출주 선언이 열려 있지 않다. 출주 기록 수는 보지 않는다(3세 이상은 이미 출주했을 수 있다).
 */
export function marketOfferHorseOpen(state: GameState, offer: PrivateOffer): boolean {
  const horse = state.horses[offer.horseId];
  if (horse === undefined || horse.ownerId !== offer.ownerId) return false;
  if (horse.status !== 'in_training' && horse.status !== 'broodmare') return false;
  return !declaredInPendingRace(state, horse.id);
}

/** 말이 여전히 판매 대상인가: 있고, 제안한 마주 소유이고, 관계 제안은 출주 전, 시장·문의 제안은 판매 가능 상태다 */
function isOfferHorseValid(state: GameState, offer: PrivateOffer): boolean {
  const source = offerSourceOf(offer);
  if (source !== 'relation') return marketOfferHorseOpen(state, offer);
  const horse = state.horses[offer.horseId];
  if (horse === undefined) return false;
  return horse.ownerId === offer.ownerId && horse.record.starts === 0;
}

/** 제안 가격 평가 rng(말마다 고정 스트림). 목록 추정·시장·문의 가격도 같은 평가를 쓴다 */
export function valuationRng(state: GameState, horseId: HorseId): Rng {
  return createRng(`${state.initialSeed}:privval:${horseId}`);
}

/** 제안 가격(€, 정수, PRIVATE_OFFER_ROUND 단위). 평가값 × 할증 × 관계 할인, 하한 적용 */
function offerPrice(state: GameState, horse: Horse, ownerId: OwnerId, year: number): Money {
  const value = valueLot(state, horse, 'breeze_up', year, valuationRng(state, horse.id));
  const relation = relationOf(state, relationKey('owner', ownerId));
  const discount = Math.min(Math.max(relation, 0), PRIVATE_OFFER_DISCOUNT_CAP) / PRIVATE_OFFER_DISCOUNT_DIVISOR;
  const rounded = Math.round((value * PRIVATE_OFFER_PREMIUM * (1 - discount)) / PRIVATE_OFFER_ROUND) * PRIVATE_OFFER_ROUND;
  return Math.max(PRIVATE_OFFER_MIN_PRICE, rounded);
}

/** 자격 마주: AI 마주, 생산목장 있음, 등급 허용 등급 */
function isOfferSeller(state: GameState, owner: Owner): boolean {
  if (owner.isPlayer || owner.id === state.playerOwnerId) return false;
  if (owner.studName === null) return false;
  return PRIVATE_OFFER_TIERS.includes(owner.tier);
}

/** 관계 또는 명성 조건을 만족하는가 */
function meetsRelationOrReputation(state: GameState, ownerId: OwnerId): boolean {
  if (relationOf(state, relationKey('owner', ownerId)) >= PRIVATE_OFFER_MIN_RELATION) return true;
  return state.relations.reputation >= PRIVATE_OFFER_MIN_REPUTATION;
}

/** 마주 추첨 가중치 */
function offerWeight(state: GameState, ownerId: OwnerId): number {
  const relation = relationOf(state, relationKey('owner', ownerId));
  return (
    PRIVATE_OFFER_BASE_WEIGHT +
    Math.max(0, relation) +
    state.relations.reputation / PRIVATE_OFFER_REPUTATION_WEIGHT_DIVISOR
  );
}

/** 마주별 제안 후보(생산·소유 일치, 올해 2세, 현역 대기, 미출주). 말 id 순서 */
function candidatesByOwner(state: GameState, year: number): Map<OwnerId, Horse[]> {
  const map = new Map<OwnerId, Horse[]>();
  for (const id of Object.keys(state.horses).sort()) {
    const horse = state.horses[id];
    if (horse === undefined || horse.ownerId === null || horse.breederId !== horse.ownerId) continue;
    if (year - horse.birthYear !== PRIVATE_OFFER_HORSE_AGE) continue;
    if (horse.status !== 'in_training' || horse.record.starts !== 0) continue;
    const list = map.get(horse.ownerId) ?? [];
    list.push(horse);
    map.set(horse.ownerId, list);
  }
  return map;
}

/** 가중치 비복원 추첨: 누적 가중치로 한 칸을 고른다. 반환은 pool 의 인덱스 */
function weightedIndex(pool: readonly OfferPoolEntry[], rng: Rng): number {
  let total = 0;
  for (const entry of pool) total += entry.weight;
  const target = rng.next() * total;
  let acc = 0;
  for (const [index, entry] of pool.entries()) {
    acc += entry.weight;
    if (target < acc) return index;
  }
  return pool.length - 1;
}

/** 만료 제안 삭제(이벤트 expired)와 무효 제안 조용한 삭제. 두 주간 시스템(관계·시장)이 함께 쓴다(같은 입력이면 두 번째는 할 일이 없다) */
export function sweepOffers(draft: GameState, date: GameDate, events: GameEvent[]): void {
  const kept: PrivateOffer[] = [];
  for (const offer of draft.sales.privateOffers) {
    if (isExpiredAt(offer, date)) {
      events.push({
        type: 'private_offer',
        offerId: offer.id,
        ownerId: offer.ownerId,
        horseId: offer.horseId,
        price: offer.price,
        change: 'expired',
        date: { ...date },
      });
      continue;
    }
    if (!isOfferHorseValid(draft, offer)) continue;
    kept.push(offer);
  }
  draft.sales.privateOffers = kept;
}

/**
 * 이번 주 새 제안 생성(PRIVATE_OFFER_WEEKS 주에만 호출). 진행 중 관계 제안이 MAX 미만인 동안, 주당 PER_RUN 건까지.
 * 시장·문의 제안은 세지 않는다(개수·마주 중복 판정 모두 관계 제안만 본다). 제안 가격 평가 rng 는 말마다 고정 스트림.
 */
function generateOffers(draft: GameState, date: GameDate, events: GameEvent[]): void {
  const year = date.year;
  const rng = createRng(`${draft.initialSeed}:private:${year}:${date.week}`);
  const relationOffers = draft.sales.privateOffers.filter((o) => offerSourceOf(o) === 'relation');
  let active = relationOffers.length;
  const activeOwners = new Set(relationOffers.map((o) => o.ownerId));
  const byOwner = candidatesByOwner(draft, year);

  const pool: OfferPoolEntry[] = [];
  for (const ownerId of Object.keys(draft.owners).sort()) {
    const owner = draft.owners[ownerId];
    if (owner === undefined || !isOfferSeller(draft, owner)) continue;
    if (activeOwners.has(owner.id) || !meetsRelationOrReputation(draft, owner.id)) continue;
    const horses = byOwner.get(owner.id);
    if (horses === undefined || horses.length === 0) continue;
    pool.push({ ownerId: owner.id, weight: offerWeight(draft, owner.id), horses });
  }

  let created = 0;
  while (created < PRIVATE_OFFER_PER_RUN && active < PRIVATE_OFFER_MAX_ACTIVE && pool.length > 0) {
    const entry = pool.splice(weightedIndex(pool, rng), 1)[0];
    if (entry === undefined) break;
    const horse = rng.pick(entry.horses);
    const price = offerPrice(draft, horse, entry.ownerId, year);
    const no = draft.sales.nextPrivateOfferNo;
    draft.sales.nextPrivateOfferNo = no + 1;
    // 관계 제안은 source 를 쓰지 않는다(없음 = relation). 옛 저장본·고정 해시와 같은 모양을 유지한다
    const offer: PrivateOffer = {
      id: `po_${year}_${no}`,
      ownerId: entry.ownerId,
      horseId: horse.id,
      price,
      createdYear: year,
      createdWeek: date.week,
      expiresYear: year,
      expiresWeek: date.week + PRIVATE_OFFER_VALID_WEEKS,
    };
    draft.sales.privateOffers.push(offer);
    active += 1;
    events.push({
      type: 'private_offer',
      offerId: offer.id,
      ownerId: offer.ownerId,
      horseId: offer.horseId,
      price,
      change: 'offered',
      date: { ...date },
    });
    created += 1;
  }
}

/** 내부거래 주간 시스템(id 'private_trade'). 정리 → (해당 주면) 생성 순서 */
export function createPrivateTradeSystem(): WeeklySystem {
  return {
    id: 'private_trade',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      const events: GameEvent[] = [];
      sweepOffers(draft, ctx.date, events);
      if (PRIVATE_OFFER_WEEKS.includes(ctx.date.week)) {
        generateOffers(draft, ctx.date, events);
      }
      return events;
    },
  };
}

/**
 * 제안을 수락한다. 말·소유·미출주와 유효 기간을 확인하고(아니면 offer_invalid, 제안은 지우지 않는다),
 * 자금을 확인한 뒤 플레이어가 산다. 장부 private_sale 양쪽, 소유 이전(조교사 유지), 판매 마주 관계 +OWNER_RELATION_PRIVATE_PURCHASE.
 */
export function acceptPrivateOffer(state: GameState, offerId: string): PlayerResult<AcceptPrivateOfferError> {
  const offer = state.sales.privateOffers.find((o) => o.id === offerId);
  if (offer === undefined) return fail('offer_not_found');
  if (isExpiredAt(offer, state.date) || !isOfferHorseValid(state, offer)) return fail('offer_invalid');
  const seller = state.owners[offer.ownerId];
  const buyer = state.owners[state.playerOwnerId];
  if (seller === undefined || buyer === undefined) return fail('offer_invalid');
  if (!canSpendDiscretionary(state, offer.price)) return fail('insufficient_funds');
  if (state.horses[offer.horseId]?.status === 'broodmare'
    && (!state.farm.owned || playerBroodmareCount(state) >= mareCapacity(state))) return fail('farm_full');

  const next = structuredClone(state);
  const date: GameDate = { year: state.date.year, week: state.date.week };
  const playerId = next.playerOwnerId;
  recordMoney(next, playerId, 'private_sale', -offer.price, date, offer.horseId);
  recordMoney(next, offer.ownerId, 'private_sale', offer.price, date, offer.horseId);

  const horse = next.horses[offer.horseId];
  const nextSeller = next.owners[offer.ownerId];
  const nextBuyer = next.owners[playerId];
  if (horse === undefined || nextSeller === undefined || nextBuyer === undefined) return fail('offer_invalid');
  nextSeller.horseIds = nextSeller.horseIds.filter((id) => id !== offer.horseId);
  nextBuyer.horseIds.push(offer.horseId);
  horse.ownerId = playerId;

  adjustRelation(next, relationKey('owner', offer.ownerId), OWNER_RELATION_PRIVATE_PURCHASE);
  next.sales.privateOffers = next.sales.privateOffers.filter((o) => o.id !== offerId);

  const events: GameEvent[] = [
    {
      type: 'private_offer',
      offerId,
      ownerId: offer.ownerId,
      horseId: offer.horseId,
      price: offer.price,
      change: 'accepted',
      date: { ...date },
    },
    {
      type: 'horse_sold',
      horseId: offer.horseId,
      fromOwnerId: offer.ownerId,
      toOwnerId: playerId,
      price: offer.price,
      date: { ...date },
    },
  ];
  return { ok: true, state: next, events };
}

/** 제안을 거절한다. 제안만 지우고 관계는 바뀌지 않는다 */
export function declinePrivateOffer(state: GameState, offerId: string): PlayerResult<DeclinePrivateOfferError> {
  const offer = state.sales.privateOffers.find((o) => o.id === offerId);
  if (offer === undefined) return fail('offer_not_found');
  const next = structuredClone(state);
  next.sales.privateOffers = next.sales.privateOffers.filter((o) => o.id !== offerId);
  const events: GameEvent[] = [
    {
      type: 'private_offer',
      offerId,
      ownerId: offer.ownerId,
      horseId: offer.horseId,
      price: offer.price,
      change: 'declined',
      date: { year: state.date.year, week: state.date.week },
    },
  ];
  return { ok: true, state: next, events };
}

/**
 * 화면용 제안 목록(유효 기간 안의 제안만, 저장 순서). 가치 원값은 넣지 않고 추정 범위(estimate)만 준다.
 * 말·마주가 없는 제안은 건너뛴다.
 */
export function privateOfferView(state: GameState): PrivateOfferView[] {
  const rows: PrivateOfferView[] = [];
  for (const offer of state.sales.privateOffers) {
    const horse = state.horses[offer.horseId];
    const owner = state.owners[offer.ownerId];
    if (horse === undefined || owner === undefined || isExpiredAt(offer, state.date)) continue;
    const age = state.date.year - horse.birthYear;
    const kind = offerKind(horse, age);
    const valuation = valueLot(state, horse, valuationKindOf(kind), state.date.year, valuationRng(state, horse.id));
    rows.push({
      offerId: offer.id,
      horseId: horse.id,
      horseName: horse.name,
      sex: horse.sex,
      age,
      sireId: horse.sireId,
      ownerId: owner.id,
      ownerName: owner.name,
      price: offer.price,
      estimate: estimateRange(valuation),
      expiresYear: offer.expiresYear,
      expiresWeek: offer.expiresWeek,
      source: offerSourceOf(offer),
      kind,
      orBand: orBandOf(horse.officialRating),
      record: recordSummary(state, horse),
    });
  }
  return rows;
}

/** 추정 범위의 평가 종류: 제안 가격을 정한 평가와 같다(2세 브리즈업 / 현역마 / 번식 암말) */
function valuationKindOf(kind: PrivateOfferKind): SaleKind {
  if (kind === 'broodmare') return 'breeding_stock';
  return kind === 'two_year_old' ? 'breeze_up' : 'horses_in_training';
}

/** 화면용 말 종류: 번식 암말 → broodmare, 2세 → two_year_old, 그 밖 → racehorse */
function offerKind(horse: Horse, age: number): PrivateOfferKind {
  if (horse.status === 'broodmare') return 'broodmare';
  return age === PRIVATE_OFFER_HORSE_AGE ? 'two_year_old' : 'racehorse';
}

/** 공식 레이팅 구간: PRIVATE_OR_BAND_WIDTH 폭으로 내린 값부터 한 폭. 레이팅이 없으면 null */
function orBandOf(rating: number | null): { low: number; high: number } | null {
  if (rating === null) return null;
  const low = Math.floor(rating / PRIVATE_OR_BAND_WIDTH) * PRIVATE_OR_BAND_WIDTH;
  return { low, high: low + PRIVATE_OR_BAND_WIDTH };
}

/** 통산 기록 + 올해 마지막 출주 착순(performances 는 올해 것만 있다) */
function recordSummary(state: GameState, horse: Horse): OfferRecordSummary {
  const runs: readonly PerformanceEntry[] = state.seasonState.performances[horse.id] ?? [];
  let latest: PerformanceEntry | null = null;
  for (const run of runs) {
    if (latest === null || compareDates(run.date, latest.date) >= 0) latest = run;
  }
  return {
    starts: horse.record.starts,
    wins: horse.record.wins,
    groupWins: horse.record.groupWins,
    lastPosition: latest?.position ?? null,
  };
}

/**
 * 제안 말을 동행 검사한다(세일 동행 검사와 같은 자격: eligibleInspectors 에 있어야 함).
 * 평가자 능력 = trainerAssessorSkill, 단계 = stageFor, rng = `inspect-po:${offerId}:${trainerId}`. 입력 state 불변.
 */
export function inspectOfferHorse(state: GameState, offerId: string, trainerId: TrainerId): InspectOfferResult {
  const offer = state.sales.privateOffers.find((o) => o.id === offerId);
  if (offer === undefined) return { ok: false, error: 'offer_not_found' };
  const horse = state.horses[offer.horseId];
  if (horse === undefined) return { ok: false, error: 'offer_not_found' };
  if (!eligibleInspectors(state).some((inspector) => inspector.trainerId === trainerId)) {
    return { ok: false, error: 'not_eligible' };
  }
  const skill = trainerAssessorSkill(state, trainerId);
  const rng = createRng(`inspect-po:${offerId}:${trainerId}`);
  const assessment = assessHorse(horse, stageFor(horse, state.date), skill, state.date, rng);
  return { ok: true, assessment };
}
