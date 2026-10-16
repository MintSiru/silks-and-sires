import {
  DUE_WEEK_KEY_YEAR_SCALE,
  FAMILY_SCORE_DIVISOR,
  GESTATION_WEEKS,
  MARE_FERTILE_PEAK_AGE,
  MARE_FERTILITY_DECLINE,
  MARE_FERTILITY_FLOOR,
  MARE_MIN_BREEDING_AGE,
} from '../config/breedingSeason';
import { PHASE_WINDOWS, WEEKS_PER_YEAR } from '../config/game';
import { BOOKING_OPEN_WEEK } from '../config/stud';
import { recordMoney } from '../economy/ledger';
import { canSpendDiscretionary } from '../economy/solvency';
import { makeNameRegistry, namingContextFor, type MutableNameRegistry } from '../naming/context';
import { nameForHorse } from '../naming/generate';
import type { NamingData } from '../naming/types';
import { allocateHorseId } from '../state/world';
import { privateAccess } from '../stud/private';
import { addWeeks, isInPhase } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  NickEntry,
  OwnerId,
  RealStallionRecord,
  SireLineId,
  Stallion,
  WeekContext,
  WeeklySystem,
} from '../types';
import { breed, ownComplement, type HorseLookup } from './genetics';
import { dominantCrosses, findInbreeding, ownBloodPercent } from './inbreeding';
import { nickKey } from './nicks';
import { buildMatingPedigree, type PedigreeLookup } from './pedigree';
import { createPedigreeLookup } from './realPedigree';

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
  | 'private_stallion'
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
  /**
   * 실명 종마 레코드(모계 연결 혈통표용: 모마 칸을 조회 시점에 만든다). 생략하면 모계 칸 없이 계산한다.
   * 게임 정적 데이터(GameStaticData)는 항상 넘긴다.
   */
  stallionRecords?: readonly RealStallionRecord[];
}

/** 레코드를 넘기지 않은 경우의 빈 표 */
const NO_STALLION_RECORDS: readonly RealStallionRecord[] = [];

/** 말 자신의 모계 연결을 실명 종마 모마 칸까지 반영한 사본(ownBloodPercent 용). 원본은 바꾸지 않는다 */
function withPedigreeDam(pedigree: PedigreeLookup, horse: Horse): Horse {
  const self = pedigree(horse.id);
  if (self === undefined || self.damId === horse.damId) return horse;
  return { ...horse, damId: self.damId };
}

const BREEDING_PHASE = 'breeding' as const;

const BREEDING_START_WEEK = Math.min(...PHASE_WINDOWS.breeding.map((w) => w.startWeek));
const BREEDING_END_WEEK = Math.max(...PHASE_WINDOWS.breeding.map((w) => w.endWeek));

/** 현재 날짜에 열려 있는 예약 시즌. */
export function bookingSeasonOf(date: GameDate): number | null {
  if (date.week >= BOOKING_OPEN_WEEK) return date.year + 1;
  return date.week <= BREEDING_END_WEEK ? date.year : null;
}

/** 예약 집계를 새 시즌으로 넘긴다. 같은 시즌이면 보존한다. */
export function rollBookingSeason(stallion: Stallion, season: number): void {
  if (stallion.bookingSeason === season) return;
  stallion.bookingSeason = season;
  stallion.bookedThisSeason = 0;
  stallion.aiBooked = 0;
  stallion.aiDemand = 0;
}

