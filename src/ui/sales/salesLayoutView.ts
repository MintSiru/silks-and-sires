/**
 * 세일 화면 배치용 순수 함수(M6-U8). React 없이 테스트할 수 있도록 DOM 과 훅을 쓰지 않는다.
 * 탭 기본값, 진입 시 자동 선택 세일, 후원 등급 진행 막대, 일정 보조 줄·발표 안내 문구.
 */
import { SALE_PATRON_GOLD_SPEND, SALE_PATRON_SILVER_SPEND } from '../../engine/config/sales';
import { patronView, type SalePatronTier } from '../../engine/sales/patron';
import { compareDates, formatDateKo, monthOfWeek, weeksBetween } from '../../engine/time/calendar';
import type { GameDate, GameState } from '../../engine/types';
import { feeKo, patronTierKo } from '../game/text';
import type { SaleCalendarRow } from './salesView';

/** 세일 화면 하위 탭: 구매(일정·카탈로그·로트 상세) / 판매(판매 제안·개인 거래·내 말 출품) */
export type SalesTab = 'buy' | 'sell';

/** 화면에서 고른 세일(saleId + 카탈로그 연도) */
export interface SaleKey {
  saleId: string;
  year: number;
}

/** 이번 달부터 세 달. 월 번호를 연도와 합쳐 연말 경계도 처리한다. */
export function nearSaleCalendar(rows: readonly SaleCalendarRow[], date: GameDate): SaleCalendarRow[] {
  const current = date.year * 12 + monthOfWeek(date.week);
  return rows.filter((row) => {
    const offset = row.year * 12 + monthOfWeek(row.saleWeek) - current;
    return offset >= 0 && offset < 3;
  });
}

/** 기본 탭: 판매 제안이 있으면 '판매', 없으면 '구매' */
export function defaultSalesTab(sellProposalCount: number): SalesTab {
  return sellProposalCount > 0 ? 'sell' : 'buy';
}

/** 주 번호가 1 미만이면 '—' (날짜 계산 전 방어) */
function dateOrDashKo(year: number, week: number): string {
  return week < 1 ? '—' : formatDateKo({ year, week });
}

/**
 * 진입 시 자동으로 고를 세일.
 * 1) 열람 가능한 세일(발표 전이 아니고 카탈로그 로트 수가 있음) 중 거래 주가 이번 주와 가장 가까운 세일
 * 2) 없으면 발표 전 세일 중 발표 주가 가장 가까운 세일
 * 3) 둘 다 없으면 null
 * 같은 거리면 거래(발표) 시점이 이른 세일, 그다음 세일 id 순으로 고른다(결정성).
 */
export function nearestSaleKey(rows: readonly SaleCalendarRow[], date: GameDate): SaleKey | null {
  const viewable = rows.filter((row) => row.status !== 'upcoming' && row.lots !== null);
  const candidates = viewable.length > 0
    ? viewable.map((row) => ({ row, when: { year: row.year, week: row.saleWeek } }))
    : rows
        .filter((row) => row.status === 'upcoming')
        .map((row) => ({ row, when: { year: row.year, week: row.announceWeek } }));
  let best: { row: SaleCalendarRow; when: GameDate; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = Math.abs(weeksBetween(date, candidate.when));
    if (best === null || isNearer(candidate, distance, best)) {
      best = { row: candidate.row, when: candidate.when, distance };
    }
  }
  return best === null ? null : { saleId: best.row.saleId, year: best.row.year };
}

function isNearer(
  candidate: { row: SaleCalendarRow; when: GameDate },
  distance: number,
  best: { row: SaleCalendarRow; when: GameDate; distance: number },
): boolean {
  if (distance !== best.distance) return distance < best.distance;
  const order = compareDates(candidate.when, best.when);
  if (order !== 0) return order < 0;
  return candidate.row.saleId < best.row.saleId;
}

/** 일정 표 세일 이름 아래 보조 줄: '8월 · 1세마 세일 · 발표 전' */
export function saleSubLineKo(row: SaleCalendarRow): string {
  return `${row.monthKo} · ${row.kindKo} · ${row.statusKo}`;
}

/**
 * 발표 전 세일의 카탈로그 칸 안내: 발표 예정 주 · 거래 시점 · 위탁 마감.
 * 위탁 마감은 발표 주 전 주까지다(그 주에 위탁·취소할 수 있다).
 */
export function saleScheduleNoticeKo(row: SaleCalendarRow): string {
  const announce = dateOrDashKo(row.year, row.announceWeek);
  const sale = dateOrDashKo(row.year, row.saleWeek);
  const deadline = row.consignLastWeek < 1 ? '—' : `${dateOrDashKo(row.year, row.consignLastWeek)}까지`;
  return `발표 예정 ${announce} · 거래 ${sale} · 위탁 마감 ${deadline}`;
}

export interface PatronProgressView {
  tier: SalePatronTier;
  tierKo: string;
  /** 등급 배지 클래스(골드 금 · 실버 청 · 일반 회색) */
  badgeClass: string;
  /** 다음 등급까지 진행률 0~100 정수. 최고 등급이면 100 */
  percent: number;
  /** 한 줄 안내: '다음 등급 골드까지 €1,200,000' 또는 '최고 등급' */
  nextKo: string;
  /** 최근 2년 구매액 표기 */
  spendKo: string;
  /** 최고 등급 여부 */
  isMax: boolean;
}

/** 등급 배지 클래스. U1 배지 토큰(등급 색)을 쓴다. */
export function patronTierBadgeClass(tier: SalePatronTier): string {
  if (tier === 'gold') return 'badge badge--grade-top';
  if (tier === 'silver') return 'badge badge--grade-high';
  return 'badge badge--muted';
}

/**
 * 후원 등급 진행 막대. 일반 → 실버는 0 ~ 실버 기준, 실버 → 골드는 실버 기준 ~ 골드 기준 사이의 비율이다.
 * 기준 금액은 engine/config/sales 의 상수를 쓴다.
 */
export function patronProgressView(state: GameState): PatronProgressView {
  const view = patronView(state);
  const isMax = view.nextTier === null;
  let ratio = 1;
  if (view.nextTier !== null) {
    const low = view.nextTier === 'gold' ? SALE_PATRON_SILVER_SPEND : 0;
    const high = view.nextTier === 'gold' ? SALE_PATRON_GOLD_SPEND : SALE_PATRON_SILVER_SPEND;
    ratio = (view.spendTwoYears - low) / (high - low);
  }
  const clamped = Math.min(1, Math.max(0, ratio));
  return {
    tier: view.tier,
    tierKo: patronTierKo(view.tier),
    badgeClass: patronTierBadgeClass(view.tier),
    percent: Math.round(clamped * 100),
    nextKo: view.nextTier === null
      ? '최고 등급'
      : `다음 등급 ${patronTierKo(view.nextTier)}까지 ${feeKo(view.toNext ?? 0)}`,
    spendKo: feeKo(view.spendTwoYears),
    isMax,
  };
}
