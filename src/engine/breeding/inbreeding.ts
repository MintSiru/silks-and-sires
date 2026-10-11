import type { Horse, HorseId, InbreedingCross, PedigreeNode } from '../types';
import { buildMatingPedigree, DEFAULT_PEDIGREE_DEPTH, type PedigreeLookup } from './pedigree';

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

  crosses.sort(compareCrosses);
  return crosses;
}

/** 교차 정렬 규칙: 혈량 내림차순, 같으면 ancestorId 오름차순 */
function compareCrosses(a: InbreedingCross, b: InbreedingCross): number {
  if (b.bloodPercent !== a.bloodPercent) return b.bloodPercent - a.bloodPercent;
  if (a.ancestorId < b.ancestorId) return -1;
  if (a.ancestorId > b.ancestorId) return 1;
  return 0;
}

/**
 * 혈통표를 깊이 우선으로 돌며 교차 조상 노드의 등장 수(total)와,
 * 그중 경로 위에 다른 교차 조상 Y 가 있어 Y 로 설명되는 등장 수(explained)를 센다.
 * path 는 현재 노드의 조상 가운데 교차 조상 id 스택이다.
 */
function countAppearances(
  node: PedigreeNode | null,
  crossIds: ReadonlySet<HorseId>,
  path: HorseId[],
  total: Map<HorseId, number>,
  explained: Map<HorseId, number>,
): void {
  if (node === null) return;
  const id = node.horseId;
  if (id === null || !crossIds.has(id)) {
    countAppearances(node.sire, crossIds, path, total, explained);
    countAppearances(node.dam, crossIds, path, total, explained);
    return;
  }

  total.set(id, (total.get(id) ?? 0) + 1);
  if (path.some((ancestor) => ancestor !== id)) {
    explained.set(id, (explained.get(id) ?? 0) + 1);
  }

  path.push(id);
  countAppearances(node.sire, crossIds, path, total, explained);
  countAppearances(node.dam, crossIds, path, total, explained);
  path.pop();
}

/**
 * 지배 교차만 남긴다: 교차 조상 X 가, 혈통표 안에서 다른 교차 조상 Y 의 조상으로 **모든 등장 위치에서** 설명되면 제외.
 * (X 의 각 등장 노드가 어떤 Y 노드의 하위 트리 안에 있으면 그 등장은 Y 로 설명된다. 모든 등장이 설명되면 X 제외)
 * 결과는 입력과 같은 정렬 규칙(bloodPercent 내림차순, 같으면 ancestorId 오름차순).
 */
export function dominantCrosses(
  root: PedigreeNode,
  crosses: readonly InbreedingCross[],
): InbreedingCross[] {
  const crossIds: ReadonlySet<HorseId> = new Set(crosses.map((c) => c.ancestorId));
  const total = new Map<HorseId, number>();
  const explained = new Map<HorseId, number>();
  countAppearances(root, crossIds, [], total, explained);

  const kept = crosses.filter((cross) => {
    const appearances = total.get(cross.ancestorId) ?? 0;
    const explainedCount = explained.get(cross.ancestorId) ?? 0;
    return !(appearances > 0 && explainedCount === appearances);
  });
  return kept.sort(compareCrosses);
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

/** 말 자신의 근친 혈량(%). 부·모 중 하나라도 null 이면 0. dominantCrosses 기준 totalBloodPercent */
export function ownBloodPercent(lookup: PedigreeLookup, horse: Horse): number {
  if (horse.sireId === null || horse.damId === null) return 0;
  const root = buildMatingPedigree(lookup, horse.sireId, horse.damId);
  return totalBloodPercent(dominantCrosses(root, findInbreeding(root)));
}
