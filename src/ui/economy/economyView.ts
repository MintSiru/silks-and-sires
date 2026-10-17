import { displayName } from '../../engine/naming/register';
/**
 * 경제 화면 뷰 모델 (M4-A4). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 금액은 장부 값 그대로(수입 +, 지출 −)이며, € 표기와 부호 표기는 화면 쪽에서 한다.
 */
import { LEGACY_BANKRUPT_WEEKS } from '../../engine/config/economy';
import { ledgerTotalsSum } from '../../engine/economy/ledger';
import { formatDateKo } from '../../engine/time/calendar';
import type { EconomyMode, GameDate, GameState, LedgerCategory, LedgerTotals, Money } from '../../engine/types';
import { ledgerCategoryKo } from '../game/text';

/** 최근 장부 기본 표시 개수(화면 표시 개수이므로 밸런스 상수가 아니다) */
export const RECENT_LEDGER_COUNT = 30;
/** 연도별 막대 최대 길이(%) */
const BAR_FULL_PERCENT = 100;

function playerOwnerOf(state: GameState) {
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) {
    throw new Error(`경제 뷰: 플레이어 마주가 없음: ${state.playerOwnerId}`);
  }
  return owner;
}

// ── 상단 자금 배너 ──────────────────────────────────────────────

export interface FundsWarning {
  /** bankrupt: 레거시 파산 · debt: 캐주얼 빚 있음 · negative: 레거시 자금 마이너스 */
  kind: 'debt' | 'negative' | 'bankrupt';
  /** negative 일 때 파산까지 남은 주 수. 그 밖에는 null */
  weeksLeft: number | null;
}

export interface FundsBannerView {
  funds: Money;
  debt: Money;
  mode: EconomyMode;
  warning: FundsWarning | null;
}

/** 경고 우선순위: 파산 > 빚 > 자금 마이너스(레거시만). 해당 없으면 null */
function warningOf(state: GameState, funds: Money): FundsWarning | null {
  const economy = state.economy;
  if (economy.bankrupt) return { kind: 'bankrupt', weeksLeft: null };
  if (economy.debt > 0) return { kind: 'debt', weeksLeft: null };
  if (economy.mode === 'legacy' && funds < 0) {
    return { kind: 'negative', weeksLeft: Math.max(0, LEGACY_BANKRUPT_WEEKS - economy.negativeWeeks) };
  }
  return null;
}

/** 모든 탭 위 배너용 자금 정보 */
export function fundsBanner(state: GameState): FundsBannerView {
  const funds = playerOwnerOf(state).funds;
  return {
    funds,
    debt: state.economy.debt,
    mode: state.economy.mode,
    warning: warningOf(state, funds),
  };
}

// ── 손익표 ──────────────────────────────────────────────────────

export interface PnlLine {
  category: LedgerCategory;
  /** 수입 행이면 +, 지출 행이면 − */
  amount: Money;
}

export interface YearPnlView {
  year: number;
  /** true 면 올해(진행 중) 합계, false 면 지난 해 요약 */
  current: boolean;
  /** 수입 행: 금액 큰 순(같으면 종류 이름순) */
  income: PnlLine[];
  /** 지출 행: 금액 절댓값 큰 순(같으면 종류 이름순) */
  expense: PnlLine[];
  /** 수입 합계(0 이상) */
  incomeTotal: Money;
  /** 지출 합계(0 이하) */
  expenseTotal: Money;
  /** 순익 = 수입 합계 + 지출 합계 (= 장부 합) */
  net: Money;
}

/** 종류 이름순(같은 금액일 때 정렬을 고정하려고 쓴다) */
function byCategory(a: PnlLine, b: PnlLine): number {
  return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
}

function sumAmounts(lines: readonly PnlLine[]): Money {
  let sum = 0;
  for (const line of lines) sum += line.amount;
  return sum;
}

