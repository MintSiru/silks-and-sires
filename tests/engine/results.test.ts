import { describe, expect, it } from 'vitest';
import { SECTIONAL_STEP_M } from '../../src/engine/config/results';
import {
  buildRaceResult,
  formatMargin,
  formatMarginKo,
  lbPerLength,
  marginFromLengths,
  sectionalMarks,
} from '../../src/engine/race/results';
import type { FinishRecord, GameDate, Race, RaceEntry } from '../../src/engine/types';

const DATE: GameDate = { year: 2026, week: 20 };

function makeRace(distance: number): Race {
  return {
    id: 'race-test',
    name: 'Test Stakes',
    racecourseId: 'course-test',
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
    maxRunners: 10,
  };
}

function makeEntry(index: number, weightLb = 126): RaceEntry {
  return {
    horseId: `horse-${index + 1}`,
    saddleCloth: index + 1,
    draw: index + 1,
    jockeyId: `jockey-${index + 1}`,
    weightLb,
    tactic: 'prominent',
    silks: { primary: '#112233', secondary: '#ffffff', pattern: 'plain' },
    isPlayer: false,
    odds: { num: 5, den: 2 },
  };
}

/** 5두 픽스처. runner index i 의 finishTime 은 FINISH_TIMES[i], 마번 = i+1 */
const FINISH_TIMES = [60.0, 60.001, 60.3, 61.0, 70.0];

describe('sectionalMarks', () => {
  it('1609m 은 7개 표지, 첫 값 ≈ 200.82, 마지막 값 ≈ 1407.83', () => {
    const marks = sectionalMarks(1609);
    expect(marks).toHaveLength(7);
    expect(marks[0]).toBeCloseTo(200.82, 1);
    expect(marks[marks.length - 1]).toBeCloseTo(1407.83, 1);
  });

  it('2012m 은 9개 표지, 첫 값 ≈ 201.49 (짧은 첫 구간 생략)', () => {
    const marks = sectionalMarks(2012);
    expect(marks).toHaveLength(9);
    expect(marks[0]).toBeCloseTo(201.49, 1);
  });

  it('1006m 은 4개 표지', () => {
    expect(sectionalMarks(1006)).toHaveLength(4);
  });

  it('모든 결과는 오름차순이며 distance 미만', () => {
    for (const d of [1006, 1207, 1408, 1609, 2012, 2414, 3219]) {
      const marks = sectionalMarks(d);
      for (let i = 1; i < marks.length; i++) {
        expect(marks[i]).toBeGreaterThan(marks[i - 1] ?? Number.NEGATIVE_INFINITY);
      }
      for (const m of marks) {
        expect(m).toBeLessThan(d);
      }
      expect(marks[marks.length - 1] ?? 0).toBeLessThanOrEqual(d - SECTIONAL_STEP_M + 1e-9);
    }
  });
});

describe('marginFromLengths', () => {
  it('마신 미만 라벨', () => {
    expect(marginFromLengths(0.05)).toEqual({ label: 'nose', lengths: 0 });
    expect(marginFromLengths(0.15)).toEqual({ label: 'short_head', lengths: 0 });
    expect(marginFromLengths(0.25)).toEqual({ label: 'head', lengths: 0 });
    expect(marginFromLengths(0.4)).toEqual({ label: 'neck', lengths: 0 });
  });

  it('동착 플래그', () => {
    expect(marginFromLengths(0, true)).toEqual({ label: 'dead_heat', lengths: 0 });
    expect(marginFromLengths(5, true)).toEqual({ label: 'dead_heat', lengths: 0 });
  });

  it('0.25 / 0.5 단위 반올림 (0.9 는 명세 충돌로 제외, 보고서 참고)', () => {
    expect(marginFromLengths(0.6)).toEqual({ label: 'lengths', lengths: 0.5 });
    expect(marginFromLengths(1.1)).toEqual({ label: 'lengths', lengths: 1 });
    expect(marginFromLengths(2.9)).toEqual({ label: 'lengths', lengths: 3 });
    expect(marginFromLengths(3.3)).toEqual({ label: 'lengths', lengths: 3.5 });
    expect(marginFromLengths(4.8)).toEqual({ label: 'lengths', lengths: 5 });
    expect(marginFromLengths(7.4)).toEqual({ label: 'lengths', lengths: 7 });
  });

  it('30마신 이상은 distance', () => {
    expect(marginFromLengths(31)).toEqual({ label: 'distance', lengths: 0 });
  });
});

