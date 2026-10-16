import { GOING_POWER_WEIGHT, GOING_SPEED_FACTOR, GOING_STAMINA_DRAIN } from '../config/going';
import {
  ACCEL_BASE_MPS2,
  ACCEL_RANGE_MPS2,
  CRUISE_FRACTION,
  DISTANCE_FIT_BONUS,
  DISTANCE_FIT_MAX_PENALTY,
  DRAIN_EXPONENT,
  EXHAUSTED_BASE,
  EXHAUSTED_GUTS,
  FATIGUE_EFFECT,
  FITNESS_EFFECT,
  FORM_SD,
  HANDEDNESS_EFFECT,
  JOCKEY_EFFECT,
  LANE_MIN_M,
  LANE_PER_STALL_M,
  MENTAL_EFFECT,
  PACE_LOG_K,
  PACE_REF_DISTANCE_M,
  POWER_GOING_EFFECT,
  REF_WEIGHT_LB,
  SPEED_BASE_MPS,
  SPEED_RANGE_MPS,
  STAMINA_BASE,
  STAMINA_FITNESS_FLOOR,
  STAMINA_RANGE,
  START_DELAY_ACCEL_RELIEF,
  START_DELAY_MIN_S,
  START_DELAY_RANGE_S,
  STRENGTH_SHORTFALL_PENALTY,
  STRENGTH_SPURT_SHARE,
  TOP_FRACTION_ACCEL,
  TOP_FRACTION_BASE,
  UNDULATION_EFFECT,
  UPHILL_DRAIN_K,
  UPHILL_POWER_RELIEF,
  WEIGHT_EFFECT_PER_LB,
} from '../config/runner';
import { PERSONALITY_MEAN, PERSONALITY_SCALE } from '../config/personality';
import {
  CALM_EARLY_SPEED,
  FIGHT_BATTLE_K,
  KEEN_EARLY_DRAIN,
  KEEN_EARLY_SPEED,
  PERSONA_OVERHEAT_CLAMP,
  PERSONA_OVERHEAT_MIX,
  STUBBORN_IGNORE_MAX_P,
  TIMID_LANE_OFFSET_M,
  TIMID_START_DELAY_S,
} from '../config/sim';
import { goingFit } from '../going/going';
import type {
  Aptitudes,
  Condition,
  Going,
  Horse,
  Handedness,
  Personality,
  PreparedRunner,
  Rng,
  RunnerInput,
  RunningStyle,
  Surface,
} from '../types';

/** 레이스 한 판의 고정 조건. RacePath / Racecourse 에서 뽑아 쓴다. */
export interface RaceContext {
  distance: number;
  going: Going;
  surface: Surface;
  handedness: Handedness;   // RacePath.handedness
  undulation: number;       // Racecourse.undulation 0~1
  trackWidth: number;       // RacePath.width
}

/** 원속도(m/s). speedAbility 0~100. */
export function rawSpeed(speedAbility: number): number {
  return SPEED_BASE_MPS + (SPEED_RANGE_MPS * speedAbility) / 100;
}

/** 거리별 페이스 배수. 짧을수록 빠르고 길수록 느리다. */
export function paceFactor(distance: number): number {
  return 1 - PACE_LOG_K * Math.log(distance / PACE_REF_DISTANCE_M);
}

/** 거리 적성 배수. 최적 거리에서 가장 높고 벗어날수록 감점. */
export function distanceFit(
  apt: Pick<Aptitudes, 'distanceOptimum' | 'distanceRange'>,
  distance: number,
): number {
  const z = (distance - apt.distanceOptimum) / apt.distanceRange;
  const w = Math.exp(-(z * z));
  return 1 + DISTANCE_FIT_BONUS * w - DISTANCE_FIT_MAX_PENALTY * (1 - w);
}

/** 코스 적성 배수. 회전 방향 적성 × 기복 적성. */
export function courseFit(
  apt: Pick<Aptitudes, 'leftHanded' | 'rightHanded' | 'undulation'>,
  handedness: Handedness,
  undulation: number,
): number {
  let handScore = 0;
  if (handedness === 'left') {
    handScore = apt.leftHanded;
  } else if (handedness === 'right') {
    handScore = apt.rightHanded;
  }
  return (1 + HANDEDNESS_EFFECT * handScore) * (1 + UNDULATION_EFFECT * apt.undulation * undulation);
}

/** 파워 × 무거운 마장 배수. power 0~100. */
export function powerGoingFit(power: number, going: Going): number {
  return 1 + POWER_GOING_EFFECT * GOING_POWER_WEIGHT[going] * ((2 * power) / 100 - 1);
}

/** 부담중량 배수. 기준 중량보다 무거우면 감속. */
export function weightFactor(weightLb: number): number {
  return 1 - WEIGHT_EFFECT_PER_LB * (weightLb - REF_WEIGHT_LB);
}

