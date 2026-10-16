import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bookCovering, createBreedingSystem, nominationsLeft } from '../../src/engine/breeding/season';
import { FEE_REVIEW_WEEK } from '../../src/engine/config/stud';
import { MORTALITY_CHECK_WEEK } from '../../src/engine/config/mortality';
import * as dataSource from '../../src/engine/data/staticData';
import { availableStallions } from '../../src/engine/horse/playerView';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems } from '../../src/engine/state/systems';
import { bootstrapWorld } from '../../src/engine/state/world';
import { createStudBooksSystem } from '../../src/engine/stud/books';
import { createFeeReviewSystem, reviewFee } from '../../src/engine/stud/market';
import { annualDeathChance, createMortalitySystem } from '../../src/engine/stud/mortality';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState, WeeklySystem } from '../../src/engine/types';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';

const SEED = 20261011;
const data = {
  stallionRecords: dataSource.getStallionRecords(), stallionNames: dataSource.getStallionNames(),
  naming: dataSource.getNamingData(), nicks: dataSource.getNicks(), ...dataSource.getPeopleData(),
  courses: dataSource.getRacecourses(), templates: dataSource.getRaceTemplates(),
  series: dataSource.getSeriesDefinitions(), sales: dataSource.getSalesData(),
};
const options = { seed: SEED, playerName: 'Test Owner',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const breeding = createBreedingSystem(data);
function fixture(week = 1) {
  const state = bootstrapWorld(createNewGame(options), data, createRng(SEED));
  state.date = { year: 2027, week };
  const mareId = state.owners[state.playerOwnerId]!.horseIds.find(id => state.mares[id] !== undefined)!;
  const stallionId = Object.keys(state.stallions).sort()[0]!;
  Object.assign(state.mares[mareId]!, { pregnant: false, coveredBy: null, coveredWeek: null, dueWeek: null });
  state.horses[mareId]!.birthYear = 2020;
  state.horses[stallionId]!.ownerId = null;
  const otherId = `${mareId}-other`;
  state.horses[otherId] = { ...structuredClone(state.horses[mareId]!), id: otherId };
  state.mares[otherId] = { ...structuredClone(state.mares[mareId]!), horseId: otherId };
  state.owners[state.playerOwnerId]!.horseIds.push(otherId);
  state.stud.nominations.push({ stallionId, perSeason: 1, season: 2026, used: 1 });
  return { state, mareId, otherId, stallionId };
}
function reserve(state: GameState, mareId: string, stallionId: string) {
  const result = bookCovering(state, state.horses[mareId]!.ownerId!, mareId, stallionId);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function run(system: WeeklySystem, state: GameState, year: number, week: number) {
  state.date = { year, week };
  return system.run(state, { date: state.date, rng: createRng(SEED) });
}
const funds = (state: GameState) => state.owners[state.playerOwnerId]!.funds;

function kill(state: GameState, horseId: string) {
  for (const horse of Object.values(state.horses)) {
    if (horse.id !== horseId && (horse.status === 'stud' || horse.status === 'broodmare')) {
      horse.status = 'retired';
    }
  }
  state.horses[horseId]!.birthYear = 2027 - 30;
  let seed = 1;
  while (!createRng(`${seed}:mortality:${horseId}:2027`).chance(annualDeathChance(30))) seed++;
  state.initialSeed = seed;
  const beforeRng = structuredClone(state.rng);
  run(createMortalitySystem(), state, 2027, MORTALITY_CHECK_WEEK);
  expect(state.horses[horseId]!.status).toBe('dead');
  expect(state.rng).toEqual(beforeRng);
}

describe('장기 임대와 북반구 시즌', () => {
  it.each([2027, 2028, 2029])('%i 시즌 예약·목록·AI 북·정산의 복귀 경계를 지킨다', year => {
    const { state, mareId, stallionId } = fixture();
    state.stallions[stallionId]!.leasedAwayUntil = 2029;
    state.horses[stallionId]!.ownerId = state.playerOwnerId;
    state.date = { year: year - 1, week: 44 };
    const result = bookCovering(state, state.playerOwnerId, mareId, stallionId);
    if (year < 2029) expect(result).toEqual({ ok: false, error: 'stallion_not_available' });
    else expect(result.ok).toBe(true);
    expect(availableStallions(state).some(row => row.horse.id === stallionId)).toBe(year === 2029);
    const books = createStudBooksSystem();
    run(books, state, year - 1, 44);
    run(books, state, year, 16);
    expect(state.stallions[stallionId]!.bookingSeason).toBe(year);
    if (year < 2029) {
      expect(state.stallions[stallionId]).toMatchObject({ aiDemand: 0, aiBooked: 0, bookedThisSeason: 0 });
    } else expect(state.stallions[stallionId]!.aiBooked).toBeGreaterThan(0);
    run(books, state, year, 27);
    expect(state.stud.seasons.some(record => record.stallionId === stallionId)).toBe(year === 2029);
  });

  it.each([2026, 2027, 2028])('%i년 재산정은 다음 예약 시즌을 보고 수태율 노화를 유지한다', year => {
    const { state, stallionId } = fixture();
    state.horses[stallionId]!.ownerId = state.playerOwnerId;
    state.horses[stallionId]!.birthYear = 2000;
    Object.assign(state.stallions[stallionId]!, { leasedAwayUntil: 2029, fee: 20_000,
      popularity: 42, fertility: 0.8, aiDemand: 1 });
    const before = structuredClone(state.stallions[stallionId]!);
    const expected = reviewFee(state, stallionId, year);
    const events = run(createFeeReviewSystem(), state, year, FEE_REVIEW_WEEK);
    if (year < 2028) {
      expect(state.stallions[stallionId]).toEqual({ ...before, fertility: expected.fertility });
      expect(events).toEqual([]);
    } else {
      expect(state.stallions[stallionId]).toMatchObject(expected);
      expect(events).toContainEqual(expect.objectContaining({ type: 'stud_fee_set', stallionId, season: 2029 }));
    }
  });
});

describe('시즌별 교배권과 실제 종부료', () => {
  it.each([1, 7])('%i주 첫 예약은 무료, 두 번째는 유료이며 다음 시즌 다시 무료다', week => {
    const { state, mareId, otherId, stallionId } = fixture(week);
    const original = structuredClone(state);
    expect(nominationsLeft(state, stallionId, 2027)).toBe(1);
    const first = reserve(state, mareId, stallionId);
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'covering_booked', fee: 0 }));
    expect(first.state.economy).toEqual(state.economy);
    expect(state).toEqual(original);
    expect(first.state.stud.nominations[0]).toMatchObject({ season: 2027, used: 1 });
    expect(nominationsLeft(first.state, stallionId, 2027)).toBe(0);
    const second = reserve(first.state, otherId, stallionId).state;
    const fee = state.stallions[stallionId]!.fee;
    expect(funds(second)).toBe(funds(state) - fee);
    if (week === 7) {
      expect(second.mares[mareId]!.coveredFee).toBe(0);
      expect(second.mares[otherId]!.coveredFee).toBe(fee);
    } else {
      expect(second.mares[mareId]!.bookedFor?.feePaid).toBe(0);
      expect(second.mares[otherId]!.bookedFor?.feePaid).toBe(fee);
    }
    second.date = { year: 2028, week: 1 };
    second.mares[mareId] = structuredClone(original.mares[mareId]!);
    const next = reserve(second, mareId, stallionId).state;
    expect(next.economy).toEqual(second.economy);
    expect(next.stud.nominations[0]).toMatchObject({ season: 2028, used: 1 });
  });

  it('자금·빚 검사를 무료 교배권에는 생략하고 유료 예약에는 적용한다', () => {
    const { state, mareId, otherId, stallionId } = fixture();
    state.owners[state.playerOwnerId]!.funds = -1;
    state.economy.debt = 10_000;
    const first = reserve(state, mareId, stallionId).state;
    expect(funds(first)).toBe(-1);
    expect(first.economy).toEqual(state.economy);
    expect(bookCovering(first, state.playerOwnerId, otherId, stallionId))
      .toEqual({ ok: false, error: 'insufficient_funds' });
  });

  it('자기 종마·AI 암말·실패한 예약은 플레이어 교배권을 쓰지 않는다', () => {
    const { state, mareId, stallionId } = fixture();
    const own = structuredClone(state);
    own.horses[stallionId]!.ownerId = own.playerOwnerId;
    expect(reserve(own, mareId, stallionId).state.stud.nominations).toEqual(own.stud.nominations);
    const ai = { ...structuredClone(state.owners[state.playerOwnerId]!), id: 'trade-ai', isPlayer: false,
      horseIds: [mareId] };
    state.owners[ai.id] = ai;
    state.horses[mareId]!.ownerId = ai.id;
    ai.funds = state.stallions[stallionId]!.fee;
    const booked = reserve(state, mareId, stallionId).state;
    expect(booked.mares[mareId]!.bookedFor?.feePaid).toBe(state.stallions[stallionId]!.fee);
    expect(booked.stud.nominations).toEqual(state.stud.nominations);
    state.horses[mareId]!.ownerId = state.playerOwnerId;
    state.stallions[stallionId]!.bookedThisSeason = state.stallions[stallionId]!.bookLimit;
    state.stallions[stallionId]!.bookingSeason = 2027;
    expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'book_full' });
    expect(nominationsLeft(state, stallionId, 2027)).toBe(1);
    expect(nominationsLeft(state, 'missing-stallion', 2027)).toBe(0);
  });

  it.each([true, false])('미배정 환불은 실제 납부액을 쓰고 무료 권리를 복구한다(교배권 %s)', free => {
    const { state, mareId, stallionId } = fixture();
    if (!free) state.stud.nominations = [];
    const booked = reserve(state, mareId, stallionId).state;
    const paid = booked.mares[mareId]!.bookedFor!.feePaid!;
    const economyBefore = structuredClone(booked.economy);
    booked.stallions[stallionId]!.fee *= 2;
    run(breeding, booked, 2027, 27);
    expect(booked.mares[mareId]!.bookedFor).toBeNull();
    expect(booked.stallions[stallionId]!.bookedThisSeason).toBe(0);
    expect(funds(booked)).toBe(funds(state));
    if (free) {
      expect(booked.economy).toEqual(economyBefore);
      expect(nominationsLeft(booked, stallionId, 2027)).toBe(1);
      booked.mares[mareId]!.bookedFor = { stallionId, season: 2027, feePaid: 0 };
      run(breeding, booked, 2027, 27);
      expect(booked.stud.nominations[0]!.used).toBe(0);
    } else expect(booked.economy.playerLedger.at(-1)?.amount).toBe(paid);
  });

  it.each([0, 12_000, undefined])('사전 예약 배정과 수태 실패 환불은 feePaid %s를 유지한다', paid => {
    const { state, mareId, stallionId } = fixture();
    state.stallions[stallionId]!.fertility = 0;
    state.mares[mareId]!.bookedFor = { stallionId, season: 2027, feePaid: paid };
    run(breeding, state, 2027, 7);
    expect(state.mares[mareId]).toMatchObject({ coveredBy: stallionId, coveredFee: paid ?? null, bookedFor: null });
    state.stallions[stallionId]!.fee = 25_000;
    const before = funds(state);
    const economyBefore = structuredClone(state.economy);
    run(breeding, state, 2027, 8);
    expect(funds(state) - before).toBe(paid ?? 25_000);
    expect(state.mares[mareId]).toMatchObject({ coveredBy: null, coveredFee: null });
    if (paid === 0) expect(state.economy).toEqual(economyBefore);
  });

  it('옛 저장본의 미배정 예약은 현재 종부료로 환불한다', () => {
    const { state, mareId, stallionId } = fixture();
    state.mares[mareId]!.bookedFor = { stallionId, season: 2027 };
    const before = funds(state);
    run(breeding, state, 2027, 27);
    expect(funds(state) - before).toBe(state.stallions[stallionId]!.fee);
  });
});

