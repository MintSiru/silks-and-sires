/** 세일 가치 평가(C3) 밸런스 상수. 초기값이며 Opus 가 조정한다. */
import type { Money, SaleKind } from '../types';

/** 평가값 반올림 단위(€) */
export const SALE_VALUE_ROUND = 100;
/** 평가값 하한(€) */
export const SALE_VALUE_FLOOR = 1_000;

/** 종류별 기준 중앙값(€). 시세 = 최근 낙찰 중앙값 ÷ 이 값 */
export const SALE_BASE_MEDIAN: Readonly<Record<SaleKind, Money>> = {
  yearling: 40_000,
  foal: 20_000,
  breeze_up: 45_000,
  horses_in_training: 25_000,
  breeding_stock: 30_000,
};
/** 시세 보정 하한·상한(배율) */
export const SALE_TREND_MIN = 0.85;
export const SALE_TREND_MAX = 1.15;
/** 시세 참조 구간: year − SALE_TREND_FROM_YEARS_AGO ~ year − SALE_TREND_TO_YEARS_AGO (양 끝 포함) */
export const SALE_TREND_FROM_YEARS_AGO = 2;
export const SALE_TREND_TO_YEARS_AGO = 1;

/** 부(父) 종마 정보가 없을 때의 종부료(€) */
export const SALE_FALLBACK_SIRE_FEE = 5_000;

/** 1세마·이유마·브리즈업: 부 종부료 × 이 배수 = 기준 값 */
export const SALE_KIND_FEE_MULT: Readonly<Record<'yearling' | 'foal' | 'breeze_up', number>> = {
  yearling: 2.0,
  foal: 1.3,
  breeze_up: 2.2,
};

/** 부 성적: 그룹 우승 자마 1두당 가산 */
export const SALE_SIRE_GROUP_WINNER_BONUS = 0.05;
/** 부 성적: 출주 자마 수가 이 값 이상이고 승률이 SALE_SIRE_FLOP_RATE 미만이면 감점 */
export const SALE_SIRE_FLOP_MIN_STARTERS = 20;
export const SALE_SIRE_FLOP_RATE = 0.3;
export const SALE_SIRE_FLOP_PENALTY = 0.15;
/** 부 성적 배율 하한·상한 */
export const SALE_SIRE_MULT_MIN = 0.8;
export const SALE_SIRE_MULT_MAX = 1.5;

/**
 * 품질 z 의 표준편차(능력 평균 잠재치 − 등급 기대치 의 SD).
 * 측정값: 시드 20261011 bootstrapGame 의 2세 AI 현역마 624두, pooled SD 4.17 (SALE_QUALITY_SD 측정 절).
 */
export const SALE_QUALITY_SD = 4.17;
/** 시장 인식 오차 SD(z 단위). valueLot 의 rng.normal 1회가 이 값을 쓴다(1세·이유·브리즈업) */
export const SALE_MARKET_NOISE_SD = 0.6;
/** 체형 지수: exp(z × SD) */
export const SALE_CONFORMATION_SD = 0.45;
/** 다리·체질(soundness) 미달 기준과 배율 */
export const SALE_UNSOUND_THRESHOLD = 35;
export const SALE_UNSOUND_MULT = 0.6;

/** 유행: 부 인기(popularity) 중심값과 척도, 진폭 */
export const SALE_POPULARITY_MID = 50;
export const SALE_POPULARITY_SCALE = 50;
export const SALE_FASHION_AMPLITUDE = 0.2;

/** 현역마: OR → 기준 값(€) 보간표. [OR, €] 오름차순. 양끝 밖은 끝값 */
export const SALE_HIT_VALUE_BY_OR: readonly (readonly [number, number])[] = [
  [40, 3_000],
  [60, 8_000],
  [75, 20_000],
  [85, 50_000],
  [95, 120_000],
  [105, 300_000],
  [115, 800_000],
];
/** 현역마: 나이 배수표. minAge 이상인 마지막 항목을 쓴다(오름차순) */
export const SALE_HIT_AGE_MULT: readonly { minAge: number; mult: number }[] = [
  { minAge: 0, mult: 1.2 },
  { minAge: 4, mult: 1.0 },
  { minAge: 5, mult: 0.8 },
  { minAge: 6, mult: 0.5 },
];
/** 현역마: 로그 노이즈 SD(exp(normal(0, SD))) */
export const SALE_HIT_NOISE_SD = 0.3;

