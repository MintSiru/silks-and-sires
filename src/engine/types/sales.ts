/**
 * 세일(M4-C) 정적 데이터 타입. 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지.
 * 원칙 1: 세일 회사·세일 이름·장소는 전부 가상(실제 세일 회사명·실제 경마장 소재지 금지).
 * 진행 상태(카탈로그·로트·입찰)는 아래 '진행 상태' 절(M4-C2a). 설계: docs/m4-sales-design.md
 */
import type { BreederId, CountryCode, HorseId, Money, OwnerId } from './common';
import type { Week } from './time';

export type SaleCompanyId = string;
export type SaleEventId = string;

/**
 * 세일 종류.
 * foal: 이유마(그해 태어난 0세, 늦가을~겨울) / yearling: 1세마(늦여름~가을) / breeze_up: 2세 브리즈업(봄, 조교 공개 후 판매)
 * / horses_in_training: 현역마(가을) / breeding_stock: 번식 암말·종부 끝난 암말(12월)
 */
export type SaleKind = 'foal' | 'yearling' | 'breeze_up' | 'horses_in_training' | 'breeding_stock';

/** 가상 세일 회사 */
export interface SaleCompanyDef {
  id: SaleCompanyId;
  /** 가상 회사명 */
  name: string;
  country: CountryCode;
  /** 가상 세일장 이름(소재 지명 포함 가능, 실제 경마장·그 소재 지명 금지) */
  venue: string;
  /** 시장 위상 1(최상위)~3. 출품 수준·구매자 규모의 기준 */
  prestige: 1 | 2 | 3;
}

/**
 * 한 세일의 '북'(book) 단계. 대형 1세마 세일은 여러 북으로 나뉘고 앞 북일수록 혈통이 좋다
 * (미국 9월 대형 1세마 세일 모티브). 북 하나는 연속된 며칠이며 같은 주 또는 다음 주에 열린다.
 */
export interface SaleBookDef {
  /** 1부터 */
  book: number;
  /** 세일 시작 주로부터의 주 오프셋(0 = 시작 주) */
  weekOffset: number;
  /** 목표 출품 두수(대략) */
  lotsTarget: number;
  /** 출품 혈통 기준: 이 북에 들어가는 말의 부(父) 시장 등급 상한(1이 최고). 1 이면 tier 1 만 */
  maxSireTier: 1 | 2 | 3 | 4 | 5;
}

/** 해마다 같은 시기에 열리는 세일 */
export interface SaleEventDef {
  id: SaleEventId;
  companyId: SaleCompanyId;
  /** 가상 세일 이름(예: '<가상 회사> October Yearling Sale') — 실제 세일명 금지 */
  name: string;
  kind: SaleKind;
  /** 시작 주(1~52, 게임 달력). monthOfWeek 로 월을 맞춘다 */
  week: Week;
  /** 북 목록(북이 하나뿐인 세일도 1개) */
  books: SaleBookDef[];
  /** 구매자 수수료율(예 0.05). 판매자 수수료는 회사 공통 config */
  buyerPremiumRate: number;
  /** 유보 가격(바이백) 아래 최저 호가(€). 첫 호가 하한 */
  minimumBid: Money;
}

/** data/sales/sales.json 형식 */
export interface SalesDataFile {
  version: number;
  companies: SaleCompanyDef[];
  events: SaleEventDef[];
}

// ── 진행 상태 (M4-C2a) ─────────────────────────────────────────

/** 로트 판매자 */
export type SaleVendor = { kind: 'breeder'; id: BreederId } | { kind: 'owner'; id: OwnerId };

/** 카탈로그에 저장하는 AI 입찰 상한(상위 몇 명만, 숨김) */
export interface AiBid {
  ownerId: OwnerId;
  /** 이 마주가 낼 수 있는 최고가(€, 정수) */
  max: Money;
}

/**
 * 로트 결과.
 * sold: 낙찰(price = 낙찰가, 수수료 제외) / bought_back: 유보가 미달(lastBid = 마지막 호가, 없으면 0)
 * / withdrawn: 판매 전 철회(말 사망·부상·위탁 취소)
 */
export type SaleLotResult =
  | { kind: 'sold'; price: Money; buyerId: OwnerId }
  | { kind: 'bought_back'; lastBid: Money }
  | { kind: 'withdrawn' };

export interface SaleLot {
  /** 카탈로그 안 번호(1부터, 북 순서대로 이어진다) */
  lotNo: number;
  book: number;
  horseId: HorseId;
  /** 결과 표시용 사본(말이 세계에서 빠져도 남는다) */
  horseName: string;
  sireId: HorseId | null;
  vendor: SaleVendor;
  /** 유보가(€). 이 값 미만이면 바이백. null = 유보 없음 */
  reserve: Money | null;
  /** 시장 평가값(€, C3). 카탈로그 때 정한다. 숨김 — 화면은 추정 범위만 */
  valuation: Money;
  /** AI 입찰 상한 상위 SALE_AI_BIDS_STORED 명(높은 순). 숨김 */
  aiBids: AiBid[];
  result: SaleLotResult | null;
}

export type SaleStatus = 'catalogued' | 'closed';

/** 한 해 한 세일의 카탈로그 */
export interface SaleCatalogue {
  saleId: SaleEventId;
  year: number;
  status: SaleStatus;
  lots: SaleLot[];
}

/** 플레이어 위탁 출품 신청(카탈로그 발표 때 로트가 된다) */
export interface SaleConsignment {
  saleId: SaleEventId;
  year: number;
  horseId: HorseId;
  /** 유보가(€). null = 유보 없음 */
  reserve: Money | null;
}

/** 플레이어 입찰 상한 */
export interface PlayerBid {
  saleId: SaleEventId;
  year: number;
  lotNo: number;
  /** 낙찰가 상한(€, 수수료 제외) */
  maxBid: Money;
}

/** 세일 한 번의 결과 요약(시세·화면용, 보존 SALE_HISTORY_YEARS 년) */
export interface SaleSummary {
  saleId: SaleEventId;
  year: number;
  kind: SaleKind;
  offered: number;
  sold: number;
  /** 낙찰가 합계(€) */
  turnover: Money;
  median: Money;
  top: { price: Money; horseName: string; sireId: HorseId | null } | null;
}

/** GameState.sales */
export interface SalesState {
  /** 발표된 카탈로그(진행 중·최근 마감). 마감 후 SALE_CATALOGUE_KEEP_WEEKS 주가 지나면 지운다 */
  catalogues: SaleCatalogue[];
  consignments: SaleConsignment[];
  playerBids: PlayerBid[];
  history: SaleSummary[];
  /** 연도별 플레이어 세일 구매 총액(낙찰가 합, C8 혜택 판정) */
  playerSpendByYear: Record<number, Money>;
}
