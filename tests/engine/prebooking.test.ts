import { describe, expect, it } from 'vitest';
import { bookCovering, bookingSeasonOf, createBreedingSystem, rollBookingSeason } from '../../src/engine/breeding/season';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState } from '../../src/engine/types';

const data = {
  naming: getNamingData(), nicks: getNicks(),
  stallionNames: getStallionNames(), stallionRecords: getStallionRecords(),
};
const systems = [createBreedingSystem(data)];
function fixture() {
  const state = bootstrapWorld(createNewGame({ seed: 123, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }), data, createRng(123));
  state.date = { year: 2026, week: 46 };
  const mareId = state.owners[state.playerOwnerId]!.horseIds.find((id) => state.mares[id] !== undefined)!;
  const stallionId = Object.keys(state.stallions).sort()[0]!;
  const mare = state.mares[mareId]!;
  mare.pregnant = true;
  mare.coveredBy = stallionId;
  mare.dueWeek = 202710;
  state.stallions[stallionId]!.fertility = 1;
  state.horses[mareId]!.birthYear = 2020;
  return { state, mareId, stallionId };
}
function reserve(state: GameState, mareId: string, stallionId: string) {
  const result = bookCovering(state, state.playerOwnerId, mareId, stallionId);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const funds = (state: GameState) => state.owners[state.playerOwnerId]!.funds;

describe('사전 예약 창과 시즌 전환', () => {
  it.each([[44, 2027], [26, 2026], [30, null], [1, 2026]])('2026년 %i주 → %s', (week, season) => {
    expect(bookingSeasonOf({ year: 2026, week })).toBe(season);
  });

  it('임신 중 예약료를 내고 출산 다음 번식 주에 배정, 그다음 주 수태한다(결정성)', () => {
    const { state, mareId, stallionId } = fixture();
    const original = structuredClone(state);
    const booked = reserve(state, mareId, stallionId);
    expect(state).toEqual(original);
    expect(booked.mares[mareId]!.bookedFor).toEqual({ stallionId, season: 2027,
      feePaid: state.stallions[stallionId]!.fee });
    expect(funds(booked)).toBe(funds(state) - state.stallions[stallionId]!.fee);
    expect(booked.economy).not.toEqual(state.economy);
    expect(booked.stallions[stallionId]).toMatchObject({ bookingSeason: 2027, bookedThisSeason: 1 });
    const run = () => {
      const next = structuredClone(booked);
      next.date = { year: 2027, week: 10 };
      const born = advanceWeek(next, systems);
      expect(born.events.some((e) => e.type === 'foal_born' && e.mareId === mareId)).toBe(true);
      const assigned = advanceWeek(born.state, systems);
      expect(assigned.state.mares[mareId]).toMatchObject({ coveredBy: stallionId, coveredWeek: 202711, bookedFor: null });
      expect(assigned.events.some((e) => e.type === 'conception' && e.mareId === mareId)).toBe(false);
      const conceived = advanceWeek(assigned.state, systems);
      expect(conceived.events).toContainEqual({ type: 'conception', mareId, stallionId, success: true, date: { year: 2027, week: 12 } });
      return conceived;
    };
    expect(run()).toEqual(run());
  });

  it('출산이 시즌 끝 이후이거나 같은 주이면 거절하고 닫힌 창도 거절한다', () => {
    const { state, mareId, stallionId } = fixture();
    for (const dueWeek of [202730, 202726]) {
      state.mares[mareId]!.dueWeek = dueWeek;
      expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'already_pregnant' });
    }
    state.date.week = 30;
    expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'not_breeding_season' });
  });

  it('중복 예약과 다음 시즌 미개장 종마는 거절하고 이전 시즌 북은 초기화한다', () => {
    const { state, mareId, stallionId } = fixture();
    const stallion = state.stallions[stallionId]!;
    stallion.bookedThisSeason = stallion.bookLimit;
    stallion.aiBooked = 10;
    stallion.aiDemand = 20;
    const booked = reserve(state, mareId, stallionId);
    expect(booked.stallions[stallionId]).toMatchObject({ bookedThisSeason: 1, aiBooked: 0, aiDemand: 0 });
    expect(bookCovering(booked, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'already_covered' });
    stallion.firstSeasonYear = 2028;
    expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'stallion_not_available' });
  });

  it.each([false, true])('미배정 예약은 27주에 정리한다(자기 종마 %s)', (own) => {
    const { state, mareId, stallionId } = fixture();
    if (own) state.horses[stallionId]!.ownerId = state.playerOwnerId;
    const booked = reserve(state, mareId, stallionId);
    booked.date = { year: 2027, week: 27 };
    const result = advanceWeek(booked, systems);
    expect(result.state.mares[mareId]!.bookedFor).toBeNull();
    expect(result.state.stallions[stallionId]!.bookedThisSeason).toBe(0);
    expect(funds(result.state)).toBe(funds(state));
    expect(result.events).toEqual([]);
    expect(advanceWeek(result.state, systems).state.economy).toEqual(result.state.economy);
  });

  it('44주에는 모든 종마가 다음 시즌으로 넘어가며 같은 시즌은 보존한다', () => {
    const { state } = fixture();
    state.date.week = 44;
    for (const stallion of Object.values(state.stallions)) {
      stallion.bookedThisSeason = 3; stallion.aiBooked = 2; stallion.aiDemand = 5;
    }
    const result = advanceWeek(state, systems);
    for (const stallion of Object.values(result.state.stallions)) {
      expect(stallion).toMatchObject({ bookingSeason: 2027, bookedThisSeason: 0, aiBooked: 0, aiDemand: 0 });
      stallion.bookedThisSeason = 1;
      rollBookingSeason(stallion, 2027);
      expect(stallion.bookedThisSeason).toBe(1);
    }
    expect(result.state.rng).toEqual(state.rng);
  });

  it('1주 사전 예약은 7주에 배정되고 예약 수를 보존한다', () => {
    const { state, mareId, stallionId } = fixture();
    state.date = { year: 2027, week: 1 };
    Object.assign(state.mares[mareId]!, { pregnant: false, coveredBy: null, dueWeek: null });
    const booked = reserve(state, mareId, stallionId);
    booked.date.week = 7;
    const assigned = advanceWeek(booked, systems);
    expect(assigned.state.mares[mareId]).toMatchObject({ coveredBy: stallionId, coveredWeek: 202707, bookedFor: null });
    expect(assigned.state.stallions[stallionId]!.bookedThisSeason).toBe(1);
  });
});
