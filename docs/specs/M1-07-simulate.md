# M1-07 레이스 틱 시뮬레이션 (0.1초 틱, 기수 AI, 트래픽)

담당: haiku-coder · 선행: M1-03(buildRacePath), M1-04(runnerModel), M1-06(results), M1-02(data — 테스트용)

## 목적
`simulateRace(input)` — 결정론적 0.1초 틱 시뮬레이션으로 `RaceResult` 와 `RaceReplay` 를 만든다.
**같은 입력 = 비트 단위로 같은 출력.** 레이스 1회(20두·3,000m, 리플레이 포함) 평균 50ms 이하.

## 생성할 파일
1. `src/engine/config/sim.ts`
2. `src/engine/race/tactics.ts`
3. `src/engine/race/simulate.ts`
4. `tests/engine/simulate.test.ts`

## 사용할 타입·함수 (수정 금지)
- 타입: `RaceSimInput, RaceSimOutput, PreparedRunner, FinishRecord, ReplayFrame, RaceReplay, RacePath, RunningStyle, Going` (`src/engine/types`)
- `createRng` (`src/engine/rng`), `buildRacePath` (`src/engine/course/path.ts`)
- `prepareRunner, staminaDrainPerSecond, exhaustedSpeed, RaceContext` (`src/engine/race/runnerModel.ts`), `LANE_MIN_M` (`src/engine/config/runner.ts`)
- `sectionalMarks, buildRaceResult` (`src/engine/race/results.ts`)

## 구현 사양

### config/sim.ts (값 그대로)
```ts
import type { RunningStyle } from '../types';
export const TICK_SECONDS = 0.1;
export const MAX_RACE_SECONDS = 600;
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
export const EARLY_STYLE_FACTOR: Record<RunningStyle, number> = { front: 1.03, prominent: 1.015, midfield: 1.0, held_up: 0.985 };
export const MID_STYLE_FACTOR: Record<RunningStyle, number> = { front: 1.005, prominent: 1.0, midfield: 0.995, held_up: 0.99 };
/** 스퍼트: 남은 거리가 MAX 이하일 때만 검토, ALWAYS 이하면 무조건 */
export const SPURT_MAX_DISTANCE_M: Record<RunningStyle, number> = { front: 700, prominent: 600, midfield: 500, held_up: 450 };
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
```

### race/tactics.ts (순수 함수)
```ts
/** 스퍼트(최고 속도)로 결승까지 가는 데 필요한 스태미나 */
export function spurtEnergyNeeded(r: PreparedRunner, toFinish: number, going: Going): number;
// = staminaDrainPerSecond(r.topSpeed, 0, going, r.power) × toFinish / r.topSpeed
export function shouldStartSpurt(r: PreparedRunner, stamina: number, toFinish: number, going: Going, judge: number): boolean;
// toFinish <= SPURT_ALWAYS → true; toFinish > SPURT_MAX[style] → false; 그 외 stamina × judge >= needed × SPURT_SAFETY
/** 이번 틱의 목표 속도(트래픽 전) */
export function baseTargetSpeed(args: {
  r: PreparedRunner; s: number; distance: number; spurting: boolean; finished: boolean;
  stamina: number; gradient: number; battling: boolean;
}): number;
/** 앞을 막는 말 index (없으면 -1): 0 < prog[j]-prog[i] < BLOCK_DISTANCE 이고 |lane[j]-lane[i]| < HORSE_WIDTH 중 가장 가까운 것 (같으면 작은 index) */
export function findBlocker(i: number, prog: readonly number[], lane: readonly number[]): number;
/** i 가 candidateLane 으로 갈 수 있는가: i 외의 k 중 |prog[k]-prog[i]| < LANE_CLEARANCE 이고 |lane[k]-candidateLane| < HORSE_WIDTH 인 말이 없음 */
export function isLaneFree(i: number, candidateLane: number, prog: readonly number[], lane: readonly number[]): boolean;
```
baseTargetSpeed 순서:
1. finished → `cruise × POST_FINISH_SPEED_FRACTION`.
2. spurting → topSpeed; 아니면 s < 초반 한도 → `cruise × EARLY[style]`, 그 외 `cruise × MID[style]`.
3. 경사 보정(위 공식). 4. stamina <= 0 → `min(target, exhaustedSpeed(r))`. 5. battling → `× (1 + GUTS_BATTLE_BONUS × guts)`.

### race/simulate.ts
```ts
export function simulateRace(input: RaceSimInput): RaceSimOutput;
```
**준비 (rng 사용은 여기서만):**
1. `rng = createRng(input.seed).fork('sim')`, `path = buildRacePath(course, race.distance)`.
2. `ctx: RaceContext = { distance, going, surface: path.surface, handedness: path.handedness, undulation: course.undulation, trackWidth: path.width }`.
3. runner index 순서로 `prepared[i] = prepareRunner(runners[i], i, ctx, rng)`.
4. 그 다음 index 순서로 `judge[i] = 1 + rng.normal(0, JUDGE_SD × (1 - prepared[i].jockeySkill))`.
5. 상태 배열: prog=0, lane=startLane, laneTarget=startLane, speed=0, stamina=staminaPool, spurting=false, finished=false, finishTime, markTimes=[], marks = sectionalMarks(distance).

