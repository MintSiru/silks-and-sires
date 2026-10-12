import {
  DUE_WEEK_KEY_YEAR_SCALE,
  FAMILY_SCORE_DIVISOR,
  GESTATION_WEEKS,
  MARE_FERTILE_PEAK_AGE,
  MARE_FERTILITY_DECLINE,
  MARE_FERTILITY_FLOOR,
  MARE_MIN_BREEDING_AGE,
} from '../config/breedingSeason';
import { WEEKS_PER_YEAR } from '../config/game';
import { recordMoney } from '../economy/ledger';
import { makeNameRegistry, namingContextFor, type MutableNameRegistry } from '../naming/context';
import { nameForHorse } from '../naming/generate';
import type { NamingData } from '../naming/types';
import { allocateHorseId } from '../state/world';
import { addWeeks, isInPhase } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  NickEntry,
  OwnerId,
  SireLineId,
  WeekContext,
  WeeklySystem,
} from '../types';
import { breed, ownComplement, type HorseLookup } from './genetics';
import { dominantCrosses, findInbreeding, ownBloodPercent } from './inbreeding';
import { nickKey } from './nicks';
import { buildMatingPedigree } from './pedigree';

/** 교배 예약 실패 사유 */
export type BookingError =
  | 'not_breeding_season'
  | 'not_your_mare'
  | 'not_a_broodmare'
  | 'mare_too_young'
  | 'already_pregnant'
  | 'already_covered'
  | 'stallion_not_available'
  | 'book_full'
  | 'insufficient_funds';

export type BookingResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: BookingError };

/** 교배 시스템 정적 데이터(닉스 표·이름 단어장) */
export interface BreedingStaticData {
  nicks: readonly NickEntry[];
  /** 이름 생성 데이터(마주 스타일·어휘·보호 명단 등) */
  naming: NamingData;
  /** 종마 key → 표시 이름(부·모 이름 연상에 쓴다) */
  stallionNames: Record<string, string>;
}

const BREEDING_PHASE = 'breeding' as const;

function dateOf(d: GameDate): GameDate {
  return { year: d.year, week: d.week };
}

/** 출산 예정 키: 연도 × 100 + 주 (예: 2027년 7주 → 202707) */
function weekKey(d: GameDate): number {
  return d.year * DUE_WEEK_KEY_YEAR_SCALE + d.week;
}

/** 이번 주에 예약된 암말 id 집합. Mare.coveredWeek 가 이번 주 키와 같은 암말이다. */
function maresBookedOn(state: GameState, mareIds: readonly HorseId[], date: GameDate): Set<HorseId> {
  const booked = new Set<HorseId>();
  const key = weekKey(date);
  for (const mareId of mareIds) {
    if (state.mares[mareId]?.coveredWeek === key) booked.add(mareId);
  }
  return booked;
}

/** 암말의 나이별 수태율 배수 */
export function mareFertility(ageYears: number): number {
  if (ageYears <= MARE_FERTILE_PEAK_AGE) return 1;
  const declined = 1 - MARE_FERTILITY_DECLINE * (ageYears - MARE_FERTILE_PEAK_AGE);
  return Math.max(MARE_FERTILITY_FLOOR, declined);
}

/** 모계 명성 점수 0~1. 기록이 없으면 0 */
export function familyScore(state: GameState, mareId: HorseId): number {
  const mare = state.mares[mareId];
  if (mare === undefined) return 0;
  return Math.min(1, mare.blackTypeProduce / FAMILY_SCORE_DIVISOR);
}

/** 모부(damsire) 계통: dam.sireId 말의 sireLineId. 알 수 없으면 null */
export function damsireLineOf(state: GameState, dam: Horse): SireLineId | null {
  if (dam.sireId === null) return null;
  return state.horses[dam.sireId]?.sireLineId ?? null;
}

/** 모의 부(외조부) 말 전체: dam.sireId 로 찾는다. 없으면 null */
function damsireOf(state: GameState, dam: Horse): Horse | null {
  if (dam.sireId === null) return null;
  return state.horses[dam.sireId] ?? null;
}

/**
 * 닉스 단서를 공개한다. 새로 공개되면 true.
 * 중복은 추가하지 않으며 revealedNicks 는 정렬 상태를 유지한다. state 를 직접 수정한다.
 */
export function revealNick(
  state: GameState,
  sireLineId: SireLineId,
  damsireLineId: SireLineId,
): boolean {
  const key = nickKey(sireLineId, damsireLineId);
  const list = state.breeding.revealedNicks;
  if (list.includes(key)) return false;
  list.push(key);
  list.sort();
  return true;
}

