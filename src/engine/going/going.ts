import {
  AW_APTITUDE_EFFECT,
  AW_GOING_WEIGHTS,
  GOING_DAILY_SD,
  GOING_DRAINAGE_EFFECT,
  GOING_FIT_BONUS,
  GOING_FIT_MAX_PENALTY,
  GOING_LABELS,
  GOING_MONTH_BASE,
} from '../config/going';
import type { Aptitudes, AwGoing, Going, Racecourse, Rng, Surface, TurfGoing } from '../types';
import { AW_GOING_ORDER, TURF_GOING_ORDER } from '../types';

/** 잔디 마장 인덱스의 최대값 (TURF_GOING_ORDER 마지막 칸) */
const TURF_INDEX_MAX = TURF_GOING_ORDER.length - 1;

export function isTurfGoing(g: Going): g is TurfGoing {
  return (TURF_GOING_ORDER as readonly string[]).includes(g);
}

export function isAwGoing(g: Going): g is AwGoing {
  return (AW_GOING_ORDER as readonly string[]).includes(g);
}

/** 띠 뷰어·UI 표기 */
export function goingLabel(g: Going): string {
  return GOING_LABELS[g];
}

/** 잔디 마장 인덱스 0(firm) ~ 6(heavy). 잔디 마장이 아니면 RangeError. */
export function turfGoingIndex(g: TurfGoing): number {
  const i = TURF_GOING_ORDER.indexOf(g);
  if (i < 0) {
    throw new RangeError(`turfGoingIndex: 잔디 마장이 아니다 (${String(g)})`);
  }
  return i;
}

/** 인덱스를 반올림하고 0~6 으로 clamp 한 잔디 마장. NaN·무한대는 RangeError. */
export function turfGoingFromIndex(i: number): TurfGoing {
  if (!Number.isFinite(i)) {
    throw new RangeError(`turfGoingFromIndex: 유한한 수가 아니다 (${i})`);
  }
  const clamped = Math.min(Math.max(Math.round(i), 0), TURF_INDEX_MAX);
  return TURF_GOING_ORDER[clamped] as TurfGoing;
}

export function isGoingValidForSurface(g: Going, surface: Surface): boolean {
  return surface === 'turf' ? isTurfGoing(g) : isAwGoing(g);
}

/**
 * 마장 적성 배수 (1 근처).
 * - 마장이 AW 면 allWeather 로 계산한다.
 * - 잔디면 선호 인덱스와의 거리로 가우시안 가중치 w 를 구해 보너스/감점을 준다.
 * goingTolerance <= 0 이면 RangeError (AW 에서도 동일하게 검사).
 */
export function goingFit(
  apt: Pick<Aptitudes, 'goingPreference' | 'goingTolerance' | 'allWeather'>,
  g: Going,
): number {
  if (!(apt.goingTolerance > 0)) {
    throw new RangeError(`goingFit: goingTolerance 는 0보다 커야 한다 (${apt.goingTolerance})`);
  }
  if (isAwGoing(g)) {
    return 1 + AW_APTITUDE_EFFECT * apt.allWeather;
  }
  const d = Math.abs(turfGoingIndex(g) - apt.goingPreference);
  const w = Math.exp(-((d / apt.goingTolerance) ** 2));
  return 1 + GOING_FIT_BONUS * w - GOING_FIT_MAX_PENALTY * (1 - w);
}

/** AW 누적 확률에서 마장 하나를 고른다. u 는 [0, 1) 균등 난수. */
function pickAwGoing(u: number): AwGoing {
  let acc = 0;
  for (let i = 0; i < AW_GOING_ORDER.length; i++) {
    acc += AW_GOING_WEIGHTS[i] ?? 0;
    if (u < acc) {
      return AW_GOING_ORDER[i] as AwGoing;
    }
  }
  return AW_GOING_ORDER[AW_GOING_ORDER.length - 1] as AwGoing;
}

/**
 * 당일 마장 추첨. 같은 Rng 상태 = 같은 결과.
 * - AW 코스: rng.next() 한 번으로 AW_GOING_WEIGHTS 누적 확률에서 선택.
 * - 잔디 코스: 월 기준 인덱스 + 정규 잡음 + 배수 효과 → 잔디 마장.
 * month 가 1~12 정수가 아니면 RangeError.
 */
export function rollGoing(
  rng: Rng,
  course: Pick<Racecourse, 'surface' | 'drainage'>,
  month: number,
): Going {
  if (!Number.isInteger(month) || month < 1 || month > GOING_MONTH_BASE.length) {
    throw new RangeError(`rollGoing: month 는 1~${GOING_MONTH_BASE.length} 정수여야 한다 (${month})`);
  }
  if (course.surface === 'aw') {
    return pickAwGoing(rng.next());
  }
  const base = GOING_MONTH_BASE[month - 1] as number;
  const idx =
    base +
    rng.normal(0, GOING_DAILY_SD) +
    (0.5 - course.drainage) * GOING_DRAINAGE_EFFECT;
  return turfGoingFromIndex(idx);
}
