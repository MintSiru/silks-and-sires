import { LANE_MIN_M } from '../config/runner';
import {
  BATTLE_LANE_M,
  BATTLE_RANGE_M,
  DECEL_MPS2,
  EXTRAPOLATION_MIN_SPEED_MPS,
  HORSE_WIDTH_M,
  JUDGE_SD,
  LANE_CHANGE_MPS,
  MAX_RACE_SECONDS,
  POST_FINISH_SECONDS,
  RAIL_DRIFT_MPS,
  START_ACCEL_BASE_MPS2,
  START_ACCEL_FROM_RUN,
  START_PHASE_SPEED_FRACTION,
  TICK_SECONDS,
} from '../config/sim';
import { buildRacePath } from '../course/path';
import { createRng } from '../rng';
import type {
  FinishRecord,
  PreparedRunner,
  RaceReplay,
  RaceSimInput,
  RaceSimOutput,
  ReplayFrame,
} from '../types';
import { buildRaceResult, sectionalMarks } from './results';
import { prepareRunner, staminaDrainPerSecond, type RaceContext } from './runnerModel';
import {
  baseTargetSpeed,
  earlyPhaseLimit,
  findBlocker,
  isLaneFree,
  shouldStartSpurt,
} from './tactics';

/** 길이 n 의 0 배열. Array.from 은 packed 배열을 만들어 slice 와 산술 접근이 빠르다. */
function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function falses(n: number): boolean[] {
  return Array.from({ length: n }, () => false);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 결정론적 0.1초 틱 레이스 시뮬레이션. 같은 입력 = 같은 출력.
 * 모든 말은 틱 시작 시점의 스냅샷(prog/lane/speed)만 보고 판단하고, 새 값은 별도 배열에 쓴 뒤 틱 끝에 한꺼번에 교체한다.
 */
export function simulateRace(input: RaceSimInput): RaceSimOutput {
  const { race, course, going, date, runners, seed, options } = input;
  const n = runners.length;
  if (n === 0) {
    throw new RangeError('simulateRace: 출주 두수가 0이다');
  }

  const distance = race.distance;
  const dt = TICK_SECONDS;
  const recordReplay = options?.recordReplay !== false;

  // --- 준비 (rng 사용은 여기서만) ---
  const rng = createRng(seed).fork('sim');
  const path = buildRacePath(course, distance);
  const ctx: RaceContext = {
    distance,
    going,
    surface: path.surface,
    handedness: path.handedness,
    undulation: course.undulation,
    trackWidth: path.width,
  };
  const prepared: PreparedRunner[] = runners.map((runner, i) => prepareRunner(runner, i, ctx, rng));
  const judge: number[] = prepared.map(
    (r) => 1 + rng.normal(0, JUDGE_SD * (1 - r.jockeySkill)),
  );

  const width = path.width;
  const laneMin = LANE_MIN_M;
  const laneMax = width - LANE_MIN_M;
  const handedStraight = path.handedness === 'straight';
  const marks = sectionalMarks(distance);
  const markCount = marks.length;
  const earlyLimit = earlyPhaseLimit(distance);

  // --- 상태 배열 (현재 틱 스냅샷) ---
  const prog: number[] = zeros(n);
  const lane: number[] = prepared.map((r) => r.startLane);
  const laneTarget: number[] = prepared.map((r) => r.startLane);
  const speed: number[] = zeros(n);
  const stamina: number[] = prepared.map((r) => r.staminaPool);
  const spurting: boolean[] = falses(n);
  const finished: boolean[] = falses(n);
  const finishTime: number[] = zeros(n);
  const nextMark: number[] = zeros(n);
  /** 말 i 의 k 번째 표지 통과 시각 = markBuf[i * markCount + k] */
  const markBuf: number[] = zeros(n * markCount);

  // --- 다음 틱 값 버퍼 (틱 끝에 상태 배열로 복사) ---
  const nProg: number[] = zeros(n);
  const nLane: number[] = zeros(n);
  const nLaneTarget: number[] = zeros(n);
  const nSpeed: number[] = zeros(n);
  const nFinished: boolean[] = falses(n);

  // 핫 루프의 배열 읽기는 0 <= index < n 이 보장되므로 ?? 대신 타입 단언을 쓴다(성능).
  const frames: ReplayFrame[] = [];
  const snapshot = (t: number): ReplayFrame => ({
    t,
    progress: prog.slice(),
    lane: lane.slice(),
    speed: speed.slice(),
  });
  if (recordReplay) {
    frames.push(snapshot(0));
  }

  let tick = 0;
  let finishedCount = 0;
  let lastFinish = 0;

  for (;;) {
    const t = tick * dt;

    // 시간 상한: 미결승 말은 현재 속도로 외삽해 기록을 채우고 종료한다
    if (t >= MAX_RACE_SECONDS) {
      for (let i = 0; i < n; i++) {
        if (finished[i] === true) continue;
        const p = prog[i] as number;
        const v = Math.max(speed[i] as number, EXTRAPOLATION_MIN_SPEED_MPS);
        for (let k = nextMark[i] as number; k < markCount; k++) {
          const m = marks[k] as number;
          markBuf[i * markCount + k] = t + (m - p) / v;
        }
        finishTime[i] = t + (distance - p) / v;
      }
      break;
    }

    // --- 말별 판단 (스냅샷 읽기, nXxx 쓰기) ---
    for (const r of prepared) {
      const i = r.index;
      const p = prog[i] as number;
      const ln = lane[i] as number;
      const sp = speed[i] as number;
      const st = stamina[i] as number;
      const isFin = finished[i] === true;

      // 기본값: 변화 없음
      nProg[i] = p;
      nLane[i] = ln;
      nLaneTarget[i] = laneTarget[i] as number;
      nSpeed[i] = sp;
      nFinished[i] = isFin;

      // 1. 출발 지연 중이면 정지 유지
      if (t + dt <= r.startDelay) continue;

      // 2. 현재 위치 정보
      const sample = path.sample(p);

      // 3. 스퍼트 개시 판단 (한 번 켜지면 유지)
      if (!isFin && spurting[i] !== true) {
        if (shouldStartSpurt(r, st, sample.toFinish, going, judge[i] as number)) {
          spurting[i] = true;
        }
      }
      const isSpurting = spurting[i] === true;

      // 4. 경합 여부: 스퍼트 중이고 근처(범위·레인)에 다른 미결승 말이 있음
      let battling = false;
      if (isSpurting && !isFin) {
        for (let j = 0; j < n; j++) {
          if (j === i || finished[j] === true) continue;
          if (
            Math.abs((prog[j] as number) - p) < BATTLE_RANGE_M &&
            Math.abs((lane[j] as number) - ln) < BATTLE_LANE_M
          ) {
            battling = true;
            break;
          }
        }
      }

      // 5. 기본 목표 속도
      let target = baseTargetSpeed({
        r,
        s: sample.s,
        distance,
        spurting: isSpurting,
        finished: isFin,
        stamina: st,
        gradient: sample.gradient,
        battling,
      });

      // 6. 트래픽: 앞말에 막히면 옆 레인으로 피하거나 속도를 맞춘다
      let nextLaneTarget = laneTarget[i] as number;
      let laneChanged = false;
      if (!isFin) {
        const b = findBlocker(i, prog, lane);
        if (b >= 0) {
          const blockerSpeed = speed[b] as number;
          if (target > blockerSpeed) {
            const outer = ln + HORSE_WIDTH_M;
            const inner = ln - HORSE_WIDTH_M;
            if (outer <= laneMax && isLaneFree(i, outer, prog, lane)) {
              nextLaneTarget = outer;
              laneChanged = true;
            } else if (inner >= laneMin && isLaneFree(i, inner, prog, lane)) {
              nextLaneTarget = inner;
              laneChanged = true;
            } else {
              target = Math.min(target, blockerSpeed);
            }
          }
        }
      }

      // 7. 레일 붙기: 곡선에서 안쪽으로 조금씩 파고든다
      if (!laneChanged && !handedStraight && nextLaneTarget >= ln) {
        const inner = Math.max(laneMin, ln - RAIL_DRIFT_MPS * dt);
        if (inner < ln && isLaneFree(i, inner, prog, lane)) {
          nextLaneTarget = inner;
        }
      }

      // 8. 레인 이동 (틱당 최대 LANE_CHANGE_MPS × dt)
      const maxMove = LANE_CHANGE_MPS * dt;
      const nl = clamp(ln + clamp(nextLaneTarget - ln, -maxMove, maxMove), laneMin, laneMax);

      // 9. 속도 갱신
      const inStart = sp < r.cruiseSpeed * START_PHASE_SPEED_FRACTION && sample.s < earlyLimit;
      const accel = inStart ? START_ACCEL_BASE_MPS2 + START_ACCEL_FROM_RUN * r.accel : r.accel;
      const ns =
        sp < target
          ? Math.min(target, sp + accel * dt)
          : Math.max(target, sp - DECEL_MPS2 * dt);

      // 10. 진행 (곡선 바깥쪽은 내측 레일 기준 진행이 줄어든다)
      const np = p + (ns * dt) / (1 + nl * sample.curvature);

      // 11. 스태미나 소모 (결승한 말의 스태미나는 이후 판단에 쓰이지 않으므로 생략)
      const nst = isFin
        ? st
        : Math.max(0, st - staminaDrainPerSecond(ns, r.cruiseSpeed, sample.gradient, going, r.power) * dt);

      nProg[i] = np;
      nLane[i] = nl;
      nLaneTarget[i] = nextLaneTarget;
      nSpeed[i] = ns;

      // 12. 표지 통과 및 결승 시각 보간 (np > p 인 경우만 나눗셈이 발생한다)
      if (np > p) {
        let k = nextMark[i] as number;
        while (k < markCount) {
          const m = marks[k] as number;
          if (m > np) break;
          markBuf[i * markCount + k] = t + (dt * (m - p)) / (np - p);
          k++;
        }
        nextMark[i] = k;

        if (!isFin && distance <= np) {
          finishTime[i] = t + (dt * (distance - p)) / (np - p);
          nFinished[i] = true;
          finishedCount++;
          lastFinish = Math.max(lastFinish, finishTime[i] as number);
        }
      }
      stamina[i] = nst; // 자기 자신만 읽는 값이라 틱 중 즉시 반영해도 다른 말 판단에 영향이 없다
    }

    // --- 틱 끝: 새 값을 상태 배열에 한꺼번에 반영 ---
    for (let i = 0; i < n; i++) {
      prog[i] = nProg[i] as number;
      lane[i] = nLane[i] as number;
      laneTarget[i] = nLaneTarget[i] as number;
      speed[i] = nSpeed[i] as number;
      finished[i] = nFinished[i] === true;
    }

    tick += 1;
    const tNext = tick * dt;
    if (recordReplay) {
      frames.push(snapshot(tNext));
    }
    if (finishedCount === n && tNext >= lastFinish + POST_FINISH_SECONDS) {
      break;
    }
  }

  // --- 결과 ---
  const finishes: FinishRecord[] = [];
  for (let i = 0; i < n; i++) {
    finishes.push({
      runnerIndex: i,
      finishTime: finishTime[i] as number,
      markTimes: markBuf.slice(i * markCount, i * markCount + markCount),
    });
  }

  const result = buildRaceResult({
    race,
    going,
    date,
    seed,
    entries: runners.map((r) => r.entry),
    finishes,
    marks,
  });

  const replay: RaceReplay | null = recordReplay
    ? { tickSeconds: dt, horseIds: prepared.map((r) => r.horseId), frames }
    : null;

  return { result, replay };
}
