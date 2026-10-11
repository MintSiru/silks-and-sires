/** 레이스 틱 시뮬레이션 밸런스 상수 (M1-07). 코드에 숫자를 직접 박지 않고 여기서만 조정한다. */
import type { RunningStyle } from '../types';

export const TICK_SECONDS = 0.1;
export const MAX_RACE_SECONDS = 600;
/** 시간 상한 외삽 시 속도 하한(m/s). 정지한 말의 기록 외삽 0 나눗셈 방지 (M1-07 추가 상수) */
export const EXTRAPOLATION_MIN_SPEED_MPS = 1;
/** 마지막 말 결승 후 리플레이를 더 기록하는 시간 */
export const POST_FINISH_SECONDS = 3;
export const POST_FINISH_SPEED_FRACTION = 0.7;
/** 출발 가속(m/s²) = BASE + FROM_RUN × prepared.accel. 속도가 cruise × START_PHASE_SPEED_FRACTION 미만이고 초반 구간일 때 */
export const START_ACCEL_BASE_MPS2 = 3.0;
export const START_ACCEL_FROM_RUN = 1.5;
export const START_PHASE_SPEED_FRACTION = 0.85;
/** 감속(m/s²) */
export const DECEL_MPS2 = 0.8;
/** 초반 구간 = s < min(EARLY_PHASE_M, distance × EARLY_PHASE_MAX_FRACTION) */
export const EARLY_PHASE_M = 400;
export const EARLY_PHASE_MAX_FRACTION = 0.25;
export const EARLY_STYLE_FACTOR: Record<RunningStyle, number> = { front: 1.02, prominent: 1.01, midfield: 1.0, held_up: 0.99 };
export const MID_STYLE_FACTOR: Record<RunningStyle, number> = { front: 1.003, prominent: 1.0, midfield: 0.997, held_up: 0.995 };
/** 스퍼트: 남은 거리가 MAX 이하일 때만 검토, ALWAYS 이하면 무조건 */
export const SPURT_MAX_DISTANCE_M: Record<RunningStyle, number> = { front: 600, prominent: 650, midfield: 700, held_up: 750 };
export const SPURT_ALWAYS_DISTANCE_M = 200;
export const SPURT_SAFETY = 1.05;
/** 기수 판단 오차: judge = 1 + normal(0, JUDGE_SD × (1 - jockeySkill)) */
export const JUDGE_SD = 0.15;
/** 경사: target × (1 - GRADIENT_SPEED_K × gradient × (1 - GRADIENT_POWER_RELIEF × power)) */
export const GRADIENT_SPEED_K = 1.5;
export const GRADIENT_POWER_RELIEF = 0.5;
/** 경합(스퍼트 중 옆에 말이 있을 때) 근성 보너스 */
export const GUTS_BATTLE_BONUS = 0.006;
export const BATTLE_RANGE_M = 2.4;
export const BATTLE_LANE_M = 3;
/** 트래픽 */
export const HORSE_WIDTH_M = 1.0;
export const BLOCK_DISTANCE_M = 2.4;
export const LANE_CLEARANCE_M = 3.0;
export const LANE_CHANGE_MPS = 1.0;
export const RAIL_DRIFT_MPS = 0.3;
