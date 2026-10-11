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
/** 거리 적성 가중 평균: 부 0.45 · 외조부(모의 부) 0.30 · 모 0.25. 외조부가 없으면 sire·dam 만 재정규화 */
export const DIST_WEIGHT = { sire: 0.45, damsire: 0.3, dam: 0.25 } as const;
/** 거리 프로필별 스태미나 값(speed 0 → cup 1) */
export const PROFILE_STAMINA = { speed: 0.0, classic: 0.3, middle: 0.7, cup: 1.0 } as const;
/** 모계 스태미나 = DAM_SIDE_DAMSIRE_W × 외조부 + (1 − DAM_SIDE_DAMSIRE_W) × 모. 외조부가 없으면 모 값만 */
export const DAM_SIDE_DAMSIRE_W = 0.5;
/** 보완형: 부 프로필 speed·classic 이고 모계 스태미나가 이 값 이상 */
export const COMPLEMENT_DAM_STAMINA_MIN = 0.6;
/** 보완형 망아지의 능력 5종에 더하는 보너스 비율: adj += mid × COMPLEMENT_BONUS. 1대 한정(자손에게 유전되지 않음) */
export const COMPLEMENT_BONUS = 0.08;
export const GOING_INHERIT_SD = 0.7;
export const SURFACE_INHERIT_KEEP = 0.7;
export const SURFACE_INHERIT_SD = 0.25;
export const SOUNDNESS_INHERIT_SD = 8;
/** 건강도 집단 평균 회귀: mid = mid + (SOUNDNESS_MEAN - mid) × SOUNDNESS_REGRESSION */
export const SOUNDNESS_REGRESSION = 0.15;
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
