import { describe, expect, it } from 'vitest';
import { createBreedingSystem } from '../../src/engine/breeding/season';
import { createContractsSystem } from '../../src/engine/economy/contracts';
import { createCostsSystem } from '../../src/engine/economy/costs';
import { createRelationsSystem } from '../../src/engine/economy/relations';
import { createSolvencySystem } from '../../src/engine/economy/solvency';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { MORTALITY_CHECK_WEEK } from '../../src/engine/config/mortality';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { growthSystem } from '../../src/engine/horse/growth';
import { makeNameRegistry } from '../../src/engine/naming/context';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameStaticData } from '../../src/engine/state/systems';
import { createPrivateTradeSystem } from '../../src/engine/sales/privateTrade';
import { createSalesSystem } from '../../src/engine/sales/system';
import { createRng } from '../../src/engine/rng';
import { createSeasonSystem } from '../../src/engine/season/system';
import { createMortalitySystem, annualDeathChance } from '../../src/engine/stud/mortality';
import { createStudBooksSystem } from '../../src/engine/stud/books';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import type { GameEvent, GameState, Horse, Mare, WeeklySystem } from '../../src/engine/types';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';
import { buildMarket, spawnRacingHorse } from '../../src/engine/world/population';
import { sortStallionRecords } from '../../src/engine/state/stallionHorses';

/**
 * M4-D9 종마·번식 암말 사망 검증.
 * 10년 진행(시드 20261011) 결과는 stdout 에 보고한다. 측정값 기준: 실명 종마 사망 두수 5~60, 사망 나이 중앙값 ≥ 18.
 */

/** 지표 출력. console.log 는 기본 리포터에서 숨겨지므로 stdout 에 직접 쓴다. */
function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

const BASE_SEED = 20261011;
const SIM_YEARS = 10;
const SIM_WEEKS = WEEKS_PER_YEAR * SIM_YEARS;
const SIM_TIMEOUT_MS = 1_800_000;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const DEATH_COUNT_MIN = 5;
const DEATH_COUNT_MAX = 60;
const DEATH_AGE_MEDIAN_MIN = 18;

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

/**
 * 기존 주 시스템 목록(state/systems.ts 의 createGameSystems 와 같은 순서)에 사망 시스템을 번식·종마 예약 뒤에 넣는다.
 * 시스템 등록은 Opus 가 하므로 테스트에서는 목록을 직접 구성한다.
 */
function systemsWithMortality(): WeeklySystem[] {
  return [
    calendarSystem,
    growthSystem,
    createBreedingSystem(STATIC_GAME),
    createStudBooksSystem(),
    createMortalitySystem(),
    createPopulationSystem(STATIC_GAME),
    createSeasonSystem(STATIC_GAME),
    createSalesSystem(STATIC_GAME),
    createPrivateTradeSystem(),
    createContractsSystem(),
    createCostsSystem(),
    createSolvencySystem(),
    createRelationsSystem(),
  ];
}

function bootState(seed: number): GameState {
  return bootstrapGame({
    seed,
    playerName: 'Test Owner',
    silks: SILKS,
  }, BOOT_DATA);
}

/** 실명 종마(realKey 있음)이면서 지금 종마 상태인 말 ID 목록(오름차순) */
function liveRealStallionIds(state: GameState): string[] {
  return Object.keys(state.stallions).sort().filter((id) => {
    const stallion = state.stallions[id];
    return stallion?.realKey != null && state.horses[id]?.status === 'stud';
  });
}

/** 말을 암말로 바꾸고 번식 레코드를 만든다(테스트 준비용) */
function makeMare(state: GameState, horseId: string, overrides: Partial<Mare>): void {
  const horse = state.horses[horseId] as Horse;
  horse.status = 'broodmare';
  horse.ownerId = state.playerOwnerId;
  horse.trainerId = null;
  state.mares[horseId] = {
    horseId,
    coveredBy: null,
    coveredWeek: null,
    pregnant: false,
    dueWeek: null,
    foals: [],
    blackTypeProduce: 0,
    ...overrides,
  };
  const owner = state.owners[state.playerOwnerId];
  if (owner !== undefined && !owner.horseIds.includes(horseId)) owner.horseIds.push(horseId);
}

