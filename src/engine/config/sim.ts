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
/**
 * 캠버 드리프트(m/s, 캠버 1.0 기준). 틱 레인 변화에 −camber × CAMBER_DRIFT_MPS × dt 를 더한다.
 * + 캠버(안쪽으로 기움)면 안쪽(레인 감소)으로, − 캠버면 바깥쪽으로 흘러간다. 캠버 0 이면 적용하지 않는다 (M3-A2).
 */
export const CAMBER_DRIFT_MPS = 0.25;

/** 무리(페이스 추종) 동역학 (M1-07c). 선두 말 기준 간격 관리. */
/** 선두와의 최대 허용 간격(m). 이보다 뒤처지면 따라붙는다 */
export const PACK_MAX_GAP_M: Record<RunningStyle, number> = { front: 2, prominent: 6, midfield: 12, held_up: 20 };
/** 선두와의 최소 간격(m). 이보다 가까우면 페이스를 넘지 않는다(작전 위치 유지) */
export const PACK_MIN_GAP_M: Record<RunningStyle, number> = { front: 0, prominent: 2, midfield: 6, held_up: 12 };
/** 따라붙을 때 목표 = 선두 속도 × (1 + 이 값) */
export const PACK_CATCHUP_FRACTION = 0.01;
/** 따라가기 비용을 감당할 수 있는지 판단할 때의 여유 배수 */
export const PACK_AFFORD_SAFETY = 0.7;
/** 바로 앞(같은 레인대, DRAFT_DISTANCE_M 이내)에 말이 있으면 스태미나 소모 배수 */
export const DRAFT_DISTANCE_M = 3;
export const DRAFT_DRAIN_FACTOR = 0.95;
