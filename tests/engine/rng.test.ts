import { describe, expect, it } from 'vitest';
import { createRng, rngFromState } from '../../src/engine/rng';
import { cyrb128 } from '../../src/engine/rng/hash';
import type { Rng } from '../../src/engine/types';

function take(rng: Rng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

describe('cyrb128', () => {
  it('같은 문자열은 같은 4개 정수를, 모든 값은 32비트 부호 없는 정수를 낸다', () => {
    const h = cyrb128('silks-and-sires');
    expect(cyrb128('silks-and-sires')).toEqual(h);
    expect(h).toHaveLength(4);
    for (const v of h) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(4294967295);
    }
  });
});

describe('수용 기준 1: 같은 시드 = 같은 수열', () => {
  it('숫자 시드: 같은 시드의 next() 10,000개가 완전히 같고 다른 시드와는 다르다', () => {
    const a = take(createRng(42), 10000);
    const b = take(createRng(42), 10000);
    expect(a).toEqual(b);
    expect(take(createRng(43), 10000)).not.toEqual(a);
  });

  it('문자열 시드: 같은 시드의 next() 10,000개가 완전히 같고 다른 시드와는 다르다', () => {
    const a = take(createRng('bay-foal-2026'), 10000);
    const b = take(createRng('bay-foal-2026'), 10000);
    expect(a).toEqual(b);
    expect(take(createRng('bay-foal-2027'), 10000)).not.toEqual(a);
  });

  it('숫자 시드 42 와 문자열 시드 "42" 는 String(seed) 기준으로 같은 수열을 낸다', () => {
    expect(take(createRng(42), 100)).toEqual(take(createRng('42'), 100));
  });
});

describe('수용 기준 2: 상태 저장·복원', () => {
  it('임의 시점의 getState() → rngFromState() 가 원본과 이후 1,000개 출력이 같다', () => {
    const original = createRng('state-test');
    take(original, 537);
    const restored = rngFromState(original.getState());
    expect(take(restored, 1000)).toEqual(take(original, 1000));
  });

  it('JSON 직렬화/역직렬화를 거쳐도 같은 수열을 낸다', () => {
    const original = createRng(7);
    take(original, 101);
    const json = JSON.stringify(original.getState());
    const restored = rngFromState(JSON.parse(json));
    expect(take(restored, 1000)).toEqual(take(original, 1000));
  });

  it('rngFromState 는 입력 상태 객체를 변형하지 않는다', () => {
    const state = createRng('immutable').getState();
    const before = JSON.stringify(state);
    const rng = rngFromState(state);
    take(rng, 100);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('getState() 는 매번 새 객체를 주고, 반환값을 고쳐도 원본 Rng 에 영향이 없다', () => {
    const rng = createRng('copy-test');
    const s1 = rng.getState();
    const s2 = rng.getState();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
    expect(s1.algo).toBe('sfc32');
    const expected = take(rngFromState(rng.getState()), 50);
    s1.s[0] = 12345;
    expect(take(rngFromState(rng.getState()), 50)).toEqual(expected);
  });
});

describe('수용 기준 3: 분포 (균등)', () => {
  it('next() 100,000개는 모두 [0,1) 이고 평균이 0.5±0.01', () => {
    const rng = createRng('uniform');
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(Math.abs(sum / 100000 - 0.5)).toBeLessThanOrEqual(0.01);
  });

  it('int(1,6) 100,000회에서 각 눈 빈도가 1/6±0.01 이고 1과 6이 모두 나온다', () => {
    const rng = createRng('dice');
    const counts = new Map<number, number>();
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const v = rng.int(1, 6);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (let face = 1; face <= 6; face++) {
      const freq = (counts.get(face) ?? 0) / n;
      expect(Math.abs(freq - 1 / 6)).toBeLessThanOrEqual(0.01);
    }
    expect(counts.get(1)).toBeGreaterThan(0);
    expect(counts.get(6)).toBeGreaterThan(0);
  });

  it('range(min,max) 는 [min,max) 범위를 지키고 int 는 양끝을 포함한다', () => {
    const rng = createRng('range');
    for (let i = 0; i < 10000; i++) {
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      const k = rng.int(-2, 3);
      expect(k).toBeGreaterThanOrEqual(-2);
      expect(k).toBeLessThanOrEqual(3);
    }
  });

  it('chance(p) 는 p 에 대략 비례하는 빈도로 true 를 낸다', () => {
    const rng = createRng('chance');
    let hits = 0;
    for (let i = 0; i < 100000; i++) if (rng.chance(0.3)) hits++;
    expect(Math.abs(hits / 100000 - 0.3)).toBeLessThanOrEqual(0.01);
  });
});

describe('수용 기준 4: 정규 분포', () => {
  it('normal() 100,000개의 평균 0±0.02, 표준편차 1±0.02', () => {
    const rng = createRng('normal');
    const n = 100000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = rng.normal();
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(sd - 1)).toBeLessThanOrEqual(0.02);
  });

  it('normal(mean, sd) 는 평균·표준편차를 따라 이동·확대된다', () => {
    const rng = createRng('normal-shift');
    const n = 100000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.normal(70, 5);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean - 70)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(sd - 5)).toBeLessThanOrEqual(0.1);
  });
});

