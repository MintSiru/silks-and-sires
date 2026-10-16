import {
  POPULATION_ABILITY_SPREAD,
  POPULATION_AGE_SHARES,
  POPULATION_COUNTRY_ORDER,
  POPULATION_DISTANCE_DEFAULT_MEDIAN,
  POPULATION_DISTANCE_SIRE_WEIGHT,
  POPULATION_FEMALE_SHARE,
  POPULATION_GELDING_MIN_AGE,
  POPULATION_GELDING_SHARE,
  POPULATION_IN_TRAINING,
  POPULATION_OWNER_TIER_WEIGHT,
  POPULATION_RATING_MIN_AGE,
  POPULATION_SIRE_SAME_COUNTRY_MULT,
  POPULATION_SIRE_TIER_WEIGHT,
  POPULATION_TIER_LEVEL,
  POPULATION_TRAINER_SKILL_FLOOR,
  type PopulationCountry,
} from '../config/population';
import { FOREIGN_OWNER_SHARE } from '../config/people';
import { STARTING_PACKAGES, STARTING_RACEHORSE_AGES } from '../config/farm';
import type { NewGameOptions } from '../state/newGame';
import {
  STARTER_ABILITY_LEVEL,
  STARTER_ABILITY_SPREAD,
  STARTER_COUNTRY,
  STARTER_FITNESS,
  STARTER_GROWTH_TYPE,
  STARTER_HORSES,
  STARTER_SIRE_TIER,
} from '../config/starter';
import {
  DAM_AGE_GAP_MAX,
  DAM_AGE_GAP_MIN,
  MARE_LEVEL,
  MARE_LEVEL_SPREAD,
  PROFILE_DISTANCE,
  TIER_FEE,
} from '../config/world';
import { GROWTH_DECLINE_RATE, GROWTH_PEAK_AGE } from '../config/horse';
import { generateHorse } from '../horse/generate';
import { abilityAtAge } from '../horse/growthCurve';
import { makeNameRegistry, namingContextFor, type MutableNameRegistry } from '../naming/context';
import { nameForHorse } from '../naming/generate';
import type { NamingData } from '../naming/types';
import { pickBreederFor } from '../people/breeders';
import { createRng } from '../rng';
import { sortStallionRecords } from '../state/stallionHorses';
import { allocateHorseId, pickWeightedSire } from '../state/world';
import type {
  GameState,
  Horse,
  HorseId,
  HorseStatus,
  Owner,
  OwnerId,
  RealStallionRecord,
  Rng,
  Sex,
  Trainer,
  TrainerId,
} from '../types';
import { initialOfficialRating } from './rating';
import { makeVirtualDam } from './virtualDam';
import { sirePoolFor, tierFromFee } from './sirePool';
import { coverYearForFoal, europeanSireWeightMult, filterSiresForCover } from './sireWindow';

/** 현역마 집단 생성·교체에 필요한 정적 데이터 */
export interface RacingPopulationStaticData {
  /** 실명 종마 레코드(data/stallions/stallions.json). 부(父) 후보는 active·pensioned */
  stallionRecords: readonly RealStallionRecord[];
  /** 이름 생성 데이터(마주 스타일·어휘·보호 명단 등) */
  naming: NamingData;
  /** 종마 key → 표시 이름(부·모 이름 연상에 쓴다) */
  stallionNames: Record<string, string>;
}

/** AI 현역마 상태. 'resting' 도 현역에 포함한다(부상·휴양 중인 현역마). */
const RACING_STATUSES: readonly HorseStatus[] = ['in_training', 'resting'];

/** 말 한 마리 기준 현재 나이(연도 차) */
export function ageOf(horse: Horse, year: number): number {
  return year - horse.birthYear;
}

/** AI 소속 현역마인가(플레이어 소유·무소속 제외) */
export function isRacingHorse(state: GameState, horse: Horse): boolean {
  return (
    RACING_STATUSES.includes(horse.status) &&
    horse.ownerId !== null &&
    horse.ownerId !== state.playerOwnerId
  );
}