describe('종마·암말 사망 환불', () => {
  it.each(['stallion', 'mare'] as const)('%s 사망은 무료·유료·옛 저장본 납부액만 환불한다', target => {
    for (const week of [1, 7]) {
      for (const paid of [0, 12_000, undefined]) {
        const fixtureData = fixture(week);
        const { mareId, stallionId } = fixtureData;
        if (paid !== 0) fixtureData.state.stud.nominations = [];
        fixtureData.state.stallions[stallionId]!.fee = paid ?? 12_000;
        const state = reserve(fixtureData.state, mareId, stallionId).state;
        if (paid === undefined) {
          if (week === 1) delete state.mares[mareId]!.bookedFor!.feePaid;
          else delete state.mares[mareId]!.coveredFee;
        }
        state.stallions[stallionId]!.fee = 25_000;
        const before = funds(state);
        const economyBefore = structuredClone(state.economy);
        kill(state, target === 'stallion' ? stallionId : mareId);
        expect(funds(state) - before).toBe(paid ?? 25_000);
        expect(state.mares[mareId]!.coveredFee ?? null).toBeNull();
        if (week === 1) expect(state.mares[mareId]!.bookedFor).toBeNull();
        else expect(state.mares[mareId]!.coveredBy).toBeNull();
        if (paid === 0) expect(state.economy).toEqual(economyBefore);
      }
    }
  });
});

