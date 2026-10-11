import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { ODDS_LADDER, SAMPLE_ABILITY_MAX, SAMPLE_ABILITY_MIN } from '../../src/engine/config/raceday';
import { buildEntries, drawStalls, type EntryRequest } from '../../src/engine/race/setup';
import {
  formatOdds,
  impliedProbability,
  marketProbabilities,
  oddsToDecimal,
  priceField,
  probabilityToOdds,
} from '../../src/engine/race/odds';
import { generateSampleField, type NamePool } from '../../src/engine/race/sampleField';
import type { FractionalOdds } from '../../src/engine/types';

const SILKS = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };

function makeRequests(weights: number[], allowances: number[] = weights.map(() => 0)): EntryRequest[] {
  return weights.map((w, i) => ({
    horseId: `h-${i}`,
    jockeyId: `j-${i}`,
    tactic: 'midfield',
    silks: SILKS,
    isPlayer: i === 0,
    weightLb: w,
    jockeyAllowanceLb: allowances[i] ?? 0,
  }));
}

function inLadder(o: FractionalOdds): boolean {
  return ODDS_LADDER.some(([n, d]) => n === o.num && d === o.den);
}

const NAME_POOL: NamePool = {
  horses: Array.from({ length: 30 }, (_, i) => `Horse ${i + 1}`),
  jockeys: Array.from({ length: 30 }, (_, i) => `Jockey ${i + 1}`),
  owners: Array.from({ length: 30 }, (_, i) => `Owner ${i + 1}`),
};

