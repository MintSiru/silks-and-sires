import { describe, expect, it } from 'vitest';
import { bookCovering, createBreedingSystem } from '../../src/engine/breeding/season';
import { GESTATION_WEEKS } from '../../src/engine/config/breedingSeason';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import * as healthConfig from '../../src/engine/config/health';
import { MORTALITY_CHECK_WEEK } from '../../src/engine/config/mortality';
import {
  getNamingData, getNicks, getPeopleData, getRacecourses, getRaceTemplates,
  getSeriesDefinitions, getStallionNames, getStallionRecords,
} from '../../src/engine/data/staticData';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { createSeasonSystem } from '../../src/engine/season/system';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { annualLaminitisChance, createBreedingHealthSystem } from '../../src/engine/stud/health';
import { createMortalitySystem } from '../../src/engine/stud/mortality';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import type { GameDate, GameEvent, GameState, Horse, WeeklySystem } from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const LONG_TIMEOUT = 1_800_000;
const HEALTH = createBreedingHealthSystem();
const YEAR_DATE = { year: START_YEAR, week: MORTALITY_CHECK_WEEK };
const TEMPLATE = generateHorse(createRng('health-fixture'), {
  id: 'template', name: 'Cloud Lantern', sex: 'female', birthYear: START_YEAR - 10,
  currentYear: START_YEAR, countryOfBirth: 'GB', status: 'broodmare', level: 60,
});
const DATA: GameStaticData = {
  nicks: getNicks(), naming: getNamingData(), stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(), courses: getRacecourses(),
  templates: getRaceTemplates(), series: getSeriesDefinitions(),
};

function emptyState(): GameState {
  return createNewGame({ seed: SEED, playerName: 'Cloud Keeper', silks: SILKS });
}

function boot(): GameState {
  return bootstrapGame({ seed: SEED, playerName: 'Cloud Keeper', silks: SILKS }, {
    ...DATA, ...getPeopleData(),
  });
}