/** 컨디션 배수. 준비도·피로·정신 상태 반영. */
export function conditionFactor(c: Condition): number {
  return (
    1 -
    FITNESS_EFFECT * (1 - c.fitness / 100) -
    FATIGUE_EFFECT * (c.fatigue / 100) +
    MENTAL_EFFECT * ((c.mental - 50) / 50)
  );
}

/** 기수 기승 능력 배수. skill 0~100. */
export function jockeyFactor(skill: number): number {
  return 1 + JOCKEY_EFFECT * ((skill - 50) / 50);
}

/**
 * 난수 없는 속도 배수.
 * GOING_SPEED_FACTOR × goingFit × distanceFit × paceFactor × courseFit × powerGoingFit × weightFactor × conditionFactor × jockeyFactor
 */
export function speedMultiplier(input: RunnerInput, ctx: RaceContext): number {
  const apt = input.horse.aptitude;
  return (
    GOING_SPEED_FACTOR[ctx.going] *
    goingFit(apt, ctx.going) *
    distanceFit(apt, ctx.distance) *
    paceFactor(ctx.distance) *
    courseFit(apt, ctx.handedness, ctx.undulation) *
    powerGoingFit(input.horse.ability.power, ctx.going) *
    weightFactor(input.entry.weightLb) *
    conditionFactor(input.horse.condition) *
    jockeyFactor(input.jockey.skill)
  );
}

/** 순항 속도(m/s). mult 는 배수 전체(폼 포함 여부는 호출자가 정한다). */
function cruiseFrom(speedAbility: number, mult: number): number {
  return rawSpeed(speedAbility) * CRUISE_FRACTION * mult;
}

/** 최고 속도(m/s). */
function topFrom(speedAbility: number, accelAbility: number, mult: number): number {
  return (
    rawSpeed(speedAbility) *
    (TOP_FRACTION_BASE + (TOP_FRACTION_ACCEL * accelAbility) / 100) *
    mult
  );
}

/** 스태미나 총량. stamina·fitness 0~100. */
function staminaPoolFrom(stamina: number, fitness: number): number {
  return (
    (STAMINA_BASE + (STAMINA_RANGE * stamina) / 100) *
    (STAMINA_FITNESS_FLOOR + ((1 - STAMINA_FITNESS_FLOOR) * fitness) / 100)
  );
}

/** 출발 레인(m). draw 1 = 내측. [LANE_MIN, width - LANE_MIN] 로 clamp. offset 은 겁에 따른 바깥쪽 이동량(m, 0 이면 없음). */
function startLaneFrom(draw: number, trackWidth: number, offset: number): number {
  const raw = LANE_MIN_M + (draw - 1) * LANE_PER_STALL_M + offset;
  return Math.min(Math.max(raw, LANE_MIN_M), trackWidth - LANE_MIN_M);
}

/** 성격 축 편차 d = (값 − 50) / 50 (−1~+1). 50 이면 0. */
export function personaDeviation(value: number): number {
  return (value - PERSONALITY_MEAN) / PERSONALITY_SCALE;
}

/** 과열도 x = clamp((d_drive − d_composure) × MIX, −CLAMP, CLAMP). 양수 = 초반 과열, 음수 = 느긋함. */
export function overheatLevel(p: Personality): number {
  const raw = (personaDeviation(p.drive) - personaDeviation(p.composure)) * PERSONA_OVERHEAT_MIX;
  return Math.min(PERSONA_OVERHEAT_CLAMP, Math.max(-PERSONA_OVERHEAT_CLAMP, raw));
}

/**
 * 레이스 시작 시 작전 결정. 고집 s = max(0, d_stubbornness) 이면 확률 STUBBORN_IGNORE_MAX_P × s 로
 * 작전(entry.tactic) 대신 말의 preferredStyle 을 쓴다. 성격 난수는 personaRng 만 쓴다(레이스 rng 아님).
 * personaRng 가 생략되면 무시 판정을 하지 않는다.
 */
export function resolveStyle(input: RunnerInput, personaRng: Rng | undefined): RunningStyle {
  const s = Math.max(0, personaDeviation(input.horse.personality.stubbornness));
  if (s <= 0 || personaRng === undefined) return input.entry.tactic;
  const ignore = personaRng.chance(STUBBORN_IGNORE_MAX_P * s);
  return ignore ? input.horse.preferredStyle : input.entry.tactic;
}

/**
 * 성격 파생값을 더한 주자 파라미터. PreparedRunner(types)를 확장한다.
 * 성격 50 이면 overheat·timidity·경합 보정이 0 이고 배수는 정확히 1 이다.
 */
export interface PersonaRunner extends PreparedRunner {
  /** 과열도 x (−1~+1). 양수 = 초반 과열 */
  overheat: number;
  /** 겁 t = max(0, d_timidity) */
  timidity: number;
  /** 경합 근성 배율 = 1 + FIGHT_BATTLE_K × d_fight. 경합 근성 보너스 = GUTS_BATTLE_BONUS × guts × 이 값 */
  battleGutsScale: number;
  /** 초반 구간 목표 속도 배수 */
  earlySpeedMult: number;
  /** 초반 구간 스태미나 소모 배수 (x ≤ 0 이면 1) */
  earlyDrainMult: number;
}