/**
 * 플레이어 교배 예약. 원본 state 는 바꾸지 않는다(structuredClone).
 * 성공 시 종부료를 내고 암말에 종마를 배정하며, 예약 주(coveredWeek)를 기록한다.
 * 이벤트는 events 로만 돌려주며 state.eventLog 는 건드리지 않는다(로그 기록은 호출자 몫).
 */
export function bookCovering(
  state: GameState,
  ownerId: OwnerId,
  mareId: HorseId,
  stallionId: HorseId,
): BookingResult {
  const fail = (error: BookingError): BookingResult => ({ ok: false, error });

  if (!isInPhase(state.date.week, BREEDING_PHASE)) return fail('not_breeding_season');

  const horse = state.horses[mareId];
  if (horse === undefined || horse.ownerId !== ownerId) return fail('not_your_mare');

  const mare = state.mares[mareId];
  if (horse.status !== 'broodmare' || mare === undefined) return fail('not_a_broodmare');

  if (state.date.year - horse.birthYear < MARE_MIN_BREEDING_AGE) return fail('mare_too_young');
  if (mare.pregnant) return fail('already_pregnant');
  if (mare.coveredBy !== null) return fail('already_covered');

  const stallion = state.stallions[stallionId];
  if (stallion === undefined || state.date.year < stallion.firstSeasonYear) return fail('stallion_not_available');
  if (stallion.bookedThisSeason >= stallion.bookLimit) return fail('book_full');

  const payer = state.owners[ownerId];
  if (payer === undefined || payer.funds < stallion.fee) return fail('insufficient_funds');

  const next = structuredClone(state);
  const nextPayer = next.owners[ownerId];
  const nextMare = next.mares[mareId];
  const nextStallion = next.stallions[stallionId];
  if (nextPayer === undefined || nextMare === undefined || nextStallion === undefined) {
    throw new Error('bookCovering: 복제 상태에 필요한 레코드가 없다');
  }

  recordMoney(next, ownerId, 'stud_fee_paid', -stallion.fee, dateOf(state.date), mareId);
  nextMare.coveredBy = stallionId;
  nextMare.coveredWeek = weekKey(state.date);
  nextStallion.bookedThisSeason += 1;

  const event: GameEvent = {
    type: 'covering_booked',
    mareId,
    stallionId,
    fee: stallion.fee,
    date: dateOf(state.date),
  };
  return { ok: true, state: next, events: [event] };
}

/** 이번 주가 번식 단계의 첫 주인지(이전 주는 단계 밖) */
function isFirstBreedingWeek(date: GameDate): boolean {
  const prevWeek = date.week === 1 ? WEEKS_PER_YEAR : date.week - 1;
  return isInPhase(date.week, BREEDING_PHASE) && !isInPhase(prevWeek, BREEDING_PHASE);
}

/**
 * 새 시즌 리셋. 모든 종마 예약 수를 0으로 두고, 임신 전이며 이번 주 예약이 아닌 교배 배정을 푼다.
 * 이번 주 예약(coveredWeek 가 이번 주)은 자금을 이미 냈으므로 지우지 않고 예약 수만 다시 센다.
 */
function resetSeason(state: GameState, mareIds: readonly HorseId[], bookedNow: Set<HorseId>): void {
  for (const stallion of Object.values(state.stallions)) {
    stallion.bookedThisSeason = 0;
  }
  for (const mareId of mareIds) {
    const mare = state.mares[mareId];
    if (mare === undefined || mare.pregnant || mare.coveredBy === null) continue;
    if (bookedNow.has(mareId)) {
      const stallion = state.stallions[mare.coveredBy];
      if (stallion !== undefined) stallion.bookedThisSeason += 1;
    } else {
      mare.coveredBy = null;
      mare.coveredWeek = null;
    }
  }
}

