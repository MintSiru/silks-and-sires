import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { loadRacecourses } from '../../src/engine/course/load';
import {
  chargeRaceCosts,
  entryFeeFor,
  farmScaleSurcharge,
  transportFeeBetween,
  weeklyCosts,
} from '../../src/engine/economy/costs';
import { FARM_UPKEEP } from '../../src/engine/config/economy';
import { SAVE_SCHEMA_VERSION } from '../../src/engine/config/game';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { weeksBetween } from '../../src/engine/time/calendar';
import type {
  CountryCode,
  Declaration,
  GameDate,
  GameState,
  Horse,
  HorseStatus,
  Race,
  RaceTemplate,
  Racecourse,
  SeriesDefinition,
  TrainerId,
  OwnerId,
} from '../../src/engine/types';

const SEED = 20261012;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const DATE: GameDate = { year: START_YEAR, week: 10 };
/** 무거운 진행 테스트용 제한 시간(ms) */
const MID_TIMEOUT = 120_000;
const SHORT_WEEKS = 8;
const YEAR_WEEKS = 53;
const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const POINTS_ID = 'test-points';
const POINTS_BONUS = 50_000;

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);

function layoutOf(courseId: string, distance: number): string {
  const course = COURSES.find((c) => c.id === courseId);
  const cd = course?.distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`fixture 에 ${courseId} ${distance}m 없음`);
  return cd.layoutId;
}

/** 테스트용 G1 템플릿(가상 이름) */
function g1Template(id: string, courseId: string, distance: number, schedule: RaceTemplate['schedule'], name: string): RaceTemplate {
  return {
    id,
    name,
    racecourseId: courseId,
    distance,
    layoutId: layoutOf(courseId, distance),
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
      baseWeightLb: 126,
    },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
    schedule,
    cardOrder: 1,
    tags: ['classic'],
  };
}

const TEMPLATES: RaceTemplate[] = [
  g1Template(G1_A_ID, 'ashcombe', 2012, { month: 4, weekOfMonth: 2 }, 'Test Group One Ashcombe'),
  g1Template(G1_B_ID, 'saint_ourens', 2000, { month: 6, weekOfMonth: 1 }, 'Test Group One Saint'),
];

const SEASON_SERIES: SeriesDefinition[] = [
  {
    id: POINTS_ID,
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: POINTS_BONUS,
  },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SEASON_SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SEASON_SERIES,
};

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, MID_TIMEOUT);

/** 정렬된 AI 마주 ID */
function aiOwnerIds(state: GameState): OwnerId[] {
  return Object.keys(state.owners).sort().filter((id) => id !== state.playerOwnerId);
}

/** 말 한 두(템플릿 말을 복제해 상태·주인·조교사만 바꾼다) */
function makeHorse(template: Horse, id: string, ownerId: OwnerId, status: HorseStatus, trainerId: TrainerId | null): Horse {
  return { ...structuredClone(template), id, ownerId, status, trainerId, breederId: null };
}

/** 말 목록을 통제한 빈 상태: 말은 주어진 것만 남기고 마주·조교사는 BASE 그대로 */
function stateWithHorses(owner: OwnerId, specs: { id: string; status: HorseStatus; trainerId: TrainerId | null }[]): GameState {
  const draft = structuredClone(BASE);
  const template = Object.values(BASE.horses)[0];
  if (template === undefined) throw new Error('테스트 전제 위반: 말이 없다');
  draft.horses = {};
  for (const s of specs) {
    draft.horses[s.id] = makeHorse(template, s.id, owner, s.status, s.trainerId);
  }
  return draft;
}

/** 말 n두(전부 broodmare, 조교사 없음) 를 가진 AI 마주 상태 */
function broodmares(n: number): { draft: GameState; owner: OwnerId } {
  const owner = aiOwnerIds(BASE)[0];
  if (owner === undefined) throw new Error('테스트 전제 위반: AI 마주가 없다');
  const specs = Array.from({ length: n }, (_, i) => ({
    id: `h-bm-${String(i + 1).padStart(3, '0')}`,
    status: 'broodmare' as const,
    trainerId: null,
  }));
  return { draft: stateWithHorses(owner, specs), owner };
}

function fundsOf(state: GameState, owner: OwnerId): number {
  return state.owners[owner]?.funds ?? 0;
}

function aiTotal(state: GameState, category: 'training_fee' | 'farm_upkeep' | 'entry_fee' | 'transport' | 'prize'): number {
  return state.economy.currentYear.aiTotals[category] ?? 0;
}

function raceWith(prizeMoney: number[]): Race {
  return {
    id: 'costs-race',
    name: 'Synthetic Costs Stakes',
    racecourseId: 'saint_ourens',
    distance: 2000,
    layoutId: layoutOf('saint_ourens', 2000),
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'level',
      baseWeightLb: 126,
    },
    prizeMoney,
    maxRunners: 14,
  };
}