function buildYearPnl(year: number, current: boolean, totals: LedgerTotals): YearPnlView {
  const income: PnlLine[] = [];
  const expense: PnlLine[] = [];
  for (const [key, amount] of Object.entries(totals)) {
    if (amount === undefined || amount === 0) continue;
    const line: PnlLine = { category: key as LedgerCategory, amount };
    if (amount > 0) income.push(line);
    else expense.push(line);
  }
  income.sort((a, b) => b.amount - a.amount || byCategory(a, b));
  expense.sort((a, b) => a.amount - b.amount || byCategory(a, b));

  const incomeTotal = sumAmounts(income);
  const expenseTotal = sumAmounts(expense);
  return { year, current, income, expense, incomeTotal, expenseTotal, net: incomeTotal + expenseTotal };
}

/**
 * 손익표. year 가 없으면 올해(currentYear.player). year 가 있으면 yearSummaries 에서 그 해를 찾고,
 * 없지만 올해와 같은 해이면 올해 합계를 준다. 그 밖의 해는 null.
 */
export function yearPnl(state: GameState, year?: number): YearPnlView | null {
  const economy = state.economy;
  if (year === undefined) {
    return buildYearPnl(state.date.year, true, economy.currentYear.player);
  }
  const summary = economy.yearSummaries.find((s) => s.year === year);
  if (summary !== undefined) {
    return buildYearPnl(summary.year, false, summary.player);
  }
  if (year === state.date.year) {
    return buildYearPnl(year, true, economy.currentYear.player);
  }
  return null;
}

// ── 최근 장부 ───────────────────────────────────────────────────

export interface LedgerRowView {
  date: GameDate;
  dateLabel: string;
  category: LedgerCategory;
  /** 수입 +, 지출 − */
  amount: Money;
  /** 관련 말 이름. 말과 관계없는 항목이면 null */
  horseName: string | null;
}

/** 최근 장부 항목(최신순) limit 개. 말 이름이 사라졌으면 말 id 를 그대로 보인다 */
export function recentLedger(state: GameState, limit: number = RECENT_LEDGER_COUNT): LedgerRowView[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`recentLedger: limit 은 0 이상의 정수여야 한다: ${limit}`);
  }
  const entries = state.economy.playerLedger;
  const start = Math.max(0, entries.length - limit);
  const rows: LedgerRowView[] = [];
  for (let i = entries.length - 1; i >= start; i--) {
    const entry = entries[i];
    if (entry === undefined) continue;
    rows.push({
      date: { year: entry.date.year, week: entry.date.week },
      dateLabel: formatDateKo(entry.date),
      category: entry.category,
      amount: entry.amount,
      horseName:
        entry.horseId === null ? null : ((state.horses[entry.horseId] === undefined ? entry.horseId : displayName(state, state.horses[entry.horseId]!))),
    });
  }
  return rows;
}

// ── 연도별 추이 ─────────────────────────────────────────────────

export interface PnlHistoryRow {
  year: number;
  /** 그 해 순익(장부 합) */
  net: Money;
  /** 연말 플레이어 자금 */
  playerFunds: Money;
  /** 연말 플레이어 빚 */
  playerDebt: Money;
  /** 막대 길이(0~100, 모든 해 중 |순익| 최대 기준) */
  barPercent: number;
  /** 순익이 0 이상이면 true */
  positive: boolean;
}

/** 지난 해 추이(오래된 순). 올해는 연말이 아니므로 넣지 않는다 */
export function pnlHistory(state: GameState): PnlHistoryRow[] {
  const summaries = state.economy.yearSummaries;
  const nets = summaries.map((s) => ledgerTotalsSum(s.player));
  let maxAbs = 0;
  for (const net of nets) maxAbs = Math.max(maxAbs, Math.abs(net));

  return summaries.map((s, i) => {
    const net = nets[i] ?? 0;
    return {
      year: s.year,
      net,
      playerFunds: s.playerFunds,
      playerDebt: s.playerDebt,
      barPercent: maxAbs === 0 ? 0 : Math.round((Math.abs(net) / maxAbs) * BAR_FULL_PERCENT),
      positive: net >= 0,
    };
  });
}

