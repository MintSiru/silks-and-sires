/** 세일 가치 평가(C3) 밸런스 상수. 초기값이며 Opus 가 조정한다. */
import type { CountryCode, Money, OwnerTier, SaleKind } from '../types';

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
export const SALE_RESERVE_SHARE = 1.0;
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

// ── 세일 주간 시스템·위탁 API(M4-C2b) ─────────────────────────

/** 일반 플레이어 카탈로그 공개: 세일 시작 전 주 수 */
export const SALE_CATALOGUE_LEAD_WEEKS = 4;
/** 마감 카탈로그 보존 기간: 마지막 북 주 + 이 값(주)이 지나면 카탈로그와 플레이어 입찰을 지운다 */
export const SALE_CATALOGUE_KEEP_WEEKS = 8;
/** 세일 결과 요약(history) 보존 기간(년). 세일 연도 기준 이 년보다 오래된 요약은 지운다 */
export const SALE_HISTORY_YEARS = 3;
/** 화면용 세일 일정 목록 최대 개수 */
export const SALE_UPCOMING_LIMIT = 20;

// ── AI 입찰·경매·낙찰 후 처리(M4-C4) ─────────────────────────

/** 마주 규모별 입찰 예산 비율: 자금 × 이 값 = 한 로트에 쓸 수 있는 상한 예산 */
export const SALE_BUDGET_SHARE: Readonly<Record<OwnerTier, number>> = { major: 0.25, mid: 0.15, small: 0.1 };
/** 예산이 평가값 × 이 값보다 적은 마주는 그 로트의 입찰 후보에서 뺀다 */
export const SALE_MIN_BUDGET_RATIO = 0.5;
/** 로트당 관심 마주 수 범위(양끝 포함, 추첨) */
export const SALE_INTEREST_MIN = 1;
export const SALE_INTEREST_MAX = 8;
/** 북 1 로트는 관심 마주 수에 이 값을 더한다(후보 수가 상한) */
export const SALE_INTEREST_BOOK1_BONUS = 2;
/** 관심 마주 추첨 가중치(규모별) */
export const SALE_INTEREST_WEIGHT: Readonly<Record<OwnerTier, number>> = { major: 4, mid: 2, small: 1 };
/** 입찰 상한의 로그 노이즈 SD: 상한 = 평가값 × exp(normal(0, SD)) × 명예 보정 */
export const SALE_BID_SPREAD = 0.35;
/** 명예 보정 폭: 1 + (prestige − 0.5) × PULL × (북 1 이면 BOOK1, 아니면 OTHER) */
export const SALE_PRESTIGE_PULL = 0.4;
export const SALE_PRESTIGE_PULL_BOOK1 = 1;
export const SALE_PRESTIGE_PULL_OTHER = 0.3;
/** 로트에 저장하는 AI 입찰 상위 수 */
export const SALE_AI_BIDS_STORED = 3;
/** 호가 단위 표: 낙찰가가 below 미만인 첫 항목의 increment 를 쓴다(오름차순, 마지막은 Infinity) */
export const SALE_BID_LADDER: readonly { below: Money; increment: Money }[] = [
  { below: 10_000, increment: 500 },
  { below: 50_000, increment: 1_000 },
  { below: 200_000, increment: 5_000 },
  { below: 1_000_000, increment: 10_000 },
  { below: Number.POSITIVE_INFINITY, increment: 25_000 },
];
/** 판매자 수수료율(마주 판매·상업 생산자 판매 공통): 낙찰가 × 이 값 */
export const SALE_VENDOR_COMMISSION = 0.05;
/** 세일 나라 밖 AI 마주 중 major 만 입찰할 수 있는 나라(유럽 5개국 + AE) */
export const SALE_OPEN_BUYER_COUNTRIES: readonly CountryCode[] = ['GB', 'IE', 'FR', 'DE', 'IT', 'AE'];

// ── 플레이어 입찰·실시간 보기(M4-C5) ─────────────────────────

/** 실시간 경매 보기(liveAuctionSteps) 단계 수 상한. 넘으면 가격이 낮은 앞쪽 단계를 건너뛴다 */
export const SALE_LIVE_MAX_STEPS = 200;

// ── 세일 동행 검사(M4-C6) ─────────────────────────

/** 세일 동행 검사 가능 관계 하한(이상이면 동행 가능). 전속 조교사는 관계와 무관하게 가능 */
export const SALE_INSPECT_MIN_RELATION = 10;

// ── 세일 후원 등급(M4-C8a) ─────────────────────────

/** 올해·지난해 낙찰가 합계 기준(€) */
export const SALE_PATRON_SILVER_SPEND = 1_000_000;
export const SALE_PATRON_GOLD_SPEND = 3_000_000;
/** 후원 등급별 구매 수수료율 할인 */
export const SALE_PATRON_PREMIUM_DISCOUNT = { none: 0, silver: 0.01, gold: 0.02 } as const;
/** 후원 등급별 위탁 북 우대 */
export const SALE_PATRON_BOOK_BONUS = { none: 0, silver: 1, gold: 1 } as const;

/** 카탈로그 생성·위탁 마감: 세일 시작 전 주 수 */
export const SALE_CATALOGUE_BUILD_LEAD_WEEKS = 6;
/** 후원 등급별 카탈로그 추가 사전 열람 주 수 */
export const SALE_PATRON_PREVIEW_WEEKS = { none: 0, silver: 1, gold: 2 } as const;
