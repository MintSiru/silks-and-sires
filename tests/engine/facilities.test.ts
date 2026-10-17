import { describe, expect, it } from 'vitest';
import { GESTATION_WEEKS } from '../../src/engine/config/breedingSeason';
import { REST_FATIGUE_RECOVERY } from '../../src/engine/config/conditioning';
import { FACILITY_KINDS, uniformFacilities } from '../../src/engine/config/farm';
import { MARE_LOSS_PER_PREGNANCY } from '../../src/engine/config/health';
import { VET_EXAM_COST } from '../../src/engine/config/injury';
import * as data from '../../src/engine/data/staticData';
import { createCostsSystem } from '../../src/engine/economy/costs';
import { createFacilitiesSystem, facilityLevel, startFacilityUpgrade, upgradeCost } from '../../src/engine/farm/facilities';
import { weeklyConditionInPlace } from '../../src/engine/horse/conditioning';
import { generateHorse } from '../../src/engine/horse/generate';
import { ageInYearsAt, growthSystem } from '../../src/engine/horse/growth';
import { abilityAtAge } from '../../src/engine/horse/growthCurve';
import { injuryWeights, orderVetExam, progressInjuryInPlace } from '../../src/engine/horse/injury';
import { createRng } from '../../src/engine/rng';
import { assignTrainer } from '../../src/engine/season/player';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems } from '../../src/engine/state/systems';
import { createBreedingHealthSystem } from '../../src/engine/stud/health';
import { freeStudSlots } from '../../src/engine/stud/stand';
import { advanceWeek } from '../../src/engine/time/advance';
import { addWeeks } from '../../src/engine/time/calendar';
import type { FacilityKind, GameState, Horse, Rng, WeeklySystem } from '../../src/engine/types';

const OPTIONS = { seed: 20261011, playerName: 'Cloud Keeper',
  silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } } as const;

function fixture(kind?: FacilityKind, level = 0): GameState {
  const state = createNewGame(OPTIONS);
  state.farm.facilities = uniformFacilities(0);
  if (kind !== undefined) state.farm.facilities[kind] = level;
  return state;
}

