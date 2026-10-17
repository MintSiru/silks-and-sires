/**
 * 개인 거래 시장(M7-G1, 출처 'market')과 구매 문의(출처 'enquiry'). 세일이 열리지 않는 달에도 살 말이 있게 한다.
 * 주간 시스템 'private_market'(내부거래 바로 뒤): 만료·무효 정리 → 주 번호가 PRIVATE_MARKET_INTERVAL_WEEKS 배수인 주에만 매물 생성.
 * 난수: 매물 생성은 `${initialSeed}:market:${year}:${week}` 스트림(후보 섞기·할증)만 쓰고 ctx.rng 는 쓰지 않는다(공용 rng 불변).
 *   말 가격 평가는 내부거래와 같은 `${initialSeed}:privval:${horseId}` 스트림. 문의 호가 할증은 `${initialSeed}:enquiry:${year}:${week}:${horseId}`.
 * 매물·호가는 플레이어가 사기 전까지 말의 소유·출주를 바꾸지 않는다(세계 불변). 플레이어 API(enquire)는 입력 state 를 바꾸지 않는다.
 */
import {
  PRIVATE_ENQUIRY_MIN_RACE_AGE,
  PRIVATE_ENQUIRY_OFFER_WEEKS,
  PRIVATE_ENQUIRY_PER_WEEK,
  PRIVATE_ENQUIRY_PREMIUM_MAX,
  PRIVATE_ENQUIRY_PREMIUM_MIN,
  PRIVATE_ENQUIRY_REFUSE_OR,
  PRIVATE_MARKET_G1_LOOKAHEAD_WEEKS,
  PRIVATE_MARKET_INTERVAL_WEEKS,
  PRIVATE_MARKET_MARE_AGE_MAX,
  PRIVATE_MARKET_MARE_AGE_MIN,
  PRIVATE_MARKET_MARE_SLOTS,
  PRIVATE_MARKET_OFFER_WEEKS,
  PRIVATE_MARKET_PREMIUM_MAX,
  PRIVATE_MARKET_PREMIUM_MIN,
  PRIVATE_MARKET_RACE_AGE_MAX,
  PRIVATE_MARKET_RACE_AGE_MIN,
  PRIVATE_MARKET_RACE_SLOTS,
  PRIVATE_MARKET_SIZE,
} from '../config/sales';
import { PRIVATE_OFFER_MIN_PRICE, PRIVATE_OFFER_ROUND } from '../config/privateTrade';
import type { PlayerResult } from '../season/player';
import { createRng } from '../rng';
import { addWeeks, weeksBetween } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  Money,
  OwnerId,
  PrivateOffer,
  SaleKind,
  WeekContext,
  WeeklySystem,
} from '../types';
import {
  declaredInPendingRace,
  groupOneWinThisYear,
  sweepOffers,
  valuationRng,
} from './privateTrade';
import { valueLot } from './valuation';

export type EnquiryError =
  | 'horse_not_found'
  | 'not_for_sale'
  | 'refused_group_winner'
  | 'refused_rating'
  | 'already_enquired'
  | 'enquiry_limit';

/** 마주 소유 후보 한 두 */
interface Candidate {
  horse: Horse;
  ownerId: OwnerId;
}

function fail<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/** 말의 AI 마주 id. 무소유·플레이어 소유·마주 기록 없음이면 null(매물·문의 대상이 아니다) */
function aiOwnerOf(state: GameState, horse: Horse): OwnerId | null {
  const ownerId = horse.ownerId;
  if (ownerId === null || ownerId === state.playerOwnerId) return null;
  const owner = state.owners[ownerId];
  if (owner === undefined || owner.isPlayer) return null;
  return ownerId;
}

/** 앞으로 PRIVATE_MARKET_G1_LOOKAHEAD_WEEKS 주 안(포함)의 개최에 G1 선언이 있는가. 개최 목록은 이번·다음 주만 가진다 */
function declaredInGroupOneSoon(state: GameState, horseId: HorseId): boolean {
  return state.seasonState.meetings.some((meeting) => {
    const ahead = weeksBetween(state.date, meeting.date);
    if (ahead < 0 || ahead > PRIVATE_MARKET_G1_LOOKAHEAD_WEEKS) return false;
    return meeting.races.some(
      (sr) => sr.race.grade === 'G1' && sr.declarations.some((d) => d.horseId === horseId),
    );
  });
}

