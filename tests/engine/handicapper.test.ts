import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { RATING_MAX, RATING_MIN } from '../../src/engine/config/population';
import {
  ANCHOR_MAX_BEATEN_L,
  FIRST_OR_RUNS,
  HANDICAP_WIN_MIN_RISE,
  MAX_DROP,
  MAX_RISE,
  RACE_STANDARD,
  RATING_HISTORY_MAX,
} from '../../src/engine/config/rating';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { loadRacecourses } from '../../src/engine/course/load';
import {
  applyRatingsInPlace,
  nextRating,
  performanceRatings,
  raceLevel,
} from '../../src/engine/season/handicapper';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type {
  Going,
  GameState,
  HorseId,
  Race,
  Racecourse,
  RaceClass,
  RaceGrade,
  RaceKind,
  RaceResult,
  RaceTemplate,
  RunnerResult,
  SeriesDefinition,
} from '../../src/engine/types';

const SEED = 20261011;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const YEAR_WEEKS = WEEKS_PER_YEAR;
const UNIT_TIMEOUT = 120_000;
/** 52주 통합 테스트 제한 시간(ms) */
const YEAR_TIMEOUT = 120_000;
const DATE = { year: START_YEAR, week: 5 };
const GOING = 'good' as Going;

const COURSES = loadRacecourses(racecoursesJson);

const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const CROWN_ID = 'test-crown';
const POINTS_ID = 'test-points';

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

/** 테스트용 G1 템플릿(가상 이름). seasonSystem.test.ts 와 같은 방식 */
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
    id: CROWN_ID,
    nameKey: 'test.crown',
    kind: 'crown',
    legs: [G1_A_ID, G1_B_ID],
    winsRequired: 2,
    bonus: 100_000,
  },
  {
    id: POINTS_ID,
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: 50_000,
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

let BASE: GameState;

beforeAll(() => {
  BASE = boot(SEED);
}, UNIT_TIMEOUT);

/** 단위 테스트용 복제 상태 + 말 id 목록 */
function freshState(n = 6): { state: GameState; ids: HorseId[] } {
  const state = structuredClone(BASE);
  const ids = Object.keys(state.horses).sort().slice(0, n);
  if (ids.length < n) throw new Error('테스트 전제 위반: 말이 부족하다');
  for (const id of ids) {
    const h = state.horses[id];
    if (h === undefined) throw new Error('말이 없다');
    h.officialRating = null;
  }
  return { state, ids };
}

function setOr(state: GameState, id: HorseId, or: number | null): void {
  const h = state.horses[id];
  if (h === undefined) throw new Error(`말 ${id} 없음`);
  h.officialRating = or;
}

function orOf(state: GameState, id: HorseId): number | null {
  const h = state.horses[id];
  if (h === undefined) throw new Error(`말 ${id} 없음`);
  return h.officialRating;
}

function conditionsRace(overrides: Partial<Race> = {}): Race {
  return {
    id: 'r-conditions',
    name: 'Test Conditions',
    racecourseId: 'ashcombe',
    distance: 1609,
    kind: 'conditions',
    grade: null,
    raceClass: 4,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
      baseWeightLb: 126,
    },
    prizeMoney: [10000, 4000, 2000],
    maxRunners: 14,
    ...overrides,
  };
}

function raceOf(kind: RaceKind, grade: RaceGrade | null, raceClass: RaceClass, maxAge: number | null): Race {
  return conditionsRace({
    id: `r-${kind}-${grade ?? 'none'}-${raceClass}-${maxAge ?? 'open'}`,
    kind,
    grade,
    raceClass,
    conditions: { ...conditionsRace().conditions, maxAge, minAge: maxAge === 2 ? 2 : 3 },
  });
}

function runner(horseId: HorseId, position: number, beaten: number, figure: number): RunnerResult {
  return {
    runnerIndex: position - 1,
    horseId,
    saddleCloth: position,
    draw: position,
    jockeyId: `j-${horseId}`,
    weightLb: 126,
    position,
    finishTime: 100 + beaten,
    margin: null,
    beatenLengths: beaten,
    sectionals: [100],
    performanceFigure: figure,
    odds: null,
  };
}

