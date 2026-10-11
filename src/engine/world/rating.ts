import {
  OR_ANCHOR,
  OR_ANCHOR_ABILITY,
  OR_PER_ABILITY,
  OR_TAIL_FROM_ABILITY,
  OR_TAIL_MAX_BONUS,
  RATING_MAX,
  RATING_MIN,
} from '../config/population';
import type { Abilities, Horse } from '../types';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 능력 5종 평균 */
export function meanAbility(abilities: Abilities): number {
  return (abilities.speed + abilities.stamina + abilities.acceleration + abilities.guts + abilities.power) / 5;
}

/**
 * 능력 평균 a → 공식 레이팅.
 * OR = clamp(round(ANCHOR + (a − ANCHOR_ABILITY) × PER + clamp(a − TAIL_FROM, 0, TAIL_MAX)), MIN, MAX)
 */
export function ratingFromAbility(abilityMean: number): number {
  const tail = clamp(abilityMean - OR_TAIL_FROM_ABILITY, 0, OR_TAIL_MAX_BONUS);
  return clamp(
    Math.round(OR_ANCHOR + (abilityMean - OR_ANCHOR_ABILITY) * OR_PER_ABILITY + tail),
    RATING_MIN,
    RATING_MAX,
  );
}

/**
 * 현재 능력(ability) 5종 평균으로 초기 OR 을 낸다. M3-C3 핸디캐퍼가 이후 갱신한다.
 * 2세 등 OR 을 붙이지 않는 말에는 호출하지 않는다.
 */
export function initialOfficialRating(horse: Horse): number {
  return ratingFromAbility(meanAbility(horse.ability));
}