/** AI 현역마 ID 목록(오름차순). 순회 순서를 고정해 결정성을 지킨다. */
export function racingHorseIds(state: GameState): HorseId[] {
  return Object.keys(state.horses)
    .sort()
    .filter((id) => {
      const horse = state.horses[id];
      return horse !== undefined && isRacingHorse(state, horse);
    });
}

/**
 * 비율 배열을 정수 두수로 나눈다(최대 나머지법). 합은 반드시 total 이 된다.
 * 나머지가 같으면 배열 순서가 앞선 쪽이 먼저 받는다. rng 를 쓰지 않는다.
 */
export function allocateCounts(total: number, shares: readonly { share: number }[]): number[] {
  const raw = shares.map((s) => total * s.share);
  const counts = raw.map((v) => Math.floor(v));
  let remaining = total - counts.reduce((sum, c) => sum + c, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
    remaining -= 1;
  }
  return counts;
}

/** 가중치 배열로 인덱스 하나를 고른다. rng.next() 를 정확히 1회 쓴다. */
export function pickWeightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) {
    throw new RangeError('pickWeightedIndex: 가중치 합이 0 이하다');
  }
  const target = rng.next() * total;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i] ?? 0;
    if (target < cumulative) return i;
  }
  return weights.length - 1;
}

/** 나라별 배정 상대(마주·조교사). 객체 참조는 state 의 레코드와 같다. */
export interface PopulationMarket {
  owners: Record<PopulationCountry, Owner[]>;
  /** FOREIGN_OWNER_SHARE 가 있는 나라만: 외국(마주 국적국) 마주 풀. 말이 뛰는 나라 기준 키 */
  foreignOwners: Partial<Record<PopulationCountry, Owner[]>>;
  trainers: Record<PopulationCountry, Trainer[]>;
  /** 조교사별 현재 현역마 두수 */
  load: Map<TrainerId, number>;
}

/** 나라별 AI 마주·조교사 목록(ID 오름차순)과 현재 조교사 부하를 만든다. 없는 나라면 Error. */
export function buildMarket(state: GameState): PopulationMarket {
  const owners = {} as Record<PopulationCountry, Owner[]>;
  const foreignOwners: Partial<Record<PopulationCountry, Owner[]>> = {};
  const trainers = {} as Record<PopulationCountry, Trainer[]>;
  const allOwners = Object.values(state.owners).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const allTrainers = Object.values(state.trainers).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const country of POPULATION_COUNTRY_ORDER) {
    const countryOwners = allOwners.filter((o) => !o.isPlayer && o.country === country);
    const countryTrainers = allTrainers.filter((t) => t.country === country);
    if (countryOwners.length === 0) {
      throw new Error(`현역마 집단: ${country} AI 마주가 없다(인물 초기화 필요)`);
    }
    if (countryTrainers.length === 0) {
      throw new Error(`현역마 집단: ${country} 조교사가 없다(인물 초기화 필요)`);
    }
    owners[country] = countryOwners;
    trainers[country] = countryTrainers;

    const foreign = FOREIGN_OWNER_SHARE[country];
    if (foreign !== undefined) {
      const foreignPool = allOwners.filter((o) => !o.isPlayer && o.country === foreign.country);
      if (foreignPool.length === 0) {
        throw new Error(`현역마 집단: ${foreign.country} 마주가 없다(외국 마주 배정 불가, 인물 초기화 필요)`);
      }
      foreignOwners[country] = foreignPool;
    }
  }

  const load = new Map<TrainerId, number>();
  for (const id of racingHorseIds(state)) {
    const horse = state.horses[id];
    if (horse?.trainerId) {
      load.set(horse.trainerId, (load.get(horse.trainerId) ?? 0) + 1);
    }
  }
  return { owners, foreignOwners, trainers, load };
}

