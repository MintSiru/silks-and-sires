import { FARM_NAME_MAX_LENGTH, FARM_NAME_MIN_LENGTH } from '../config/farm';
import { getNamingData } from '../data/staticData';
import { hasBlockedPlaceToken, normalizeName } from '../naming/validate';
import type { GameEvent, GameState } from '../types';

export type FarmNameError = 'too_short' | 'too_long' | 'invalid_chars' | 'taken' | 'protected';
export class FarmNameValidationError extends RangeError {
  constructor(readonly reason: FarmNameError) {
    super(`목장 이름 오류: ${reason}`);
  }
}

export type RenameFarmResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: FarmNameError | 'no_farm' };

/** 구두점·대소문자·공백 차이로 중복을 우회하지 못하게 한다. 한글 등 글자도 보존한다. */
function farmNameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
}

export function validateFarmName(state: GameState, name: string): FarmNameError | null {
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < FARM_NAME_MIN_LENGTH) return 'too_short';
  if (length > FARM_NAME_MAX_LENGTH) return 'too_long';
  if (!/^[\p{L}\p{M} '.-]+$/u.test(trimmed) || !/\p{L}/u.test(trimmed)) return 'invalid_chars';
  const naming = getNamingData();
  const key = farmNameKey(trimmed);
  // 보호 이름은 목장명 구절 안에 포함되어도 차단한다(보조 장치).
  const words = trimmed.split(/[ .-]+/).map(normalizeName);
  const protectedPhrase = words.some((_, start) => words.slice(start).some((_, end) =>
    naming.protectedNames.has(words.slice(start, start + end + 1).join(''))));
  if (protectedPhrase
    || hasBlockedPlaceToken(trimmed.replace(/[-.]/g, ' '), naming.blockedPlaceTokens)) return 'protected';
  if (Object.values(state.owners).some(owner => owner.id !== state.playerOwnerId
    && owner.studName !== null && farmNameKey(owner.studName) === key)
    || Object.values(state.breeders).some(breeder => farmNameKey(breeder.name) === key)) return 'taken';
  return null;
}

export function renameFarm(state: GameState, name: string): RenameFarmResult {
  if (!state.farm.owned) return { ok: false, error: 'no_farm' };
  const error = validateFarmName(state, name);
  if (error !== null) return { ok: false, error };
  const next = structuredClone(state);
  next.farm.name = name.trim();
  next.owners[next.playerOwnerId]!.studName = name.trim();
  return { ok: true, state: next, events: [] };
}
