import type { GrowthProfile, RunningStyle } from '../types';

export const ABILITY_MIN = 1;
export const ABILITY_MAX = 100;
export const DEFAULT_POTENTIAL_SPREAD = 10;
export const GROWTH_TYPE_WEIGHTS: Record<GrowthProfile['type'], number> = { precocious: 0.3, normal: 0.5, late: 0.2 };
export const GROWTH_PEAK_AGE: Record<GrowthProfile['type'], number> = { precocious: 3, normal: 4, late: 5 };
export const GROWTH_DECLINE_RATE: Record<GrowthProfile['type'], number> = { precocious: 0.12, normal: 0.08, late: 0.06 };
/** 성장 곡선 지수(작을수록 일찍 자란다) */
export const GROWTH_CURVE_EXP: Record<GrowthProfile['type'], number> = { precocious: 0.6, normal: 1.0, late: 1.5 };
/** 출생 시 성숙도 */
export const MATURITY_AT_BIRTH = 0.35;
/** 정점 유지 기간(년) */
export const MATURITY_PLATEAU_YEARS = 1;
/** 노화 하한 */
export const MATURITY_FLOOR = 0.5;
/** 거리 적성: opt = BASE + PER_STAMINA × stamina + N(0, SD), [MIN, MAX] */
export const DIST_OPT_BASE = 1000;
export const DIST_OPT_PER_STAMINA = 22;
export const DIST_OPT_SD = 200;
/** distanceBias 가 있을 때 distanceOptimum = bias + N(0, DIST_BIAS_SD), [DIST_OPT_MIN, DIST_OPT_MAX] */
export const DIST_BIAS_SD = 150;
export const DIST_OPT_MIN = 1000;
export const DIST_OPT_MAX = 3600;
/** distanceOptimum(m) → 거리 프로필 경계. 이하 포함: speed ≤ speedMax, classic ≤ classicMax, middle ≤ middleMax, 초과 cup */
export const PROFILE_BOUNDS = { speedMax: 1800, classicMax: 2200, middleMax: 2700 } as const;
export const DIST_RANGE_MIN = 300;
export const DIST_RANGE_MAX = 600;
/** distanceBias(m) 가 주어지면 stamina 잠재에 (bias - BIAS_REF) / BIAS_DIVISOR 를 더한다 */
export const STAMINA_BIAS_REF = 2000;
export const STAMINA_BIAS_DIVISOR = 30;
export const GOING_PREF_MEAN = 2;
export const GOING_PREF_SD = 1;
/** 선호 마장 인덱스 범위 (TURF_GOING_ORDER 0~6) */
export const GOING_PREF_MIN = 0;
export const GOING_PREF_MAX = 6;
/** AptitudeScore 범위 (-1 ~ +1) */
export const APTITUDE_MIN = -1;
export const APTITUDE_MAX = 1;
export const GOING_TOL_MIN = 1.5;
export const GOING_TOL_MAX = 3;
export const SURFACE_APT_SD = 0.4;
/** surfaceBias 가 'aw'/'dirt' 면 해당 적성에 더하는 값 */
export const SURFACE_BIAS_BONUS = 0.5;
export const COURSE_APT_SD = 0.3;
export const STYLE_WEIGHTS: Record<RunningStyle, number> = { front: 0.15, prominent: 0.3, midfield: 0.35, held_up: 0.2 };
export const SOUNDNESS_MEAN = 70;
export const SOUNDNESS_SD = 12;
export const MENTAL_MEAN = 70;
export const MENTAL_SD = 10;
export const DEFAULT_FITNESS = 70;
export const NAME_MAX_LENGTH = 18;
export const NAME_MAX_ATTEMPTS = 50;
