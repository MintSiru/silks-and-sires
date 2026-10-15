/** 세일 후원 등급과 화면용 진행 정보. 올해·지난해 플레이어 낙찰가만 센다. */
import {
  SALE_CATALOGUE_LEAD_WEEKS,
  SALE_PATRON_PREVIEW_WEEKS,
  SALE_PATRON_GOLD_SPEND,
  SALE_PATRON_PREMIUM_DISCOUNT,
  SALE_PATRON_SILVER_SPEND,
} from '../config/sales';
import type { GameState, Money, SaleEventDef, Week } from '../types';

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

/** 현재 후원 등급의 카탈로그 공개 주. */
export function catalogueVisibleWeek(event: SaleEventDef, tier: SalePatronTier): Week {
  return event.week - (SALE_CATALOGUE_LEAD_WEEKS + SALE_PATRON_PREVIEW_WEEKS[tier]);
}

/** 지난 해 카탈로그는 항상 공개하며, 미래 해 카탈로그는 공개하지 않는다. */
export function isCatalogueVisible(state: GameState, event: SaleEventDef, year: number): boolean {
  return year < state.date.year ||
    (year === state.date.year && state.date.week >= catalogueVisibleWeek(event, patronView(state).tier));
}