function addHorse(state: GameState, id: string, status: 'stud' | 'broodmare', age = 10): Horse {
  const horse: Horse = {
    ...structuredClone(TEMPLATE), id, name: id, birthYear: START_YEAR - age,
    sex: status === 'stud' ? 'male' : 'female', status, ownerId: state.playerOwnerId,
  };
  state.horses[id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(id);
  if (status === 'stud') {
    state.stallions[id] = {
      horseId: id, realKey: null, sireLineId: 'test-line', fee: 1000, bookLimit: 100,
      bookedThisSeason: 0, bookingSeason: START_YEAR, aiBooked: 0, aiDemand: 0,
      fertility: 0.9, popularity: 50, standsIn: 'GB', firstSeasonYear: START_YEAR - 5,
    };
  } else {
    state.mares[id] = {
      horseId: id, coveredBy: null, coveredWeek: null, coveredFee: null,
      pregnant: false, dueWeek: null, foals: [], blackTypeProduce: 0,
    };
  }
  return horse;
}

function run(state: GameState, date: GameDate = YEAR_DATE): GameEvent[] {
  // 공용 난수를 읽기만 해도 즉시 실패한다.
  const rng = new Proxy(createRng(1), { get() { throw new Error('공용 난수 사용 금지'); } });
  return HEALTH.run(state, { date, rng });
}

type AilmentEvent = Extract<GameEvent, { type: 'stud_ailment' }>;

/** 확률 판정 자체를 모킹하지 않고 원하는 분기가 나오는 고정 시드를 찾는다. */
function findCase(status: 'stud' | 'broodmare', ailment: AilmentEvent['ailment'], outcome: AilmentEvent['outcome']): GameState {
  const state = emptyState();
  addHorse(state, 'target', status, 20);
  for (let seed = 1; seed < 20_000; seed++) {
    state.initialSeed = seed;
    const trial = structuredClone(state);
    if (run(trial).some((e) => e.type === 'stud_ailment' && e.ailment === ailment && e.outcome === outcome)) {
      return state;
    }
  }
  throw new Error(`분기 시드 없음: ${status}/${ailment}/${outcome}`);
}

describe('임신 전체 유산 확률', () => {
  it('1만 임신을 48주 관측하면 6% ±1%p이고 18세 이상은 약 1.5배다', () => {
    const rates: number[] = [];
    for (const age of [17, 18]) {
      const state = emptyState();
      // 시설 없는 기존 임신 위험을 검증한다. 기본 산실 1단계는 M4-E1부터 위험을 줄인다.
      state.farm.facilities.foaling_unit = 0;
      const count = 10_000;
      for (let i = 0; i < count; i++) {
        const id = `mare-${i}`;
        // 표본은 능력치를 바꾸지 않으므로 큰 중첩 필드 복제 없이 독립 번식 레코드만 만든다.
        state.horses[id] = { ...TEMPLATE, id, status: 'broodmare', birthYear: START_YEAR - age, ownerId: state.playerOwnerId };
        state.mares[id] = {
          horseId: id, pregnant: true, dueWeek: (START_YEAR + 1) * 100 + 20,
          coveredBy: 'sire', coveredFee: 1000, coveredWeek: null, foals: [], blackTypeProduce: 0,
        };
      }
      // 30주 연간 질환과 분리해 임신 48회의 순수 유산 위험을 측정한다.
      const weeks = Array.from({ length: WEEKS_PER_YEAR }, (_, i) => i + 1)
        .filter((week) => week !== MORTALITY_CHECK_WEEK).slice(0, GESTATION_WEEKS);
      let losses = 0;
      for (const week of weeks) losses += run(state, { year: START_YEAR, week }).length;
      const rate = losses / count;
      rates.push(rate);
      expect(rate).toBeGreaterThan(age === 17 ? 0.05 : 0.08);
      expect(rate).toBeLessThan(age === 17 ? 0.07 : 0.10);
      console.info(`[M4-H3 유산] ${age}세 ${losses}/${count} = ${(rate * 100).toFixed(2)}%`);
    }
    expect(rates[1]! / rates[0]!).toBeGreaterThan(1.3);
    expect(rates[1]! / rates[0]!).toBeLessThan(1.7);
  }, 60_000);

  it('유산은 임신·종부 기록을 비우고 환불 없이 출산을 막으며 다음 시즌 교배를 허용한다', () => {
    const state = emptyState();
    addHorse(state, 'sire', 'stud');
    addHorse(state, 'mare', 'broodmare');
    const mare = state.mares.mare!;
    Object.assign(mare, { pregnant: true, dueWeek: START_YEAR * 100 + 25, coveredBy: 'sire', coveredFee: 1000, coveredWeek: START_YEAR * 100 + 1 });
    const funds = state.owners[state.playerOwnerId]!.funds;
    let events: GameEvent[] = [];
    for (let seed = 1; seed < 20_000 && mare.pregnant; seed++) {
      state.initialSeed = seed;
      events = run(state, { year: START_YEAR, week: 20 });
    }
    expect(events).toEqual([{ type: 'mare_lost_foal', mareId: 'mare', date: { year: START_YEAR, week: 20 } }]);
    for (const key of ['dueWeek', 'coveredBy', 'coveredFee', 'coveredWeek'] as const) expect(mare[key]).toBeNull();
    const breeding = createBreedingSystem(DATA);
    for (let week = 21; week <= WEEKS_PER_YEAR; week++) {
      state.date = { year: START_YEAR, week };
      expect(breeding.run(state, { date: state.date, rng: createRng(week) })).not.toContainEqual(expect.objectContaining({ type: 'foal_born' }));
    }
    expect(mare.foals).toEqual([]);
    expect(state.owners[state.playerOwnerId]!.funds).toBe(funds);
    expect(state.economy.playerLedger).toEqual([]);
    state.date = { year: START_YEAR + 1, week: 10 };
    expect(bookCovering(state, state.playerOwnerId, 'mare', 'sire').ok).toBe(true);
  });
});

describe('제엽염·산통 연간 표본', () => {
  it('연령 경계와 결과 비율 상수의 합이 명세와 일치한다', () => {
    expect([14, 15, 19, 20].map(annualLaminitisChance)).toEqual([0.005, 0.015, 0.015, 0.03]);
    expect(healthConfig.LAMINITIS_RECOVERY_SHARE + healthConfig.LAMINITIS_RETIREMENT_SHARE + healthConfig.LAMINITIS_DEATH_SHARE).toBe(1);
    expect(healthConfig.COLIC_RECOVERY_SHARE + healthConfig.COLIC_DEATH_SHARE).toBe(1);
  });

  it('연령별 10만 두의 발생률과 회복·은퇴·사망 비율이 상수 근처다', () => {
    for (const age of [14, 15, 20]) {
      const state = emptyState();
      const count = 100_000;
      for (let i = 0; i < count; i++) {
        const id = `stock-${i}`;
        state.horses[id] = { ...TEMPLATE, id, birthYear: START_YEAR - age, ownerId: state.playerOwnerId };
      }
      const events = run(state).filter((e): e is AilmentEvent => e.type === 'stud_ailment');
      const laminitis = events.filter((e) => e.ailment === 'laminitis');
      // 제엽염 사망·은퇴로 퇴역한 개체는 같은 주 산통 대상에서 제외한다.
      const colicEligible = count - laminitis.filter((e) => e.outcome !== 'recovered').length;
      for (const ailment of ['laminitis', 'colic'] as const) {
        const cases = events.filter((e) => e.ailment === ailment);
        const denominator = ailment === 'laminitis' ? count : colicEligible;
        const target = ailment === 'laminitis' ? annualLaminitisChance(age) : healthConfig.COLIC_ANNUAL_CHANCE;
        expect(Math.abs(cases.length / denominator - target)).toBeLessThan(0.002);
        const shares = ['recovered', 'retired', 'died'].map((outcome) => cases.filter((e) => e.outcome === outcome).length / cases.length);
        const expected = ailment === 'laminitis' ? [0.5, 0.3, 0.2] : [0.85, 0, 0.15];
        for (let i = 0; i < shares.length; i++) expect(Math.abs(shares[i]! - expected[i]!)).toBeLessThan(0.06);
        console.info(`[M4-H3 질환] ${age}세 ${ailment}: ${cases.length}/${denominator} (${(cases.length / denominator * 100).toFixed(3)}%), 회복/은퇴/사망 ${shares.map((s) => (s * 100).toFixed(2)).join('/')}%`);
      }
    }
  }, 60_000);
});

describe('질환 결과·예약 정리·이벤트', () => {
  it.each(['retired', 'died'] as const)('종마 %s: 마지막 시즌·예약 정리·실제 납부액 환불, 임신 보존', (outcome) => {
    const state = findCase('stud', 'laminitis', outcome);
    const horse = state.horses.target!;
    const owner = state.owners[state.playerOwnerId]!;
    owner.horseIds = owner.horseIds.filter((id) => id !== 'target');
    state.owners['stud-owner'] = { ...owner, id: 'stud-owner', isPlayer: false, horseIds: ['target'] };
    horse.ownerId = 'stud-owner';
    state.stallions.target!.realKey = 'test-stallion';
    for (const id of ['covered', 'booked', 'pregnant']) addHorse(state, id, 'broodmare');
    Object.assign(state.mares.covered!, { coveredBy: 'target', coveredFee: 300, coveredWeek: START_YEAR * 100 + 10 });
    state.mares.booked!.bookedFor = { stallionId: 'target', season: START_YEAR + 1, feePaid: 0 };
    Object.assign(state.mares.pregnant!, { pregnant: true, coveredBy: 'target', coveredFee: 400, dueWeek: (START_YEAR + 1) * 100 + 10 });
    const funds = state.owners[state.playerOwnerId]!.funds;
    const events = run(state);
    expect(horse.status).toBe(outcome === 'died' ? 'dead' : 'retired');
    expect(state.stallions.target!.lastSeasonYear).toBe(START_YEAR);
    expect(state.mares.covered).toMatchObject({ coveredBy: null, coveredFee: null, coveredWeek: null });
    expect(state.mares.booked!.bookedFor).toBeNull();
    expect(state.mares.pregnant).toMatchObject({ pregnant: true, coveredBy: 'target', coveredFee: 400 });
    expect(state.owners[state.playerOwnerId]!.funds - funds).toBe(300);
    expect(state.economy.playerLedger.filter((e) => e.horseId === 'covered').map((e) => e.amount)).toEqual([300]);
    expect(state.owners[state.playerOwnerId]!.horseIds).not.toContain('target');
    expect(state.owners['stud-owner']!.horseIds).not.toContain('target');
    expect(events).toContainEqual({ type: 'stud_ailment', horseId: 'target', ailment: 'laminitis', outcome, date: YEAR_DATE });
    if (outcome === 'died') {
      expect(horse.diedYear).toBe(START_YEAR);
      expect(events).toContainEqual({ type: 'horse_died', horseId: 'target', cause: 'illness', date: YEAR_DATE });
    } else {
      expect(events).toContainEqual({ type: 'horse_status_changed', horseId: 'target', from: 'stud', to: 'retired', date: YEAR_DATE });
      expect(events).toContainEqual({ type: 'stallion_pensioned', stallionId: 'target', reason: 'age', date: YEAR_DATE });
    }
  });

  it.each(['retired', 'died'] as const)('암말 %s: 임신·예약 정리와 소유 목록 제거', (outcome) => {
    const state = findCase('broodmare', 'laminitis', outcome);
    addHorse(state, 'sire', 'stud').ownerId = null;
    const mare = state.mares.target!;
    Object.assign(mare, { pregnant: true, coveredBy: 'sire', coveredFee: 500, dueWeek: (START_YEAR + 1) * 100 + 10,
      bookedFor: { stallionId: 'sire', season: START_YEAR + 1, feePaid: 200 } });
    const funds = state.owners[state.playerOwnerId]!.funds;
    const events = run(state);
    expect(mare).toMatchObject({ pregnant: false, dueWeek: null, coveredBy: null, coveredFee: null, coveredWeek: null, bookedFor: null });
    expect(state.owners[state.playerOwnerId]!.funds - funds).toBe(200);
    expect(state.horses.target!.ownerId).toBe(state.playerOwnerId);
    expect(state.owners[state.playerOwnerId]!.horseIds).not.toContain('target');
    expect(events.some((e) => e.type === 'stallion_pensioned' && e.stallionId === 'target')).toBe(false);
  });

  it.each([0.9, 0.02])('제엽염 회복 종마 수태율 %s에서 0.05 감소, 하한 0', (fertility) => {
    const state = findCase('stud', 'laminitis', 'recovered');
    state.stallions.target!.fertility = fertility;
    run(state);
    expect(state.stallions.target!.fertility).toBeCloseTo(Math.max(0, fertility - 0.05));
    expect(state.horses.target!.status).toBe('stud');
  });

  it.each(['recovered', 'died'] as const)('산통 %s도 실제 상태와 이벤트에 반영한다', (outcome) => {
    const state = findCase('stud', 'colic', outcome);
    const events = run(state);
    expect(state.horses.target!.status).toBe(outcome === 'died' ? 'dead' : 'stud');
    expect(events).toContainEqual({ type: 'stud_ailment', horseId: 'target', ailment: 'colic', outcome, date: YEAR_DATE });
    expect(events.some((e) => e.type === 'horse_died')).toBe(outcome === 'died');
  });

  it('AI 가상 말은 조용히 처리하고 실명 종마는 사건을 알린다', () => {
    const base = findCase('stud', 'laminitis', 'died');
    base.horses.target!.ownerId = null;
    const silent = structuredClone(base);
    expect(run(silent)).toEqual([]);
    expect(silent.horses.target!.status).toBe('dead');
    base.stallions.target!.realKey = 'test-stallion';
    expect(run(base).map((e) => e.type)).toEqual(['stud_ailment', 'horse_died']);
  });

  it('AI 암말의 유산은 이벤트·환불 없이 처리한다', () => {
    const state = emptyState();
    addHorse(state, 'mare', 'broodmare').ownerId = null;
    const mare = state.mares.mare!;
    Object.assign(mare, { pregnant: true, dueWeek: (START_YEAR + 1) * 100 + 10, coveredBy: 'sire', coveredFee: 200 });
    for (let seed = 1; seed < 20_000 && mare.pregnant; seed++) {
      state.initialSeed = seed;
      expect(run(state, { year: START_YEAR, week: 20 })).toEqual([]);
    }
    expect(mare.pregnant).toBe(false);
    expect(state.economy.playerLedger).toEqual([]);
  });

  it('판정 주 밖의 비임신 말과 mortality에서 이미 죽은 말은 건너뛴다', () => {
    const state = findCase('stud', 'laminitis', 'died');
    const before = structuredClone(state);
    expect(run(state, { year: START_YEAR, week: MORTALITY_CHECK_WEEK - 1 })).toEqual([]);
    expect(state).toEqual(before);
    for (let seed = 1; seed < 10_000; seed++) {
      state.initialSeed = seed;
      const trial = structuredClone(state);
      const events = createMortalitySystem().run(trial, { date: YEAR_DATE, rng: createRng(1) });
      if (events.some((e) => e.type === 'horse_died')) {
        const dead = structuredClone(trial);
        expect(run(trial)).toEqual([]);
        expect(trial).toEqual(dead);
        return;
      }
    }
    throw new Error('mortality 사망 시드 없음');
  });
});

describe('독립 난수·재현성·장기 검증', () => {
  it('같은 시드 2회 동일하고 말 순서와 무관하다', () => {
    const base = findCase('stud', 'laminitis', 'died');
    addHorse(base, 'other', 'broodmare');
    base.mares.other!.pregnant = true;
    const a = structuredClone(base);
    const b = structuredClone(base);
    b.horses = Object.fromEntries(Object.entries(b.horses).reverse());
    b.mares = Object.fromEntries(Object.entries(b.mares).reverse());
    expect(run(a)).toEqual(run(b));
    expect(a).toEqual(b);
  });

  it('52주 실제 시즌에서 건강 시스템 유무에 관계없이 레이스 결과·공용 난수가 같다', () => {
    const initial = boot();
    const systems = [calendarSystem, createMortalitySystem(), createSeasonSystem(DATA)];
    const withHealth = [...systems.slice(0, 2), createBreedingHealthSystem(), systems[2]!];
    const simulate = (pipeline: WeeklySystem[]) => {
      let state = structuredClone(initial);
      for (let week = 0; week < WEEKS_PER_YEAR; week++) state = advanceWeek(state, pipeline).state;
      return state;
    };
    const baseline = simulate(systems);
    const actual = simulate(withHealth);
    expect(actual.raceResults.length).toBeGreaterThan(0);
    expect(actual.raceResults).toEqual(baseline.raceResults);
    expect(actual.rng).toEqual(baseline.rng);
  }, LONG_TIMEOUT);

  it.skipIf(!process.env.VERIFY)('시드 20261011 새 게임 10년의 연평균 사건 수를 보고한다', () => {
    let state = boot();
    const systems = createGameSystems(DATA);
    const mortalityIndex = systems.findIndex((s) => s.id === 'mortality');
    expect(mortalityIndex).toBeGreaterThanOrEqual(0);
    systems.splice(mortalityIndex + 1, 0, createBreedingHealthSystem());
    const counts = { losses: 0, laminitis: 0, colic: 0, deaths: 0, illnessDeaths: 0 };
    let completed = 0;
    for (let week = 0; week < 10 * WEEKS_PER_YEAR; week++) {
      const result = advanceWeek(state, systems);
      expect(result.state.date).not.toEqual(state.date);
      state = result.state;
      completed++;
      for (const event of result.events) {
        if (event.type === 'mare_lost_foal') counts.losses++;
        if (event.type === 'stud_ailment') counts[event.ailment]++;
        if (event.type === 'horse_died') {
          counts.deaths++;
          if (event.cause === 'illness') counts.illnessDeaths++;
        }
      }
    }
    expect(completed).toBe(520);
    expect(state.date).toEqual({ year: START_YEAR + 10, week: 1 });
    console.info(`[M4-H3 10년] 시드 ${SEED}, 플레이어 암말 유산·플레이어/실명 종마 질환·사망 이벤트 집계(무개입): ${JSON.stringify(counts)}, 연평균 ${JSON.stringify(Object.fromEntries(Object.entries(counts).map(([key, n]) => [key, n / 10])))}`);
  }, LONG_TIMEOUT);
});
