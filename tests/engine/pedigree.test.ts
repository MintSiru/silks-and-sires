import { describe, expect, it } from 'vitest';
import {
  buildMatingPedigree,
  buildPedigree,
  DEFAULT_PEDIGREE_DEPTH,
  ancestorsByGeneration,
  type PedigreeLookup,
} from '../../src/engine/breeding/pedigree';
import {
  findInbreeding,
  inbreedingLabel,
  totalBloodPercent,
} from '../../src/engine/breeding/inbreeding';
import type { PedigreeNode } from '../../src/engine/types';

/**
 * 작은 가상 족보: id → [sireId, damId]. 테이블에 없는 말은 부·모 기록이 없는 말(시조)로 취급한다.
 * 조회 자체가 실패하는 미상 말은 아래 partialLookup 처럼 직접 만든다.
 */
function lookupOf(table: Record<string, readonly [string | null, string | null]>): PedigreeLookup {
  const m = new Map(Object.entries(table));
  return (id) => {
    const entry = m.get(id);
    return { id, sireId: entry?.[0] ?? null, damId: entry?.[1] ?? null };
  };
}

/** 모든 말이 부·모를 가진 무한 족보. id 에 'S'/'D' 를 붙여 부·모 ID 를 만든다 */
const fullFamily: PedigreeLookup = (id) => ({ id, sireId: `${id}S`, damId: `${id}D` });

/** 대 g 에 나오는 실존 노드 ID 목록 */
function generationOf(root: PedigreeNode, g: number): string[] {
  return ancestorsByGeneration(root).get(g) ?? [];
}

/**
 * X 가 부측 대 3(R.S.S1.X), 모측 대 4(R.D.D1.D11.X) 에 나오는 족보.
 * 다른 조상은 중복되지 않는다.
 */
const crossX34 = lookupOf({
  R: ['S', 'D'],
  S: ['S1', 'S2'],
  S1: ['X', null],
  D: ['D1', 'D2'],
  D1: ['D11', null],
  D11: ['X', null],
});

describe('수용 기준 1: 5대 혈통표 노드 수 = 2^g', () => {
  it('부모가 모두 있는 족보에서 대 g 의 실존 노드 수는 2^g 이다 (g ≤ 5)', () => {
    const root = buildPedigree(fullFamily, 'R', 5);
    const byGen = ancestorsByGeneration(root);
    for (let g = 1; g <= 5; g++) {
      expect(byGen.get(g)).toHaveLength(2 ** g);
    }
    expect(byGen.get(0)).toEqual(['R']);
  });

  it('기본 깊이는 DEFAULT_PEDIGREE_DEPTH(5)이고, depth 대 노드의 sire/dam 은 null 이다', () => {
    expect(DEFAULT_PEDIGREE_DEPTH).toBe(5);
    const root = buildPedigree(fullFamily, 'R');
    expect(root.generation).toBe(0);
    expect(root.horseId).toBe('R');
    let node: PedigreeNode | null = root;
    for (let g = 0; g < 5; g++) {
      expect(node).not.toBeNull();
      node = node?.sire ?? null;
    }
    expect(node?.generation).toBe(5);
    expect(node?.sire).toBeNull();
    expect(node?.dam).toBeNull();
    expect(ancestorsByGeneration(root).get(5)).toHaveLength(32);
  });

  it('조회되지 않는 부모(또는 sireId/damId null)는 null 로 남고 노드가 생기지 않는다', () => {
    // S 는 조회되지만 S 의 부(X)는 조회되지 않는다
    const partial: PedigreeLookup = (id) => {
      if (id === 'R') return { id, sireId: 'S', damId: null };
      if (id === 'S') return { id, sireId: 'X', damId: null };
      return undefined;
    };
    const root = buildPedigree(partial, 'R', 5);
    expect(root.sire?.horseId).toBe('S');
    expect(root.sire?.sire).toBeNull();
    expect(root.dam).toBeNull();
    expect(generationOf(root, 1)).toEqual(['S']);
    expect(generationOf(root, 2)).toEqual([]);
  });

  it('depth 를 줄이면 그 대까지만 펼친다', () => {
    const root = buildPedigree(fullFamily, 'R', 1);
    expect(root.sire?.generation).toBe(1);
    expect(root.sire?.sire).toBeNull();
    expect(root.dam?.dam).toBeNull();
  });

  it('순환 데이터(A 의 부가 A)여도 depth 를 넘지 않고 끝난다', () => {
    const cyclic = lookupOf({ A: ['A', null] });
    const root = buildPedigree(cyclic, 'A', 5);
    const byGen = ancestorsByGeneration(root);
    for (let g = 0; g <= 5; g++) {
      expect(byGen.get(g)).toEqual(['A']);
    }
  });
});

describe('수용 기준 2: 대 3 과 대 4 교차 → 3×4, 18.75%', () => {
  it('X 교차 1건, label "3×4", bloodPercent 18.75', () => {
    const crosses = findInbreeding(buildPedigree(crossX34, 'R'));
    expect(crosses).toHaveLength(1);
    expect(crosses[0]).toEqual({
      ancestorId: 'X',
      sireSide: [3],
      damSide: [4],
      label: '3×4',
      bloodPercent: 18.75,
    });
  });
});