/**
 * 레이스 시작 시 주자 정적 파라미터 계산.
 * rng 사용 순서 고정: ① normal(0, FORM_SD + formVariance) 1회(next 2회 소비) ② next() 1회. 이 외 레이스 rng 사용 금지.
 * personaRng 는 성격 전용 스트림(고집 판정에 최대 1회 소비). 레이스 rng 와 무관하다.
 */
export function prepareRunner(
  input: RunnerInput & { horse: RunnerInput['horse'] & Pick<Horse, 'formVariance'> },
  index: number,
  ctx: RaceContext,
  rng: Rng,
  personaRng?: Rng,
): PersonaRunner {
  const form = 1 + rng.normal(0, FORM_SD + (input.horse.formVariance ?? 0));
  const u = rng.next();

  const ability = input.horse.ability;
  const mult = speedMultiplier(input, ctx) * form;
  const accel = input.horse.ability.acceleration;
  const p = input.horse.personality;
  const overheat = overheatLevel(p);
  const timidity = Math.max(0, personaDeviation(p.timidity));
  const earlySpeedMult =
    overheat > 0 ? 1 + KEEN_EARLY_SPEED * overheat : 1 + CALM_EARLY_SPEED * overheat;
  const earlyDrainMult = overheat > 0 ? 1 + KEEN_EARLY_DRAIN * overheat : 1;

  return {
    index,
    horseId: input.horse.id,
    style: resolveStyle(input, personaRng),
    cruiseSpeed: cruiseFrom(ability.speed, mult),
    topSpeed: topFrom(ability.speed, accel, mult),
    accel: ACCEL_BASE_MPS2 + (ACCEL_RANGE_MPS2 * accel) / 100,
    staminaPool: staminaPoolFrom(ability.stamina, input.horse.condition.fitness),
    guts: ability.guts / 100,
    power: ability.power / 100,
    startDelay:
      START_DELAY_MIN_S +
      u * START_DELAY_RANGE_S * (1 - (START_DELAY_ACCEL_RELIEF * accel) / 100) +
      TIMID_START_DELAY_S * timidity,
    jockeySkill: input.jockey.skill / 100,
    startLane: startLaneFrom(input.entry.draw, ctx.trackWidth, TIMID_LANE_OFFSET_M * timidity),
    overheat,
    timidity,
    battleGutsScale: 1 + FIGHT_BATTLE_K * personaDeviation(p.fight),
    earlySpeedMult,
    earlyDrainMult,
  };
}

/**
 * 스태미나 소모율(단위/초).
 * (v / REF)^EXP × GOING_STAMINA_DRAIN[g] × (1 + UPHILL_K × max(0, gradient) × (1 - RELIEF × power01))
 */
export function staminaDrainPerSecond(
  speed: number,
  cruiseSpeed: number,
  gradient: number,
  going: Going,
  power01: number,
): number {
  const ratio = speed / cruiseSpeed;
  // DRAIN_EXPONENT 가 3 이면 곱셈으로 계산한다(** 보다 빠르다). 골든 8개 설정에서 결과는 비트 단위로 같았다.
  const speedTerm = DRAIN_EXPONENT === 3 ? ratio * ratio * ratio : ratio ** DRAIN_EXPONENT;
  const uphill =
    1 + UPHILL_DRAIN_K * Math.max(0, gradient) * (1 - UPHILL_POWER_RELIEF * power01);
  return speedTerm * GOING_STAMINA_DRAIN[going] * uphill;
}

/** 탈진 속도(m/s) = cruise × (EXHAUSTED_BASE + EXHAUSTED_GUTS × guts01) */
export function exhaustedSpeed(r: PreparedRunner): number {
  return r.cruiseSpeed * (EXHAUSTED_BASE + EXHAUSTED_GUTS * r.guts);
}

/**
 * 오즈용 예상 전력. 클수록 강함. 단위 = 초(= -예상 주파 시간). 난수 없음.
 * 폼 없이 순항·최고 속도를 구하고, 스태미나가 거리를 버티지 못하면 감속을 반영한다.
 */
export function estimateStrength(input: RunnerInput, ctx: RaceContext): number {
  const ability = input.horse.ability;
  const mult = speedMultiplier(input, ctx);
  const cruise = cruiseFrom(ability.speed, mult);
  const top = topFrom(ability.speed, ability.acceleration, mult);
  const pool = staminaPoolFrom(ability.stamina, input.horse.condition.fitness);
  const power01 = ability.power / 100;

  const needed =
    (staminaDrainPerSecond(cruise, cruise, 0, ctx.going, power01) * ctx.distance) / cruise;
  const suff = Math.min(1, pool / needed);
  const effSpeed =
    (cruise * (1 - STRENGTH_SPURT_SHARE) + top * STRENGTH_SPURT_SHARE) *
    (1 - (1 - suff) * STRENGTH_SHORTFALL_PENALTY);
  return -(ctx.distance / effSpeed);
}
