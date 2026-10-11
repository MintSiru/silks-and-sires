import type { HorseId, InbreedingCross, PedigreeNode } from '../types';
import { DEFAULT_PEDIGREE_DEPTH } from './pedigree';

/** 조상 한 명이 한 측(부측 또는 모측)에서 등장한 대 목록을 모은다. 시작 노드는 1대 */
function collectSide(
  node: PedigreeNode | null,
  generation: number,
  maxGeneration: number,
  out: Map<HorseId, number[]>,
): void {
  if (node === null || generation > maxGeneration) return;
  if (node.horseId !== null) {
    const list = out.get(node.horseId);
    if (list) list.push(generation);
    else out.set(node.horseId, [generation]);
  }
  collectSide(node.sire, generation + 1, maxGeneration, out);
  collectSide(node.dam, generation + 1, maxGeneration, out);
}

/** 혈량(%) = Σ 0.5^대 × 100 */
function bloodPercentOf(generations: readonly number[]): number {
  let sum = 0;
  for (const g of generations) sum += 0.5 ** g;
  return sum * 100;
}

/**
 * 인브리드 탐지. root.sire 쪽과 root.dam 쪽 양쪽에 모두 등장한 조상만 보고한다.
 * root.sire / root.dam 자체도 조상 후보다(1대). maxGeneration 을 넘는 대는 무시한다.
 */
export function findInbreeding(
  root: PedigreeNode,
  maxGeneration: number = DEFAULT_PEDIGREE_DEPTH,
): InbreedingCross[] {
  const sireMap = new Map<HorseId, number[]>();
  const damMap = new Map<HorseId, number[]>();
  collectSide(root.sire, 1, maxGeneration, sireMap);
  collectSide(root.dam, 1, maxGeneration, damMap);

  const crosses: InbreedingCross[] = [];
  for (const [ancestorId, sireGenerations] of sireMap) {
    const damGenerations = damMap.get(ancestorId);
    if (damGenerations === undefined) continue;
    const sireSide = [...sireGenerations].sort((a, b) => a - b);
    const damSide = [...damGenerations].sort((a, b) => a - b);
    crosses.push({
      ancestorId,
      sireSide,
      damSide,
      label: inbreedingLabel(sireSide, damSide),
      bloodPercent: bloodPercentOf([...sireSide, ...damSide]),
    });
  }

  crosses.sort((a, b) => {
    if (b.bloodPercent !== a.bloodPercent) return b.bloodPercent - a.bloodPercent;
    if (a.ancestorId < b.ancestorId) return -1;
    if (a.ancestorId > b.ancestorId) return 1;
    return 0;
  });
  return crosses;
}

/** 표기: 부측 대들 오름차순 "×" 연결, 이어서 모측 대들 오름차순 "×" 연결. 예: "4×3", "4×5×3" */
export function inbreedingLabel(sireSide: readonly number[], damSide: readonly number[]): string {
  const sorted = (gens: readonly number[]): number[] => [...gens].sort((a, b) => a - b);
  return [...sorted(sireSide), ...sorted(damSide)].join('×');
}

/** 인브리드 목록의 혈량(%) 단순 합 */
export function totalBloodPercent(crosses: readonly InbreedingCross[]): number {
  let sum = 0;
  for (const cross of crosses) sum += cross.bloodPercent;
  return sum;
}
