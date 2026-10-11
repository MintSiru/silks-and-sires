import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { generateHorse } from '../../src/engine/horse/generate';
import {
  breed,
  inbreedingEffect,
  inbreedingPenalty,
  isComplementary,
  type BreedArgs,
} from '../../src/engine/breeding/genetics';
import { ABILITY_MAX } from '../../src/engine/config/horse';
import {
  initialRevealedNicks,
  nickKey,
  nickLabel,
  nickValue,
} from '../../src/engine/breeding/nicks';
import { buildMatingPreview } from '../../src/engine/breeding/preview';
import type { PedigreeLookup } from '../../src/engine/breeding/pedigree';
import type { Abilities, Horse, NickEntry } from '../../src/engine/types';

/** 테스트용 기본 말. generateHorse 로 만든 뒤 필요한 필드만 덮어쓴다 */
const BASE_HORSE: Horse = generateHorse(createRng('genetics-fixture-base'), {
  id: 'base',
  name: 'Base',
  sex: 'male',
  birthYear: 2022,
  currentYear: 2026,
  countryOfBirth: 'GB',
  status: 'in_training',
  level: 60,
});

function flat(v: number): Abilities {
  return { speed: v, stamina: v, acceleration: v, guts: v, power: v };
}

function makeHorse(id: string, overrides: Partial<Horse> = {}): Horse {
  return { ...BASE_HORSE, id, name: id, ...overrides };
}

/** 닉스·인브리드·모계 보정이 모두 0 인 교배 인자 */
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

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 시드 'prefix-i' 로 n 마리를 만들고 잠재 능력 한 항목의 평균을 낸다 */
function meanPotential(
  prefix: string,
  n: number,
  sire: Horse,
  dam: Horse,
  key: keyof Abilities,
  overrides: Partial<BreedArgs> = {},
): number {
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const foal = breed(createRng(`${prefix}-${i}`), plainArgs(sire, dam, overrides));
    values.push(foal.potential[key]);
  }
  return meanOf(values);
}

describe('breed: 결정론과 기본 필드', () => {
  const sire = makeHorse('SIRE', { potential: flat(60), sireLineId: 'sl_a' });
  const dam = makeHorse('DAM', { potential: flat(50), familyId: 'FAM_ROOT' });

  it('같은 시드·입력이면 같은 망아지', () => {
    const a = breed(createRng('seed-1'), plainArgs(sire, dam));
    const b = breed(createRng('seed-1'), plainArgs(sire, dam));
    expect(b).toEqual(a);
  });

  it('다른 시드면 다른 망아지', () => {
    const a = breed(createRng('seed-1'), plainArgs(sire, dam));
    const c = breed(createRng('seed-2'), plainArgs(sire, dam));
    expect(c).not.toEqual(a);
  });

  it('status·혈통·모계·컨디션 필드', () => {
    const foal = breed(createRng('fields'), plainArgs(sire, dam, { id: 'F1', name: 'Foal One' }));
    expect(foal.id).toBe('F1');
    expect(foal.name).toBe('Foal One');
    expect(foal.status).toBe('foal');
    expect(foal.gelded).toBe(false);
    expect(foal.sireId).toBe('SIRE');
    expect(foal.damId).toBe('DAM');
    expect(foal.sireLineId).toBe('sl_a');
    expect(foal.familyId).toBe('FAM_ROOT');
    expect(foal.officialRating).toBeNull();
    expect(foal.trainerId).toBeNull();
    expect(foal.condition.fatigue).toBe(0);
    expect(foal.condition.fitness).toBe(50);
    expect(foal.condition.injury).toBeNull();
    expect(foal.record.starts).toBe(0);
  });

  it('dam.familyId 가 없으면 familyId 는 dam.id', () => {
    const plainDam = makeHorse('DAM2', { familyId: null });
    const foal = breed(createRng('fam'), plainArgs(sire, plainDam));
    expect(foal.familyId).toBe('DAM2');
  });
});

