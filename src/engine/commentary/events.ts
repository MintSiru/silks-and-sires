import {
  EARLY_LEADER_M,
  EARLY_LEADER_MAX_FRACTION,
  LEAD_BATTLE_MAX_GAP_M,
  MOVE_MIN_PLACES,
  MOVE_WINDOW_M,
  PACE_CHECK_FRACTION,
  PACE_FAST,
  PACE_FAST_VALUE,
  PACE_SLOW,
  PACE_SLOW_VALUE,
  PHOTO_MARGIN_LABELS,
  SLOW_START_CHECK_S,
  SLOW_START_GAP_M,
  TURN_IN_TOP_N,
} from '../config/commentary';
import { SECTIONAL_STEP_M } from '../config/results';
import type { RacePath, RaceReplay, RaceResult, ReplayFrame } from '../types';

/** 실황 사건 종류. lead_battle 은 early_leader 의 두 말 변형이다. */
export type CommentaryKind =
  | 'start'
  | 'slow_start'
  | 'early_leader'
  | 'lead_battle'
  | 'pace'
  | 'turn_in'
  | 'move'
  | 'lead_change'
  | 'final_furlong'
  | 'photo'
  | 'finish';

/** 같은 t 에서의 정렬 순서 (기획서 나열 순) */
export const COMMENTARY_KIND_ORDER: readonly CommentaryKind[] = [
  'start',
  'slow_start',
  'early_leader',
  'lead_battle',
  'pace',
  'turn_in',
  'move',
  'lead_change',
  'final_furlong',
  'photo',
  'finish',
];

export interface CommentaryEvent {
  /** 레이스 시각(s) */
  t: number;
  kind: CommentaryKind;
  /** runner index. 승부 맥락상 주인공이 앞에 온다 */
  horses: number[];
  /**
   * 사건 값. slow_start·final_furlong = 간격(m), lead_battle = 간격(m), pace = +1 빠름 / −1 느림,
   * move = 올린 계단 수, finish = 승자와 2착 마신, 그 밖은 없음
   */
  value?: number;
}

/** 중계 판정에 쓰는 경로 정보(직선 길이만 쓴다) */
export type CommentaryPath = Pick<RacePath, 'homeStraightLength'>;

export interface ExtractCommentaryArgs {
  replay: RaceReplay;
  result: RaceResult;
  path: CommentaryPath;
  distance: number;
}

/** 배열 원소 읽기. 범위 밖은 호출 측 버그이므로 던진다. */
export function valueAt(arr: readonly number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`commentary: 인덱스 범위 밖 (${i})`);
  return v;
}

export function frameAt(frames: readonly ReplayFrame[], i: number): ReplayFrame {
  const f = frames[i];
  if (f === undefined) throw new RangeError(`commentary: 프레임 범위 밖 (${i})`);
  return f;
}

/** 선두 판정 지점(m): min(EARLY_LEADER_M, distance × EARLY_LEADER_MAX_FRACTION) */
export function earlyPointM(distance: number): number {
  return Math.min(EARLY_LEADER_M, distance * EARLY_LEADER_MAX_FRACTION);
}

/** 결승 직선 입구(m) = distance − 마지막 직선 길이 (0 미만은 0) */
export function turnInPointM(distance: number, homeStraightLength: number): number {
  return Math.max(0, distance - homeStraightLength);
}

/** frames[k].t 가 t 이상인 가장 앞 k. 없으면 frames.length. */
function firstFrameAtOrAfter(frames: readonly ReplayFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frameAt(frames, mid).t >= t) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/** 주자 idx 의 시각 t 진행도(m). 프레임 사이 선형 보간, 범위 밖은 끝값. frames 는 비어 있지 않아야 한다. */
export function progressAt(frames: readonly ReplayFrame[], idx: number, t: number): number {
  const first = frameAt(frames, 0);
  const last = frameAt(frames, frames.length - 1);
  if (t <= first.t) return valueAt(first.progress, idx);
  if (t >= last.t) return valueAt(last.progress, idx);
  const k = firstFrameAtOrAfter(frames, t);
  const a = frameAt(frames, k - 1);
  const b = frameAt(frames, k);
  const pa = valueAt(a.progress, idx);
  const pb = valueAt(b.progress, idx);
  const span = b.t - a.t;
  if (span <= 0) return pb;
  return pa + ((pb - pa) * (t - a.t)) / span;
}

/** 시각 t 의 전 주자 진행도 (n 두) */
export function progressesAt(frames: readonly ReplayFrame[], n: number, t: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(progressAt(frames, i, t));
  return out;
}

