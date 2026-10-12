/**
 * 세일 로트 가치 평가(M4-C3). 순수 함수: state 는 읽기만 하고, 난수는 주입된 rng 만 쓴다.
 * valueLot 은 종류와 상관없이 rng.normal 을 정확히 1회 호출한다(호출자가 로트마다 독립 rng 를 넘긴다).
 */
import {
  SALE_BASE_MEDIAN,
  SALE_CONFORMATION_SD,
  SALE_FALLBACK_SIRE_FEE,
  SALE_FASHION_AMPLITUDE,
  SALE_HIT_AGE_MULT,
  SALE_HIT_NOISE_SD,
  SALE_HIT_VALUE_BY_OR,
  SALE_IN_FOAL_SHARE,
  SALE_KIND_FEE_MULT,
  SALE_MARE_AGE_MULT,
  SALE_MARE_BASE,
  SALE_MARE_BTP_MULT_MAX,
  SALE_MARE_BTP_PER,
  SALE_MARE_NOISE_SD,
  SALE_MARE_OR_BASE,
  SALE_MARE_OR_MULT_MAX,
  SALE_MARE_OR_PER_POINT,
  SALE_MARE_SIRE_MULT,
  SALE_MARKET_NOISE_SD,
  SALE_POPULARITY_MID,
  SALE_POPULARITY_SCALE,
  SALE_QUALITY_SD,
  SALE_RANGE_HIGH,
  SALE_RANGE_LOW,
  SALE_SIRE_FLOP_MIN_STARTERS,
  SALE_SIRE_FLOP_PENALTY,
  SALE_SIRE_FLOP_RATE,
  SALE_SIRE_GROUP_WINNER_BONUS,
  SALE_SIRE_MULT_MAX,
  SALE_SIRE_MULT_MIN,
  SALE_TREND_FROM_YEARS_AGO,
  SALE_TREND_MAX,
  SALE_TREND_MIN,
  SALE_TREND_TO_YEARS_AGO,
  SALE_UNSOUND_MULT,
  SALE_UNSOUND_THRESHOLD,
  SALE_VALUE_FLOOR,
  SALE_VALUE_ROUND,
} from '../config/sales';
import { TIER_FEE } from '../config/world';
import { POPULATION_TIER_LEVEL } from '../config/population';
import type { GameState, Horse, HorseId, Money, Rng, SaleKind } from '../types';
import { meanAbility, ratingFromAbility } from '../world/rating';

type Grade = 1 | 2 | 3 | 4 | 5;
const GRADES: readonly Grade[] = [1, 2, 3, 4, 5];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 값 목록의 중앙값(짝수 개면 가운데 두 값의 평균). 빈 목록은 0 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return hi;
  const lo = sorted[mid - 1] ?? 0;
  return (lo + hi) / 2;
}

/** 값을 SALE_VALUE_ROUND 단위로 반올림한다 */
function roundToStep(v: number): Money {
  return Math.round(v / SALE_VALUE_ROUND) * SALE_VALUE_ROUND;
}

/** 부 종부료. 종마 정보가 없으면 폴백 */
function stallionFee(state: GameState, sireId: HorseId | null): Money {
  if (sireId === null) return SALE_FALLBACK_SIRE_FEE;
  const stallion = state.stallions[sireId];
  return stallion ? stallion.fee : SALE_FALLBACK_SIRE_FEE;
}

/** 종부료에 가장 가까운 시장 등급(비율 기준: |log(fee / 등급 종부료)| 최소. 동률이면 등급 번호가 작은 쪽) */
export function marketGrade(fee: Money): Grade {
  let best: Grade = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const grade of GRADES) {
    const distance = Math.abs(Math.log(Math.max(fee, 1) / TIER_FEE[grade]));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = grade;
    }
  }
  return best;
}

/** 부 성적 배율(그룹 우승 자마 가산, 부진 감점, 0.8~1.5). sireStats 가 없으면 1 */
function sireRecordMult(state: GameState, sireId: HorseId | null): number {
  if (sireId === null) return 1;
  const stats = state.sireStats[sireId];
  if (!stats) return 1;
  let adjust = SALE_SIRE_GROUP_WINNER_BONUS * stats.groupWinners;
  const flop =
    stats.starters >= SALE_SIRE_FLOP_MIN_STARTERS && stats.winners / stats.starters < SALE_SIRE_FLOP_RATE;
  if (flop) adjust -= SALE_SIRE_FLOP_PENALTY;
  return clamp(1 + adjust, SALE_SIRE_MULT_MIN, SALE_SIRE_MULT_MAX);
}

/** 유행 배율: 부 인기 기준 진폭. 인기 정보가 없으면 1 */
function fashionMult(state: GameState, sireId: HorseId | null): number {
  if (sireId === null) return 1;
  const stallion = state.stallions[sireId];
  if (!stallion) return 1;
  return 1 + ((stallion.popularity - SALE_POPULARITY_MID) / SALE_POPULARITY_SCALE) * SALE_FASHION_AMPLITUDE;
}

/** 체형 배율: exp(z × SD), 다리·체질 미달이면 추가 감점 */
function conformationMult(horse: Horse, z: number): number {
  const mult = Math.exp(z * SALE_CONFORMATION_SD);
  return horse.soundness < SALE_UNSOUND_THRESHOLD ? mult * SALE_UNSOUND_MULT : mult;
}