describe('잠재 능력 유전', () => {
  it('보정 0 조건에서 부모 중간값(55) 근처: 1,000회 평균 오차 ±1', () => {
    const sire = makeHorse('S60', { potential: flat(60) });
    const dam = makeHorse('D50', { potential: flat(50) });
    const speedMean = meanPotential('mid-speed', 1000, sire, dam, 'speed');
    const powerMean = meanPotential('mid-power', 1000, sire, dam, 'power');
    expect(Math.abs(speedMean - 55)).toBeLessThan(1);
    expect(Math.abs(powerMean - 55)).toBeLessThan(1);
  });

  it('회귀: 부모 잠재가 모두 95 이면 평균 < 95, 모두 30 이면 평균 > 30', () => {
    const high = makeHorse('H95', { potential: flat(95) });
    const low = makeHorse('L30', { potential: flat(30) });
    const highMean = meanPotential('reg-high', 1000, high, high, 'speed');
    const lowMean = meanPotential('reg-low', 1000, low, low, 'speed');
    expect(highMean).toBeLessThan(95);
    expect(lowMean).toBeGreaterThan(30);
  });

  it('닉스 +1 조합은 닉스 0 조합보다 약 NICK_EFFECT_MAX(4) 높다 (±0.8)', () => {
    const sire = makeHorse('NS', { potential: flat(55), sireLineId: 'sl_a' });
    const dam = makeHorse('ND', { potential: flat(55) });
    const table: NickEntry[] = [
      { sireLineId: 'sl_a', damsireLineId: 'sl_b', value: 1, knownAtStart: true },
    ];
    const withNick = meanPotential('nick-on', 1000, sire, dam, 'stamina', {
      nicks: table,
      damsireLineId: 'sl_b',
    });
    const withoutNick = meanPotential('nick-on', 1000, sire, dam, 'stamina', {
      nicks: [],
      damsireLineId: 'sl_b',
    });
    const diff = withNick - withoutNick;
    expect(diff).toBeGreaterThan(4 - 0.8);
    expect(diff).toBeLessThan(4 + 0.8);
  });

  it('모계 명성 1.0 은 잠재 +FAMILY_BONUS_MAX(2.5) 근처', () => {
    const sire = makeHorse('FS', { potential: flat(55) });
    const dam = makeHorse('FD', { potential: flat(55) });
    const high = meanPotential('fam-high', 1000, sire, dam, 'guts', { damFamilyScore: 1 });
    const base = meanPotential('fam-high', 1000, sire, dam, 'guts', { damFamilyScore: 0 });
    const diff = high - base;
    expect(diff).toBeGreaterThan(2.5 - 0.8);
    expect(diff).toBeLessThan(2.5 + 0.8);
  });
});

describe('성장형 유전', () => {
  it('부 normal · 모 late 이면 망아지 normal 비율 0.47~0.53 (10,000회)', () => {
    const sire = makeHorse('GS', {
      growth: { type: 'normal', peakAge: 4, declineRate: 0.08 },
    });
    const dam = makeHorse('GD', {
      growth: { type: 'late', peakAge: 5, declineRate: 0.06 },
    });
    let normal = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const foal = breed(createRng(`growth-${i}`), plainArgs(sire, dam));
      if (foal.growth.type === 'normal') normal++;
    }
    const ratio = normal / n;
    expect(ratio).toBeGreaterThanOrEqual(0.47);
    expect(ratio).toBeLessThanOrEqual(0.53);
  });
});

describe('inbreedingEffect', () => {
  it('18.75% 는 잠재 +3, 건강도 감점 없음', () => {
    const e = inbreedingEffect(18.75);
    expect(e.potential).toBeCloseTo(3, 10);
    expect(e.soundness).toBe(0);
  });

  it('6.25% (LOW) 는 보너스 0', () => {
    expect(inbreedingEffect(6.25).potential).toBe(0);
  });

  it('12.5% 는 중간 보너스 1.5', () => {
    expect(inbreedingEffect(12.5).potential).toBeCloseTo(1.5, 10);
  });

  it('40% 는 잠재 음수, 건강도 감점 15', () => {
    const e = inbreedingEffect(40);
    expect(e.potential).toBeLessThan(0);
    expect(e.soundness).toBeCloseTo(15, 10);
  });
});