/** 가격 = 평가값 × 할증, PRIVATE_OFFER_ROUND 단위 반올림, 하한 PRIVATE_OFFER_MIN_PRICE */
function roundPrice(raw: number): Money {
  const rounded = Math.round(raw / PRIVATE_OFFER_ROUND) * PRIVATE_OFFER_ROUND;
  return Math.max(PRIVATE_OFFER_MIN_PRICE, rounded);
}

/** 매물 후보: 현역마 3~6세(OR 있음, 출주 선언 없음, 올해 G1 우승 없음, 앞으로 G1 선언 없음), 번식 암말 4~12세 */
function marketCandidates(state: GameState): { races: Candidate[]; mares: Candidate[] } {
  const year = state.date.year;
  const listed = new Set(state.sales.privateOffers.map((o) => o.horseId));
  const races: Candidate[] = [];
  const mares: Candidate[] = [];
  for (const id of Object.keys(state.horses).sort()) {
    const horse = state.horses[id];
    if (horse === undefined || listed.has(id)) continue;
    const ownerId = aiOwnerOf(state, horse);
    if (ownerId === null) continue;
    const age = year - horse.birthYear;
    if (horse.status === 'in_training') {
      if (age < PRIVATE_MARKET_RACE_AGE_MIN || age > PRIVATE_MARKET_RACE_AGE_MAX) continue;
      if (horse.officialRating === null || groupOneWinThisYear(state, id)) continue;
      if (declaredInGroupOneSoon(state, id) || declaredInPendingRace(state, id)) continue;
      races.push({ horse, ownerId });
    } else if (horse.status === 'broodmare' && horse.sex === 'female') {
      if (age < PRIVATE_MARKET_MARE_AGE_MIN || age > PRIVATE_MARKET_MARE_AGE_MAX) continue;
      mares.push({ horse, ownerId });
    }
  }
  return { races, mares };
}

/**
 * 매물 생성: 현역마 최대 RACE_SLOTS 두, 번식 암말 최대 MARE_SLOTS 두(전체 SIZE 이하).
 * 후보는 섞은 뒤 앞에서 고르고, 말마다 평가값 × 할증(결정적)으로 가격을 정한다. 말 id 순서가 같으면 결과도 같다.
 */
function generateMarketOffers(draft: GameState, date: GameDate, events: GameEvent[]): void {
  const year = date.year;
  const rng = createRng(`${draft.initialSeed}:market:${year}:${date.week}`);
  const { races, mares } = marketCandidates(draft);
  const picks: { candidate: Candidate; kind: SaleKind }[] = [
    ...rng.shuffle(races).slice(0, PRIVATE_MARKET_RACE_SLOTS).map((candidate) => ({ candidate, kind: 'horses_in_training' as const })),
    ...rng.shuffle(mares).slice(0, PRIVATE_MARKET_MARE_SLOTS).map((candidate) => ({ candidate, kind: 'breeding_stock' as const })),
  ].slice(0, PRIVATE_MARKET_SIZE);

  const expires = addWeeks(date, PRIVATE_MARKET_OFFER_WEEKS);
  for (const { candidate, kind } of picks) {
    const { horse, ownerId } = candidate;
    const value = valueLot(draft, horse, kind, year, valuationRng(draft, horse.id));
    const premium = rng.range(PRIVATE_MARKET_PREMIUM_MIN, PRIVATE_MARKET_PREMIUM_MAX);
    const price = roundPrice(value * premium);
    const no = draft.sales.nextPrivateOfferNo;
    draft.sales.nextPrivateOfferNo = no + 1;
    const offer: PrivateOffer = {
      id: `po_${year}_${no}`,
      ownerId,
      horseId: horse.id,
      price,
      createdYear: year,
      createdWeek: date.week,
      expiresYear: expires.year,
      expiresWeek: expires.week,
      source: 'market',
    };
    draft.sales.privateOffers.push(offer);
    events.push({
      type: 'private_offer',
      offerId: offer.id,
      ownerId,
      horseId: horse.id,
      price,
      change: 'offered',
      date: { ...date },
    });
  }
}