describe('formatMargin / formatMarginKo', () => {
  it('영문 약어', () => {
    expect(formatMargin({ label: 'dead_heat', lengths: 0 })).toBe('dh');
    expect(formatMargin({ label: 'nose', lengths: 0 })).toBe('nse');
    expect(formatMargin({ label: 'short_head', lengths: 0 })).toBe('shd');
    expect(formatMargin({ label: 'head', lengths: 0 })).toBe('hd');
    expect(formatMargin({ label: 'neck', lengths: 0 })).toBe('nk');
    expect(formatMargin({ label: 'distance', lengths: 0 })).toBe('dist');
    expect(formatMargin({ label: 'lengths', lengths: 0.5 })).toBe('½');
    expect(formatMargin({ label: 'lengths', lengths: 1.25 })).toBe('1¼');
    expect(formatMargin({ label: 'lengths', lengths: 3 })).toBe('3');
  });

  it('한국어 표기', () => {
    expect(formatMarginKo({ label: 'dead_heat', lengths: 0 })).toBe('동착');
    expect(formatMarginKo({ label: 'nose', lengths: 0 })).toBe('코');
    expect(formatMarginKo({ label: 'short_head', lengths: 0 })).toBe('짧은 머리');
    expect(formatMarginKo({ label: 'head', lengths: 0 })).toBe('머리');
    expect(formatMarginKo({ label: 'neck', lengths: 0 })).toBe('목');
    expect(formatMarginKo({ label: 'distance', lengths: 0 })).toBe('대차');
    expect(formatMarginKo({ label: 'lengths', lengths: 1.25 })).toBe('1¼마신');
  });
});

describe('lbPerLength', () => {
  it('표 값과 일치, 양끝 밖은 끝값, 중간은 선형 보간', () => {
    expect(lbPerLength(1609)).toBe(2);
    expect(lbPerLength(1006)).toBe(3);
    expect(lbPerLength(500)).toBe(3);
    expect(lbPerLength(5000)).toBe(1.25);
    // 1609 (2) ~ 2012 (1.75) 의 중간 1810.5 → 1.875
    expect(lbPerLength(1810.5)).toBeCloseTo(1.875, 6);
  });
});

