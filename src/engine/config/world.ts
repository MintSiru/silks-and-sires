/** 세계 초기화(실명 종마 Horse 레코드 + 플레이어 기초 암말) 밸런스 상수. */

/** 시장 인기 등급(marketTier) → 종마 능력 잠재 평균 */
export const TIER_LEVEL = { 1: 82, 2: 76, 3: 70, 4: 64, 5: 58 } as const;
/** 실명 종마 잠재 능력 표준편차 */
export const STALLION_SPREAD = 5;
/** 거리 성향(distanceProfile) → 거리 편향(m) */
export const PROFILE_DISTANCE = { sprint: 1200, mile: 1600, middle: 2200, staying: 2900 } as const;
/** 시장 인기 등급 → 종부료(€) */
export const TIER_FEE = { 1: 150_000, 2: 60_000, 3: 30_000, 4: 12_000, 5: 6_000 } as const;
/** 시장 인기 등급 → 시즌 최대 교배 두수 */
export const TIER_BOOK_LIMIT = { 1: 180, 2: 160, 3: 140, 4: 120, 5: 100 } as const;
/** 시장 인기 등급 → 인기 점수(0~100) */
export const TIER_POPULARITY = { 1: 90, 2: 75, 3: 60, 4: 45, 5: 30 } as const;
/** 수태율 평균·표준편차 (정규 분포) */
export const FERTILITY_MEAN = 0.85;
export const FERTILITY_SD = 0.05;
/** 수태율 하한·상한 (정규 분포 샘플을 자른다) */
export const FERTILITY_MIN = 0.5;
export const FERTILITY_MAX = 0.99;
/** 종마 첫 계류 시즌 = 출생 연도 + 이 값 */
export const FIRST_SEASON_AGE = 4;
/** 플레이어 기초 번식 암말 두수 */
export const PLAYER_START_MARES = 3;
/** 기초 암말·어미의 잠재 능력 평균·표준편차 */
export const MARE_LEVEL = 55;
export const MARE_LEVEL_SPREAD = 8;
/** 기초 암말 나이 범위(세, 양끝 포함) */
export const MARE_AGE_MIN = 5;
export const MARE_AGE_MAX = 12;
/** 기초 암말의 어미(가상) 나이 차 범위 */
export const DAM_AGE_GAP_MIN = 6;
export const DAM_AGE_GAP_MAX = 12;
/** 종마가 교배 가능한 최소 나이 */
export const MIN_SIRE_AGE_AT_COVER = 4;
/** 부(父) 후보 판정: foaled ≤ (말의 출생 연도) - 이 값 - MIN_SIRE_AGE_AT_COVER */
export const SIRE_BIRTH_MARGIN_YEARS = 1;
/** 암말의 부 선택 가중치(tier 별) — 기초 암말은 중하위권 혈통이 많다 */
export const MARE_SIRE_TIER_WEIGHT = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 } as const;
/** 기초 암말 출생국 후보 */
export const MARE_COUNTRIES = ['GB', 'IE', 'FR'] as const;
/** 가상 말 ID 접두사와 번호 자릿수 (예: h-000001) */
export const HORSE_ID_PREFIX = 'h-';
export const HORSE_ID_DIGITS = 6;
