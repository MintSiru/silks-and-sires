import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { loadRacecourses } from '../../src/engine/course/load';
import { nickKey } from '../../src/engine/breeding/nicks';
import { emptyOffspringStats, observedProfile, recordOffspringRun } from '../../src/engine/breeding/offspring';
import { OBSERVED_PROFILE_MIN_WINS } from '../../src/engine/config/offspring';
import type { SampleField } from '../../src/engine/race/sampleField';
import { applyRaceResult, type ApplyRaceResultOutput } from '../../src/engine/season/apply';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  CountryCode,
  Declaration,
  GameEvent,
  GameState,
  Going,
  HorseId,
  Meeting,
  NickEntry,
  OffspringStats,
  Race,
  RaceGrade,
  RaceKind,
  RaceResult,
  RaceTemplate,
  Racecourse,
  RunnerResult,
  ScheduledRace,
  SeriesDefinition,
} from '../../src/engine/types';

const SEED = 20261012;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SILKS_REQUEST = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };
const APRIL_FIRST_WEEK = weekOfSlot({ month: 4, weekOfMonth: 1 });
const SHORT_WEEKS = 8;
/** 긴 진행 테스트용 제한 시간(ms) */
const MID_TIMEOUT = 120_000;
const DATE = { year: 2026, week: 20 };
const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);

const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';

function courseOf(id: string): Racecourse {
  const c = COURSES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`fixture 에 ${id} 없음`);
  return c;
}

function layoutOf(course: Racecourse, distance: number): string {
  const cd = course.distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`${course.id} 에 ${distance}m 없음`);
  return cd.layoutId;
}

