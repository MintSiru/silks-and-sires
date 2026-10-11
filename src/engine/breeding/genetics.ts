import type {
  Abilities,
  Aptitudes,
  CareerRecord,
  CountryCode,
  GrowthProfile,
  Horse,
  HorseId,
  InbreedingCross,
  NickEntry,
  OwnerId,
  RunningStyle,
  Rng,
  SireLineId,
} from '../types';
import {
  DIST_INHERIT_SD,
  FAMILY_BONUS_MAX,
  FOAL_FITNESS,
  FOAL_MALE_CHANCE,
  GENETIC_SD,
  GOING_INHERIT_SD,
  GROWTH_FROM_DAM_P,
  GROWTH_FROM_SIRE_P,
  INBREED_BONUS_MAX,
  INBREED_EXCESS_FROM,
  INBREED_EXCESS_POTENTIAL_PENALTY,
  INBREED_EXCESS_SOUNDNESS_PENALTY,
  INBREED_HIGH,
  INBREED_LOW,
  INBREED_PEAK,
  MENTAL_INHERIT_SD,
  NICK_EFFECT_MAX,
  POPULATION_MEAN,
  REGRESSION_TO_MEAN,
  SIRE_WEIGHT,
  SOUNDNESS_INHERIT_SD,
  SOUNDNESS_REGRESSION,
  STYLE_FROM_DAM_P,
  STYLE_FROM_SIRE_P,
  SURFACE_INHERIT_KEEP,
  SURFACE_INHERIT_SD,
} from '../config/genetics';
import {
  ABILITY_MAX,
  ABILITY_MIN,
  APTITUDE_MAX,
  APTITUDE_MIN,
  DIST_OPT_MAX,
  DIST_OPT_MIN,
  GOING_PREF_MAX,
  GOING_PREF_MIN,
  GROWTH_DECLINE_RATE,
  GROWTH_PEAK_AGE,
  SOUNDNESS_MEAN,
  STYLE_WEIGHTS,
} from '../config/horse';
import { abilityAtAge, sampleGrowthProfile } from '../horse/growthCurve';
import { totalBloodPercent } from './inbreeding';
import { nickValue } from './nicks';

export interface BreedArgs {
  sire: Horse;
  dam: Horse;
  /** 모의 부(모부)의 sireLineId — 닉스 조회용. 모르면 null */
  damsireLineId: SireLineId | null;
  nicks: readonly NickEntry[];
  inbreeding: readonly InbreedingCross[];
  /** 0~1. 모계 명성(호출자가 계산) */
  damFamilyScore: number;
  id: HorseId;
  name: string;
  birthYear: number;
  currentYear: number;
  countryOfBirth: CountryCode;
  ownerId: OwnerId | null;
  breederId: OwnerId | null;
  /** 부 자신의 근친 혈량(%) — 부의 과다 감점을 되돌려 유전 기준값을 만든다. 생략 시 0 */
  sireOwnBloodPercent?: number;
  /** 모 자신의 근친 혈량(%). 생략 시 0 */
  damOwnBloodPercent?: number;
}

