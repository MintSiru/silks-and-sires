/**
 * 중요 결정 앞 정지(M6-T3). 진행 버튼(4주 진행·다음 내 출주까지)이 플레이어 결정 직전에 멈추도록 상태만 읽어 판정한다.
 * 엔진은 바꾸지 않는다. 사유는 한국어 한 줄이고, 여러 개가 겹치면 아래 순서(a → d)의 첫 번째를 쓴다.
 */
import { MATING_AUTO_BOOK_WEEK } from '../../engine/config/mating';
import { getSalesData } from '../../engine/data/staticData';
import { yearEndPending } from '../../engine/stud/yearEnd';
import { announceWeekOf } from '../../engine/sales/system';
import { compareDates } from '../../engine/time/calendar';
import type { GameDate, GameState, SaleEventDef } from '../../engine/types';

/**
 * 위탁 마감 주 = 발표 주 − 1. 자동 위탁(consignDue)은 이 주를 진행할 때 돈다(engine/sales/autoSell.ts 와 같은 규칙).
 * 달력 간격이라 밸런스 상수가 아니다.
 */
const CONSIGN_DEADLINE_OFFSET_WEEKS = 1;

const SALE_EVENTS: ReadonlyMap<string, SaleEventDef> = new Map(
  (getSalesData().events ?? []).map((e) => [e.id, e] as const),
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
  if (state.date.week !== MATING_AUTO_BOOK_WEEK || state.settings.autoApproveMatings !== undefined) return 0;
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
 * 이번 주 플레이어가 확인해야 할 결정의 사유. 없으면 null.
 * (a) 판매 제안 위탁 마감 (b) 교배 자동 예약 주의 검토 안 한 제안 (c) 승인제의 이번 주 출주 승인 대기 (d) 연말 정산 대기
 */
export function decisionStopReason(state: GameState): string | null {
  const sales = consignDeadlineCount(state);
  if (sales > 0) return `판매 제안 ${sales}건의 위탁 마감이 이번 주입니다. 세일 화면에서 확인하세요.`;
  const matings = matingAutoBookCount(state);
  if (matings > 0) return `빼지 않은 교배 제안 ${matings}건이 이번 주 자동 예약됩니다. 번식 화면에서 확인하세요.`;
  const plans = racePlanApprovalCount(state);
  if (plans > 0) return `승인 대기 출주 계획 ${plans}건이 이번 주 출주 대상입니다. 말 상세에서 승인하세요.`;
  if (yearEndPending(state)) return '연말 정산을 제출해야 합니다. 홈에서 제출하세요.';
  return null;
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