/** 테스트용 G1 템플릿(가상 이름). 8주 통합 테스트에서 쓴다 */
function g1Template(
  id: string,
  courseId: string,
  distance: number,
  schedule: RaceTemplate['schedule'],
  name: string,
): RaceTemplate {
  const course = courseOf(courseId);
  return {
    id,
    name,
    racecourseId: course.id,
    distance,
    layoutId: layoutOf(course, distance),
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

const SERIES: SeriesDefinition[] = [
  {
    id: 'test-points',
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: 50000,
  },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const meetingStub: Meeting = {
  id: 'synthetic:offspring',
  date: DATE,
  racecourseId: 'saint_ourens',
  going: 'good',
  races: [],
};

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** n 주 진행하며 주마다의 이벤트를 모은다(입력 state 는 바꾸지 않는다) */
function stepCollect(state: GameState, weeks: number): { state: GameState; events: GameEvent[] } {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < weeks; i++) {
    const out = advanceWeek(current, systems);
    current = out.state;
    events.push(...out.events);
  }
  return { state: current, events };
}

/** 2026년 4월 1주 전까지 진행한 뒤 8주를 더 진행한다(같은 시드면 항상 같은 결과) */
function runSeason(base: GameState): { state: GameState; events: GameEvent[] } {
  const first = stepCollect(base, APRIL_FIRST_WEEK - 1);
  const second = stepCollect(first.state, SHORT_WEEKS);
  return { state: second.state, events: [...first.events, ...second.events] };
}

/** 현역(in_training) AI 말 id 를 정렬 순서대로 n 두 고른다 */
function pickHorseIds(state: GameState, n: number): HorseId[] {
  const ids = Object.keys(state.horses)
    .sort()
    .filter((id) => {
      const h = state.horses[id];
      return h !== undefined && h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId;
    });
  if (ids.length < n) throw new Error('테스트 전제 위반: 현역 AI 말이 부족하다');
  return ids.slice(0, n);
}

function syntheticRace(id: string, grade: RaceGrade | null, distance: number, prize: number[]): Race {
  const course = courseOf('saint_ourens');
  const kind: RaceKind = grade === null ? 'conditions' : grade === 'L' ? 'listed' : 'group';
  return {
    id,
    name: 'Synthetic Offspring Stakes',
    racecourseId: course.id,
    distance,
    layoutId: layoutOf(course, distance),
    kind,
    grade,
    raceClass: grade === null ? 4 : 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'level',
      baseWeightLb: 126,
    },
    prizeMoney: prize,
    maxRunners: 14,
  };
}

interface RacePlan {
  race: Race;
  /** 1착부터 순서대로 */
  horseIds: HorseId[];
  country: CountryCode;
}

function declarationsOf(state: GameState, horseIds: HorseId[]): Declaration[] {
  return horseIds.map((horseId) => {
    const h = state.horses[horseId];
    if (h === undefined || h.ownerId === null) throw new Error(`테스트 전제 위반: 말 ${horseId} 의 마주가 없다`);
    return {
      horseId,
      ownerId: h.ownerId,
      trainerId: h.trainerId,
      jockeyId: 'jk-synthetic',
      weightLb: 126,
      isPlayer: false,
    };
  });
}

function resultOf(plan: RacePlan): RaceResult {
  const runners: RunnerResult[] = plan.horseIds.map((horseId, i) => ({
    runnerIndex: i,
    horseId,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: 'jk-synthetic',
    weightLb: 126,
    position: i + 1,
    finishTime: 200 + i,
    margin: i === 0 ? null : { label: 'lengths', lengths: 1 },
    beatenLengths: i,
    sectionals: [200 + i],
    performanceFigure: 0,
    odds: null,
  }));
  return {
    raceId: plan.race.id,
    racecourseId: plan.race.racecourseId,
    date: DATE,
    going: 'good' as Going,
    distance: plan.race.distance,
    seed: 4242,
    winningTime: 200,
    sectionalMarks: [],
    runners,
  };
}

function fieldOf(plan: RacePlan): SampleField {
  return {
    runners: [],
    requests: plan.horseIds.map((horseId) => ({
      horseId,
      jockeyId: 'jk-synthetic',
      tactic: 'midfield' as const,
      silks: { ...SILKS_REQUEST },
      isPlayer: false,
      weightLb: 126,
      jockeyAllowanceLb: 0,
    })),
    ownerNames: plan.horseIds.map(() => 'synthetic owner'),
  };
}

/** 합성 레이스 한 번을 반영한다(입력 state 는 바꾸지 않는다) */
function applyPlan(state: GameState, plan: RacePlan, nicks: readonly NickEntry[] = []): ApplyRaceResultOutput {
  const scheduled: ScheduledRace = {
    race: plan.race,
    templateId: null,
    status: 'run',
    declarations: declarationsOf(state, plan.horseIds),
    simulated: true,
  };
  return applyRaceResult(state, {
    meeting: meetingStub,
    scheduled,
    result: resultOf(plan),
    field: fieldOf(plan),
    series: [],
    country: plan.country,
    nicks,
  });
}

/** 우승 횟수 wins 번(거리는 distances 순서대로)인 자마 성적 표를 기록으로 만든다 */
function statsWithWins(distances: number[]): OffspringStats {
  const stats = emptyOffspringStats();
  distances.forEach((distance, i) => {
    recordOffspringRun(stats, {
      firstStart: i === 0,
      becameWinner: i === 0,
      won: true,
      groupWin: false,
      firstGroupWin: false,
      earnings: 0,
      distance,
    });
  });
  return stats;
}

function sumOf(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

let BASE: GameState;
let END: GameState;
let END_EVENTS: GameEvent[];

beforeAll(() => {
  BASE = boot(SEED);
  const out = runSeason(BASE);
  END = out.state;
  END_EVENTS = out.events;
}, MID_TIMEOUT);

describe('수용 기준 1: 같은 아비의 자마 성적 누적', () => {
  it('1. 자마 2두가 3레이스(한 두 2승, 그중 1승은 G2)를 뛰면 starters·winners·runs·wins·groupWins·groupWinners·earnings·winDistanceSum 이 결과와 같다', () => {
    const SIRE = 'test-sire-offspring';
    const [a, b, x1, y1, x2] = pickHorseIds(BASE, 5);
    if (a === undefined || b === undefined || x1 === undefined || y1 === undefined || x2 === undefined) {
      throw new Error('테스트 전제 위반: 말 부족');
    }
    const start = structuredClone(BASE);
    for (const id of [a, b]) {
      const h = start.horses[id];
      if (h === undefined) throw new Error(`말 ${id} 없음`);
      h.sireId = SIRE;
    }

    const r1 = applyPlan(start, {
      race: syntheticRace('off-cond-1', null, 2000, [100, 50]),
      horseIds: [a, x1],
      country: 'GB',
    });
    const r2 = applyPlan(r1.state, {
      race: syntheticRace('off-g2', 'G2', 2400, [300, 150]),
      horseIds: [a, y1],
      country: 'GB',
    });
    const r3 = applyPlan(r2.state, {
      race: syntheticRace('off-cond-2', null, 1600, [400, 200]),
      horseIds: [x2, b],
      country: 'GB',
    });

    expect(r3.state.sireStats[SIRE]).toEqual({
      starters: 2,
      winners: 1,
      runs: 3,
      wins: 2,
      groupWins: 1,
      groupWinners: 1,
      earnings: 100 + 300 + 200,
      winDistanceSum: 2000 + 2400,
    });
    // 결과와 대조: 같은 아비 두 말의 경력 기록 합계
    const sire = [a, b].map((id) => r3.state.horses[id]?.record);
    expect(sire.reduce((acc, r) => acc + (r?.starts ?? 0), 0)).toBe(3);
    expect(sire.reduce((acc, r) => acc + (r?.wins ?? 0), 0)).toBe(2);
    expect(sire.reduce((acc, r) => acc + (r?.earnings ?? 0), 0)).toBe(600);
  });

  it('1b. 아비가 없는(sireId null) 말은 자마 성적에 들어가지 않는다', () => {
    const [a, x1] = pickHorseIds(BASE, 2);
    if (a === undefined || x1 === undefined) throw new Error('테스트 전제 위반: 말 부족');
    const start = structuredClone(BASE);
    const ha = start.horses[a];
    if (ha === undefined) throw new Error('말 없음');
    ha.sireId = null;
    const out = applyPlan(start, {
      race: syntheticRace('off-no-sire', null, 2000, [100, 50]),
      horseIds: [a, x1],
      country: 'GB',
    });
    // x1 은 아비가 있으면 1출주만 집계되고, a(아비 null)의 출주는 집계되지 않는다
    const x1Sire = BASE.horses[x1]?.sireId ?? null;
    const runs = sumOf(Object.values(out.state.sireStats).map((s) => s.runs));
    expect(runs).toBe(x1Sire === null ? 0 : 1);
  });
});

describe('수용 기준 2: 실제 성적 기준 거리 적성', () => {
  it('2. 우승 4회면 null(미정)', () => {
    expect(OBSERVED_PROFILE_MIN_WINS).toBe(5);
    expect(observedProfile(statsWithWins([1400, 1400, 1400, 1400]))).toBeNull();
  });

  it('2b. 우승 0회(출주만 있음)도 null', () => {
    const stats = emptyOffspringStats();
    recordOffspringRun(stats, {
      firstStart: true,
      becameWinner: false,
      won: false,
      groupWin: false,
      firstGroupWin: false,
      earnings: 0,
      distance: 2000,
    });
    expect(observedProfile(stats)).toBeNull();
  });

  it('2c. 우승 5회 평균 1,400m → speed, 2,000m → classic, 2,400m → middle, 3,000m → cup', () => {
    expect(observedProfile(statsWithWins([1400, 1400, 1400, 1400, 1400]))).toBe('speed');
    expect(observedProfile(statsWithWins([2000, 2000, 2000, 2000, 2000]))).toBe('classic');
    expect(observedProfile(statsWithWins([2400, 2400, 2400, 2400, 2400]))).toBe('middle');
    expect(observedProfile(statsWithWins([3000, 3000, 3000, 3000, 3000]))).toBe('cup');
  });

  it('2d. 평균 경계값은 PROFILE_BOUNDS 규칙대로 이하 포함(1800 → speed, 2200 → classic, 2700 → middle, 2701 → cup)', () => {
    expect(observedProfile(statsWithWins([1800, 1800, 1800, 1800, 1800]))).toBe('speed');
    expect(observedProfile(statsWithWins([1801, 1801, 1801, 1801, 1801]))).toBe('classic');
    expect(observedProfile(statsWithWins([2200, 2200, 2200, 2200, 2200]))).toBe('classic');
    expect(observedProfile(statsWithWins([2700, 2700, 2700, 2700, 2700]))).toBe('middle');
    expect(observedProfile(statsWithWins([2701, 2701, 2701, 2701, 2701]))).toBe('cup');
  });
});

describe('수용 기준 3: 성적으로 닉스 공개', () => {
  const SIRE_LINE = 'sl_test_sire';
  const NICKS: NickEntry[] = [
    { sireLineId: SIRE_LINE, damsireLineId: 'sl_test_good_g3', value: 0.5, knownAtStart: false },
    { sireLineId: SIRE_LINE, damsireLineId: 'sl_test_good_listed', value: 0.5, knownAtStart: false },
    { sireLineId: SIRE_LINE, damsireLineId: 'sl_test_good_handicap', value: 0.5, knownAtStart: false },
    { sireLineId: SIRE_LINE, damsireLineId: 'sl_test_low', value: 0.1, knownAtStart: false },
    { sireLineId: SIRE_LINE, damsireLineId: 'sl_test_known', value: 0.5, knownAtStart: false },
    { sireLineId: SIRE_LINE, damsireLineId: 'sl_test_good_g1', value: 0.4, knownAtStart: false },
  ];

  /**
   * 우승마(winner)에 부 계통 SIRE_LINE 과 모부 계통 damsireLineId 를 배정한다.
   * 모(dam)는 같은 state 의 말이고 모의 부(damsire)는 또 다른 말이다(혈통 조회에 쓴다).
   */
  function withPedigree(state: GameState, winner: HorseId, dam: HorseId, damsire: HorseId, damsireLineId: string): GameState {
    const next = structuredClone(state);
    const w = next.horses[winner];
    const d = next.horses[dam];
    const ds = next.horses[damsire];
    if (w === undefined || d === undefined || ds === undefined) throw new Error('테스트 전제 위반: 혈통 말 없음');
    w.sireLineId = SIRE_LINE;
    w.damId = dam;
    d.sireId = damsire;
    ds.sireLineId = damsireLineId;
    return next;
  }

  /** 우승마를 1착으로 하는 합성 레이스 */
  function winnerRace(grade: RaceGrade | null, id: string, winner: HorseId, others: HorseId[]): RacePlan {
    return {
      race: syntheticRace(id, grade, 2000, [100000, 40000]),
      horseIds: [winner, ...others],
      country: 'GB',
    };
  }

  function revealEvents(events: GameEvent[]): GameEvent[] {
    return events.filter((e) => e.type === 'nick_revealed');
  }

  let W: HorseId;
  let DAM: HorseId;
  let DAMSIRE: HorseId;
  let OTHER: HorseId;
  let base: GameState;

  beforeAll(() => {
    const ids = pickHorseIds(BASE, 4);
    const [w, dam, damsire, other] = ids;
    if (w === undefined || dam === undefined || damsire === undefined || other === undefined) {
      throw new Error('테스트 전제 위반: 말 부족');
    }
    W = w;
    DAM = dam;
    DAMSIRE = damsire;
    OTHER = other;
    base = BASE;
  });

  it('3. 좋은 닉스(0.5) 배합의 말이 G3 1착 → revealedNicks 에 키 추가, nick_revealed 이벤트 1건', () => {
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_good_g3');
    const key = nickKey(SIRE_LINE, 'sl_test_good_g3');
    expect(start.breeding.revealedNicks).not.toContain(key);

    const out = applyPlan(start, winnerRace('G3', 'nick-g3', W, [OTHER]), NICKS);
    expect(out.state.breeding.revealedNicks).toContain(key);
    expect(revealEvents(out.events)).toEqual([
      {
        type: 'nick_revealed',
        sireLineId: SIRE_LINE,
        damsireLineId: 'sl_test_good_g3',
        horseId: W,
        date: DATE,
      },
    ]);
  });

  it('3b. 같은 배합의 두 번째 그룹 우승은 이벤트가 없다(이미 공개됨)', () => {
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_good_g3');
    const first = applyPlan(start, winnerRace('G3', 'nick-g3-first', W, [OTHER]), NICKS);
    const second = applyPlan(first.state, winnerRace('G3', 'nick-g3-second', W, [OTHER]), NICKS);
    expect(revealEvents(second.events)).toHaveLength(0);
  });

  it('3c. 리스티드(L) 우승은 값이 좋아도 이벤트가 없다', () => {
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_good_listed');
    const out = applyPlan(start, winnerRace('L', 'nick-listed', W, [OTHER]), NICKS);
    expect(revealEvents(out.events)).toHaveLength(0);
    expect(out.state.breeding.revealedNicks).not.toContain(nickKey(SIRE_LINE, 'sl_test_good_listed'));
  });

  it('3d. 핸디캡(비그룹) 우승은 값이 좋아도 이벤트가 없다', () => {
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_good_handicap');
    const out = applyPlan(start, winnerRace(null, 'nick-handicap', W, [OTHER]), NICKS);
    expect(revealEvents(out.events)).toHaveLength(0);
    expect(out.state.breeding.revealedNicks).not.toContain(nickKey(SIRE_LINE, 'sl_test_good_handicap'));
  });

  it('3e. 값 0.1 배합(기준 미달)은 G3 우승이어도 이벤트가 없다', () => {
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_low');
    const out = applyPlan(start, winnerRace('G3', 'nick-low', W, [OTHER]), NICKS);
    expect(revealEvents(out.events)).toHaveLength(0);
    expect(out.state.breeding.revealedNicks).not.toContain(nickKey(SIRE_LINE, 'sl_test_low'));
  });

  it('3f. 이미 공개된 닉스(revealedNicks 에 있음)는 G3 우승이어도 이벤트가 없다', () => {
    const key = nickKey(SIRE_LINE, 'sl_test_known');
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_known');
    start.breeding.revealedNicks = [...start.breeding.revealedNicks, key].sort();
    const out = applyPlan(start, winnerRace('G3', 'nick-known', W, [OTHER]), NICKS);
    expect(revealEvents(out.events)).toHaveLength(0);
    expect(out.state.breeding.revealedNicks.filter((k) => k === key)).toHaveLength(1);
  });

  it('3g. G1 1착도 같은 규칙으로 공개한다(0.4 배합 → 공개 1건)', () => {
    const start = withPedigree(base, W, DAM, DAMSIRE, 'sl_test_good_g1');
    const out = applyPlan(start, winnerRace('G1', 'nick-g1', W, [OTHER]), NICKS);
    expect(revealEvents(out.events)).toHaveLength(1);
    expect(out.state.breeding.revealedNicks).toContain(nickKey(SIRE_LINE, 'sl_test_good_g1'));
  });
});

describe('수용 기준 4: 시즌 8주 통합(bootstrapGame + 테스트 템플릿)', () => {
  it('4. sireStats 의 runs 합·wins 합이 그 기간 리딩(sire) 출주·우승 합과 같다', () => {
    expect(END.seasonState.year).toBe(BASE.seasonState.year);
    const sumStats = (state: GameState, field: 'runs' | 'wins'): number =>
      sumOf(Object.values(state.sireStats).map((s) => s[field]));
    const sumLeading = (state: GameState, field: 'runners' | 'wins'): number =>
      sumOf(Object.values(state.seasonState.leading.sire).map((e) => e[field]));

    const runsDelta = sumStats(END, 'runs') - sumStats(BASE, 'runs');
    const winsDelta = sumStats(END, 'wins') - sumStats(BASE, 'wins');
    expect(runsDelta).toBe(sumLeading(END, 'runners') - sumLeading(BASE, 'runners'));
    expect(winsDelta).toBe(sumLeading(END, 'wins') - sumLeading(BASE, 'wins'));
    expect(runsDelta).toBeGreaterThan(0);
  }, MID_TIMEOUT);

  it('4b. 8주 통합에서 공개된 닉스 이벤트 수 = 공개 목록 증가량, 이벤트 키는 모두 공개 목록에 있다', () => {
    const reveals = END_EVENTS.filter((e) => e.type === 'nick_revealed');
    expect(reveals.length).toBe(END.breeding.revealedNicks.length - BASE.breeding.revealedNicks.length);
    for (const e of reveals) {
      if (e.type !== 'nick_revealed') continue;
      expect(END.breeding.revealedNicks).toContain(nickKey(e.sireLineId, e.damsireLineId));
    }
  }, MID_TIMEOUT);

  it('5. 같은 시드 재현: 두 번 진행한 상태(sireStats 포함)가 toEqual 이다', () => {
    const again = runSeason(boot(SEED)).state;
    expect(again.sireStats).toEqual(END.sireStats);
    expect(again).toEqual(END);
  }, MID_TIMEOUT);

  it('5b. 저장 → 불러오기 하면 sireStats 가 그대로다', () => {
    const json = serializeGame(END, '2026-10-12T00:00:00.000Z');
    const loaded = deserializeGame(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state.sireStats).toEqual(END.sireStats);
      expect(loaded.state).toEqual(END);
    }
  }, MID_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('offspring.ts · config/offspring.ts · apply.ts · raceday.ts · system.ts 에 Math.random · Date.now · DOM 접근이 없다', () => {
    const files = [
      'src/engine/breeding/offspring.ts',
      'src/engine/config/offspring.ts',
      'src/engine/season/apply.ts',
      'src/engine/season/raceday.ts',
      'src/engine/season/system.ts',
    ];
    for (const file of files) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('Math.random');
      expect(text, file).not.toContain('Date.now');
      expect(text, file).not.toContain('document.');
      expect(text, file).not.toContain('window.');
    }
  });
});