describe('국내 판매 종마의 시즌과 자마', () => {
  it('국내 판매 정산은 독립 난수로 같은 수태 수를 남기고 수입·이벤트 없이 3년 뒤 자마를 편입한다', () => {
    const state = bootstrapGame(options, data);
    const sourceId = Object.keys(state.stallions).sort()[0]!;
    const stallionId = 'domestic-trade-sire';
    state.stallions[stallionId] = { ...structuredClone(state.stallions[sourceId]!), horseId: stallionId,
      realKey: null, fertility: 0.85, standsIn: 'IE', bookingSeason: 2027, aiBooked: 100, bookedThisSeason: 100 };
    state.horses[stallionId] = { ...structuredClone(state.horses[sourceId]!), id: stallionId,
      name: 'Silver Meadow', ownerId: null, status: 'stud' };
    state.stud.sales.push({ stallionId, year: 2026, mode: 'domestic', price: 500_000, buyerId: null, nominations: 1 });
    const owned = structuredClone(state);
    owned.horses[stallionId]!.ownerId = state.playerOwnerId;
    const economyBefore = structuredClone(state.economy);
    const rngBefore = structuredClone(state.rng);
    const books = createStudBooksSystem();
    expect(run(books, state, 2027, 27)).toEqual([]);
    run(books, owned, 2027, 27);
    const record = state.stud.seasons.find(record => record.stallionId === stallionId)!;
    expect(record).toMatchObject({ year: 2027, outsideCovers: 100, income: 0 });
    expect(record.conceptions).toBeGreaterThan(0);
    expect(record.conceptions).toBe(owned.stud.seasons.find(record => record.stallionId === stallionId)!.conceptions);
    expect(state.economy).toEqual(economyBefore);
    expect(state.rng).toEqual(rngBefore);
    expect(run(books, state, 2027, 27)).toEqual([]);
    expect(state.stud.seasons.filter(record => record.stallionId === stallionId)).toHaveLength(1);
    const again = structuredClone(state);
    run(createPopulationSystem(data), state, 2030, 1);
    run(createPopulationSystem(data), again, 2030, 1);
    expect(state).toEqual(again);
    const crop = Object.values(state.horses).filter(horse => horse.sireId === stallionId);
    expect(crop.length).toBeGreaterThan(0);
    for (const horse of crop) {
      expect(horse).toMatchObject({ birthYear: 2028, status: 'in_training', countryOfBirth: 'IE' });
      expect(horse.ownerId).not.toBeNull();
      expect(horse.ownerId).not.toBe(state.playerOwnerId);
    }
  }, 30_000);

  it.each(['overseas', 'unsold', 'retired'] as const)('%s 종마는 국내 판매 시즌 기록을 남기지 않는다', mode => {
    const { state, stallionId } = fixture();
    if (mode !== 'unsold') state.stud.sales.push({ stallionId, year: 2026,
      mode: mode === 'overseas' ? 'overseas' : 'domestic', price: 500_000, buyerId: null, nominations: 0 });
    if (mode === 'retired') state.horses[stallionId]!.status = 'retired';
    state.stallions[stallionId]!.bookingSeason = 2027;
    run(createStudBooksSystem(), state, 2027, 27);
    expect(state.stud.seasons).toEqual([]);
  });
});