/** 주자 idx 가 진행도 s 에 처음 닿는 시각(보간). 한 번도 닿지 않으면 null. */
export function timeToReach(frames: readonly ReplayFrame[], idx: number, s: number): number | null {
  const n = frames.length;
  if (n === 0) return null;
  if (valueAt(frameAt(frames, n - 1).progress, idx) < s) return null;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (valueAt(frameAt(frames, mid).progress, idx) >= s) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  const b = frameAt(frames, lo);
  if (lo === 0) return b.t;
  const a = frameAt(frames, lo - 1);
  const pa = valueAt(a.progress, idx);
  const pb = valueAt(b.progress, idx);
  if (pb <= pa) return b.t;
  return a.t + ((s - pa) * (b.t - a.t)) / (pb - pa);
}

/** 진행도 내림차순 주자 index. 동률은 작은 index 가 앞. */
export function orderDesc(prog: readonly number[]): number[] {
  return prog
    .map((_, i) => i)
    .sort((a, b) => valueAt(prog, b) - valueAt(prog, a) || a - b);
}

/** 1 + (나보다 앞선 말 수). 동률은 같은 순위. */
export function rankOf(prog: readonly number[]): number[] {
  return prog.map((p) => {
    let rank = 1;
    for (const q of prog) {
      if (q > p) rank++;
    }
    return rank;
  });
}

export interface ReachSnapshot {
  /** 선두가 s 에 닿은 시각 */
  t: number;
  /** t 시점 전 주자 진행도 (runner index) */
  prog: number[];
  /** t 시점 진행도 내림차순 runner index */
  order: number[];
}

/** 전 주자 중 처음 s 에 닿은 시각 t 의 스냅샷. 아무도 닿지 않으면 null. */
export function snapshotAtReach(frames: readonly ReplayFrame[], n: number, s: number): ReachSnapshot | null {
  let best: number | null = null;
  for (let i = 0; i < n; i++) {
    const ti = timeToReach(frames, i, s);
    if (ti !== null && (best === null || ti < best)) best = ti;
  }
  if (best === null) return null;
  const prog = progressesAt(frames, n, best);
  return { t: best, prog, order: orderDesc(prog) };
}

function kindRank(kind: CommentaryKind): number {
  return COMMENTARY_KIND_ORDER.indexOf(kind);
}

/**
 * 리플레이와 결과에서 실황 사건을 뽑는다. 같은 입력 = 같은 출력(난수 없음).
 * 결과는 t 오름차순, 같은 t 는 COMMENTARY_KIND_ORDER 순.
 */
