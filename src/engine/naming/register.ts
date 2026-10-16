import { NAME_SUGGESTION_COUNT } from '../config/naming';
import { getNamingData, getStallionNames } from '../data/staticData';
import { createRng } from '../rng';
import type { GameEvent, GameState, Horse, HorseId } from '../types';
import { makeNameRegistry, namingContextFor } from './context';
import { suggestNames } from './generate';
import type { NameRejectReason, NameRegistry } from './types';
import { normalizeName, validateHorseName } from './validate';

export type RegisterHorseNameError = 'not_found' | 'not_player' | 'already_registered' | NameRejectReason;
export type RegisterHorseNameResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: RegisterHorseNameError };

export function unnamedLabel(state: GameState, horse: Horse): string {
  // 사용자 결정 2026-10-16: '어미명 + 출생 연도 뒤 두 자리'(성별 없음), 어미가 없으면 '무명 27'
  const year = String(horse.birthYear).slice(-2).padStart(2, '0');
  const dam = horse.damId === null ? undefined : state.horses[horse.damId];
  return dam === undefined ? `무명 ${year}` : `${dam.name} ${year}`;
}

export function displayName(state: GameState, horse: Horse): string {
  return horse.nameRegistered === false ? unnamedLabel(state, horse) : horse.name;
}

/** count 는 현재 후보를 포함한 총 개수, round 는 '다른 후보'를 누른 횟수다. 공용 rng 는 사용하지 않는다. */
export function nameSuggestions(
  state: GameState, horseId: HorseId, count = NAME_SUGGESTION_COUNT, round = 0,
): string[] {
  const horse = state.horses[horseId];
  if (horse === undefined || horse.ownerId !== state.playerOwnerId || horse.nameRegistered !== false) return [];
  if (!Number.isSafeInteger(count) || count <= 0) return [];
  const naming = getNamingData();
  const ctx = namingContextFor(state, horse, { naming, stallionNames: getStallionNames() });
  const rng = createRng(`${state.initialSeed}:name-suggest:${horseId}:${round}`);
  const names = suggestNames(ctx, naming, rng, count - 1, makeNameRegistry(state));
  return [horse.name, ...names.map(candidate => candidate.name)];
}

/** 자기 후보만 중복 검사에서 제외한다. 다른 말의 미등록 후보도 예약된 이름으로 취급한다. */
export function registerHorseName(state: GameState, horseId: HorseId, name: string): RegisterHorseNameResult {
  const horse = state.horses[horseId];
  if (horse === undefined) return { ok: false, error: 'not_found' };
  if (horse.ownerId !== state.playerOwnerId) return { ok: false, error: 'not_player' };
  if (horse.nameRegistered !== false) return { ok: false, error: 'already_registered' };
  const taken = new Set(Object.values(state.horses).filter(h => h.id !== horseId).map(h => normalizeName(h.name)));
  const registry: NameRegistry = { isTaken: value => taken.has(normalizeName(value)) };
  const naming = getNamingData();
  const validation = validateHorseName(name, registry, naming.protectedNames, naming.blockedPlaceTokens);
  if (!validation.ok) return { ok: false, error: validation.reason };
  const next = structuredClone(state);
  const named = next.horses[horseId]!;
  named.name = name;
  delete named.nameRegistered;
  return { ok: true, state: next, events: [{ type: 'horse_named', horseId, name, auto: false, date: { ...state.date } }] };
}

/** 기존 후보를 확정한다. 호출자의 draft 만 바꾸고 난수를 소비하지 않는다. */
export function autoRegisterHorseName(horse: Horse, date: GameState['date']): GameEvent[] {
  if (horse.nameRegistered !== false) return [];
  delete horse.nameRegistered;
  return [{ type: 'horse_named', horseId: horse.id, name: horse.name, auto: true, date: { ...date } }];
}
