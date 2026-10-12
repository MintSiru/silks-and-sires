import type { HorseId, JockeyId, Money, OwnerId, TrainerId } from './common';
import type { GameDate } from './time';

/**
 * 경제·관계 공용 타입 (M4-A1). 세일·종마 사업·목장 시설 타입은 각 단계(M4-C·D·E) 시작 때 Opus 가 추가한다.
 */

/** 경제 모드(새 게임 때 선택). casual = 파산 없음(적자는 빚), legacy = 연속 적자 시 파산 */
export type EconomyMode = 'casual' | 'legacy';

/** 장부 항목 종류. amount 부호: 수입 +, 지출 − */
export type LedgerCategory =
  /** 레이스 상금 */
  | 'prize'
  /** 시리즈 달성 보너스 */
  | 'series_bonus'
  /** 내가 낸 종부료 */
  | 'stud_fee_paid'
  /** 내 종마가 받은 종부료(M4-D) */
  | 'stud_fee_received'
  /** 현역마 조교료 */
  | 'training_fee'
  /** 목장 유지비(번식 암말·망아지·1세마·종마 두당) */
  | 'farm_upkeep'
  /** 출주 등록료 */
  | 'entry_fee'
  /** 원정 운송비 */
  | 'transport'
  /** 전속 계약료(조교사·기수, M4-B3). 계약·갱신 때 연 단위로, 해지 위약금 포함 */
  | 'retainer_fee'
  /** 세일 구매 대금 */
  | 'sale_purchase'
  /** 세일 판매 대금 */
  | 'sale_proceeds'
  /** 세일 수수료 */
  | 'sale_commission'
  /** 개인 거래(내부거래·종마 판매 등) */
  | 'private_sale'
  /** 목장 시설 공사·유지(M4-E) */
  | 'facility'
  /** 빚 이자(캐주얼 모드) */
  | 'interest'
  | 'other';

/** 플레이어 장부 한 줄 */
export interface LedgerEntry {
  date: GameDate;
  category: LedgerCategory;
  /** 수입 +, 지출 − (유로 정수) */
  amount: Money;
  /** 관련 말(없으면 null) */
  horseId: HorseId | null;
}

/** 종류별 합계 (없는 종류는 0 으로 본다) */
export type LedgerTotals = Partial<Record<LedgerCategory, Money>>;

/** 연말 경제 요약 한 해(인플레 검증·연간 손익 화면용) */
export interface EconomyYearSummary {
  year: number;
  /** 플레이어 종류별 합계 */
  player: LedgerTotals;
  /** AI 마주 전체 종류별 합계 */
  aiTotals: LedgerTotals;
  /** 연말 AI 마주 자금 중앙값·합계 */
  aiFundsMedian: Money;
  aiFundsTotal: Money;
  /** 연말 플레이어 자금·빚 */
  playerFunds: Money;
  playerDebt: Money;
}

/** 경제 상태 */
export interface EconomyState {
  mode: EconomyMode;
  /** 플레이어 빚(캐주얼 모드에서 자금이 모자랄 때 쌓임). 0 이상 */
  debt: Money;
  /** 플레이어 자금이 음수였던 연속 주 수(레거시 파산 판정) */
  negativeWeeks: number;
  /** 레거시 모드 파산 여부. true 면 게임 진행이 멈춘다 */
  bankrupt: boolean;
  /** 플레이어 장부(최근 항목, 보존 기간은 config) */
  playerLedger: LedgerEntry[];
  /** 올해 진행 중인 합계(연말에 yearSummaries 로 옮기고 비운다) */
  currentYear: { player: LedgerTotals; aiTotals: LedgerTotals };
  /** 지난 해 요약. 오래된 순 */
  yearSummaries: EconomyYearSummary[];
}

/** 관계 상대 종류 */
export type RelationKind = 'owner' | 'trainer' | 'jockey';

/** 관계 키: `${kind}:${id}` (예 'owner:ow-000012') */
export type RelationKey = `owner:${OwnerId}` | `trainer:${TrainerId}` | `jockey:${JockeyId}`;

/**
 * 플레이어 전속 계약(M4-B3, 사용자 결정 2026-10-12: 관계 고정이 아닌 특수 취급).
 * 계약 중: 내 말 우선 기승·위탁, 코멘트 정확도 보너스, 관계 하한·상승 가속. 만료 연도 말에 관계로 갱신 판정.
 */
export interface RetainerContract {
  kind: 'trainer' | 'jockey';
  /** TrainerId 또는 JockeyId */
  personId: string;
  startYear: number;
  /** 이 해 말(연도 전환 때) 갱신 판정 */
  endYear: number;
  /** 연간 계약금(유로 정수). 매년 연도 전환 때 지불 */
  annualFee: Money;
}

/** 관계·명성 상태 */
export interface RelationsState {
  /** 플레이어와 상대의 관계값(−100 ~ 100). 없는 키 = 0(처음 보는 사이) */
  values: Partial<Record<RelationKey, number>>;
  /** 플레이어 전체 명성(0 ~ 100) */
  reputation: number;
  /** 플레이어 전속 계약(조교사·기수). 같은 사람과 계약은 하나 */
  contracts: RetainerContract[];
}
