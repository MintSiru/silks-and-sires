import {
  DISTANCE_TOLERANCE,
  MAIDEN_MAX_WINS,
  MIN_FITNESS_TO_RUN,
  MIN_WEEKS_BETWEEN_GROUP_RUNS,
  MIN_WEEKS_BETWEEN_RUNS,
  NOVICE_MAX_WINS,
} from '../config/entries';
import { ageInYear, weeksBetween } from '../time/calendar';
import type {
  CountryCode,
  GameDate,
  Horse,
  Race,
  RacecourseId,
  SeasonState,
} from '../types';

/**
 * 경마장 id → 나라. 정적 경마장 목록에서 만든다(GameState 에는 경마장 정보가 없다).
 * undefined 를 돌려주면 나라를 모르는 것으로 보고 나라 제한을 걸지 않는다.
 */
export type CourseCountryLookup = (racecourseId: RacecourseId) => CountryCode | undefined;

/** 레이스 나라(모르면 null) */
export function raceCountryOf(lookup: CourseCountryLookup | undefined, racecourseId: RacecourseId): CountryCode | null {
  return lookup?.(racecourseId) ?? null;
}

/**
 * 출주 가능 여부(레이스 조건 기준).
 * status in_training, 부상 없음, fitness ≥ MIN_FITNESS_TO_RUN, 나이 범위, 성별, 핸디캡 OR 범위,
 * 메이든(무승)·노비스(1승 이하) 조건, 마지막 출주 후 최소 주 수(그룹 레이스는 더 길다).
 * 그룹·리스티드 OR 하한, 거리 적합, 나라, 한 주 한 레이스는 호출자(declarations)가 따로 본다.
 */
export function isEligible(
  horse: Horse,
  race: Race,
  date: GameDate,
  seasonState: SeasonState,
): boolean {
  if (horse.status !== 'in_training') return false;
  if (horse.condition.injury !== null) return false;
  if (horse.condition.fitness < MIN_FITNESS_TO_RUN) return false;

  const { minAge, maxAge, sex, ratingMin, ratingMax } = race.conditions;
  const age = ageInYear(horse.birthYear, date.year);
  if (age < minAge) return false;
  if (maxAge !== null && age > maxAge) return false;

  if (sex === 'fillies_mares' && horse.sex !== 'female') return false;
  if (sex === 'colts_geldings' && horse.sex !== 'male') return false;

  if (ratingMin !== null || ratingMax !== null) {
    const or = horse.officialRating;
    if (or === null) return false;
    if (ratingMin !== null && or < ratingMin) return false;
    if (ratingMax !== null && or > ratingMax) return false;
  }

  if (race.kind === 'maiden' && horse.record.wins > MAIDEN_MAX_WINS) return false;
  if (race.kind === 'novice' && horse.record.wins > NOVICE_MAX_WINS) return false;

  const last = seasonState.lastRun[horse.id];
  if (last !== undefined) {
    const minWeeks = race.kind === 'group' ? MIN_WEEKS_BETWEEN_GROUP_RUNS : MIN_WEEKS_BETWEEN_RUNS;
    if (weeksBetween(last, date) < minWeeks) return false;
  }

  return true;
}

/** 거리 적합: |distanceOptimum − distance| ≤ distanceRange × DISTANCE_TOLERANCE */
export function isDistanceFit(horse: Horse, race: Race): boolean {
  const { distanceOptimum, distanceRange } = horse.aptitude;
  return Math.abs(distanceOptimum - race.distance) <= distanceRange * DISTANCE_TOLERANCE;
}
