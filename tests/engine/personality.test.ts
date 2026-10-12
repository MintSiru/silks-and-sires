import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { generateHorse, type GenerateHorseOptions } from '../../src/engine/horse/generate';
import { breed, type BreedArgs } from '../../src/engine/breeding/genetics';
import {
  deriveStyle,
  generatePersonality,
  inheritPersonality,
  personalityClues,
  type PersonalityClueKey,
} from '../../src/engine/horse/personality';
import { neutralPersonality } from '../../src/engine/horse/traits';
import { STYLE_WEIGHTS } from '../../src/engine/config/horse';
import type { Abilities, Horse, Personality, RunningStyle } from '../../src/engine/types';

/** M3-C5a 말의 성격: 생성·유전·각질 결정·코멘트 단서 */

const AXES = ['drive', 'composure', 'fight', 'timidity', 'stubbornness'] as const;
const STYLES = Object.keys(STYLE_WEIGHTS) as RunningStyle[];

function genOpts(id: string): GenerateHorseOptions {
  return {
    id,
    name: id,
    sex: 'male',
    birthYear: 2024,
    currentYear: 2026,
    countryOfBirth: 'GB',
    status: 'in_training',
    level: 55,
  };
}

function withPersonality(base: Horse, id: string, p: Partial<Personality>): Horse {
  return { ...base, id, name: id, personality: { ...neutralPersonality(), ...p } };
}

function flatAbility(v: number): Abilities {
  return { speed: v, stamina: v, acceleration: v, guts: v, power: v };
}

function meanOf(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sdOf(xs: readonly number[]): number {
  const m = meanOf(xs);
  return Math.sqrt(meanOf(xs.map((x) => (x - m) ** 2)));
}

const BASE: Horse = generateHorse(createRng('personality-fixture-base'), genOpts('base'));

function plainArgs(sire: Horse, dam: Horse, overrides: Partial<BreedArgs> = {}): BreedArgs {
  return {
    sire,
    dam,
    damsireLineId: null,
    nicks: [],
    inbreeding: [],
    damFamilyScore: 0,
    id: 'foal',
    name: 'Foal',
    birthYear: 2026,
    currentYear: 2026,
    countryOfBirth: 'GB',
    ownerId: null,
    breederId: null,
    ...overrides,
  };
}

describe('1. 같은 시드 = 같은 성격·각질', () => {
  it('generateHorse: 같은 시드면 성격과 선호 작전이 같다', () => {
    const a = generateHorse(createRng('pers-seed-1'), genOpts('x'));
    const b = generateHorse(createRng('pers-seed-1'), genOpts('x'));
    expect(a.personality).toEqual(b.personality);
    expect(a.preferredStyle).toBe(b.preferredStyle);
  });

  it('breed: 같은 시드면 망아지의 성격과 선호 작전이 같다', () => {
    const sire = withPersonality(BASE, 'S', { drive: 80, timidity: 30 });
    const dam = withPersonality(BASE, 'D', { drive: 40, composure: 70 });
    const a = breed(createRng('pers-breed-1'), plainArgs(sire, dam));
    const b = breed(createRng('pers-breed-1'), plainArgs(sire, dam));
    expect(a.personality).toEqual(b.personality);
    expect(a.preferredStyle).toBe(b.preferredStyle);
  });
});

describe('2. 생성 분포 (무작위 생성마 5,000두)', () => {
  const rng = createRng('personality-dist-5000');
  const horses: Horse[] = [];
  for (let i = 0; i < 5000; i++) {
    horses.push(generateHorse(rng, genOpts(`d${i}`)));
  }

  it('축별 평균 50±2, 표준편차 15±2, 범위 0~100', () => {
    for (const axis of AXES) {
      const xs = horses.map((h) => h.personality[axis]);
      expect(Math.abs(meanOf(xs) - 50)).toBeLessThanOrEqual(2);
      expect(Math.abs(sdOf(xs) - 15)).toBeLessThanOrEqual(2);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(100);
    }
  });

  it('각질 비율이 STYLE_WEIGHTS ±0.04', () => {
    const counts: Record<RunningStyle, number> = { front: 0, prominent: 0, midfield: 0, held_up: 0 };
    for (const h of horses) counts[h.preferredStyle]++;
    for (const style of STYLES) {
      const ratio = counts[style] / horses.length;
      expect(Math.abs(ratio - STYLE_WEIGHTS[style])).toBeLessThanOrEqual(0.04);
    }
  });
});

describe('3. 유전은 약하다', () => {
  const N = 2000;

  function childDrive(sireDrive: number, damDrive: number): number[] {
    const sire = withPersonality(BASE, 'S', { drive: sireDrive });
    const dam = withPersonality(BASE, 'D', { drive: damDrive });
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      out.push(breed(createRng(`pers-inh-${sireDrive}-${damDrive}-${i}`), plainArgs(sire, dam)).personality.drive);
    }
    return out;
  }

  it('부모 모두 기세 90 → 자식 평균 60~68', () => {
    const xs = childDrive(90, 90);
    expect(meanOf(xs)).toBeGreaterThanOrEqual(60);
    expect(meanOf(xs)).toBeLessThanOrEqual(68);
  });

  it('부모 모두 기세 10 → 자식 평균 32~40', () => {
    const xs = childDrive(10, 10);
    expect(meanOf(xs)).toBeGreaterThanOrEqual(32);
    expect(meanOf(xs)).toBeLessThanOrEqual(40);
  });

  it('부모 기세 90 → 자식 표준편차 ≥ 12 (잡음이 크다)', () => {
    expect(sdOf(childDrive(90, 90))).toBeGreaterThanOrEqual(12);
  });

  it('inheritPersonality 는 부모 평균 기준으로 축마다 독립 적용된다', () => {
    const sire = neutralPersonality();
    const dam = { ...neutralPersonality(), fight: 90 };
    const child = inheritPersonality(createRng('inh-axis'), sire, dam);
    for (const axis of AXES) {
      expect(child[axis]).toBeGreaterThanOrEqual(0);
      expect(child[axis]).toBeLessThanOrEqual(100);
    }
  });
});

