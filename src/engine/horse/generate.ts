import { defaultCoat } from './traits';
import { deriveStyle, generatePersonality } from './personality';
import type {
  Abilities,
  Aptitudes,
  Condition,
  CountryCode,
  CareerRecord,
  DistanceProfile,
  HorseId,
  Horse,
  HorseStatus,
  OwnerId,
  Rng,
  Sex,
  SireLineId,
  Surface,
} from '../types';
import {
  ABILITY_MAX,
  ABILITY_MIN,
  APTITUDE_MAX,
  APTITUDE_MIN,
  COURSE_APT_SD,
  DEFAULT_FITNESS,
  DEFAULT_POTENTIAL_SPREAD,
  DIST_BIAS_SD,
  DIST_OPT_BASE,
  DIST_OPT_MAX,
  DIST_OPT_MIN,
  DIST_OPT_PER_STAMINA,
  DIST_OPT_SD,
  DIST_RANGE_MAX,
  DIST_RANGE_MIN,
  PROFILE_BOUNDS,
  GOING_PREF_MAX,
  GOING_PREF_MEAN,
  GOING_PREF_MIN,
  GOING_PREF_SD,
  GOING_TOL_MAX,
  GOING_TOL_MIN,
  MENTAL_MEAN,
  MENTAL_SD,
  NAME_MAX_ATTEMPTS,
  NAME_MAX_LENGTH,
  SOUNDNESS_MEAN,
  SOUNDNESS_SD,
  STAMINA_BIAS_DIVISOR,
  STAMINA_BIAS_REF,
  SURFACE_APT_SD,
  SURFACE_BIAS_BONUS,
} from '../config/horse';
import { abilityAtAge, sampleGrowthProfile } from './growthCurve';