describe('수용 기준 1: 출주 준비', () => {
  it('drawStalls(rng, 20) 은 1..20 의 순열이고 n<1 이면 RangeError', () => {
    const draw = drawStalls(createRng('stalls-1'), 20);
    expect([...draw].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(() => drawStalls(createRng(1), 0)).toThrow(RangeError);
  });

  it('buildEntries: 순서 = 요청 순서, 마번 1..n 순열, 최고 중량 = 마번 1, 감량 반영, odds null', () => {
    // 감량 전 중량: idx2=130, idx0=126, idx3=126, idx1=124. 마번은 감량 전 기준 내림차순.
    // 126 동률은 요청 index 오름차순(idx0 이 먼저). 감량은 마번에 영향 없음.
    const requests = makeRequests([126, 124, 130, 126], [0, 3, 0, 0]);
    const entries = buildEntries(createRng('entries-1'), requests);

    expect(entries).toHaveLength(4);
    entries.forEach((e, i) => expect(e.horseId).toBe(`h-${i}`));
    expect(entries.map((e) => e.saddleCloth).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(entries[2]?.saddleCloth).toBe(1);
    expect(entries[0]?.saddleCloth).toBe(2);
    expect(entries[3]?.saddleCloth).toBe(3);
    expect(entries[1]?.saddleCloth).toBe(4);
    expect(entries[1]?.weightLb).toBe(124 - 3);
    expect(entries[0]?.weightLb).toBe(126);
    expect(entries.every((e) => e.odds === null)).toBe(true);
    expect(entries.map((e) => e.draw).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(entries.map((e) => e.isPlayer)).toEqual([true, false, false, false]);
  });

  it('buildEntries: horseId 중복이거나 요청이 비면 throw', () => {
    const dup = makeRequests([120, 121]);
    dup[1] = { ...dup[1]!, horseId: 'h-0' };
    expect(() => buildEntries(createRng(1), dup)).toThrow();
    expect(() => buildEntries(createRng(1), [])).toThrow();
  });
});

describe('수용 기준 2: 같은 시드 = 같은 추첨', () => {
  it('같은 시드로 buildEntries 두 번 → 같은 draw', () => {
    const requests = makeRequests([120, 122, 124, 126, 128, 130, 118, 116]);
    const a = buildEntries(createRng('seed-x'), requests).map((e) => e.draw);
    const b = buildEntries(createRng('seed-x'), requests).map((e) => e.draw);
    expect(a).toEqual(b);
  });

  it('다른 시드 10개 중 적어도 하나는 draw 가 다르다', () => {
    const requests = makeRequests([120, 122, 124, 126, 128, 130]);
    const draws = new Set<string>();
    for (let s = 1; s <= 10; s++) {
      draws.add(buildEntries(createRng(s), requests).map((e) => e.draw).join(','));
    }
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe('수용 기준 3: 시장 확률', () => {
  it('합 = 1 (±1e-9), 빈 배열이면 []', () => {
    const p = marketProbabilities(createRng('mkt-1'), [0, 1, 2, -1, 0.5]);
    const sum = p.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
    expect(marketProbabilities(createRng(1), [])).toEqual([]);
  });

  it('+3초 강한 말이 100회 중 95회 이상 확률 최대', () => {
    const strengths = [3, 0, 0, 0, 0];
    let top = 0;
    for (let s = 0; s < 100; s++) {
      const p = marketProbabilities(createRng(`top-${s}`), strengths);
      const max = Math.max(...p);
      if (p[0] === max) top++;
    }
    expect(top).toBeGreaterThanOrEqual(95);
  });
});

describe('수용 기준 4: 확률 → 분수 오즈', () => {
  it('대표 값 변환 (overround 1)', () => {
    expect(probabilityToOdds(0.5, 1)).toEqual({ num: 1, den: 1 });
    expect(formatOdds(probabilityToOdds(0.5, 1))).toBe('Evs');
    expect(probabilityToOdds(0.2857, 1)).toEqual({ num: 5, den: 2 });
    expect(formatOdds(probabilityToOdds(0.2857, 1))).toBe('5/2');
    expect(probabilityToOdds(0.99, 1)).toEqual({ num: 1, den: 5 });
  });

  it('p=0.001 → 사다리 마지막 3칸 안 (200/1 근처)', () => {
    const o = probabilityToOdds(0.001);
    const tail = ODDS_LADDER.slice(-3).map(([n, d]) => `${n}/${d}`);
    expect(tail).toContain(`${o.num}/${o.den}`);
  });

  it('모든 결과가 ODDS_LADDER 안의 값 (넓은 p 스윕, 기본 overround)', () => {
    for (let p = 0.0005; p <= 1; p += 0.0137) {
      expect(inLadder(probabilityToOdds(p))).toBe(true);
    }
  });

  it('반환은 새 객체 (사다리 원본 공유 없음)', () => {
    const a = probabilityToOdds(0.5, 1);
    a.num = 999;
    expect(probabilityToOdds(0.5, 1)).toEqual({ num: 1, den: 1 });
  });

  it('oddsToDecimal, impliedProbability 기본 값', () => {
    expect(oddsToDecimal({ num: 1, den: 1 })).toBe(2);
    expect(impliedProbability({ num: 1, den: 1 })).toBe(0.5);
    expect(impliedProbability({ num: 5, den: 2 })).toBeCloseTo(2 / 7, 12);
  });
});

describe('수용 기준 5: 10두 필드의 오버라운드', () => {
  it('impliedProbability 합이 여러 시드에서 1.0~1.4', () => {
    const strengths = [4, 3.5, 3, 2.5, 2, 1, 0.5, 0, -1, -2];
    for (let s = 1; s <= 20; s++) {
      const odds = priceField(createRng(`field-${s}`), strengths);
      expect(odds).toHaveLength(10);
      const total = odds.reduce((acc, o) => acc + impliedProbability(o), 0);
      expect(total).toBeGreaterThanOrEqual(1.0);
      expect(total).toBeLessThanOrEqual(1.4);
      expect(odds.every(inLadder)).toBe(true);
    }
  });
});

describe('수용 기준 6: 샘플 출주마 생성', () => {
  it('size 20: 능력치 1~100, 이름 중복 없음, id 고유, 요청·주자 수 일치', () => {
    const field = generateSampleField(createRng('sample-1'), {
      size: 20,
      distance: 1600,
      surface: 'turf',
      year: 2026,
      namePool: NAME_POOL,
    });
    expect(field.runners).toHaveLength(20);
    expect(field.requests).toHaveLength(20);
    expect(field.ownerNames).toHaveLength(20);

    for (const r of field.runners) {
      for (const v of Object.values(r.horse.ability)) {
        expect(v).toBeGreaterThanOrEqual(SAMPLE_ABILITY_MIN);
        expect(v).toBeLessThanOrEqual(SAMPLE_ABILITY_MAX);
      }
      expect(r.jockey.skill).toBeGreaterThanOrEqual(SAMPLE_ABILITY_MIN);
      expect(r.jockey.skill).toBeLessThanOrEqual(SAMPLE_ABILITY_MAX);
    }

    const horseNames = field.runners.map((r) => r.horse.name);
    const jockeyNames = field.runners.map((r) => r.jockey.name);
    const allNames = [...horseNames, ...jockeyNames, ...field.ownerNames];
    expect(new Set(horseNames).size).toBe(20);
    expect(new Set(jockeyNames).size).toBe(20);
    expect(new Set(field.ownerNames).size).toBe(20);
    expect(new Set(allNames).size).toBe(allNames.length);

    const horseIds = field.runners.map((r) => r.horse.id);
    const jockeyIds = field.runners.map((r) => r.jockey.id);
    expect(new Set(horseIds).size).toBe(20);
    expect(new Set(jockeyIds).size).toBe(20);
    expect(field.requests.map((r) => r.horseId)).toEqual(horseIds);
    expect(field.requests.map((r) => r.jockeyId)).toEqual(jockeyIds);
  });

  it('3000m 평균 stamina 가 1200m 보다 25 이상 높다 (같은 시드 쌍 20회)', () => {
    let sumShort = 0;
    let sumLong = 0;
    let count = 0;
    for (let s = 0; s < 20; s++) {
      const base = { size: 20, surface: 'turf' as const, year: 2026, namePool: NAME_POOL };
      const short = generateSampleField(createRng(`st-${s}`), { ...base, distance: 1200 });
      const long = generateSampleField(createRng(`st-${s}`), { ...base, distance: 3000 });
      for (const r of short.runners) {
        sumShort += r.horse.ability.stamina;
        count++;
      }
      for (const r of long.runners) sumLong += r.horse.ability.stamina;
    }
    const avgShort = sumShort / count;
    const avgLong = sumLong / count;
    expect(avgLong - avgShort).toBeGreaterThanOrEqual(25);
  });

  it('이름 풀이 size 보다 작으면 RangeError, size < 1 도 RangeError', () => {
    const small: NamePool = { horses: ['a'], jockeys: ['b'], owners: ['c'] };
    expect(() =>
      generateSampleField(createRng(1), { size: 5, distance: 1200, surface: 'turf', year: 2026, namePool: small }),
    ).toThrow(RangeError);
    expect(() =>
      generateSampleField(createRng(1), { size: 0, distance: 1200, surface: 'turf', year: 2026, namePool: NAME_POOL }),
    ).toThrow(RangeError);
  });

  it('같은 rng 상태 + 같은 opts → 깊은 비교로 같은 결과', () => {
    const opts = { size: 12, distance: 2000, surface: 'aw' as const, year: 2026, namePool: NAME_POOL, playerIndex: 3 };
    const a = generateSampleField(createRng('deep'), opts);
    const b = generateSampleField(createRng('deep'), opts);
    expect(a).toEqual(b);
    expect(a.requests[3]?.isPlayer).toBe(true);
    expect(a.requests.filter((r) => r.isPlayer)).toHaveLength(1);
  });
});
