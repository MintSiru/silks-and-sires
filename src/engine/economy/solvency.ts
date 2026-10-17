/**
 * 자금 판정 (M4-A3). 매주 정기 비용(costs) 다음에 돈다.
 * - 플레이어 캐주얼: 음수 자금은 빚으로 옮기고, 빚에는 주간 이자가 붙으며, 자금이 넉넉하면 빚을 자동 상환한다.
 *   빚 이동·상환은 자산 이동이라 장부(playerLedger)에 남기지 않는다. 이자만 장부에 'interest' 로 남긴다.
 * - 플레이어 레거시: 자금 마이너스가 LEGACY_BANKRUPT_WEEKS 주 연속이면 파산한다(advanceWeek 가 이후 진행을 멈춘다).
 * - AI 마주(모드 무관): 자금이 음수면 보유 현역마 중 평가값이 가장 낮은 말 1두를 같은 나라의 가장 부유한 AI 마주에게 급매한다.
 * 난수 미사용. 모든 순회는 ID 오름차순이라 같은 상태 → 같은 결과.
 */
import {
  DEBT_CAP_FALLBACK,
  DEBT_CAP_YEARS_OF_COSTS,
  DEBT_INTEREST_BASE_CAP,
  DEBT_INTEREST_WEEKLY,
  DEBT_REPAY_BUFFER,
  DISTRESS_PRICE_BASE_OR,
  DISTRESS_PRICE_MIN,
  DISTRESS_PRICE_PER_OR,
  LEGACY_BANKRUPT_WEEKS,
  LEGACY_WARNING_INTERVAL_WEEKS,
} from '../config/economy';
import { isRacingHorse } from '../world/population';
import { meanAbility, ratingFromAbility } from '../world/rating';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  Money,
  Owner,
  OwnerId,
  WeeklySystem,
} from '../types';
import { recordLedgerOnly, recordMoney } from './ledger';

/** 선발·급매 기준 평가값: OR 이 있으면 OR, 없으면 잠재 능력 평균을 OR 척도로 환산(populationSystem.selectionValue 와 같은 방식) */
function valueOf(horse: Horse): number {
  return horse.officialRating ?? ratingFromAbility(meanAbility(horse.potential));
}

/** AI 급매 가격(€, 정수). 평가값이 기준보다 높을수록 비싸며 최저가 아래로 내려가지 않는다 */
export function distressPrice(value: number): Money {
  return Math.max(DISTRESS_PRICE_MIN, Math.round((value - DISTRESS_PRICE_BASE_OR) * DISTRESS_PRICE_PER_OR));
}

/**
 * 지출 가능 여부(임의 지출: 교배 예약·세일 구매 등). 기본 대상은 플레이어.
 * - 자금이 음수면 false.
 * - 플레이어 캐주얼 모드에서 빚이 있으면 false.
 * - 그 밖에는 자금 ≥ amount.
 */
export function canSpendDiscretionary(state: GameState, amount: Money, ownerId: OwnerId = state.playerOwnerId): boolean {
  const owner = state.owners[ownerId];
  if (owner === undefined) return false;
  if (owner.funds < 0) return false;
  if (ownerId === state.playerOwnerId && state.economy.mode === 'casual' && state.economy.debt > 0) return false;
  return owner.funds >= amount;
}

/** 캐주얼 모드 플레이어 판정: 음수 → 빚, 빚 이자, 자동 상환, 빚 시작 경고(0 → 양수 전환 때 한 번) */
function settleCasual(draft: GameState, player: Owner, date: GameDate, events: GameEvent[]): void {
  const economy = draft.economy;
  const debtBefore = economy.debt;

  if (player.funds < 0) {
    economy.debt += -player.funds;
    player.funds = 0;
  }
  if (debtBefore === 0 && economy.debt > 0) {
    events.push({ type: 'economy_warning', kind: 'debt_started', weeksLeft: null, date });
  }

  // 빚 상한: 지난해 지출 DEBT_CAP_YEARS_OF_COSTS 년분(넘는 몫 탕감 — 캐주얼 전용)
  const last = economy.yearSummaries.at(-1)?.player;
  const lastCosts = last === undefined ? 0 : -Object.values(last).reduce((sum, v) => sum + Math.min(0, v ?? 0), 0);
  const debtCap = lastCosts > 0 ? Math.round(lastCosts * DEBT_CAP_YEARS_OF_COSTS) : DEBT_CAP_FALLBACK;
  if (economy.debt > debtCap) economy.debt = debtCap;

  if (economy.debt > 0) {
    const interest = Math.round(Math.min(economy.debt, DEBT_INTEREST_BASE_CAP) * DEBT_INTEREST_WEEKLY);
    if (interest > 0) {
      economy.debt += interest;
      recordLedgerOnly(draft, player.id, 'interest', -interest, date);
    }
  }

  if (economy.debt > 0 && player.funds > DEBT_REPAY_BUFFER) {
    const repay = Math.min(economy.debt, player.funds - DEBT_REPAY_BUFFER);
    player.funds -= repay;
    economy.debt -= repay;
  }
}