function addHorse(state: GameState, age = 1, status: Horse['status'] = 'yearling'): Horse {
  const horse = generateHorse(createRng('facilities-horse'), {
    id: 'young-cloud', name: 'Young Cloud', birthYear: state.date.year - age,
    currentYear: state.date.year, sex: 'female', countryOfBirth: 'GB', status, level: 60,
  });
  horse.ownerId = state.playerOwnerId;
  horse.trainerId = null;
  horse.condition = { fitness: 40, fatigue: 80, mental: 60, injury: null };
  state.horses[horse.id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  return horse;
}

function context(state: GameState, isPlayer = true) {
  return { date: state.date, initialSeed: state.initialSeed, isPlayer, farm: state.farm };
}

function runSystem(state: GameState, system: WeeklySystem) {
  const rng = createRng(1);
  const before = rng.getState();
  const events = system.run(state, { date: state.date, rng });
  expect(rng.getState()).toEqual(before);
  return events;
}

describe('공사·비용·유지비', () => {
  it.each(FACILITY_KINDS)('%s 단계별 공사비와 공사 중 단계, 원본·이벤트 로그 불변', (kind) => {
    for (const target of [1, 2, 3]) {
      const state = fixture(kind, target - 1);
      state.owners[state.playerOwnerId]!.funds = 2_000_000;
      const before = structuredClone(state);
      const cost = [0, 60_000, 150_000, 350_000][target]! * (['stable_block', 'stallion_barn'].includes(kind) ? 1.5 : 1);
      expect(upgradeCost(kind, target)).toBe(cost);
      const result = startFacilityUpgrade(state, kind);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(state).toEqual(before);
      expect(result.state.eventLog).toEqual(before.eventLog);
      expect(result.events).toEqual([{ type: 'facility_upgraded', facility: kind, level: target, cost, date: state.date }]);
      expect(result.state.owners[state.playerOwnerId]!.funds).toBe(2_000_000 - cost);
      expect(result.state.economy.playerLedger).toEqual([{ date: state.date, category: 'facility_build', amount: -cost, horseId: null }]);
      expect(facilityLevel(result.state, kind)).toBe(target - 1);
      expect(startFacilityUpgrade(result.state, 'pool')).toEqual({ ok: false, error: 'under_construction' });
    }
  });

  it('목장 없음·최고 단계·자금 부족·빚의 실패는 원본을 바꾸지 않는다', () => {
    for (const error of ['no_farm', 'max_level', 'insufficient_funds', 'debt'] as const) {
      const state = fixture();
      if (error === 'no_farm') state.farm.owned = false;
      if (error === 'max_level') state.farm.facilities.pool = 3;
      if (error === 'insufficient_funds') state.owners[state.playerOwnerId]!.funds = 59_999;
      if (error === 'debt') { state.economy.mode = 'casual'; state.economy.debt = 1; }
      const before = structuredClone(state);
      expect(startFacilityUpgrade(state, 'pool')).toEqual({ ok: false, error: error === 'debt' ? 'insufficient_funds' : error });
      expect(state).toEqual(before);
    }
  });

  it.each([1, 51])('%i주 착공: 연말을 넘어도 정확히 4주 뒤 완공, 종마 칸·완공 유지비 반영', (week) => {
    const initial = fixture('stallion_barn', 1);
    initial.date.week = week;
    const started = startFacilityUpgrade(initial, 'stallion_barn');
    if (!started.ok) throw new Error(started.error);
    let state = started.state;
    const ready = addWeeks(initial.date, 4);
    expect(state.farm.construction?.readyWeekKey).toBe(ready.year * 100 + ready.week);
    for (let i = 0; i < 4; i++) {
      const out = advanceWeek(state, [createFacilitiesSystem()]);
      expect(out.events.filter((event) => event.type === 'facility_upgraded')).toEqual([]);
      state = out.state;
      expect(facilityLevel(state, 'stallion_barn')).toBe(1);
      expect(state.stud.slots).toBe(1);
    }
    const out = advanceWeek(state, [createFacilitiesSystem()]);
    expect(out.events).toEqual([{ type: 'facility_upgraded', facility: 'stallion_barn', level: 2, cost: 0, date: ready }]);
    expect(out.state.farm.construction).toBeNull();
    expect(facilityLevel(out.state, 'stallion_barn')).toBe(2);
    expect(freeStudSlots(out.state)).toBe(2);
    expect(out.state.economy.playerLedger.at(-1)?.amount).toBe(-Math.round(16_000 / 52));
    expect(advanceWeek(out.state, [createFacilitiesSystem()]).events).toEqual([]);
  });

  it('단계 합 6의 52주 유지비는 €48,000 ±52, 정기 비용 시스템과 중복 없음', () => {
    let state = fixture('pool', 3);
    state.farm.facilities.vet_clinic = 3;
    for (let i = 0; i < 52; i++) state = advanceWeek(state, [createFacilitiesSystem(), createCostsSystem()]).state;
    const entries = state.economy.playerLedger.filter((e) => e.category === 'facility');
    expect(entries).toHaveLength(52);
    expect(Math.abs(entries.reduce((sum, e) => sum - e.amount, 0) - 48_000)).toBeLessThanOrEqual(52);
    expect(state.stud.slots).toBe(1);
  });

  it('목장이 없으면 기록된 시설·공사가 있어도 효과·유지비 없고 기본 종마 칸 1', () => {
    const state = fixture();
    state.farm.facilities = uniformFacilities(3);
    state.farm.owned = false;
    state.farm.construction = { facility: 'pool', level: 3, readyWeekKey: 202601 };
    state.stud.slots = 3;
    expect(runSystem(state, createFacilitiesSystem())).toEqual([]);
    expect(FACILITY_KINDS.map((kind) => facilityLevel(state, kind))).toEqual(Array(9).fill(0));
    expect(state.economy.playerLedger).toEqual([]);
    expect(state.stud.slots).toBe(1);
  });

  it.each([0, 3])('종마사 %i단계: 기본 1칸·최고 3칸, 점유한 칸만 차감', (level) => {
    const state = fixture('stallion_barn', level);
    addHorse(state, 5, 'stud');
    runSystem(state, createFacilitiesSystem());
    expect(state.stud.slots).toBe(Math.max(1, level));
    expect(freeStudSlots(state)).toBe(Math.max(1, level) - 1);
  });
});

describe('플레이어 말 시설 효과와 L=0 호환', () => {
  it.each([
    ['paddock', 0, 'foal', 'power', 1.12],
    ['paddock', 1, 'yearling', 'speed', 1.12],
    ['hill_gallop', 1, 'yearling', 'stamina', 1.15],
    ['hill_gallop', 2, 'yearling', 'stamina', 1.15],
    ['yearling_complex', 1, 'yearling', 'speed', 1.09],
    ['yearling_complex', 2, 'yearling', 'acceleration', 1.09],
  ] as const)('%s / %i세: 성장 배수 %s %s %f, AI 무보정', (kind, age, status, stat, multiplier) => {
    for (const isPlayer of [true, false]) {
      const values: number[] = [];
      for (const level of [0, 3]) {
        const state = fixture(kind, level);
        const horse = addHorse(state, age, status);
        if (!isPlayer) horse.ownerId = null;
        const base = abilityAtAge(horse.potential, ageInYearsAt(horse.birthYear, state.date), horse.growth);
        runSystem(state, growthSystem);
        if (level === 0) expect(horse.ability).toEqual(base);
        values.push(horse.ability[stat]);
      }
      expect(values[1]! / values[0]!).toBeCloseTo(isPlayer ? multiplier : 1);
    }
  });

  it('시설 성장은 잠재 상한을 지키며 조교 시작한 2세·3세에는 어린 말 보정이 없다', () => {
    for (const [age, status] of [[2, 'in_training'], [3, 'yearling']] as const) {
      const state = fixture();
      state.farm.facilities = uniformFacilities(3);
      const horse = addHorse(state, age, status);
      const base = abilityAtAge(horse.potential, age, horse.growth);
      runSystem(state, growthSystem);
      expect(horse.ability).toEqual(base);
    }
    const state = fixture();
    state.date.week = 52;
    state.farm.facilities = uniformFacilities(3);
    const horse = addHorse(state, 1);
    horse.growth.peakAge = 2;
    runSystem(state, growthSystem);
    for (const stat of Object.keys(horse.ability) as (keyof Horse['ability'])[]) {
      expect(horse.ability[stat]).toBeLessThanOrEqual(horse.potential[stat]);
    }
  });

  it('수영장 3: 휴양 피로 회복 1.6배, AI는 기존 회복량', () => {
    for (const isPlayer of [true, false]) {
      const state = fixture('pool', 3);
      const horse = addHorse(state, 4, 'resting');
      weeklyConditionInPlace(horse, undefined, 4, false, createRng(1), context(state, isPlayer));
      expect(80 - horse.condition.fatigue).toBeCloseTo(REST_FATIGUE_RECOVERY * (isPlayer ? 1.6 : 1));
      horse.condition.fatigue = 80;
      horse.condition.injury = { kind: 'knock', weeksOut: 5, diagnosed: true };
      weeklyConditionInPlace(horse, undefined, 4, false, createRng(1), context(state, isPlayer));
      expect(80 - horse.condition.fatigue).toBeCloseTo(REST_FATIGUE_RECOVERY * (isPlayer ? 1.6 : 1));
    }
  });

  it('수영장 3: 부상 주마다 독립 확률 0.3으로 추가 1주 감소, 조기 회복·AI 무보정', () => {
    let extras = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const state = fixture('pool', 3);
      state.initialSeed = seed;
      const horse = addHorse(state, 4, 'resting');
      horse.condition.injury = { kind: 'knock', weeksOut: 5, diagnosed: true };
      const expected = createRng(`${seed}:facility-pool:${horse.id}:2026:1`).chance(0.3);
      progressInjuryInPlace(horse, context(state));
      expect(horse.condition.injury?.weeksOut).toBe(expected ? 3 : 4);
      if (expected) extras++;
      horse.condition.injury = { kind: 'knock', weeksOut: 5, diagnosed: true };
      progressInjuryInPlace(horse, context(state, false));
      expect(horse.condition.injury?.weeksOut).toBe(4);
      if (expected) {
        horse.condition.injury = { kind: 'knock', weeksOut: 2, diagnosed: true };
        progressInjuryInPlace(horse, context(state));
        expect(horse.condition.injury).toBeNull();
      }
    }
    expect(extras).toBeGreaterThan(260);
    expect(extras).toBeLessThan(340);
  });

  it.each([1, 25, 49])('실내 마장 3: %i주 호흡기 감염 가중치 0.55배, AI·다른 부상은 동일', (week) => {
    const state = fixture('indoor_school', 3);
    state.date.week = week;
    const base = injuryWeights(3, { date: state.date });
    const actual = injuryWeights(3, context(state));
    expect(actual.respiratory / base.respiratory).toBeCloseTo(0.55);
    expect({ ...actual, respiratory: base.respiratory }).toEqual(base);
    expect(injuryWeights(3, context(state, false))).toEqual(base);
  });

  it.each([0, 3])('검사 설비 %i: 검사비·잔액 경계·원본 불변·자동 확진 최소 1주', (level) => {
    const state = fixture('vet_clinic', level);
    const horse = addHorse(state, 3, 'in_training');
    horse.condition.injury = { kind: 'tendon', weeksOut: 30, diagnosed: false, since: { ...state.date } };
    const cost = VET_EXAM_COST * (1 - 0.25 * level);
    state.owners[state.playerOwnerId]!.funds = cost - 1;
    expect(orderVetExam(state, horse.id)).toEqual({ ok: false, error: 'insufficient_funds' });
    state.owners[state.playerOwnerId]!.funds = cost;
    const before = structuredClone(state);
    const result = orderVetExam(state, horse.id);
    if (!result.ok) throw new Error(result.error);
    expect(state).toEqual(before);
    expect(result.state.owners[state.playerOwnerId]!.funds).toBe(0);
    expect(result.state.economy.playerLedger.at(-1)?.amount).toBe(-cost);
    const delay = Math.max(1, 3 - level);
    for (let i = 0; i <= delay; i++) {
      state.date.week = 1 + i;
      progressInjuryInPlace(horse, context(state));
      expect(horse.condition.injury?.diagnosed).toBe(i >= delay);
    }
  });

  it.each([false, true])('검사 설비 3: 발생 확률 0.85배, 기존 공용 RNG 소비 동일(출주 %s)', (racing) => {
    let prevented = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const state = fixture('vet_clinic', 3);
      state.initialSeed = seed;
      const horse = addHorse(state, 4, 'in_training');
      const base = structuredClone(horse);
      const raw = createRng(seed);
      const baseRaw = createRng(seed);
      const certain = (rng: Rng): Rng => ({ ...rng, chance: (p) => { rng.chance(p); return true; } });
      weeklyConditionInPlace(base, undefined, 4, racing, certain(baseRaw), { ...context(state), farm: undefined });
      const injury = weeklyConditionInPlace(horse, undefined, 4, racing, certain(raw), context(state));
      const expected = createRng(`${seed}:facility-injury-prevention:${horse.id}:2026:1:${racing ? 'race' : 'training'}`).chance(0.15);
      expect(injury === null).toBe(expected);
      expect(raw.getState()).toEqual(baseRaw.getState());
      if (injury === null) prevented++;
    }
    expect(prevented).toBeGreaterThan(110);
    expect(prevented).toBeLessThan(190);
  });

  it('L=0·목장 없음·AI는 기존 컨디션과 동일', () => {
    const state = fixture();
    for (const mode of ['zero', 'no_farm', 'ai'] as const) {
      state.farm.facilities = uniformFacilities(mode === 'zero' ? 0 : 3);
      state.farm.owned = mode !== 'no_farm';
      for (let seed = 0; seed < 100; seed++) {
        const horse = addHorse(state, 3, 'in_training');
        const base = structuredClone(horse);
        const rng = createRng(seed);
        const baseRng = createRng(seed);
        const ctx = context(state, mode !== 'ai');
        expect(weeklyConditionInPlace(horse, undefined, 3, true, rng, ctx))
          .toEqual(weeklyConditionInPlace(base, undefined, 3, true, baseRng, { ...ctx, farm: undefined }));
        expect(horse).toEqual(base);
        expect(rng.getState()).toEqual(baseRng.getState());
      }
    }
  });

  it('육성 시설 3: 처음 조교 시작 시 fitness +30, 상한·재배정 중복 방지', () => {
    const people = data.getPeopleData();
    const boot = bootstrapGame(OPTIONS, { ...people, courses: [], templates: [], series: [],
      nicks: data.getNicks(), naming: data.getNamingData(), stallionNames: data.getStallionNames(),
      stallionRecords: data.getStallionRecords() });
    for (const level of [0, 3]) {
      for (const fitness of [40, 90]) {
        const state = fixture('yearling_complex', level);
        state.trainers = boot.trainers;
        const trainerId = Object.keys(state.trainers)[0]!;
        const horse = addHorse(state, 2);
        horse.condition.fitness = fitness;
        const result = assignTrainer(state, horse.id, trainerId);
        if (!result.ok) throw new Error(result.error);
        const expected = Math.min(100, fitness + level * 10);
        expect(result.state.horses[horse.id]?.condition.fitness).toBe(expected);
        expect(state.horses[horse.id]?.condition.fitness).toBe(fitness);
        const again = assignTrainer(result.state, horse.id, trainerId);
        if (!again.ok) throw new Error(again.error);
        expect(again.state.horses[horse.id]?.condition.fitness).toBe(expected);
      }
    }
  });

  it('산실 3: 실제 유산 판정 임계값 0.4배·AI 무보정, 공용 RNG 미사용', () => {
    let losses = 0;
    for (let seed = 0; seed < 3000; seed++) {
      for (const isPlayer of [true, false]) {
        const state = fixture('foaling_unit', 3);
        state.initialSeed = seed;
        const horse = addHorse(state, 10, 'broodmare');
        if (!isPlayer) horse.ownerId = null;
        state.mares[horse.id] = { horseId: horse.id, coveredBy: 'cloud-sire', coveredWeek: null,
          coveredFee: 1000, pregnant: true, dueWeek: 202701, foals: [], blackTypeProduce: 0 };
        const risk = (1 - (1 - MARE_LOSS_PER_PREGNANCY) ** (1 / GESTATION_WEEKS)) * (isPlayer ? 0.4 : 1);
        const expected = createRng(`${seed}:mare-loss:${horse.id}:2026:1`).chance(risk);
        runSystem(state, createBreedingHealthSystem());
        expect(state.mares[horse.id]!.pregnant).toBe(!expected);
        if (expected) losses++;
      }
    }
    expect(losses).toBeGreaterThan(0);
  });
});

