import type {
  Assessment,
  AssessmentComment,
  AssessmentStage,
  CommentKey,
  ConformationReport,
  GameDate,
  Grade,
  GrowthProfile,
  Horse,
  Rng,
} from '../types';
import {
  DISTANCE_HINT_HALF_WIDTH,
  DISTANCE_HINT_MAX,
  DISTANCE_HINT_MIN,
  DISTANCE_HINT_ROUND,
  DISTANCE_HINT_SD,
  GOING_FAST_MAX,
  GOING_SOFT_MIN,
  GRADE_THRESHOLDS,
  GROWTH_HINT_PROB,
  IN_TRAINING_ABILITY_WEIGHT,
  MAX_COMMENTS,
  PERCEPTION_SD,
  SKILL_NOISE_RELIEF,
  TRAIT_CENTER,
  TRAIT_EXCEPTIONAL_DEVIATION,
  TRAIT_MIN_DEVIATION,
} from '../config/assessment';

/** 평가 대상 특성. 순서가 곧 난수 소비 순서다(바꾸면 결과가 달라진다). */
const TRAIT_KEYS = ['speed', 'stamina', 'acceleration', 'guts', 'power', 'soundness', 'mental'] as const;
type TraitKey = (typeof TRAIT_KEYS)[number];
type TraitValues = Record<TraitKey, number>;

/** 종합 등급 계산에 쓰는 능력치 */
const OVERALL_TRAITS: readonly TraitKey[] = ['speed', 'stamina', 'acceleration', 'guts', 'power'];

