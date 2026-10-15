/** 첫 종마 사업은 기본 한 칸, 새해 세 살부터 시작한다. */
export const STUD_BASE_SLOTS = 1;
export const STUD_MIN_AGE = 3;
/** OR 구간별 경주 성적의 시장 가치 시작값(유로), 구간 사이는 선형 보간한다. */
export const STUD_FEE_BY_PEAK_OR = [
  [90, 2_000], [100, 4_000], [110, 9_000], [115, 15_000],
  [120, 25_000], [125, 40_000], [130, 60_000],
] as const;
export const STUD_UNRATED_BASE_FEE = 1_500;
/** 그룹 우승은 매회 8% 가산하되 성적 중복 평가를 40%에서 제한한다. */
export const STUD_GROUP_WIN_MULT_PER = 0.08;
export const STUD_GROUP_WIN_MULT_MAX = 1.4;
/** 부의 종부료 3만 유로를 중립으로, 혈통 효과는 완만하게 제한한다. */
export const STUD_PEDIGREE_REF_FEE = 30_000;
export const STUD_PEDIGREE_EXPONENT = 0.25;
export const STUD_PEDIGREE_MIN = 0.7;
export const STUD_PEDIGREE_MAX = 1.4;
/** 부계 인기 50을 중립으로 유행 효과를 ±15%로 둔다. */
export const STUD_TREND_NEUTRAL = 50;
export const STUD_TREND_AMPLITUDE = 0.15;
/** 최저가와 가격 사다리는 낮은 가격대의 과도한 정밀도를 줄인다. */
export const STUD_FEE_MIN = 1_000;
export const STUD_FEE_LARGE_THRESHOLD = 10_000;
export const STUD_FEE_SMALL_STEP = 500;
export const STUD_FEE_LARGE_STEP = 1_000;
/** 높은 종부료일수록 외부 수요를 받을 북을 넓힌다. */
export const STUD_BOOK_LIMIT_BY_FEE = [[0, 60], [5_000, 80], [15_000, 110], [40_000, 140]] as const;
/** 신참 종마 인기는 가격의 로그에 비례하되 기존 스타 종마보다 낮게 제한한다. */
export const STUD_POPULARITY_BASE = 20;
export const STUD_POPULARITY_LOG_MULT = 15;
export const STUD_POPULARITY_REF_FEE = 1_000;
export const STUD_POPULARITY_MIN = 10;
export const STUD_POPULARITY_MAX = 80;

/** 거세마는 새해 열 살부터 현역을 계속할 수 없다. */
export const YEAR_END_GELDING_MAX_AGE = 10;

/** 11월 첫 주부터 다음 시즌 예약을 받는다. */
export const BOOKING_OPEN_WEEK = 44;

/** 인기 30·90에서 북 대비 수요 65%·130%를 기준으로 선형 보간한다. */
export const BOOK_DEMAND_RATIO_AT_POP30 = 0.65;
export const BOOK_DEMAND_RATIO_AT_POP90 = 1.3;
/** 비인기·최상위 종마의 기본 수요를 북의 30~160%로 제한한다. */
export const BOOK_DEMAND_RATIO_MIN = 0.3;
export const BOOK_DEMAND_RATIO_MAX = 1.6;
/** 첫 3시즌은 신인 기대감으로 수요를 15% 가산한다. */
export const BOOK_FRESHMAN_SEASONS = 3;
export const BOOK_FRESHMAN_MULT = 1.15;
/** 20세부터 노령 종마 수요를 15% 낮춘다. */
export const BOOK_OLD_AGE = 20;
export const BOOK_OLD_MULT = 0.85;
/** 시즌별 수요 변동은 로그정규 표준편차 0.15를 쓴다. */
export const BOOK_DEMAND_NOISE_SD = 0.15;
/** AI 예약은 4월 중순까지 누적한다. */
export const BOOK_ACCRUAL_END_WEEK = 16;
/** 인기 종마가 겨울에 마감되도록 누적 수요를 앞쪽에 몰아준다. */
export const BOOK_ACCRUAL_SHAPE = 2;
/** 저장 크기를 제한하면서 최근 종마 시즌 기록 60건을 보존한다. */
export const STUD_SEASON_HISTORY_LIMIT = 60;

/** 연간 2세 유입 약 635두 표본: 수태 150 → 약 9두, 69 → 약 4두(2026-10-15 측정). */
export const PLAYER_SIRE_CROP_PER_CONCEPTION = 0.06;