/** 레거시 모드 플레이어 판정: 음수 연속 주 수, 경고 주기, 파산 */
function settleLegacy(draft: GameState, player: Owner, date: GameDate, events: GameEvent[]): void {
  const economy = draft.economy;
  if (player.funds >= 0) {
    economy.negativeWeeks = 0;
    return;
  }

  economy.negativeWeeks += 1;
  if (economy.negativeWeeks >= LEGACY_BANKRUPT_WEEKS) {
    economy.bankrupt = true;
    events.push({ type: 'bankrupt', date });
    return;
  }
  if ((economy.negativeWeeks - 1) % LEGACY_WARNING_INTERVAL_WEEKS === 0) {
    events.push({
      type: 'economy_warning',
      kind: 'negative_funds',
      weeksLeft: LEGACY_BANKRUPT_WEEKS - economy.negativeWeeks,
      date,
    });
  }
}

/** 같은 나라의 가장 부유한 AI 마주(자금 같으면 ID 오름차순). 없으면 null */
function richestAiBuyerIn(draft: GameState, seller: Owner): Owner | null {
  let best: Owner | null = null;
  for (const id of Object.keys(draft.owners).sort()) {
    const owner = draft.owners[id];
    if (owner === undefined || owner.id === seller.id || owner.id === draft.playerOwnerId) continue;
    if (owner.country !== seller.country) continue;
    if (best === null || owner.funds > best.funds) best = owner;
  }
  return best;
}

/** 말 한 두를 소유자 간에 옮긴다(horseIds 와 horse.ownerId 를 함께 갱신) */
function transferHorse(horse: Horse, seller: Owner, buyer: Owner): void {
  horse.ownerId = buyer.id;
  seller.horseIds = seller.horseIds.filter((id) => id !== horse.id);
  if (!buyer.horseIds.includes(horse.id)) {
    buyer.horseIds = [...buyer.horseIds, horse.id].sort();
  }
}

/**
 * AI 급매: 자금이 음수인 AI 마주마다(ID 순) 보유 현역마 중 평가값이 가장 낮은 1두를 같은 나라 최부유 AI 마주에게 판다.
 * 조교사는 그대로 둔다. AI 끼리의 거래이므로 이벤트는 남기지 않는다(플레이어 관련 이벤트만 남긴다).
 */
function distressSales(draft: GameState, date: GameDate): void {
  const playerId = draft.playerOwnerId;
  for (const sellerId of Object.keys(draft.owners).sort()) {
    const seller = draft.owners[sellerId];
    if (seller === undefined || seller.id === playerId || seller.funds >= 0) continue;

    // 이전 판매로 말 소유가 바뀌었을 수 있으므로 판매 직전마다 다시 모은다
    let lowest: Horse | null = null;
    let lowestValue = 0;
    for (const horseId of seller.horseIds.slice().sort()) {
      const horse = draft.horses[horseId];
      if (horse === undefined || horse.ownerId !== seller.id || !isRacingHorse(draft, horse)) continue;
      const value = valueOf(horse);
      if (lowest === null || value < lowestValue) {
        lowest = horse;
        lowestValue = value;
      }
    }
    if (lowest === null) continue;

    const buyer = richestAiBuyerIn(draft, seller);
    if (buyer === null) continue;

    const price = distressPrice(lowestValue);
    recordMoney(draft, buyer.id, 'private_sale', -price, date, lowest.id);
    recordMoney(draft, seller.id, 'private_sale', price, date, lowest.id);
    transferHorse(lowest, seller, buyer);
  }
}

/**
 * 자금 판정 시스템(id 'solvency'). 순서: 플레이어 판정(모드별) → AI 급매.
 * 이벤트는 플레이어 경고·파산만 낸다.
 */
export function createSolvencySystem(): WeeklySystem {
  return {
    id: 'solvency',
    run(draft: GameState, ctx) {
      const date: GameDate = { year: ctx.date.year, week: ctx.date.week };
      const events: GameEvent[] = [];
      const player = draft.owners[draft.playerOwnerId];
      if (player === undefined) {
        throw new Error(`solvency: 플레이어 마주가 없음: ${draft.playerOwnerId}`);
      }

      if (draft.economy.mode === 'casual') {
        settleCasual(draft, player, date, events);
      } else {
        settleLegacy(draft, player, date, events);
      }
      distressSales(draft, date);
      return events;
    },
  };
}