function simulate(): GameState {
  let state = bootstrapGame(options, data);
  const systems = createGameSystems(data);
  for (let i = 0; i < 52; i++) state = advanceWeek(state, systems).state;
  return state;
}
function hashes(state: GameState) {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return {
    raceResults: hash(state.raceResults),
    fees: hash(Object.keys(state.stallions).sort().map(id => [id, state.stallions[id]!.fee])),
    ledger: hash(state.economy.playerLedger),
  };
}
it('판매·임대·교배권 없는 시드 20261011의 52주 결과는 변경 전 해시와 같고 두 번 재현된다', () => {
  const first = simulate();
  expect(first.stud.sales).toEqual([]);
  expect(first.stud.leases).toEqual([]);
  expect(first.stud.nominations).toEqual([]);
  expect(first.raceResults.length).toBeGreaterThan(0);
  // M4-H12: 14종 부상·회복 기간 변화로 출주·레이스 결과와 자마 성적 기반 종부료가 바뀌어 재고정, fees 는 M4-H3(종마 제엽염 은퇴·사망) 반영해 다시 재고정. 장부 해시는 유지. 2026-10-16 15회차·17회차 어휘 정리(이름 변화)로 재고정. 2026-10-16 15회차 어휘 정리(이름 변화)로 세 값 모두 재고정. 18·19회차 계통 정리로 fees 재고정. M4-E1 시설 유지비 시스템 등록으로 ledger 재고정. 20~22회차(추가분 포함) 혈통(계통·이름 변화)으로 raceResults·fees 재고정.
  expect(hashes(first)).toEqual({
    raceResults: '1c8e1ccb7ab29982f099f332112c04f3ae5c68355257563dad6958d6700d38a0',
    fees: '376f68e9d5452ff5ebf0603c9a8da4fbbd2622c8de0dd81dd11fbb6f60753f07',
    ledger: '3549cabb2de86455f1ac156bbcf584fc2a3d6ee53ba05e0aa6ce14fc0099e824',
  });
  expect(simulate()).toEqual(first);
}, 600_000);
