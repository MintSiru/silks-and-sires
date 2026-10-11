/**
 * OR 핸디캐퍼 (M3-C3). 레이스 결과마다 출주마의 퍼포먼스 레이팅(PR, OR 척도)을 계산하고,
 * OR 이 있는 말은 OR 을 올리거나 내리며, OR 이 없는 말은 PR 을 모았다가 첫 OR 을 매긴다.
 * 순수 함수 위주. 난수·시계·DOM 을 쓰지 않는다.
 */
import {
  ANCHOR_MAX_BEATEN_L,
  DOWN_RATE,
  FIRST_OR_RUNS,
  FIRST_OR_TOP_N,
  HANDICAP_WIN_MIN_RISE,
  MAX_DROP,
  MAX_RISE,
  MIN_ANCHORS,
  NO_DROP_BEATEN_L,
  RACE_STANDARD,
  RATING_HISTORY_MAX,
  STANDARD_PRIOR_WEIGHT,
  UP_RATE,
  UP_RATE_WIN,
} from '../config/rating';
import { RATING_MAX, RATING_MIN } from '../config/population';
import { ageInYear } from '../time/calendar';
import type { GameDate, GameState, HorseId, Race, RaceResult } from '../types';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** -0 을 0 으로 고친다(결과 비교·직렬화를 안정시킨다) */
function noNegZero(v: number): number {
  return v === 0 ? 0 : v;
}

function clampRating(v: number): number {
  return clamp(v, RATING_MIN, RATING_MAX);
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const hi = sorted[mid] ?? 0;
  if (n % 2 === 1) return hi;
  const lo = sorted[mid - 1] ?? hi;
  return (lo + hi) / 2;
}

/** 이 레이스가 2세 레이스인가: maxAge === 2 이거나, 출주마가 전부 2세다 */
function isTwoYoRace(race: Race, result: RaceResult, ages: ReadonlyMap<HorseId, number>): boolean {
  if (race.conditions.maxAge === 2) return true;
  return result.runners.length > 0 && result.runners.every((r) => ages.get(r.horseId) === 2);
}

/** 레이스 표준 승자 레벨(OR 척도). 등급·종류·클래스·2세 여부로 고른다 */
function standardFor(race: Race, twoYo: boolean): number {
  if (race.kind === 'maiden') {
    return twoYo ? RACE_STANDARD.maidenTwoYo : RACE_STANDARD.maidenOlder;
  }
  if (race.kind === 'novice') return RACE_STANDARD.novice;
  if (race.grade === 'G1' || race.grade === 'G2' || race.grade === 'G3') {
    return twoYo ? RACE_STANDARD.twoYoGroup[race.grade] : RACE_STANDARD.group[race.grade];
  }
  if (race.grade === 'L' || race.kind === 'listed') return RACE_STANDARD.listed;
  if (race.kind === 'handicap' && race.raceClass !== 1) return RACE_STANDARD.handicap[race.raceClass];
  return RACE_STANDARD.conditions;
}

/**
 * 승자 레벨 L. 기준마(레이스 전 OR 이 있고 패배 마신이 ANCHOR_MAX_BEATEN_L 이하)의 승자 레벨(OR − performanceFigure)로 구한다.
 * 기준마가 MIN_ANCHORS 이상이면 중앙값, 적으면 레이스 표준을 가중치로 섞는다.
 */
export function raceLevel(
  race: Race,
  result: RaceResult,
  ratings: ReadonlyMap<HorseId, number | null>,
  ages: ReadonlyMap<HorseId, number>,
): number {
  const levels: number[] = [];
  for (const r of result.runners) {
    const rating = ratings.get(r.horseId);
    if (rating === null || rating === undefined) continue;
    if (r.beatenLengths > ANCHOR_MAX_BEATEN_L) continue;
    levels.push(rating - r.performanceFigure);
  }

  if (levels.length >= MIN_ANCHORS) {
    return median([...levels].sort((a, b) => a - b));
  }
  const standard = standardFor(race, isTwoYoRace(race, result, ages));
  const sum = levels.reduce((acc, v) => acc + v, 0);
  return (sum + standard * STANDARD_PRIOR_WEIGHT) / (levels.length + STANDARD_PRIOR_WEIGHT);
}

