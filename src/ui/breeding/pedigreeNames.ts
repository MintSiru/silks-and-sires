import { pedigreeDamId } from '../../engine/breeding/pedigree';
import { createPedigreeLookup, isAnonDamId } from '../../engine/breeding/realPedigree';
import { getStallionRecords } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import type { GameState, Horse } from '../../engine/types';

/** Horse 레코드가 없는 가상 모마도 혈통표에서 이름을 표시한다. */
export function pedigreeNameOf(state: GameState, id: string | null): string {
  if (id === null || isAnonDamId(id)) return '—';
  const horse = state.horses[id];
  return horse === undefined
    ? (createPedigreeLookup(state.horses, getStallionRecords())(id)?.name ?? '—')
    : displayName(state, horse);
}

export function parentageOf(state: GameState, horse: Horse) {
  const lookup = createPedigreeLookup(state.horses, getStallionRecords());
  const damId = pedigreeDamId(lookup(horse.id) ?? horse);
  const dam = damId === null ? undefined : lookup(damId);
  return { sire: pedigreeNameOf(state, horse.sireId), dam: pedigreeNameOf(state, damId),
    damsire: pedigreeNameOf(state, dam?.sireId ?? null) };
}
