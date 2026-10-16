import { PRIVATE_RELATION_MIN, STUD_DEAL_FIRST_WEEK, STUD_DEAL_LAST_WEEK } from '../config/stud';
import { relationKey, relationOf } from '../economy/relations';
import type { GameState, HorseId, OwnerId } from '../types';

/** 비공개 종마의 교배 허가를 상태 변경 없이 조회한다. */
export function privateAccess(
  state: GameState, stallionId: HorseId, ownerId: OwnerId,
): 'public' | 'own' | 'allowed' | 'denied' {
  const privateTo = state.stallions[stallionId]?.privateTo;
  if (privateTo == null) return 'public';
  if (privateTo === ownerId) return 'own';
  return relationOf(state, relationKey('owner', privateTo)) >= PRIVATE_RELATION_MIN ? 'allowed' : 'denied';
}

type PrivateResult = { ok: true; state: GameState; events: [] }
  | { ok: false; error: 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased' | 'no_change' };

/** 거래 창에서 플레이어 종마의 외부 북을 열거나 닫는다. 원본은 보존한다. */
export function setStallionPrivate(state: GameState, horseId: HorseId, makePrivate: boolean): PrivateResult {
  const horse = state.horses[horseId];
  const stallion = state.stallions[horseId];
  if (horse === undefined || stallion === undefined) return { ok: false, error: 'not_found' };
  if (horse.status !== 'stud' || horse.ownerId !== state.playerOwnerId) {
    return { ok: false, error: 'not_player_stallion' };
  }
  if (state.date.week < STUD_DEAL_FIRST_WEEK || state.date.week > STUD_DEAL_LAST_WEEK) {
    return { ok: false, error: 'outside_deal_window' };
  }
  if (state.stud.leases.some((lease) => lease.stallionId === horseId)) return { ok: false, error: 'leased' };
  if ((stallion.privateTo != null) === makePrivate) return { ok: false, error: 'no_change' };
  const next = structuredClone(state);
  next.stallions[horseId]!.privateTo = makePrivate ? state.playerOwnerId : null;
  return { ok: true, state: next, events: [] };
}
