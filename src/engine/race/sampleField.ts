import { neutralPersonality } from '../horse/traits';
import type {
  Abilities,
  Aptitudes,
  Condition,
  HexColor,
  Rng,
  RunnerInput,
  RunningStyle,
  Sex,
  Silks,
  Surface,
} from '../types';
import type { EntryRequest } from './setup';
import {
  SAMPLE_ABILITY_MAX,
  SAMPLE_ABILITY_MIN,
  SAMPLE_ABILITY_SD,
  SAMPLE_AGE_RANGE,
  SAMPLE_APPRENTICE_ALLOWANCES_LB,
  SAMPLE_APPRENTICE_RATE,
  SAMPLE_APTITUDE_LIMIT,
  SAMPLE_AW_APT_SD,
  SAMPLE_BASE_WEIGHT_LB,
  SAMPLE_COURSE_APT_SD,
  SAMPLE_DEFAULT_LEVEL,
  SAMPLE_DEFAULT_LEVEL_SPREAD,
  SAMPLE_DIRT_APT_SD,
  SAMPLE_DISTANCE_OPT_MAX,
  SAMPLE_DISTANCE_OPT_MIN,
  SAMPLE_DISTANCE_OPT_SD,
  SAMPLE_DISTANCE_RANGE_MAX,
  SAMPLE_DISTANCE_RANGE_MIN,
  SAMPLE_FATIGUE_RANGE,
  SAMPLE_FEMALE_RATE,
  SAMPLE_FITNESS_RANGE,
  SAMPLE_GELDING_RATE,
  SAMPLE_GOING_PREF_MAX,
  SAMPLE_GOING_PREF_MIN,
  SAMPLE_GOING_TOL_MAX,
  SAMPLE_GOING_TOL_MIN,
  SAMPLE_JOCKEY_SKILL_MEAN,
  SAMPLE_JOCKEY_SKILL_SD,
  SAMPLE_MENTAL_RANGE,
  SAMPLE_STAMINA_AT_MAX_DIST,
  SAMPLE_STAMINA_AT_MIN_DIST,
  SAMPLE_STAMINA_LEVEL_WEIGHT,
  SAMPLE_STAMINA_MAX_DIST,
  SAMPLE_STAMINA_MIN_DIST,
  SAMPLE_STAMINA_SD,
  SAMPLE_STYLE_WEIGHTS,
  SILKS_PALETTE,
  SILKS_PATTERNS,
} from '../config/raceday';

export interface NamePool {
  horses: readonly string[];
  jockeys: readonly string[];
  owners: readonly string[];
}

export interface SampleFieldOptions {
  size: number;
  distance: number;
  surface: Surface;
  year: number;
  namePool: NamePool;
  /** 기본 SAMPLE_DEFAULT_LEVEL */
  level?: number;
  /** 기본 SAMPLE_DEFAULT_LEVEL_SPREAD */
  levelSpread?: number;
  /** 지정 시 그 index 의 isPlayer = true. 기본 null */
  playerIndex?: number | null;
}

export interface SampleField {
  /** index = runner index */
  runners: Omit<RunnerInput, 'entry'>[];
  requests: EntryRequest[];
  /** index = runner index */
  ownerNames: string[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 거리 선형 보간 스태미나 목표. 범위 밖은 끝값. */
function staminaTarget(distance: number): number {
  const t = clamp(
    (distance - SAMPLE_STAMINA_MIN_DIST) / (SAMPLE_STAMINA_MAX_DIST - SAMPLE_STAMINA_MIN_DIST),
    0,
    1,
  );
  return SAMPLE_STAMINA_AT_MIN_DIST + (SAMPLE_STAMINA_AT_MAX_DIST - SAMPLE_STAMINA_AT_MIN_DIST) * t;
}

/** 누적 확률로 작전 1개 선택 (rng.next() 1회). */
function pickStyle(rng: Rng): RunningStyle {
  const r = rng.next();
  const styles = Object.keys(SAMPLE_STYLE_WEIGHTS) as RunningStyle[];
  let cumulative = 0;
  let last: RunningStyle = 'midfield';
  for (const style of styles) {
    cumulative += SAMPLE_STYLE_WEIGHTS[style];
    last = style;
    if (r < cumulative) {
      return style;
    }
  }
  return last;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`at: 인덱스 범위 밖 (${index})`);
  }
  return item;
}