function declarationOf(horseId: string, ownerId: OwnerId, trainerId: TrainerId | null, isPlayer: boolean): Declaration {
  return { horseId, ownerId, trainerId, jockeyId: null, weightLb: null, isPlayer };
}

describe('주간 정기 비용 (M4-A2b): 조교료', () => {
  it('1. 현역마 2두(in_training·resting)를 가진 AI 마주는 한 주에 조교사 weeklyFee 합만큼 줄고 training_fee 로 기록된다', () => {
    const owner = aiOwnerIds(BASE)[0];
    if (owner === undefined) throw new Error('AI 마주가 없다');
    const [tA, tB] = Object.keys(BASE.trainers).sort();
    if (tA === undefined || tB === undefined) throw new Error('조교사가 부족하다');
    const feeA = BASE.trainers[tA]?.weeklyFee ?? 0;
    const feeB = BASE.trainers[tB]?.weeklyFee ?? 0;
    const draft = stateWithHorses(owner, [
      { id: 'h-t1', status: 'in_training', trainerId: tA },
      { id: 'h-t2', status: 'resting', trainerId: tB },
      { id: 'h-foal', status: 'foal', trainerId: tA }, // 조교 대상 아님(조교료 없음). 목장 유지비만 낸다
    ]);
    const fundsBefore = fundsOf(draft, owner);
    const totalBefore = aiTotal(draft, 'training_fee');

    weeklyCosts(draft, DATE);

    expect(fundsOf(draft, owner)).toBe(fundsBefore - feeA - feeB - (FARM_UPKEEP.foal ?? 0));
    expect(aiTotal(draft, 'training_fee') - totalBefore).toBe(-(feeA + feeB));
  });

  it('2. 플레이어 마주의 조교료는 장부 항목으로 말마다(horseId 포함) 남는다', () => {
    const owner = BASE.playerOwnerId;
    const [tA, tB] = Object.keys(BASE.trainers).sort();
    if (tA === undefined || tB === undefined) throw new Error('조교사가 부족하다');
    const feeA = BASE.trainers[tA]?.weeklyFee ?? 0;
    const feeB = BASE.trainers[tB]?.weeklyFee ?? 0;
    const draft = stateWithHorses(owner, [
      { id: 'h-p2', status: 'in_training', trainerId: tB },
      { id: 'h-p1', status: 'in_training', trainerId: tA },
    ]);
    const ledgerBefore = draft.economy.playerLedger.length;

    weeklyCosts(draft, DATE);

    // 말 ID 오름차순(h-p1 → h-p2)
    expect(draft.economy.playerLedger.slice(ledgerBefore)).toEqual([
      { date: DATE, category: 'training_fee', amount: -feeA, horseId: 'h-p1' },
      { date: DATE, category: 'training_fee', amount: -feeB, horseId: 'h-p2' },
    ]);
  });
});

describe('주간 정기 비용 (M4-A2b): 목장 유지비', () => {
  it('3. 상태별 두당 주간 비용: broodmare 200 · foal 60 · weanling 100 · yearling 120 · stud 350 · retired 40 (두수 6 → 체증 없음)', () => {
    const owner = aiOwnerIds(BASE)[0];
    if (owner === undefined) throw new Error('AI 마주가 없다');
    const draft = stateWithHorses(owner, [
      { id: 'h-f1', status: 'broodmare', trainerId: null },
      { id: 'h-f2', status: 'foal', trainerId: null },
      { id: 'h-f3', status: 'weanling', trainerId: null },
      { id: 'h-f4', status: 'yearling', trainerId: null },
      { id: 'h-f5', status: 'stud', trainerId: null },
      { id: 'h-f6', status: 'retired', trainerId: null },
      { id: 'h-x1', status: 'dead', trainerId: null }, // 목장 두수·비용에서 제외
    ]);
    const fundsBefore = fundsOf(draft, owner);
    const farmBefore = aiTotal(draft, 'farm_upkeep');

    weeklyCosts(draft, DATE);

    expect(fundsOf(draft, owner)).toBe(fundsBefore - (200 + 60 + 100 + 120 + 350 + 40));
    expect(aiTotal(draft, 'farm_upkeep') - farmBefore).toBe(-870);
  });

  it('4. 두수 체증: 12두까지는 가산 없음, 13두 → +1%, 62두 → +50%(상한), 100두도 상한 +50%', () => {
    expect(farmScaleSurcharge(12)).toBe(0);
    expect(farmScaleSurcharge(13)).toBeCloseTo(0.01, 10);
    expect(farmScaleSurcharge(62)).toBeCloseTo(0.5, 10);
    expect(farmScaleSurcharge(100)).toBe(0.5);

    const cases: { heads: number; expected: number }[] = [
      { heads: 12, expected: 12 * 200 },
      { heads: 13, expected: Math.round(13 * 200 * 1.01) },
      { heads: 62, expected: Math.round(62 * 200 * 1.5) },
      { heads: 100, expected: Math.round(100 * 200 * 1.5) },
    ];
    for (const c of cases) {
      const { draft, owner } = broodmares(c.heads);
      const fundsBefore = fundsOf(draft, owner);
      weeklyCosts(draft, DATE);
      expect(fundsBefore - fundsOf(draft, owner)).toBe(c.expected);
    }
  });

  it('5. 목장 유지비는 마주별 한 주 합계 한 항목(horseId null)으로 기록된다', () => {
    const owner = BASE.playerOwnerId;
    const draft = stateWithHorses(owner, [
      { id: 'h-m1', status: 'broodmare', trainerId: null },
      { id: 'h-m2', status: 'broodmare', trainerId: null },
    ]);
    const ledgerBefore = draft.economy.playerLedger.length;

    weeklyCosts(draft, DATE);

    expect(draft.economy.playerLedger.slice(ledgerBefore)).toEqual([
      { date: DATE, category: 'farm_upkeep', amount: -400, horseId: null },
    ]);
  });
});