/** 두 값의 단순 평균 */
function average(a: number, b: number): number {
  return (a + b) / 2;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 건강도 부모 중간값을 집단 평균 쪽으로 SOUNDNESS_REGRESSION 만큼 당긴다(세대 누적 감쇠 방지) */
function soundnessRegressed(mid: number): number {
  return mid + (SOUNDNESS_MEAN - mid) * SOUNDNESS_REGRESSION;
}

/** 근친 과다 감점(양수). 혈량이 INBREED_EXCESS_FROM 이하이면 0. 말 자신에게만 적용된다(1대 한정) */
export function inbreedingPenalty(bloodPercent: number): { potential: number; soundness: number } {
  if (bloodPercent <= INBREED_EXCESS_FROM) {
    return { potential: 0, soundness: 0 };
  }
  const excess = bloodPercent - INBREED_EXCESS_FROM;
  return {
    potential: excess * INBREED_EXCESS_POTENTIAL_PENALTY,
    soundness: excess * INBREED_EXCESS_SOUNDNESS_PENALTY,
  };
}

/** 인브리드 혈량(bp %) 에 따른 잠재 보정과 건강도 감점(양수) */
export function inbreedingEffect(bloodPercent: number): { potential: number; soundness: number } {
  let bonus = 0;
  if (bloodPercent > INBREED_LOW && bloodPercent < INBREED_HIGH) {
    if (bloodPercent <= INBREED_PEAK) {
      bonus = (INBREED_BONUS_MAX * (bloodPercent - INBREED_LOW)) / (INBREED_PEAK - INBREED_LOW);
    } else {
      bonus = (INBREED_BONUS_MAX * (INBREED_HIGH - bloodPercent)) / (INBREED_HIGH - INBREED_PEAK);
    }
  }

  const penalty = inbreedingPenalty(bloodPercent);
  return {
    potential: bonus - penalty.potential,
    soundness: penalty.soundness,
  };
}

/** 부·모 한 쪽의 유전 기준값: 현재 값에 자신이 받은 과다 감점을 되돌려 더하고 ABILITY_MAX 로 상한 */
function restoreOwnPenalty(value: number, penalty: number): number {
  return Math.min(ABILITY_MAX, value + penalty);
}

/** 능력 전 항목의 유전 기준값(잠재) */
function restoredPotential(potential: Abilities, penalty: number): Abilities {
  return {
    speed: restoreOwnPenalty(potential.speed, penalty),
    stamina: restoreOwnPenalty(potential.stamina, penalty),
    acceleration: restoreOwnPenalty(potential.acceleration, penalty),
    guts: restoreOwnPenalty(potential.guts, penalty),
    power: restoreOwnPenalty(potential.power, penalty),
  };
}

/** 부 SIRE_WEIGHT, 모 나머지 가중 평균 후 집단 평균 회귀 */
function blendedPotential(sireValue: number, damValue: number): number {
  const mid = SIRE_WEIGHT * sireValue + (1 - SIRE_WEIGHT) * damValue;
  return mid + (POPULATION_MEAN - mid) * REGRESSION_TO_MEAN;
}

/**
 * 능력 하나의 잠재 유전. 부·모 유전 기준값(sireBase, damBase)을 섞고 보정 adj 와 정규 편차를 더해
 * [ABILITY_MIN, ABILITY_MAX] 로 자른다
 */
function inheritAbility(
  rng: Rng,
  sireBase: Abilities,
  damBase: Abilities,
  key: keyof Abilities,
  adj: number,
): number {
  const mid = blendedPotential(sireBase[key], damBase[key]);
  return clamp(mid + adj + rng.normal(0, GENETIC_SD), ABILITY_MIN, ABILITY_MAX);
}

/** 성장형: 부 SIRE_P, 모 DAM_P, 나머지 무작위(sampleGrowthProfile) */
function inheritGrowthType(rng: Rng, sire: Horse, dam: Horse): GrowthProfile['type'] {
  const u = rng.next();
  if (u < GROWTH_FROM_SIRE_P) return sire.growth.type;
  if (u < GROWTH_FROM_SIRE_P + GROWTH_FROM_DAM_P) return dam.growth.type;
  return sampleGrowthProfile(rng).type;
}

/** 가중치 누적으로 키를 고른다(u 는 [0,1)) */
function pickByWeight<K extends string>(weights: Record<K, number>, u: number): K {
  const keys = Object.keys(weights) as K[];
  let cumulative = 0;
  for (const key of keys) {
    cumulative += weights[key];
    if (u < cumulative) return key;
  }
  return keys[keys.length - 1] as K;
}

/** 작전 선호: 부 STYLE_FROM_SIRE_P, 모 STYLE_FROM_DAM_P, 나머지 STYLE_WEIGHTS */
function inheritStyle(rng: Rng, sire: Horse, dam: Horse): RunningStyle {
  const u = rng.next();
  if (u < STYLE_FROM_SIRE_P) return sire.preferredStyle;
  if (u < STYLE_FROM_SIRE_P + STYLE_FROM_DAM_P) return dam.preferredStyle;
  return pickByWeight(STYLE_WEIGHTS, rng.next());
}

/** 적성 하나의 유전(표면·코스 적성 공통): 평균 × KEEP + 정규 편차, [APTITUDE_MIN, APTITUDE_MAX] */
function inheritAptitudeScore(rng: Rng, a: number, b: number): number {
  return clamp(
    average(a, b) * SURFACE_INHERIT_KEEP + rng.normal(0, SURFACE_INHERIT_SD),
    APTITUDE_MIN,
    APTITUDE_MAX,
  );
}

function zeroRecord(): CareerRecord {
  return {
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    earnings: 0,
    blackTypePlacings: 0,
    groupWins: 0,
  };
}

/**
 * 부·모로부터 망아지를 만든다. rng 사용 순서는 명세 규칙 1~8 순서(나열 순서)이며,
 * 같은 시드·입력이면 같은 결과다. 보정 adj = 닉스 + 인브리드 잠재 + 모계 명성.
 */
export function breed(rng: Rng, args: BreedArgs): Horse {
  const { sire, dam } = args;

  // 1. 성별
  const sex = rng.chance(FOAL_MALE_CHANCE) ? 'male' : 'female';

  // 2. 보정 합
  const bp = totalBloodPercent(args.inbreeding);
  const inbreed = inbreedingEffect(bp);
  const nick = nickValue(args.nicks, sire.sireLineId, args.damsireLineId);
  const adj =
    NICK_EFFECT_MAX * nick + inbreed.potential + FAMILY_BONUS_MAX * args.damFamilyScore;

  // 부·모 자신의 근친 과다 감점을 되돌린 유전 기준값(1대 한정: 감점은 자손에게 안 간다). 생략 시 0
  const sireOwn = inbreedingPenalty(args.sireOwnBloodPercent ?? 0);
  const damOwn = inbreedingPenalty(args.damOwnBloodPercent ?? 0);
  const sireBase = restoredPotential(sire.potential, sireOwn.potential);
  const damBase = restoredPotential(dam.potential, damOwn.potential);

  // 3. 잠재 능력 (speed, stamina, acceleration, guts, power 순)
  const potential: Abilities = {
    speed: inheritAbility(rng, sireBase, damBase, 'speed', adj),
    stamina: inheritAbility(rng, sireBase, damBase, 'stamina', adj),
    acceleration: inheritAbility(rng, sireBase, damBase, 'acceleration', adj),
    guts: inheritAbility(rng, sireBase, damBase, 'guts', adj),
    power: inheritAbility(rng, sireBase, damBase, 'power', adj),
  };

  // 4. 성장형
  const growthType = inheritGrowthType(rng, sire, dam);
  const growth: GrowthProfile = {
    type: growthType,
    peakAge: GROWTH_PEAK_AGE[growthType],
    declineRate: GROWTH_DECLINE_RATE[growthType],
  };

  // 5. 적성
  const distanceOptimum = clamp(
    average(sire.aptitude.distanceOptimum, dam.aptitude.distanceOptimum) +
      rng.normal(0, DIST_INHERIT_SD),
    DIST_OPT_MIN,
    DIST_OPT_MAX,
  );
  const distanceRange = average(sire.aptitude.distanceRange, dam.aptitude.distanceRange);
  const goingPreference = clamp(
    average(sire.aptitude.goingPreference, dam.aptitude.goingPreference) +
      rng.normal(0, GOING_INHERIT_SD),
    GOING_PREF_MIN,
    GOING_PREF_MAX,
  );
  const goingTolerance = average(sire.aptitude.goingTolerance, dam.aptitude.goingTolerance);
  const allWeather = inheritAptitudeScore(rng, sire.aptitude.allWeather, dam.aptitude.allWeather);
  const dirt = inheritAptitudeScore(rng, sire.aptitude.dirt, dam.aptitude.dirt);
  const leftHanded = inheritAptitudeScore(rng, sire.aptitude.leftHanded, dam.aptitude.leftHanded);
  const rightHanded = inheritAptitudeScore(rng, sire.aptitude.rightHanded, dam.aptitude.rightHanded);
  const undulation = inheritAptitudeScore(rng, sire.aptitude.undulation, dam.aptitude.undulation);

  const aptitude: Aptitudes = {
    distanceOptimum,
    distanceRange,
    goingPreference,
    goingTolerance,
    allWeather,
    dirt,
    leftHanded,
    rightHanded,
    undulation,
  };

  // 6. 작전 선호
  const preferredStyle = inheritStyle(rng, sire, dam);

  // 7. 건강도, 정신
  const soundnessMid = soundnessRegressed(
    average(
      restoreOwnPenalty(sire.soundness, sireOwn.soundness),
      restoreOwnPenalty(dam.soundness, damOwn.soundness),
    ),
  );
  const soundness = clamp(
    soundnessMid + rng.normal(0, SOUNDNESS_INHERIT_SD) - inbreed.soundness,
    ABILITY_MIN,
    ABILITY_MAX,
  );
  const mental = clamp(
    average(sire.condition.mental, dam.condition.mental) + rng.normal(0, MENTAL_INHERIT_SD),
    ABILITY_MIN,
    ABILITY_MAX,
  );

  // 8. 현재 능력과 나머지 필드
  const ability = abilityAtAge(potential, args.currentYear - args.birthYear, growth);

  return {
    id: args.id,
    name: args.name,
    sex,
    gelded: false,
    birthYear: args.birthYear,
    countryOfBirth: args.countryOfBirth,
    status: 'foal',
    sireId: sire.id,
    damId: dam.id,
    ownerId: args.ownerId,
    breederId: args.breederId,
    trainerId: null,
    ability,
    potential,
    growth,
    aptitude,
    preferredStyle,
    condition: {
      fitness: FOAL_FITNESS,
      fatigue: 0,
      mental,
      injury: null,
    },
    officialRating: null,
    familyId: dam.familyId ?? dam.id,
    sireLineId: sire.sireLineId,
    soundness,
    record: zeroRecord(),
  };
}