type Tone = AssessmentComment['tone'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 숫자 값 → 등급. 하한 이상이면 그 등급, 그 미만이면 다음 등급. */
export function gradeOf(value: number): Grade {
  if (value >= GRADE_THRESHOLDS.S) return 'S';
  if (value >= GRADE_THRESHOLDS.A) return 'A';
  if (value >= GRADE_THRESHOLDS.B) return 'B';
  if (value >= GRADE_THRESHOLDS.C) return 'C';
  if (value >= GRADE_THRESHOLDS.D) return 'D';
  return 'E';
}

/** 진짜 값 t. 2살 미만은 잠재, 조교 중은 현재 능력과 잠재의 혼합. 근성·건강·정신은 현재 값. */
function trueTraits(horse: Horse, stage: AssessmentStage): TraitValues {
  const w = IN_TRAINING_ABILITY_WEIGHT;
  const blend = (ability: number, potential: number): number =>
    stage === 'in_training' ? ability * w + potential * (1 - w) : potential;
  return {
    speed: blend(horse.ability.speed, horse.potential.speed),
    stamina: blend(horse.ability.stamina, horse.potential.stamina),
    acceleration: blend(horse.ability.acceleration, horse.potential.acceleration),
    guts: blend(horse.ability.guts, horse.potential.guts),
    power: blend(horse.ability.power, horse.potential.power),
    soundness: horse.soundness,
    mental: horse.condition.mental,
  };
}

/** 인식값 p = t + normal(0, sd). TRAIT_KEYS 순서로 rng 를 쓴다. */
function perceive(truth: TraitValues, stage: AssessmentStage, skill: number, rng: Rng): TraitValues {
  const sd = PERCEPTION_SD[stage] * (1 - (SKILL_NOISE_RELIEF * skill) / 100);
  return {
    speed: truth.speed + rng.normal(0, sd),
    stamina: truth.stamina + rng.normal(0, sd),
    acceleration: truth.acceleration + rng.normal(0, sd),
    guts: truth.guts + rng.normal(0, sd),
    power: truth.power + rng.normal(0, sd),
    soundness: truth.soundness + rng.normal(0, sd),
    mental: truth.mental + rng.normal(0, sd),
  };
}

/** 마체 평가. 인식값만 사용한다. */
function conformationOf(stage: AssessmentStage, p: TraitValues): ConformationReport {
  const core = OVERALL_TRAITS.map((k) => p[k]);
  const overallAvg = core.reduce((sum, v) => sum + v, 0) / core.length;
  return {
    stage,
    overall: gradeOf(overallAvg),
    frame: gradeOf((p.power + p.stamina) / 2),
    hindquarters: gradeOf((p.speed + p.acceleration) / 2),
    legs: gradeOf(p.soundness),
    action: gradeOf((p.speed + p.stamina) / 2),
    temperament: gradeOf((p.guts + p.mental) / 2),
  };
}

/** 종합 코멘트(항상 첫 번째). */
function overallComment(overall: Grade): AssessmentComment {
  switch (overall) {
    case 'S':
    case 'A':
      return { key: 'overall_star', tone: 'positive' };
    case 'B':
      return { key: 'overall_useful', tone: 'positive' };
    case 'C':
      return { key: 'overall_moderate', tone: 'neutral' };
    default:
      return { key: 'overall_limited', tone: 'negative' };
  }
}

/** 특징 코멘트 한 개. |d| < TRAIT_MIN_DEVIATION 이면 null. */
function traitComment(trait: TraitKey, d: number): AssessmentComment | null {
  if (Math.abs(d) < TRAIT_MIN_DEVIATION) return null;
  const high = d > 0;
  const pick = (key: CommentKey, tone: Tone): AssessmentComment => ({ key, tone });
  switch (trait) {
    case 'speed':
      if (!high) return pick('speed_lacking', 'negative');
      return d >= TRAIT_EXCEPTIONAL_DEVIATION
        ? pick('speed_exceptional', 'positive')
        : pick('speed_good', 'positive');
    case 'stamina':
      return high ? pick('stamina_stays_well', 'positive') : pick('stamina_sprinter', 'neutral');
    case 'acceleration':
      return high ? pick('kick_sharp', 'positive') : pick('kick_one_paced', 'negative');
    case 'guts':
      return high ? pick('guts_battler', 'positive') : pick('guts_soft', 'negative');
    case 'power':
      return high ? pick('power_strong', 'positive') : pick('power_light', 'neutral');
    case 'soundness':
      return high ? pick('legs_sound', 'positive') : pick('legs_fragile', 'negative');
    case 'mental':
      return high ? pick('temper_calm', 'positive') : pick('temper_keen', 'neutral');
  }
}

interface TraitCandidate {
  comment: AssessmentComment;
  deviation: number;
  order: number;
}

/** 특징 후보: |d| 큰 순, 같으면 TRAIT_KEYS 나열 순서. */
function traitComments(p: TraitValues): AssessmentComment[] {
  const candidates: TraitCandidate[] = [];
  TRAIT_KEYS.forEach((trait, order) => {
    const d = p[trait] - TRAIT_CENTER;
    const comment = traitComment(trait, d);
    if (comment) candidates.push({ comment, deviation: Math.abs(d), order });
  });
  candidates.sort((a, b) => b.deviation - a.deviation || a.order - b.order);
  return candidates.slice(0, Math.max(0, MAX_COMMENTS - 1)).map((c) => c.comment);
}

/** 마장 선호 코멘트(2살 이후 단계만). */
function goingComment(stage: AssessmentStage, goingPreference: number): AssessmentComment | null {
  if (stage !== 'two_year_old' && stage !== 'in_training') return null;
  if (goingPreference <= GOING_FAST_MAX) return { key: 'going_likes_fast', tone: 'neutral' };
  if (goingPreference >= GOING_SOFT_MIN) return { key: 'going_likes_soft', tone: 'neutral' };
  return null;
}

/** 성장형 힌트 코멘트. */
function growthComment(hint: GrowthProfile['type'] | 'unknown'): AssessmentComment | null {
  if (hint === 'precocious') return { key: 'growth_early', tone: 'neutral' };
  if (hint === 'late') return { key: 'growth_needs_time', tone: 'neutral' };
  return null;
}

/** 거리 힌트. 중심 = distanceOptimum + normal(0, sd). 한 번만 rng 를 쓴다. */
function distanceHintOf(
  horse: Horse,
  stage: AssessmentStage,
  rng: Rng,
): { min: number; max: number } {
  const center = horse.aptitude.distanceOptimum + rng.normal(0, DISTANCE_HINT_SD[stage]);
  const half = DISTANCE_HINT_HALF_WIDTH[stage];
  const finish = (value: number): number =>
    Math.round(clamp(value, DISTANCE_HINT_MIN, DISTANCE_HINT_MAX) / DISTANCE_HINT_ROUND) * DISTANCE_HINT_ROUND;
  return { min: finish(center - half), max: finish(center + half) };
}

/** 성장형 힌트. foal 은 rng 를 쓰지 않고 항상 unknown. */
function growthHintOf(
  horse: Horse,
  stage: AssessmentStage,
  rng: Rng,
): GrowthProfile['type'] | 'unknown' {
  if (stage === 'foal') return 'unknown';
  return rng.chance(GROWTH_HINT_PROB[stage]) ? horse.growth.type : 'unknown';
}

/**
 * 한 시점의 평가. 숨은 능력치는 노출하지 않고, 오차가 섞인 단서만 돌려준다.
 * rng 사용 순서: 인식 오차(7개) → 거리 힌트 → 성장형 힌트.
 */
export function assessHorse(
  horse: Horse,
  stage: AssessmentStage,
  assessorSkill: number,
  date: GameDate,
  rng: Rng,
): Assessment {
  const skill = clamp(assessorSkill, 0, 100);
  const p = perceive(trueTraits(horse, stage), stage, skill, rng);
  const conformation = conformationOf(stage, p);
  const distanceHint = distanceHintOf(horse, stage, rng);
  const growthHint = growthHintOf(horse, stage, rng);

  const comments: AssessmentComment[] = [overallComment(conformation.overall)];
  for (const c of traitComments(p)) {
    if (comments.length >= MAX_COMMENTS) break;
    comments.push(c);
  }
  const going = goingComment(stage, horse.aptitude.goingPreference);
  if (going && comments.length < MAX_COMMENTS) comments.push(going);
  const growth = growthComment(growthHint);
  if (growth && comments.length < MAX_COMMENTS) comments.push(growth);

  return {
    horseId: horse.id,
    year: date.year,
    week: date.week,
    conformation,
    comments,
    distanceHint,
    growthHint,
  };
}