describe('닉스 조회·라벨', () => {
  const table: NickEntry[] = [
    { sireLineId: 'sl_x', damsireLineId: 'sl_y', value: 0.6, knownAtStart: true },
    { sireLineId: 'sl_a', damsireLineId: 'sl_b', value: -0.4, knownAtStart: false },
    { sireLineId: 'sl_c', damsireLineId: 'sl_d', value: 0.3, knownAtStart: true },
  ];

  it('nickKey 는 a|b 형식', () => {
    expect(nickKey('sl_a', 'sl_b')).toBe('sl_a|sl_b');
  });

  it('nickValue: 조합이 없거나 계통이 null 이면 0', () => {
    expect(nickValue(table, 'sl_x', 'sl_y')).toBe(0.6);
    expect(nickValue(table, 'sl_x', 'sl_z')).toBe(0);
    expect(nickValue(table, null, 'sl_y')).toBe(0);
    expect(nickValue(table, 'sl_x', null)).toBe(0);
  });

  it('nickLabel: 경계 값과 미공개', () => {
    expect(nickLabel(0.5, true)).toBe('excellent');
    expect(nickLabel(0.2, true)).toBe('good');
    expect(nickLabel(0, true)).toBe('neutral');
    expect(nickLabel(-0.1, true)).toBe('neutral');
    expect(nickLabel(-0.2, true)).toBe('poor');
    expect(nickLabel(1, false)).toBe('unknown');
  });

  it('initialRevealedNicks: knownAtStart 키만, 정렬', () => {
    expect(initialRevealedNicks(table)).toEqual(['sl_c|sl_d', 'sl_x|sl_y']);
  });
});

