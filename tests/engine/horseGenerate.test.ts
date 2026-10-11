import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import {
  ABILITY_MAX,
  ABILITY_MIN,
  DEFAULT_POTENTIAL_SPREAD,
  GROWTH_DECLINE_RATE,
  GROWTH_PEAK_AGE,
  MATURITY_AT_BIRTH,
  MATURITY_FLOOR,
  NAME_MAX_LENGTH,
} from '../../src/engine/config/horse';
import { abilityAtAge, maturity, sampleGrowthProfile } from '../../src/engine/horse/growthCurve';
import { generateHorse, generateHorseName, type GenerateHorseOptions } from '../../src/engine/horse/generate';
import type { Abilities, GrowthProfile, Horse } from '../../src/engine/types';

const CURRENT_YEAR = 2026;

function baseOpts(overrides: Partial<GenerateHorseOptions> = {}): GenerateHorseOptions {
  return {
    id: 'h_test',
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

function profile(type: GrowthProfile['type']): GrowthProfile {
  return { type, peakAge: GROWTH_PEAK_AGE[type], declineRate: GROWTH_DECLINE_RATE[type] };
}

const ABILITY_KEYS: (keyof Abilities)[] = ['speed', 'stamina', 'acceleration', 'guts', 'power'];

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe('maturity 곡선', () => {
  it('age 0 이하에서는 출생 시 성숙도(0.35)를 낸다', () => {
    expect(maturity(0, profile('normal'))).toBeCloseTo(MATURITY_AT_BIRTH, 10);
  });

  it('precocious 는 age 2 에서 normal, late 보다 크다', () => {
    const p = maturity(2, profile('precocious'));
    expect(p).toBeGreaterThan(maturity(2, profile('normal')));
    expect(p).toBeGreaterThan(maturity(2, profile('late')));
  });

  it('모든 type 은 peak 와 peak+1 에서 1, peak+3 에서 1 - 2×declineRate, 매우 늙으면 하한', () => {
    for (const type of ['precocious', 'normal', 'late'] as const) {
      const g = profile(type);
      expect(maturity(g.peakAge, g)).toBeCloseTo(1, 10);
      expect(maturity(g.peakAge + 1, g)).toBeCloseTo(1, 10);
      expect(maturity(g.peakAge + 3, g)).toBeCloseTo(1 - 2 * g.declineRate, 10);
      expect(maturity(100, g)).toBeCloseTo(MATURITY_FLOOR, 10);
    }
  });

  it('abilityAtAge 는 potential × maturity 를 [ABILITY_MIN, ABILITY_MAX] 로 자른다', () => {
    const potential: Abilities = { speed: 100, stamina: 50, acceleration: 1, guts: 70, power: 90 };
    const g = profile('normal');
    const a = abilityAtAge(potential, 4, g);
    expect(a.speed).toBeCloseTo(100, 10);
    expect(a.stamina).toBeCloseTo(50, 10);
    expect(a.acceleration).toBeGreaterThanOrEqual(ABILITY_MIN);
    expect(a.guts).toBeLessThanOrEqual(ABILITY_MAX);
  });

  it('sampleGrowthProfile 은 rng 를 정확히 1회 소비하고 표 값을 쓴다', () => {
    const r1 = createRng('growth-1');
    const r2 = createRng('growth-1');
    const g = sampleGrowthProfile(r1);
    r2.next();
    expect(r1.getState()).toEqual(r2.getState());
    expect(g.peakAge).toBe(GROWTH_PEAK_AGE[g.type]);
    expect(g.declineRate).toBe(GROWTH_DECLINE_RATE[g.type]);
  });
});

describe('generateHorse', () => {
  it('같은 시드·옵션이면 깊은 비교로 같은 결과를 낸다', () => {
    const a = generateHorse(createRng('seed-A'), baseOpts({ distanceBias: 2400, surfaceBias: 'dirt' }));
    const b = generateHorse(createRng('seed-A'), baseOpts({ distanceBias: 2400, surfaceBias: 'dirt' }));
    expect(a).toEqual(b);
  });

  it('sireLineId 옵션 값이 그대로 들어가고, 없으면 null 이다', () => {
    const withLine = generateHorse(createRng('line'), baseOpts({ sireLineId: 'line_test_a' }));
    expect(withLine.sireLineId).toBe('line_test_a');
    const withoutLine = generateHorse(createRng('line'), baseOpts());
    expect(withoutLine.sireLineId).toBeNull();
  });

  it('1,000마리: 모든 능력이 1~100, 잠재 평균이 level ±1.5 이내', () => {
    const rng = createRng('bulk-level');
    const potentialAll: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const h = generateHorse(rng, baseOpts({ id: `h${i}`, level: 60 }));
      for (const k of ABILITY_KEYS) {
        expect(h.ability[k]).toBeGreaterThanOrEqual(ABILITY_MIN);
        expect(h.ability[k]).toBeLessThanOrEqual(ABILITY_MAX);
        expect(h.potential[k]).toBeGreaterThanOrEqual(ABILITY_MIN);
        expect(h.potential[k]).toBeLessThanOrEqual(ABILITY_MAX);
        potentialAll.push(h.potential[k]);
      }
    }
    expect(Math.abs(mean(potentialAll) - 60)).toBeLessThanOrEqual(1.5);
    expect(DEFAULT_POTENTIAL_SPREAD).toBe(10);
  });

  it('distanceBias 3200 의 평균 distanceOptimum 이 1200 보다 600 이상 크다', () => {
    const rng = createRng('dist-bias');
    const long: number[] = [];
    const short: number[] = [];
    for (let i = 0; i < 1000; i++) {
      long.push(generateHorse(rng, baseOpts({ distanceBias: 3200 })).aptitude.distanceOptimum);
      short.push(generateHorse(rng, baseOpts({ distanceBias: 1200 })).aptitude.distanceOptimum);
    }
    expect(mean(long) - mean(short)).toBeGreaterThanOrEqual(600);
  });

  it('3세 normal 말의 현재 능력 평균은 잠재 평균의 80~95%', () => {
    const rng = createRng('three-year-old');
    let abilitySum = 0;
    let potentialSum = 0;
    let count = 0;
    for (let i = 0; i < 2000; i++) {
      const h = generateHorse(
        rng,
        baseOpts({ id: `t${i}`, birthYear: CURRENT_YEAR - 3, currentYear: CURRENT_YEAR, level: 60 }),
      );
      if (h.growth.type !== 'normal') continue;
      count++;
      for (const k of ABILITY_KEYS) {
        abilitySum += h.ability[k];
        potentialSum += h.potential[k];
      }
    }
    expect(count).toBeGreaterThan(500);
    const ratio = abilitySum / potentialSum;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
    expect(ratio).toBeLessThanOrEqual(0.95);
  });

  it('name 이 NAME_MAX_LENGTH 를 넘으면 RangeError', () => {
    const tooLong = 'A'.repeat(NAME_MAX_LENGTH + 1);
    expect(() => generateHorse(createRng('long-name'), baseOpts({ name: tooLong }))).toThrow(RangeError);
  });

  it('생성 결과의 고정 필드(record, condition, trainerId 등)가 명세 기본값이다', () => {
    const h: Horse = generateHorse(createRng('defaults'), baseOpts());
    expect(h.gelded).toBe(false);
    expect(h.officialRating).toBeNull();
    expect(h.trainerId).toBeNull();
    expect(h.familyId).toBeNull();
    expect(h.sireId).toBeNull();
    expect(h.condition.injury).toBeNull();
    expect(h.condition.fatigue).toBe(0);
    expect(h.record).toEqual({
      starts: 0,
      wins: 0,
      seconds: 0,
      thirds: 0,
      earnings: 0,
      blackTypePlacings: 0,
      groupWins: 0,
    });
  });
});

describe('generateHorseName', () => {
  const words = {
    adjectives: ['Silent', 'Golden', 'Iron', 'Royal', 'Swift'],
    nouns: ['Thunder', 'Harbor', 'Falcon', 'Crown', 'Storm'],
  };

  it('5×5 단어장으로 10,000개를 만들어도 중복이 없고 전부 18자 이하', () => {
    const rng = createRng('names-10k');
    const used = new Set<string>();
    const names: string[] = [];
    for (let i = 0; i < 10000; i++) {
      names.push(generateHorseName(rng, words, used));
    }
    expect(new Set(names).size).toBe(10000);
    expect(used.size).toBe(10000);
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    }
  });

  it('이미 used 에 있는 이름은 반환하지 않는다', () => {
    const rng = createRng('names-used');
    const used = new Set<string>(['Silent Thunder']);
    const name = generateHorseName(rng, words, used);
    expect(name).not.toBe('Silent Thunder');
    expect(used.has(name)).toBe(true);
  });

  it('같은 시드·같은 단어장이면 같은 이름 순서를 낸다', () => {
    const run = (): string[] => {
      const rng = createRng('names-det');
      const used = new Set<string>();
      return Array.from({ length: 200 }, () => generateHorseName(rng, words, used));
    };
    expect(run()).toEqual(run());
  });
});
