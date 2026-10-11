/** 임신 기간(주) */
export const GESTATION_WEEKS = 48;
/** 암말 나이별 수태율 배수: 이 나이 이하 1.0, 이후 매년 DECLINE 감소, 하한 FLOOR */
export const MARE_FERTILE_PEAK_AGE = 12;
export const MARE_FERTILITY_DECLINE = 0.04;
export const MARE_FERTILITY_FLOOR = 0.4;
/** 교배 가능한 암말 최소 나이 */
export const MARE_MIN_BREEDING_AGE = 3;
/** 모계 점수: min(1, blackTypeProduce / FAMILY_SCORE_DIVISOR) */
export const FAMILY_SCORE_DIVISOR = 3;
/** 망아지 출생국: 암말 출생국을 따른다 */

/**
 * 출산 예정 키 형식(연도 × 100 + 주, 예: 202707) 의 연도 배율.
 * 주는 1~52 이므로 100 이면 충돌하지 않는다. 형식 상수이며 밸런스 값이 아니다.
 */
export const DUE_WEEK_KEY_YEAR_SCALE = 100;
