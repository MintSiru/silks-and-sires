import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSalesData, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { bookForSire, buildCatalogue, type CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { playerBidValid, settleLot } from '../../src/engine/sales/auction';
import { setMaxBid } from '../../src/engine/sales/bidding';
import { patronView, playerPremiumRate } from '../../src/engine/sales/patron';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameState, SaleLot } from '../../src/engine/types';
const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const SALES = getSalesData();
const CATALOGUE_DATA: CatalogueStaticData = {
  sales: SALES,
  stallionRecords: getStallionRecords(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}


const EVENT = { ...SALES.events.find((e) => e.id === 'sev_ashcombe_yearling_oct')!, buyerPremiumRate: 0.05 };

function setup(spend: number) {
  const state = fresh();
  state.sales.playerSpendByYear = { [YEAR]: spend };
  state.economy.debt = 0;
  const player = state.owners[state.playerOwnerId]!;
  player.funds = 10_000_000;
  const seller = Object.values(state.owners).find((o) => !o.isPlayer)!;
  const horse = Object.values(state.horses).find((h) => h.ownerId === seller.id)!;
  const lot: SaleLot = {
    lotNo: 1, book: 1, horseId: horse.id, horseName: horse.name, sireId: horse.sireId,
    vendor: { kind: 'owner', id: seller.id }, reserve: null, valuation: 100_000, aiBids: [], result: null,
  };
  state.sales.catalogues = [{ saleId: EVENT.id, year: YEAR, status: 'catalogued', lots: [lot] }];
  return { state, player, lot };
}

describe('세일 후원 등급', () => {
  it.each([[999_999, 'none'], [1_000_000, 'silver'], [3_000_000, 'gold']] as const)('경계 %i → %s', (spend, tier) => {
    const { state } = setup(0);
    state.sales.playerSpendByYear = { [YEAR]: spend - 100, [YEAR - 1]: 100, [YEAR - 2]: 9_000_000, [YEAR - 3]: 9_000_000 };
    expect(patronView(state)).toEqual({ tier, spendTwoYears: spend,
      nextTier: tier === 'gold' ? null : tier === 'silver' ? 'gold' : 'silver',
      toNext: tier === 'gold' ? null : (tier === 'silver' ? 3_000_000 : 1_000_000) - spend });
  });

  it.each([[0, 5_000], [1_000_000, 4_000], [3_000_000, 3_000]])('구매 수수료: 누적 %i', (spend, fee) => {
    const { state, player, lot } = setup(spend);
    settleLot(state, EVENT, YEAR, lot, { result: { kind: 'sold', price: 100_000, buyerId: player.id }, buyerIsPlayer: true }, state.date, true);
    expect(state.economy.playerLedger.filter((e) => e.category === 'sale_commission').map((e) => e.amount)).toEqual([-fee]);
    expect(state.sales.playerSpendByYear[YEAR]).toBe(spend + 100_000);
  });

  it('AI 구매자는 후원 등급과 무관하게 수수료 5,000을 낸다', () => {
    const { state, lot } = setup(3_000_000);
    const buyer = Object.values(state.owners).find((o) => !o.isPlayer && o.id !== (lot.vendor.kind === 'owner' ? lot.vendor.id : null))!;
    const funds = buyer.funds;
    settleLot(state, EVENT, YEAR, lot, { result: { kind: 'sold', price: 100_000, buyerId: buyer.id }, buyerIsPlayer: false }, state.date, false);
    expect(buyer.funds).toBe(funds - 105_000);
  });

  it('gold 자금 103,000으로 상한 100,000 가능, none은 불가', () => {
    const { state, player, lot } = setup(3_000_000);
    player.funds = 103_000;
    expect(playerBidValid(state, EVENT, lot, 100_000)).toBe(true);
    expect(setMaxBid(state, EVENT.id, YEAR, 1, 100_000, { sales: SALES }).ok).toBe(true);
    state.sales.playerSpendByYear = {};
    expect(playerBidValid(state, EVENT, lot, 100_000)).toBe(false);
    expect(setMaxBid(state, EVENT.id, YEAR, 1, 100_000, { sales: SALES })).toMatchObject({ ok: false, error: 'insufficient_funds' });
  });

  it('같은 세일에서 승급한 다음 로트부터 할인하고 수수료율은 0 이상이다', () => {
    const { state, player, lot } = setup(999_999);
    settleLot(state, EVENT, YEAR, lot, { result: { kind: 'sold', price: 100_000, buyerId: player.id }, buyerIsPlayer: true }, state.date, true);
    expect(state.economy.playerLedger.find((e) => e.category === 'sale_commission')?.amount).toBe(-5_000);
    expect(playerPremiumRate(state, EVENT)).toBeCloseTo(0.04);
    expect(playerPremiumRate(state, { ...EVENT, buyerPremiumRate: 0.005 })).toBe(0);
  });

  it.each([0, 3_000_000])('위탁 북 우대와 최소 북 1: 누적 %i', (spend) => {
    const { state, player, lot } = setup(spend);
    const horse = state.horses[lot.horseId]!;
    horse.ownerId = player.id;
    horse.birthYear = YEAR - 1;
    horse.status = 'yearling';
    for (const tier of [3, 1]) {
      horse.sireId = CATALOGUE_DATA.stallionRecords.find((r) => r.marketTier === tier)!.key;
      state.sales.consignments = [{ saleId: EVENT.id, year: YEAR, horseId: horse.id, reserve: null }];
      const catalogue = buildCatalogue(state, EVENT, YEAR, CATALOGUE_DATA, createRng('patron'));
      expect(catalogue.lots.find((l) => l.horseId === horse.id)?.book).toBe(Math.max(1, bookForSire(EVENT, tier) - (spend === 0 ? 0 : 1)));
    }
  });
});