it('시드 20261011 새 게임 52주: 시설 시스템 유무의 레이스·AI·공용 RNG 동일, 2회 전체 상태 재현', () => {
  const staticData = { ...data.getPeopleData(), courses: data.getRacecourses(),
    templates: data.getRaceTemplates(), series: data.getSeriesDefinitions(), nicks: data.getNicks(),
    naming: data.getNamingData(), stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords() };
  const initial = bootstrapGame(OPTIONS, staticData);
  // 시스템 등록 뒤(M4-E1 통합): 등록된 목록에서 facilities 를 뺀 것과 비교한다.
  const withFacilities = createGameSystems(staticData);
  expect(withFacilities.some((s) => s.id === 'facilities')).toBe(true);
  const systems = withFacilities.filter((s) => s.id !== 'facilities');
  const simulate = (pipeline: WeeklySystem[]) => {
    let state = structuredClone(initial);
    for (let i = 0; i < 52; i++) state = advanceWeek(state, pipeline).state;
    return state;
  };
  const baseline = simulate(systems);
  const actual = simulate(withFacilities);
  expect(actual.raceResults.length).toBeGreaterThan(0);
  expect(actual.raceResults).toEqual(baseline.raceResults);
  expect(actual.rng).toEqual(baseline.rng);
  expect(Object.values(actual.horses).filter((h) => h.ownerId !== actual.playerOwnerId))
    .toEqual(Object.values(baseline.horses).filter((h) => h.ownerId !== baseline.playerOwnerId));
  expect(actual).toEqual(simulate(withFacilities));
}, 180_000);