describe('수용 기준 5: fork', () => {
  it('같은 부모 상태에서 fork("a") 와 fork("b") 의 첫 100개 수열은 다르다', () => {
    const base = createRng('fork-parent').getState();
    const a = take(rngFromState(base).fork('a'), 100);
    const b = take(rngFromState(base).fork('b'), 100);
    expect(a).not.toEqual(b);
  });

  it('같은 상태에서 fork("a") 를 두 번 만들면 수열이 같다', () => {
    const base = createRng('fork-repeat').getState();
    const a1 = take(rngFromState(base).fork('a'), 100);
    const a2 = take(rngFromState(base).fork('a'), 100);
    expect(a1).toEqual(a2);
  });

  it('fork 는 부모에서 next() 정확히 1회분만 소비한다', () => {
    const parent = createRng('fork-consume');
    const clone = rngFromState(parent.getState());
    clone.next();
    parent.fork('draw');
    expect(parent.getState()).toEqual(clone.getState());
  });

  it('자식 시드는 label 과 부모의 next() 값을 섞은 createRng(label + ":" + v) 와 같다', () => {
    const base = createRng('fork-formula').getState();
    const probe = rngFromState(base);
    const v = Math.floor(probe.next() * 4294967296);
    const expected = take(createRng('odds:' + v), 100);
    const actual = take(rngFromState(base).fork('odds'), 100);
    expect(actual).toEqual(expected);
  });
});

describe('수용 기준 6: shuffle / 인자 검증', () => {
  it('shuffle 은 원본을 바꾸지 않고, 결과는 같은 원소의 순열이다', () => {
    const rng = createRng('shuffle');
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const snapshot = [...original];
    const result = rng.shuffle(original);
    expect(original).toEqual(snapshot);
    expect(result).not.toBe(original);
    expect([...result].sort((x, y) => x - y)).toEqual(snapshot);
  });

  it('shuffle 은 빈 배열과 원소 1개 배열도 처리한다', () => {
    const rng = createRng('shuffle-small');
    expect(rng.shuffle([])).toEqual([]);
    expect(rng.shuffle(['only'])).toEqual(['only']);
  });

  it('pick 은 배열의 원소 중 하나를 고른다', () => {
    const rng = createRng('pick');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 1000; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('int(2,1) 은 RangeError 를 던진다', () => {
    expect(() => createRng(1).int(2, 1)).toThrow(RangeError);
  });

  it('int(1.5,3) 은 RangeError 를 던진다', () => {
    expect(() => createRng(1).int(1.5, 3)).toThrow(RangeError);
  });

  it('pick([]) 은 throw 한다', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});