describe('buildMatingPreview', () => {
  // 조회되지 않는 말은 혈통 노드가 되지 않으므로 조상도 모두 등록한다(시조는 부·모 null)
  const lookupTable: Record<string, readonly [string | null, string | null]> = {
    SIRE: ['GS', 'GD'],
    DAM: ['GS', 'X'],
    GS: [null, null],
    GD: [null, null],
    X: [null, null],
  };
  const lookup: PedigreeLookup = (id) => {
    const entry = lookupTable[id];
    if (entry === undefined) return undefined;
    return { id, sireId: entry[0], damId: entry[1] };
  };
  const nicks: NickEntry[] = [
    { sireLineId: 'sl_a', damsireLineId: 'sl_b', value: 0.7, knownAtStart: false },
  ];

  it('미공개 닉스: label unknown, known false, 값 노출 없음', () => {
    const sire = makeHorse('SIRE', { sireLineId: 'sl_a' });
    const dam = makeHorse('DAM');
    const preview = buildMatingPreview({
      sire,
      dam,
      damsireLineId: 'sl_b',
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(preview.nick).toEqual({ label: 'unknown', known: false });
  });

  it('공개 닉스: 라벨 노출', () => {
    const sire = makeHorse('SIRE', { sireLineId: 'sl_a' });
    const dam = makeHorse('DAM');
    const preview = buildMatingPreview({
      sire,
      dam,
      damsireLineId: 'sl_b',
      lookup,
      nicks,
      revealedNicks: new Set([nickKey('sl_a', 'sl_b')]),
    });
    expect(preview.nick).toEqual({ label: 'excellent', known: true });
  });

  it('미리보기에는 능력치 숫자 필드가 없다', () => {
    const sire = makeHorse('SIRE');
    const dam = makeHorse('DAM');
    const preview = buildMatingPreview({
      sire,
      dam,
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(Object.keys(preview).sort()).toEqual(
      [
        'comments',
        'complement',
        'distanceHint',
        'damId',
        'inbreeding',
        'nick',
        'precocityHint',
        'roles',
        'sireId',
      ].sort(),
    );
    expect(JSON.stringify(preview)).not.toContain('potential');
  });

  it('공통 조상 GS 가 부측·모측 2대씩 → 인브리드 2×2, 혈량 50%', () => {
    const preview = buildMatingPreview({
      sire: makeHorse('SIRE'),
      dam: makeHorse('DAM'),
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(preview.inbreeding).toHaveLength(1);
    const cross = preview.inbreeding[0];
    expect(cross?.ancestorId).toBe('GS');
    expect(cross?.label).toBe('2×2');
    expect(cross?.bloodPercent).toBeCloseTo(50, 10);
  });

  it('거리 힌트: 부모 최적 거리 평균 ∓400, 100 단위', () => {
    const sire = makeHorse('SIRE', {
      aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 1500 },
    });
    const dam = makeHorse('DAM', {
      aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 1900 },
    });
    const preview = buildMatingPreview({
      sire,
      dam,
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(preview.distanceHint).toEqual({ min: 1300, max: 2100 });
  });

  it('거리 힌트는 [1000, 3600] 으로 자른다', () => {
    const far = makeHorse('SIRE', {
      aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 3500 },
    });
    const preview = buildMatingPreview({
      sire: far,
      dam: far,
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(preview.distanceHint).toEqual({ min: 3100, max: 3600 });
  });

  it('precocityHint: 부모 성장형이 같을 때만 값, 다르면 unknown', () => {
    const normalSire = makeHorse('SIRE', { growth: { type: 'normal', peakAge: 4, declineRate: 0.08 } });
    const normalDam = makeHorse('DAM', { growth: { type: 'normal', peakAge: 4, declineRate: 0.08 } });
    const lateDam = makeHorse('DAM', { growth: { type: 'late', peakAge: 5, declineRate: 0.06 } });
    const same = buildMatingPreview({
      sire: normalSire,
      dam: normalDam,
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    const diff = buildMatingPreview({
      sire: normalSire,
      dam: lateDam,
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(same.precocityHint).toBe('normal');
    expect(diff.precocityHint).toBe('unknown');
  });

  it('코멘트 순서: speed_good → stamina_stays_well → stamina_sprinter → legs_fragile, 최대 3개', () => {
    const sprinterSire = makeHorse('SIRE', {
      potential: { speed: 80, stamina: 30, acceleration: 60, guts: 60, power: 60 },
      soundness: 40,
    });
    const sprinterDam = makeHorse('DAM', {
      potential: { speed: 80, stamina: 30, acceleration: 60, guts: 60, power: 60 },
      soundness: 40,
    });
    const preview = buildMatingPreview({
      sire: sprinterSire,
      dam: sprinterDam,
      damsireLineId: null,
      lookup,
      nicks,
      revealedNicks: new Set<string>(),
    });
    expect(preview.comments.map((c) => c.key)).toEqual([
      'speed_good',
      'stamina_sprinter',
      'legs_fragile',
    ]);
    expect(preview.comments.length).toBeLessThanOrEqual(3);
  });
});

describe('건강도 평균 회귀', () => {
  /** 시드 'prefix-i' 로 n 마리를 만들고 건강도 평균을 낸다 (인브리드·닉스 보정 없음) */
  function meanSoundness(prefix: string, n: number, sire: Horse, dam: Horse): number {
    const values: number[] = [];
    for (let i = 0; i < n; i++) {
      values.push(breed(createRng(`${prefix}-${i}`), plainArgs(sire, dam)).soundness);
    }
    return meanOf(values);
  }

  it('부모 건강도가 모두 10 이면 1,000회 평균 > 10 + (70-10)×0.15 - 1', () => {
    const low = makeHorse('SL10', { soundness: 10 });
    const mean = meanSoundness('sound-low', 1000, low, low);
    expect(mean).toBeGreaterThan(10 + (70 - 10) * 0.15 - 1);
  });

  it('부모 건강도가 모두 95 이면 1,000회 평균 < 95', () => {
    const high = makeHorse('SH95', { soundness: 95 });
    const mean = meanSoundness('sound-high', 1000, high, high);
    expect(mean).toBeLessThan(95);
  });
});

describe('근친 과다 감점은 1대 한정 (M2-05c)', () => {
  it('inbreedingPenalty: 25% 이하는 {0,0}, 35% 는 {4, 10}', () => {
    expect(inbreedingPenalty(25)).toEqual({ potential: 0, soundness: 0 });
    const p = inbreedingPenalty(35);
    expect(p.potential).toBeCloseTo(4, 10);
    expect(p.soundness).toBeCloseTo(10, 10);
  });

  it('inbreedingEffect 는 35% 에서 보너스 0 − 감점 4, 건강도 10', () => {
    const e = inbreedingEffect(35);
    expect(e.potential).toBeCloseTo(-4, 10);
    expect(e.soundness).toBeCloseTo(10, 10);
  });

  it('부모의 자기 감점은 자손에게 가지 않는다: own 50% 부모(잠재 40, 건강도 60)는 잠재 50, 건강도 85 부모와 같은 망아지', () => {
    const sireExcess = makeHorse('OS', { potential: flat(40), soundness: 60 });
    const damExcess = makeHorse('OD', { potential: flat(40), soundness: 60 });
    const sireClean = makeHorse('OS', { potential: flat(50), soundness: 85 });
    const damClean = makeHorse('OD', { potential: flat(50), soundness: 85 });
    for (let i = 0; i < 50; i++) {
      const withOwn = breed(
        createRng(`own-${i}`),
        plainArgs(sireExcess, damExcess, { sireOwnBloodPercent: 50, damOwnBloodPercent: 50 }),
      );
      const withoutOwn = breed(createRng(`own-${i}`), plainArgs(sireClean, damClean));
      expect(withOwn.potential).toEqual(withoutOwn.potential);
      expect(withOwn.soundness).toEqual(withoutOwn.soundness);
      expect(withOwn).toEqual(withoutOwn);
    }
  });

  it('own 필드 0 또는 생략이면 결과가 같다', () => {
    const sire = makeHorse('OZS', { potential: flat(58), soundness: 70 });
    const dam = makeHorse('OZD', { potential: flat(52), soundness: 66 });
    for (let i = 0; i < 20; i++) {
      const omitted = breed(createRng(`zero-${i}`), plainArgs(sire, dam));
      const zero = breed(
        createRng(`zero-${i}`),
        plainArgs(sire, dam, { sireOwnBloodPercent: 0, damOwnBloodPercent: 0 }),
      );
      const at25 = breed(
        createRng(`zero-${i}`),
        plainArgs(sire, dam, { sireOwnBloodPercent: 25, damOwnBloodPercent: 25 }),
      );
      expect(zero).toEqual(omitted);
      expect(at25).toEqual(omitted);
    }
  });

  it('유전 기준값 상한: 잠재 95·건강도 95, own 100% 부모의 망아지 능력·건강도는 ABILITY_MAX 를 넘지 않는다', () => {
    const sire = makeHorse('CS', { potential: flat(95), soundness: 95 });
    const dam = makeHorse('CD', { potential: flat(95), soundness: 95 });
    for (let i = 0; i < 200; i++) {
      const foal = breed(
        createRng(`cap-${i}`),
        plainArgs(sire, dam, { sireOwnBloodPercent: 100, damOwnBloodPercent: 100 }),
      );
      for (const key of Object.keys(foal.potential) as (keyof Abilities)[]) {
        expect(foal.potential[key]).toBeLessThanOrEqual(ABILITY_MAX);
      }
      expect(foal.soundness).toBeLessThanOrEqual(ABILITY_MAX);
    }
  });
});

/** 거리 적성만 바꾼 말 (잠재·건강도는 기본값) */
function withDistance(id: string, distanceOptimum: number): Horse {
  return makeHorse(id, { aptitude: { ...BASE_HORSE.aptitude, distanceOptimum } });
}

describe('거리 적성 유전 가중과 보완형 (M2-16)', () => {
  it('거리 가중: 부 1400·외조부 3000·모 2000 이면 1,000두 평균 distanceOptimum 이 2030 ± 25', () => {
    const sire = withDistance('W_S', 1400);
    const dam = withDistance('W_D', 2000);
    const damsire = withDistance('W_G', 3000);
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const foal = breed(createRng(`dist-w-${i}`), plainArgs(sire, dam, { damsire }));
      values.push(foal.aptitude.distanceOptimum);
    }
    expect(Math.abs(meanOf(values) - 2030)).toBeLessThanOrEqual(25);
  });

  it('외조부 생략 시 부·모만 재정규화: 부 1400·모 2000 이면 평균 (0.45·1400 + 0.25·2000) / 0.70 ± 25', () => {
    const sire = withDistance('N_S', 1400);
    const dam = withDistance('N_D', 2000);
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) {
      values.push(breed(createRng(`dist-n-${i}`), plainArgs(sire, dam)).aptitude.distanceOptimum);
    }
    const expected = (0.45 * 1400 + 0.25 * 2000) / 0.7;
    expect(Math.abs(meanOf(values) - expected)).toBeLessThanOrEqual(25);
  });

  it('isComplementary: 부 speed + 외조부 cup + 모 middle → true', () => {
    expect(
      isComplementary(withDistance('C1', 1400), withDistance('C2', 2500), withDistance('C3', 3000)),
    ).toBe(true);
  });

  it('isComplementary: 부 middle → false', () => {
    expect(
      isComplementary(withDistance('C4', 2500), withDistance('C5', 2500), withDistance('C6', 3000)),
    ).toBe(false);
  });

  it('isComplementary: 부 classic + 외조부 speed + 모 speed → false (모계 스태미나 0)', () => {
    expect(
      isComplementary(withDistance('C7', 2000), withDistance('C8', 1400), withDistance('C9', 1400)),
    ).toBe(false);
  });

  it('보완형 보너스: 같은 시드·부모(잠재 60)에서 보완형 쌍이 비보완형보다 잠재 평균이 4.0~5.5 크다 (1,000쌍)', () => {
    const comp = makeHorse('BS_C', { potential: flat(60), aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 1400 } });
    const plain = makeHorse('BS_P', { potential: flat(60), aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    const dam = makeHorse('BD', { potential: flat(60), aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    const damsire = withDistance('BG', 3000);
    const withBonus = meanPotential('bonus-x', 1000, comp, dam, 'speed', { damsire });
    const withoutBonus = meanPotential('bonus-x', 1000, plain, dam, 'speed', { damsire });
    const diff = withBonus - withoutBonus;
    expect(diff).toBeGreaterThanOrEqual(4.0);
    expect(diff).toBeLessThanOrEqual(5.5);
  });

  it('1대 한정: 보완형 출신 부(잠재 64.8, own true)는 잠재 60 부(own false)와 같은 망아지를 만든다 (부)', () => {
    const dam = makeHorse('OCD', { potential: flat(55), soundness: 70, aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    const damsire = withDistance('OCG', 3000);
    const sireOwn = makeHorse('OCS', { potential: flat(64.8), soundness: 70, aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    const sirePlain = makeHorse('OCS', { potential: flat(60), soundness: 70, aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    for (let i = 0; i < 50; i++) {
      const a = breed(createRng(`own-c-s-${i}`), plainArgs(sireOwn, dam, { damsire, sireOwnComplement: true }));
      const b = breed(createRng(`own-c-s-${i}`), plainArgs(sirePlain, dam, { damsire, sireOwnComplement: false }));
      for (const key of Object.keys(a.potential) as (keyof Abilities)[]) {
        expect(a.potential[key]).toBeCloseTo(b.potential[key], 9);
      }
      expect(a.soundness).toBeCloseTo(b.soundness, 9);
    }
  });

  it('1대 한정: 보완형 출신 모(잠재 64.8, own true)는 잠재 60 모(own false)와 같은 망아지를 만든다 (모)', () => {
    const sire = makeHorse('OCS2', { potential: flat(55), soundness: 70, aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    const damsire = withDistance('OCG2', 3000);
    const damOwn = makeHorse('OCD2', { potential: flat(64.8), soundness: 70, aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    const damPlain = makeHorse('OCD2', { potential: flat(60), soundness: 70, aptitude: { ...BASE_HORSE.aptitude, distanceOptimum: 2500 } });
    for (let i = 0; i < 50; i++) {
      const a = breed(createRng(`own-c-d-${i}`), plainArgs(sire, damOwn, { damsire, damOwnComplement: true }));
      const b = breed(createRng(`own-c-d-${i}`), plainArgs(sire, damPlain, { damsire, damOwnComplement: false }));
      for (const key of Object.keys(a.potential) as (keyof Abilities)[]) {
        expect(a.potential[key]).toBeCloseTo(b.potential[key], 9);
      }
      expect(a.soundness).toBeCloseTo(b.soundness, 9);
    }
  });

  it('own 보완 필드 생략 시 damsire 를 줘도 보완 보너스 없이 같은 결과(own false 와 동일)', () => {
    const sire = withDistance('OPS', 1400);
    const dam = withDistance('OPD', 2500);
    const damsire = withDistance('OPG', 3000);
    for (let i = 0; i < 20; i++) {
      const omitted = breed(createRng(`own-p-${i}`), plainArgs(sire, dam, { damsire }));
      const explicit = breed(createRng(`own-p-${i}`), plainArgs(sire, dam, { damsire, sireOwnComplement: false, damOwnComplement: false }));
      expect(omitted).toEqual(explicit);
    }
  });
});

describe('배합 역할·보완형 힌트 (M2-16)', () => {
  const noLookup: PedigreeLookup = () => undefined;

  function previewOf(sire: Horse, dam: Horse, damsire: Horse | null) {
    return buildMatingPreview({
      sire,
      dam,
      damsireLineId: null,
      lookup: noLookup,
      nicks: [],
      revealedNicks: new Set<string>(),
      damsire,
    });
  }

  it('역할: 부 speed(1400) → speed, 외조부 classic(2000) → balanced, 외조부 cup(3000) → stamina', () => {
    const preview = previewOf(withDistance('RS', 1400), withDistance('RD', 2500), withDistance('RG', 2000));
    expect(preview.roles).toEqual({ sire: 'speed', damSide: 'balanced' });
    const stayer = previewOf(withDistance('RS2', 2500), withDistance('RD2', 2500), withDistance('RG2', 3000));
    expect(stayer.roles).toEqual({ sire: 'stamina', damSide: 'stamina' });
  });

  it('외조부 없으면 damSide unknown, complement unknown', () => {
    const preview = previewOf(withDistance('RS3', 1400), withDistance('RD3', 2500), null);
    expect(preview.roles.damSide).toBe('unknown');
    expect(preview.complement).toBe('unknown');
  });

  it('부 speed·classic + 외조부 middle·cup → complement likely', () => {
    expect(previewOf(withDistance('CL1', 1400), withDistance('CD1', 2000), withDistance('CG1', 2500)).complement).toBe('likely');
    expect(previewOf(withDistance('CL2', 2000), withDistance('CD2', 2000), withDistance('CG2', 3000)).complement).toBe('likely');
  });

  it('부 middle 이거나 외조부 classic 이면 complement unlikely', () => {
    expect(previewOf(withDistance('UL1', 2500), withDistance('UD1', 2000), withDistance('UG1', 3000)).complement).toBe('unlikely');
    expect(previewOf(withDistance('UL2', 1400), withDistance('UD2', 2000), withDistance('UG2', 2000)).complement).toBe('unlikely');
  });
});