/** 출주마별 퍼포먼스 레이팅 PR = clamp(round(L + performanceFigure), MIN, MAX) */
export function performanceRatings(
  race: Race,
  result: RaceResult,
  ratings: ReadonlyMap<HorseId, number | null>,
  ages: ReadonlyMap<HorseId, number>,
): Map<HorseId, number> {
  const level = raceLevel(race, result, ratings, ages);
  const out = new Map<HorseId, number>();
  for (const r of result.runners) {
    out.set(r.horseId, clampRating(Math.round(level + r.performanceFigure)));
  }
  return out;
}

/**
 * OR 이 있는 말의 다음 OR.
 * 1착: 상승 clamp(round(d × UP_RATE_WIN), 0, MAX_RISE), 핸디캡 우승은 최소 HANDICAP_WIN_MIN_RISE.
 * 1착 아님 d > 0: clamp(round(d × UP_RATE), 0, MAX_RISE). d < 0: NO_DROP_BEATEN_L 초과 패배면 유지, 아니면 max(round(d × DOWN_RATE), −MAX_DROP).
 */
export function nextRating(
  prev: number,
  pr: number,
  position: number,
  beatenLengths: number,
  race: Race,
): number {
  const d = pr - prev;
  let change = 0;
  if (position === 1) {
    change = clamp(Math.round(d * UP_RATE_WIN), 0, MAX_RISE);
    if (race.kind === 'handicap') change = Math.max(change, HANDICAP_WIN_MIN_RISE);
  } else if (d > 0) {
    change = clamp(Math.round(d * UP_RATE), 0, MAX_RISE);
  } else if (d < 0) {
    change = beatenLengths > NO_DROP_BEATEN_L ? 0 : Math.max(Math.round(d * DOWN_RATE), -MAX_DROP);
  }
  return noNegZero(clampRating(prev + noNegZero(change)));
}

/** 첫 OR = 최고 PR FIRST_OR_TOP_N 개 평균(반올림, clamp) */
function firstRating(figures: readonly number[]): number {
  const top = [...figures].sort((a, b) => b - a).slice(0, FIRST_OR_TOP_N);
  const avg = top.reduce((acc, v) => acc + v, 0) / Math.max(1, top.length);
  return clampRating(Math.round(avg));
}

function pushHistory(
  draft: GameState,
  horseId: HorseId,
  date: GameDate,
  raceId: string,
  from: number | null,
  to: number,
): void {
  const list = draft.seasonState.ratingHistory[horseId] ?? [];
  list.push({ date: { year: date.year, week: date.week }, raceId, from, to });
  draft.seasonState.ratingHistory[horseId] = list.slice(-RATING_HISTORY_MAX);
}

/**
 * 레이스 결과를 OR 에 반영한다(draft 를 고친다).
 * 레이스 전 OR 을 모두 읽어 PR 을 먼저 계산하므로, 같은 레이스 안에서 갱신된 OR 이 다른 말 계산에 쓰이지 않는다.
 */
export function applyRatingsInPlace(draft: GameState, race: Race, result: RaceResult, date: GameDate): void {
  const ratings = new Map<HorseId, number | null>();
  const ages = new Map<HorseId, number>();
  for (const r of result.runners) {
    const horse = draft.horses[r.horseId];
    if (horse === undefined) throw new Error(`applyRatings: 말 ${r.horseId} 없음`);
    ratings.set(r.horseId, horse.officialRating);
    ages.set(r.horseId, ageInYear(horse.birthYear, date.year));
  }
  const prs = performanceRatings(race, result, ratings, ages);

  for (const r of result.runners) {
    const horse = draft.horses[r.horseId];
    if (horse === undefined) throw new Error(`applyRatings: 말 ${r.horseId} 없음`);
    const pr = prs.get(r.horseId);
    if (pr === undefined) throw new Error(`applyRatings: 말 ${r.horseId} 의 PR 없음`);

    if (horse.officialRating !== null) {
      const prev = horse.officialRating;
      const to = nextRating(prev, pr, r.position, r.beatenLengths, race);
      if (to !== prev) pushHistory(draft, r.horseId, date, race.id, prev, to);
      horse.officialRating = to;
      continue;
    }

    const figures = [...(draft.seasonState.unratedFigures[r.horseId] ?? []), pr];
    if (figures.length >= FIRST_OR_RUNS || r.position === 1) {
      const to = firstRating(figures);
      horse.officialRating = to;
      pushHistory(draft, r.horseId, date, race.id, null, to);
      delete draft.seasonState.unratedFigures[r.horseId];
    } else {
      draft.seasonState.unratedFigures[r.horseId] = figures;
    }
  }
}