/** 수태 판정: 예약 다음 주부터 판정한다. coveredWeek 가 이번 주인 예약은 건너뛴다. */
function judgeConceptions(
  state: GameState,
  mareIds: readonly HorseId[],
  bookedNow: Set<HorseId>,
  ctx: WeekContext,
  events: GameEvent[],
): void {
  for (const mareId of mareIds) {
    const mare = state.mares[mareId];
    if (mare === undefined || mare.coveredBy === null || mare.pregnant) continue;
    if (bookedNow.has(mareId)) continue;

    const stallion = state.stallions[mare.coveredBy];
    const horse = state.horses[mareId];
    if (stallion === undefined || horse === undefined) {
      throw new Error(`judgeConceptions: 종마 또는 암말 레코드 없음: ${mareId}`);
    }

    const age = ctx.date.year - horse.birthYear;
    const p = stallion.fertility * mareFertility(age);
    const success = ctx.rng.chance(p);

    mare.coveredWeek = null;
    if (success) {
      mare.pregnant = true;
      mare.dueWeek = weekKey(addWeeks(ctx.date, GESTATION_WEEKS));
    } else {
      if (horse.ownerId !== null) {
        recordMoney(state, horse.ownerId, 'stud_fee_paid', stallion.fee, dateOf(ctx.date), mareId);
      }
      stallion.bookedThisSeason -= 1;
      mare.coveredBy = null;
    }
    events.push({
      type: 'conception',
      mareId,
      stallionId: stallion.horseId,
      success,
      date: dateOf(ctx.date),
    });
  }
}

/** 출산: 이번 주가 출산 예정인 암말마다 망아지를 만든다. */
function deliverFoals(
  state: GameState,
  mareIds: readonly HorseId[],
  data: BreedingStaticData,
  ctx: WeekContext,
  events: GameEvent[],
): void {
  const key = weekKey(ctx.date);
  let registry: MutableNameRegistry | null = null;

  for (const mareId of mareIds) {
    const mare = state.mares[mareId];
    if (mare === undefined || !mare.pregnant || mare.dueWeek !== key) continue;

    const sireId = mare.coveredBy;
    const sire = sireId === null ? undefined : state.horses[sireId];
    const dam = state.horses[mareId];
    if (sireId === null || sire === undefined || dam === undefined) {
      throw new Error(`deliverFoals: 출산 대상의 종마 또는 암말 레코드 없음: ${mareId}`);
    }

    const lookup: HorseLookup = (id) => state.horses[id];
    const root = buildMatingPedigree(lookup, sire.id, dam.id);
    const inbreeding = dominantCrosses(root, findInbreeding(root));

    if (registry === null) {
      registry = makeNameRegistry(state);
    }
    const foalId = allocateHorseId(state);
    const foalNaming = namingContextFor(state, { ownerId: dam.ownerId, sireId: sire.id, damId: dam.id }, data);
    const foalName = nameForHorse(foalNaming, data.naming, ctx.rng, registry);
    registry.add(foalName);

    const foal = breed(ctx.rng, {
      sire,
      dam,
      damsireLineId: damsireLineOf(state, dam),
      nicks: data.nicks,
      inbreeding,
      damFamilyScore: familyScore(state, mareId),
      id: foalId,
      name: foalName,
      birthYear: ctx.date.year,
      currentYear: ctx.date.year,
      countryOfBirth: dam.countryOfBirth,
      ownerId: dam.ownerId,
      breederId: dam.ownerId,
      sireOwnBloodPercent: ownBloodPercent(lookup, sire),
      damOwnBloodPercent: ownBloodPercent(lookup, dam),
      damsire: damsireOf(state, dam),
      sireOwnComplement: ownComplement(lookup, sire),
      damOwnComplement: ownComplement(lookup, dam),
    });

    state.horses[foal.id] = foal;
    if (dam.ownerId !== null) {
      const owner = state.owners[dam.ownerId];
      if (owner === undefined) {
        throw new Error(`deliverFoals: 마주가 없음: ${dam.ownerId}`);
      }
      owner.horseIds.push(foal.id);
    }

    mare.foals.push(foal.id);
    mare.pregnant = false;
    mare.coveredBy = null;
    mare.coveredWeek = null;
    mare.dueWeek = null;

    events.push({
      type: 'foal_born',
      foalId: foal.id,
      mareId,
      stallionId: sire.id,
      date: dateOf(ctx.date),
    });
  }
}

/**
 * 교배 시즌 시스템(id 'breeding'). 한 주 순서: 1) 새 시즌 리셋 2) 수태 판정 3) 출산.
 * 모든 순회는 id 오름차순이다.
 */
export function createBreedingSystem(data: BreedingStaticData): WeeklySystem {
  return {
    id: 'breeding',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      const events: GameEvent[] = [];
      const mareIds = Object.keys(draft.mares).sort();
      const bookedNow = maresBookedOn(draft, mareIds, ctx.date);

      if (isFirstBreedingWeek(ctx.date)) {
        resetSeason(draft, mareIds, bookedNow);
      }
      judgeConceptions(draft, mareIds, bookedNow, ctx, events);
      deliverFoals(draft, mareIds, data, ctx, events);

      return events;
    },
  };
}
