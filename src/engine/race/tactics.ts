import {
  BATTLE_LANE_M,
  BATTLE_RANGE_M,
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

/** 러너별 스퍼트 판정 상수. 레이스 시작 시 한 번 계산한다. */
export interface SpurtConstants {
  /** 작전별 스퍼트 검토 최대 남은 거리(m) */
  maxDistance: number;
  /** staminaDrainPerSecond(topSpeed, cruiseSpeed, 0, going, power) */
  drain: number;
  topSpeed: number;
}

export function spurtConstants(r: PreparedRunner, going: Going): SpurtConstants {
  return {
    maxDistance: SPURT_MAX_DISTANCE_M[r.style],
    drain: staminaDrainPerSecond(r.topSpeed, r.cruiseSpeed, 0, going, r.power),
    topSpeed: r.topSpeed,
  };
}

/** shouldStartSpurt 와 같은 판정. spurtConstants 로 미리 계산한 값을 쓴다. */
export function shouldStartSpurtPre(
  c: SpurtConstants,
  stamina: number,
  toFinish: number,
  judge: number,
): boolean {
  if (toFinish <= SPURT_ALWAYS_DISTANCE_M) return true;
  if (toFinish > c.maxDistance) return false;
  return stamina * judge >= ((c.drain * toFinish) / c.topSpeed) * SPURT_SAFETY;
}

/**
 * 이번 틱의 목표 속도(트래픽 전). 위치 인자 버전 (할당 없음).
 * earlyLimit = earlyPhaseLimit(distance) 를 호출자가 미리 계산해 넘긴다.
 */
export function targetSpeedAt(
  r: PreparedRunner,
  s: number,
  earlyLimit: number,
  spurting: boolean,
  finished: boolean,
  stamina: number,
  gradient: number,
  battling: boolean,
): number {
  // 1. 결승 후: 순항의 일정 비율로 흘러간다
  if (finished) {
    return r.cruiseSpeed * POST_FINISH_SPEED_FRACTION;
  }

  // 2. 스퍼트 중이면 최고 속도, 아니면 구간별 순항 속도
  let target: number;
  if (spurting) {
    target = r.topSpeed;
  } else if (s < earlyLimit) {
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
  return targetSpeedAt(
    r,
    s,
    earlyPhaseLimit(distance),
    spurting,
    finished,
    stamina,
    gradient,
    battling,
  );
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

/**
 * 진행도 정렬 순서 유지 (정렬 이웃 탐색용).
 * order[k] = k 번째로 진행도가 작은 말 index, pos[i] = 말 i 의 order 내 위치.
 * 직전 틱 순서를 삽입 정렬로 갱신한다(거의 정렬돼 있어 O(n)). 동률의 순서는 임의다.
 */
export function resortOrder(prog: readonly number[], order: Int32Array, pos: Int32Array): void {
  const n = order.length;
  for (let k = 1; k < n; k++) {
    const idx = order[k] as number;
    const v = prog[idx] as number;
    let m = k - 1;
    while (m >= 0 && (prog[order[m] as number] as number) > v) {
      order[m + 1] = order[m] as number;
      m--;
    }
    order[m + 1] = idx;
  }
  for (let k = 0; k < n; k++) {
    pos[order[k] as number] = k;
  }
}

/**
 * findBlocker 와 같은 결과. 정렬 순서에서 i 의 뒤쪽만 스캔하고 gap >= BLOCK_DISTANCE 이면 멈춘다.
 * 가장 가까운 말, 같으면 작은 index 규칙을 그대로 따른다.
 */
export function findBlockerSorted(
  i: number,
  prog: readonly number[],
  lane: readonly number[],
  order: Int32Array,
  pos: Int32Array,
): number {
  const pi = prog[i] as number;
  const li = lane[i] as number;
  const n = order.length;
  let best = -1;
  let bestGap = Infinity;
  for (let k = (pos[i] as number) + 1; k < n; k++) {
    const j = order[k] as number;
    const gap = (prog[j] as number) - pi;
    if (gap >= BLOCK_DISTANCE_M) break;
    if (gap <= 0) continue;
    const dl = (lane[j] as number) - li;
    if (dl >= HORSE_WIDTH_M || dl <= -HORSE_WIDTH_M) continue;
    if (gap < bestGap || (gap === bestGap && j < best)) {
      bestGap = gap;
      best = j;
    }
  }
  return best;
}

/** isLaneFree 와 같은 결과. 정렬 순서에서 |dp| < LANE_CLEARANCE 범위만 앞뒤로 스캔한다. */
export function isLaneFreeSorted(
  i: number,
  candidateLane: number,
  prog: readonly number[],
  lane: readonly number[],
  order: Int32Array,
  pos: Int32Array,
): boolean {
  const pi = prog[i] as number;
  const n = order.length;
  const p0 = pos[i] as number;
  for (let k = p0 + 1; k < n; k++) {
    const m = order[k] as number;
    const dp = (prog[m] as number) - pi;
    if (dp >= LANE_CLEARANCE_M) break;
    const dl = (lane[m] as number) - candidateLane;
    if (dl < HORSE_WIDTH_M && dl > -HORSE_WIDTH_M) return false;
  }
  for (let k = p0 - 1; k >= 0; k--) {
    const m = order[k] as number;
    const dp = (prog[m] as number) - pi;
    if (dp <= -LANE_CLEARANCE_M) break;
    const dl = (lane[m] as number) - candidateLane;
    if (dl < HORSE_WIDTH_M && dl > -HORSE_WIDTH_M) return false;
  }
  return true;
}

/**
 * 경합 판정(스퍼트 중 옆에 미결승 말이 있음). 기존 battling 루프와 같은 결과를 정렬 순서로 구한다.
 * 조건: j !== i, 미결승, |prog[j]-prog[i]| < BATTLE_RANGE_M, |lane[j]-lane[i]| < BATTLE_LANE_M
 */
export function isBattlingSorted(
  i: number,
  prog: readonly number[],
  lane: readonly number[],
  finished: readonly boolean[],
  order: Int32Array,
  pos: Int32Array,
): boolean {
  const pi = prog[i] as number;
  const li = lane[i] as number;
  const n = order.length;
  const p0 = pos[i] as number;
  for (let k = p0 + 1; k < n; k++) {
    const m = order[k] as number;
    const dp = (prog[m] as number) - pi;
    if (dp >= BATTLE_RANGE_M) break;
    if (finished[m] === true) continue;
    if (Math.abs((lane[m] as number) - li) < BATTLE_LANE_M) return true;
  }
  for (let k = p0 - 1; k >= 0; k--) {
    const m = order[k] as number;
    const dp = (prog[m] as number) - pi;
    if (dp <= -BATTLE_RANGE_M) break;
    if (finished[m] === true) continue;
    if (Math.abs((lane[m] as number) - li) < BATTLE_LANE_M) return true;
  }
  return false;
}