describe('레이스 정기 비용 (M4-A2b): 등록료·운송비', () => {
  /** 플레이어 말 한 두를 주어진 조교사 나라로 세운 상태 */
  function racerWithTrainerIn(country: CountryCode): { draft: GameState; trainerId: TrainerId } {
    const trainerId = Object.keys(BASE.trainers).sort()[0];
    if (trainerId === undefined) throw new Error('조교사가 없다');
    const draft = stateWithHorses(BASE.playerOwnerId, [{ id: 'h-r', status: 'in_training', trainerId }]);
    const trainer = draft.trainers[trainerId];
    if (trainer === undefined) throw new Error('조교사 없음');
    trainer.country = country;
    return { draft, trainerId };
  }

  it('6. 국내 레이스(조교사 나라 = 경마장 나라): 등록료만 낸다(총상금 320000 × 1% = 3200)', () => {
    const { draft, trainerId } = racerWithTrainerIn('GB');
    const race = raceWith([200000, 70000, 35000, 15000]);
    const ledgerBefore = draft.economy.playerLedger.length;
    chargeRaceCosts(draft, race, 'GB', [declarationOf('h-r', draft.playerOwnerId, trainerId, true)], DATE);
    expect(draft.economy.playerLedger.slice(ledgerBefore)).toEqual([
      { date: DATE, category: 'entry_fee', amount: -3200, horseId: 'h-r' },
    ]);
  });

  it('7. IE 조교사 말이 GB 레이스 → 등록료 + 근거리 운송비(1500)', () => {
    const { draft, trainerId } = racerWithTrainerIn('IE');
    const race = raceWith([200000, 70000, 35000, 15000]);
    const ledgerBefore = draft.economy.playerLedger.length;
    chargeRaceCosts(draft, race, 'GB', [declarationOf('h-r', draft.playerOwnerId, trainerId, true)], DATE);
    expect(draft.economy.playerLedger.slice(ledgerBefore)).toEqual([
      { date: DATE, category: 'entry_fee', amount: -3200, horseId: 'h-r' },
      { date: DATE, category: 'transport', amount: -1500, horseId: 'h-r' },
    ]);
  });

  it('8. FR 조교사 말이 GB 레이스 → 등록료 + 원거리 운송비(3500)', () => {
    const { draft, trainerId } = racerWithTrainerIn('FR');
    const race = raceWith([200000, 70000, 35000, 15000]);
    const ledgerBefore = draft.economy.playerLedger.length;
    chargeRaceCosts(draft, race, 'GB', [declarationOf('h-r', draft.playerOwnerId, trainerId, true)], DATE);
    expect(draft.economy.playerLedger.slice(ledgerBefore)).toEqual([
      { date: DATE, category: 'entry_fee', amount: -3200, horseId: 'h-r' },
      { date: DATE, category: 'transport', amount: -3500, horseId: 'h-r' },
    ]);
  });

  it('9. 등록료 최소 40 · 운송비 표(영국↔아일랜드 근거리, 같은 나라 0, 그 밖 원거리)', () => {
    expect(entryFeeFor(raceWith([1000]))).toBe(40);
    expect(entryFeeFor(raceWith([200000, 70000]))).toBe(2700);
    expect(transportFeeBetween('GB', 'IE')).toBe(1500);
    expect(transportFeeBetween('IE', 'GB')).toBe(1500);
    expect(transportFeeBetween('GB', 'GB')).toBe(0);
    expect(transportFeeBetween('FR', 'GB')).toBe(3500);
    expect(transportFeeBetween('GB', 'FR')).toBe(3500);
  });
});