function resultOf(race: Race, runners: RunnerResult[]): RaceResult {
  return {
    raceId: race.id,
    racecourseId: race.racecourseId,
    date: { year: DATE.year, week: DATE.week },
    going: GOING,
    distance: race.distance,
    seed: 1,
    winningTime: 100,
    sectionalMarks: [],
    runners,
  };
}

/** 레이스 전 OR 과 나이 맵(state 기준) */
function mapsOf(state: GameState, result: RaceResult): { ratings: Map<HorseId, number | null>; ages: Map<HorseId, number> } {
  const ratings = new Map<HorseId, number | null>();
  const ages = new Map<HorseId, number>();
  for (const r of result.runners) {
    const h = state.horses[r.horseId];
    if (h === undefined) throw new Error('말이 없다');
    ratings.set(r.horseId, h.officialRating);
    ages.set(r.horseId, ageInYear(h.birthYear, DATE.year));
  }
  return { ratings, ages };
}

describe('config/rating 상수', () => {
  it('레이스 표준·핸디캡 표준이 명세 값이다', () => {
    expect(RACE_STANDARD.group).toEqual({ G1: 115, G2: 108, G3: 104 });
    expect(RACE_STANDARD.twoYoGroup).toEqual({ G1: 105, G2: 98, G3: 94 });
    expect(RACE_STANDARD.listed).toBe(98);
    expect(RACE_STANDARD.conditions).toBe(90);
    expect(RACE_STANDARD.handicap[2]).toBe(102);
    expect(RACE_STANDARD.handicap[3]).toBe(92);
    expect(RACE_STANDARD.handicap[7]).toBe(50);
    expect(RACE_STANDARD.maidenTwoYo).toBe(70);
    expect(RACE_STANDARD.maidenOlder).toBe(66);
    expect(RACE_STANDARD.novice).toBe(74);
    expect(RATING_HISTORY_MAX).toBe(12);
    expect(RATING_MAX).toBe(140);
  });
});

describe('수용 기준 1: 기준마 4두가 OR 대로 들어오면 변화 없음', () => {
  it('L = 100, 모든 PR = OR, OR·history 변화 없음', () => {
    const { state, ids } = freshState(4);
    const [a, b, c, d] = ids as [HorseId, HorseId, HorseId, HorseId];
    setOr(state, a, 100);
    setOr(state, b, 95);
    setOr(state, c, 90);
    setOr(state, d, 85);
    const race = conditionsRace();
    const result = resultOf(race, [runner(a, 1, 0, 0), runner(b, 2, 1, -5), runner(c, 3, 2, -10), runner(d, 4, 3, -15)]);
    const { ratings, ages } = mapsOf(state, result);

    expect(raceLevel(race, result, ratings, ages)).toBe(100);
    const prs = performanceRatings(race, result, ratings, ages);
    expect(prs.get(a)).toBe(100);
    expect(prs.get(b)).toBe(95);
    expect(prs.get(c)).toBe(90);
    expect(prs.get(d)).toBe(85);

    applyRatingsInPlace(state, race, result, DATE);
    expect([orOf(state, a), orOf(state, b), orOf(state, c), orOf(state, d)]).toEqual([100, 95, 90, 85]);
    expect(state.seasonState.ratingHistory[a] ?? []).toEqual([]);
    expect(state.seasonState.ratingHistory[d] ?? []).toEqual([]);
  });
});

