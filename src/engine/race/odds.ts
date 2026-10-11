import type { FractionalOdds, Rng } from '../types';
import { MARKET_NOISE_SD, MARKET_OVERROUND, MARKET_TEMPERATURE, ODDS_LADDER } from '../config/raceday';

/** 사다리 칸 i 를 분수 오즈로 변환. 범위 밖이면 RangeError. */
function rungAt(i: number): FractionalOdds {
  const rung = ODDS_LADDER[i];
  if (rung === undefined) {
    throw new RangeError(`rungAt: 사다리 인덱스 범위 밖 (${i})`);
  }
  return { num: rung[0], den: rung[1] };
}

/**
 * 시장 인식 확률. perceived = strength + N(0, MARKET_NOISE_SD) 후 softmax(온도 MARKET_TEMPERATURE).
 * 빈 배열이면 []. 합은 1.
 */
export function marketProbabilities(rng: Rng, strengths: readonly number[]): number[] {
  if (strengths.length === 0) {
    return [];
  }
  const perceived = strengths.map((s) => s + rng.normal(0, MARKET_NOISE_SD));
  const max = perceived.reduce((m, v) => (v > m ? v : m), -Infinity);
  const weights = perceived.map((v) => Math.exp((v - max) / MARKET_TEMPERATURE));
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return weights.map((w) => w / sum);
}

/**
 * 확률 → 분수 오즈. frac = 1 / (p * overround) - 1 을 사다리에서 로그 거리 최소인 칸으로 맞춘다(같으면 짧은 쪽).
 * - frac <= 0 (p*overround >= 1): 사다리 첫 칸.
 * - p <= 0 (확률 0, 명세 외 처리): 사다리 마지막 칸.
 * 반환은 새 객체.
 */
export function probabilityToOdds(p: number, overround: number = MARKET_OVERROUND): FractionalOdds {
  const last = ODDS_LADDER.length - 1;
  const denom = p * overround;
  if (!(denom > 0)) {
    return rungAt(last);
  }
  const frac = 1 / denom - 1;
  if (frac <= 0) {
    return rungAt(0);
  }
  const lnFrac = Math.log(frac);
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i <= last; i++) {
    const rung = rungAt(i);
    const diff = Math.abs(lnFrac - Math.log(rung.num / rung.den));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return rungAt(best);
}

/** strength 배열 → 시장 확률 → 분수 오즈 */
export function priceField(rng: Rng, strengths: readonly number[]): FractionalOdds[] {
  return marketProbabilities(rng, strengths).map((p) => probabilityToOdds(p));
}

/** 표기: {1,1} → 'Evs', 그 외 'num/den' */
export function formatOdds(o: FractionalOdds): string {
  if (o.num === 1 && o.den === 1) {
    return 'Evs';
  }
  return `${o.num}/${o.den}`;
}

/** 소수 오즈 = 1 + num/den */
export function oddsToDecimal(o: FractionalOdds): number {
  return 1 + o.num / o.den;
}

/** 내재 확률 = den / (num + den) */
export function impliedProbability(o: FractionalOdds): number {
  return o.den / (o.num + o.den);
}
