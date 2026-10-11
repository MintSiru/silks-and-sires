import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { generateHorse } from '../../src/engine/horse/generate';
import { breed, inbreedingEffect, type BreedArgs } from '../../src/engine/breeding/genetics';
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
      ['comments', 'distanceHint', 'damId', 'inbreeding', 'nick', 'precocityHint', 'sireId'].sort(),
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