/** 구간 선형 보간. 양끝 밖은 끝값 */
function interpolateByOr(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0];
  const last = table[table.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const cur = table[i];
    const prev = table[i - 1];
    if (!cur || !prev) continue;
    if (x <= cur[0]) {
      const [x0, y0] = prev;
      const [x1, y1] = cur;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** 공식 레이팅(없으면 능력 환산) */
function ratingOf(horse: Horse): number {
  return horse.officialRating ?? ratingFromAbility(meanAbility(horse.ability));
}

/**
 * 시세 배율: 같은 종류의 year−2 ~ year−1 낙찰 중앙값(요약의 median 들의 중앙값) ÷ 기준 중앙값, 0.85~1.15.
 * 해당 기록이 없으면 1. 낙찰이 없었던 해(median 0 이하)는 기록에서 뺀다.
 */
export function marketTrend(state: GameState, kind: SaleKind, year: number): number {
  const from = year - SALE_TREND_FROM_YEARS_AGO;
  const to = year - SALE_TREND_TO_YEARS_AGO;
  const medians = state.sales.history
    .filter((s) => s.kind === kind && s.year >= from && s.year <= to && s.median > 0)
    .map((s) => s.median);
  if (medians.length === 0) return 1;
  return clamp(median(medians) / SALE_BASE_MEDIAN[kind], SALE_TREND_MIN, SALE_TREND_MAX);
}

/** 정규 난수 1회의 표준편차: 종류별 노이즈 척도 */
function noiseSdFor(kind: SaleKind): number {
  switch (kind) {
    case 'yearling':
    case 'foal':
    case 'breeze_up':
      return SALE_MARKET_NOISE_SD;
    case 'horses_in_training':
      return SALE_HIT_NOISE_SD;
    case 'breeding_stock':
      return SALE_MARE_NOISE_SD;
  }
}

/** 1세·이유·브리즈업 값(체형 z 에 노이즈 포함) */
function valueYoungstock(
  state: GameState,
  horse: Horse,
  kind: 'yearling' | 'foal' | 'breeze_up',
  year: number,
  noise: number,
): number {
  const fee = stallionFee(state, horse.sireId);
  const expected = POPULATION_TIER_LEVEL[marketGrade(fee)];
  const z = (meanAbility(horse.potential) - expected) / SALE_QUALITY_SD + noise;
  return (
    fee *
    SALE_KIND_FEE_MULT[kind] *
    sireRecordMult(state, horse.sireId) *
    conformationMult(horse, z) *
    fashionMult(state, horse.sireId) *
    marketTrend(state, kind, year)
  );
}

/** 현역마 값(OR 보간 × 나이 × 노이즈 × 시세) */
function valueInTraining(state: GameState, horse: Horse, year: number, noise: number): number {
  const base = interpolateByOr(SALE_HIT_VALUE_BY_OR, ratingOf(horse));
  const age = year - horse.birthYear;
  let ageMult = 1;
  for (const band of SALE_HIT_AGE_MULT) {
    if (age >= band.minAge) ageMult = band.mult;
  }
  return base * ageMult * Math.exp(noise) * marketTrend(state, 'horses_in_training', year);
}

/** 번식 암말 값(기본 + 부 종부료 + OR·나이·모계 배수 + 임신 가산, × 노이즈 × 시세) */
function valueBreedingStock(state: GameState, horse: Horse, year: number, noise: number): number {
  const mare = state.mares[horse.id];
  const orMult = clamp(
    1 + Math.max(0, ratingOf(horse) - SALE_MARE_OR_BASE) * SALE_MARE_OR_PER_POINT,
    1,
    SALE_MARE_OR_MULT_MAX,
  );
  const age = year - horse.birthYear;
  const ageMult = SALE_MARE_AGE_MULT.find((band) => age <= band.maxAge)?.mult ?? 0;
  const maternalMult = mare
    ? Math.min(SALE_MARE_BTP_MULT_MAX, 1 + SALE_MARE_BTP_PER * mare.blackTypeProduce)
    : 1;
  const base = (SALE_MARE_BASE + stallionFee(state, horse.sireId) * SALE_MARE_SIRE_MULT) * orMult * ageMult * maternalMult;
  const inFoal =
    mare && mare.pregnant && mare.coveredBy !== null
      ? stallionFee(state, mare.coveredBy) * SALE_IN_FOAL_SHARE
      : 0;
  return (base + inFoal) * Math.exp(noise) * marketTrend(state, 'breeding_stock', year);
}

/**
 * 로트 말의 시장 평가값(€, 정수, 100 단위). 같은 입력·같은 rng 상태 → 같은 값.
 * rng.normal 은 종류와 상관없이 정확히 1회 쓴다.
 */
export function valueLot(state: GameState, horse: Horse, kind: SaleKind, year: number, rng: Rng): Money {
  const noise = rng.normal(0, noiseSdFor(kind));
  let raw: number;
  switch (kind) {
    case 'yearling':
    case 'foal':
    case 'breeze_up':
      raw = valueYoungstock(state, horse, kind, year, noise);
      break;
    case 'horses_in_training':
      raw = valueInTraining(state, horse, year, noise);
      break;
    case 'breeding_stock':
      raw = valueBreedingStock(state, horse, year, noise);
      break;
  }
  return Math.max(SALE_VALUE_FLOOR, roundToStep(raw));
}

/** 화면에 보여 줄 추정 범위(평가값 × 0.7 ~ × 1.4, 100 단위). 화면은 이 범위만 본다 */
export function estimateRange(valuation: Money): { low: Money; high: Money } {
  return {
    low: roundToStep(valuation * SALE_RANGE_LOW),
    high: roundToStep(valuation * SALE_RANGE_HIGH),
  };
}