describe('annualDeathChance', () => {
  it('나이별 연간 사망 확률 표를 따른다', () => {
    expect(annualDeathChance(10)).toBe(0.004);
    expect(annualDeathChance(16)).toBe(0.02);
    expect(annualDeathChance(22)).toBe(0.06);
    expect(annualDeathChance(26)).toBe(0.15);
    expect(annualDeathChance(30)).toBe(0.3);
  });
});

describe('사망 시스템 기본 동작', () => {
  it('판정 주가 아니면 아무 일도 없다', () => {
    const state = bootState(BASE_SEED);
    const before = structuredClone(state);
    const system = createMortalitySystem();
    const events = system.run(state, {
      date: { year: START_YEAR, week: MORTALITY_CHECK_WEEK - 1 },
      rng: createRng(1),
    });
    expect(events).toEqual([]);
    expect(state).toEqual(before);
  });

  it('같은 시드·같은 상태면 사망 결과가 같다', () => {
    const run = (): string => {
      const state = bootState(BASE_SEED);
      for (const id of liveRealStallionIds(state)) {
        const horse = state.horses[id] as Horse;
        horse.birthYear = START_YEAR - 30;
      }
      const system = createMortalitySystem();
      const events = system.run(state, {
        date: { year: START_YEAR, week: MORTALITY_CHECK_WEEK },
        rng: createRng(1),
      });
      return JSON.stringify({ events, dead: Object.values(state.horses).filter((h) => h.status === 'dead').map((h) => h.id) });
    };
    expect(run()).toBe(run());
  });
});

describe('종마 사망 정리와 환불', () => {
  it('사망한 종마의 미수태 교배·사전 예약을 지우고 종부료를 환불한다(장부 합 확인)', () => {
    const base = bootState(BASE_SEED);
    const stallionId = liveRealStallionIds(base)[0];
    if (stallionId === undefined) throw new Error('현역 실명 종마가 없다');
    const stallion = base.stallions[stallionId];
    const stallionHorse = base.horses[stallionId] as Horse;
    if (stallion === undefined) throw new Error('종마 레코드 없음');
    stallionHorse.ownerId = null;
    stallionHorse.birthYear = START_YEAR - 30;
    const fee = stallion.fee;

    const mareIds = Object.values(base.horses)
      .filter((h) => h.ownerId === base.playerOwnerId && h.id !== stallionId)
      .map((h) => h.id)
      .sort()
      .slice(0, 3);
    if (mareIds.length < 3) throw new Error('테스트용 플레이어 말이 부족하다');
    const [coveredId, bookedId, pregnantId] = mareIds as [string, string, string];
    makeMare(base, coveredId, { coveredBy: stallionId, coveredWeek: null });
    makeMare(base, bookedId, { bookedFor: { stallionId, season: START_YEAR + 1 } });
    makeMare(base, pregnantId, {
      coveredBy: stallionId,
      coveredWeek: null,
      pregnant: true,
      dueWeek: (START_YEAR + 1) * 100 + 10,
    });

    const system = createMortalitySystem();
    let state: GameState | null = null;
    for (let seed = 1; seed <= 500 && state === null; seed++) {
      const trial = structuredClone(base);
      trial.initialSeed = seed;
      system.run(trial, { date: { year: START_YEAR, week: MORTALITY_CHECK_WEEK }, rng: createRng(seed) });
      if (trial.horses[stallionId]?.status === 'dead') state = trial;
    }
    if (state === null) throw new Error('시드 500개 안에 종마 사망이 없다(확률 확인 필요)');

    expect(state.horses[stallionId]?.diedYear).toBe(START_YEAR);
    expect(state.horses[stallionId]?.trainerId).toBeNull();

    const covered = state.mares[coveredId] as Mare;
    expect(covered.coveredBy).toBeNull();
    expect(covered.coveredWeek).toBeNull();

    const booked = state.mares[bookedId] as Mare;
    expect(booked.bookedFor).toBeNull();

    // 임신 중인 암말은 종마 사망으로 유산하지 않는다(임신·교배 기록 유지, 환불 없음)
    const pregnant = state.mares[pregnantId] as Mare;
    expect(pregnant.pregnant).toBe(true);
    expect(pregnant.dueWeek).toBe((START_YEAR + 1) * 100 + 10);
    expect(pregnant.coveredBy).toBe(stallionId);

    const refunded = state.economy.playerLedger
      .filter((entry) => entry.category === 'stud_fee_paid' && (entry.horseId === coveredId || entry.horseId === bookedId || entry.horseId === pregnantId))
      .reduce((sum, entry) => sum + entry.amount, 0);
    expect(refunded).toBe(2 * fee);
    expect(state.owners[state.playerOwnerId]!.funds - base.owners[base.playerOwnerId]!.funds).toBe(2 * fee);
  }, SIM_TIMEOUT_MS);

  it('강제 사망 후 교배 연도가 사망 연도 뒤인 신규 말은 그 종마를 부로 받지 않는다', () => {
    const base = bootState(BASE_SEED);
    const stallionId = liveRealStallionIds(base)[0];
    if (stallionId === undefined) throw new Error('현역 실명 종마가 없다');
    const diedYear = START_YEAR;
    const spawnData = { stallionRecords: BOOT_DATA.stallionRecords, naming: BOOT_DATA.naming, stallionNames: BOOT_DATA.stallionNames };
    const records = sortStallionRecords(BOOT_DATA.stallionRecords);
    const spawnSires = (state: GameState, birthYear: number, label: string): string[] => {
      const market = buildMarket(state);
      const registry = makeNameRegistry(state);
      const rng = createRng(label);
      const sires: string[] = [];
      for (let i = 0; i < 80; i++) {
        const horse = spawnRacingHorse(state, spawnData, rng, market, registry, {
          country: 'GB',
          birthYear,
          currentYear: birthYear + 2,
          sex: 'female',
          gelded: false,
        }, records);
        sires.push(horse.sireId ?? '');
      }
      return sires;
    };

    // 대조: 살아 있을 때는 교배 연도 사망 다음 해의 망아지에도 이 종마가 부로 뽑힐 수 있어야 한다
    const alive = structuredClone(base);
    expect(spawnSires(alive, diedYear + 2, 'mortality-sire-control')).toContain(stallionId);

    const dead = structuredClone(base);
    const deadHorse = dead.horses[stallionId] as Horse;
    deadHorse.status = 'dead';
    deadHorse.diedYear = diedYear;
    deadHorse.trainerId = null;
    expect(spawnSires(dead, diedYear + 2, 'mortality-sire-check')).not.toContain(stallionId);
  }, SIM_TIMEOUT_MS);
});