describe('수용 기준 2: 기대보다 이긴 승자의 상승 (d × 0.7, MAX_RISE)', () => {
  it('기준 레벨 106 이면 승자 OR 100 → 104, 기준 레벨 120 이면 +12 상한', () => {
    const race = conditionsRace();

    // 2·3·4착은 각자 OR = 레벨 + 승자 대비 음수 성적. 승자 OR 100 은 레벨 100 으로 기준에 든다.
    {
      const { state, ids } = freshState(4);
      const [w, b, c, d] = ids as [HorseId, HorseId, HorseId, HorseId];
      setOr(state, w, 100);
      setOr(state, b, 106 - 3);
      setOr(state, c, 106 - 6);
      setOr(state, d, 106 - 9);
      const result = resultOf(race, [runner(w, 1, 0, 0), runner(b, 2, 1, -3), runner(c, 3, 2, -6), runner(d, 4, 3, -9)]);
      const { ratings, ages } = mapsOf(state, result);
      expect(raceLevel(race, result, ratings, ages)).toBe(106);
      applyRatingsInPlace(state, race, result, DATE);
      expect(orOf(state, w)).toBe(104);
      expect(orOf(state, b)).toBe(103);
      expect(orOf(state, c)).toBe(100);
      expect(orOf(state, d)).toBe(97);
      expect(state.seasonState.ratingHistory[w]).toEqual([
        { date: DATE, raceId: race.id, from: 100, to: 104 },
      ]);
    }

    // 기대보다 20 lb 이긴 승자: d = 20 → round(14) → MAX_RISE 12
    expect(nextRating(100, 120, 1, 0, race)).toBe(100 + MAX_RISE);
    expect(MAX_RISE).toBe(12);
    expect(nextRating(100, 106, 1, 0, race)).toBe(104);
  });
});

describe('수용 기준 3: 핸디캡 우승·하락 규칙', () => {
  it('핸디캡 우승마는 d ≤ 0 이어도 +2, 같은 조건 조건 레이스 우승마는 0', () => {
    const { state, ids } = freshState(4);
    const [w, b, c, d] = ids as [HorseId, HorseId, HorseId, HorseId];
    // 승자 OR 90 → 레벨 85 로 기준(85·85·85)에 맞춰 PR 85 (d = −5)
    setOr(state, w, 90);
    setOr(state, b, 80);
    setOr(state, c, 75);
    setOr(state, d, 70);
    const handicap = raceOf('handicap', null, 4, null);
    const cond = raceOf('conditions', null, 4, null);
    const result = resultOf(handicap, [runner(w, 1, 0, 0), runner(b, 2, 1, -5), runner(c, 3, 2, -10), runner(d, 4, 3, -15)]);

    expect(nextRating(90, 85, 1, 0, handicap)).toBe(90 + HANDICAP_WIN_MIN_RISE);
    expect(nextRating(90, 85, 1, 0, cond)).toBe(90);
    expect(HANDICAP_WIN_MIN_RISE).toBe(2);

    applyRatingsInPlace(state, handicap, result, DATE);
    expect(orOf(state, w)).toBe(92);
    expect(state.seasonState.ratingHistory[w]).toEqual([{ date: DATE, raceId: handicap.id, from: 90, to: 92 }]);
  });

  it('20마신 초과로 진 말은 내려가지 않고, 크게 부진해도 한 번에 −5 까지만 내려간다', () => {
    const race = conditionsRace();
    expect(nextRating(80, 60, 2, 21, race)).toBe(80);
    expect(nextRating(80, 60, 2, 20, race)).toBe(80 - MAX_DROP);
    expect(nextRating(80, 40, 3, 15, race)).toBe(80 - MAX_DROP);
    expect(nextRating(80, 72, 2, 5, race)).toBe(78);
    expect(MAX_DROP).toBe(5);
    expect(ANCHOR_MAX_BEATEN_L).toBe(10);
  });

  it('OR 결과는 RATING_MIN~RATING_MAX 를 벗어나지 않는다', () => {
    const race = conditionsRace();
    expect(nextRating(RATING_MAX, RATING_MAX + 30, 1, 0, race)).toBe(RATING_MAX);
    expect(nextRating(RATING_MIN, RATING_MIN - 30, 3, 5, race)).toBe(RATING_MIN);
  });
});

