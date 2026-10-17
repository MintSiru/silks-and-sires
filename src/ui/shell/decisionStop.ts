/**
 * 중요 결정 앞 정지(M6-T3). 진행 버튼(4주 진행·다음 내 출주까지)이 플레이어 결정 직전에 멈추도록 상태만 읽어 판정한다.
 * 엔진은 바꾸지 않는다. 사유는 한국어 한 줄이고, 여러 개가 겹치면 아래 순서(a → f)의 첫 번째를 쓴다.
 */
import { matingAutoBookWeek } from '../../engine/breeding/matingPlan';
import { getSalesData } from '../../engine/data/staticData';
import { yearEndPending } from '../../engine/stud/yearEnd';
import { announceWeekOf } from '../../engine/sales/system';
import { saleWeekOf } from '../../engine/sales/bidding';
import { compareDates, formatDateKo } from '../../engine/time/calendar';
import type { GameDate, GameState, SaleEventDef } from '../../engine/types';

/**
 * 위탁 마감 주 = 발표 주 − 1. 자동 위탁(consignDue)은 이 주를 진행할 때 돈다(engine/sales/autoSell.ts 와 같은 규칙).
 * 달력 간격이라 밸런스 상수가 아니다.
 */
const CONSIGN_DEADLINE_OFFSET_WEEKS = 1;

const SALE_EVENTS: ReadonlyMap<string, SaleEventDef> = new Map(
  (getSalesData().events ?? []).map((e) => [e.id, e] as const),
);

/** 세일 정의를 id 순으로(엔진이 세일을 만드는 순서와 같다). 목록 결과의 순서 기준 */
const SALES_BY_ID: readonly SaleEventDef[] = [...SALE_EVENTS.values()].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
);

/** (a) 이번 주가 위탁 마감인 판매 제안 수(아직 검토 대기인 것만) */
function consignDeadlineCount(state: GameState): number {
  return (state.sales.sellProposals ?? []).filter((p) => {
    if (p.status !== 'proposed' || p.year !== state.date.year) return false;
    const event = SALE_EVENTS.get(p.saleId);
    return event !== undefined && announceWeekOf(event) - CONSIGN_DEADLINE_OFFSET_WEEKS === state.date.week;
  }).length;
}

/**
 * (b) 교배 자동 예약 주에 빼지 않은 교배 제안 수. 기본 진행 방식(autoApproveMatings 없음)에서만 자동 예약되므로
 * true(즉시 예약)·false(승인한 것만) 설정이면 0.
 */
function matingAutoBookCount(state: GameState): number {
  if (state.date.week !== matingAutoBookWeek(state) || state.settings.autoApproveMatings !== undefined) return 0;
  return (state.stud.matingProposals ?? []).filter(
    (p) => p.season === state.date.year && p.status === 'proposed',
  ).length;
}

/** (c) 승인제(autoApproveRacePlans === false)에서 이번 주 출주 대상 계획 중 승인 대기인 수 */
function racePlanApprovalCount(state: GameState): number {
  if (state.settings.autoApproveRacePlans !== false) return 0;
  let count = 0;
  for (const plans of Object.values(state.seasonState.racePlans ?? {})) {
    count += plans.filter((p) => p.status === 'proposed' && compareDates(p.date, state.date) === 0).length;
  }
  return count;
}

/**
 * (e) 방금 카탈로그가 발표된 세일. 카탈로그는 발표 주(announceWeekOf)를 진행할 때 만들어지므로, 화면에 카탈로그가
 * 보이는 다음 주(발표 주 + 1) 상태에서 멈춘다(Opus 수정 — 발표 주 상태에는 아직 '발표 전'으로 보인다).
 * 순서는 세일 id 순. 여럿이면 첫 번째 세일 이름에 '외 N건'을 붙인다.
 */
export function announcedSalesOf(state: GameState): SaleEventDef[] {
  return SALES_BY_ID.filter((e) => announceWeekOf(e) + 1 === state.date.week
    && state.sales.catalogues.some((c) => c.saleId === e.id && c.year === state.date.year));
}

/**
 * 이번 주가 거래 주(로트의 판매 주 = saleWeekOf)인 세일 가운데 lotFilter 를 통과한 로트가 있는 세일, id 순.
 * 아직 결과가 없는 로트만 본다(거래 주 처리 전 상태). 카탈로그가 없는 세일은 제외.
 */
