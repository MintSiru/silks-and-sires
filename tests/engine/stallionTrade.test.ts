import { describe, expect, it } from 'vitest';
import * as config from '../../src/engine/config/stud';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import { buildStallionRecord, freeStudSlots, standPlayerStallion } from '../../src/engine/stud/stand';
import {
  createStudLeaseSystem, domesticBuyer, leaseStallion, saleAgeMultiplier,
  salePriceQuote, sellStallion, stallionSalePrice,
} from '../../src/engine/stud/trade';
import { estimateStudFee } from '../../src/engine/stud/value';
import { submitYearEnd, yearEndCandidates } from '../../src/engine/stud/yearEnd';
import { advanceWeek } from '../../src/engine/time/advance';
import type { CommercialBreeder, GameState, YearEndChoice, YearEndSubmission } from '../../src/engine/types';

const base = bootstrapWorld(createNewGame({ seed: 42, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }), {
  stallionRecords: getStallionRecords(), stallionNames: getStallionNames(),
  nicks: getNicks(), naming: getNamingData(),
}, createRng(42));

function fixture(stud = true) {
  const state = structuredClone(base);
  const template = Object.values(state.horses)[0]!;
  const horse = { ...structuredClone(template), id: 'test-colt', sex: 'male' as const,
    gelded: false, status: 'in_training' as const, ownerId: state.playerOwnerId,
    birthYear: state.date.year - 4, trainerId: 'test-trainer' };
  state.horses[horse.id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  if (stud) {
    standPlayerStallion(state, horse.id, state.date.year);
    state.stallions[horse.id]!.fee = 20_000;
  }
  state.date.week = config.STUD_DEAL_FIRST_WEEK;
  return { state, horseId: horse.id, year: state.date.year };
}

function yearEndFixture(choice: YearEndChoice = 'sell_domestic', nominations = 1) {
  const { state, horseId } = fixture(false);
  state.date = { year: state.date.year + 1, week: 1 };
  state.horses[horseId]!.birthYear = state.date.year - 4;
  const input: YearEndSubmission = { year: state.date.year,
    horses: yearEndCandidates(state).map((c) => ({ horseId: c.horseId,
      choice: c.horseId === horseId ? choice : c.recommended,
      nominations: c.horseId === horseId ? nominations : 0 })), retainers: [] };
  return { state, horseId, input };
}

function declarations(state: GameState, horseId: string) {
  const player = { horseId, ownerId: state.playerOwnerId, trainerId: null,
    jockeyId: null, weightLb: null, isPlayer: true };
  const race = { id: 'test-race', name: '가상 경주', racecourseId: 'test-course', distance: 1600,
    kind: 'maiden' as const, grade: null, raceClass: 5 as const, maxRunners: 10, prizeMoney: [100],
    conditions: { minAge: 3, maxAge: null, sex: 'open' as const, ratingMin: null, ratingMax: null,
      weightSystem: 'level' as const, baseWeightLb: 120 } };
  state.seasonState.meetings = [{ id: 'test-meeting', date: { ...state.date },
    racecourseId: 'test-course', going: null, races: ['open', 'closed', 'run', 'abandoned'].map(
      (status) => ({ race, status: status as 'open' | 'closed' | 'run' | 'abandoned',
        templateId: null, simulated: false, declarations: [player, { ...player, isPlayer: false }] })) }];
}

describe('종마 판매 견적', () => {
  it('가격 공식·노령 하한·천 유로 반올림·0 하한을 적용한다', () => {
    expect(stallionSalePrice(20_000, 5, 'domestic', 0)).toBe(4_000_000);
    expect(stallionSalePrice(20_000, 5, 'domestic', 2)).toBe(3_760_000);
    expect(stallionSalePrice(20_000, 5, 'overseas', 0)).toBe(2_600_000);
    expect(stallionSalePrice(20_000, 15, 'domestic', 0)).toBe(2_400_000);
    expect(saleAgeMultiplier(10)).toBe(1);
    expect(saleAgeMultiplier(25)).toBe(0.3);
    expect(saleAgeMultiplier(100)).toBe(0.3);
    expect(stallionSalePrice(20_000, 25, 'domestic', 0)).toBe(1_200_000);
    expect(stallionSalePrice(2_503, 5, 'domestic', 0)).toBe(501_000);
    expect(stallionSalePrice(20_000, 5, 'domestic', 100)).toBe(0);
    expect(stallionSalePrice(20_000, 5, 'overseas', 2)).toBe(2_600_000);
  });

  it('종마는 현재 종부료, 현역 수말은 추정 종부료를 쓰고 순수하다', () => {
    const { state, horseId } = fixture();
    const before = structuredClone(state);
    expect(salePriceQuote(state, horseId)).toEqual({ fee: 20_000, domestic: 4_000_000,
      overseas: 2_600_000, nominationCost: 120_000 });
    expect(state).toEqual(before);
    const horse = state.horses[horseId]!;
    horse.status = 'resting';
    const fee = estimateStudFee(state, horseId).fee;
    expect(salePriceQuote(state, horseId)?.fee).toBe(fee);
    for (const status of ['retired', 'broodmare', 'dead'] as const) {
      horse.status = status;
      expect(salePriceQuote(state, horseId)).toBeNull();
    }
    horse.status = 'in_training';
    horse.gelded = true;
    expect(salePriceQuote(state, horseId)).toBeNull();
    horse.gelded = false;
    horse.sex = 'female';
    expect(salePriceQuote(state, horseId)).toBeNull();
    horse.sex = 'male';
    horse.ownerId = null;
    expect(salePriceQuote(state, horseId)).toBeNull();
    expect(salePriceQuote(state, 'missing')).toBeNull();
  });

  it('국내 구매자는 나라, 규모, ID 순이며 없으면 전체에서 선택한다', () => {
    const { state } = fixture();
    const breeder = (id: string, country: CommercialBreeder['country'],
      scale: CommercialBreeder['scale']): CommercialBreeder =>
      ({ id, name: '가상 목장', country, scale, funds: 0, horseIds: [] });
    state.breeders = { z: breeder('z', 'GB', 'large'), b: breeder('b', 'GB', 'medium'),
      a: breeder('a', 'GB', 'large'), other: breeder('other', 'FR', 'small') };
    const before = structuredClone(state);
    expect(domesticBuyer(state, 'GB')).toBe('a');
    expect(domesticBuyer(state, 'FR')).toBe('other');
    expect(domesticBuyer(state, 'IE')).toBe('a');
    expect(state).toEqual(before);
    delete state.breeders.a;
    delete state.breeders.z;
    expect(domesticBuyer(state, 'GB')).toBe('b');
    state.breeders = {};
    expect(domesticBuyer(state, 'GB')).toBeNull();
  });
});

describe('종마 판매', () => {
  it.each(['domestic', 'overseas'] as const)('%s 판매 기록·소유권·이벤트·장부를 반영한다', (mode) => {
    const { state, horseId, year } = fixture();
    declarations(state, horseId);
    const before = structuredClone(state);
    const nominations = mode === 'domestic' ? 2 : 0;
    const price = mode === 'domestic' ? 3_760_000 : 2_600_000;
    const result = sellStallion(state, horseId, mode, nominations);
    expect(result).toEqual(sellStallion(state, horseId, mode, nominations));
    expect(state).toEqual(before);
    if (!result.ok) throw new Error(result.error);
    const next = result.state;
    expect(next.horses[horseId]).toMatchObject({ ownerId: null, trainerId: null,
      status: mode === 'domestic' ? 'stud' : 'retired' });
    expect(next.stallions[horseId]).toEqual(mode === 'domestic' ? before.stallions[horseId]
      : { ...before.stallions[horseId], lastSeasonYear: year });
    expect(next.owners[next.playerOwnerId]!.horseIds).not.toContain(horseId);
    expect(next.owners[next.playerOwnerId]!.funds).toBe(before.owners[state.playerOwnerId]!.funds + price);
    expect(next.economy.playerLedger.at(-1)).toEqual({ category: 'stallion_sale', amount: price,
      horseId, date: state.date });
    expect(next.stud.sales.at(-1)).toEqual({ stallionId: horseId, year, mode, price, nominations,
      buyerId: mode === 'domestic' ? domesticBuyer(state, state.owners[state.playerOwnerId]!.country) : null });
    expect(next.stud.nominations).toEqual(mode === 'domestic'
      ? [{ stallionId: horseId, perSeason: 2, season: 0, used: 0 }] : []);
    expect(result.events).toEqual([
      { type: 'horse_status_changed', horseId, from: 'stud',
        to: mode === 'domestic' ? 'stud' : 'retired', date: state.date },
      { type: 'stallion_sold', horseId, mode, price, nominations, date: state.date },
    ]);
    const races = next.seasonState.meetings[0]!.races;
    expect(races[0]!.declarations).toEqual([before.seasonState.meetings[0]!.races[0]!.declarations[1]]);
    expect(races.slice(1)).toEqual(before.seasonState.meetings[0]!.races.slice(1));
    expect(next.rng).toEqual(before.rng);
    expect(next.eventLog).toEqual(before.eventLog);
  });

  it.each(['not_found', 'not_player_stallion', 'outside_deal_window', 'leased', 'invalid_nominations'] as const)(
    '%s 오류는 원본을 보존한다', (error) => {
      const { state, horseId, year } = fixture();
      let id = horseId;
      if (error === 'not_found') id = 'missing';
      if (error === 'not_player_stallion') state.horses[id]!.ownerId = null;
      if (error === 'outside_deal_window') state.date.week = config.STUD_DEAL_FIRST_WEEK - 1;
      if (error === 'leased') state.stud.leases.push({ stallionId: id, kind: 'shuttle', year,
        returnSeason: year + 1, rent: 1_000, paidSeasons: 0 });
      const before = structuredClone(state);
      expect(sellStallion(state, id, 'domestic', error === 'invalid_nominations' ? 3 : 0))
        .toEqual({ ok: false, error });
      expect(state).toEqual(before);
    });

  it.each([-1, 0.5, 3, NaN, Infinity])('교배권 %s는 거부한다', (nominations) => {
    const { state, horseId } = fixture();
    expect(sellStallion(state, horseId, 'domestic', nominations)).toEqual({ ok: false, error: 'invalid_nominations' });
  });

  it('해외 교배권·현역마 판매를 거부하고 판매 이력은 최근 60건을 남긴다', () => {
    const { state, horseId } = fixture();
    expect(sellStallion(state, horseId, 'overseas', 1)).toEqual({ ok: false, error: 'invalid_nominations' });
    state.horses[horseId]!.status = 'resting';
    expect(sellStallion(state, horseId, 'domestic', 0)).toEqual({ ok: false, error: 'not_player_stallion' });
    state.horses[horseId]!.status = 'stud';
    state.stud.sales = Array.from({ length: 60 }, (_, i) => ({ stallionId: `old-${i}`,
      year: 2025, mode: 'domestic', price: 1_000, buyerId: null, nominations: 0 }));
    state.date.week = config.STUD_DEAL_LAST_WEEK;
    const result = sellStallion(state, horseId, 'domestic', 0);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.stud.sales).toHaveLength(60);
    expect(result.state.stud.sales[0]!.stallionId).toBe('old-1');
    expect(result.state.stud.nominations).toEqual([]);
    state.date.week++;
    expect(sellStallion(state, horseId, 'domestic', 0)).toEqual({ ok: false, error: 'outside_deal_window' });
  });
});

