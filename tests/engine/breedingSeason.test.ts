import { describe, expect, it } from 'vitest';
import {
  MARE_FERTILE_PEAK_AGE,
  MARE_FERTILITY_FLOOR,
  MARE_MIN_BREEDING_AGE,
} from '../../src/engine/config/breedingSeason';
import {
  bookCovering,
  createBreedingSystem,
  damsireLineOf,
  familyScore,
  mareFertility,
  revealNick,
  type BookingError,
} from '../../src/engine/breeding/season';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import type { GameEvent, GameState, Horse, HorseId, WeeklySystem } from '../../src/engine/types';

const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;
const SEED = 20260101;

function staticData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
  };
}

/** 2026년 1주 상태에 세계를 채운 상태 */
function boot(seed = SEED): GameState {
  const base = createNewGame({ seed, playerName: 'Test Owner', silks: SILKS });
  return bootstrapWorld(base, staticData(), createRng(seed));
}

/** 날짜만 바꾼 복사본 */
function atWeek(state: GameState, year: number, week: number): GameState {
  const next = structuredClone(state);
  next.date = { year, week };
  return next;
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

function stallionIdOf(state: GameState): HorseId {
  const id = sortedKeys(state.stallions)[0];
  if (id === undefined) throw new Error('테스트 전제: 종마가 있어야 한다');
  return id;
}

function playerMareIdOf(state: GameState): HorseId {
  const owner = state.owners[state.playerOwnerId];
  const id = owner?.horseIds.find((h) => state.mares[h] !== undefined);
  if (id === undefined) throw new Error('테스트 전제: 플레이어 암말이 있어야 한다');
  return id;
}

function ownerFunds(state: GameState): number {
  return state.owners[state.playerOwnerId]?.funds ?? 0;
}

/** 교배 시스템만 + 달력. 시즌 경계 이벤트 확인용 */
const SYSTEMS: readonly WeeklySystem[] = [calendarSystem, createBreedingSystem(staticData())];

function advanceWith(state: GameState): { state: GameState; events: GameEvent[] } {
  return advanceWeek(state, SYSTEMS);
}

/** 예약 가능한 기본 상태: 2026년 10주, 플레이어 암말 1두, 종마 1두 */
function bookable(): { state: GameState; mareId: HorseId; stallionId: HorseId } {
  const state = atWeek(boot(), 2026, 10);
  return { state, mareId: playerMareIdOf(state), stallionId: stallionIdOf(state) };
}

function expectBookingError(result: ReturnType<typeof bookCovering>, error: BookingError): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(error);
}

describe('수용 기준 1: bookCovering 오류 코드 9종', () => {
  it('정상 예약은 ok 이다', () => {
    const { state, mareId, stallionId } = bookable();
    const result = bookCovering(state, state.playerOwnerId, mareId, stallionId);
    expect(result.ok).toBe(true);
  });

  it('not_breeding_season: 번식 단계 밖(1주)', () => {
    const { state, mareId, stallionId } = bookable();
    const outside = atWeek(state, 2026, 1);
    expectBookingError(bookCovering(outside, outside.playerOwnerId, mareId, stallionId), 'not_breeding_season');
  });

  it('not_your_mare: 다른 마주', () => {
    const { state, mareId, stallionId } = bookable();
    expectBookingError(bookCovering(state, 'owner-other', mareId, stallionId), 'not_your_mare');
  });

  it('not_a_broodmare: status 가 broodmare 가 아님', () => {
    const { state, mareId, stallionId } = bookable();
    const next = structuredClone(state);
    (next.horses[mareId] as Horse).status = 'retired';
    expectBookingError(bookCovering(next, next.playerOwnerId, mareId, stallionId), 'not_a_broodmare');
  });

  it('mare_too_young: 나이가 MARE_MIN_BREEDING_AGE 미만', () => {
    const { state, mareId, stallionId } = bookable();
    const next = structuredClone(state);
    (next.horses[mareId] as Horse).birthYear = 2026 - (MARE_MIN_BREEDING_AGE - 1);
    expectBookingError(bookCovering(next, next.playerOwnerId, mareId, stallionId), 'mare_too_young');
  });

  it('already_pregnant: 임신 중', () => {
    const { state, mareId, stallionId } = bookable();
    const next = structuredClone(state);
    const mare = next.mares[mareId];
    if (mare === undefined) throw new Error('테스트 전제');
    mare.pregnant = true;
    mare.dueWeek = 202707;
    expectBookingError(bookCovering(next, next.playerOwnerId, mareId, stallionId), 'already_pregnant');
  });

  it('already_covered: 이미 교배 배정됨', () => {
    const { state, mareId, stallionId } = bookable();
    const next = structuredClone(state);
    const mare = next.mares[mareId];
    if (mare === undefined) throw new Error('테스트 전제');
    mare.coveredBy = stallionId;
    expectBookingError(bookCovering(next, next.playerOwnerId, mareId, stallionId), 'already_covered');
  });

  it('stallion_not_available: 없는 종마', () => {
    const { state, mareId } = bookable();
    expectBookingError(bookCovering(state, state.playerOwnerId, mareId, 'h-missing'), 'stallion_not_available');
  });

  it('book_full: 시즌 예약 수가 bookLimit 에 도달', () => {
    const { state, mareId, stallionId } = bookable();
    const next = structuredClone(state);
    const stallion = next.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.bookedThisSeason = stallion.bookLimit;
    expectBookingError(bookCovering(next, next.playerOwnerId, mareId, stallionId), 'book_full');
  });

  it('insufficient_funds: 자금 부족', () => {
    const { state, mareId, stallionId } = bookable();
    const next = structuredClone(state);
    const owner = next.owners[next.playerOwnerId];
    if (owner === undefined) throw new Error('테스트 전제');
    owner.funds = 0;
    expectBookingError(bookCovering(next, next.playerOwnerId, mareId, stallionId), 'insufficient_funds');
  });
});

