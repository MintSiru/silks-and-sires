import { describe, expect, it } from 'vitest';
import {
  AW_APTITUDE_EFFECT,
  GOING_LABELS,
  GOING_MONTH_BASE,
  GOING_POWER_WEIGHT,
  GOING_SPEED_FACTOR,
  GOING_STAMINA_DRAIN,
  LENGTHS_PER_SECOND,
} from '../../src/engine/config/going';
import {
  goingFit,
  goingLabel,
  isAwGoing,
  isGoingValidForSurface,
  isTurfGoing,
  rollGoing,
  turfGoingFromIndex,
  turfGoingIndex,
} from '../../src/engine/going/going';
import { createRng } from '../../src/engine/rng';
import { AW_GOING_ORDER, TURF_GOING_ORDER } from '../../src/engine/types';
import type { Going, TurfGoing } from '../../src/engine/types';

const ALL_GOINGS: Going[] = [...TURF_GOING_ORDER, ...AW_GOING_ORDER];

describe('수용 기준 1: 잔디 마장 인덱스 왕복', () => {
  it('7단계 전부 turfGoingIndex → turfGoingFromIndex 왕복이 일치한다', () => {
    TURF_GOING_ORDER.forEach((g, i) => {
      expect(turfGoingIndex(g)).toBe(i);
      expect(turfGoingFromIndex(turfGoingIndex(g))).toBe(g);
    });
  });

  it('범위를 벗어난 인덱스는 clamp 되고, 반올림된다', () => {
    expect(turfGoingFromIndex(-3)).toBe('firm');
    expect(turfGoingFromIndex(9)).toBe('heavy');
    expect(turfGoingFromIndex(2.4)).toBe('good');
    expect(turfGoingFromIndex(2.6)).toBe('good_to_soft');
  });

  it('NaN 인덱스는 RangeError', () => {
    expect(() => turfGoingFromIndex(Number.NaN)).toThrow(RangeError);
  });

  it('AW 마장을 turfGoingIndex 에 넣으면 RangeError', () => {
    expect(() => turfGoingIndex('standard' as unknown as TurfGoing)).toThrow(RangeError);
  });
});

describe('마장 분류·표기', () => {
  it('잔디/AW 구분과 표면 적합성을 판정한다', () => {
    expect(isTurfGoing('firm')).toBe(true);
    expect(isTurfGoing('standard')).toBe(false);
    expect(isAwGoing('standard')).toBe(true);
    expect(isAwGoing('heavy')).toBe(false);
    expect(isGoingValidForSurface('good', 'turf')).toBe(true);
    expect(isGoingValidForSurface('good', 'aw')).toBe(false);
    expect(isGoingValidForSurface('standard_to_fast', 'aw')).toBe(true);
    expect(isGoingValidForSurface('standard_to_fast', 'turf')).toBe(false);
  });

  it('goingLabel 은 GOING_LABELS 를 그대로 돌려준다', () => {
    for (const g of ALL_GOINGS) {
      expect(goingLabel(g)).toBe(GOING_LABELS[g]);
    }
    expect(goingLabel('good_to_soft')).toBe('GOOD TO SOFT');
  });
});

describe('수용 기준 2: goingFit', () => {
  it('선호 마장(d=0)에서 1.005 를 준다', () => {
    const fit = goingFit({ goingPreference: 2, goingTolerance: 1, allWeather: 0 }, 'good');
    expect(fit).toBeCloseTo(1.005, 10);
  });

  it('d 가 커질수록 단조 감소한다', () => {
    const apt = { goingPreference: 0, goingTolerance: 1, allWeather: 0 };
    let prev = Number.POSITIVE_INFINITY;
    TURF_GOING_ORDER.forEach((g) => {
      const fit = goingFit(apt, g);
      expect(fit).toBeLessThan(prev + 1e-12);
      prev = fit;
    });
  });

  it('d=6, tolerance=1 에서 0.97 에 근접한다 (±0.001)', () => {
    const fit = goingFit({ goingPreference: 0, goingTolerance: 1, allWeather: 0 }, 'heavy');
    expect(Math.abs(fit - 0.97)).toBeLessThanOrEqual(0.001);
  });

  it('AW 마장에서 allWeather=1 → 1.02, -1 → 0.98', () => {
    expect(goingFit({ goingPreference: 3, goingTolerance: 1, allWeather: 1 }, 'standard')).toBeCloseTo(
      1 + AW_APTITUDE_EFFECT,
      10,
    );
    expect(goingFit({ goingPreference: 3, goingTolerance: 1, allWeather: -1 }, 'standard')).toBeCloseTo(
      0.98,
      10,
    );
  });

  it('goingTolerance <= 0 이면 RangeError', () => {
    expect(() => goingFit({ goingPreference: 0, goingTolerance: 0, allWeather: 0 }, 'firm')).toThrow(
      RangeError,
    );
    expect(() => goingFit({ goingPreference: 0, goingTolerance: -1, allWeather: 0 }, 'firm')).toThrow(
      RangeError,
    );
  });
});

