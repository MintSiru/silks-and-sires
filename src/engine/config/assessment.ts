import type { AssessmentStage } from '../types';

/** 단계별 인식 오차 표준편차(능력치 단위) */
export const PERCEPTION_SD: Record<AssessmentStage, number> = { foal: 14, yearling: 10, two_year_old: 7, in_training: 4 };
/** 평가자 능력(0~100)에 따른 오차 감소: sd × (1 - RELIEF × skill/100) */
export const SKILL_NOISE_RELIEF = 0.5;
/** 등급 하한: 이상이면 그 등급 */
export const GRADE_THRESHOLDS = { S: 85, A: 75, B: 65, C: 55, D: 45 } as const;   // 그 미만 E
/** 거리 힌트 반폭(m) */
export const DISTANCE_HINT_HALF_WIDTH: Record<AssessmentStage, number> = { foal: 800, yearling: 600, two_year_old: 400, in_training: 250 };
export const DISTANCE_HINT_SD: Record<AssessmentStage, number> = { foal: 400, yearling: 300, two_year_old: 200, in_training: 120 };
export const DISTANCE_HINT_MIN = 1000;
export const DISTANCE_HINT_MAX = 3600;
export const DISTANCE_HINT_ROUND = 100;
/** 성장형을 맞힐 확률(그 외 'unknown') — foal 은 항상 unknown */
export const GROWTH_HINT_PROB: Record<AssessmentStage, number> = { foal: 0, yearling: 0.4, two_year_old: 0.7, in_training: 0.9 };
/** 조교 중 단계에서 현재 능력과 잠재의 혼합 비율(현재 능력 비중) */
export const IN_TRAINING_ABILITY_WEIGHT = 0.6;
/** 코멘트 최대 개수(종합 1 + 특징) */
export const MAX_COMMENTS = 3;
/** 특징 코멘트로 뽑을 최소 편차 |perceived - TRAIT_CENTER| */
export const TRAIT_CENTER = 60;
export const TRAIT_MIN_DEVIATION = 8;
/** 스피드 '탁월' 코멘트 기준 편차(d ≥ 이 값이면 speed_exceptional). 명세 외 추가 상수(매직 넘버 분리). */
export const TRAIT_EXCEPTIONAL_DEVIATION = 25;
/** 마장 선호 코멘트 기준(goingPreference): 이하면 fast, 이상이면 soft */
export const GOING_FAST_MAX = 1.5;
export const GOING_SOFT_MIN = 4;
