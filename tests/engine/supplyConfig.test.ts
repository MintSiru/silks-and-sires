import { describe, expect, it } from 'vitest';
import {
  DISTANCE_BUCKETS,
  GENERATED_KIND_WEIGHTS,
  HANDICAP_CLASSES,
  HANDICAP_CLASS_WEIGHTS,
  HANDICAP_OR_RANGE,
  TWO_YO_SHARE,
} from '../../src/engine/config/meetings';
import { GROUP_OR_FLOOR, TRAVEL_CHANCE_GROUP } from '../../src/engine/config/entries';

/** M3-F2b 출주 공급 밸런스 상수의 불변식. 값이 바뀌어도 구조가 깨지지 않는지 본다 */
describe('출주 공급 밸런스 상수 (M3-F2b)', () => {
  const EPS = 1e-9;

  it('거리 구간 가중치 합은 1 이고 모두 0 이상이다', () => {
    const sum = DISTANCE_BUCKETS.reduce((acc, b) => acc + b.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(EPS);
    for (const b of DISTANCE_BUCKETS) expect(b.weight).toBeGreaterThanOrEqual(0);
  });

  it('자동 생성 종류 가중치 합은 1 이다', () => {
    const sum = Object.values(GENERATED_KIND_WEIGHTS).reduce((acc, w) => acc + w, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(EPS);
  });

  it('핸디캡 클래스 가중치 합은 1 이고 OR 대역은 min ≤ max 이다', () => {
    const sum = HANDICAP_CLASSES.reduce((acc, c) => acc + HANDICAP_CLASS_WEIGHTS[c], 0);
    expect(Math.abs(sum - 1)).toBeLessThan(EPS);
    for (const c of HANDICAP_CLASSES) {
      const range = HANDICAP_OR_RANGE[c];
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
  });

  it('핸디캡 OR 대역은 클래스가 높을수록(숫자가 작을수록) 상한이 올라간다', () => {
    for (let i = 0; i + 1 < HANDICAP_CLASSES.length; i++) {
      const upper = HANDICAP_CLASSES[i];
      const lower = HANDICAP_CLASSES[i + 1];
      if (upper === undefined || lower === undefined) continue;
      expect(HANDICAP_OR_RANGE[upper].max).toBeGreaterThanOrEqual(HANDICAP_OR_RANGE[lower].max);
    }
  });

  it('그룹 OR 하한은 G1 ≥ G2 ≥ G3 ≥ L 순서다', () => {
    expect(GROUP_OR_FLOOR.G1).toBeGreaterThanOrEqual(GROUP_OR_FLOOR.G2);
    expect(GROUP_OR_FLOOR.G2).toBeGreaterThanOrEqual(GROUP_OR_FLOOR.G3);
    expect(GROUP_OR_FLOOR.G3).toBeGreaterThanOrEqual(GROUP_OR_FLOOR.L);
  });

  it('2세 경주 비율과 원정 확률은 0~1 사이다', () => {
    expect(TWO_YO_SHARE).toBeGreaterThanOrEqual(0);
    expect(TWO_YO_SHARE).toBeLessThanOrEqual(1);
    expect(TRAVEL_CHANCE_GROUP).toBeGreaterThanOrEqual(0);
    expect(TRAVEL_CHANCE_GROUP).toBeLessThanOrEqual(1);
  });
});
