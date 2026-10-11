import type { Horse, HorseId, PedigreeNode } from '../types';

/** 혈통 조회에 필요한 최소 정보 */
export type PedigreeSource = Pick<Horse, 'id' | 'sireId' | 'damId'>;
/** 말 ID → 부·모 정보. 모르는 말이면 undefined */
export type PedigreeLookup = (id: HorseId) => PedigreeSource | undefined;

/** 기본 혈통표 깊이(대). 5대 혈통표 */
export const DEFAULT_PEDIGREE_DEPTH = 5;

/**
 * 노드 하나를 만든다. src 가 있을 때만 generation < depth 인 동안 부·모를 펼친다.
 * depth 대 노드의 sire/dam 은 null 이다. 순환 데이터여도 depth 를 넘지 않으므로 종료된다.
 */
function expandNode(
  lookup: PedigreeLookup,
  id: HorseId,
  generation: number,
  depth: number,
  src: PedigreeSource | undefined,
): PedigreeNode {
  const canExpand = src !== undefined && generation < depth;
  return {
    horseId: id,
    generation,
    sire: canExpand ? parentNode(lookup, src.sireId, generation + 1, depth) : null,
    dam: canExpand ? parentNode(lookup, src.damId, generation + 1, depth) : null,
  };
}

/** 부모 노드. 부모 ID 가 없거나 조회되지 않으면 null (미상 부모는 노드를 만들지 않는다) */
function parentNode(
  lookup: PedigreeLookup,
  parentId: HorseId | null,
  generation: number,
  depth: number,
): PedigreeNode | null {
  if (parentId === null) return null;
  const src = lookup(parentId);
  if (src === undefined) return null;
  return expandNode(lookup, parentId, generation, depth, src);
}

/** 실존 말의 혈통표. root.generation = 0. depth 대까지(depth 대 노드의 sire/dam 은 null) */
export function buildPedigree(
  lookup: PedigreeLookup,
  id: HorseId,
  depth: number = DEFAULT_PEDIGREE_DEPTH,
): PedigreeNode {
  return expandNode(lookup, id, 0, depth, lookup(id));
}

/** 가상 교배 혈통표: root.horseId = null, root.sire = 부의 혈통(대 1부터), root.dam = 모의 혈통 */
export function buildMatingPedigree(
  lookup: PedigreeLookup,
  sireId: HorseId,
  damId: HorseId,
  depth: number = DEFAULT_PEDIGREE_DEPTH,
): PedigreeNode {
  return {
    horseId: null,
    generation: 0,
    sire: parentNode(lookup, sireId, 1, depth),
    dam: parentNode(lookup, damId, 1, depth),
  };
}

/**
 * 대별 노드 목록(0..depth). 미상 노드(horseId null)는 포함하지 않는다(실존 노드만).
 * 같은 말이 여러 경로로 한 대에 나오면 노드 수만큼 중복 포함한다.
 */
export function ancestorsByGeneration(root: PedigreeNode): Map<number, HorseId[]> {
  let maxGeneration = 0;
  const collected: { generation: number; horseId: HorseId | null }[] = [];

  const walk = (node: PedigreeNode | null): void => {
    if (node === null) return;
    collected.push({ generation: node.generation, horseId: node.horseId });
    if (node.generation > maxGeneration) maxGeneration = node.generation;
    walk(node.sire);
    walk(node.dam);
  };
  walk(root);

  const result = new Map<number, HorseId[]>();
  for (let g = 0; g <= maxGeneration; g++) result.set(g, []);
  for (const entry of collected) {
    if (entry.horseId === null) continue;
    result.get(entry.generation)?.push(entry.horseId);
  }
  return result;
}
