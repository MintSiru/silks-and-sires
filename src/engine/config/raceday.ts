import type { HexColor, RunningStyle, SilksPattern } from '../types';
/** 시장 인식 오차 표준편차. strength 단위 = 필드 평균 대비 예상 주파 시간 % (relativeStrengths) */
export const MARKET_NOISE_SD = 0.5;
/** softmax 온도 (초) */
export const MARKET_TEMPERATURE = 1.2;
/** 북메이커 오버라운드 */
export const MARKET_OVERROUND = 1.18;
/** 표준 분수 오즈 사다리 [num, den], 짧은 → 긴 순 */
export const ODDS_LADDER: readonly (readonly [number, number])[] = [
  [1,5],[2,9],[1,4],[2,7],[1,3],[4,11],[2,5],[4,9],[1,2],[8,15],[4,7],[8,13],[4,6],[8,11],[4,5],[5,6],[10,11],
  [1,1],[11,10],[6,5],[5,4],[11,8],[6,4],[13,8],[7,4],[15,8],[2,1],[9,4],[5,2],[11,4],[3,1],[10,3],[7,2],[4,1],
  [9,2],[5,1],[11,2],[6,1],[13,2],[7,1],[15,2],[8,1],[17,2],[9,1],[10,1],[11,1],[12,1],[14,1],[16,1],[18,1],
  [20,1],[25,1],[33,1],[40,1],[50,1],[66,1],[80,1],[100,1],[150,1],[200,1],
];
// --- 샘플 출주마 ---
export const SAMPLE_DEFAULT_LEVEL = 60;
export const SAMPLE_DEFAULT_LEVEL_SPREAD = 4;
export const SAMPLE_ABILITY_SD = 4;
export const SAMPLE_ABILITY_MIN = 1;
export const SAMPLE_ABILITY_MAX = 100;
/** 거리별 스태미나 목표: SAMPLE_STAMINA_AT_MIN_DIST(1000m) ~ SAMPLE_STAMINA_AT_MAX_DIST(3200m) 선형 */
export const SAMPLE_STAMINA_MIN_DIST = 1000;
export const SAMPLE_STAMINA_MAX_DIST = 3200;
export const SAMPLE_STAMINA_AT_MIN_DIST = 20;
export const SAMPLE_STAMINA_AT_MAX_DIST = 90;
export const SAMPLE_STAMINA_LEVEL_WEIGHT = 0.5;
export const SAMPLE_STAMINA_SD = 6;
export const SAMPLE_DISTANCE_OPT_SD = 150;
export const SAMPLE_DISTANCE_OPT_MIN = 1000;
export const SAMPLE_DISTANCE_OPT_MAX = 3600;
export const SAMPLE_DISTANCE_RANGE_MIN = 300;
export const SAMPLE_DISTANCE_RANGE_MAX = 600;
export const SAMPLE_GOING_PREF_MIN = 1.5;
export const SAMPLE_GOING_PREF_MAX = 3.5;
export const SAMPLE_GOING_TOL_MIN = 1.5;
export const SAMPLE_GOING_TOL_MAX = 3;
export const SAMPLE_AW_APT_SD = 0.4;
export const SAMPLE_COURSE_APT_SD = 0.3;
export const SAMPLE_STYLE_WEIGHTS: Record<RunningStyle, number> = { front: 0.15, prominent: 0.3, midfield: 0.35, held_up: 0.2 };
export const SAMPLE_FITNESS_RANGE = [85, 100] as const;
export const SAMPLE_FATIGUE_RANGE = [0, 10] as const;
export const SAMPLE_MENTAL_RANGE = [60, 90] as const;
export const SAMPLE_FEMALE_RATE = 0.3;
export const SAMPLE_GELDING_RATE = 0.25;
export const SAMPLE_AGE_RANGE = [3, 5] as const;
export const SAMPLE_GROWTH = { type: 'normal', peakAge: 4, declineRate: 0.1 } as const;
export const SAMPLE_BASE_WEIGHT_LB = 126;
export const SAMPLE_APPRENTICE_RATE = 0.1;
export const SAMPLE_APPRENTICE_ALLOWANCES_LB = [3, 5, 7] as const;
export const SAMPLE_JOCKEY_SKILL_MEAN = 60;
export const SAMPLE_JOCKEY_SKILL_SD = 12;
export const SILKS_PALETTE: readonly HexColor[] = [
  '#c8102e','#003da5','#ffd100','#00843d','#ffffff','#000000','#f28c28','#6a1b9a',
  '#87ceeb','#ff69b4','#8b4513','#808080','#006064','#b5e61d','#800000','#000080',
];
export const SILKS_PATTERNS: readonly SilksPattern[] = ['plain','hoops','stripes','quartered','sash','chevrons','spots','star'];
/** 적성 점수 한계 (AptitudeScore -1 ~ +1). 명세 외 추가: 샘플 clamp 용 */
export const SAMPLE_APTITUDE_LIMIT = 1;
