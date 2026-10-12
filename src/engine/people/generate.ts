import {
  APPRENTICE_ALLOWANCE_LB,
  FACILITY_GRADE_MAX,
  FACILITY_GRADE_MIN,
  JOCKEY_AGE_MAX,
  JOCKEY_AGE_MIN,
  JOCKEY_APPRENTICE_AGE_MAX,
  JOCKEY_APPRENTICE_CHANCE,
  JOCKEY_FOREIGN_NAME_CHANCE,
  JOCKEY_PREFERRED_STYLE_NONE_CHANCE,
  JOCKEY_RIDING_WEIGHT_MAX_LB,
  JOCKEY_RIDING_WEIGHT_MIN_LB,
  JOCKEY_SKILL_MEAN,
  JOCKEY_SKILL_SD,
  NAME_PREFIX_MAX_LENGTH,
  NAME_PREFIX_MIN_LENGTH,
  OWNER_FUNDS_RANGE,
  OWNER_NAME_PREFIX_CHANCE,
  OWNER_STUD_CHANCE,
  OWNER_TIER_ORDER,
  OWNER_TIER_WEIGHTS,
  OWNER_TIER_WEIGHTS_BY_COUNTRY,
  PERSON_ABILITY_MAX,
  PERSON_ABILITY_MIN,
  PERSON_FEMALE_CHANCE,
  SILK_CONTRAST_MIN,
  SILK_MAX_ATTEMPTS,
  SILK_PALETTE,
  SILK_PATTERNS,
  TRAINER_AGE_MAX,
  TRAINER_EYE_MAX,
  TRAINER_EYE_MIN,
  TRAINER_AGE_MIN,
  TRAINER_BIAS_STYLE_THRESHOLD,
  TRAINER_CAPACITY_MAX,
  TRAINER_CAPACITY_MIN,
  TRAINER_JUVENILE_STYLE_MIN,
  TRAINER_PATIENT_CHANCE,
  TRAINER_SKILL_MEAN,
  TRAINER_SKILL_SD,
  TRAINER_STAMINA_BIAS_LIMIT,
  TRAINER_STAMINA_BIAS_SD,
  WEEKLY_FEE_PER_FACILITY_GRADE,
  STUD_WORDS_BEFORE_NAME,
} from '../config/people';
import type {
  CountryCode,
  Jockey,
  JockeyAbilities,
  JockeyId,
  Money,
  Owner,
  OwnerId,
  OwnerPersona,
  OwnerTier,
  Rng,
  RunningStyle,
  Silks,
  Trainer,
  TrainerId,
  TrainerStyle,
} from '../types';
import {
  NAME_COUNTRIES,
  generatePersonName,
  isNameCountry,
  normalizeFullName,
  type NameCountry,
  type NamePools,
  type PersonSex,
} from './names';

/** 지명·야드·목장 재료(data/people/places.json, 엔진 표기로 변환된 형태) */
export interface PlacesData {
  yardWords: readonly string[];
  studSuffixes: Record<NameCountry, readonly string[]>;
  regionNames: Record<NameCountry, readonly string[]>;
}

/** 인물 생성에 필요한 정적 데이터 묶음(staticData.getPeopleData 가 만든다) */
export interface PeopleStaticData {
  pools: NamePools;
  /** 차단 목록(성+이름 전체 이름). 원문 그대로 둔다. createPeopleContext 가 정규화한다. */
  blockedNames: readonly string[];
  places: PlacesData;
}

export type PeopleRole = 'jockey' | 'trainer' | 'owner';

/**
 * 생성 세션 문맥. generate* 함수가 usedNames·usedSilks 에 새 항목을 추가한다.
 * 같은 세션(같은 ctx)에서 역할별 인명 중복과 마주 승부복 중복을 막는다.
 */