describe('buildRaceResult', () => {
  const entries = [0, 1, 2, 3, 4].map((i) => makeEntry(i));
  const shuffled: FinishRecord[] = [4, 2, 0, 3, 1].map((i) => ({
    runnerIndex: i,
    finishTime: FINISH_TIMES[i] ?? 0,
    markTimes: [],
  }));

  it('5두 픽스처: 동착·착차 라벨·대차', () => {
    const r = buildRaceResult({
      race: makeRace(1609),
      going: 'good',
      date: DATE,
      seed: 1,
      entries,
      finishes: shuffled,
      marks: [],
    });
    const runners = r.runners;
    expect(runners).toHaveLength(5);

    // 1·2번째 동착
    expect(runners[0]?.runnerIndex).toBe(0);
    expect(runners[1]?.runnerIndex).toBe(1);
    expect(runners[0]?.position).toBe(1);
    expect(runners[1]?.position).toBe(1);
    expect(runners[0]?.margin).toBeNull();
    expect(runners[1]?.margin).toBeNull();

    // 3번째: Δ=0.299s → 1.6445L → 1.75
    expect(runners[2]?.position).toBe(3);
    expect(runners[2]?.margin).toEqual({ label: 'lengths', lengths: 1.75 });

    // 4번째: Δ=0.7s → 3.85L → 4
    expect(runners[3]?.position).toBe(4);
    expect(runners[3]?.margin).toEqual({ label: 'lengths', lengths: 4 });

    // 5번째: Δ=9s → 49.5L → distance
    expect(runners[4]?.position).toBe(5);
    expect(runners[4]?.margin).toEqual({ label: 'distance', lengths: 0 });

    expect(r.winningTime).toBe(60.0);
    expect(r.going).toBe('good');
    expect(r.distance).toBe(1609);
    expect(r.raceId).toBe('race-test');
    expect(r.runners[0]?.odds).toEqual({ num: 5, den: 2 });
  });

  it('성적 지수: 1착 0, 1마일 1마신 패배 동일 중량 -2.0, 5lb 무거우면 3.0', () => {
    const finishes: FinishRecord[] = [
      { runnerIndex: 0, finishTime: 100, markTimes: [] },
      { runnerIndex: 1, finishTime: 100 + 1 / 5.5, markTimes: [] },
    ];
    const sameWeight = buildRaceResult({
      race: makeRace(1609),
      going: 'good',
      date: DATE,
      seed: 1,
      entries: [makeEntry(0), makeEntry(1)],
      finishes,
      marks: [],
    });
    expect(sameWeight.runners[0]?.performanceFigure).toBe(0);
    expect(sameWeight.runners[1]?.performanceFigure).toBe(-2);

    const heavier = buildRaceResult({
      race: makeRace(1609),
      going: 'good',
      date: DATE,
      seed: 1,
      entries: [makeEntry(0, 126), makeEntry(1, 131)],
      finishes,
      marks: [],
    });
    expect(heavier.runners[1]?.performanceFigure).toBe(3);
  });

  it('구간 타임 합 = finishTime', () => {
    const marks = sectionalMarks(1609);
    const finishes: FinishRecord[] = [0, 1, 2, 3, 4].map((i) => {
      const finishTime = FINISH_TIMES[i] ?? 0;
      return {
        runnerIndex: i,
        finishTime,
        markTimes: marks.map((m, k) => (finishTime * (m / 1609)) + k * 0.0001),
      };
    });
    const r = buildRaceResult({
      race: makeRace(1609),
      going: 'good',
      date: DATE,
      seed: 1,
      entries,
      finishes,
      marks,
    });
    for (const runner of r.runners) {
      const sum = runner.sectionals.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - runner.finishTime)).toBeLessThanOrEqual(1e-9);
      expect(runner.sectionals).toHaveLength(marks.length + 1);
    }
    expect(r.sectionalMarks).toEqual(marks);
  });

  it('marks 가 비면 sectionals 는 [finishTime]', () => {
    const r = buildRaceResult({
      race: makeRace(1609),
      going: 'good',
      date: DATE,
      seed: 1,
      entries,
      finishes: shuffled,
      marks: [],
    });
    expect(r.runners[0]?.sectionals).toEqual([60.0]);
  });

  it('finishes 누락 또는 중복 runnerIndex 는 throw', () => {
    const missing = shuffled.slice(1);
    expect(() =>
      buildRaceResult({
        race: makeRace(1609),
        going: 'good',
        date: DATE,
        seed: 1,
        entries,
        finishes: missing,
        marks: [],
      }),
    ).toThrow();

    const dup: FinishRecord[] = [
      { runnerIndex: 0, finishTime: 60, markTimes: [] },
      { runnerIndex: 0, finishTime: 61, markTimes: [] },
      { runnerIndex: 2, finishTime: 62, markTimes: [] },
      { runnerIndex: 3, finishTime: 63, markTimes: [] },
      { runnerIndex: 4, finishTime: 64, markTimes: [] },
    ];
    expect(() =>
      buildRaceResult({
        race: makeRace(1609),
        going: 'good',
        date: DATE,
        seed: 1,
        entries,
        finishes: dup,
        marks: [],
      }),
    ).toThrow();
  });
});