/** 플레이어가 해당 예약 시즌에 쓸 수 있는 무료 교배권 수. 상태는 바꾸지 않는다. */
export function nominationsLeft(state: GameState, stallionId: HorseId, season: number): number {
  const right = state.stud.nominations.find((right) => right.stallionId === stallionId);
  return right === undefined ? 0 : Math.max(0, right.perSeason - (right.season === season ? right.used : 0));
}

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

  const season = bookingSeasonOf(state.date);
  if (season === null) return fail('not_breeding_season');

  const horse = state.horses[mareId];
  if (horse === undefined || horse.ownerId !== ownerId) return fail('not_your_mare');

  const mare = state.mares[mareId];
  if (horse.status !== 'broodmare' || mare === undefined) return fail('not_a_broodmare');

  if (state.date.year - horse.birthYear < MARE_MIN_BREEDING_AGE) return fail('mare_too_young');
  if (mare.pregnant && (mare.dueWeek === null ||
    mare.dueWeek >= weekKey({ year: season, week: BREEDING_END_WEEK }))) return fail('already_pregnant');
  if (mare.bookedFor?.season === season || (mare.coveredBy !== null && !mare.pregnant)) {
    return fail('already_covered');
  }

  const stallion = state.stallions[stallionId];
  if (stallion === undefined || season < stallion.firstSeasonYear ||
    (stallion.leasedAwayUntil != null && season < stallion.leasedAwayUntil)) {
    return fail('stallion_not_available');
  }
  const seasonStallion = { ...stallion };
  rollBookingSeason(seasonStallion, season);
  if (seasonStallion.bookedThisSeason >= seasonStallion.bookLimit) return fail('book_full');

  const ownStallion = state.horses[stallionId]?.ownerId === ownerId;
  if (!ownStallion && privateAccess(state, stallionId, ownerId) === 'denied') return fail('private_stallion');
  const useNomination = !ownStallion && ownerId === state.playerOwnerId &&
    nominationsLeft(state, stallionId, season) > 0;
  const fee = ownStallion || useNomination ? 0 : stallion.fee;
  if (!ownStallion && !useNomination &&
    (state.owners[ownerId] === undefined || !canSpendDiscretionary(state, fee, ownerId))) {
    return fail('insufficient_funds');
  }

  const next = structuredClone(state);
  const nextPayer = next.owners[ownerId];
  const nextMare = next.mares[mareId];
  const nextStallion = next.stallions[stallionId];
  if (nextPayer === undefined || nextMare === undefined || nextStallion === undefined) {
    throw new Error('bookCovering: 복제 상태에 필요한 레코드가 없다');
  }

  if (fee > 0) recordMoney(next, ownerId, 'stud_fee_paid', -fee, dateOf(state.date), mareId);
  if (useNomination) {
    const right = next.stud.nominations.find((right) => right.stallionId === stallionId)!;
    right.used = right.season === season ? right.used + 1 : 1;
    right.season = season;
  }
  if (isInPhase(state.date.week, BREEDING_PHASE) && season === state.date.year &&
    !nextMare.pregnant && nextMare.coveredBy === null && nextMare.bookedFor == null) {
    nextMare.coveredBy = stallionId;
    nextMare.coveredFee = fee;
    nextMare.coveredWeek = weekKey(state.date);
  } else {
    nextMare.bookedFor = { stallionId, season, feePaid: fee };
  }
  rollBookingSeason(nextStallion, season);
  nextStallion.bookedThisSeason += 1;

  const event: GameEvent = {
    type: 'covering_booked',
    mareId,
    stallionId,
    fee,
    date: dateOf(state.date),
  };
  return { ok: true, state: next, events: [event] };
}

/** 이번 주가 번식 단계의 첫 주인지(이전 주는 단계 밖) */
function isFirstBreedingWeek(date: GameDate): boolean {
  const prevWeek = date.week === 1 ? WEEKS_PER_YEAR : date.week - 1;
  return isInPhase(date.week, BREEDING_PHASE) && !isInPhase(prevWeek, BREEDING_PHASE);
}

/** 지난 시즌에 남은 비임신 교배 배정만 정리한다. */
function resetSeason(state: GameState, mareIds: readonly HorseId[]): void {
  const firstWeek = weekKey({ year: state.date.year, week: BREEDING_START_WEEK });
  for (const mareId of mareIds) {
    const mare = state.mares[mareId];
    if (mare === undefined || mare.pregnant || mare.coveredBy === null) continue;
    if (mare.coveredWeek !== null && mare.coveredWeek < firstWeek) {
      mare.coveredBy = null;
      mare.coveredFee = null;
      mare.coveredWeek = null;
    }
  }
}

