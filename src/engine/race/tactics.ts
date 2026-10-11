import {
  BLOCK_DISTANCE_M,
  EARLY_PHASE_M,
  EARLY_PHASE_MAX_FRACTION,
  EARLY_STYLE_FACTOR,
  GRADIENT_POWER_RELIEF,
  GRADIENT_SPEED_K,
  GUTS_BATTLE_BONUS,
  HORSE_WIDTH_M,
  LANE_CLEARANCE_M,
  MID_STYLE_FACTOR,
  POST_FINISH_SPEED_FRACTION,
  SPURT_ALWAYS_DISTANCE_M,
  SPURT_MAX_DISTANCE_M,
  SPURT_SAFETY,
} from '../config/sim';
import type { Going, PreparedRunner } from '../types';
import { exhaustedSpeed, staminaDrainPerSecond } from './runnerModel';

/** 초반 구간 한도(m). s 가 이 값보다 작으면 초반 구간이다. */
export function earlyPhaseLimit(distance: number): number {
  return Math.min(EARLY_PHASE_M, distance * EARLY_PHASE_MAX_FRACTION);
}

/** 스퍼트(최고 속도)로 결승까지 가는 데 필요한 스태미나 */
export function spurtEnergyNeeded(r: PreparedRunner, toFinish: number, going: Going): number {
  return (staminaDrainPerSecond(r.topSpeed, r.cruiseSpeed, 0, going, r.power) * toFinish) / r.topSpeed;
}

/** 스퍼트 시작 여부. 200m 이내면 무조건, 작전별 최대 거리 밖이면 불가, 그 외는 스태미나·판단으로 결정 */
export function shouldStartSpurt(
  r: PreparedRunner,
  stamina: number,
  toFinish: number,
  going: Going,
  judge: number,
): boolean {
  if (toFinish <= SPURT_ALWAYS_DISTANCE_M) return true;
  if (toFinish > SPURT_MAX_DISTANCE_M[r.style]) return false;
  return stamina * judge >= spurtEnergyNeeded(r, toFinish, going) * SPURT_SAFETY;
}

/** 이번 틱의 목표 속도(트래픽 전) */
export function baseTargetSpeed(args: {
  r: PreparedRunner;
  s: number;
  distance: number;
  spurting: boolean;
  finished: boolean;
  stamina: number;
  gradient: number;
  battling: boolean;
}): number {
  const { r, s, distance, spurting, finished, stamina, gradient, battling } = args;

  // 1. 결승 후: 순항의 일정 비율로 흘러간다
  if (finished) {
    return r.cruiseSpeed * POST_FINISH_SPEED_FRACTION;
  }

  // 2. 스퍼트 중이면 최고 속도, 아니면 구간별 순항 속도
  let target: number;
  if (spurting) {
    target = r.topSpeed;
  } else if (s < earlyPhaseLimit(distance)) {
    target = r.cruiseSpeed * EARLY_STYLE_FACTOR[r.style];
  } else {
    target = r.cruiseSpeed * MID_STYLE_FACTOR[r.style];
  }

  // 3. 경사 보정 (파워가 높을수록 오르막 감속이 줄어든다)
  target *= 1 - GRADIENT_SPEED_K * gradient * (1 - GRADIENT_POWER_RELIEF * r.power);

  // 4. 스태미나 고갈 시 탈진 속도로 제한
  if (stamina <= 0) {
    target = Math.min(target, exhaustedSpeed(r));
  }

  // 5. 경합 중 근성 보너스
  if (battling) {
    target *= 1 + GUTS_BATTLE_BONUS * r.guts;
  }

  return target;
}

/** 앞을 막는 말 index (없으면 -1): 0 < prog[j]-prog[i] < BLOCK_DISTANCE 이고 |lane[j]-lane[i]| < HORSE_WIDTH 중 가장 가까운 것 (같으면 작은 index) */
export function findBlocker(i: number, prog: readonly number[], lane: readonly number[]): number {
  // 핫 루프: 배열 원소는 0 <= i < length 에서만 읽으므로 타입 단언을 쓴다(?? 분기보다 빠르다).
  const pi = prog[i] as number;
  const li = lane[i] as number;
  const n = prog.length;
  let best = -1;
  let bestGap = Infinity;
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const gap = (prog[j] as number) - pi;
    if (gap <= 0 || gap >= BLOCK_DISTANCE_M) continue;
    const dl = (lane[j] as number) - li;
    if (dl >= HORSE_WIDTH_M || dl <= -HORSE_WIDTH_M) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = j;
    }
  }
  return best;
}

/** i 가 candidateLane 으로 갈 수 있는가: i 외의 k 중 |prog[k]-prog[i]| < LANE_CLEARANCE 이고 |lane[k]-candidateLane| < HORSE_WIDTH 인 말이 없음 */
export function isLaneFree(
  i: number,
  candidateLane: number,
  prog: readonly number[],
  lane: readonly number[],
): boolean {
  const pi = prog[i] as number;
  const n = prog.length;
  for (let k = 0; k < n; k++) {
    if (k === i) continue;
    const dp = (prog[k] as number) - pi;
    if (dp >= LANE_CLEARANCE_M || dp <= -LANE_CLEARANCE_M) continue;
    const dl = (lane[k] as number) - candidateLane;
    if (dl < HORSE_WIDTH_M && dl > -HORSE_WIDTH_M) return false;
  }
  return true;
}