describe('연말 종마 판매 진로', () => {
  it.each(['sell_domestic', 'sell_overseas'] as const)('빈 칸 없이 %s를 적용한다', (choice) => {
    const { state, horseId, input } = yearEndFixture(choice, choice === 'sell_domestic' ? 1 : 0);
    state.stud.slots = 0;
    declarations(state, horseId);
    const before = structuredClone(state);
    const fee = estimateStudFee(state, horseId).fee;
    const mode = choice === 'sell_domestic' ? 'domestic' : 'overseas';
    const candidate = yearEndCandidates(state).find((c) => c.horseId === horseId)!;
    expect(candidate.allowed).toContain(choice);
    expect(candidate.allowed).not.toContain('stud');
    expect(candidate.recommended).toBe('continue');
    expect(candidate.salePrice).toEqual({ domestic: stallionSalePrice(fee, 4, 'domestic', 0),
      overseas: stallionSalePrice(fee, 4, 'overseas', 0) });
    const result = submitYearEnd(state, input);
    expect(result).toEqual(submitYearEnd(state, input));
    expect(state).toEqual(before);
    if (!result.ok) throw new Error(result.error);
    const next = result.state;
    expect(freeStudSlots(next)).toBe(0);
    expect(next.stud.sales.at(-1)?.price).toBe(stallionSalePrice(fee, 4, mode, mode === 'domestic' ? 1 : 0));
    if (mode === 'domestic') {
      expect(next.stallions[horseId]).toEqual(buildStallionRecord(state, horseId,
        state.date.year, state.owners[state.playerOwnerId]!.country));
      expect(next.stallions[horseId]).toMatchObject({ fee, firstSeasonYear: state.date.year,
        standsIn: state.owners[state.playerOwnerId]!.country });
      expect(next.stud.nominations).toContainEqual({ stallionId: horseId, perSeason: 1, season: 0, used: 0 });
    } else expect(next.stallions[horseId]).toBeUndefined();
    expect(next.seasonState.meetings[0]!.races[0]!.declarations).toHaveLength(1);
    expect(result.events.filter((e) => e.type === 'stallion_sold')).toEqual([
      { type: 'stallion_sold', horseId, mode, price: next.stud.sales.at(-1)!.price,
        nominations: mode === 'domestic' ? 1 : 0, date: { year: state.date.year, week: 1 } },
    ]);
  });

  it.each(['gelding', 'mare', 'young', 'consigned'] as const)('%s에는 판매 진로와 견적이 없다', (kind) => {
    const { state, horseId } = yearEndFixture();
    const horse = state.horses[horseId]!;
    if (kind === 'gelding') horse.gelded = true;
    if (kind === 'mare') horse.sex = 'female';
    if (kind === 'young') horse.birthYear = state.date.year - config.STUD_MIN_AGE + 1;
    if (kind === 'consigned') state.sales.consignments.push({ horseId, year: state.date.year, saleId: 'test-sale', reserve: null });
    const candidate = yearEndCandidates(state).find((c) => c.horseId === horseId)!;
    expect(candidate.allowed).not.toContain('sell_domestic');
    expect(candidate.allowed).not.toContain('sell_overseas');
    expect(candidate.salePrice).toBeNull();
  });

  it.each([
    ['sell_domestic', -1], ['sell_domestic', 0.5], ['sell_domestic', 3],
    ['sell_domestic', NaN], ['sell_overseas', 1], ['continue', 1],
  ] as const)('%s 교배권 %s를 거부한다', (choice, nominations) => {
    const { state, horseId, input } = yearEndFixture(choice, nominations);
    const before = structuredClone(state);
    expect(submitYearEnd(state, input)).toEqual({ ok: false, error: 'invalid_nominations', horseId });
    expect(state).toEqual(before);
  });

  it('교배권 생략은 0이며 최소 나이부터 판매할 수 있다', () => {
    const { state, horseId, input } = yearEndFixture();
    state.horses[horseId]!.birthYear = state.date.year - config.STUD_MIN_AGE;
    delete input.horses.find((d) => d.horseId === horseId)!.nominations;
    const result = submitYearEnd(state, input);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.stud.sales.at(-1)?.nominations).toBe(0);
  });
});