describe('수용 기준 4: OR 없는 말의 첫 OR', () => {
  it('3번째 출주 후 최고 PR 2개 평균, 항목 삭제, history 에 from null', () => {
    const { state, ids } = freshState(4);
    const [a, b, c, x] = ids as [HorseId, HorseId, HorseId, HorseId];
    setOr(state, a, 100);
    setOr(state, b, 95);
    setOr(state, c, 90);
    const race = conditionsRace({ id: 'r-unrated' });

    // 기준 레벨은 항상 100 (a·b·c 가 OR 대로). x 의 PR = 100 + 성적
    const run = (xFigure: number): RaceResult =>
      resultOf(race, [runner(a, 1, 0, 0), runner(b, 2, 1, -5), runner(c, 3, 2, -10), runner(x, 4, 3, xFigure)]);

    applyRatingsInPlace(state, race, run(-5), DATE);
    expect(orOf(state, x)).toBeNull();
    expect(state.seasonState.unratedFigures[x]).toEqual([95]);

    applyRatingsInPlace(state, race, run(0), DATE);
    expect(orOf(state, x)).toBeNull();
    expect(state.seasonState.unratedFigures[x]).toEqual([95, 100]);

    applyRatingsInPlace(state, race, run(-10), DATE);
    // 최고 PR 2개: 100, 95 → 97.5 → 반올림 98
    expect(orOf(state, x)).toBe(98);
    expect(state.seasonState.unratedFigures[x]).toBeUndefined();
    expect(state.seasonState.ratingHistory[x]).toEqual([{ date: DATE, raceId: race.id, from: null, to: 98 }]);
    expect(FIRST_OR_RUNS).toBe(3);
  });

  it('첫 출주에서 우승하면 그 즉시 OR 이 붙는다', () => {
    const { state, ids } = freshState(4);
    const [a, b, c, y] = ids as [HorseId, HorseId, HorseId, HorseId];
    setOr(state, a, 95);
    setOr(state, b, 90);
    setOr(state, c, 85);
    const race = conditionsRace({ id: 'r-first-win' });
    const result = resultOf(race, [runner(y, 1, 0, 0), runner(a, 2, 1, -5), runner(b, 3, 2, -10), runner(c, 4, 3, -15)]);
    applyRatingsInPlace(state, race, result, DATE);
    expect(orOf(state, y)).toBe(100);
    expect(state.seasonState.unratedFigures[y]).toBeUndefined();
    expect(state.seasonState.ratingHistory[y]).toEqual([{ date: DATE, raceId: race.id, from: null, to: 100 }]);
  });
});

describe('수용 기준 5: 기준마 0두(2세 메이든)', () => {
  it('L = RACE_STANDARD 메이든 2세 = 70, 3세 이상 메이든 = 66', () => {
    const { state, ids } = freshState(2);
    const [a, b] = ids as [HorseId, HorseId];
    const twoYo = raceOf('maiden', null, 5, 2);
    const older = raceOf('maiden', null, 5, null);
    const result = resultOf(twoYo, [runner(a, 1, 0, 0), runner(b, 2, 2, -4)]);
    const { ratings, ages } = mapsOf(state, result);
    ratings.set(a, null);
    ratings.set(b, null);
    expect(raceLevel(twoYo, result, ratings, ages)).toBe(70);
    expect(raceLevel(older, result, ratings, ages)).toBe(66);
    expect(performanceRatings(twoYo, result, ratings, ages).get(b)).toBe(66);
  });

  it('2세 그룹 레이스는 2세 표준(G1 105), 3세 이상 그룹은 115', () => {
    const { state, ids } = freshState(1);
    const [a] = ids as [HorseId];
    const g1Two = raceOf('group', 'G1', 1, 2);
    const g1Open = raceOf('group', 'G1', 1, null);
    const result = resultOf(g1Two, [runner(a, 1, 0, 0)]);
    const { ratings, ages } = mapsOf(state, result);
    ratings.set(a, null);
    expect(raceLevel(g1Two, result, ratings, ages)).toBe(105);
    expect(raceLevel(g1Open, result, ratings, ages)).toBe(115);
  });
});

describe('수용 기준 6: ratingHistory 최대 12건', () => {
  it('12건이 차 있을 때 한 건 더하면 가장 오래된 건이 잘린다', () => {
    const { state, ids } = freshState(4);
    const [a, b, c, d] = ids as [HorseId, HorseId, HorseId, HorseId];
    setOr(state, a, 100);
    setOr(state, b, 106 - 3);
    setOr(state, c, 106 - 6);
    setOr(state, d, 106 - 9);
    state.seasonState.ratingHistory[a] = Array.from({ length: RATING_HISTORY_MAX }, (_, i) => ({
      date: { year: START_YEAR, week: 1 },
      raceId: `old-${i}`,
      from: 50 + i,
      to: 51 + i,
    }));
    const race = conditionsRace({ id: 'r-cap' });
    const result = resultOf(race, [runner(a, 1, 0, 0), runner(b, 2, 1, -3), runner(c, 3, 2, -6), runner(d, 4, 3, -9)]);
    applyRatingsInPlace(state, race, result, DATE);

    const hist = state.seasonState.ratingHistory[a] ?? [];
    expect(hist).toHaveLength(RATING_HISTORY_MAX);
    expect(hist[0]?.raceId).toBe('old-1');
    expect(hist[hist.length - 1]).toEqual({ date: DATE, raceId: 'r-cap', from: 100, to: 104 });
  });
});

