import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import namesJson from '../../data/names.json';
import racecoursesJson from '../../data/racecourses.json';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath } from '../../src/engine/course/path';
import { createRng } from '../../src/engine/rng';
import { buildEntries } from '../../src/engine/race/setup';
import { generateSampleField, type NamePool } from '../../src/engine/race/sampleField';
import { simulateRace } from '../../src/engine/race/simulate';
import type {
  GameDate,
  Going,
  Race,
  RaceEntry,
  RaceResult,
  RaceSimInput,
  Racecourse,
  RunnerInput,
} from '../../src/engine/types';

/**
 * 최적화 전후 결과 불변 검증.
 * 골든 생성: GENERATE=1 npx vitest run tests/engine/simGolden.test.ts
 * (골든은 최적화 전 구현으로 한 번만 만든다. 이후 시뮬레이션 규칙을 의도적으로 바꿀 때만 재생성한다.)
 */
const GENERATE = process.env.GENERATE === '1';
const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/sim-golden.json', import.meta.url));
const TOLERANCE = 1e-6;
const DATE: GameDate = { year: 2026, week: 20 };
const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const NAMES: NamePool = namesJson;

interface GoldenCase {
  key: string;
  courseId: string;
  distance: number;
  size: number;
  seed: number;
}

/** 골든 설정 8개. 잔디는 good, AW(ardvarrow_park)는 standard. */
const CASES: GoldenCase[] = [
  { key: 'saint_ourens-3000-20-99', courseId: 'saint_ourens', distance: 3000, size: 20, seed: 99 },
  { key: 'saint_ourens-1600-10-1', courseId: 'saint_ourens', distance: 1600, size: 10, seed: 1 },
  { key: 'ashcombe-2414-14-7', courseId: 'ashcombe', distance: 2414, size: 14, seed: 7 },
  { key: 'ashcombe-1006-8-3', courseId: 'ashcombe', distance: 1006, size: 8, seed: 3 },
  { key: 'marlow_downs-1006-20-11', courseId: 'marlow_downs', distance: 1006, size: 20, seed: 11 },
  { key: 'marlow_downs-3219-12-5', courseId: 'marlow_downs', distance: 3219, size: 12, seed: 5 },
  { key: 'ardvarrow_park-1207-14-21', courseId: 'ardvarrow_park', distance: 1207, size: 14, seed: 21 },
  { key: 'ardvarrow_park-2816-10-8', courseId: 'ardvarrow_park', distance: 2816, size: 10, seed: 8 },
];

interface GoldenFile {
  cases: { key: string; result: RaceResult }[];
}

function goingFor(courseId: string): Going {
  const course = getRacecourse(COURSES, courseId);
  return course.surface === 'aw' ? 'standard' : 'good';
}

function makeRace(courseId: string, distance: number): Race {
  return {
    id: `golden-${courseId}-${distance}`,
    name: 'Golden Handicap',
    racecourseId: courseId,
    distance,
    kind: 'handicap',
    grade: null,
    raceClass: 5,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'handicap',
      baseWeightLb: 126,
    },
    prizeMoney: [10000, 4000, 2000],
    maxRunners: 20,
  };
}

/** 샘플 필드 + 게이트 추첨으로 출주 입력을 만든다. 같은 seed = 같은 필드. */
function makeRunners(courseId: string, distance: number, size: number, seed: number): RunnerInput[] {
  const course = getRacecourse(COURSES, courseId);
  const field = generateSampleField(createRng(seed).fork('field'), {
    size,
    distance,
    surface: course.surface,
    year: 2026,
    namePool: NAMES,
  });
  const entries: RaceEntry[] = buildEntries(createRng(seed).fork('entries'), field.requests);
  return field.runners.map((r, i) => {
    const entry = entries[i];
    if (entry === undefined) throw new Error(`entry ${i} 없음`);
    return { entry, horse: r.horse, jockey: r.jockey };
  });
}

function makeInput(c: GoldenCase, recordReplay?: boolean): RaceSimInput {
  return {
    race: makeRace(c.courseId, c.distance),
    course: getRacecourse(COURSES, c.courseId),
    going: goingFor(c.courseId),
    date: DATE,
    runners: makeRunners(c.courseId, c.distance, c.size, c.seed),
    seed: c.seed,
    options: recordReplay === undefined ? undefined : { recordReplay },
  };
}