/** 번식 암말: 기본 값(€) */
export const SALE_MARE_BASE = 4_000;
/** 번식 암말: 부 종부료에 곱하는 배수 */
export const SALE_MARE_SIRE_MULT = 0.6;
/** 번식 암말: OR 배수. OR_BASE 이하 1.0, 그 위 1점당 PER_POINT 가산, 최대 OR_MULT_MAX */
export const SALE_MARE_OR_BASE = 60;
export const SALE_MARE_OR_PER_POINT = 0.03;
export const SALE_MARE_OR_MULT_MAX = 3.0;
/** 번식 암말: 나이 배수표. maxAge 이하인 첫 항목을 쓴다(오름차순). 마지막은 Infinity */
export const SALE_MARE_AGE_MULT: readonly { maxAge: number; mult: number }[] = [
  { maxAge: 8, mult: 1.0 },
  { maxAge: 12, mult: 0.7 },
  { maxAge: Number.POSITIVE_INFINITY, mult: 0.4 },
];
/** 번식 암말: 모계 배수 = min(MAX, 1 + PER × blackTypeProduce) */
export const SALE_MARE_BTP_PER = 0.15;
export const SALE_MARE_BTP_MULT_MAX = 2.0;
/** 번식 암말: 임신 가산 = 교배 종마 종부료 × 이 값 */
export const SALE_IN_FOAL_SHARE = 0.5;
/** 번식 암말: 로그 노이즈 SD */
export const SALE_MARE_NOISE_SD = 0.3;

/** 화면 추정 범위: 평가값 × 이 배율 */
export const SALE_RANGE_LOW = 0.7;
export const SALE_RANGE_HIGH = 1.4;

// ── 카탈로그 생성(M4-C2a) ─────────────────────────────────────

/** 카탈로그 로트 수 = 북 lotsTarget × 이 값(반올림, 최소 1). 실제 규모 대비 축소 비율 */
export const SALE_LOT_SCALE = 0.1;
/** 상업 생산자 판매 로트·마주 판매 로트의 기본 유보가 = 평가값 × 이 값(SALE_VALUE_ROUND 단위 반올림) */
export const SALE_RESERVE_SHARE = 0.6;
/** 현역마 판매(horses_in_training): 공식 레이팅 하한·상한(양끝 포함) */
export const SALE_HIT_OR_MIN = 50;
export const SALE_HIT_OR_MAX = 95;
/** 현역마 판매: 후보 최소 나이(세일 연도 기준, 이 나이 이상) */
export const SALE_HIT_MIN_AGE = 3;
/** 현역마 판매: 마주가 현역마 이 두수 이상일 때만 그 마주 말을 후보로 본다 */
export const SALE_HIT_MIN_OWNER_HORSES = 3;
/** 현역마 판매: 한 마주가 한 세일에 내놓는 최대 두수 */
export const SALE_HIT_MAX_PER_OWNER = 2;
/** 번식 암말 판매: 나이 하한·상한(양끝 포함, 세일 연도 기준) */
export const SALE_MARE_AGE_MIN = 4;
export const SALE_MARE_AGE_MAX = 12;
/** 생성 로트의 부 선택: 같은 권역(유럽 5개국) 계류 종마 중 세일 나라 계류 종마의 가중치 배수 */
export const SALE_HOME_SIRE_WEIGHT_MULT = 3;
/** 플레이어 위탁 말의 부(父) 등급을 알 수 없을 때 쓰는 등급(가장 낮은 등급 = 마지막 북) */
export const SALE_UNKNOWN_SIRE_TIER = 5;
