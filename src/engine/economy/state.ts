import { STARTING_REPUTATION } from '../config/economy';
import type { EconomyMode, EconomyState, RelationsState, SalesState } from '../types';

/** 빈 경제 상태(새 게임·저장 이주용) */
export function createEmptyEconomyState(mode: EconomyMode): EconomyState {
  return {
    mode,
    debt: 0,
    negativeWeeks: 0,
    bankrupt: false,
    playerLedger: [],
    currentYear: { player: {}, aiTotals: {} },
    yearSummaries: [],
  };
}

/** 빈 관계 상태(새 게임·저장 이주용) */
export function createEmptyRelationsState(): RelationsState {
  return { values: {}, reputation: STARTING_REPUTATION, contracts: [] };
}

/** 빈 세일 상태(새 게임·저장 이주용, M4-C2a) */
export function createEmptySalesState(): SalesState {
  return {
    catalogues: [],
    consignments: [],
    playerBids: [],
    history: [],
    playerSpendByYear: {},
    privateOffers: [],
    nextPrivateOfferNo: 1,
  };
}