describe('종마 임대', () => {
  it('셔틀은 그해 52주에 한 번 지급하고 돌아온다', () => {
    const { state, horseId, year } = fixture();
    const before = structuredClone(state);
    const result = leaseStallion(state, horseId, 'shuttle', NaN);
    expect(result).toEqual(leaseStallion(state, horseId, 'shuttle', NaN));
    expect(state).toEqual(before);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.stud.leases).toEqual([{ stallionId: horseId, kind: 'shuttle', year,
      returnSeason: year + 1, rent: 400_000, paidSeasons: 0 }]);
    expect(result.state.stallions[horseId]).toEqual(state.stallions[horseId]);
    expect(result.state.economy).toEqual(state.economy);
    expect(result.events).toEqual([{ type: 'stallion_leased', horseId, kind: 'shuttle',
      returnSeason: year + 1, rent: 400_000, date: state.date }]);
    const system = createStudLeaseSystem();
    expect(system.id).toBe('stud_leases');
    const rng = createRng(42);
    const rngBefore = rng.getState();
    expect(system.run(result.state, { date: { year: year + 1, week: 52 }, rng })).toEqual([]);
    expect(system.run(result.state, { date: { year, week: 51 }, rng })).toEqual([]);
    const lease = result.state.stud.leases[0]!;
    result.state.date = { year, week: 52 };
    const paid = advanceWeek(result.state, [system]);
    expect(paid.events).toContainEqual({ type: 'stud_lease_paid', horseId, kind: 'shuttle',
      rent: 400_000, returned: true, date: { year, week: 52 } });
    expect(paid.state.stud.leases).toEqual([]);
    expect(paid.state.owners[state.playerOwnerId]!.funds).toBe(state.owners[state.playerOwnerId]!.funds + 400_000);
    expect(paid.state.rng).toEqual(state.rng);
    expect(system.run(result.state, { date: { year, week: 52 }, rng })).toHaveLength(1);
    expect(lease.paidSeasons).toBe(1);
    expect(system.run(result.state, { date: { year, week: 52 }, rng })).toEqual([]);
    expect(rng.getState()).toEqual(rngBefore);
  });

  it('장기는 다음 두 시즌 27주에 각각 지급하고 마지막에 복귀한다', () => {
    const { state, horseId, year } = fixture();
    const before = structuredClone(state);
    const result = leaseStallion(state, horseId, 'long', year + 3);
    if (!result.ok) throw new Error(result.error);
    expect(state).toEqual(before);
    const next = result.state;
    expect(next.stallions[horseId]!.leasedAwayUntil).toBe(year + 3);
    expect(next.stud.leases[0]!.rent).toBe(1_000_000);
    const lease = next.stud.leases[0]!;
    next.stallions[horseId]!.fee = 1_000;
    const system = createStudLeaseSystem();
    const rng = createRng(42);
    expect(system.run(next, { date: { year, week: 27 }, rng })).toEqual([]);
    expect(system.run(next, { date: { year: year + 1, week: 26 }, rng })).toEqual([]);
    for (const offset of [1, 2]) {
      const date = { year: year + offset, week: 27 };
      expect(system.run(next, { date, rng })).toEqual([{ type: 'stud_lease_paid', horseId,
        kind: 'long', rent: 1_000_000, returned: offset === 2, date }]);
      expect(lease.paidSeasons).toBe(offset);
    }
    expect(next.stud.leases).toEqual([]);
    expect(next.stallions[horseId]!.leasedAwayUntil).toBeNull();
    expect(next.economy.playerLedger.filter((e) => e.category === 'stud_lease')).toEqual([1, 2].map(
      (offset) => ({ category: 'stud_lease', amount: 1_000_000, horseId, date: { year: year + offset, week: 27 } })));
    expect(next.owners[state.playerOwnerId]!.funds).toBe(state.owners[state.playerOwnerId]!.funds + 2_000_000);
    expect(next.rng).toEqual(state.rng);
  });

  it.each(['shuttle', 'long'] as const)('%s 임대 중 판매와 재임대는 오류다', (kind) => {
    const { state, horseId, year } = fixture();
    const result = leaseStallion(state, horseId, kind, year + 3);
    if (!result.ok) throw new Error(result.error);
    const before = structuredClone(result.state);
    expect(sellStallion(result.state, horseId, 'domestic', 0)).toEqual({ ok: false, error: 'leased' });
    expect(leaseStallion(result.state, horseId, 'long', year + 2)).toEqual({ ok: false, error: 'already_leased' });
    expect(result.state).toEqual(before);
  });

  it.each(['not_found', 'not_player_stallion', 'outside_deal_window', 'invalid_return_season'] as const)(
    '%s 임대 오류는 원본을 보존한다', (error) => {
      const { state, horseId, year } = fixture();
      const id = error === 'not_found' ? 'missing' : horseId;
      if (error === 'not_player_stallion') state.horses[id]!.status = 'dead';
      if (error === 'outside_deal_window') state.date.week = config.STUD_DEAL_LAST_WEEK + 1;
      const before = structuredClone(state);
      expect(leaseStallion(state, id, 'long', error === 'invalid_return_season' ? year + 1 : year + 2))
        .toEqual({ ok: false, error });
      expect(state).toEqual(before);
    });

  it.each([undefined, NaN, Infinity, 2028.5, 2027, 2033])('장기 복귀 시즌 %s는 거부한다', (returns) => {
    const { state, horseId } = fixture();
    expect(leaseStallion(state, horseId, 'long', returns)).toEqual({ ok: false, error: 'invalid_return_season' });
  });

  it.each([2, 6])('장기 복귀 시즌 경계 year + %i를 허용한다', (offset) => {
    const { state, horseId, year } = fixture();
    expect(leaseStallion(state, horseId, 'long', year + offset).ok).toBe(true);
  });

  it.each(['shuttle', 'long'] as const)('%s 임대료는 낮은 종부료도 천 유로 단위로 반올림한다', (kind) => {
    const { state, horseId, year } = fixture();
    state.stallions[horseId]!.fee = 125;
    const result = leaseStallion(state, horseId, kind, year + 2);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.stud.leases[0]!.rent).toBe(kind === 'shuttle' ? 3_000 : 6_000);
  });

  it.each(['shuttle', 'long'] as const)('%s 사망·소유 해제 때 지급 없이 정리한다', (kind) => {
    for (const cause of ['dead', 'sold'] as const) {
      const { state, horseId, year } = fixture();
      const result = leaseStallion(state, horseId, kind, year + 3);
      if (!result.ok) throw new Error(result.error);
      const next = result.state;
      if (cause === 'dead') next.horses[horseId]!.status = 'dead';
      else next.horses[horseId]!.ownerId = null;
      const economy = structuredClone(next.economy);
      const date = kind === 'shuttle' ? { year, week: 52 } : { year: year + 1, week: 10 };
      expect(createStudLeaseSystem().run(next, { date, rng: createRng(42) })).toEqual([]);
      expect(next.economy).toEqual(economy);
      expect(next.stud.leases).toEqual([]);
      if (kind === 'long') expect(next.stallions[horseId]!.leasedAwayUntil).toBeNull();
    }
  });

  it('여러 임대는 배열 순서대로 지급하며 같은 시드의 주 진행 결과가 같다', () => {
    const { state, horseId, year } = fixture();
    const secondId = 'test-second';
    state.horses[secondId] = { ...structuredClone(state.horses[horseId]!), id: secondId };
    state.stallions[secondId] = { ...structuredClone(state.stallions[horseId]!), horseId: secondId };
    state.stud.leases = [secondId, horseId].map((id) => ({ stallionId: id, kind: 'long', year,
      returnSeason: year + 2, rent: 100_000, paidSeasons: 0 }));
    state.date = { year: year + 1, week: 27 };
    const system = createStudLeaseSystem();
    const first = advanceWeek(state, [system]);
    expect(first).toEqual(advanceWeek(state, [system]));
    expect(first.events.filter((e) => e.type === 'stud_lease_paid').map((e) => e.horseId)).toEqual([secondId, horseId]);
    expect(first.state.rng).toEqual(state.rng);
  });
});