// ── 경영 화면 표시 이름·판정·주별 묶음(M6-U9) ──────────────────────

/**
 * 장부 종류 중 화면 이름을 다르게 보이는 것. 장부 종류 자체와 text.ts 는 바꾸지 않는다.
 * 시설은 'facility'(주간 유지비)와 'facility_build'(공사비)로 나뉘어 text.ts 이름을 그대로 쓴다.
 */
const LEDGER_DISPLAY_OVERRIDE: Partial<Record<LedgerCategory, string>> = {
  farm_upkeep: '목장 기본 유지비',
};

/** 장부 종류의 화면 이름. 예: 'farm_upkeep' → '목장 기본 유지비' */
export function ledgerDisplayName(category: LedgerCategory): string {
  return LEDGER_DISPLAY_OVERRIDE[category] ?? ledgerCategoryKo(category);
}

export interface ExpenseShare extends PnlLine {
  /** 화면 이름 */
  label: string;
  /** 지출 합계 대비 비중(0~100, 반올림) */
  percent: number;
}

/** 지출 행마다 지출 합계 대비 비중을 붙인다. total 은 지출 합계(0 이하). 합계가 0이면 모두 0 */
export function expenseShares(lines: readonly PnlLine[], total: Money): ExpenseShare[] {
  const base = Math.abs(total);
  return lines.map((line) => ({
    ...line,
    label: ledgerDisplayName(line.category),
    percent: base === 0 ? 0 : Math.round((Math.abs(line.amount) / base) * BAR_FULL_PERCENT),
  }));
}

/** 운영 판정 칩의 톤. good 좋음 · warn 주의 · danger 위험 (상태 색 3종과 같다) */
export type OperatingTone = 'good' | 'warn' | 'danger';

export interface OperatingVerdict {
  tone: OperatingTone;
  label: string;
}

export interface VerdictInput {
  /** 판정할 해의 순익 */
  net: Money;
  /** 현재 자금 */
  funds: Money;
  /** 현재 빚 */
  debt: Money;
  /** 레거시 파산 여부 */
  bankrupt: boolean;
}

/**
 * 운영 판정 칩. 순익·자금·빚으로 나눈다(화면 판정 기준이며 밸런스 수치가 아니다).
 * - 적자 위험: 파산, 빚이 있음, 자금이 마이너스, 또는 자금이 이 해 적자를 감당하지 못함
 * - 지출 주의: 이 해 순익이 적자
 * - 운영 여유: 그 밖
 */
export function operatingVerdict(input: VerdictInput): OperatingVerdict {
  const { net, funds, debt, bankrupt } = input;
  if (bankrupt || debt > 0 || funds < 0 || funds + Math.min(net, 0) < 0) {
    return { tone: 'danger', label: '적자 위험' };
  }
  if (net < 0) return { tone: 'warn', label: '지출 주의' };
  return { tone: 'good', label: '운영 여유' };
}

export interface LedgerWeekGroup {
  /** 연·주로 만든 묶음 키 */
  key: string;
  /** 묶음의 날짜 표기(첫 항목 기준) */
  dateLabel: string;
  /** 묶음 합계(수입 +, 지출 −) */
  net: Money;
  /** 묶음 안의 개별 거래(입력의 최신순 유지) */
  rows: LedgerRowView[];
}

/** 최신순 장부 행을 같은 연·주끼리 묶는다. 입력 순서를 그대로 유지한다. */
export function ledgerWeekGroups(rows: readonly LedgerRowView[]): LedgerWeekGroup[] {
  const groups: LedgerWeekGroup[] = [];
  for (const row of rows) {
    const key = `${row.date.year}-${row.date.week}`;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) {
      last.rows.push(row);
      last.net += row.amount;
    } else {
      groups.push({ key, dateLabel: row.dateLabel, net: row.amount, rows: [row] });
    }
  }
  return groups;
}