describe('엔진 순수성', () => {
  it('handicapper.ts · config/rating.ts 에 Math.random · Date.now 가 없다', () => {
    for (const file of ['src/engine/season/handicapper.ts', 'src/engine/config/rating.ts']) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('Math.random');
      expect(text, file).not.toContain('Date.now');
    }
  });
});

describe('통합: 52주 OR 진행', () => {
  it('7. 같은 시드 2회 결과 같음, OR 변동·첫 OR > 0, 시작 OR 평균 변화 −3~+3, 최고 OR ≤ 140, 분포 출력', () => {
    const t0 = Date.now();
    const yearEnd = step(BASE, YEAR_WEEKS);
    const t1 = Date.now();
    const again = step(boot(SEED), YEAR_WEEKS);
    const t2 = Date.now();
    console.log(`[handicapper] 52주 진행 ${t1 - t0} ms, 같은 시드 재실행(부팅 포함) ${t2 - t1} ms`);

    // (a) 같은 시드 = 같은 결과
    expect(again).toEqual(yearEnd);

    // (b) OR 변동 기록과 첫 OR 부여
    let orChanges = 0;
    let firstOrs = 0;
    for (const list of Object.values(yearEnd.seasonState.ratingHistory)) {
      for (const change of list) {
        if (change.from === null) firstOrs += 1;
        else orChanges += 1;
      }
    }
    expect(orChanges).toBeGreaterThan(0);
    expect(firstOrs).toBeGreaterThan(0);

    // (c) 시작 시점에 OR 이 있던 말들의 평균 변화
    const deltas: number[] = [];
    for (const h of Object.values(BASE.horses)) {
      if (h.officialRating === null) continue;
      const end = yearEnd.horses[h.id]?.officialRating;
      if (end === null || end === undefined) continue;
      deltas.push(end - h.officialRating);
    }
    const meanDelta = deltas.reduce((acc, v) => acc + v, 0) / Math.max(1, deltas.length);
    console.log(`[handicapper] 시작 OR 보유 ${deltas.length}두, 평균 변화 ${meanDelta.toFixed(3)}`);
    expect(meanDelta).toBeGreaterThanOrEqual(-3);
    expect(meanDelta).toBeLessThanOrEqual(3);

    // (d) 최고 OR ≤ 140
    const ors = Object.values(yearEnd.horses)
      .map((h) => h.officialRating)
      .filter((v): v is number => v !== null);
    const maxOr = Math.max(...ors);
    expect(maxOr).toBeLessThanOrEqual(RATING_MAX);

    // 보고용 분포: 시즌 끝(2026년) 3세 이상 OR
    const olderOrs = Object.values(yearEnd.horses)
      .filter((h) => h.officialRating !== null && ageInYear(h.birthYear, START_YEAR) >= 3)
      .map((h) => h.officialRating ?? 0)
      .sort((x, y) => x - y);
    const pct = (p: number): number => olderOrs[Math.min(olderOrs.length - 1, Math.ceil(p * olderOrs.length) - 1)] ?? 0;
    const atLeast125 = olderOrs.filter((v) => v >= 125).length;
    console.log(
      `[handicapper] 시즌 끝 OR(3세 이상 ${olderOrs.length}두): p50 ${pct(0.5)}, p90 ${pct(0.9)}, p99 ${pct(0.99)}, 최고 ${olderOrs[olderOrs.length - 1] ?? 0}, OR≥125 ${atLeast125}두`,
    );
    console.log(`[handicapper] OR 변동 ${orChanges}건, 첫 OR ${firstOrs}건, 전체 최고 OR ${maxOr}`);
  }, YEAR_TIMEOUT);
});