describe('bookCovering 성공 시 변화와 원본 불변', () => {
  it('자금 차감, 예약 수 +1, coveredBy·coveredWeek 설정, 이벤트 covering_booked, 원본 불변', () => {
    const { state, mareId, stallionId } = bookable();
    const before = JSON.stringify(state);
    const stallion = state.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');

    const result = bookCovering(state, state.playerOwnerId, mareId, stallionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(JSON.stringify(state)).toBe(before);
    expect(ownerFunds(result.state)).toBe(ownerFunds(state) - stallion.fee);
    expect(result.state.stallions[stallionId]?.bookedThisSeason).toBe(stallion.bookedThisSeason + 1);
    expect(result.state.mares[mareId]?.coveredBy).toBe(stallionId);
    expect(result.state.mares[mareId]?.coveredWeek).toBe(202610);
    expect(result.events).toEqual([
      { type: 'covering_booked', mareId, stallionId, fee: stallion.fee, date: { year: 2026, week: 10 } },
    ]);
  });
});

describe('bookCovering 은 eventLog 를 바꾸지 않는다', () => {
  it('성공해도 state.eventLog 는 입력과 같고, 이벤트는 events 로만 나온다', () => {
    const { state, mareId, stallionId } = bookable();
    const result = bookCovering(state, state.playerOwnerId, mareId, stallionId);
    if (!result.ok) throw new Error('테스트 전제: 예약 성공');
    expect(result.state.eventLog).toEqual(state.eventLog);
    expect(result.events.length).toBe(1);
  });

  it('eventLog 가 비어 있어도 같은 주 예약은 수태 판정을 건너뛴다(coveredWeek 기준)', () => {
    const { state: base, mareId, stallionId } = bookable();
    const withFertility = structuredClone(base);
    const stallion = withFertility.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.fertility = 1;
    const booked = bookCovering(withFertility, withFertility.playerOwnerId, mareId, stallionId);
    if (!booked.ok) throw new Error('테스트 전제: 예약 성공');

    const emptyLog = structuredClone(booked.state);
    emptyLog.eventLog = [];
    const sameWeek = advanceWith(emptyLog);
    expect(sameWeek.events.some((e) => e.type === 'conception')).toBe(false);
    expect(sameWeek.state.mares[mareId]?.pregnant).toBe(false);
    expect(sameWeek.state.mares[mareId]?.coveredWeek).toBe(202610);

    const nextWeek = advanceWith(sameWeek.state);
    expect(nextWeek.events.some((e) => e.type === 'conception')).toBe(true);
  });
});

describe('수용 기준 2: 수태율 1.0 / 0.0', () => {
  it('fertility 1 이면 예약 주는 건너뛰고 그다음 주에 수태한다', () => {
    const { state: base, mareId, stallionId } = bookable();
    const withFertility = structuredClone(base);
    const stallion = withFertility.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.fertility = 1;

    const booked = bookCovering(withFertility, withFertility.playerOwnerId, mareId, stallionId);
    if (!booked.ok) throw new Error('테스트 전제: 예약 성공');

    const sameWeek = advanceWith(booked.state);
    expect(sameWeek.events.some((e) => e.type === 'conception')).toBe(false);
    expect(sameWeek.state.mares[mareId]?.pregnant).toBe(false);

    const nextWeek = advanceWith(sameWeek.state);
    const conception = nextWeek.events.find((e) => e.type === 'conception');
    expect(conception).toEqual({
      type: 'conception',
      mareId,
      stallionId,
      success: true,
      date: { year: 2026, week: 11 },
    });
    expect(nextWeek.state.mares[mareId]?.pregnant).toBe(true);
    expect(nextWeek.state.mares[mareId]?.coveredWeek).toBeNull();
  });

  it('fertility 0 이면 실패하고 종부료가 환불되며 예약이 풀린다', () => {
    const { state: base, mareId, stallionId } = bookable();
    const withZero = structuredClone(base);
    const stallion = withZero.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.fertility = 0;
    const fundsBefore = ownerFunds(withZero);

    const booked = bookCovering(withZero, withZero.playerOwnerId, mareId, stallionId);
    if (!booked.ok) throw new Error('테스트 전제: 예약 성공');
    expect(ownerFunds(booked.state)).toBe(fundsBefore - stallion.fee);

    const sameWeek = advanceWith(booked.state);
    const failed = advanceWith(sameWeek.state);
    const conception = failed.events.find((e) => e.type === 'conception');
    expect(conception).toMatchObject({ type: 'conception', mareId, success: false });

    expect(ownerFunds(failed.state)).toBe(fundsBefore);
    expect(failed.state.mares[mareId]?.coveredBy).toBeNull();
    expect(failed.state.mares[mareId]?.pregnant).toBe(false);
    expect(failed.state.mares[mareId]?.coveredWeek).toBeNull();
    expect(failed.state.stallions[stallionId]?.bookedThisSeason).toBe(0);
  });
});

describe('수용 기준 3: 예약 → 수태 → 출산 전체 흐름', () => {
  it('2026년 10주 예약 → 11주 수태(dueWeek 202707) → 2027년 7주 출산', () => {
    const { state: base, mareId, stallionId } = bookable();
    const sire = base.horses[stallionId];
    const dam = base.horses[mareId];
    const mareRecord = base.mares[mareId];
    if (sire === undefined || dam === undefined || mareRecord === undefined) {
      throw new Error('테스트 전제');
    }
    const withFertility = structuredClone(base);
    const stallion = withFertility.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.fertility = 1;

    const booked = bookCovering(withFertility, withFertility.playerOwnerId, mareId, stallionId);
    if (!booked.ok) throw new Error('테스트 전제: 예약 성공');

    let state = booked.state;
    const events: GameEvent[] = [];
    let steps = 0;
    while (steps < 200) {
      const result = advanceWith(state);
      state = result.state;
      events.push(...result.events);
      steps += 1;
      if (events.some((e) => e.type === 'foal_born')) break;
    }

    const conception = events.find((e) => e.type === 'conception');
    expect(conception).toMatchObject({ success: true, date: { year: 2026, week: 11 } });

    const birth = events.find((e) => e.type === 'foal_born');
    if (birth?.type !== 'foal_born') throw new Error('망아지 출생 이벤트가 없다');
    expect(birth.date).toEqual({ year: 2027, week: 7 });
    expect(birth.mareId).toBe(mareId);
    expect(birth.stallionId).toBe(stallionId);

    const foal = state.horses[birth.foalId];
    if (foal === undefined) throw new Error('망아지 레코드가 없다');
    expect(foal.birthYear).toBe(2027);
    expect(foal.status).toBe('foal');
    expect(foal.sireId).toBe(stallionId);
    expect(foal.damId).toBe(mareId);
    expect(foal.sireLineId).toBe(sire.sireLineId);
    expect(foal.familyId).toBe(dam.familyId ?? mareId);
    expect(foal.countryOfBirth).toBe(dam.countryOfBirth);
    expect(foal.ownerId).toBe(dam.ownerId);
    expect(state.owners[state.playerOwnerId]?.horseIds).toContain(foal.id);

    const mare = state.mares[mareId];
    expect(mare?.pregnant).toBe(false);
    expect(mare?.dueWeek).toBeNull();
    expect(mare?.coveredBy).toBeNull();
    expect(mare?.coveredWeek).toBeNull();
    expect(mare?.foals).toContain(foal.id);

    const names = Object.values(state.horses).map((h) => h.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('수용 기준 4: 같은 시드 2년 진행 두 번 → 같은 JSON', () => {
  function runTwoYears(): string {
    let state = boot();
    state = atWeek(state, 2026, 8);
    const stallionId = stallionIdOf(state);
    const stallion = state.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.fertility = 1;
    for (const mareId of (state.owners[state.playerOwnerId]?.horseIds ?? []).filter(
      (h) => state.mares[h] !== undefined,
    )) {
      const booked = bookCovering(state, state.playerOwnerId, mareId, stallionId);
      if (booked.ok) state = booked.state;
    }
    for (let i = 0; i < 104; i++) {
      state = advanceWith(state).state;
    }
    return JSON.stringify(state);
  }

  it('두 번 실행 결과가 JSON 으로 완전히 같다', () => {
    expect(runTwoYears()).toBe(runTwoYears());
  }, 60_000);

  it('2년 진행 동안 수태와 출산이 실제로 일어난다', () => {
    const first = JSON.parse(runTwoYears()) as GameState;
    const foals = Object.values(first.horses).filter((h) => h.status === 'foal');
    expect(foals.length).toBeGreaterThan(0);
  });
});

describe('수용 기준 5: 새 시즌 첫 주 리셋', () => {
  it('번식 단계 첫 주(7주)에 진행하면 bookedThisSeason 이 0 이 된다', () => {
    const state = atWeek(boot(), 2026, 7);
    const stallionId = stallionIdOf(state);
    const next = structuredClone(state);
    const stallion = next.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.bookedThisSeason = 5;

    const result = advanceWith(next);
    expect(result.state.stallions[stallionId]?.bookedThisSeason).toBe(0);
  });

  it('첫 주가 아닌 번식 주(8주)에는 리셋하지 않는다', () => {
    const state = atWeek(boot(), 2026, 8);
    const stallionId = stallionIdOf(state);
    const next = structuredClone(state);
    const stallion = next.stallions[stallionId];
    if (stallion === undefined) throw new Error('테스트 전제');
    stallion.bookedThisSeason = 5;

    const result = advanceWith(next);
    expect(result.state.stallions[stallionId]?.bookedThisSeason).toBe(5);
  });

  it('첫 주에 한 예약은 리셋으로 지워지지 않는다(자금 보존)', () => {
    const state = atWeek(boot(), 2026, 7);
    const stallionId = stallionIdOf(state);
    const mareId = playerMareIdOf(state);
    const booked = bookCovering(state, state.playerOwnerId, mareId, stallionId);
    if (!booked.ok) throw new Error('테스트 전제: 예약 성공');

    const result = advanceWith(booked.state);
    expect(result.state.mares[mareId]?.coveredBy).toBe(stallionId);
    expect(result.state.stallions[stallionId]?.bookedThisSeason).toBe(1);
    expect(result.events.some((e) => e.type === 'conception')).toBe(false);
  });
});

describe('mareFertility', () => {
  it('피크 나이 이하는 1.0', () => {
    expect(mareFertility(3)).toBe(1);
    expect(mareFertility(MARE_FERTILE_PEAK_AGE)).toBe(1);
  });

  it('피크 이후 매년 감소, 하한 FLOOR', () => {
    expect(mareFertility(MARE_FERTILE_PEAK_AGE + 1)).toBeCloseTo(0.96, 10);
    expect(mareFertility(60)).toBe(MARE_FERTILITY_FLOOR);
  });
});

describe('familyScore 와 damsireLineOf', () => {
  it('familyScore 는 blackTypeProduce / 3 을 1 에서 자르고, 없으면 0', () => {
    const state = boot();
    const mareId = playerMareIdOf(state);
    const next = structuredClone(state);
    const mare = next.mares[mareId];
    if (mare === undefined) throw new Error('테스트 전제');
    mare.blackTypeProduce = 0;
    expect(familyScore(next, mareId)).toBe(0);
    mare.blackTypeProduce = 1.5;
    expect(familyScore(next, mareId)).toBeCloseTo(0.5, 10);
    mare.blackTypeProduce = 99;
    expect(familyScore(next, mareId)).toBe(1);
    expect(familyScore(next, 'h-missing')).toBe(0);
  });

  it('damsireLineOf 는 dam.sireId 말의 sireLineId 를 준다', () => {
    const state = boot();
    const mare = state.horses[playerMareIdOf(state)];
    if (mare === undefined || mare.damId === null) throw new Error('테스트 전제');
    const dam = state.horses[mare.damId];
    if (dam === undefined) throw new Error('테스트 전제');
    const damsire = dam.sireId === null ? undefined : state.horses[dam.sireId];
    expect(damsireLineOf(state, dam)).toBe(damsire?.sireLineId ?? null);
  });
});

describe('revealNick', () => {
  it('새 키는 true, 중복은 false 이고 정렬을 유지한다', () => {
    const state = boot();
    state.breeding.revealedNicks = ['b|x'];
    expect(revealNick(state, 'c', 'y')).toBe(true);
    expect(revealNick(state, 'a', 'z')).toBe(true);
    expect(revealNick(state, 'c', 'y')).toBe(false);
    expect(state.breeding.revealedNicks).toEqual(['a|z', 'b|x', 'c|y']);
  });
});
