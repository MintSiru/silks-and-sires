import {
  BASE_WEIGHT_LB,
  CLASS_TOTAL_PRIZE,
  DISTANCE_BUCKETS,
  HANDICAP_BASE_WEIGHT_LB,
  HANDICAP_OR_RANGE,
  MAIDEN_TOTAL_PRIZE,
  MAX_RUNNERS_CONDITIONS,
  MAX_RUNNERS_HANDICAP,
  MAX_RUNNERS_HANDICAP_TOP,
  MAX_RUNNERS_HANDICAP_TOP_CLASS,
  NOVICE_TOTAL_PRIZE,
  PRIZE_SHARES,
  TWO_YO_CAP_EARLY_M,
  TWO_YO_CAP_LATE_M,
  TWO_YO_CAP_START_MONTH,
  TWO_YO_FROM_WEEK,
  TWO_YO_OPENING_DISTANCE_MAX,
  TWO_YO_OPENING_DISTANCE_MIN,
  TWO_YO_SHARE,
  type GeneratedRaceKind,
} from '../config/meetings';
import { isInPhase, monthOfWeek } from '../time/calendar';
import type {
  CourseDistance,
  Race,
  RaceClass,
  RaceConditions,
  Racecourse,
  Rng,
  Week,
} from '../types';

/** generateRace 입력 옵션 */
export interface GenerateRaceOptions {
  /** 시즌 연도 (id 에 쓴다) */
  year: number;
  /** 자동 생성 일련번호(SeasonState.nextGeneratedRace). id 에 6자리로 찍는다 */
  seq: number;
  /** 개최 주(1~52). 2세 경주 허용 여부와 거리 상한 판정에 쓴다 */
  week: Week;
}

export interface WeightedItem<T> {
  value: T;
  weight: number;
}

/**
 * 가중치에 따라 항목 하나를 고른다. rng.range 를 정확히 1회 쓴다.
 * 가중치 합이 0 이하이거나 항목이 없으면 RangeError.
 */
export function pickWeighted<T>(rng: Rng, items: readonly WeightedItem<T>[]): T {
  let total = 0;
  for (const item of items) {
    if (item.weight < 0) {
      throw new RangeError(`pickWeighted: 음수 가중치 ${item.weight}`);
    }
    total += item.weight;
  }
  if (items.length === 0 || total <= 0) {
    throw new RangeError('pickWeighted: 고를 항목이 없거나 가중치 합이 0');
  }
  const roll = rng.range(0, total);
  let acc = 0;
  let last: T | undefined;
  for (const item of items) {
    if (item.weight <= 0) continue;
    last = item.value;
    acc += item.weight;
    if (roll < acc) {
      return item.value;
    }
  }
  // 부동소수 오차로 roll 이 합에 못 미치지 않은 경우의 안전장치: 마지막 양의 가중치 항목
  if (last === undefined) {
    throw new RangeError('pickWeighted: 양의 가중치 항목이 없음');
  }
  return last;
}

/** 거리가 속한 가중 구간 (마지막 구간은 상한 무한대이므로 항상 찾는다) */
function bucketOf(distance: number): { maxM: number; weight: number } {
  const found = DISTANCE_BUCKETS.find((b) => distance <= b.maxM);
  if (found === undefined) {
    throw new RangeError(`거리 ${distance}m 에 해당하는 구간이 없음`);
  }
  return found;
}

/** 2세 경주가 이 주에 이 거리를 열 수 있는가 */
function twoYoAllows(distance: number, week: Week): boolean {
  const month = monthOfWeek(week);
  const cap = month < TWO_YO_CAP_START_MONTH ? TWO_YO_CAP_EARLY_M : TWO_YO_CAP_LATE_M;
  if (distance > cap) {
    return false;
  }
  // 2세 경주 시작 달에는 짧은 거리(1,006~1,207m)만
  if (month === monthOfWeek(TWO_YO_FROM_WEEK)) {
    return distance >= TWO_YO_OPENING_DISTANCE_MIN && distance <= TWO_YO_OPENING_DISTANCE_MAX;
  }
  return true;
}

/**
 * 열 수 있는 후보 거리. 같은 거리가 여러 레이아웃에 있으면 첫 항목을 쓴다.
 * twoYo 이면 2세 거리 제한을 건다.
 */
function distancePool(course: Racecourse, twoYo: boolean, week: Week): CourseDistance[] {
  const seen = new Set<number>();
  const pool: CourseDistance[] = [];
  for (const cd of course.distances) {
    if (seen.has(cd.distance)) continue;
    seen.add(cd.distance);
    if (twoYo && !twoYoAllows(cd.distance, week)) continue;
    pool.push(cd);
  }
  return pool;
}