describe('4. 성격에 따라 각질이 달라진다 (같은 능력, 1,000회)', () => {
  const ability = flatAbility(60);
  const N = 1000;

  it('기세 85·겁 20 → front + prominent ≥ 0.7', () => {
    const p = { ...neutralPersonality(), drive: 85, timidity: 20 };
    let high = 0;
    for (let i = 0; i < N; i++) {
      const s = deriveStyle(p, ability, createRng(`style-hi-${i}`));
      if (s === 'front' || s === 'prominent') high++;
    }
    expect(high / N).toBeGreaterThanOrEqual(0.7);
  });

  it('기세 20·겁 80 → midfield + held_up ≥ 0.7', () => {
    const p = { ...neutralPersonality(), drive: 20, timidity: 80 };
    let low = 0;
    for (let i = 0; i < N; i++) {
      const s = deriveStyle(p, ability, createRng(`style-lo-${i}`));
      if (s === 'midfield' || s === 'held_up') low++;
    }
    expect(low / N).toBeGreaterThanOrEqual(0.7);
  });

  it('스피드 능력이 스태미나보다 높으면 같은 성격이라도 앞쪽으로 기운다', () => {
    const p = neutralPersonality();
    const speedy: Abilities = { ...flatAbility(60), speed: 90, stamina: 30 };
    const stayer: Abilities = { ...flatAbility(60), speed: 30, stamina: 90 };
    let speedFront = 0;
    let stayerFront = 0;
    for (let i = 0; i < N; i++) {
      const a = deriveStyle(p, speedy, createRng(`style-spd-${i}`));
      const b = deriveStyle(p, stayer, createRng(`style-spd-${i}`));
      if (a === 'front' || a === 'prominent') speedFront++;
      if (b === 'front' || b === 'prominent') stayerFront++;
    }
    expect(speedFront).toBeGreaterThan(stayerFront);
  });

  it('deriveStyle 은 rng.normal 을 1회(next 2회) 소비한다', () => {
    const rngA = createRng('style-consume');
    const rngB = createRng('style-consume');
    deriveStyle(neutralPersonality(), ability, rngA);
    rngB.normal(0, 1);
    expect(rngA.getState()).toEqual(rngB.getState());
  });
});

describe('5. personalityClues', () => {
  it('5개 키 각각 나오는 사례', () => {
    const cases: [Partial<Personality>, PersonalityClueKey][] = [
      [{ timidity: 75 }, 'gate_nervous'],
      [{ drive: 75, composure: 35 }, 'keen_going'],
      [{ fight: 80 }, 'genuine'],
      [{ stubbornness: 72 }, 'quirky'],
      [{ drive: 25, composure: 65 }, 'laid_back'],
    ];
    for (const [partial, key] of cases) {
      const clues = personalityClues({ ...neutralPersonality(), ...partial });
      expect(clues).toEqual([key]);
    }
  });

  it('중립 성격(모든 축 50)은 빈 배열', () => {
    expect(personalityClues(neutralPersonality())).toEqual([]);
  });

  it('최대 2개, 50 에서 가장 많이 벗어난 순', () => {
    // 겁 75(편차 25), 투쟁 95(편차 45), 고집 80(편차 30) → 투쟁, 고집 순으로 2개
    const p = { ...neutralPersonality(), timidity: 75, fight: 95, stubbornness: 80 };
    expect(personalityClues(p)).toEqual(['genuine', 'quirky']);
  });

  it('동시에 많이 해당해도 최대 2개', () => {
    const p: Personality = {
      drive: 90,
      composure: 10,
      fight: 90,
      timidity: 90,
      stubbornness: 90,
    };
    // 네 단서 모두 편차 40 → 동률은 나열 순(gate_nervous, keen_going, genuine, quirky)의 앞 두 개
    expect(personalityClues(p)).toEqual(['gate_nervous', 'keen_going']);
  });

  it('경계값: 겁 70 은 해당, 69 는 비해당', () => {
    expect(personalityClues({ ...neutralPersonality(), timidity: 70 })).toEqual(['gate_nervous']);
    expect(personalityClues({ ...neutralPersonality(), timidity: 69 })).toEqual([]);
  });

  it('생성마 5,000두에서 결과는 항상 길이 0~2', () => {
    const rng = createRng('clue-dist');
    for (let i = 0; i < 5000; i++) {
      const clues = personalityClues(generatePersonality(rng));
      expect(clues.length).toBeLessThanOrEqual(2);
    }
  });
});
