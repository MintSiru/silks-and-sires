import { describe, expect, it } from 'vitest';
import { emptyFarm } from '../../src/engine/config/farm';
import { mareCapacity } from '../../src/engine/farm/purchase';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { setMaxBid } from '../../src/engine/sales/bidding';
import { createNewGame } from '../../src/engine/state/newGame';
import type { SaleEventDef, SaleKind } from '../../src/engine/types';
import { bidErrorKo } from '../../src/ui/game/text';

function fixture(kind: SaleKind = 'breeding_stock', count = 18) {
  const state = createNewGame({ seed: 42, playerName: '가상 마주', difficulty: 'normal',
    silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } });
  const event: SaleEventDef = { id: 'cloud-sale', companyId: 'cloud-company', name: '구름 세일', kind,
    week: 48, books: [{ book: 1, weekOffset: 0, lotsTarget: 1, maxSireTier: 5 }],
    buyerPremiumRate: 0.05, minimumBid: 1000 };
  state.date.week = event.week;
  for (let i = 0; i < count; i++) {
    const horse = generateHorse(createRng(`mare-${i}`), { id: `mare-${i}`, name: `구름 ${i}`,
      birthYear: state.date.year - 5, currentYear: state.date.year, countryOfBirth: 'GB',
      sex: 'female', status: 'broodmare', level: 60 });
    horse.ownerId = state.playerOwnerId;
    state.horses[horse.id] = horse;
    state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  }
  state.sales.catalogues = [{ saleId: event.id, year: state.date.year, status: 'catalogued', lots: [{
    lotNo: 1, book: 1, horseId: 'sale-mare', horseName: '새벽 구름', sireId: null,
    vendor: { kind: 'breeder', id: 'cloud-breeder' }, reserve: null, valuation: 5000, aiBids: [], result: null,
  }] }];
  const data = { sales: { version: 1, companies: [], events: [event] } };
  return { state, bid: (amount = 5000) => setMaxBid(state, event.id, state.date.year, 1, amount, data) };
}

describe('setMaxBid 번식 암말 수용 한도', () => {
  it('한도에 찼거나 넘으면 mare_capacity이고 원본·입찰을 바꾸지 않는다', () => {
    for (const count of [18, 19]) {
      const { state, bid } = fixture('breeding_stock', count);
      expect(mareCapacity(state)).toBe(18);
      const before = structuredClone(state);
      expect(bid()).toEqual({ ok: false, error: 'mare_capacity' });
      expect(state).toEqual(before);
    }
    expect(bidErrorKo('mare_capacity')).toBe('번식 암말이 목장 수용 한도에 찼습니다. 목장 화면에서 마방을 늘리거나 더 큰 목장으로 옮기세요.');
  });

  it('목장이 없는 마주도 번식마 세일 입찰을 거절한다', () => {
    const { state, bid } = fixture('breeding_stock', 0);
    state.farm = emptyFarm();
    expect(bid()).toEqual({ ok: false, error: 'mare_capacity' });
  });

  it('한도 미만은 기존대로 입찰 저장·상한 수정, 금액·자금 검사를 한다', () => {
    const { state, bid } = fixture('breeding_stock', 17);
    expect(bid(0)).toEqual({ ok: false, error: 'invalid_amount' });
    const result = bid();
    if (!result.ok) throw new Error(result.error);
    expect(result.state.sales.playerBids).toEqual([{ saleId: 'cloud-sale', year: state.date.year, lotNo: 1, maxBid: 5000 }]);
    expect(result.events).toEqual([]);
    expect(state.sales.playerBids).toEqual([]);
    state.sales.playerBids = result.state.sales.playerBids;
    const updated = bid(6000);
    expect(updated.ok && updated.state.sales.playerBids).toEqual([{ saleId: 'cloud-sale', year: state.date.year, lotNo: 1, maxBid: 6000 }]);
    state.owners[state.playerOwnerId]!.funds = 100;
    expect(bid()).toEqual({ ok: false, error: 'insufficient_funds' });
  });

  it.each(['foal', 'yearling', 'breeze_up', 'horses_in_training'] as const)('%s 세일은 한도에 차도 기존대로 입찰한다', (kind) => {
    const { bid } = fixture(kind);
    expect(bid().ok).toBe(true);
  });
});