describe('저장 이주 v7 → v8 (M4-A2b)', () => {
  it('10. v7 저장본의 조교사 weeklyFee 는 facilityGrade × 180 으로 다시 계산되고, 현재 버전으로 올라간다', () => {
    const state = structuredClone(BASE);
    // v7 시절 값(등급 × 1500)으로 되돌려 저장한 것처럼 만든다
    for (const t of Object.values(state.trainers)) {
      t.weeklyFee = t.facilityGrade * 1500;
    }
    const envelope = JSON.parse(serializeGame(state, '2026-10-12T00:00:00.000Z')) as Record<string, unknown>;
    envelope.schemaVersion = 7;
    (envelope.state as Record<string, unknown>).schemaVersion = 7;

    const loaded = deserializeGame(JSON.stringify(envelope));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    const trainers = Object.values(loaded.state.trainers);
    expect(trainers.length).toBeGreaterThan(0);
    for (const t of trainers) {
      expect(t.weeklyFee).toBe(t.facilityGrade * 180);
    }
  });
});

describe('시스템 순서·재현성·저장 왕복 (M4-A2b)', () => {
  it('11. createGameSystems 에서 costs 는 season 뒤, solvency(M4-A3) 앞이고, relations(M4-B1)는 마지막이다', () => {
    const ids = createGameSystems(STATIC_GAME).map((s) => s.id);
    expect(ids[ids.length - 1]).toBe('relations');
    expect(ids[ids.length - 2]).toBe('solvency');
    expect(ids[ids.length - 3]).toBe('costs');
    expect(ids.indexOf('season')).toBeLessThan(ids.indexOf('costs'));
  });

  it('12. 같은 시드로 8주 진행을 두 번 하면 최종 state 가 toEqual 이다', () => {
    const run = (): GameState => {
      const systems = createGameSystems(STATIC_GAME);
      let state = BASE;
      for (let i = 0; i < SHORT_WEEKS; i++) state = advanceWeek(state, systems).state;
      return state;
    };
    expect(run()).toEqual(run());
  }, MID_TIMEOUT);

  it('13. 정기 비용 장부가 든 상태를 저장 → 불러오기 하면 같은 상태다', () => {
    const systems = createGameSystems(STATIC_GAME);
    let state = BASE;
    for (let i = 0; i < SHORT_WEEKS; i++) state = advanceWeek(state, systems).state;
    // AI 조교료가 실제로 장부에 들어갔는지(저장 왕복이 의미 있는 상태인지) 확인
    expect(aiTotal(state, 'training_fee')).toBeLessThan(0);

    const loaded = deserializeGame(serializeGame(state, '2026-10-12T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.state).toEqual(state);
  }, MID_TIMEOUT);
});

describe('참고 측정: 1시즌 정기 비용 합계 (단언 아님, 출력만)', () => {
  it('14. bootstrapGame 후 53주 진행: 플레이어·AI 종류별 합계와 AI 자금 중앙값(연초 → 연말)을 출력한다', () => {
    const aiFundsSorted = (s: GameState): number[] =>
      aiOwnerIds(s).map((id) => fundsOf(s, id)).sort((a, b) => a - b);
    const median = (xs: number[]): number => {
      const n = xs.length;
      if (n === 0) return 0;
      const mid = Math.floor(n / 2);
      if (n % 2 === 1) return xs[mid] ?? 0;
      return Math.floor(((xs[mid - 1] ?? 0) + (xs[mid] ?? 0)) / 2);
    };
    const startMedian = median(aiFundsSorted(BASE));

    const systems = createGameSystems(STATIC_GAME);
    let state = BASE;
    for (let i = 0; i < YEAR_WEEKS; i++) state = advanceWeek(state, systems).state;

    const summary = state.economy.yearSummaries.find((s) => s.year === START_YEAR);
    if (summary === undefined) throw new Error('연말 요약이 없다');
    const endMedian = summary.aiFundsMedian;
    const lines = [
      `[정기 비용 1시즌 ${START_YEAR}] 플레이어 종류별 합계: ${JSON.stringify(summary.player)}`,
      `[정기 비용 1시즌 ${START_YEAR}] AI 전체 종류별 합계: ${JSON.stringify(summary.aiTotals)}`,
      `[정기 비용 1시즌 ${START_YEAR}] AI 자금 중앙값 연초 ${startMedian} → 연말 ${endMedian}, 합계 ${aiFundsSorted(BASE).reduce((a, b) => a + b, 0)} → ${summary.aiFundsTotal}`,
      `[정기 비용 1시즌 ${START_YEAR}] 주 수 ${weeksBetween(BASE.date, state.date)}, AI 마주 ${aiOwnerIds(BASE).length}명`,
    ];
    for (const line of lines) console.log(line);
    expect(state.economy.yearSummaries).toHaveLength(1);
  }, MID_TIMEOUT);
});
