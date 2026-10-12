/**
 * 장부 (M4-A2a). 마주 자금을 바꾸는 모든 곳은 recordMoney 하나를 거친다.
 * 플레이어는 항목(playerLedger)과 올해 합계(currentYear.player)를, AI 마주는 올해 합계(currentYear.aiTotals)만 남긴다.
 * 연말에 closeEconomyYear 가 그해 요약을 만들고, prunePlayerLedger 가 오래된 플레이어 항목을 지운다.
 */
import { PLAYER_LEDGER_KEEP_WEEKS } from '../config/economy';
import { weeksBetween } from '../time/calendar';
import type {
  EconomyYearSummary,
  GameDate,
  GameState,
  HorseId,
  LedgerCategory,
  LedgerTotals,
  Money,
  OwnerId,
} from '../types';

/** 합계 한 칸에 금액을 더한다(없던 종류는 0 에서 시작) */
function addToTotals(totals: LedgerTotals, category: LedgerCategory, amount: Money): void {
  totals[category] = (totals[category] ?? 0) + amount;
}

/** 종류별 합계의 전체 합(없는 종류는 0) */
export function ledgerTotalsSum(t: LedgerTotals): Money {
  let sum = 0;
  for (const value of Object.values(t)) {
    sum += value ?? 0;
  }
  return sum;
}

/**
 * 마주 자금을 amount 만큼 바꾸고 장부에 남긴다. draft 를 직접 고친다.
 * amount 는 정수여야 하며(아니면 RangeError), 0 이면 아무것도 하지 않는다.
 * 플레이어면 playerLedger 항목과 currentYear.player 합계, AI 면 currentYear.aiTotals 합계만 갱신한다.
 */
export function recordMoney(
  draft: GameState,
  ownerId: OwnerId,
  category: LedgerCategory,
  amount: Money,
  date: GameDate,
  horseId: HorseId | null = null,
): void {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`recordMoney: 금액은 정수여야 한다: ${amount}`);
  }
  if (amount === 0) return;

  const owner = draft.owners[ownerId];
  if (owner === undefined) {
    throw new Error(`recordMoney: 마주가 없음: ${ownerId}`);
  }
  owner.funds += amount;

  const economy = draft.economy;
  if (ownerId === draft.playerOwnerId) {
    economy.playerLedger.push({
      date: { year: date.year, week: date.week },
      category,
      amount,
      horseId,
    });
    addToTotals(economy.currentYear.player, category, amount);
  } else {
    addToTotals(economy.currentYear.aiTotals, category, amount);
  }
}

/** 플레이어 장부에서 보존 기간(PLAYER_LEDGER_KEEP_WEEKS)보다 오래된 항목을 지운다. 기준 날짜는 date */
export function prunePlayerLedger(draft: GameState, date: GameDate): void {
  draft.economy.playerLedger = draft.economy.playerLedger.filter(
    (entry) => weeksBetween(entry.date, date) <= PLAYER_LEDGER_KEEP_WEEKS,
  );
}

/** 정렬된 숫자 배열의 중앙값. 짝수 개면 가운데 두 값의 평균을 내림한다. 비었으면 0 */
function medianOf(sorted: readonly Money[]): Money {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  const upper = sorted[mid] ?? 0;
  if (n % 2 === 1) return upper;
  const lower = sorted[mid - 1] ?? 0;
  return Math.floor((lower + upper) / 2);
}

/**
 * 연말 요약: currentYear 를 EconomyYearSummary 로 만들어 yearSummaries 끝에 붙이고 currentYear 를 비운다.
 * AI 자금 중앙값·합계는 플레이어를 뺀 마주 기준이다. 같은 year 를 이미 닫았으면 아무것도 하지 않는다.
 */
export function closeEconomyYear(draft: GameState, year: number): void {
  const economy = draft.economy;
  if (economy.yearSummaries.some((s) => s.year === year)) return;

  const player = draft.owners[draft.playerOwnerId];
  if (player === undefined) {
    throw new Error(`closeEconomyYear: 플레이어 마주가 없음: ${draft.playerOwnerId}`);
  }

  const aiFunds: Money[] = [];
  for (const owner of Object.values(draft.owners)) {
    if (owner.id !== draft.playerOwnerId) aiFunds.push(owner.funds);
  }
  aiFunds.sort((a, b) => a - b);
  let aiFundsTotal = 0;
  for (const f of aiFunds) aiFundsTotal += f;

  const summary: EconomyYearSummary = {
    year,
    player: { ...economy.currentYear.player },
    aiTotals: { ...economy.currentYear.aiTotals },
    aiFundsMedian: medianOf(aiFunds),
    aiFundsTotal,
    playerFunds: player.funds,
    playerDebt: economy.debt,
  };
  economy.yearSummaries.push(summary);
  economy.currentYear = { player: {}, aiTotals: {} };
}
