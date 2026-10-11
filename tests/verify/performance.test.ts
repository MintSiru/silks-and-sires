import { describe, expect, it } from 'vitest';
import { getNamePool, getRace, getRacecourse } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { generateSampleField } from '../../src/engine/race/sampleField';
import { runRace } from '../../src/engine/race/runRace';
import type { GameDate, Race } from '../../src/engine/types';

/** 지표 출력. console.log 는 기본 리포터에서 숨겨지므로 stdout 에 직접 쓴다. */
function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/** VERIFY=1 이면 전체 횟수, 아니면 빠른 기본 횟수 */
const FULL = !!process.env.VERIFY;
const TIMED_RUNS = FULL ? 200 : 20;
const WARMUP_RUNS = 5;
const FIELD_SIZE = 20;
const MEAN_LIMIT_MS = 50;
const P95_LIMIT_MS = 80;
const DATE: GameDate = { year: 2026, week: 24 };
const LEVEL = 60;

/**
 * saint_ourens 3000m 레이스는 데이터에 없으므로 그랜드 프리를 복사해 거리만 3000 으로 바꾼다.
 * 20두를 출주시키려면 maxRunners 도 20 이상이어야 runRace 가 받아들이므로 함께 올린다.
 */
function perfRace(): Race {
  const base = getRace('saint_ourens_grand_prix');
  return { ...base, distance: 3000, maxRunners: FIELD_SIZE };
}

/** 레이스 1회 = 필드 생성 + runRace(replay 포함). seed 만 바꿔 호출한다. */
function oneRace(seed: number): void {
  const race = perfRace();
  const course = getRacecourse(race.racecourseId);
  const field = generateSampleField(createRng(seed).fork('field'), {
    size: FIELD_SIZE,
    distance: race.distance,
    surface: course.surface,
    year: DATE.year,
    namePool: getNamePool(),
    level: LEVEL,
  });
  runRace({ race, course, going: 'good', date: DATE, seed, field, recordReplay: true });
}

function at(sorted: readonly number[], index: number): number {
  const v = sorted[index];
  if (v === undefined) {
    throw new RangeError(`인덱스 범위 밖 (${index})`);
  }
  return v;
}

describe('성능: 20두 3000m 레이스(replay 포함) 1회', () => {
  it(`워밍업 ${WARMUP_RUNS}회 후 ${TIMED_RUNS}회 측정 (평균 < ${MEAN_LIMIT_MS}ms, p95 < ${P95_LIMIT_MS}ms)`, () => {
    for (let i = 0; i < WARMUP_RUNS; i++) {
      oneRace(1 + i);
    }

    const times: number[] = [];
    for (let i = 0; i < TIMED_RUNS; i++) {
      const t0 = performance.now();
      oneRace(1000 + i);
      times.push(performance.now() - t0);
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = at(sorted, Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1));
    const max = at(sorted, sorted.length - 1);

    say(
      `[성능] 측정 ${TIMED_RUNS}회 (측정 범위: 필드 생성 + runRace, replay 포함) ` +
        `평균 ${mean.toFixed(2)}ms / p95 ${p95.toFixed(2)}ms / 최대 ${max.toFixed(2)}ms ` +
        `| 기준 평균<${MEAN_LIMIT_MS} ${mean < MEAN_LIMIT_MS ? '충족' : '미충족'}, ` +
        `p95<${P95_LIMIT_MS} ${p95 < P95_LIMIT_MS ? '충족' : '미충족'}`,
    );

    // 기본 모드는 횟수가 적어 소음이 크므로 출력만 하고, 전체 모드에서 기준을 단언한다.
    if (FULL) {
      expect(mean).toBeLessThan(MEAN_LIMIT_MS);
      expect(p95).toBeLessThan(P95_LIMIT_MS);
    }
  }, FULL ? 900_000 : 60_000);
});
