import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { DIST_BIAS_SD, PROFILE_BOUNDS } from '../../src/engine/config/horse';
import { generateHorse, profileOfDistance, type GenerateHorseOptions } from '../../src/engine/horse/generate';

/** M2-14 거리 프로필 4단계 전환: profileOfDistance 경계, distanceBias 분포, rng 소비 불변. */

const CURRENT_YEAR = 2026;

function baseOpts(overrides: Partial<GenerateHorseOptions> = {}): GenerateHorseOptions {
  return {
    id: 'h_dist',
    name: 'Silent Thunder',
    sex: 'male',
    birthYear: CURRENT_YEAR - 2,
    currentYear: CURRENT_YEAR,
    countryOfBirth: 'GB',
    status: 'in_training',
    level: 60,
    ...overrides,
  };
}

describe('profileOfDistance 경계', () => {
  it('speed ≤ 1800, classic ≤ 2200, middle ≤ 2700, 초과는 cup (경계값 포함)', () => {
    expect(PROFILE_BOUNDS).toEqual({ speedMax: 1800, classicMax: 2200, middleMax: 2700 });
    expect(profileOfDistance(1800)).toBe('speed');
    expect(profileOfDistance(1801)).toBe('classic');
    expect(profileOfDistance(2200)).toBe('classic');
    expect(profileOfDistance(2201)).toBe('middle');
    expect(profileOfDistance(2700)).toBe('middle');
    expect(profileOfDistance(2701)).toBe('cup');
  });

  it('범위 양 끝(DIST_OPT_MIN, DIST_OPT_MAX)도 유효한 프로필을 낸다', () => {
    expect(profileOfDistance(1000)).toBe('speed');
    expect(profileOfDistance(3600)).toBe('cup');
  });
});

describe('generateHorse distanceBias', () => {
  it('bias 2400 으로 1,000두: distanceOptimum 평균 2400 ± 20, 표준편차 150 ± 15', () => {
    const rng = createRng('dist-bias-dist');
    const xs: number[] = [];
    for (let i = 0; i < 1000; i++) {
      xs.push(generateHorse(rng, baseOpts({ id: `d${i}`, distanceBias: 2400 })).aptitude.distanceOptimum);
    }
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    const sd = Math.sqrt(variance);
    expect(Math.abs(mean - 2400)).toBeLessThanOrEqual(20);
    expect(Math.abs(sd - DIST_BIAS_SD)).toBeLessThanOrEqual(15);
  });

  it('distanceBias 유무와 관계없이 rng 소비 횟수가 같다 (같은 위치의 normal 한 번 공유)', () => {
    const withBias = createRng('rng-count');
    const withoutBias = createRng('rng-count');
    generateHorse(withBias, baseOpts({ distanceBias: 2400 }));
    generateHorse(withoutBias, baseOpts());
    // 두 경우 모두 같은 개수의 난수를 쓰면 이후 상태가 일치한다. 아래 두 번째 생성 결과도 같은 위치에서 이어진다.
    const nextWith = generateHorse(withBias, baseOpts({ id: 'next' }));
    const nextWithout = generateHorse(withoutBias, baseOpts({ id: 'next' }));
    expect(withBias.getState()).toEqual(withoutBias.getState());
    expect(nextWith.preferredStyle).toBe(nextWithout.preferredStyle);
    expect(nextWith.soundness).toBe(nextWithout.soundness);
  });

  it('distanceBias 없는 생성은 같은 시드에서 같은 결과(비트 단위 재현)', () => {
    const a = generateHorse(createRng('no-bias'), baseOpts());
    const b = generateHorse(createRng('no-bias'), baseOpts());
    expect(a).toEqual(b);
  });
});
