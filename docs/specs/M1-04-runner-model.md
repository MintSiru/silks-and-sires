# M1-04 주자 모델 (능력치·적성 → 속도·스태미나 파라미터)

담당: haiku-coder · 선행: M0-03(Rng), M1-01(config/going.ts, going/going.ts 의 goingFit)

## 목적
레이스 시작 시 각 말의 정적 파라미터(`PreparedRunner`)를 계산하고, 틱 루프가 쓸 스태미나 소모·탈진 속도 함수와 오즈용 예상 전력 함수를 제공한다. **같은 입력 + 같은 rng 상태 = 같은 출력.**

## 생성할 파일
1. `src/engine/config/runner.ts`
2. `src/engine/race/runnerModel.ts`
3. `tests/engine/runnerModel.test.ts`

## 사용할 타입·함수 (수정 금지)
- 타입: `RunnerInput, PreparedRunner, Going, Surface, Handedness, Aptitudes, Condition, Rng` (`src/engine/types`)
- `goingFit` (`src/engine/going/going.ts`), `GOING_SPEED_FACTOR, GOING_STAMINA_DRAIN, GOING_POWER_WEIGHT` (`src/engine/config/going.ts`)

## 구현 사양

### config/runner.ts (값 그대로)
```ts
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
```

### race/runnerModel.ts
```ts
export interface RaceContext {
  distance: number;
  going: Going;
  surface: Surface;
  handedness: Handedness;   // RacePath.handedness
  undulation: number;       // Racecourse.undulation 0~1
  trackWidth: number;       // RacePath.width
}
export function rawSpeed(speedAbility: number): number;
export function paceFactor(distance: number): number;
export function distanceFit(apt: Pick<Aptitudes, 'distanceOptimum' | 'distanceRange'>, distance: number): number;
export function courseFit(apt: Pick<Aptitudes, 'leftHanded' | 'rightHanded' | 'undulation'>, handedness: Handedness, undulation: number): number;
export function powerGoingFit(power: number, going: Going): number;      // power 0~100
export function weightFactor(weightLb: number): number;
export function conditionFactor(c: Condition): number;
export function jockeyFactor(skill: number): number;
/** 난수 없는 속도 배수 = GOING_SPEED_FACTOR × goingFit × distanceFit × paceFactor × courseFit × powerGoingFit × weightFactor × conditionFactor × jockeyFactor */
export function speedMultiplier(input: RunnerInput, ctx: RaceContext): number;
export function prepareRunner(input: RunnerInput, index: number, ctx: RaceContext, rng: Rng): PreparedRunner;
export function staminaDrainPerSecond(speed: number, gradient: number, going: Going, power01: number): number;
export function exhaustedSpeed(r: PreparedRunner): number;
/** 오즈용 예상 전력. 클수록 강함. 단위 = 초(= -예상 주파 시간). 난수 없음 */
export function estimateStrength(input: RunnerInput, ctx: RaceContext): number;
```
- courseFit: handedness 'left' → `1 + HANDEDNESS_EFFECT × leftHanded`, 'right' → rightHanded, 'straight' → 1. 여기에 `× (1 + UNDULATION_EFFECT × apt.undulation × undulation)`.
- conditionFactor: `1 - FITNESS_EFFECT × (1 - fitness/100) - FATIGUE_EFFECT × fatigue/100 + MENTAL_EFFECT × (mental - 50)/50`.
- prepareRunner (rng 사용 순서 고정: ① `form = 1 + rng.normal(0, FORM_SD)` ② `u = rng.next()` — 이 2회 호출 외 rng 사용 금지):
  - `mult = speedMultiplier(input, ctx) × form`, `raw = rawSpeed(ability.speed)`
  - `cruiseSpeed = raw × CRUISE_FRACTION × mult`, `topSpeed = raw × (TOP_FRACTION_BASE + TOP_FRACTION_ACCEL × acc/100) × mult`
  - `accel = ACCEL_BASE + ACCEL_RANGE × acc/100`
  - `staminaPool = (STAMINA_BASE + STAMINA_RANGE × stamina/100) × (FLOOR + (1 - FLOOR) × fitness/100)`
  - `guts = ability.guts/100`, `power = ability.power/100`, `jockeySkill = jockey.skill/100`
  - `startDelay = START_DELAY_MIN + u × START_DELAY_RANGE × (1 - RELIEF × acc/100)`
  - `startLane` 위 공식, `style = entry.tactic`, `index`, `horseId = horse.id`.
- estimateStrength (form = 1):
  - cruise, top 를 위와 같이(폼 없이) 계산. `needed = staminaDrainPerSecond(cruise, 0, going, power01) × distance / cruise`.
  - `suff = min(1, pool / needed)`, `eff = (cruise × (1 - SHARE) + top × SHARE) × (1 - (1 - suff) × SHORTFALL_PENALTY)`.
  - 반환 `-(distance / eff)`.

## 수용 기준 (테스트에서 "평균마" = 모든 능력치 60, distanceOptimum = 레이스 거리, distanceRange 400, goingPreference 2, goingTolerance 1.5, 적성 0, fitness 100, fatigue 0, mental 50, 기수 skill 50, weightLb 126, draw 1, going 'good', handedness 'left', undulation 0.5, trackWidth 30)
1. 평균마 1600m: cruiseSpeed(폼 제외, 즉 `rawSpeed × CRUISE_FRACTION × speedMultiplier`) 가 15.9~16.4 m/s (계산상 약 16.30). 1006m 의 값 > 1600m 값 > 3219m 값.
2. 단조성: speed 능력 +10 → cruise 증가; weightLb +7 → speedMultiplier 감소(약 0.7%); going 'heavy' 에서 power 80 인 말의 powerGoingFit > power 40 인 말; distanceOptimum 이 레이스 거리에서 800m 벗어나면 distanceFit < 0.975.
3. goingFit 이 speedMultiplier 에 반영된다(선호 마장 heavy 인 말이 heavy 에서 firm 선호 말보다 speedMultiplier 가 크다).
4. 같은 시드로 prepareRunner 두 번 → 깊은 비교로 같다. prepareRunner 후 rng 상태가 정확히 next() 3회분 진행(normal 2회 + next 1회)했는지 확인(복제 rng 로 3회 next 한 상태와 getState 비교).
5. startLane: draw 1 → 0.5, draw 10 → 10.4, 폭 22 에서 draw 30 → 21.5 (clamp).
6. staminaDrainPerSecond(16, 0, 'good', 0.5) = 1; 'heavy' 에서 1.16; gradient 0.02·power01 0 → 1.16 (good), power01 1 → 1.08.
7. estimateStrength: 평균마보다 speed 10 높은 말이 더 큼. 3219m 에서 stamina 20 인 말이 stamina 80 인 말보다 작음.

## 금지 사항
- 공용 타입·going 모듈·config/going.ts 수정 금지. 목록 외 파일 금지. 매직 넘버 금지(0, 1, 2, 50, 100 같은 정규화 상수 제외).
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/runnerModel.test.ts && npm run typecheck && npm run lint`
