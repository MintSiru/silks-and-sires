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