/** 개인 거래 시장 주간 시스템(id 'private_market'). 정리 → (해당 주면) 매물 생성. ctx.rng 는 쓰지 않는다 */
export function createPrivateMarketSystem(): WeeklySystem {
  return {
    id: 'private_market',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      const events: GameEvent[] = [];
      sweepOffers(draft, ctx.date, events);
      if (ctx.date.week % PRIVATE_MARKET_INTERVAL_WEEKS === 0) {
        generateMarketOffers(draft, ctx.date, events);
      }
      return events;
    },
  };
}

/** 문의 대상 종류: 번식 암말(나이 제한 없음) 또는 3세 이상 현역마. 그 밖이면 null */
function enquiryKind(horse: Horse, age: number): SaleKind | null {
  if (horse.status === 'broodmare' && horse.sex === 'female') return 'breeding_stock';
  if (horse.status === 'in_training' && age >= PRIVATE_ENQUIRY_MIN_RACE_AGE) return 'horses_in_training';
  return null;
}

/**
 * AI 마주 말에 구매를 문의한다. 거절이면 오류를 돌려주고 상태는 그대로다.
 * 거절: 올해 G1 우승마(group_winner), 공식 레이팅 ≥ PRIVATE_ENQUIRY_REFUSE_OR, 이번 주에 이미 문의한 말,
 * 이번 주 문의 PRIVATE_ENQUIRY_PER_WEEK 회 초과. 수락하면 출처 'enquiry' 호가를 privateOffers 에 넣는다(기록은 호가 자체).
 * 호가 = 평가값 × 할증(PRIVATE_ENQUIRY_PREMIUM_MIN~MAX, 말·주마다 결정적), 유효 PRIVATE_ENQUIRY_OFFER_WEEKS 주.
 */
export function enquirePrivatePurchase(state: GameState, horseId: HorseId): PlayerResult<EnquiryError> {
  const horse = state.horses[horseId];
  if (horse === undefined) return fail('horse_not_found');
  const ownerId = aiOwnerOf(state, horse);
  if (ownerId === null || declaredInPendingRace(state, horseId)) return fail('not_for_sale');
  const year = state.date.year;
  const week = state.date.week;
  const kind = enquiryKind(horse, year - horse.birthYear);
  if (kind === null) return fail('not_for_sale');
  if (groupOneWinThisYear(state, horseId)) return fail('refused_group_winner');
  if (horse.officialRating !== null && horse.officialRating >= PRIVATE_ENQUIRY_REFUSE_OR) return fail('refused_rating');

  const weekly = state.sales.privateOffers.filter(
    (o) => o.source === 'enquiry' && o.createdYear === year && o.createdWeek === week,
  );
  if (weekly.some((o) => o.horseId === horseId)) return fail('already_enquired');
  if (weekly.length >= PRIVATE_ENQUIRY_PER_WEEK) return fail('enquiry_limit');

  const next = structuredClone(state);
  const value = valueLot(state, horse, kind, year, valuationRng(state, horseId));
  const premium = createRng(`${state.initialSeed}:enquiry:${year}:${week}:${horseId}`).range(
    PRIVATE_ENQUIRY_PREMIUM_MIN,
    PRIVATE_ENQUIRY_PREMIUM_MAX,
  );
  const price = roundPrice(value * premium);
  const no = next.sales.nextPrivateOfferNo;
  next.sales.nextPrivateOfferNo = no + 1;
  const expires = addWeeks(state.date, PRIVATE_ENQUIRY_OFFER_WEEKS);
  const offer: PrivateOffer = {
    id: `po_${year}_${no}`,
    ownerId,
    horseId,
    price,
    createdYear: year,
    createdWeek: week,
    expiresYear: expires.year,
    expiresWeek: expires.week,
    source: 'enquiry',
  };
  next.sales.privateOffers.push(offer);
  const events: GameEvent[] = [
    {
      type: 'private_offer',
      offerId: offer.id,
      ownerId,
      horseId,
      price,
      change: 'offered',
      date: { year, week },
    },
  ];
  return { ok: true, state: next, events };
}
