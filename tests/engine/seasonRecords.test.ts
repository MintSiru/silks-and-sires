import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { loadRacecourses } from '../../src/engine/course/load';
import { PERFORMANCE_RECORD_MIN_PR } from '../../src/engine/config/season';
import type { SampleField } from '../../src/engine/race/sampleField';
import { applyRaceResult } from '../../src/engine/season/apply';
import { performanceRatings } from '../../src/engine/season/handicapper';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type {
  CountryCode,
  Declaration,
  GameState,
  Going,
  HorseId,
  LeadingCategory,
  LeadingTables,
  Meeting,
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
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const APRIL_FIRST_WEEK = weekOfSlot({ month: 4, weekOfMonth: 1 });
const SHORT_WEEKS = 8;
/** 긴 진행 테스트용 제한 시간(ms) */
const MID_TIMEOUT = 120_000;
const DATE = { year: START_YEAR, week: 20 };
const CATEGORIES: LeadingCategory[] = ['sire', 'damsire', 'jockey', 'trainer', 'owner', 'breeder'];

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
  words: getHorseWords(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  words: getHorseWords(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const meetingStub: Meeting = {
  id: 'synthetic:season-records',
  date: DATE,
  racecourseId: 'saint_ourens',
  going: 'good',
  races: [],
};

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** n 주 진행(입력 state 는 바꾸지 않는다) */
function step(state: GameState, weeks: number): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  for (let i = 0; i < weeks; i++) {
    current = advanceWeek(current, systems).state;
  }
  return current;
}

/** 2026년 4월 1주 전까지 진행한 뒤 8주를 더 진행한다(같은 시드면 항상 같은 결과) */
function runSeason(base: GameState): GameState {
  return step(step(base, APRIL_FIRST_WEEK - 1), SHORT_WEEKS);
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

function syntheticRace(id: string, grade: RaceGrade | null, prize: number[]): Race {
  const course = courseOf('saint_ourens');
  const kind: RaceKind = grade === null ? 'conditions' : grade === 'L' ? 'listed' : 'group';
  return {
    id,
    name: 'Synthetic Records Stakes',
    racecourseId: course.id,
    distance: 2000,
    layoutId: layoutOf(course, 2000),
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

interface Plan {
  race: Race;
  templateId: string | null;
  /** 1착부터 순서대로 */
  horseIds: HorseId[];
  /** 말 순서대로의 퍼포먼스 수치(performanceFigure) */
  figures: number[];
  country: CountryCode;
}

const SILKS_REQUEST = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };

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

function resultOf(plan: Plan): RaceResult {
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
    performanceFigure: plan.figures[i] ?? 0,
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

function fieldOf(plan: Plan): SampleField {
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

/** 이 레이스 결과로 나올 PR 맵(반영 전 state 의 OR 기준, handicapper 와 같은 입력) */
function expectedPrs(state: GameState, plan: Plan): Map<HorseId, number> {
  const result = resultOf(plan);
  const ratings = new Map<HorseId, number | null>();
  const ages = new Map<HorseId, number>();
  for (const r of result.runners) {
    const h = state.horses[r.horseId];
    if (h === undefined) throw new Error('테스트 전제 위반: 말 없음');
    ratings.set(r.horseId, h.officialRating);
    ages.set(r.horseId, ageInYear(h.birthYear, DATE.year));
  }
  return performanceRatings(plan.race, result, ratings, ages);
}

function applyPlan(state: GameState, plan: Plan): GameState {
  const scheduled: ScheduledRace = {
    race: plan.race,
    templateId: plan.templateId,
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
    nicks: [],
  }).state;
}

interface Totals {
  runners: number;
  wins: number;
  earnings: number;
}

function totalsOf(tables: LeadingTables, category: LeadingCategory): Totals {
  return Object.values(tables[category]).reduce<Totals>(
    (acc, e) => ({
      runners: acc.runners + e.runners,
      wins: acc.wins + e.wins,
      earnings: acc.earnings + e.earnings,
    }),
    { runners: 0, wins: 0, earnings: 0 },
  );
}

/** 상위 n두 PR 평균을 소수 첫째 자리로 반올림(구현과 같은 규칙, 기대값 계산용) */
function topAverage(prs: number[], n: number): number {
  const top = prs.slice(0, n);
  const avg = top.reduce((acc, v) => acc + v, 0) / Math.max(1, top.length);
  return Math.round(avg * 10) / 10;
}

let BASE: GameState;
let END: GameState;

beforeAll(() => {
  BASE = boot(SEED);
  END = runSeason(BASE);
}, MID_TIMEOUT);

describe('수용 기준 1: 퍼포먼스 기록', () => {
  it('1. 블랙타입 레이스 반영 후 출주마 수만큼 PerformanceEntry 가 생기고 pr 이 handicapper PR 과 같다', () => {
    const horseIds = pickHorseIds(BASE, 5);
    const plan: Plan = {
      race: syntheticRace('rec-g3-plain', 'G3', [0, 0, 0, 0, 0]),
      templateId: null,
      horseIds,
      figures: [6, 3, 0, -2, -5],
      country: 'GB',
    };
    const expected = expectedPrs(BASE, plan);
    const after = applyPlan(BASE, plan);

    expect(Object.keys(after.seasonState.performances).sort()).toEqual([...horseIds].sort());
    horseIds.forEach((horseId, i) => {
      const list = after.seasonState.performances[horseId] ?? [];
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        raceId: 'rec-g3-plain',
        templateId: null,
        date: DATE,
        grade: 'G3',
        distance: 2000,
        country: 'GB',
        position: i + 1,
        pr: expected.get(horseId),
      });
    });
    expect(BASE.seasonState.performances).toEqual({});
  });

  it('1b. 같은 말이 두 번 블랙타입 레이스에 출주하면 performances[horseId] 끝에 순서대로 쌓인다', () => {
    const horseIds = pickHorseIds(BASE, 3);
    const first: Plan = {
      race: syntheticRace('rec-first', 'G3', [0, 0, 0]),
      templateId: null,
      horseIds,
      figures: [4, 2, 0],
      country: 'GB',
    };
    const second: Plan = { ...first, race: syntheticRace('rec-second', 'L', [0, 0, 0]), figures: [1, 0, -1] };
    const s1 = applyPlan(BASE, first);
    const s2 = applyPlan(s1, second);
    const list = s2.seasonState.performances[horseIds[0] ?? ''] ?? [];
    expect(list.map((e) => e.raceId)).toEqual(['rec-first', 'rec-second']);
  });

  it('1c. 비블랙타입(조건) 레이스는 PR ≥ PERFORMANCE_RECORD_MIN_PR 인 출주마만 기록한다', () => {
    const horseIds = pickHorseIds(BASE, 6);
    const plan: Plan = {
      race: syntheticRace('rec-conditions-filter', null, [0, 0, 0, 0, 0, 0]),
      templateId: null,
      horseIds,
      figures: [30, 20, 10, 0, -10, -30],
      country: 'GB',
    };
    const expected = expectedPrs(BASE, plan);
    const keep = horseIds.filter((id) => (expected.get(id) ?? 0) >= PERFORMANCE_RECORD_MIN_PR);
    const after = applyPlan(BASE, plan);

    const recorded = horseIds.filter((id) => (after.seasonState.performances[id] ?? []).length > 0);
    expect(recorded.sort()).toEqual([...keep].sort());
    for (const id of recorded) {
      const list = after.seasonState.performances[id] ?? [];
      expect(list).toHaveLength(1);
      expect(list[0]?.pr).toBe(expected.get(id));
      expect(list[0]?.pr ?? 0).toBeGreaterThanOrEqual(PERFORMANCE_RECORD_MIN_PR);
    }
  });
});

describe('수용 기준 2: 그룹 레이스 레이팅', () => {
  it('2. G3 레이스는 raceRatings 에 1건, rating = 상위 4두 PR 평균(소수 첫째 자리 반올림)', () => {
    const horseIds = pickHorseIds(BASE, 6);
    const plan: Plan = {
      race: syntheticRace('rec-g3', 'G3', [60000, 30000, 15000, 8000, 4000, 0]),
      templateId: null,
      horseIds,
      figures: [8, 5, 4, 2, 0, -3],
      country: 'IE',
    };
    const expected = expectedPrs(BASE, plan);
    const prsInOrder = horseIds.map((id) => expected.get(id) ?? 0);
    const after = applyPlan(BASE, plan);

    expect(after.seasonState.raceRatings).toEqual([
      {
        raceId: 'rec-g3',
        templateId: null,
        name: 'Synthetic Records Stakes',
        date: DATE,
        grade: 'G3',
        country: 'IE',
        rating: topAverage(prsInOrder, 4),
      },
    ]);
  });

  it('2b. 출주 4두 미만이면 있는 만큼 평균한다(G2, 3두)', () => {
    const horseIds = pickHorseIds(BASE, 3);
    const plan: Plan = {
      race: syntheticRace('rec-g2-small', 'G2', [0, 0, 0]),
      templateId: null,
      horseIds,
      figures: [7, 1, -4],
      country: 'GB',
    };
    const expected = expectedPrs(BASE, plan);
    const prsInOrder = horseIds.map((id) => expected.get(id) ?? 0);
    const after = applyPlan(BASE, plan);
    expect(after.seasonState.raceRatings).toHaveLength(1);
    expect(after.seasonState.raceRatings[0]?.rating).toBe(topAverage(prsInOrder, 3));
    expect(after.seasonState.raceRatings[0]?.grade).toBe('G2');
  });

  it('2c. 비그룹(조건) 레이스는 raceRatings 0건, 퍼포먼스는 PR ≥ 기준인 말만(0건일 수 있다)', () => {
    const horseIds = pickHorseIds(BASE, 4);
    const conditions: Plan = {
      race: syntheticRace('rec-conditions', null, [0, 0, 0, 0]),
      templateId: null,
      horseIds,
      figures: [3, 2, 1, 0],
      country: 'GB',
    };
    const expected = expectedPrs(BASE, conditions);
    const a = applyPlan(BASE, conditions);
    expect(a.seasonState.raceRatings).toEqual([]);
    const recordedCount = horseIds.filter((id) => (a.seasonState.performances[id] ?? []).length > 0).length;
    const expectedCount = horseIds.filter((id) => (expected.get(id) ?? 0) >= PERFORMANCE_RECORD_MIN_PR).length;
    expect(recordedCount).toBe(expectedCount);
  });

  it('2d. 리스티드(L)는 블랙타입이므로 출주마 전원이 퍼포먼스 기록에 남고, raceRatings 는 0건이다', () => {
    const horseIds = pickHorseIds(BASE, 4);
    const listed: Plan = {
      race: syntheticRace('rec-listed', 'L', [0, 0, 0, 0]),
      templateId: null,
      horseIds,
      figures: [3, 2, 1, 0],
      country: 'GB',
    };
    const b = applyPlan(BASE, listed);
    expect(b.seasonState.raceRatings).toEqual([]);
    for (const id of horseIds) {
      expect(b.seasonState.performances[id] ?? []).toHaveLength(1);
    }
  });
});

describe('수용 기준 3: 나라별 리딩', () => {
  it('3. leadingByCountry[개최국] 합계 = 그 레이스분 leading 증가량, 다른 나라 표는 그대로다', () => {
    const gbHorses = pickHorseIds(BASE, 4);
    const frHorses = pickHorseIds(BASE, 6).slice(2);
    const gbPlan: Plan = {
      race: syntheticRace('lead-gb', 'G3', [60000, 30000, 10000, 0]),
      templateId: null,
      horseIds: gbHorses,
      figures: [5, 3, 1, 0],
      country: 'GB',
    };
    const frPlan: Plan = {
      race: syntheticRace('lead-fr', null, [20000, 8000, 0, 0]),
      templateId: null,
      horseIds: frHorses,
      figures: [4, 2, 0, -1],
      country: 'FR',
    };

    const s1 = applyPlan(BASE, gbPlan);
    const s2 = applyPlan(s1, frPlan);

    const fr = s2.seasonState.leadingByCountry.FR;
    if (fr === undefined) throw new Error('FR 표가 없다');
    expect(s2.seasonState.leadingByCountry.GB).toEqual(s1.seasonState.leadingByCountry.GB);

    for (const category of CATEGORIES) {
      const delta = {
        runners: totalsOf(s2.seasonState.leading, category).runners - totalsOf(s1.seasonState.leading, category).runners,
        wins: totalsOf(s2.seasonState.leading, category).wins - totalsOf(s1.seasonState.leading, category).wins,
        earnings:
          totalsOf(s2.seasonState.leading, category).earnings - totalsOf(s1.seasonState.leading, category).earnings,
      };
      expect(totalsOf(fr, category), category).toEqual(delta);
    }

    // 개최국 표의 GB 합계도 첫 레이스 leading 과 같다(두 나라 표가 섞이지 않는다)
    const gb = s2.seasonState.leadingByCountry.GB;
    if (gb === undefined) throw new Error('GB 표가 없다');
    expect(totalsOf(gb, 'jockey')).toEqual(totalsOf(s1.seasonState.leading, 'jockey'));
  });

  it('3b. 개최국 표의 항목별 값도 leading 증가량과 같다(기수 표)', () => {
    const horseIds = pickHorseIds(BASE, 2);
    const plan: Plan = {
      race: syntheticRace('lead-entry', null, [10000, 0]),
      templateId: null,
      horseIds,
      figures: [2, 0],
      country: 'AE',
    };
    const after = applyPlan(BASE, plan);
    const table = after.seasonState.leadingByCountry.AE?.jockey['jk-synthetic'];
    expect(table).toEqual(after.seasonState.leading.jockey['jk-synthetic']);
    expect(table?.runners).toBe(2);
    expect(table?.wins).toBe(1);
    expect(table?.earnings).toBe(10000);
  });
});

describe('수용 기준 4·5: 시즌 통합(4월 1주부터 8주, 같은 시드·저장 왕복)', () => {
  it('4. 모든 나라 leadingByCountry 의 sire wins 합 = leading 의 sire wins 합, performances 전체 건수 = 출주 수 합', () => {
    const countryTables = Object.values(END.seasonState.leadingByCountry).filter(
      (t): t is LeadingTables => t !== undefined,
    );
    const countrySireWins = countryTables.reduce((acc, t) => acc + totalsOf(t, 'sire').wins, 0);
    expect(countrySireWins).toBe(totalsOf(END.seasonState.leading, 'sire').wins);

    const countryRuns = countryTables.reduce((acc, t) => acc + totalsOf(t, 'jockey').runners, 0);
    expect(countryRuns).toBe(totalsOf(END.seasonState.leading, 'jockey').runners);

    const allEntries = Object.values(END.seasonState.performances).flat();
    const performanceCount = allEntries.length;
    const totalStarts = totalsOf(END.seasonState.leading, 'jockey').runners;
    expect(performanceCount).toBeGreaterThan(0);
    expect(performanceCount).toBeLessThanOrEqual(totalStarts);

    // 블랙타입 레이스는 출주마 전원이 기록된다: 그 레이스 결과(raceResults)의 출주 수와 기록 건수가 같다
    const blackRaceIds = new Set(allEntries.filter((e) => e.grade !== null).map((e) => e.raceId));
    let blackStarts = 0;
    for (const result of END.raceResults) {
      if (!blackRaceIds.has(result.raceId)) continue;
      blackStarts += result.runners.length;
      const recorded = allEntries.filter((e) => e.raceId === result.raceId).length;
      expect(recorded, result.raceId).toBe(result.runners.length);
    }
    expect(performanceCount).toBeGreaterThanOrEqual(blackStarts);

    // 비블랙타입 기록은 전부 PR ≥ 기준이다
    for (const entry of allEntries) {
      if (entry.grade === null) expect(entry.pr).toBeGreaterThanOrEqual(PERFORMANCE_RECORD_MIN_PR);
    }
  }, MID_TIMEOUT);

  it('4b. 그룹 레이스 레이팅은 같은 레이스 퍼포먼스의 상위 4두 PR 평균과 같다', () => {
    for (const rating of END.seasonState.raceRatings) {
      const prs = Object.values(END.seasonState.performances)
        .flat()
        .filter((e) => e.raceId === rating.raceId)
        .sort((a, b) => a.position - b.position)
        .map((e) => e.pr);
      expect(prs.length).toBeGreaterThan(0);
      expect(rating.rating).toBe(topAverage(prs, 4));
      expect(rating.grade === 'G1' || rating.grade === 'G2' || rating.grade === 'G3').toBe(true);
    }
  }, MID_TIMEOUT);

  it('5. 같은 시드 재현: 두 번 진행한 시즌 상태가 toEqual 이다', () => {
    const again = runSeason(boot(SEED));
    expect(again.seasonState.leadingByCountry).toEqual(END.seasonState.leadingByCountry);
    expect(again.seasonState.performances).toEqual(END.seasonState.performances);
    expect(again.seasonState.raceRatings).toEqual(END.seasonState.raceRatings);
    expect(again).toEqual(END);
  }, MID_TIMEOUT);

  it('5b. 저장 → 불러오기 하면 나라별 리딩·퍼포먼스·레이스 레이팅이 그대로다', () => {
    const json = serializeGame(END, '2026-10-12T00:00:00.000Z');
    const loaded = deserializeGame(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state.seasonState.leadingByCountry).toEqual(END.seasonState.leadingByCountry);
      expect(loaded.state.seasonState.performances).toEqual(END.seasonState.performances);
      expect(loaded.state.seasonState.raceRatings).toEqual(END.seasonState.raceRatings);
      expect(loaded.state).toEqual(END);
    }
  }, MID_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('apply.ts · handicapper.ts · raceday.ts 에 Math.random · Date.now 가 없다', () => {
    const files = [
      'src/engine/season/apply.ts',
      'src/engine/season/handicapper.ts',
      'src/engine/season/raceday.ts',
    ];
    for (const file of files) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('Math.random');
      expect(text, file).not.toContain('Date.now');
    }
  });
});
