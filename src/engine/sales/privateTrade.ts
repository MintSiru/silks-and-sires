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
import { assessHorse } from '../horse/assessment';
import { stageFor, trainerAssessorSkill } from '../horse/playerView';
import type { PlayerResult } from '../season/player';
import { createRng } from '../rng';
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
  PrivateOffer,
  Rng,
  Sex,
  TrainerId,
  WeekContext,
  Week,
  WeeklySystem,
} from '../types';
import { eligibleInspectors } from './inspection';
import { estimateRange, valueLot } from './valuation';

export type AcceptPrivateOfferError = 'offer_not_found' | 'offer_invalid' | 'insufficient_funds';
export type DeclinePrivateOfferError = 'offer_not_found';
export type InspectOfferError = 'offer_not_found' | 'not_eligible';

/** 화면용 제안 한 줄. 가치 원값은 없고 추정 범위(estimate)만 있다 */
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

/** 말이 여전히 판매 대상인가: 있고, 제안한 마주 소유이고, 출주 전이다 */
function isOfferHorseValid(state: GameState, offer: PrivateOffer): boolean {
  const horse = state.horses[offer.horseId];
  if (horse === undefined) return false;
  return horse.ownerId === offer.ownerId && horse.record.starts === 0;
}

/** 제안 가격 평가 rng(말마다 고정 스트림) */
function valuationRng(state: GameState, horseId: HorseId): Rng {
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

/** 만료 제안 삭제(이벤트 expired)와 무효 제안 조용한 삭제 */
function sweepOffers(draft: GameState, date: GameDate, events: GameEvent[]): void {
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

/** 이번 주 새 제안 생성(PRIVATE_OFFER_WEEKS 주에만 호출). 진행 중 제안이 MAX 미만인 동안, 주당 PER_RUN 건까지 */
function generateOffers(draft: GameState, date: GameDate, events: GameEvent[]): void {
  const year = date.year;
  const rng = createRng(`${draft.initialSeed}:private:${year}:${date.week}`);
  const activeOwners = new Set(draft.sales.privateOffers.map((o) => o.ownerId));
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
  while (created < PRIVATE_OFFER_PER_RUN && draft.sales.privateOffers.length < PRIVATE_OFFER_MAX_ACTIVE && pool.length > 0) {
    const entry = pool.splice(weightedIndex(pool, rng), 1)[0];
    if (entry === undefined) break;
    const horse = rng.pick(entry.horses);
    const price = offerPrice(draft, horse, entry.ownerId, year);
    const no = draft.sales.nextPrivateOfferNo;
    draft.sales.nextPrivateOfferNo = no + 1;
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
    const valuation = valueLot(state, horse, 'breeze_up', state.date.year, valuationRng(state, horse.id));
    rows.push({
      offerId: offer.id,
      horseId: horse.id,
      horseName: horse.name,
      sex: horse.sex,
      age: state.date.year - horse.birthYear,
      sireId: horse.sireId,
      ownerId: owner.id,
      ownerName: owner.name,
      price: offer.price,
      estimate: estimateRange(valuation),
      expiresYear: offer.expiresYear,
      expiresWeek: offer.expiresWeek,
    });
  }
  return rows;
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