function readGolden(): GoldenFile {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GoldenFile;
}

function expectClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > TOLERANCE) {
    throw new Error(`${label}: ${actual} != ${expected} (허용 ${TOLERANCE})`);
  }
}

function expectSameResult(actual: RaceResult, expected: RaceResult): void {
  expect(actual.raceId).toBe(expected.raceId);
  expect(actual.going).toBe(expected.going);
  expect(actual.distance).toBe(expected.distance);
  expect(actual.seed).toBe(expected.seed);
  expect(actual.sectionalMarks).toEqual(expected.sectionalMarks);
  expect(actual.runners).toHaveLength(expected.runners.length);
  expectClose(actual.winningTime, expected.winningTime, 'winningTime');

  actual.runners.forEach((a, i) => {
    const e = expected.runners[i];
    if (e === undefined) throw new Error(`골든 착순 ${i} 없음`);
    const label = `runners[${i}]`;
    // 착순 순서(runnerIndex, position)는 완전히 같아야 한다.
    expect(a.runnerIndex, `${label}.runnerIndex`).toBe(e.runnerIndex);
    expect(a.position, `${label}.position`).toBe(e.position);
    expect(a.horseId, `${label}.horseId`).toBe(e.horseId);
    expect(a.saddleCloth, `${label}.saddleCloth`).toBe(e.saddleCloth);
    expect(a.draw, `${label}.draw`).toBe(e.draw);
    expectClose(a.finishTime, e.finishTime, `${label}.finishTime`);
    expectClose(a.beatenLengths, e.beatenLengths, `${label}.beatenLengths`);
    expectClose(a.performanceFigure, e.performanceFigure, `${label}.performanceFigure`);
    expect(a.margin?.label ?? null, `${label}.margin.label`).toBe(e.margin?.label ?? null);
    expectClose(a.margin?.lengths ?? 0, e.margin?.lengths ?? 0, `${label}.margin.lengths`);
    expect(a.sectionals).toHaveLength(e.sectionals.length);
    a.sectionals.forEach((v, k) => {
      expectClose(v, e.sectionals[k] ?? NaN, `${label}.sectionals[${k}]`);
    });
  });
}

describe('simulateRace 골든 생성', () => {
  it.skipIf(!GENERATE)('현재 구현으로 sim-golden.json 을 쓴다', () => {
    const out: GoldenFile = {
      cases: CASES.map((c) => ({ key: c.key, result: simulateRace(makeInput(c)).result })),
    };
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    expect(out.cases).toHaveLength(CASES.length);
  });
});

describe('simulateRace 골든 비교', () => {
  for (const c of CASES) {
    it.skipIf(GENERATE)(`${c.key} 결과가 골든과 같다`, () => {
      const golden = readGolden().cases.find((g) => g.key === c.key);
      if (golden === undefined) throw new Error(`골든 누락: ${c.key}`);
      const { result } = simulateRace(makeInput(c));
      expectSameResult(result, golden.result);
    });
  }
});

describe('simulateRace 성능 (골든 설정, 리플레이 포함)', () => {
  it.skipIf(GENERATE)('20두 3000m 리플레이 포함 워밍업 5회 후 31회 중앙값 35ms 미만이다', () => {
    const input = makeInput(CASES[0] as GoldenCase, true);
    for (let w = 0; w < 5; w++) simulateRace(input);
    const times: number[] = [];
    for (let r = 0; r < 31; r++) {
      const start = performance.now();
      simulateRace(input);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[15] as number;
    expect(median).toBeLessThan(35);
  });
});

describe('RacePath.sampleInto 과 sample 의 값 일치', () => {
  it.skipIf(GENERATE)('골든 설정 8개 경로에서 s = 0, 500, 1000, distance, distance+50 모두 같은 값을 준다', () => {
    for (const c of CASES) {
      const path = buildRacePath(getRacecourse(COURSES, c.courseId), c.distance);
      const out = path.sample(0);
      for (const s of [0, 500, 1000, c.distance, c.distance + 50]) {
        const expected = path.sample(s);
        const actual = path.sampleInto(s, out);
        expect(actual, `${c.key} s=${s}`).toBe(out);
        expect(actual, `${c.key} s=${s}`).toEqual(expected);
      }
    }
  });
});