describe('10년 진행 시뮬레이션(시드 20261011)', () => {
  // 약 300초 걸린다 — 평소 npm test 에서는 빼고 VERIFY=1 일 때만 돈다(tests/verify 관례)
  it.skipIf(!process.env.VERIFY)('실명 종마 사망 두수와 사망 나이 중앙값이 기준을 만족한다', () => {
    let state = bootState(BASE_SEED);
    const systems = systemsWithMortality();
    const events: GameEvent[] = [];
    const weeks = SIM_WEEKS;
    for (let w = 0; w < weeks; w++) {
      const result = advanceWeek(state, systems);
      state = result.state;
      events.push(...result.events.filter((e) => e.type === 'horse_died'));
    }

    const deadReal = Object.keys(state.horses).sort().filter((id) => {
      const horse = state.horses[id];
      return horse?.status === 'dead' && state.stallions[id]?.realKey != null;
    });
    const ages = deadReal
      .map((id) => {
        const horse = state.horses[id] as Horse;
        return (horse.diedYear ?? 0) - horse.birthYear;
      })
      .sort((a, b) => a - b);
    const mid = Math.floor(ages.length / 2);
    const median = ages.length === 0 ? 0
      : ages.length % 2 === 1 ? (ages[mid] ?? 0)
        : Math.floor(((ages[mid - 1] ?? 0) + (ages[mid] ?? 0)) / 2);

    say(`[M4-D9] 시드 ${BASE_SEED}, ${SIM_YEARS}년 진행: 실명 종마 사망 ${deadReal.length}두, 사망 나이 중앙값 ${median}세`);
    say(`[M4-D9] 사망 나이 목록: ${ages.join(', ')}`);
    say(`[M4-D9] 사망 이벤트(플레이어·실명 종마) 총 ${events.length}건`);

    expect(deadReal.length).toBeGreaterThanOrEqual(DEATH_COUNT_MIN);
    expect(deadReal.length).toBeLessThanOrEqual(DEATH_COUNT_MAX);
    expect(median).toBeGreaterThanOrEqual(DEATH_AGE_MEDIAN_MIN);
  }, SIM_TIMEOUT_MS);
});