/** 거리 가중(구간 가중 ÷ 구간 내 후보 수)으로 후보 하나를 고른다 */
function pickDistance(rng: Rng, pool: readonly CourseDistance[]): CourseDistance {
  const counts = new Map<number, number>();
  for (const cd of pool) {
    const key = bucketOf(cd.distance).maxM;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items: WeightedItem<CourseDistance>[] = pool.map((cd) => {
    const bucket = bucketOf(cd.distance);
    return { value: cd, weight: bucket.weight / (counts.get(bucket.maxM) ?? 1) };
  });
  return pickWeighted(rng, items);
}

/** 총상금을 착순 배분 비율로 나눈다. 누적 반올림이라 합계가 정확히 total 이다. */
function splitPrize(total: number): number[] {
  const out: number[] = [];
  let cum = 0;
  let prevEdge = 0;
  for (const share of PRIZE_SHARES) {
    cum += share;
    const edge = Math.round(total * cum);
    out.push(edge - prevEdge);
    prevEdge = edge;
  }
  return out;
}

function handicapRange(raceClass: RaceClass): { min: number; max: number } {
  if (raceClass === 1) {
    throw new RangeError('핸디캡은 클래스 2~7 이어야 한다');
  }
  return HANDICAP_OR_RANGE[raceClass];
}

/**
 * 자동 생성 경주 하나. 거리·2세 여부는 rng 로 정한다.
 * - 2세 경주: 잔디 시즌, TWO_YO_FROM_WEEK 이후, 메이든·노비스만, TWO_YO_SHARE 확률.
 *   허용 거리가 없으면 3세 이상으로 바꾼다.
 * - 핸디캡은 항상 3세 이상.
 */
export function generateRace(
  rng: Rng,
  course: Racecourse,
  kind: GeneratedRaceKind,
  raceClass: RaceClass,
  opts: GenerateRaceOptions,
): Race {
  if (course.distances.length === 0) {
    throw new RangeError(`경마장 ${course.id} 에 열 수 있는 거리가 없음`);
  }

  let twoYo = false;
  let pool: CourseDistance[] = [];
  const turfSeason = isInPhase(opts.week, 'turf_flat');
  if (kind !== 'handicap' && turfSeason && opts.week >= TWO_YO_FROM_WEEK && rng.chance(TWO_YO_SHARE)) {
    const twoYoPool = distancePool(course, true, opts.week);
    if (twoYoPool.length > 0) {
      twoYo = true;
      pool = twoYoPool;
    }
  }
  if (pool.length === 0) {
    pool = distancePool(course, false, opts.week);
  }
  const cd = pickDistance(rng, pool);

  const isHandicap = kind === 'handicap';
  const label =
    kind === 'maiden' ? 'Maiden Stakes' : kind === 'novice' ? 'Novice Stakes' : `Class ${raceClass} Handicap`;

  const conditions: RaceConditions = {
    minAge: twoYo ? 2 : 3,
    maxAge: twoYo ? 2 : null,
    sex: 'open',
    ratingMin: null,
    ratingMax: null,
    weightSystem: isHandicap ? 'handicap' : 'wfa',
    baseWeightLb: isHandicap ? HANDICAP_BASE_WEIGHT_LB : BASE_WEIGHT_LB,
  };
  if (isHandicap) {
    const range = handicapRange(raceClass);
    conditions.ratingMin = range.min;
    conditions.ratingMax = range.max;
  }

  const total =
    kind === 'maiden'
      ? MAIDEN_TOTAL_PRIZE
      : kind === 'novice'
        ? NOVICE_TOTAL_PRIZE
        : CLASS_TOTAL_PRIZE[raceClass];

  let maxRunners = MAX_RUNNERS_CONDITIONS;
  if (isHandicap) {
    maxRunners = raceClass <= MAX_RUNNERS_HANDICAP_TOP_CLASS ? MAX_RUNNERS_HANDICAP_TOP : MAX_RUNNERS_HANDICAP;
  }

  return {
    id: `gen-${opts.year}-${String(opts.seq).padStart(6, '0')}`,
    name: `${course.name} ${label}`,
    racecourseId: course.id,
    distance: cd.distance,
    layoutId: cd.layoutId,
    kind,
    grade: null,
    raceClass,
    conditions,
    prizeMoney: splitPrize(total),
    maxRunners,
  };
}
