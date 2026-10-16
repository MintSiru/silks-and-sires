/**
 * 조교·컨디션 주간 규칙 (M3-C1, M4-H12). 발생은 전달받은 Rng, 회복은 독립 시드 스트림을 쓴다.
 * 밸런스 수치는 config/conditioning.ts 에 둔다.
 */
import {
  BACKWARD_FITNESS,
  FACILITY_NEUTRAL_GRADE,
  FACILITY_RECOVERY_PER_GRADE,
  FITNESS_PEAK_ZONE,
  FLAT_MENTAL,
  HIGH_FATIGUE,
  INJURED_DETRAIN,
  INJURED_FITNESS_FLOOR,
  INJURY_FATIGUE_SCALE,
  JUVENILE_GAIN_BASE,
  JUVENILE_GAIN_SLOPE,
  MAX_FATIGUE_TO_RUN,
  MENTAL_FATIGUE_LOSS,
  MENTAL_RACE_LOSS,
  MENTAL_RECOVERY,
  NEEDS_RUN_FITNESS,
  NO_TRAINER_FACILITY_GRADE,
  NO_TRAINER_JUVENILE_FOCUS,
  NO_TRAINER_SKILL,
  PEAK_ZONE_GAIN_MULT,
  RACE_INJURY_BASE,
  REST_DETRAIN,
  REST_FATIGUE_RECOVERY,
  REST_FITNESS_FLOOR,
  REST_MENTAL_GAIN,
  SKILL_GAIN_BASE,
  SKILL_GAIN_SLOPE,
  SKILL_MAX,
  SOUNDNESS_FACTOR_MAX,
  SOUNDNESS_FACTOR_MIN,
  SOUNDNESS_MAX,
  SOUNDNESS_SCALE,
  TRAIN_FATIGUE_RECOVERY,
  TRAIN_FITNESS_GAIN,
  WEEKLY_INJURY_BASE,
} from '../config/conditioning';
import { JUVENILE_AGE } from '../config/entries';
import { CATASTROPHIC_FRACTURE_SHARE } from '../config/injury';
import { POOL_REST_RECOVERY_PER_LEVEL, VET_INJURY_REDUCTION_PER_LEVEL } from '../config/farm';
import { facilityLevel } from '../farm/facilities';
import { createRng } from '../rng';
import { CONDITION_MAX, CONDITION_MIN } from '../config/season';
import type { Horse, Injury, Rng, Trainer } from '../types';
import { progressInjuryInPlace, rollInjury, type InjuryContext } from './injury';

export { rollInjury } from './injury';

/** 조교사 코멘트 키(플레이어에게 보여 줄 문구 키. 문구 자체는 UI 단계에서 정한다) */
export type TrainerReportKey = 'injured' | 'tired' | 'flat' | 'backward' | 'needs_run' | 'nearly_ready' | 'peak';