/** 같은 나라 조교사 중 수용 여유가 남은 사람을 skill 가중으로 고르고 부하를 1 올린다. */
export function pickTrainer(rng: Rng, market: PopulationMarket, country: PopulationCountry): Trainer {
  const eligible = market.trainers[country].filter(
    (t) => (market.load.get(t.id) ?? 0) < t.capacity,
  );
  if (eligible.length === 0) {
    throw new RangeError(`현역마 집단: ${country} 조교사 수용 두수가 부족하다`);
  }
  const weights = eligible.map((t) => Math.max(t.skill, POPULATION_TRAINER_SKILL_FLOOR));
  const trainer = eligible[pickWeightedIndex(rng, weights)] as Trainer;
  market.load.set(trainer.id, (market.load.get(trainer.id) ?? 0) + 1);
  return trainer;
}

/**
 * 마주를 tier 가중으로 고른다. FOREIGN_OWNER_SHARE 가 있는 나라는 그 확률로 외국 마주 풀에서 고르고,
 * 나머지는 같은 나라 마주 풀에서 고른다. 외국 여부 판정에 rng.next() 를 1회 더 쓴다.
 */
function pickOwner(rng: Rng, market: PopulationMarket, country: PopulationCountry): Owner {
  const foreign = FOREIGN_OWNER_SHARE[country];
  const useForeign = foreign !== undefined && rng.chance(foreign.share);
  const pool = (useForeign ? market.foreignOwners[country] : undefined) ?? market.owners[country];
  const weights = pool.map((o) => POPULATION_OWNER_TIER_WEIGHT[o.tier]);
  return pool[pickWeightedIndex(rng, weights)] as Owner;
}

/**
 * 출생 연도 말의 교배 가능한 부(父) 후보(M2-03b): active·pensioned 이고, 교배 연도(birthYear − 1)가
 * 교배 가능 기간(sireWindow) 안이다. availableFromYear 가 있으면 그 이전 교배 연도는 제외한다(현역 생성 전용 규칙).
 * 기간 안 후보가 없으면 교배 연도와 가장 가까운 기간의 종마로 완화한다(filterSiresForCover).
 */
function sireCandidates(records: readonly RealStallionRecord[], birthYear: number): RealStallionRecord[] {
  const coverYear = coverYearForFoal(birthYear);
  const pool = records.filter(
    (r) =>
      (r.status === 'active' || r.status === 'pensioned') &&
      (r.availableFromYear === undefined || coverYear >= r.availableFromYear),
  );
  return filterSiresForCover(pool, coverYear);
}

/**
 * 부(父) 한 마리: marketTier 가중, 계류국이 같은 나라면 배수.
 * sireTier 가 주어지면 그 marketTier 후보로 먼저 한정한다(해당 후보가 없으면 제한 없이).
 */
function pickSire(
  rng: Rng,
  records: readonly RealStallionRecord[],
  birthYear: number,
  country: PopulationCountry,
  sireTier?: 1 | 2 | 3 | 4 | 5,
): RealStallionRecord {
  let candidates = sireCandidates(records, birthYear);
  if (sireTier !== undefined) {
    const tiered = candidates.filter((c) => c.marketTier === sireTier);
    if (tiered.length > 0) candidates = tiered;
  }
  if (candidates.length === 0) {
    throw new RangeError(`현역마 집단: 출생 ${birthYear}년 말의 교배 가능한 부(父)가 없다`);
  }
  const weights = candidates.map(
    (c) =>
      POPULATION_SIRE_TIER_WEIGHT[c.marketTier] *
      (c.standsIn === country ? POPULATION_SIRE_SAME_COUNTRY_MULT : 1) *
      europeanSireWeightMult(c),
  );
  return candidates[pickWeightedIndex(rng, weights)] as RealStallionRecord;
}

export interface RacingHorseSpec {
  country: PopulationCountry;
  birthYear: number;
  currentYear: number;
  sex: Sex;
  gelded: boolean;
  /** 주면 마주를 고르지 않고 이 마주(플레이어 등)를 쓴다. 이 경우 pickOwner 의 난수를 쓰지 않는다 */
  ownerId?: OwnerId;
  /** 주면 부 후보를 이 marketTier 로 한정한다(후보가 없으면 제한 없음) */
  sireTier?: 1 | 2 | 3 | 4 | 5;
  /** 지정 종마를 부로 쓴다. 부 선택 난수는 소비하지 않는다. */
  sireHorseId?: HorseId;
  /** 주면 잠재 능력 평균을 POPULATION_TIER_LEVEL[부 등급] 대신 이 값으로 쓴다(난수 사용 횟수는 같다) */
  levelOverride?: number;
  /** 주면 잠재 능력 표준편차를 POPULATION_ABILITY_SPREAD 대신 이 값으로 쓴다 */
  spreadOverride?: number;
}

