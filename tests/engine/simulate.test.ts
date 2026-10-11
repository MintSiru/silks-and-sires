import { describe, expect, it } from 'vitest';
import namesJson from '../../data/names.json';
import racecoursesJson from '../../data/racecourses.json';
import { buildRacePath } from '../../src/engine/course/path';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import { LANE_MIN_M } from '../../src/engine/config/runner';
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

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const NAMES: NamePool = namesJson;
const DATE: GameDate = { year: 2026, week: 20 };
const GOING: Going = 'good';

function makeRace(courseId: string, distance: number): Race {
  return {
    id: `test-${courseId}-${distance}`,
    name: 'Test Handicap',
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

function makeInput(
  courseId: string,
  distance: number,
  size: number,
  seed: number,
  recordReplay?: boolean,
): RaceSimInput {
  const course = getRacecourse(COURSES, courseId);
  return {
    race: makeRace(courseId, distance),
    course,
    going: GOING,
    date: DATE,
    runners: makeRunners(courseId, distance, size, seed),
    seed,
    options: recordReplay === undefined ? undefined : { recordReplay },
  };
}

function winnerIndex(input: RaceSimInput): number {
  const { result } = simulateRace(input);
  const first = result.runners[0];
  if (first === undefined) throw new Error('결과 없음');
  return first.runnerIndex;
}

describe('simulateRace 재현성', () => {
  it('같은 입력으로 두 번 실행하면 result 와 replay 가 완전히 같다', () => {
    const input = makeInput('saint_ourens', 1600, 10, 42);
    const a = simulateRace(input);
    const b = simulateRace(input);
    expect(a.result).toEqual(b.result);
    expect(a.replay).toEqual(b.replay);
  });

  it('시드 5개 중 적어도 하나는 우승마가 다르다', () => {
    const winners = new Set<number>();
    for (let seed = 1; seed <= 5; seed++) {
      winners.add(winnerIndex(makeInput('saint_ourens', 1600, 10, seed)));
    }
    expect(winners.size).toBeGreaterThan(1);
  });
});

describe('simulateRace 결과 구조', () => {
  it('모든 말이 결승하고 착순·시각·구간 타임이 일관된다', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { result } = simulateRace(makeInput('saint_ourens', 2000, 10, seed));
      expect(result.runners).toHaveLength(10);

      const first = result.runners[0];
      expect(first?.position).toBe(1);

      let prevTime = -Infinity;
      for (const r of result.runners) {
        expect(Number.isFinite(r.finishTime)).toBe(true);
        expect(r.finishTime).toBeGreaterThanOrEqual(prevTime);
        prevTime = r.finishTime;
        const sum = r.sectionals.reduce((acc, v) => acc + v, 0);
        expect(Math.abs(sum - r.finishTime)).toBeLessThanOrEqual(1e-6);
      }
    }
  });
});

describe('simulateRace 현실적 시간', () => {
  /** 평균 수준 말 10두, going good, 시드 10개의 평균 우승 시간 */
  function averageWinningTime(courseId: string, distance: number): number {
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { result } = simulateRace(makeInput(courseId, distance, 10, seed, false));
      total += result.winningTime;
    }
    return total / 10;
  }

  it('saint_ourens 1600m 평균 우승 시간이 92~102초 범위다', () => {
    const avg = averageWinningTime('saint_ourens', 1600);
    expect(avg).toBeGreaterThanOrEqual(92);
    expect(avg).toBeLessThanOrEqual(102);
  });

  it('saint_ourens 2400m 평균 우승 시간이 143~158초 범위다', () => {
    const avg = averageWinningTime('saint_ourens', 2400);
    expect(avg).toBeGreaterThanOrEqual(143);
    expect(avg).toBeLessThanOrEqual(158);
  });

  it('marlow_downs 1006m 평균 우승 시간이 56~64초 범위다', () => {
    const avg = averageWinningTime('marlow_downs', 1006);
    expect(avg).toBeGreaterThanOrEqual(56);
    expect(avg).toBeLessThanOrEqual(64);
  });
});

