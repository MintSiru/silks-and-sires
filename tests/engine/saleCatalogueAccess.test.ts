import { beforeAll, describe, expect, it } from 'vitest';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSalesData, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createSalesSystem } from '../../src/engine/sales/system';
import { catalogueVisibleWeek, isCatalogueVisible, type SalePatronTier } from '../../src/engine/sales/patron';
import { lotView, setMaxBid, liveAuctionSteps, saleCalendarView } from '../../src/engine/sales/bidding';
import { inspectLot } from '../../src/engine/sales/inspection';
import { consignToSale } from '../../src/engine/sales/player';
import { relationKey } from '../../src/engine/economy/relations';
import { createRng } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/types';

const sales = getSalesData();
const event = sales.events.find((e) => e.kind === 'yearling')!;
const data = { sales, naming: getNamingData(), stallionNames: getStallionNames(), stallionRecords: getStallionRecords() };
let base: GameState;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261011, playerName: 'Test Owner', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, {
    ...data, nicks: getNicks(), ...getPeopleData(), courses: getRacecourses(), templates: getRaceTemplates(), series: getSeriesDefinitions(),
  });
}, 600_000);

function at(tier: SalePatronTier, offset: number): GameState {
  const state = structuredClone(base);
  state.sales.playerSpendByYear[state.date.year] = tier === 'gold' ? 3_000_000 : tier === 'silver' ? 1_000_000 : 0;
  state.date.week = event.week - 6;
  createSalesSystem(data).run(state, { date: state.date, rng: createRng(1) });
  state.date.week = event.week - offset;
  return state;
}

describe('카탈로그 사전 열람', () => {
  it.each(['none', 'silver', 'gold'] as const)('%s: 공개 경계에서만 플레이어 API를 허용한다', (tier) => {
    const offset = { none: 4, silver: 5, gold: 6 }[tier];
    for (const weeksBefore of [6, 5, 4]) {
      const hidden = weeksBefore > offset;
      const state = at(tier, weeksBefore);
      const cat = state.sales.catalogues.find((c) => c.saleId === event.id)!;
      const lot = cat.lots[0]!;
      expect(cat).toBeDefined();
      expect(catalogueVisibleWeek(event, tier)).toBe(event.week - offset);
      expect(isCatalogueVisible(state, event, state.date.year)).toBe(!hidden);
      expect(lotView(state, event.id, cat.year, lot.lotNo, data) === null).toBe(hidden);
      const trainerId = Object.keys(state.trainers)[0]!;
      state.relations.values[relationKey('trainer', trainerId)] = 100;
      state.owners[state.playerOwnerId]!.funds = 100_000_000;
      state.economy.debt = 0;
      const bid = setMaxBid(state, event.id, cat.year, lot.lotNo, event.minimumBid, data);
      const inspection = inspectLot(state, event.id, cat.year, lot.lotNo, trainerId);
      if (hidden) {
        expect(bid).toEqual({ ok: false, error: 'catalogue_not_found' });
        expect(inspection).toEqual({ ok: false, error: 'catalogue_not_found' });
        expect(liveAuctionSteps(state, event.id, cat.year, lot.lotNo, null, data)).toEqual([]);
      } else {
        expect(bid.ok).toBe(true);
        expect(inspection.ok).toBe(true);
      }
      const row = saleCalendarView(state, data).find((r) => r.event.id === event.id && r.year === cat.year)!;
      expect(row.status).toBe(hidden ? 'upcoming' : 'catalogued');
      expect(row.announceWeek).toBe(event.week - offset);
    }
  });

  it('위탁 마감은 생성 주이며, 과거 카탈로그는 항상 공개한다', () => {
    const state = structuredClone(base);
    const horse = Object.values(state.horses)[0]!;
    horse.ownerId = state.playerOwnerId;
    horse.birthYear = state.date.year - 1;
    horse.status = 'yearling';
    state.date.week = event.week - 7;
    expect(consignToSale(state, horse.id, event.id, null, data).ok).toBe(true);
    state.date.week++;
    expect(consignToSale(state, horse.id, event.id, null, data)).toEqual({ ok: false, error: 'too_late' });
    expect(isCatalogueVisible(state, event, state.date.year - 1)).toBe(true);
    expect(isCatalogueVisible(state, event, state.date.year + 1)).toBe(false);
  });

  it.each(['none', 'gold'] as const)('%s: 공개 주에 이벤트 한 번', (tier) => {
    const state = structuredClone(base);
    state.sales.playerSpendByYear[state.date.year] = tier === 'gold' ? 3_000_000 : 0;
    const system = createSalesSystem(data);
    const dates: number[] = [];
    for (let week = event.week - 6; week < event.week; week++) {
      state.date.week = week;
      const events = system.run(state, { date: state.date, rng: createRng(1) });
      for (const e of events) if (e.type === 'sale_catalogue_published' && e.saleId === event.id) dates.push(e.date.week);
    }
    expect(dates).toEqual([catalogueVisibleWeek(event, tier)]);
  });
});
