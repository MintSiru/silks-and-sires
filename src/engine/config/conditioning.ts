/** 조교·컨디션 주간 루프 밸런스 상수 (M3-C1). 코드 안에 수치를 직접 두지 않는다. */
import type { InjuryKind } from '../types';
import { INJURY_KINDS } from './injury';

/* ── 조교(in_training, 부상 없음): 준비도 ── */

/** 조교 1주 기본 준비도 증가량 */
export const TRAIN_FITNESS_GAIN = 6;
/** 조교 능력(skill) 0~100 의 척도 상한 */
export const SKILL_MAX = 100;
/** 준비도 증가 배수 = SKILL_GAIN_BASE + SKILL_GAIN_SLOPE × skill / SKILL_MAX */
export const SKILL_GAIN_BASE = 0.75;
export const SKILL_GAIN_SLOPE = 0.5;
/** 이 준비도 이상이면 정점 구간: 증가량에 PEAK_ZONE_GAIN_MULT 를 곱한다 */
export const FITNESS_PEAK_ZONE = 85;
export const PEAK_ZONE_GAIN_MULT = 0.4;
/** 2세(entries 의 JUVENILE_AGE) 증가 배수 = JUVENILE_GAIN_BASE + JUVENILE_GAIN_SLOPE × juvenileFocus */
export const JUVENILE_GAIN_BASE = 0.6;
export const JUVENILE_GAIN_SLOPE = 0.8;

/* ── 조교·휴양: 피로 ── */

/** 조교 1주 피로 회복량 기본값 */
export const TRAIN_FATIGUE_RECOVERY = 12;
/** 시설 등급 기준값(이 등급이면 추가 회복 0) */
export const FACILITY_NEUTRAL_GRADE = 3;
/** 시설 등급 1단계당 추가 피로 회복량 */
export const FACILITY_RECOVERY_PER_GRADE = 1;

/* ── 정신 ── */

/** 매주 정신 회복량(조교 중, 피로 과다 아님) */
export const MENTAL_RECOVERY = 2;
/** 회복 전 피로가 이 값을 넘으면 정신이 줄어든다 */
export const HIGH_FATIGUE = 60;
/** 피로 과다 주간 정신 감소량 */
export const MENTAL_FATIGUE_LOSS = 3;
/** 출주한 주 정신 감소량(추가) */
export const MENTAL_RACE_LOSS = 4;

/* ── 휴양(resting) ── */

/** 휴양 1주 준비도 감소량 */
export const REST_DETRAIN = 3;
/** 휴양으로 준비도가 내려가는 하한(이미 이보다 낮으면 그대로 둔다) */
export const REST_FITNESS_FLOOR = 40;
/** 휴양 1주 피로 회복량 */
export const REST_FATIGUE_RECOVERY = 20;
/** 휴양 1주 정신 회복량 */
export const REST_MENTAL_GAIN = 5;

/* ── 부상 중 ── */

/** 부상 중 1주 준비도 감소량 */
export const INJURED_DETRAIN = 5;
/** 부상 중 준비도 하한(이미 이보다 낮으면 그대로 둔다). 피로는 휴양과 같이 회복한다 */
export const INJURED_FITNESS_FLOOR = 30;

/* ── 조교사 없는 말 ── */

/** 조교사가 없는 말을 볼 때 쓰는 값 */
export const NO_TRAINER_SKILL = 50;
export const NO_TRAINER_FACILITY_GRADE = 3;
export const NO_TRAINER_JUVENILE_FOCUS = 0.5;

/* ── 부상 확률 ── */

/** 주간 부상 기본 확률(in_training, 부상 없음) */
export const WEEKLY_INJURY_BASE = 0.0015;
/** 피로 배수 = 1 + fatigue / INJURY_FATIGUE_SCALE */
export const INJURY_FATIGUE_SCALE = 40;
/** 출주 부상 기본 확률(이번 주 출주한 말) */
export const RACE_INJURY_BASE = 0.01;
/** 체질 계수 = clamp((SOUNDNESS_MAX − soundness) / SOUNDNESS_SCALE, MIN, MAX) */
export const SOUNDNESS_MAX = 100;
export const SOUNDNESS_SCALE = 50;
export const SOUNDNESS_FACTOR_MIN = 0.5;
export const SOUNDNESS_FACTOR_MAX = 2;

/** 부상 종류 가중치와 기간(주, 정수 균등, 양끝 포함). 가중치 합 = 1 */
export interface InjuryTableEntry {
  kind: InjuryKind;
  weight: number;
  minWeeks: number;
  maxWeeks: number;
}
/** 기존 소비자를 위한 새 모델의 조교 기준 정규화 표. 원본 설정은 config/injury.ts. */
const injuryTrainingTotal = Object.values(INJURY_KINDS).reduce((sum, def) => sum + def.trainingWeight, 0);
export const INJURY_TABLE: readonly InjuryTableEntry[] = (Object.keys(INJURY_KINDS) as InjuryKind[]).map((kind) => ({
  kind, weight: INJURY_KINDS[kind].trainingWeight / injuryTrainingTotal,
  minWeeks: INJURY_KINDS[kind].minWeeks, maxWeeks: INJURY_KINDS[kind].maxWeeks,
}));
/** 이 나이 이상이면 sore_shins 는 knock 으로 바뀐다(기간도 knock 기준) */
export const SORE_SHINS_KNOCK_AGE = 4;

/* ── 출주 가능 조건·코멘트 임계값 ── */

/** 출주 가능 최대 피로(이보다 크면 출주 불가) */
export const MAX_FATIGUE_TO_RUN = 45;
/** 조교사 코멘트: 정신이 이 값 미만이면 'flat' */
export const FLAT_MENTAL = 35;
/** 조교사 코멘트: 준비도 미만 'backward' */
export const BACKWARD_FITNESS = 55;
/** 조교사 코멘트: 준비도 미만 'needs_run' */
export const NEEDS_RUN_FITNESS = 70;
