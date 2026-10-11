/** 주자 모델 밸런스 상수 (M1-04). 코드에 숫자를 직접 박지 않고 여기서만 조정한다. */

/** 원속도(m/s) = SPEED_BASE + SPEED_RANGE × speed/100 */
export const SPEED_BASE_MPS = 15.3;
export const SPEED_RANGE_MPS = 2.2;
/** 순항 = 원속도 × CRUISE_FRACTION × 배수 */
export const CRUISE_FRACTION = 0.97;
/** 최고 = 원속도 × (TOP_FRACTION_BASE + TOP_FRACTION_ACCEL × acceleration/100) × 배수 */
export const TOP_FRACTION_BASE = 1.02;
export const TOP_FRACTION_ACCEL = 0.03;
/** 거리별 페이스: 1 - PACE_LOG_K × ln(distance / PACE_REF_DISTANCE_M) */
export const PACE_REF_DISTANCE_M = 1600;
export const PACE_LOG_K = 0.06;
/** 거리 적성: w = exp(-((distance - opt)/range)^2), 1 + BONUS×w - PENALTY×(1-w) */
export const DISTANCE_FIT_BONUS = 0.005;
export const DISTANCE_FIT_MAX_PENALTY = 0.04;
/** 코스 적성 */
export const HANDEDNESS_EFFECT = 0.01;
export const UNDULATION_EFFECT = 0.01;
/** 파워×무거운 마장: 1 + POWER_GOING_EFFECT × GOING_POWER_WEIGHT[g] × (2×power/100 - 1) */
export const POWER_GOING_EFFECT = 0.02;
/** 부담중량 */
export const REF_WEIGHT_LB = 126;
export const WEIGHT_EFFECT_PER_LB = 0.001;
/** 컨디션 */
export const FITNESS_EFFECT = 0.03;
export const FATIGUE_EFFECT = 0.02;
export const MENTAL_EFFECT = 0.01;
/** 기수: 1 + JOCKEY_EFFECT × (skill - 50)/50 */
export const JOCKEY_EFFECT = 0.004;
/** 당일 폼 배수 표준편차 (현실형 변동성의 핵심 손잡이) */
export const FORM_SD = 0.006;
/** 스태미나 총량 = (BASE + RANGE × stamina/100) × (FLOOR + (1-FLOOR) × fitness/100) */
export const STAMINA_BASE = 40;
export const STAMINA_RANGE = 180;
export const STAMINA_FITNESS_FLOOR = 0.9;
/** 레이스 중 가속도(m/s²) = BASE + RANGE × acceleration/100 */
export const ACCEL_BASE_MPS2 = 0.3;
export const ACCEL_RANGE_MPS2 = 0.7;
/** 게이트 반응 지연 = MIN + u × RANGE × (1 - RELIEF × acceleration/100) */
export const START_DELAY_MIN_S = 0.1;
export const START_DELAY_RANGE_S = 0.4;
export const START_DELAY_ACCEL_RELIEF = 0.5;
/** 출발 레인 = LANE_MIN + (draw-1) × LANE_PER_STALL, [LANE_MIN, width - LANE_MIN] 로 clamp */
export const LANE_PER_STALL_M = 1.1;
export const LANE_MIN_M = 0.5;
/** 스태미나 소모(단위/초) = (v / REF)^EXP × GOING_STAMINA_DRAIN[g] × (1 + UPHILL_K × max(0, gradient) × (1 - RELIEF × power01)) */
export const DRAIN_REF_SPEED_MPS = 16;
export const DRAIN_EXPONENT = 3;
export const UPHILL_DRAIN_K = 8;
export const UPHILL_POWER_RELIEF = 0.5;
/** 탈진 속도 = cruise × (EXHAUSTED_BASE + EXHAUSTED_GUTS × guts01) */
export const EXHAUSTED_BASE = 0.88;
export const EXHAUSTED_GUTS = 0.06;
/** estimateStrength: 유효 속도 = cruise×(1-SHARE) + top×SHARE, 스태미나 부족분 × SHORTFALL_PENALTY 만큼 감속 */
export const STRENGTH_SPURT_SHARE = 0.25;
export const STRENGTH_SHORTFALL_PENALTY = 0.12;