/**
 * 현역마 한 마리를 만들어 state.horses 에 넣고 마주·조교사 연결을 갱신한다(state 직접 수정).
 * rng 사용 순서: 부 → 마주(ownerId 없을 때만) → 조교사 → 이름(nameForHorse) → 말 생성(generateHorse 내부).
 * 이름을 정하면 registry 에 등록한다.
 */
export function spawnRacingHorse(
  state: GameState,
  data: RacingPopulationStaticData,
  rng: Rng,
  market: PopulationMarket,
  registry: MutableNameRegistry,
  spec: RacingHorseSpec,
  records: readonly RealStallionRecord[],
): Horse {
  let sireId: HorseId;
  let sireLineId: Horse['sireLineId'];
  let tier: keyof typeof TIER_FEE;
  let sireDistance: number;
  if (spec.sireHorseId !== undefined) {
    const stallion = state.stallions[spec.sireHorseId];
    const sireHorse = state.horses[spec.sireHorseId];
    if (stallion === undefined || sireHorse === undefined) {
      throw new Error(`현역마 집단: 지정 종마 ${spec.sireHorseId} 가 없다`);
    }
    sireId = spec.sireHorseId;
    sireLineId = stallion.sireLineId;
    tier = tierFromFee(stallion.fee);
    sireDistance = sireHorse.aptitude.distanceOptimum;
  } else {
    const sire = pickSire(rng, sirePoolFor(state, records, coverYearForFoal(spec.birthYear)), spec.birthYear, spec.country, spec.sireTier);
    if (state.horses[sire.key] === undefined) {
      throw new Error(`현역마 집단: 부(父) ${sire.key} 가 세계 초기화(bootstrapWorld)에 없다`);
    }
    sireId = sire.key;
    sireLineId = sire.sireLineId;
    tier = sire.marketTier;
    sireDistance = state.stallions[sire.key]?.aiEntrant
      ? state.horses[sire.key]!.aptitude.distanceOptimum
      : PROFILE_DISTANCE[sire.distanceProfile];
  }
  let owner: Owner;
  if (spec.ownerId === undefined) {
    owner = pickOwner(rng, market, spec.country);
  } else {
    const given = state.owners[spec.ownerId];
    if (given === undefined) {
      throw new Error(`현역마 집단: 마주 ${spec.ownerId} 가 없다`);
    }
    owner = given;
  }
  const trainer = pickTrainer(rng, market, spec.country);

  const id = allocateHorseId(state);
  const naming = namingContextFor(state, { ownerId: owner.id, sireId, damId: null }, data);
  const name = nameForHorse(naming, data.naming, rng, registry);
  registry.add(name);
  const distanceBias =
    POPULATION_DISTANCE_SIRE_WEIGHT * sireDistance +
    (1 - POPULATION_DISTANCE_SIRE_WEIGHT) * POPULATION_DISTANCE_DEFAULT_MEDIAN;

  const horse = generateHorse(rng, {
    id,
    name,
    sex: spec.sex,
    birthYear: spec.birthYear,
    currentYear: spec.currentYear,
    countryOfBirth: spec.country,
    status: 'in_training',
    level: spec.levelOverride ?? POPULATION_TIER_LEVEL[tier],
    spread: spec.spreadOverride ?? POPULATION_ABILITY_SPREAD,
    sireId,
    damId: null,
    familyId: null,
    sireLineId,
    ownerId: owner.id,
    distanceBias,
  });
  horse.gelded = spec.sex === 'male' && spec.gelded;
  horse.trainerId = trainer.id;
  // 생산자(M4-C0): 오너브리더 또는 같은 나라 상업 생산자. 플레이어 마주의 말은 오너브리더 단계를 건너뛴다.
  horse.breederId = pickBreederFor(state, horse, owner.isPlayer ? null : owner);
  // 지급마는 ST2의 실제 모마를 따로 받는다.
  const virtualDam = owner.isPlayer ? null : makeVirtualDam(state, data, records, registry, horse, 'racing-dam', spec.country);
  if (virtualDam !== null) horse.virtualDam = virtualDam;

  owner.horseIds.push(id);
  state.horses[id] = horse;
  return horse;
}

