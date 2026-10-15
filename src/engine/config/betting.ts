export const BET_MIN_STAKE = 10;
export const BET_MAX_OUTLAY_PER_RACE = 20_000;
export const BET_HISTORY_LIMIT = 50;
export const BET_FORECAST_TEMPERATURE = 4;
/** 최소 출주 두수 내림차순. */
export const BET_PLACE_TERMS = [
  { minRunners: 16, handicapOnly: true, places: 4, fraction: 1 / 4 },
  { minRunners: 12, handicapOnly: true, places: 3, fraction: 1 / 4 },
  { minRunners: 8, handicapOnly: false, places: 3, fraction: 1 / 5 },
  { minRunners: 5, handicapOnly: false, places: 2, fraction: 1 / 4 },
] as const;
export const SPONSOR_PRIZE_ROUNDING = 50;