function tradingSalesWhere(
  state: GameState,
  lotFilter: (saleId: string, year: number, lotNo: number) => boolean,
): SaleEventDef[] {
  const ids = new Set<string>();
  for (const catalogue of state.sales.catalogues) {
    if (catalogue.status !== 'catalogued') continue;
    const event = SALE_EVENTS.get(catalogue.saleId);
    if (event === undefined) continue;
    const due = catalogue.lots.some(
      (lot) =>
        lot.result === null &&
        lotFilter(catalogue.saleId, catalogue.year, lot.lotNo) &&
        compareDates(saleWeekOf(event, catalogue.year, lot), state.date) === 0,
    );
    if (due) ids.add(event.id);
  }
  return SALES_BY_ID.filter((e) => ids.has(e.id));
}

/** 이번 주가 거래 주인 세일(입찰 여부와 무관). 홈 브리핑 '이번 주 세일' 줄이 쓴다 */
export function tradingSalesOf(state: GameState): SaleEventDef[] {
  return tradingSalesWhere(state, () => true);
}

/** (f) 이번 주가 거래 주인 세일 가운데 플레이어가 상한을 넣은 로트가 있는 세일, id 순 */
export function biddenTradingSalesOf(state: GameState): SaleEventDef[] {
  return tradingSalesWhere(state, (saleId, year, lotNo) =>
    state.sales.playerBids.some((b) => b.saleId === saleId && b.year === year && b.lotNo === lotNo),
  );
}

/** 세일 이름 한 줄: 여럿이면 첫 번째 이름 + ' 외 N건' */
function saleNameText(sales: readonly SaleEventDef[]): string {
  const [first] = sales;
  if (first === undefined) return '';
  return sales.length > 1 ? `${first.name} 외 ${sales.length - 1}건` : first.name;
}

/** (e) 사유 문구. 거래 날짜는 세일 시작 주(세일 화면의 거래 날짜와 같다) */
function announcedSalesReason(state: GameState): string | null {
  const sales = announcedSalesOf(state);
  const [first] = sales;
  if (first === undefined) return null;
  const date = formatDateKo({ year: state.date.year, week: first.week });
  return `${saleNameText(sales)} 카탈로그가 발표됐습니다(거래 ${date}). 세일 화면에서 확인하세요.`;
}

/** (f) 사유 문구. 입찰이 있는 세일의 거래 주 */
function biddenTradeReason(state: GameState): string | null {
  const sales = biddenTradingSalesOf(state);
  if (sales.length === 0) return null;
  return `${saleNameText(sales)} 거래 주입니다. 실시간 보기로 경매를 볼 수 있습니다.`;
}

/**
 * 이번 주 플레이어가 확인해야 할 결정의 사유. 없으면 null.
 * (a) 판매 제안 위탁 마감 (b) 교배 자동 예약 주의 검토 안 한 제안 (c) 승인제의 이번 주 출주 승인 대기 (d) 연말 정산 대기
 * (e) 이번 주 카탈로그 발표 세일 (f) 입찰한 세일의 거래 주. (e)(f) 는 settings.stopAtSales === false 면 보지 않는다(M7-E).
 */
export function decisionStopReason(state: GameState): string | null {
  const sales = consignDeadlineCount(state);
  if (sales > 0) return `판매 제안 ${sales}건의 위탁 마감이 이번 주입니다. 세일 화면에서 확인하세요.`;
  const matings = matingAutoBookCount(state);
  if (matings > 0) return `빼지 않은 교배 제안 ${matings}건이 이번 주 자동 예약됩니다. 번식 화면에서 확인하세요.`;
  const plans = racePlanApprovalCount(state);
  if (plans > 0) return `승인 대기 출주 계획 ${plans}건이 이번 주 출주 대상입니다. 말 상세에서 승인하세요.`;
  if (yearEndPending(state)) return '연말 정산을 제출해야 합니다. 홈에서 제출하세요.';
  if (state.settings.stopAtSales === false) return null;
  return announcedSalesReason(state) ?? biddenTradeReason(state);
}

/** advanceUntil 에 넘기는 정지 조건과 멈춘 사유를 묶은 것 */
export interface DecisionStop {
  /** 매 주 진행 뒤 호출된다. true 면 그 주에서 멈춘다 */
  readonly stop: (state: GameState) => boolean;
  /** 마지막으로 멈춘 사유. 멈추지 않았으면 null */
  readonly reason: string | null;
}

/**
 * 진행 시작 주(start)의 사유는 무시한다. 정지 조건은 주를 진행한 뒤에만 불리므로 첫 주는 항상 진행되고,
 * 같은 사유 때문에 0주 진행에 묶이지 않는다. 시작 주와 같은 날짜의 상태는 멈추지 않는다.
 */
export function decisionStopFrom(start: GameDate): DecisionStop {
  let reason: string | null = null;
  return {
    stop: (state: GameState): boolean => {
      reason = compareDates(state.date, start) === 0 ? null : decisionStopReason(state);
      return reason !== null;
    },
    get reason() {
      return reason;
    },
  };
}