/** 사전 예약 배정 및 시즌 종료 환불. 난수는 사용하지 않는다. */
function processPrebookings(state: GameState, mareIds: readonly HorseId[], date: GameDate): void {
  for (const mareId of mareIds) {
    const mare = state.mares[mareId];
    const booking = mare?.bookedFor;
    if (mare === undefined || booking == null || booking.season !== date.year) continue;
    if (isInPhase(date.week, BREEDING_PHASE) && !mare.pregnant && mare.coveredBy === null) {
      mare.coveredBy = booking.stallionId;
      mare.coveredFee = booking.feePaid ?? null;
      mare.coveredWeek = weekKey(date);
      mare.bookedFor = null;
    } else if (date.week === BREEDING_END_WEEK + 1) {
      const stallion = state.stallions[booking.stallionId];
      const horse = state.horses[mareId];
      if (stallion === undefined || horse === undefined) throw new Error('사전 예약 레코드 없음');
      if (horse.ownerId !== null && horse.ownerId !== state.horses[stallion.horseId]?.ownerId) {
        const fee = booking.feePaid ?? stallion.fee;
        if (fee > 0) recordMoney(state, horse.ownerId, 'stud_fee_paid', fee, dateOf(date), mareId);
        if (booking.feePaid === 0 && horse.ownerId === state.playerOwnerId) {
          const right = state.stud.nominations.find((right) => right.stallionId === booking.stallionId);
          if (right?.season === booking.season) right.used = Math.max(0, right.used - 1);
        }
      }
      if (stallion.bookingSeason === date.year) stallion.bookedThisSeason -= 1;
      mare.bookedFor = null;
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
      if (horse.ownerId !== null && horse.ownerId !== state.horses[stallion.horseId]?.ownerId) {
        const fee = mare.coveredFee ?? stallion.fee;
        if (fee > 0) recordMoney(state, horse.ownerId, 'stud_fee_paid', fee, dateOf(ctx.date), mareId);
      }
      if (stallion.bookingSeason === ctx.date.year) stallion.bookedThisSeason -= 1;
      mare.coveredBy = null;
      mare.coveredFee = null;
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
    const pedigree = createPedigreeLookup(state.horses, data.stallionRecords ?? NO_STALLION_RECORDS);
    const root = buildMatingPedigree(pedigree, sire.id, dam.id);
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
      sireOwnBloodPercent: ownBloodPercent(pedigree, withPedigreeDam(pedigree, sire)),
      damOwnBloodPercent: ownBloodPercent(pedigree, withPedigreeDam(pedigree, dam)),
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
    mare.coveredFee = null;
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
 * 교배 시즌 시스템(id 'breeding'). 예약 시즌 전환·배정 후 수태 판정과 출산을 처리한다.
 * 모든 순회는 id 오름차순이다.
 */
export function createBreedingSystem(data: BreedingStaticData): WeeklySystem {
  return {
    id: 'breeding',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      const events: GameEvent[] = [];
      const mareIds = Object.keys(draft.mares).sort();
      if (ctx.date.week === BOOKING_OPEN_WEEK) {
        for (const id of Object.keys(draft.stallions).sort()) {
          rollBookingSeason(draft.stallions[id]!, ctx.date.year + 1);
        }
      }
      processPrebookings(draft, mareIds, ctx.date);
      const bookedNow = maresBookedOn(draft, mareIds, ctx.date);

      if (isFirstBreedingWeek(ctx.date)) {
        resetSeason(draft, mareIds);
      }
      judgeConceptions(draft, mareIds, bookedNow, ctx, events);
      deliverFoals(draft, mareIds, data, ctx, events);

      return events;
    },
  };
}