describe('수용 기준 3: 부측 4·5, 모측 3 → 4×5×3', () => {
  it('label "4×5×3", bloodPercent = (0.0625+0.03125+0.125)×100', () => {
    // 부측: R.S.P2.P3.X (대 4), R.S.Q2.Q3.Q4.X (대 5)
    // 모측: R.D.D1.X (대 3)
    const family = lookupOf({
      R: ['S', 'D'],
      S: ['P2', 'Q2'],
      P2: ['P3', null],
      P3: ['X', null],
      Q2: ['Q3', null],
      Q3: [null, 'Q4'],
      Q4: [null, 'X'],
      D: ['D1', null],
      D1: ['X', null],
    });
    const crosses = findInbreeding(buildPedigree(family, 'R'));
    expect(crosses).toHaveLength(1);
    expect(crosses[0]?.ancestorId).toBe('X');
    expect(crosses[0]?.sireSide).toEqual([4, 5]);
    expect(crosses[0]?.damSide).toEqual([3]);
    expect(crosses[0]?.label).toBe('4×5×3');
    expect(crosses[0]?.bloodPercent).toBe((0.0625 + 0.03125 + 0.125) * 100);
  });
});

describe('수용 기준 4: 부 = 모의 부 → 1×2, 75%', () => {
  it('root.sire 가 root.dam 의 부이기도 하면 1×2, 75%', () => {
    const family = lookupOf({ R: ['A', 'D'], D: ['A', null] });
    const crosses = findInbreeding(buildPedigree(family, 'R'));
    expect(crosses).toHaveLength(1);
    expect(crosses[0]?.label).toBe('1×2');
    expect(crosses[0]?.bloodPercent).toBe(75);
  });
});

describe('수용 기준 5: 공통 조상 없음 → 빈 배열, maxGeneration 존중', () => {
  it('공통 조상이 없으면 빈 배열', () => {
    const root = buildPedigree(lookupOf({ R: ['A', 'B'] }), 'R');
    expect(findInbreeding(root)).toEqual([]);
  });

  it('maxGeneration 3 이면 대 4 이상 조상은 무시한다', () => {
    const root = buildPedigree(crossX34, 'R');
    // 모측 X 는 대 4 → 무시되어 교차가 사라진다
    expect(findInbreeding(root, 3)).toEqual([]);
    expect(findInbreeding(root, 4)).toHaveLength(1);
  });

  it('인브리드가 여러 건이면 혈량 내림차순으로 정렬된다', () => {
    // A: 부측 대 1 (R.A), 모측 대 2 (R.D.A) → 1×2 = 75%
    // X: 부측 대 2 (R.A.X), 모측 대 3 (R.D.A.X 와 R.D.B.X 두 경로) → 2×3×3 = 50%
    const family = lookupOf({
      R: ['A', 'D'],
      A: ['X', null],
      D: ['A', 'B'],
      B: ['X', null],
    });
    const crosses = findInbreeding(buildPedigree(family, 'R'));
    expect(crosses.map((c) => c.ancestorId)).toEqual(['A', 'X']);
    expect(crosses[0]?.label).toBe('1×2');
    expect(crosses[0]?.bloodPercent).toBe(75);
    expect(crosses[1]?.label).toBe('2×3×3');
    expect(crosses[1]?.bloodPercent).toBe(50);
    expect(totalBloodPercent(crosses)).toBe(125);
  });
});

describe('수용 기준 6: buildMatingPedigree 구조', () => {
  it('root.horseId null, generation 0, 부·모 노드 generation 1', () => {
    const root = buildMatingPedigree(fullFamily, 'SIRE', 'DAM', 3);
    expect(root.horseId).toBeNull();
    expect(root.generation).toBe(0);
    expect(root.sire?.horseId).toBe('SIRE');
    expect(root.sire?.generation).toBe(1);
    expect(root.dam?.horseId).toBe('DAM');
    expect(root.dam?.generation).toBe(1);
  });

  it('가상 교배 혈통표의 대별 노드 수는 2^g (g ≥ 1), 미상 노드(root)는 포함하지 않는다', () => {
    const root = buildMatingPedigree(fullFamily, 'SIRE', 'DAM', 3);
    const byGen = ancestorsByGeneration(root);
    expect(byGen.get(0)).toEqual([]);
    for (let g = 1; g <= 3; g++) {
      expect(byGen.get(g)).toHaveLength(2 ** g);
    }
  });

  it('가상 교배의 인브리드도 찾는다 (부 = 모의 부)', () => {
    const family = lookupOf({ SIRE: ['A', null], DAM: ['A', null] });
    const crosses = findInbreeding(buildMatingPedigree(family, 'SIRE', 'DAM'));
    expect(crosses).toHaveLength(1);
    expect(crosses[0]?.label).toBe('2×2');
    expect(crosses[0]?.bloodPercent).toBe(50);
  });
});

describe('inbreedingLabel / totalBloodPercent', () => {
  it('부측 [4], 모측 [3] → "4×3"; 부측 [4,5], 모측 [3] → "4×5×3"', () => {
    expect(inbreedingLabel([4], [3])).toBe('4×3');
    expect(inbreedingLabel([4, 5], [3])).toBe('4×5×3');
  });

  it('입력이 정렬되지 않아도 대 오름차순으로 표기한다', () => {
    expect(inbreedingLabel([5, 4], [3])).toBe('4×5×3');
  });

  it('totalBloodPercent 는 단순 합이다', () => {
    const crosses = findInbreeding(buildPedigree(crossX34, 'R'));
    expect(totalBloodPercent(crosses)).toBe(18.75);
    expect(totalBloodPercent([])).toBe(0);
  });
});