function sampleAbility(lv: number, rng: Rng): number {
  return clamp(lv + rng.normal(0, SAMPLE_ABILITY_SD), SAMPLE_ABILITY_MIN, SAMPLE_ABILITY_MAX);
}

/**
 * 샘플 출주마 필드 생성. 같은 rng 상태 + 같은 opts 면 결과가 완전히 같다.
 * RNG 소비 순서: 이름 shuffle(horses, jockeys, owners) → 팔레트 shuffle → 말 루프(i = 0..size-1).
 */
export function generateSampleField(rng: Rng, opts: SampleFieldOptions): SampleField {
  const { size, distance, year, namePool } = opts;
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`generateSampleField: size 는 1 이상의 정수여야 한다 (받은 값: ${size})`);
  }
  if (namePool.horses.length < size || namePool.jockeys.length < size || namePool.owners.length < size) {
    throw new RangeError('generateSampleField: 이름 풀이 size 보다 작다');
  }
  const playerIndex = opts.playerIndex ?? null;
  if (playerIndex !== null && (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= size)) {
    throw new RangeError(`generateSampleField: playerIndex 범위 밖 (${playerIndex})`);
  }
  const level = opts.level ?? SAMPLE_DEFAULT_LEVEL;
  const levelSpread = opts.levelSpread ?? SAMPLE_DEFAULT_LEVEL_SPREAD;

  const horseNames = rng.shuffle(namePool.horses).slice(0, size);
  const jockeyNames = rng.shuffle(namePool.jockeys).slice(0, size);
  const ownerNames = rng.shuffle(namePool.owners).slice(0, size);
  const palette: HexColor[] = rng.shuffle(SILKS_PALETTE);
  const paletteLen = palette.length;

  const runners: Omit<RunnerInput, 'entry'>[] = [];
  const requests: EntryRequest[] = [];

  for (let i = 0; i < size; i++) {
    const horseId = `sample-h-${i + 1}`;
    const jockeyId = `sample-j-${i + 1}`;

    // --- 능력치 ---
    const lv = rng.normal(level, levelSpread);
    const speed = sampleAbility(lv, rng);
    const acceleration = sampleAbility(lv, rng);
    const guts = sampleAbility(lv, rng);
    const power = sampleAbility(lv, rng);
    const stamina = clamp(
      staminaTarget(distance) +
        (lv - level) * SAMPLE_STAMINA_LEVEL_WEIGHT +
        rng.normal(0, SAMPLE_STAMINA_SD),
      SAMPLE_ABILITY_MIN,
      SAMPLE_ABILITY_MAX,
    );
    const ability: Abilities = { speed, stamina, acceleration, guts, power };

    // --- 적성 ---
    const distanceOptimum = clamp(
      distance + rng.normal(0, SAMPLE_DISTANCE_OPT_SD),
      SAMPLE_DISTANCE_OPT_MIN,
      SAMPLE_DISTANCE_OPT_MAX,
    );
    const distanceRange = rng.range(SAMPLE_DISTANCE_RANGE_MIN, SAMPLE_DISTANCE_RANGE_MAX);
    const goingPreference = rng.range(SAMPLE_GOING_PREF_MIN, SAMPLE_GOING_PREF_MAX);
    const goingTolerance = rng.range(SAMPLE_GOING_TOL_MIN, SAMPLE_GOING_TOL_MAX);
    const allWeather = clamp(
      rng.normal(0, SAMPLE_AW_APT_SD),
      -SAMPLE_APTITUDE_LIMIT,
      SAMPLE_APTITUDE_LIMIT,
    );
    const dirt = clamp(
      rng.normal(0, SAMPLE_DIRT_APT_SD),
      -SAMPLE_APTITUDE_LIMIT,
      SAMPLE_APTITUDE_LIMIT,
    );
    const leftHanded = clamp(
      rng.normal(0, SAMPLE_COURSE_APT_SD),
      -SAMPLE_APTITUDE_LIMIT,
      SAMPLE_APTITUDE_LIMIT,
    );
    const rightHanded = clamp(
      rng.normal(0, SAMPLE_COURSE_APT_SD),
      -SAMPLE_APTITUDE_LIMIT,
      SAMPLE_APTITUDE_LIMIT,
    );
    const undulation = clamp(
      rng.normal(0, SAMPLE_COURSE_APT_SD),
      -SAMPLE_APTITUDE_LIMIT,
      SAMPLE_APTITUDE_LIMIT,
    );
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

    // --- 작전 / 컨디션 ---
    const preferredStyle = pickStyle(rng);
    const condition: Condition = {
      fitness: rng.range(SAMPLE_FITNESS_RANGE[0], SAMPLE_FITNESS_RANGE[1]),
      fatigue: rng.range(SAMPLE_FATIGUE_RANGE[0], SAMPLE_FATIGUE_RANGE[1]),
      mental: rng.range(SAMPLE_MENTAL_RANGE[0], SAMPLE_MENTAL_RANGE[1]),
      injury: null,
    };

    // --- 성별 / 나이 ---
    const sex: Sex = rng.chance(SAMPLE_FEMALE_RATE) ? 'female' : 'male';
    if (sex === 'male') {
      // 거세 여부 추첨. RunnerInput.horse 에 gelded 필드가 없어 결과는 버린다(명세의 RNG 소비 순서 유지).
      rng.chance(SAMPLE_GELDING_RATE);
    }
    const birthYear = year - rng.int(SAMPLE_AGE_RANGE[0], SAMPLE_AGE_RANGE[1]);

    // --- 기수 ---
    const jockeySkill = clamp(
      rng.normal(SAMPLE_JOCKEY_SKILL_MEAN, SAMPLE_JOCKEY_SKILL_SD),
      SAMPLE_ABILITY_MIN,
      SAMPLE_ABILITY_MAX,
    );
    const jockeyAllowanceLb = rng.chance(SAMPLE_APPRENTICE_RATE)
      ? rng.pick(SAMPLE_APPRENTICE_ALLOWANCES_LB)
      : 0;

    // --- 승부복 ---
    // 팔레트 원소는 모두 서로 다르므로 색 비교 = 인덱스 비교.
    const primary = at(palette, i % paletteLen);
    let secondaryIndex = (i + 1 + rng.int(0, paletteLen - 2)) % paletteLen;
    let secondary = at(palette, secondaryIndex);
    if (secondary === primary) {
      secondaryIndex = (secondaryIndex + 1) % paletteLen;
      secondary = at(palette, secondaryIndex);
    }
    const silks: Silks = { primary, secondary, pattern: rng.pick(SILKS_PATTERNS) };

    const horseName = at(horseNames, i);
    runners.push({
      horse: {
        id: horseId,
        name: horseName,
        sex,
        birthYear,
        ability,
        aptitude,
        condition,
        preferredStyle,
        personality: neutralPersonality(),
      },
      jockey: {
        id: jockeyId,
        name: at(jockeyNames, i),
        skill: jockeySkill,
      },
    });

    requests.push({
      horseId,
      jockeyId,
      tactic: preferredStyle,
      silks,
      isPlayer: playerIndex === i,
      weightLb: SAMPLE_BASE_WEIGHT_LB,
      jockeyAllowanceLb,
    });
  }

  return { runners, requests, ownerNames };
}