/** 성별·거세 여부를 정한다. 거세는 4세 이상 수말에만 POPULATION_GELDING_SHARE 로 적용한다. rng.next() 를 쓴다. */
export function drawSexAndGelding(rng: Rng, age: number): { sex: Sex; gelded: boolean } {
  const sex: Sex = rng.chance(POPULATION_FEMALE_SHARE) ? 'female' : 'male';
  const gelded = sex === 'male' && age >= POPULATION_GELDING_MIN_AGE && rng.chance(POPULATION_GELDING_SHARE);
  return { sex, gelded };
}

/** 초기 집단: 나라별 나이 분포대로 말을 만든다. 3세 이상에는 OR 을 붙인다. */
export function bootstrapRacingPopulation(
  state: GameState,
  data: RacingPopulationStaticData,
  rng: Rng,
): GameState {
  if (racingHorseIds(state).length > 0) {
    throw new Error('bootstrapRacingPopulation: 이미 AI 소속 현역마가 있다(이중 초기화)');
  }
  const next = structuredClone(state);
  const currentYear = next.date.year;
  const market = buildMarket(next);
  const registry = makeNameRegistry(next);
  const records = sortStallionRecords(data.stallionRecords);

  for (const country of POPULATION_COUNTRY_ORDER) {
    const counts = allocateCounts(POPULATION_IN_TRAINING[country], POPULATION_AGE_SHARES);
    POPULATION_AGE_SHARES.forEach((entry, idx) => {
      const count = counts[idx] ?? 0;
      for (let i = 0; i < count; i++) {
        const age = entry.age;
        const { sex, gelded } = drawSexAndGelding(rng, age);
        const horse = spawnRacingHorse(
          next,
          data,
          rng,
          market,
          registry,
          { country, birthYear: currentYear - age, currentYear, sex, gelded },
          records,
        );
        if (age >= POPULATION_RATING_MIN_AGE) {
          horse.officialRating = initialOfficialRating(horse);
        }
      }
    });
  }

  return next;
}

/**
 * 지급마 한 마리의 가상 모마를 만들어 state.horses 에 넣고, 지급마의 damId·familyId 를 모마 id 로 잇는다(M4-ST2).
 * 모마는 기초 암말의 어미(world.ts c 단계)와 같은 규칙: 출생 연도 = 지급마 출생 연도 − gap,
 * 부 = 교배 연도(모마 출생 연도 − 1)에 교배 가능한 전체 실명 종마 중 가중 선택, status historical, 소유 없음.
 * 난수는 `${initialSeed}:starter-dam:${horse.id}` 독립 스트림만 쓴다.
 */
function attachStarterDam(
  state: GameState,
  data: RacingPopulationStaticData,
  records: readonly RealStallionRecord[],
  registry: MutableNameRegistry,
  horse: Horse,
  homeCountry?: PopulationCountry,
): void {
  const rng = createRng(`${state.initialSeed}:starter-dam:${horse.id}`);
  const currentYear = state.date.year;
  const gap = rng.int(DAM_AGE_GAP_MIN, DAM_AGE_GAP_MAX);
  const damBirth = horse.birthYear - gap;
  const damSireRec = pickWeightedSire(rng, filterSiresForCover(records, coverYearForFoal(damBirth)), homeCountry);
  const damId = allocateHorseId(state);
  const damNaming = namingContextFor(state, { ownerId: null, sireId: damSireRec.key, damId: null }, data);
  const damName = nameForHorse(damNaming, data.naming, rng, registry);
  registry.add(damName);
  const dam: Horse = generateHorse(rng, {
    id: damId,
    name: damName,
    sex: 'female',
    birthYear: damBirth,
    currentYear,
    countryOfBirth: horse.countryOfBirth,
    status: 'historical',
    level: MARE_LEVEL,
    spread: MARE_LEVEL_SPREAD,
    sireId: damSireRec.key,
    damId: null,
    familyId: damId,
    sireLineId: damSireRec.sireLineId,
  });
  state.horses[dam.id] = dam;
  horse.damId = dam.id;
  horse.familyId = dam.id;
}

