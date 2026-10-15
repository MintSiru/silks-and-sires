import * as config from '../config/stud';
import type { GameState, HorseId, Money } from '../types';
import { meanAbility, ratingFromAbility } from '../world/rating';

export interface StudFeeEstimate {
  fee: Money;
  base: number;
  groupMult: number;
  pedigreeMult: number;
  trendMult: number;
}

export function peakOfficialRating(state: GameState, horseId: HorseId): number | null {
  let peak = state.horses[horseId]?.officialRating ?? null;
  for (const change of state.seasonState.ratingHistory[horseId] ?? []) {
    peak = peak === null ? change.to : Math.max(peak, change.to);
  }
  return peak;
}

export function roundStudFee(value: number): Money {
  const step = value < config.STUD_FEE_LARGE_THRESHOLD
    ? config.STUD_FEE_SMALL_STEP : config.STUD_FEE_LARGE_STEP;
  return Math.round(value / step) * step;
}

function baseFee(rating: number): number {
  const table = config.STUD_FEE_BY_PEAK_OR;
  if (rating < table[0][0]) return config.STUD_UNRATED_BASE_FEE;
  let previous: readonly [number, number] = table[0];
  for (const current of table) {
    if (rating < current[0]) {
      return previous[1] + (current[1] - previous[1])
        * (rating - previous[0]) / (current[0] - previous[0]);
    }
    previous = current;
  }
  return previous[1];
}

/** 첫 종부료 추정은 상태를 바꾸거나 난수를 소비하지 않는다. */
export function estimateStudFee(state: GameState, horseId: HorseId): StudFeeEstimate {
  const horse = state.horses[horseId];
  if (horse === undefined) throw new Error(`estimateStudFee: 말 없음: ${horseId}`);
  const base = baseFee(peakOfficialRating(state, horseId) ?? ratingFromAbility(meanAbility(horse.ability)));
  const groupMult = Math.min(
    1 + config.STUD_GROUP_WIN_MULT_PER * horse.record.groupWins,
    config.STUD_GROUP_WIN_MULT_MAX,
  );
  const sire = horse.sireId === null ? undefined : state.stallions[horse.sireId];
  const pedigreeMult = sire === undefined ? 1 : Math.max(config.STUD_PEDIGREE_MIN,
    Math.min(config.STUD_PEDIGREE_MAX,
      (sire.fee / config.STUD_PEDIGREE_REF_FEE) ** config.STUD_PEDIGREE_EXPONENT));
  const active = Object.values(state.stallions).filter(
    (stallion) => horse.sireLineId !== null && stallion.sireLineId === horse.sireLineId
      && state.horses[stallion.horseId]?.status === 'stud',
  );
  const popularity = active.length === 0 ? config.STUD_TREND_NEUTRAL
    : active.reduce((sum, stallion) => sum + stallion.popularity, 0) / active.length;
  const trendMult = 1 + (popularity - config.STUD_TREND_NEUTRAL)
    / config.STUD_TREND_NEUTRAL * config.STUD_TREND_AMPLITUDE;
  return {
    fee: roundStudFee(Math.max(config.STUD_FEE_MIN, base * groupMult * pedigreeMult * trendMult)),
    base, groupMult, pedigreeMult, trendMult,
  };
}