interface TrainingEnv {
  skill: number;
  facilityGrade: number;
  juvenileFocus: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 조교사가 없으면 기본값을 쓴다 */
function trainingEnvOf(trainer: Trainer | undefined): TrainingEnv {
  if (trainer === undefined) {
    return {
      skill: NO_TRAINER_SKILL,
      facilityGrade: NO_TRAINER_FACILITY_GRADE,
      juvenileFocus: NO_TRAINER_JUVENILE_FOCUS,
    };
  }
  return {
    skill: trainer.skill,
    facilityGrade: trainer.facilityGrade,
    juvenileFocus: trainer.juvenileFocus,
  };
}

/** 체질 계수: 건강도가 낮을수록 크다 */
function soundnessFactor(soundness: number): number {
  return clamp((SOUNDNESS_MAX - soundness) / SOUNDNESS_SCALE, SOUNDNESS_FACTOR_MIN, SOUNDNESS_FACTOR_MAX);
}

/** 준비도 증가량(조교 1주). 정점 구간이면 줄고, 2세면 juvenileFocus 로 배수가 붙는다 */
function trainingFitnessGain(fitness: number, env: TrainingEnv, age: number): number {
  let gain = TRAIN_FITNESS_GAIN * (SKILL_GAIN_BASE + (SKILL_GAIN_SLOPE * env.skill) / SKILL_MAX);
  if (fitness >= FITNESS_PEAK_ZONE) gain *= PEAK_ZONE_GAIN_MULT;
  if (age === JUVENILE_AGE) gain *= JUVENILE_GAIN_BASE + JUVENILE_GAIN_SLOPE * env.juvenileFocus;
  return gain;
}

/** 준비도를 줄이되 하한 아래로는 내리지 않는다. 이미 하한 아래면 그대로 둔다(올리지 않는다) */
function detrainToFloor(fitness: number, detrain: number, floor: number): number {
  if (fitness <= floor) return fitness;
  return Math.max(floor, fitness - detrain);
}

/** 부상 중 한 주: 준비도 감소(하한), 피로는 휴양과 같이 회복, 기간 1주 감소, 0 이 되면 회복 */
function applyInjuredWeek(horse: Horse, context: InjuryContext): void {
  const c = horse.condition;
  c.fitness = detrainToFloor(c.fitness, INJURED_DETRAIN, INJURED_FITNESS_FLOOR);
  const recovery = horse.status === 'resting' ? restFatigueRecovery(context) : REST_FATIGUE_RECOVERY;
  c.fatigue = clamp(c.fatigue - recovery, CONDITION_MIN, CONDITION_MAX);
  progressInjuryInPlace(horse, context);
}

function restFatigueRecovery(context: InjuryContext): number {
  const pool = context.isPlayer && context.farm !== undefined ? facilityLevel({ farm: context.farm }, 'pool') : 0;
  return REST_FATIGUE_RECOVERY * (1 + POOL_REST_RECOVERY_PER_LEVEL * pool);
}

/** 휴양(resting) 한 주 */
function applyRestWeek(horse: Horse, ranThisWeek: boolean, context: InjuryContext): void {
  const c = horse.condition;
  c.fitness = detrainToFloor(c.fitness, REST_DETRAIN, REST_FITNESS_FLOOR);
  c.fatigue = clamp(c.fatigue - restFatigueRecovery(context), CONDITION_MIN, CONDITION_MAX);
  let mental = c.mental + REST_MENTAL_GAIN;
  if (ranThisWeek) mental -= MENTAL_RACE_LOSS;
  c.mental = clamp(mental, CONDITION_MIN, CONDITION_MAX);
}

/** 조교(in_training, 부상 없음) 한 주 */
function applyTrainingWeek(horse: Horse, env: TrainingEnv, age: number, ranThisWeek: boolean): void {
  const c = horse.condition;
  const fatigueBefore = c.fatigue;

  c.fitness = clamp(c.fitness + trainingFitnessGain(c.fitness, env, age), CONDITION_MIN, CONDITION_MAX);

  const recovery = TRAIN_FATIGUE_RECOVERY + (env.facilityGrade - FACILITY_NEUTRAL_GRADE) * FACILITY_RECOVERY_PER_GRADE;
  c.fatigue = clamp(c.fatigue - recovery, CONDITION_MIN, CONDITION_MAX);

  let mental = fatigueBefore > HIGH_FATIGUE ? c.mental - MENTAL_FATIGUE_LOSS : c.mental + MENTAL_RECOVERY;
  if (ranThisWeek) mental -= MENTAL_RACE_LOSS;
  c.mental = clamp(mental, CONDITION_MIN, CONDITION_MAX);
}

/**
 * 한 말에 한 주의 컨디션 규칙을 적용한다. 말 객체를 직접 고친다(in place).
 * 판정 순서: (1) 부상 중이면 부상 중 규칙만 적용하고 null
 * (2) 출주했으면 출주 부상 판정 (3) 조교/휴양 변화 (4) 출주 부상이 없었으면 주간 부상 판정.
 * 새 부상이 나면 그 Injury 를 돌려주고 horse.condition.injury 에도 넣는다.
 * 새 부상이 난 주에는 (3) 을 건너뛴다(부상 당일 조교·휴양 효과를 주지 않는다).
 * status 가 in_training·resting 이 아니면 아무것도 하지 않는다.
 */
export function weeklyConditionInPlace(
  horse: Horse,
  trainer: Trainer | undefined,
  age: number,
  ranThisWeek: boolean,
  rng: Rng,
  context: InjuryContext = { date: { year: horse.birthYear + age, week: 1 }, initialSeed: 0, isPlayer: false },
): Injury | null {
  if (horse.status !== 'in_training' && horse.status !== 'resting') return null;

  const vet = context.isPlayer && context.farm !== undefined ? facilityLevel({ farm: context.farm }, 'vet_clinic') : 0;
  const prevented = (phase: string): boolean => vet > 0
    && createRng(`${context.initialSeed}:facility-injury-prevention:${horse.id}:${context.date.year}:${context.date.week}:${phase}`)
      .chance(VET_INJURY_REDUCTION_PER_LEVEL * vet);

  // (1) 부상 중
  if (horse.condition.injury !== null) {
    applyInjuredWeek(horse, context);
    return null;
  }

  // (2) 출주 부상
  let racePrevented = false;
  if (ranThisWeek) {
    const raceRisk = RACE_INJURY_BASE * soundnessFactor(horse.soundness);
    if (rng.chance(raceRisk)) {
      const injury = rollInjury(age, rng, { ...context, horse, racing: true });
      // 기존 발생·종류·기간 추첨을 모두 소비한 뒤 독립 스트림으로 예방한다.
      racePrevented = prevented('race');
      if (!racePrevented) {
        horse.condition.injury = { ...injury };
        if (injury.kind === 'fracture' && context.catastrophicInjuries === true && context.raceId !== undefined
          && createRng(`${context.initialSeed}:catastrophic:${horse.id}:${context.raceId}`).chance(CATASTROPHIC_FRACTURE_SHARE)) {
          horse.status = 'dead';
          horse.diedYear = context.date.year;
          horse.trainerId = null;
          if (context.isPlayer) context.events?.push({ type: 'horse_fatally_injured', horseId: horse.id,
            raceId: context.raceId, date: { ...context.date } });
        }
        return injury;
      }
    }
  }

  // (3) 조교 또는 휴양
  if (horse.status === 'resting') {
    applyRestWeek(horse, ranThisWeek, context);
  } else {
    applyTrainingWeek(horse, trainingEnvOf(trainer), age, ranThisWeek);
  }

  // (4) 주간 부상 (조교 중 말만)
  if (horse.status === 'in_training' && !racePrevented) {
    const weeklyRisk =
      WEEKLY_INJURY_BASE *
      (1 + horse.condition.fatigue / INJURY_FATIGUE_SCALE) *
      soundnessFactor(horse.soundness);
    if (rng.chance(weeklyRisk)) {
      const injury = rollInjury(age, rng, { ...context, horse, racing: false });
      if (prevented('training')) return null;
      horse.condition.injury = { ...injury };
      return injury;
    }
  }

  return null;
}

/**
 * 조교사 코멘트 키. 판정 순서: 부상 → 피로 과다 → 정신 저하 → 준비도 낮음 → 준비도 보통 → 정점 근처 → 정점.
 */
export function trainerReport(horse: Horse): TrainerReportKey {
  const c = horse.condition;
  if (c.injury !== null) return 'injured';
  if (c.fatigue > MAX_FATIGUE_TO_RUN) return 'tired';
  if (c.mental < FLAT_MENTAL) return 'flat';
  if (c.fitness < BACKWARD_FITNESS) return 'backward';
  if (c.fitness < NEEDS_RUN_FITNESS) return 'needs_run';
  if (c.fitness < FITNESS_PEAK_ZONE) return 'nearly_ready';
  return 'peak';
}