describe('simulateRace 능력 차 반영', () => {
  // 현실형 변동성(인기 1위 승률 약 30%) 기준. 10두 평균 승률 10%.
  function boostedWins(boost: number): number {
    let wins = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const base = makeRunners('saint_ourens', 1600, 10, seed);
      const boosted = base.map((r, i) =>
        i === 0
          ? {
              ...r,
              horse: {
                ...r.horse,
                ability: {
                  ...r.horse.ability,
                  speed: r.horse.ability.speed + boost,
                  acceleration: r.horse.ability.acceleration + boost,
                },
              },
            }
          : r,
      );
      const input: RaceSimInput = {
        race: makeRace('saint_ourens', 1600),
        course: getRacecourse(COURSES, 'saint_ourens'),
        going: GOING,
        date: DATE,
        runners: boosted,
        seed,
        options: { recordReplay: false },
      };
      if (winnerIndex(input) === 0) wins++;
    }
    return wins;
  }

  it('speed·acceleration +25 인 말이 50 시드 중 15회 이상 우승한다 (평균의 3배)', () => {
    expect(boostedWins(25)).toBeGreaterThanOrEqual(15);
  });

  it('speed·acceleration +40 인 말이 50 시드 중 32회 이상 우승한다', () => {
    expect(boostedWins(40)).toBeGreaterThanOrEqual(32);
  });
});

describe('simulateRace 리플레이', () => {
  it('프레임 시각·길이·종료 위치·레인 범위가 규격을 따른다', () => {
    const courseId = 'saint_ourens';
    const distance = 1600;
    const input = makeInput(courseId, distance, 10, 7);
    const { replay } = simulateRace(input);
    expect(replay).not.toBeNull();
    if (replay === null) return;

    const n = input.runners.length;
    const frames = replay.frames;
    const first = frames[0];
    expect(first?.t).toBe(0);
    expect(replay.tickSeconds).toBe(0.1);
    expect(replay.horseIds).toHaveLength(n);

    for (let k = 0; k + 1 < frames.length; k++) {
      const a = frames[k];
      const b = frames[k + 1];
      if (a === undefined || b === undefined) throw new Error('프레임 누락');
      expect(Math.abs(b.t - a.t - 0.1)).toBeLessThanOrEqual(1e-9);
    }

    const width = buildRacePath(input.course, distance).width;
    for (const f of frames) {
      expect(f.progress).toHaveLength(n);
      expect(f.lane).toHaveLength(n);
      expect(f.speed).toHaveLength(n);
      for (const l of f.lane) {
        expect(l).toBeGreaterThanOrEqual(LANE_MIN_M);
        expect(l).toBeLessThanOrEqual(width - LANE_MIN_M);
      }
    }

    const last = frames[frames.length - 1];
    expect(last).toBeDefined();
    for (const p of last?.progress ?? []) {
      expect(p).toBeGreaterThanOrEqual(distance);
    }
  });
});

describe('simulateRace 옵션', () => {
  it('recordReplay=false 면 replay 는 null 이고 result 는 기록 시와 같다', () => {
    const withReplay = simulateRace(makeInput('saint_ourens', 1600, 10, 11, true));
    const withoutReplay = simulateRace(makeInput('saint_ourens', 1600, 10, 11, false));
    expect(withoutReplay.replay).toBeNull();
    expect(withoutReplay.result).toEqual(withReplay.result);
  });
});

describe('simulateRace 성능', () => {
  it('20두 3000m 리플레이 포함 워밍업 5회 후 31회 중앙값 50ms 미만이다', () => {
    const input = makeInput('saint_ourens', 3000, 20, 99, true);
    for (let w = 0; w < 5; w++) simulateRace(input);
    const times: number[] = [];
    for (let r = 0; r < 31; r++) {
      const start = performance.now();
      simulateRace(input);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[15] as number;
    expect(median).toBeLessThan(50);
  });
});