export function extractCommentaryEvents(args: ExtractCommentaryArgs): CommentaryEvent[] {
  const { replay, result, path, distance } = args;
  const frames = replay.frames;
  const n = replay.horseIds.length;
  if (frames.length === 0 || n === 0) return [];

  const found: CommentaryEvent[] = [];
  const winnerTime = result.winningTime;
  const turnS = turnInPointM(distance, path.homeStraightLength);
  const winner = result.runners[0];
  const runnerUp = result.runners[1];

  found.push({ t: 0, kind: 'start', horses: [] });

  // slow_start: 2초 시점 최하위가 바로 앞 말과 3m 이상 뒤짐
  const checkT = SLOW_START_CHECK_S;
  const progCheck = progressesAt(frames, n, checkT);
  const lastIdx = orderDesc(progCheck)[n - 1];
  if (lastIdx !== undefined) {
    const lastP = valueAt(progCheck, lastIdx);
    let aheadP: number | null = null;
    for (const p of progCheck) {
      if (p > lastP && (aheadP === null || p < aheadP)) aheadP = p;
    }
    if (aheadP !== null && aheadP - lastP >= SLOW_START_GAP_M) {
      found.push({ t: checkT, kind: 'slow_start', horses: [lastIdx], value: aheadP - lastP });
    }
  }

  // early_leader / lead_battle: 초반 지점 선두와 2위 간격
  const early = snapshotAtReach(frames, n, earlyPointM(distance));
  if (early !== null) {
    const leader = early.order[0];
    const second = early.order[1];
    if (leader !== undefined) {
      if (second === undefined) {
        found.push({ t: early.t, kind: 'early_leader', horses: [leader] });
      } else {
        const gap = valueAt(early.prog, leader) - valueAt(early.prog, second);
        if (gap <= LEAD_BATTLE_MAX_GAP_M) {
          found.push({ t: early.t, kind: 'lead_battle', horses: [leader, second], value: gap });
        } else {
          found.push({ t: early.t, kind: 'early_leader', horses: [leader] });
        }
      }
    }
  }

  // pace: 50% 지점 도달 시각 / (승리 시간 × 50%)
  const half = snapshotAtReach(frames, n, distance * PACE_CHECK_FRACTION);
  if (half !== null && winnerTime > 0) {
    const leader = half.order[0];
    const ratio = half.t / (winnerTime * PACE_CHECK_FRACTION);
    if (leader !== undefined) {
      if (ratio < PACE_FAST) {
        found.push({ t: half.t, kind: 'pace', horses: [leader], value: PACE_FAST_VALUE });
      } else if (ratio > PACE_SLOW) {
        found.push({ t: half.t, kind: 'pace', horses: [leader], value: PACE_SLOW_VALUE });
      }
    }
  }

  // turn_in: 선두가 결승 직선 입구에 닿는 시점의 상위 3두
  const turn = snapshotAtReach(frames, n, turnS);
  if (turn !== null) {
    found.push({ t: turn.t, kind: 'turn_in', horses: turn.order.slice(0, TURN_IN_TOP_N) });
  }

  // move: 결승 직선을 200m 구간으로 나눠 구간마다 가장 많이 올린 1두
  for (let k = 0; ; k++) {
    const a = turnS + k * MOVE_WINDOW_M;
    const b = a + MOVE_WINDOW_M;
    if (b > distance) break;
    const sa = snapshotAtReach(frames, n, a);
    const sb = snapshotAtReach(frames, n, b);
    if (sa === null || sb === null) break;
    const rankA = rankOf(sa.prog);
    const rankB = rankOf(sb.prog);
    let best = -1;
    let bestClimb = 0;
    for (let i = 0; i < n; i++) {
      const climb = valueAt(rankA, i) - valueAt(rankB, i);
      if (climb < MOVE_MIN_PLACES) continue;
      if (climb > bestClimb || (climb === bestClimb && valueAt(rankB, i) < valueAt(rankB, best))) {
        best = i;
        bestClimb = climb;
      }
    }
    if (best >= 0) {
      found.push({ t: sb.t, kind: 'move', horses: [best], value: bestClimb });
    }
  }

  // lead_change: 결승 직선에서 선두가 바뀐 프레임 (결승 전까지만)
  let currentLeader = -1;
  for (let f = 0; f < frames.length; f++) {
    const frame = frameAt(frames, f);
    if (frame.t > winnerTime) break;
    let best = 0;
    let bestP = valueAt(frame.progress, 0);
    for (let i = 1; i < n; i++) {
      const p = valueAt(frame.progress, i);
      if (p > bestP) {
        best = i;
        bestP = p;
      }
    }
    if (bestP < turnS) continue;
    if (currentLeader < 0) {
      currentLeader = best;
      continue;
    }
    if (best !== currentLeader && bestP > valueAt(frame.progress, currentLeader)) {
      found.push({ t: frame.t, kind: 'lead_change', horses: [best, currentLeader] });
      currentLeader = best;
    }
  }

  // final_furlong: 결승 1펄롱 전 선두와 2위 간격
  const ffS = distance - SECTIONAL_STEP_M;
  if (ffS > 0) {
    const ff = snapshotAtReach(frames, n, ffS);
    const leaderFf = ff?.order[0];
    if (ff !== null && leaderFf !== undefined) {
      const second = ff.order[1];
      const gap = second === undefined ? 0 : valueAt(ff.prog, leaderFf) - valueAt(ff.prog, second);
      found.push({ t: ff.t, kind: 'final_furlong', horses: [leaderFf], value: gap });
    }
  }

  // photo / finish
  if (winner !== undefined) {
    if (runnerUp !== undefined) {
      const deadHeat = runnerUp.position === winner.position;
      const closeLabel = runnerUp.margin !== null && PHOTO_MARGIN_LABELS.includes(runnerUp.margin.label);
      if (deadHeat || closeLabel) {
        found.push({
          t: winnerTime,
          kind: 'photo',
          horses: [winner.runnerIndex, runnerUp.runnerIndex],
        });
      }
    }
    found.push({
      t: winnerTime,
      kind: 'finish',
      horses: [winner.runnerIndex],
      value: runnerUp === undefined ? 0 : runnerUp.beatenLengths,
    });
  }

  found.sort((a, b) => a.t - b.t || kindRank(a.kind) - kindRank(b.kind));
  return found;
}