**틱 루프 (tick = 0,1,2…, `t = tick × TICK_SECONDS` 로 계산 — 누적 덧셈 금지):**
- 리플레이: 루프 시작 전 t=0 프레임 기록, 매 틱 끝에 t=(tick+1)×dt 프레임 기록 (배열은 복사본).
- **2단계 갱신**: 모든 말의 판단은 이번 틱 시작 시점의 스냅샷(prog/lane/speed 배열)만 보고, 새 값은 별도 배열에 쓴 뒤 틱 끝에 한꺼번에 교체한다(index 순서가 결과를 편향시키지 않게).
- 말 i 마다:
  1. `t + dt <= startDelay` 이면 정지 상태 유지(새 값 = 이전 값) 후 다음 말.
  2. `sample = path.sample(prog[i])`.
  3. 미결승·미스퍼트이면 `shouldStartSpurt(prepared[i], stamina[i], sample.toFinish, going, judge[i])` 가 true 일 때 spurting = true (한 번 켜지면 유지).
  4. battling = spurting 이고 미결승이며, 다른 미결승 말 j 중 `|prog[j]-prog[i]| < BATTLE_RANGE` 이고 `|lane[j]-lane[i]| < BATTLE_LANE` 인 말이 있음.
  5. `target = baseTargetSpeed(...)`.
  6. 트래픽(미결승일 때만): `b = findBlocker(i, prog, lane)`. b >= 0 이고 target > speed[b] 이면:
     바깥 후보 `lane[i] + HORSE_WIDTH` (<= width - LANE_MIN) 가 isLaneFree 면 laneTarget = 그 값; 아니면 안쪽 후보 `lane[i] - HORSE_WIDTH` (>= LANE_MIN) 가 free 면 laneTarget = 그 값; 둘 다 아니면 `target = min(target, speed[b])`.
  7. 레일 붙기(handedness 가 'straight' 가 아니고, 6에서 laneTarget 을 바꾸지 않았고, laneTarget >= lane[i] 일 때): `inner = max(LANE_MIN, lane[i] - RAIL_DRIFT_MPS × dt)`; `isLaneFree(i, inner - HORSE_WIDTH/2, …)` 이 아니라 **간단히** `isLaneFree(i, inner, …)` 가 true 이고 inner < lane[i] 이면 laneTarget = inner.
  8. 레인 이동: lane 을 laneTarget 쪽으로 최대 `LANE_CHANGE_MPS × dt` 만큼, [LANE_MIN, width - LANE_MIN] clamp.
  9. 속도: `a = (speed < cruise × START_PHASE_SPEED_FRACTION && s < 초반 한도) ? START_ACCEL_BASE + START_ACCEL_FROM_RUN × accel : accel`. speed < target → `min(target, speed + a·dt)`, 아니면 `max(target, speed - DECEL·dt)`.
  10. 진행: `newProg = prog + newSpeed × dt / (1 + newLane × sample.curvature)`.
  11. 스태미나: `max(0, stamina - staminaDrainPerSecond(newSpeed, sample.gradient, going, power) × dt)`.
  12. 표지 통과: 아직 기록 안 된 표지 m 이 `prog < m <= newProg` 이면 `t + dt × (m - prog)/(newProg - prog)` 기록. 결승(distance)도 같은 방식으로 finishTime 보간 후 finished = true.
- 종료: 모두 결승했고 `t >= 마지막 finishTime + POST_FINISH_SECONDS` 이면 중단. `t >= MAX_RACE_SECONDS` 에 도달하면 미결승 말은 `finishTime = t + (distance - prog)/max(speed, 1)`, 남은 표지도 같은 방식으로 채우고 중단.
- 결과: `buildRaceResult({ race, going, date, seed, entries: runners.map(r => r.entry), finishes, marks })`. `options.recordReplay === false` 면 replay null, 아니면 `{ tickSeconds: TICK_SECONDS, horseIds, frames }`.
- 성능: 틱 안에서 새 객체·배열 생성을 최소화(상태는 Float64Array 또는 미리 만든 number[] 재사용). 리플레이 프레임 복사만 예외.

## 수용 기준 (테스트는 `data/racecourses.json` 을 `loadRacecourses` 로 읽고, 출주마는 `generateSampleField`(src/engine/race/sampleField.ts) + `buildEntries`(setup.ts) 로 만든다. 이름 풀은 data/names.json)
1. 재현성: 같은 입력으로 두 번 → `toEqual` (result 와 replay 모두). 시드 5개 중 적어도 하나는 우승마가 다르다.
2. 모든 말이 결승, position 이 1부터, finishTime 비감소, sectionals 합 = finishTime(±1e-6).
3. 현실적 시간(평균 수준 60, 10두, going 'good', 시드 10개 평균 우승 시간): saint_ourens 1600m 92~102s, saint_ourens 2400m 143~158s, marlow_downs 1006m 56~64s.
4. 능력 차 반영: 한 말만 speed·acceleration +25 로 올린 10두 레이스 50 시드 중 그 말 우승 ≥ 35회.
5. 리플레이: frames[0].t = 0, 인접 프레임 t 차이 0.1(±1e-9), 각 프레임 배열 길이 = 출주 두수, 마지막 프레임에서 모든 progress >= distance. 모든 lane 이 [LANE_MIN, width - LANE_MIN] 안.
6. recordReplay=false 결과의 result 가 리플레이 기록 시 result 와 같다.
7. 성능: 20두 saint_ourens 3000m, 리플레이 포함, 워밍업 3회 후 20회 평균 < 50ms (테스트 파일에서 performance.now).

## 금지 사항
- 공용 타입, 다른 티켓의 엔진 파일 수정 금지(필요하면 [질문]). 목록 외 파일 금지. 엔진에 Math.random/Date/performance 금지.
- 수용 기준 3·4 가 맞지 않으면 **config/sim.ts 값만** 조정할 수 있다(조정한 값과 이유를 보고). runner/going config 는 건드리지 말 것.

## 테스트 명령
`npx vitest run tests/engine/simulate.test.ts && npm run typecheck && npm run lint`