export interface PeopleContext {
  pools: NamePools;
  places: PlacesData;
  /** 정규화된 차단 조합 */
  blocked: ReadonlySet<string>;
  /** 나이·출생 연도 계산 기준 연도 */
  currentYear: number;
  /** 역할별 사용 중 인명(정규화) */
  usedNames: Record<PeopleRole, Set<string>>;
  /** 마주 승부복 조합 키 "primary|secondary|pattern" */
  usedSilks: Set<string>;
  /** 관명 접두어 후보(yard_words 중 길이 조건을 만족하는 단어) */
  prefixWords: readonly string[];
}

const RUNNING_STYLES: readonly RunningStyle[] = ['front', 'prominent', 'midfield', 'held_up'];

/** 생성 문맥을 만든다. 차단 목록은 여기서 정규화한다. */
export function createPeopleContext(data: PeopleStaticData, currentYear: number): PeopleContext {
  const prefixWords = data.places.yardWords.filter(
    (w) => w.length >= NAME_PREFIX_MIN_LENGTH && w.length <= NAME_PREFIX_MAX_LENGTH,
  );
  if (prefixWords.length === 0) {
    throw new RangeError('createPeopleContext: 관명 접두어 후보가 없다');
  }
  return {
    pools: data.pools,
    places: data.places,
    blocked: new Set(data.blockedNames.map(normalizeFullName)),
    currentYear,
    usedNames: { jockey: new Set(), trainer: new Set(), owner: new Set() },
    usedSilks: new Set(),
    prefixWords,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 이름 풀이 없는 국가 코드면 RangeError */
function requireNameCountry(country: CountryCode): NameCountry {
  if (!isNameCountry(country)) {
    throw new RangeError(`인물 생성: 이름 풀이 없는 국가 ${country}`);
  }
  return country;
}

function pickSex(rng: Rng): PersonSex {
  return rng.chance(PERSON_FEMALE_CHANCE) ? 'female' : 'male';
}

/** 능력 샘플: N(mean, sd) 를 [0, 100] 으로 자른다 */
function sampleAbility(rng: Rng, mean: number, sd: number): number {
  return clamp(rng.normal(mean, sd), PERSON_ABILITY_MIN, PERSON_ABILITY_MAX);
}

/** 기수 한 명. skill 은 네 능력의 평균이다. country 는 자국, 이름만 다른 국가 풀에서 뽑을 수 있다. */
export function generateJockey(rng: Rng, ctx: PeopleContext, id: JockeyId, country: CountryCode): Jockey {
  const home = requireNameCountry(country);

  const apprentice = rng.chance(JOCKEY_APPRENTICE_CHANCE);
  const age = apprentice
    ? rng.int(JOCKEY_AGE_MIN, JOCKEY_APPRENTICE_AGE_MAX)
    : rng.int(JOCKEY_APPRENTICE_AGE_MAX + 1, JOCKEY_AGE_MAX);
  const apprenticeAllowanceLb = apprentice ? rng.pick(APPRENTICE_ALLOWANCE_LB) : 0;
  const minRidingWeightLb = rng.int(JOCKEY_RIDING_WEIGHT_MIN_LB, JOCKEY_RIDING_WEIGHT_MAX_LB);

  const abilities: JockeyAbilities = {
    start: sampleAbility(rng, JOCKEY_SKILL_MEAN, JOCKEY_SKILL_SD),
    pace: sampleAbility(rng, JOCKEY_SKILL_MEAN, JOCKEY_SKILL_SD),
    finish: sampleAbility(rng, JOCKEY_SKILL_MEAN, JOCKEY_SKILL_SD),
    strength: sampleAbility(rng, JOCKEY_SKILL_MEAN, JOCKEY_SKILL_SD),
  };
  const skill = (abilities.start + abilities.pace + abilities.finish + abilities.strength) / 4;

  const preferredStyle = rng.chance(JOCKEY_PREFERRED_STYLE_NONE_CHANCE) ? null : rng.pick(RUNNING_STYLES);

  const nameCountry =
    rng.chance(JOCKEY_FOREIGN_NAME_CHANCE)
      ? rng.pick(NAME_COUNTRIES.filter((c) => c !== home))
      : home;
  const name = generatePersonName(rng, ctx.pools, nameCountry, pickSex(rng), ctx.usedNames.jockey, ctx.blocked);

  return {
    id,
    name,
    country,
    birthYear: ctx.currentYear - age,
    skill,
    minRidingWeightLb,
    apprenticeAllowanceLb,
    retainedBy: null,
    abilities,
    preferredStyle,
    retired: false,
  };
}

/** 조교사 성향. 우선순위: 2세 성향 → 스태미나 편향 → 스피드 편향 → 나머지는 확률로 patient/all_round */
function pickTrainerStyle(rng: Rng, staminaBias: number, juvenileFocus: number): TrainerStyle {
  if (juvenileFocus >= TRAINER_JUVENILE_STYLE_MIN) return 'early_juveniles';
  if (staminaBias >= TRAINER_BIAS_STYLE_THRESHOLD) return 'stayers';
  if (staminaBias <= -TRAINER_BIAS_STYLE_THRESHOLD) return 'sprinters';
  return rng.chance(TRAINER_PATIENT_CHANCE) ? 'patient' : 'all_round';
}

/** 조교사 한 명. 야드 이름 = 지역명 + yard_words. */
/**
 * 조교사 상마안(M4-B2). 기존 생성 난수 흐름을 바꾸지 않도록 ID 문자열 해시(FNV-1a)로 결정적으로 정한다.
 * 저장 이주(v8 → v9)도 같은 함수를 쓴다.
 */
export function trainerEyeFromId(id: TrainerId): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TRAINER_EYE_MIN + (h % (TRAINER_EYE_MAX - TRAINER_EYE_MIN + 1));
}

export function generateTrainer(rng: Rng, ctx: PeopleContext, id: TrainerId, country: CountryCode): Trainer {
  const home = requireNameCountry(country);

  const age = rng.int(TRAINER_AGE_MIN, TRAINER_AGE_MAX);
  const skill = clamp(rng.normal(TRAINER_SKILL_MEAN, TRAINER_SKILL_SD), PERSON_ABILITY_MIN, PERSON_ABILITY_MAX);
  const skillRatio = (skill - PERSON_ABILITY_MIN) / (PERSON_ABILITY_MAX - PERSON_ABILITY_MIN);
  const capacity = Math.round(TRAINER_CAPACITY_MIN + (TRAINER_CAPACITY_MAX - TRAINER_CAPACITY_MIN) * skillRatio);
  const facilityGrade = rng.int(FACILITY_GRADE_MIN, FACILITY_GRADE_MAX);
  const weeklyFee: Money = facilityGrade * WEEKLY_FEE_PER_FACILITY_GRADE;
  const staminaBias = clamp(
    rng.normal(0, TRAINER_STAMINA_BIAS_SD),
    -TRAINER_STAMINA_BIAS_LIMIT,
    TRAINER_STAMINA_BIAS_LIMIT,
  );
  const juvenileFocus = rng.next();
  const style = pickTrainerStyle(rng, staminaBias, juvenileFocus);

  const name = generatePersonName(rng, ctx.pools, home, pickSex(rng), ctx.usedNames.trainer, ctx.blocked);
  const region = rng.pick(ctx.places.regionNames[home]);
  const yardName = `${region} ${rng.pick(ctx.places.yardWords)}`;

  return {
    id,
    name,
    country,
    yardName,
    region,
    facilityGrade,
    style,
    skill,
    weeklyFee,
    capacity,
    birthYear: ctx.currentYear - age,
    staminaBias,
    juvenileFocus,
    eye: trainerEyeFromId(id),
  };
}

/** 나라별 마주 규모 확률표. 나라별 가중치가 없으면 OWNER_TIER_WEIGHTS. */
function ownerTierWeights(country: CountryCode): Readonly<Record<OwnerTier, number>> {
  const byCountry: Partial<Record<CountryCode, Readonly<Record<OwnerTier, number>>>> = OWNER_TIER_WEIGHTS_BY_COUNTRY;
  return byCountry[country] ?? OWNER_TIER_WEIGHTS;
}

/** 마주 규모 확률표(나라별 또는 OWNER_TIER_WEIGHTS)로 한 번 뽑는다. rng.next() 를 정확히 1회 쓴다. */
function pickOwnerTier(rng: Rng, country: CountryCode): OwnerTier {
  const weights = ownerTierWeights(country);
  const u = rng.next();
  let cumulative = 0;
  for (const tier of OWNER_TIER_ORDER) {
    cumulative += weights[tier];
    if (u < cumulative) return tier;
  }
  return OWNER_TIER_ORDER[OWNER_TIER_ORDER.length - 1] as OwnerTier;
}

/** 승부복: 서로 대비되는 색 두 개 + 패턴. 마주끼리 (primary, secondary, pattern) 중복은 막는다. */
function sampleSilks(rng: Rng, ctx: PeopleContext): Silks {
  for (let attempt = 0; attempt < SILK_MAX_ATTEMPTS; attempt++) {
    const primary = rng.pick(SILK_PALETTE);
    const secondary = rng.pick(
      SILK_PALETTE.filter((c) => c !== primary && colorDistance(c, primary) >= SILK_CONTRAST_MIN),
    );
    const pattern = rng.pick(SILK_PATTERNS);
    const key = `${primary}|${secondary}|${pattern}`;
    if (ctx.usedSilks.has(key)) continue;
    ctx.usedSilks.add(key);
    return { primary, secondary, pattern };
  }
  throw new Error(`sampleSilks: 중복 없는 승부복 조합을 ${SILK_MAX_ATTEMPTS}회 안에 찾지 못했다`);
}

/** '#rrggbb' 두 색의 RGB 유클리드 거리 */
function colorDistance(a: string, b: string): number {
  const channels = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/** 생산목장 이름 = 지역명 + 국가별 stud_suffixes (프·독·이·포어식 단어는 지명 앞) */
export function makeStudName(rng: Rng, ctx: PeopleContext, home: NameCountry): string {
  const base = rng.pick(ctx.places.regionNames[home]);
  const suffix = rng.pick(ctx.places.studSuffixes[home]);
  return STUD_WORDS_BEFORE_NAME.has(suffix) ? `${suffix} ${base}` : `${base} ${suffix}`;
}

/** 마주 한 명. 승부복·재정·성향은 tier 에 따라 뽑는다. */
export function generateOwner(rng: Rng, ctx: PeopleContext, id: OwnerId, country: CountryCode): Owner {
  const home = requireNameCountry(country);

  const tier = pickOwnerTier(rng, country);
  const name = generatePersonName(rng, ctx.pools, home, pickSex(rng), ctx.usedNames.owner, ctx.blocked);
  const silks = sampleSilks(rng, ctx);

  const range = OWNER_FUNDS_RANGE[tier];
  const funds: Money = rng.int(range.min, range.max);

  const studName = rng.chance(OWNER_STUD_CHANCE[tier]) ? makeStudName(rng, ctx, home) : null;
  const namePrefix = rng.chance(OWNER_NAME_PREFIX_CHANCE[tier]) ? rng.pick(ctx.prefixWords) : null;

  const persona: OwnerPersona = {
    commercial: rng.next(),
    prestige: rng.next(),
    patience: rng.next(),
  };

  return {
    id,
    name,
    country,
    isPlayer: false,
    silks,
    funds,
    studName,
    retainedJockeyId: null,
    horseIds: [],
    tier,
    persona,
    namePrefix,
  };
}
