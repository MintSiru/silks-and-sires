/**
 * 전속 계약 조회(M4-B3). 관계(relations.ts)·계약 처리(contracts.ts)·기수 배정·조교사 위탁이 함께 쓴다.
 * 상태를 바꾸지 않는다.
 */
import type { GameState, RelationKey, RetainerContract } from '../types';

/** 플레이어의 그 사람 계약(없으면 undefined) */
export function contractFor(
  state: Pick<GameState, 'relations'>,
  kind: RetainerContract['kind'],
  personId: string,
): RetainerContract | undefined {
  return state.relations.contracts.find((c) => c.kind === kind && c.personId === personId);
}

/** 관계 키(`trainer:…`·`jockey:…`)가 계약 중인 사람인가. owner 키는 항상 false */
export function isContractedKey(state: Pick<GameState, 'relations'>, key: RelationKey): boolean {
  const sep = key.indexOf(':');
  const kind = key.slice(0, sep);
  if (kind !== 'trainer' && kind !== 'jockey') return false;
  return contractFor(state, kind, key.slice(sep + 1)) !== undefined;
}
