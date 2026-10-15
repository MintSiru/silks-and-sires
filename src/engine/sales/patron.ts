/** 세일 후원 등급과 화면용 진행 정보. 올해·지난해 플레이어 낙찰가만 센다. */
import {
  SALE_PATRON_GOLD_SPEND,
  SALE_PATRON_PREMIUM_DISCOUNT,
  SALE_PATRON_SILVER_SPEND,
} from '../config/sales';
import type { GameState, Money, SaleEventDef } from '../types';

export type SalePatronTier = 'none' | 'silver' | 'gold';

export function patronView(state: GameState): {
  tier: SalePatronTier;
  spendTwoYears: Money;
  nextTier: 'silver' | 'gold' | null;
  toNext: Money | null;
} {
  const year = state.date.year;
  const spendTwoYears = (state.sales.playerSpendByYear[year] ?? 0) + (state.sales.playerSpendByYear[year - 1] ?? 0);
  const tier = spendTwoYears >= SALE_PATRON_GOLD_SPEND ? 'gold'
    : spendTwoYears >= SALE_PATRON_SILVER_SPEND ? 'silver' : 'none';
  const nextTier = tier === 'gold' ? null : tier === 'silver' ? 'gold' : 'silver';
  const toNext = nextTier === null ? null
    : (nextTier === 'gold' ? SALE_PATRON_GOLD_SPEND : SALE_PATRON_SILVER_SPEND) - spendTwoYears;
  return { tier, spendTwoYears, nextTier, toNext };
}

/** 현재 state 기준 플레이어 실효 구매 수수료율. AI 구매에는 적용하지 않는다. */
export function playerPremiumRate(state: GameState, event: SaleEventDef): number {
  return Math.max(0, event.buyerPremiumRate - SALE_PATRON_PREMIUM_DISCOUNT[patronView(state).tier]);
}
