import { describe, expect, it } from 'vitest';
import namesJson from '../../data/names.json';
import racecoursesJson from './fixtures/m1-racecourses.json'; // M1 기준 코스 고정(골든 보존)
import { buildRacePath } from '../../src/engine/course/path';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import { createRng } from '../../src/engine/rng';
import { buildEntries } from '../../src/engine/race/setup';
import { generateSampleField, type NamePool } from '../../src/engine/race/sampleField';
import { simulateRace } from '../../src/engine/race/simulate';
import type {
  GameDate,
  Going,
  Race,
  RaceEntry,
  RaceSimInput,
  Racecourse,
  RunnerInput,
} from '../../src/engine/types';

/** M3-A2 캠버 테스트. 골든 픽스처는 건드리지 않고 같은 코스를 복제해 마지막 코너 구간의 캠버만 바꾼다. */
const BASE_COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const NAMES: NamePool = namesJson;
const DATE: GameDate = { year: 2026, week: 20 };
const GOING: Going = 'good';
const COURSE_ID = 'ashcombe';
const LAYOUT_ID = 'ashcombe_main';
const DISTANCE = 2414;
const SIZE = 14;
const SEED = 7;

function makeRace(): Race {
  return {
    id: `camber-${COURSE_ID}-${DISTANCE}`,
    name: 'Camber Test Handicap',
    racecourseId: COURSE_ID,
    distance: DISTANCE,
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

function makeRunners(course: Racecourse): RunnerInput[] {
  const field = generateSampleField(createRng(SEED).fork('field'), {
    size: SIZE,
    distance: DISTANCE,
    surface: course.surface,
    year: 2026,
    namePool: NAMES,
  });
  const entries: RaceEntry[] = buildEntries(createRng(SEED).fork('entries'), field.requests);
  return field.runners.map((r, i) => {
    const entry = entries[i];
    if (entry === undefined) throw new Error(`entry ${i} 없음`);
    return { entry, horse: r.horse, jockey: r.jockey };
  });
}

/**
 * 기본 코스를 복제하고 마지막 bend 구간의 camber 를 바꾼다.
 * camber === undefined 이면 필드를 아예 쓰지 않는다(생략 = 0 검증용).
 */
function courseWithLastBendCamber(camber: number | undefined): Racecourse {
  const base = getRacecourse(BASE_COURSES, COURSE_ID);
  const copy = structuredClone(base);
  const layout = copy.layouts.find((l) => l.id === LAYOUT_ID);
  if (layout === undefined) throw new Error('레이아웃 없음');
  let lastBend = -1;
  layout.segments.forEach((seg, i) => {
    if (seg.kind === 'bend') lastBend = i;
  });
  const seg = layout.segments[lastBend];
  if (seg === undefined) throw new Error('bend 구간 없음');
  if (camber === undefined) {
    delete seg.camber;
  } else {
    seg.camber = camber;
  }
  return copy;
}

function simulate(course: Racecourse) {
  const input: RaceSimInput = {
    race: makeRace(),
    course,
    going: GOING,
    date: DATE,
    runners: makeRunners(course),
    seed: SEED,
    options: { recordReplay: true },
  };
  return simulateRace(input);
}

/**
 * 마지막 코너 구간에 있는 주자들의 평균 레인.
 * 구간 판정은 캠버를 +1 로 둔 코스의 경로(section)로 한다. 세 실행이 같은 위치 집합을 보도록 하기 위함이다.
 */
function meanLaneOnCamberedSection(
  section: ReturnType<typeof buildRacePath>,
  frames: { progress: number[]; lane: number[] }[],
): number {
  let sum = 0;
  let count = 0;
  for (const frame of frames) {
    frame.progress.forEach((p, i) => {
      if (section.sample(p).camber === 0) return;
      sum += frame.lane[i] ?? 0;
      count += 1;
    });
  }
  if (count === 0) throw new Error('캠버 구간을 통과한 샘플이 없음');
  return sum / count;
}

describe('캠버(횡경사) 반영 (M3-A2)', () => {
  it('같은 시드에서 마지막 코너 캠버 +1 은 평균 레인을 안쪽으로, −1 은 바깥쪽으로 옮긴다', () => {
    const neutral = simulate(courseWithLastBendCamber(0));
    const inward = simulate(courseWithLastBendCamber(1));
    const outward = simulate(courseWithLastBendCamber(-1));

    const section = buildRacePath(courseWithLastBendCamber(1), DISTANCE);
    const meanNeutral = meanLaneOnCamberedSection(section, neutral.replay?.frames ?? []);
    const meanInward = meanLaneOnCamberedSection(section, inward.replay?.frames ?? []);
    const meanOutward = meanLaneOnCamberedSection(section, outward.replay?.frames ?? []);

    expect(meanInward).toBeLessThan(meanNeutral);
    expect(meanOutward).toBeGreaterThan(meanNeutral);
  });

  it('camber 를 생략한 구간과 camber 0 인 구간의 결과는 비트 단위로 같다', () => {
    const omitted = simulate(courseWithLastBendCamber(undefined));
    const zero = simulate(courseWithLastBendCamber(0));
    expect(zero.result).toEqual(omitted.result);
    expect(zero.replay).toEqual(omitted.replay);
  });

  it('camber 가 −1~+1 범위 밖(1.5)이면 loadRacecourses 가 오류를 낸다', () => {
    const bad = [courseWithLastBendCamber(1.5)];
    expect(() => loadRacecourses(bad)).toThrow(/camber/);
  });

  it('camber 가 숫자가 아니면 loadRacecourses 가 오류를 낸다', () => {
    const bad = structuredClone(getRacecourse(BASE_COURSES, COURSE_ID));
    const seg = bad.layouts[0]?.segments[0] as { camber?: unknown } | undefined;
    if (seg === undefined) throw new Error('fixture');
    seg.camber = 'steep';
    expect(() => loadRacecourses([bad])).toThrow(/camber/);
  });
});
