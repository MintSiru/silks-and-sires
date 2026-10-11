/** 유전 모델 밸런스 상수 (M2-05). 값은 기획·명세 기준. */

/** 부모 잠재 혼합 가중치: mid = SIRE_WEIGHT × 부 + (1 - SIRE_WEIGHT) × 모 */
export const SIRE_WEIGHT = 0.5;
/** 잠재 능력 유전 편차(SD) */
export const GENETIC_SD = 7;
/** 집단 평균 회귀: mid = mid + (POP_MEAN - mid) × REGRESSION */
export const POPULATION_MEAN = 55;
export const REGRESSION_TO_MEAN = 0.15;
/** 닉스 값 1.0 당 잠재 능력 보정(점) */
export const NICK_EFFECT_MAX = 4;
/** 인브리드: 혈량 합계 bp(%) 에 대한 삼각형 보너스 (LOW 에서 0, PEAK 에서 최대, HIGH 에서 0) */
export const INBREED_LOW = 6.25;
export const INBREED_PEAK = 18.75;
export const INBREED_HIGH = 31.25;
export const INBREED_BONUS_MAX = 3;
/** bp 가 EXCESS_FROM 초과 시 초과 1% 당 잠재 감점, 건강도 감점 */
export const INBREED_EXCESS_FROM = 25;
export const INBREED_EXCESS_POTENTIAL_PENALTY = 0.4;
export const INBREED_EXCESS_SOUNDNESS_PENALTY = 1.0;
/** 모계 점수(0~1) 1.0 당 잠재 보정 */
export const FAMILY_BONUS_MAX = 2.5;
/** 적성 유전 */
export const DIST_INHERIT_SD = 200;
export const GOING_INHERIT_SD = 0.7;
export const SURFACE_INHERIT_KEEP = 0.7;
export const SURFACE_INHERIT_SD = 0.25;
export const SOUNDNESS_INHERIT_SD = 8;
export const MENTAL_INHERIT_SD = 10;
/** 성장형: 부 형 SIRE_P, 모 형 DAM_P, 나머지 무작위 */
export const GROWTH_FROM_SIRE_P = 0.4;
export const GROWTH_FROM_DAM_P = 0.4;
/** 작전 선호: 부 SIRE_P, 모 DAM_P, 나머지 STYLE_WEIGHTS */
export const STYLE_FROM_SIRE_P = 0.5;
export const STYLE_FROM_DAM_P = 0.3;
/** 닉스 라벨 경계 */
export const NICK_EXCELLENT = 0.5;
export const NICK_GOOD = 0.2;
export const NICK_POOR = -0.2;
/** 미리보기 거리 힌트 반폭(m), 반올림 단위 */
export const PREVIEW_DIST_HALF_WIDTH = 400;
export const PREVIEW_DIST_ROUND = 100;
/** 미리보기 코멘트 기준: 부모 잠재 평균이 이 이상/이하면 */
export const PREVIEW_TRAIT_HIGH = 70;
export const PREVIEW_TRAIT_LOW = 50;

/** 신생 망아지 컨디션 fitness (명세 기본값) */
export const FOAL_FITNESS = 50;
/** 망아지 수컷 확률 (명세: chance(0.5)) */
export const FOAL_MALE_CHANCE = 0.5;
