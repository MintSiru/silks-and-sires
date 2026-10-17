// 혈통표의 순수 배치·상단 해설 함수(DOM 없음). PedigreeView 가 쓴다.
import { dominantCrosses, findInbreeding, totalBloodPercent } from '../../engine/breeding/inbreeding';
import { isAnonDamId } from '../../engine/breeding/realPedigree';
import type { HorseId, PedigreeNode } from '../../engine/types';

/** 처음 보여 줄 대수(부·모 = 1대). 더 보려면 '5대 보기'로 펼친다. */
export const PEDIGREE_BASE_DEPTH = 3;

/** 정보가 없을 때 쓰는 중립 문구(회색) */
export const PEDIGREE_EMPTY_KO = '정보 없음';

/** 표의 한 칸: 대(1~depth), 시작 행(0-base), 행 수, 노드(미상이면 null), 속한 쪽 */
export interface PedigreeSlot {
  generation: number;
  start: number;
  span: number;
  node: PedigreeNode | null;
  /** 위 절반 = 부측(sire), 아래 절반 = 모측(dam) */
  side: 'sire' | 'dam';
}

export interface PedigreeGrid {
  depth: number;
  /** 세로 행 수 = 2^depth */
  rows: number;
  slots: PedigreeSlot[];
}

/**
 * 부측(위)·모측(아래) 칸 배치. 대가 한 단계 깊어질 때마다 칸 높이는 절반이 된다.
 * 미상 노드도 칸을 차지하므로 노드가 null 이면 자식도 null 로 내려보낸다.
 */
export function layoutPedigree(root: PedigreeNode, depth: number): PedigreeGrid {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new RangeError(`layoutPedigree: 잘못된 대수: ${depth}`);
  }
  const rows = 2 ** depth;
  const half = rows / 2;
  const slots: PedigreeSlot[] = [];
  const walk = (node: PedigreeNode | null, generation: number, start: number, span: number): void => {
    slots.push({ generation, start, span, node, side: start < half ? 'sire' : 'dam' });
    if (generation >= depth) return;
    const next = span / 2;
    walk(node?.sire ?? null, generation + 1, start, next);
    walk(node?.dam ?? null, generation + 1, start + next, next);
  };
  walk(root.sire, 1, 0, half);
  walk(root.dam, 1, half, half);
  return { depth, rows, slots };
}

/** 빈 칸 판정: 미상이거나 이름을 기록하지 않은 암말(실명 종마의 모마 칸)이면 true */
export function isBlankPedigreeNode(node: PedigreeNode | null): boolean {
  const id = node?.horseId ?? null;
  return id === null || isAnonDamId(id);
}

/** 상단 한 줄 해설의 항목 하나. empty 면 중립 회색으로 보인다. */
export interface PedigreeFact {
  key: 'damsire' | 'nick' | 'inbreed';
  label: string;
  value: string;
  empty: boolean;
}

/**
 * 상단 한 줄 해설: 외조부 · 니크 · 근친.
 * - 외조부: 모의 부. 미상이면 '정보 없음'.
 * - 니크: 호출하는 쪽이 넘긴 라벨. 넘기지 않으면(undefined) 항목을 빼고, 미확인이면(null) '정보 없음'.
 * - 근친: 지배 인브리드 혈량. 0 이면 '없음'(중립).
 */
export function pedigreeCommentary(
  root: PedigreeNode,
  nameOf: (id: HorseId) => string,
  nick?: string | null,
): PedigreeFact[] {
  const damsireId = root.dam?.sire?.horseId ?? null;
  const damsireName = damsireId !== null && !isAnonDamId(damsireId) ? nameOf(damsireId) : null;
  const facts: PedigreeFact[] = [
    {
      key: 'damsire',
      label: '외조부',
      value: damsireName ?? PEDIGREE_EMPTY_KO,
      empty: damsireName === null,
    },
  ];
  if (nick !== undefined) {
    facts.push({ key: 'nick', label: '니크', value: nick ?? PEDIGREE_EMPTY_KO, empty: nick === null });
  }
  const percent = totalBloodPercent(dominantCrosses(root, findInbreeding(root)));
  facts.push({
    key: 'inbreed',
    label: '근친',
    value: percent > 0 ? `혈량 ${Math.round(percent * 10) / 10}%` : '없음',
    empty: false,
  });
  return facts;
}