/**
 * 새 게임 시작 현역마를 플레이어 마주에게 지급한다(STARTER_HORSES 두수·나이 대로, state 직접 수정).
 * 조교사는 spawnRacingHorse 가 고른 GB 조교사, 부는 STARTER_SIRE_TIER 종마 중에서 고른다.
 * breederId 는 같은 나라 상업 생산자(M4-C0, 생산자가 없으면 null). 3세 이상에는 초기 OR, 전 두수 fitness = STARTER_FITNESS.
 * 반환값은 지급한 말 ID 목록(지급 순서).
 */
export function grantStarterHorses(
  state: GameState,
  data: RacingPopulationStaticData,
  rng: Rng,
  options: Pick<NewGameOptions, 'difficulty' | 'grantRacehorses'> = {},
): HorseId[] {
  const currentYear = state.date.year;
  const market = buildMarket(state);
  const registry = makeNameRegistry(state);
  const records = sortStallionRecords(data.stallionRecords);
  const granted: HorseId[] = [];

  const start = options.difficulty === undefined ? undefined : STARTING_PACKAGES[options.difficulty];
  const isOwner = state.settings.startType === 'owner';
  const count = start === undefined ? 0 : isOwner ? start.ownerRacehorses
    : options.grantRacehorses === false ? 0 : start.breederRacehorses;
  const groups = start === undefined ? STARTER_HORSES
    : STARTING_RACEHORSE_AGES.slice(0, count).map((age) => ({ age, count: 1 }));
  const homeCountry = start === undefined ? undefined : (state.farm.country ?? state.owners[state.playerOwnerId]!.country) as PopulationCountry;
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      const { sex, gelded } = drawSexAndGelding(rng, group.age);
      const horse = spawnRacingHorse(
        state,
        data,
        rng,
        market,
        registry,
        {
          country: homeCountry ?? STARTER_COUNTRY,
          birthYear: currentYear - group.age,
          currentYear,
          sex,
          gelded,
          ownerId: state.playerOwnerId,
          sireTier: STARTER_SIRE_TIER,
          levelOverride: STARTER_ABILITY_LEVEL[group.age],
          spreadOverride: STARTER_ABILITY_SPREAD,
        },
        records,
      );
      // 생산자(M4-C0): 오너브리더 규칙 없이 같은 나라 상업 생산자(없으면 null)
      horse.breederId = pickBreederFor(state, horse, null);
      // 지급마는 나이별로 성장형을 고정한다(M4-ST1, 2026-10-15 Opus): 무작위면 3세 시작 OR 이 62~140 으로 갈려
      // '중상급 경주를 이길 정도'를 보장할 수 없다. 생성 뒤 덮어쓰므로 난수 사용은 그대로다.
      const growthType = STARTER_GROWTH_TYPE[group.age] ?? 'normal';
      horse.growth = { type: growthType, peakAge: GROWTH_PEAK_AGE[growthType], declineRate: GROWTH_DECLINE_RATE[growthType] };
      horse.ability = abilityAtAge(horse.potential, group.age, horse.growth);
      horse.condition.fitness = STARTER_FITNESS;
      if (group.age >= POPULATION_RATING_MIN_AGE) {
        horse.officialRating = initialOfficialRating(horse);
      }
      granted.push(horse.id);
    }
  }

  // M4-ST2: 모든 지급을 마친 뒤 지급 순서대로 지급마 전부(성별 무관)에 가상 모마를 붙인다.
  for (const id of granted) {
    const horse = state.horses[id];
    if (horse !== undefined) {
      attachStarterDam(state, data, records, registry, horse, homeCountry);
    }
  }

  return granted;
}