describe('수용 기준 3: rollGoing 표면 일치', () => {
  it('AW 코스는 AW 마장만, 잔디 코스는 잔디 마장만 1,000회 반환한다', () => {
    const rng = createRng('surface-check');
    for (let i = 0; i < 1000; i++) {
      expect(isAwGoing(rollGoing(rng, { surface: 'aw', drainage: 0.5 }, 5))).toBe(true);
    }
    for (let i = 0; i < 1000; i++) {
      expect(isTurfGoing(rollGoing(rng, { surface: 'turf', drainage: 0.5 }, 5))).toBe(true);
    }
  });

  it('month 가 1~12 정수가 아니면 RangeError', () => {
    const rng = createRng(1);
    const course = { surface: 'turf' as const, drainage: 0.5 };
    expect(() => rollGoing(rng, course, 0)).toThrow(RangeError);
    expect(() => rollGoing(rng, course, 13)).toThrow(RangeError);
    expect(() => rollGoing(rng, course, 1.5)).toThrow(RangeError);
    expect(() => rollGoing(rng, { surface: 'aw', drainage: 0.5 }, 0)).toThrow(RangeError);
  });
});

describe('수용 기준 4: 같은 시드 = 같은 결과', () => {
  it('같은 시드 Rng 두 개로 rollGoing 100회 결과가 같다 (잔디·AW 모두)', () => {
    const turfCourse = { surface: 'turf' as const, drainage: 0.3 };
    const awCourse = { surface: 'aw' as const, drainage: 0.5 };
    const a = createRng(20261011);
    const b = createRng(20261011);
    const seqA: Going[] = [];
    const seqB: Going[] = [];
    for (let i = 0; i < 100; i++) {
      seqA.push(rollGoing(a, turfCourse, 3));
      seqB.push(rollGoing(b, turfCourse, 3));
    }
    expect(seqA).toEqual(seqB);

    const awA: Going[] = [];
    const awB: Going[] = [];
    const c = createRng(777);
    const d = createRng(777);
    for (let i = 0; i < 100; i++) {
      awA.push(rollGoing(c, awCourse, 3));
      awB.push(rollGoing(d, awCourse, 3));
    }
    expect(awA).toEqual(awB);
  });
});

describe('수용 기준 5: 계절 효과', () => {
  it('잔디·drainage 0.5 에서 7월 평균 인덱스가 1월 평균보다 2 이상 낮다', () => {
    const N = 10000;
    const course = { surface: 'turf' as const, drainage: 0.5 };
    const meanIndex = (seed: number, month: number): number => {
      const rng = createRng(seed);
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += turfGoingIndex(rollGoing(rng, course, month) as TurfGoing);
      }
      return sum / N;
    };
    const jan = meanIndex(101, 1);
    const jul = meanIndex(202, 7);
    expect(jan - jul).toBeGreaterThanOrEqual(2);
  });

  it('월 기준 인덱스 표는 12칸이다', () => {
    expect(GOING_MONTH_BASE).toHaveLength(12);
  });
});

describe('수용 기준 6: config 키 완전성', () => {
  const records: Array<[string, Record<Going, unknown>]> = [
    ['GOING_LABELS', GOING_LABELS],
    ['GOING_SPEED_FACTOR', GOING_SPEED_FACTOR],
    ['GOING_STAMINA_DRAIN', GOING_STAMINA_DRAIN],
    ['GOING_POWER_WEIGHT', GOING_POWER_WEIGHT],
    ['LENGTHS_PER_SECOND', LENGTHS_PER_SECOND],
  ];

  it('모든 Going 키가 config 의 Record 에 빠짐없이 있다', () => {
    for (const [name, record] of records) {
      for (const g of ALL_GOINGS) {
        expect(record[g], `${name}.${g}`).toBeDefined();
      }
      expect(Object.keys(record), name).toHaveLength(ALL_GOINGS.length);
    }
  });
});