export interface GenerateHorseOptions {
  id: HorseId;
  name: string;
  sex: Sex;
  birthYear: number;
  currentYear: number;
  countryOfBirth: CountryCode;
  status: HorseStatus;
  /** 잠재 능력 평균(0~100) */
  level: number;
  /** 기본 DEFAULT_POTENTIAL_SPREAD */
  spread?: number;
  sireId?: HorseId | null;
  damId?: HorseId | null;
  familyId?: HorseId | null;
  /** 부계 계통. 옵션이 없으면 null */
  sireLineId?: SireLineId | null;
  ownerId?: OwnerId | null;
  breederId?: OwnerId | null;
  /** m. 주면 스태미나·거리 적성이 그쪽으로 기운다 */
  distanceBias?: number;
  /** 'aw'/'dirt' 면 해당 적성 +SURFACE_BIAS_BONUS */
  surfaceBias?: Surface;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** distanceOptimum(m) → 거리 프로필. PROFILE_BOUNDS 의 경계값은 이하 포함. */
export function profileOfDistance(distanceOptimum: number): DistanceProfile {
  if (distanceOptimum <= PROFILE_BOUNDS.speedMax) return 'speed';
  if (distanceOptimum <= PROFILE_BOUNDS.classicMax) return 'classic';
  if (distanceOptimum <= PROFILE_BOUNDS.middleMax) return 'middle';
  return 'cup';
}

/** 정규 분포 샘플을 능력 범위로 자른다. */
function sampleAbility(rng: Rng, mean: number, spread: number, offset = 0): number {
  return clamp(rng.normal(mean, spread) + offset, ABILITY_MIN, ABILITY_MAX);
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
 * 말 한 마리를 만든다. rng 사용 순서는 명세 규칙 1~7 순서이며 같은 시드·옵션이면 같은 결과다.
 * name 이 NAME_MAX_LENGTH 를 넘으면 RangeError.
 */
export function generateHorse(rng: Rng, opts: GenerateHorseOptions): Horse {
  if (opts.name.length > NAME_MAX_LENGTH) {
    throw new RangeError(`generateHorse: 이름이 ${NAME_MAX_LENGTH}자를 넘는다 (${opts.name})`);
  }
  const spread = opts.spread ?? DEFAULT_POTENTIAL_SPREAD;
  const staminaOffset =
    opts.distanceBias === undefined
      ? 0
      : (opts.distanceBias - STAMINA_BIAS_REF) / STAMINA_BIAS_DIVISOR;

  // 1. 잠재 능력
  const potential: Abilities = {
    speed: sampleAbility(rng, opts.level, spread),
    stamina: sampleAbility(rng, opts.level, spread, staminaOffset),
    acceleration: sampleAbility(rng, opts.level, spread),
    guts: sampleAbility(rng, opts.level, spread),
    power: sampleAbility(rng, opts.level, spread),
  };

  // 2. 성장형
  const growth = sampleGrowthProfile(rng);

  // 3. 현재 능력
  const ability = abilityAtAge(potential, opts.currentYear - opts.birthYear, growth);

  // 4. 적성 (distanceBias 가 있으면 평균·SD 만 바뀌고 rng 호출은 같은 위치에서 한 번이다)
  const distanceOptimum = clamp(
    opts.distanceBias === undefined
      ? DIST_OPT_BASE + DIST_OPT_PER_STAMINA * potential.stamina + rng.normal(0, DIST_OPT_SD)
      : opts.distanceBias + rng.normal(0, DIST_BIAS_SD),
    DIST_OPT_MIN,
    DIST_OPT_MAX,
  );
  const distanceRange = rng.range(DIST_RANGE_MIN, DIST_RANGE_MAX);
  const goingPreference = clamp(rng.normal(GOING_PREF_MEAN, GOING_PREF_SD), GOING_PREF_MIN, GOING_PREF_MAX);
  const goingTolerance = rng.range(GOING_TOL_MIN, GOING_TOL_MAX);
  const allWeather = clamp(
    rng.normal(0, SURFACE_APT_SD) + (opts.surfaceBias === 'aw' ? SURFACE_BIAS_BONUS : 0),
    APTITUDE_MIN,
    APTITUDE_MAX,
  );
  const dirt = clamp(
    rng.normal(0, SURFACE_APT_SD) + (opts.surfaceBias === 'dirt' ? SURFACE_BIAS_BONUS : 0),
    APTITUDE_MIN,
    APTITUDE_MAX,
  );
  const leftHanded = clamp(rng.normal(0, COURSE_APT_SD), APTITUDE_MIN, APTITUDE_MAX);
  const rightHanded = clamp(rng.normal(0, COURSE_APT_SD), APTITUDE_MIN, APTITUDE_MAX);
  const undulation = clamp(rng.normal(0, COURSE_APT_SD), APTITUDE_MIN, APTITUDE_MAX);

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

  // 5. 성격 → 선호 작전 (성격·능력에서 결정, fork 로 분리)
  const personality = generatePersonality(rng.fork('personality'));
  const preferredStyle = deriveStyle(personality, ability, rng.fork('style'));

  // 6. 건강도
  const soundness = sampleAbility(rng, SOUNDNESS_MEAN, SOUNDNESS_SD);

  // 7. 컨디션
  const condition: Condition = {
    fitness: DEFAULT_FITNESS,
    fatigue: 0,
    mental: sampleAbility(rng, MENTAL_MEAN, MENTAL_SD),
    injury: null,
  };

  // 8. 나머지 필드
  return {
    id: opts.id,
    name: opts.name,
    sex: opts.sex,
    gelded: false,
    birthYear: opts.birthYear,
    countryOfBirth: opts.countryOfBirth,
    status: opts.status,
    sireId: opts.sireId ?? null,
    damId: opts.damId ?? null,
    ownerId: opts.ownerId ?? null,
    breederId: opts.breederId ?? null,
    trainerId: null,
    ability,
    potential,
    growth,
    aptitude,
    preferredStyle,
    condition,
    officialRating: null,
    familyId: opts.familyId ?? null,
    sireLineId: opts.sireLineId ?? null,
    soundness,
    personality,
    coat: defaultCoat(),
    record: zeroRecord(),
  };
}

export interface HorseWords {
  adjectives: readonly string[];
  nouns: readonly string[];
}

/**
 * "Adjective Noun" 형태, NAME_MAX_LENGTH 이하, used 에 없는 이름을 만든다.
 * NAME_MAX_ATTEMPTS 번 무작위 조합이 실패하면 조합 순서를 섞어 " 2", " 3" … 접미사를 붙인다.
 * 반환 전 used 에 추가한다. 단어장이 모두 소진되면 RangeError.
 * 접미사는 숫자로 쓴다(로마자는 10,000개 규모에서 길이 제한을 넘는다).
 */
export function generateHorseName(rng: Rng, words: HorseWords, used: Set<string>): string {
  if (words.adjectives.length === 0 || words.nouns.length === 0) {
    throw new RangeError('generateHorseName: 단어장이 비어 있다');
  }

  for (let attempt = 0; attempt < NAME_MAX_ATTEMPTS; attempt++) {
    const candidate = `${rng.pick(words.adjectives)} ${rng.pick(words.nouns)}`;
    if (candidate.length <= NAME_MAX_LENGTH && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  // 접미사 단계: 접미사를 붙여도 길이 제한 안에 드는 조합만 대상으로 한다.
  const bases: string[] = [];
  for (const adj of words.adjectives) {
    for (const noun of words.nouns) {
      bases.push(`${adj} ${noun}`);
    }
  }
  const shuffled = rng.shuffle(bases);
  for (const base of shuffled) {
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (candidate.length > NAME_MAX_LENGTH) break;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  }

  throw new RangeError('generateHorseName: 단어장으로 만들 수 있는 이름이 남아 있지 않다');
}
