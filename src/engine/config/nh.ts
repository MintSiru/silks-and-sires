import type { DistanceProfile } from '../types';

/** NH 시장 초기값. 근거: docs/stamina-and-nh.md 6장(가치·종부료·북), 2장(스토어 평균가). */
export const FLAT_VALUE_BY_PROFILE: Readonly<Record<DistanceProfile, number>> = {
  speed: 1, classic: 1, middle: 0.6, cup: 0.25,
};
export const NH_VALUE_BY_PROFILE: Readonly<Record<DistanceProfile, number>> = {
  speed: 0.15, classic: 0.4, middle: 0.8, cup: 1,
};
export const NH_FEE_RATIO = 0.22;
export const DUAL_FEE_RATIO = 0.6;
export const NH_BOOK_MULT = 1.5;
export const DUAL_BOOK_MULT = 1.2;
export const NH_REPUTATION_NEUTRAL = 50;
export const NH_REPUTATION_MAX = 100;
export const NH_ROLE_VALUE_MULT = { flat: 1, dual: 1.1, nh: 1.25 } as const;
export const NH_ROLE_SPECIALIST_SHARE = { middle: 0.2, cup: 0.7 } as const;
/** 8월 스토어 주. 게임 달력의 8월 2주(33주)는 기존 세일과 겹쳐 직전 빈 주를 쓴다. */
export const NH_STORE_WEEK = 32;
export const NH_STORE_PLAYER_WEEK_WINDOW = 1;
export const NH_STORE_AI_AGE = 3;
export const NH_STORE_PLAYER_MIN_AGE = 3;
export const NH_STORE_PLAYER_MAX_AGE = 4;
export const NH_STORE_BASE_PRICE = 11_000;
export const NH_STORE_PRICE_JITTER = 0.25;
export const NH_STORE_SIRE_BASE = 0.65;
export const NH_STORE_SIRE_WEIGHT = 0.7;
export const NH_STORE_REPUTATION_BASE = 0.75;
export const NH_STORE_POTENTIAL_BASE = 0.65;
export const NH_STORE_CHANCE_BASE = 0.04;
export const NH_STORE_CHANCE_SIRE_WEIGHT = 0.55;
export const NH_STORE_CHANCE_FLAT_WEIGHT = 0.2;
export const NH_STORE_CHANCE_MAX = 0.85;
export const NH_STORE_FLAT_RATING_LOW = 60;
export const NH_STORE_FLAT_RATING_RANGE = 60;
export const NH_REPUTATION_EMA_WEIGHT = 0.25;
export const NH_REPUTATION_PRICE_WEIGHT = 30;
export const NH_REPUTATION_COUNT_WEIGHT = 2;
export const NH_REPUTATION_COUNT_CAP = 10;
export const NH_REPUTATION_DEMAND_AMPLITUDE = 0.3;
