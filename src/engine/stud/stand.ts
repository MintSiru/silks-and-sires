import * as config from '../config/stud';
import { FERTILITY_MAX, FERTILITY_MEAN, FERTILITY_MIN, FERTILITY_SD } from '../config/world';
import { createRng } from '../rng';
import type { CountryCode, GameEvent, GameState, HorseId, Stallion } from '../types';
import { estimateStudFee } from './value';

export type StandError = 'not_found' | 'not_player_horse' | 'not_entire_colt'
  | 'too_young' | 'not_racing' | 'no_free_slot';

export function freeStudSlots(state: GameState): number {
  const occupied = Object.values(state.horses).filter(
    (horse) => horse.ownerId === state.playerOwnerId && horse.status === 'stud',
  ).length;
  return Math.max(0, state.stud.slots - occupied);
}

export function canStandAtStud(state: GameState, horseId: HorseId, year: number): StandError | null {
  const horse = state.horses[horseId];
  if (horse === undefined) return 'not_found';
  if (horse.ownerId !== state.playerOwnerId) return 'not_player_horse';
  if (horse.sex !== 'male' || horse.gelded) return 'not_entire_colt';
  if (year - horse.birthYear < config.STUD_MIN_AGE) return 'too_young';
  if (horse.status !== 'in_training' && horse.status !== 'resting') return 'not_racing';
  if (freeStudSlots(state) === 0) return 'no_free_slot';
  return null;
}

/** 계류·국내 판매가 공유하는 레코드. 수태율은 기존 독립 시드 스트림을 유지한다. */
export function buildStallionRecord(
  draft: GameState, horseId: HorseId, year: number, standsIn: CountryCode,
): Stallion {
  const horse = draft.horses[horseId];
  if (horse === undefined) throw new Error('buildStallionRecord: 말 없음');
  const { fee } = estimateStudFee(draft, horseId);
  let bookLimit: number = config.STUD_BOOK_LIMIT_BY_FEE[0][1];
  for (const [threshold, limit] of config.STUD_BOOK_LIMIT_BY_FEE) {
    if (fee >= threshold) bookLimit = limit;
  }
  return {
    horseId, realKey: null,
    sireLineId: horse.sireLineId
      ?? (horse.sireId === null ? undefined : draft.stallions[horse.sireId]?.sireLineId)
      ?? 'sl_phalaris',
    fee, bookLimit, bookedThisSeason: 0, bookingSeason: year, aiBooked: 0, aiDemand: 0,
    popularity: Math.max(config.STUD_POPULARITY_MIN, Math.min(config.STUD_POPULARITY_MAX,
      Math.round(config.STUD_POPULARITY_BASE + config.STUD_POPULARITY_LOG_MULT
        * Math.log10(fee / config.STUD_POPULARITY_REF_FEE)))),
    fertility: Math.max(FERTILITY_MIN, Math.min(FERTILITY_MAX,
      createRng(`${draft.initialSeed}:stud-fertility:${horseId}`).normal(FERTILITY_MEAN, FERTILITY_SD))),
    standsIn, firstSeasonYear: year,
  };
}

/** 호출자의 draft에 계류를 반영한다. 수태율은 독립된 시드 스트림에서만 생성한다. */
export function standPlayerStallion(draft: GameState, horseId: HorseId, year: number): GameEvent[] {
  const error = canStandAtStud(draft, horseId, year);
  if (error !== null) throw new Error(error);
  const horse = draft.horses[horseId];
  const owner = draft.owners[draft.playerOwnerId];
  if (horse === undefined || owner === undefined) throw new Error('standPlayerStallion: 필수 레코드 없음');
  const from = horse.status;
  draft.stallions[horseId] = buildStallionRecord(draft, horseId, year, owner.country);
  horse.status = 'stud';
  horse.trainerId = null;
  return [{ type: 'horse_status_changed', horseId, from, to: 'stud', date: { year, week: 1 } }];
}
