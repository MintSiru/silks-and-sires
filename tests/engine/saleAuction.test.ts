import { readdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { POPULATION_COUNTRY_ORDER, POPULATION_ENTRY_AGE, POPULATION_IN_TRAINING } from '../../src/engine/config/population';
import {
  SALE_AI_BIDS_STORED,
  SALE_CATALOGUE_BUILD_LEAD_WEEKS,
  SALE_VENDOR_COMMISSION,
} from '../../src/engine/config/sales';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { bidIncrement, computeAiBids, playerBidValid, resolveLot, settleLot, summarizeCatalogue } from '../../src/engine/sales/auction';
import { announceWeekOf, createSalesSystem, lastBookDate, type SalesStaticData } from '../../src/engine/sales/system';
import type { CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { createRng } from '../../src/engine/rng';
import { serializeGame, deserializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { allocateHorseId } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import { addWeeks } from '../../src/engine/time/calendar';
import { racingHorseIds } from '../../src/engine/world/population';
import { racingCountryOf } from '../../src/engine/world/populationSystem';
import type {
  AiBid,
  GameEvent,
  GameState,
  Horse,
  Money,
  Owner,
  OwnerId,
  SaleCatalogue,
  SaleEventDef,
  SaleKind,
  SaleLot,
  WeeklySystem,
} from '../../src/engine/types';

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;
const LONG_TIMEOUT = 900_000;

const SALES = getSalesData();
const KINDS: readonly SaleKind[] = ['yearling', 'foal', 'breeze_up', 'horses_in_training', 'breeding_stock'];

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

/** 주 시스템 정적 데이터(세일 포함) */
function gameData(withSales: boolean): GameStaticData {
  const base: GameStaticData = {
    nicks: getNicks(),
    naming: getNamingData(),
    stallionNames: getStallionNames(),
    stallionRecords: getStallionRecords(),
    courses: getRacecourses(),
    templates: getRaceTemplates(),
    series: getSeriesDefinitions(),
  };
  return withSales ? { ...base, sales: SALES } : base;
}

/** 세일 시스템 직접 호출용 데이터 */
const SALES_DATA: SalesStaticData & Omit<CatalogueStaticData, 'sales'> = {
  sales: SALES,
  stallionRecords: getStallionRecords(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

let BASE: GameState;
let TEMPLATE: Horse;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  const template = Object.values(BASE.horses)[0];
  if (template === undefined) throw new Error('테스트 전제 위반: 말이 없다');
  TEMPLATE = template;
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

function eventOfKind(kind: SaleKind): SaleEventDef {
  const event = SALES.events.find((e) => e.kind === kind);
  if (event === undefined) throw new Error(`종류 세일 없음: ${kind}`);
  return event;
}

/** 세일 처리를 주 date 에 한 번 돌린 복제본 */
function runSalesAt(state: GameState, date: { year: number; week: number }): GameState {
  const draft = structuredClone(state);
  createSalesSystem(SALES_DATA).run(draft, { date, rng: createRng(1) });
  return draft;
}

/** 세일 처리를 모든 북 주에 차례로 돌리고 이벤트를 모아 돌려준다 */
function runBooks(state: GameState, event: SaleEventDef): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const date of bookWeeks(event)) {
    const draft = structuredClone(current);
    events.push(...createSalesSystem(SALES_DATA).run(draft, { date, rng: createRng(1) }));
    current = draft;
  }
  return { state: current, events };
}

/** 세일 발표 주에 카탈로그를 만든 복제본 */
function announced(event: SaleEventDef): GameState {
  return runSalesAt(fresh(), { year: YEAR, week: announceWeekOf(event) });
}

function catalogueOf(state: GameState, event: SaleEventDef): SaleCatalogue {
  const cat = state.sales.catalogues.find((c) => c.saleId === event.id && c.year === YEAR);
  if (cat === undefined) throw new Error(`카탈로그 없음: ${event.id}`);
  return cat;
}

/** 세일의 북 날짜들(해 YEAR 기준, 오름차순) */
function bookWeeks(event: SaleEventDef): { year: number; week: number }[] {
  return event.books
    .slice()
    .sort((a, b) => a.book - b.book)
    .map((b) => addWeeks({ year: YEAR, week: event.week }, b.weekOffset));
}

/** 이 세일을 처음부터 끝까지(발표 → 모든 북) 돌린 결과 */
function runWholeSale(event: SaleEventDef, state: GameState = fresh()): GameState {
  let current = runSalesAt(state, { year: YEAR, week: announceWeekOf(event) });
  for (const date of bookWeeks(event)) current = runSalesAt(current, date);
  return current;
}

const ZERO_RECORD = { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 };

/** 테스트용 말 한 마리를 draft 에 만든다(기본: 무소속 1세마) */
function addHorse(draft: GameState, patch: Partial<Horse>): string {
  const id = allocateHorseId(draft);
  draft.horses[id] = {
    ...structuredClone(TEMPLATE),
    id,
    name: `Test ${id}`,
    ownerId: null,
    trainerId: null,
    breederId: null,
    birthYear: YEAR - 1,
    status: 'yearling',
    officialRating: null,
    record: { ...ZERO_RECORD },
    ...patch,
  };
  return id;
}

/** AI 마주 중 조건에 맞는 첫 번째(id 오름차순). 없으면 Error */
function aiOwner(pred: (o: Owner) => boolean): Owner {
  const owner = Object.values(BASE.owners)
    .filter((o) => !o.isPlayer)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .find(pred);
  if (owner === undefined) throw new Error('테스트 전제 위반: 조건에 맞는 AI 마주가 없다');
  return owner;
}

/** 모든 마주 자금 + 모든 생산자 자금 */
function worldFunds(state: GameState): number {
  let sum = 0;
  for (const o of Object.values(state.owners)) sum += o.funds;
  for (const b of Object.values(state.breeders)) sum += b.funds;
  return sum;
}

/** 말 ID 를 가리키는 다른 참조(카탈로그 로트·정적 데이터 제외) 목록 */
function referencesTo(state: GameState, horseId: string): string[] {
  const refs: string[] = [];
  if (state.horses[horseId] !== undefined) refs.push('horses');
  if (state.mares[horseId] !== undefined) refs.push('mares');
  for (const o of Object.values(state.owners)) if (o.horseIds.includes(horseId)) refs.push(`owner:${o.id}`);
  for (const b of Object.values(state.breeders)) if (b.horseIds.includes(horseId)) refs.push(`breeder:${b.id}`);
  for (const h of Object.values(state.horses)) {
    if (h.sireId === horseId || h.damId === horseId) refs.push(`parent-of:${h.id}`);
  }
  for (const m of Object.values(state.mares)) if (m.foals.includes(horseId)) refs.push(`foal-of:${m.horseId}`);
  for (const r of state.raceResults) if (r.runners.some((x) => x.horseId === horseId)) refs.push(`race:${r.raceId}`);
  if (state.sireStats[horseId] !== undefined) refs.push('sireStats');
  return refs;
}

/** 로트 한 개(테스트용). 판매자는 breeder 또는 owner */
function lotOf(over: Partial<SaleLot> & Pick<SaleLot, 'horseId' | 'vendor'>): SaleLot {
  return {
    lotNo: 1,
    book: 1,
    horseName: 'Lot',
    sireId: null,
    reserve: null,
    valuation: 100_000,
    aiBids: [],
    result: null,
    ...over,
  };
}

/** 경매 표 테스트용 세일 정의: 최저가 10,000, 구매 수수료 5% 로 고정 */
function tableEvent(): SaleEventDef {
  return { ...eventOfKind('yearling'), minimumBid: 10_000, buyerPremiumRate: 0.05 };
}

/** 표 테스트용 상태: 마주 셋(AI 자금 충분), 플레이어 자금 충분, 판매자 breeder 의 말 한 마리 */
function tableState(): { state: GameState; horseId: string; owners: [OwnerId, OwnerId, OwnerId]; breederId: string } {
  const state = fresh();
  const pool = Object.values(state.owners)
    .filter((o) => !o.isPlayer)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const owners = [pool[0]?.id, pool[1]?.id, pool[2]?.id] as [OwnerId, OwnerId, OwnerId];
  for (const id of owners) {
    const o = state.owners[id];
    if (o === undefined) throw new Error('테스트 전제 위반: AI 마주 3명 필요');
    o.funds = 500_000_000;
  }
  const player = state.owners[state.playerOwnerId];
  if (player === undefined) throw new Error('테스트 전제 위반: 플레이어 마주 없음');
  player.funds = 500_000_000;
  state.economy.debt = 0;
  const breeder = Object.values(state.breeders)[0];
  if (breeder === undefined) throw new Error('테스트 전제 위반: 상업 생산자 없음');
  const horseId = addHorse(state, { breederId: breeder.id });
  breeder.horseIds.push(horseId);
  return { state, horseId, owners, breederId: breeder.id };
}

/** 표 테스트용 입찰 한 줄 */
function bid(ownerId: OwnerId, max: Money): AiBid {
  return { ownerId, max };
}

describe('호가 단위 bidIncrement (경계)', () => {
  it('구간 경계: 9,999→500, 10,000→1,000, 49,999→1,000, 50,000→5,000, 199,999→5,000, 200,000→10,000, 999,999→10,000, 1,000,000→25,000', () => {
    expect(bidIncrement(0)).toBe(500);
    expect(bidIncrement(9_999)).toBe(500);
    expect(bidIncrement(10_000)).toBe(1_000);
    expect(bidIncrement(49_999)).toBe(1_000);
    expect(bidIncrement(50_000)).toBe(5_000);
    expect(bidIncrement(199_999)).toBe(5_000);
    expect(bidIncrement(200_000)).toBe(10_000);
    expect(bidIncrement(999_999)).toBe(10_000);
    expect(bidIncrement(1_000_000)).toBe(25_000);
    expect(bidIncrement(5_000_000)).toBe(25_000);
  });
});

describe('resolveLot 표 (수용 1)', () => {
  it('입찰자 0명: bought_back, lastBid 0 (유보가가 있어도)', () => {
    const { state, horseId, breederId } = tableState();
    const event = tableEvent();
    const lot = lotOf({ horseId, vendor: { kind: 'breeder', id: breederId }, reserve: 50_000 });
    expect(resolveLot(state, lot, event, null)).toEqual({ result: { kind: 'bought_back', lastBid: 0 }, buyerIsPlayer: false });
  });

  it('입찰자 1명: 낙찰가 = 최저가, 구매자는 그 마주', () => {
    const t = tableState();
    const event = tableEvent();
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: [bid(t.owners[0], 100_000)] });
    expect(resolveLot(t.state, lot, event, null)).toEqual({
      result: { kind: 'sold', price: 10_000, buyerId: t.owners[0] },
      buyerIsPlayer: false,
    });
  });

  it('입찰자 2명: 낙찰가 = 두 번째 상한 + 호가 단위(60,000 + 5,000 = 65,000)', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 60_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null)).toEqual({
      result: { kind: 'sold', price: 65_000, buyerId: t.owners[0] },
      buyerIsPlayer: false,
    });
  });

  it('입찰자 3명: 두 번째 상한 80,000 기준 낙찰가 85,000', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 80_000), bid(t.owners[2], 50_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({
      kind: 'sold',
      price: 85_000,
      buyerId: t.owners[0],
    });
  });

  it('두 번째 상한 + 호가가 최고 상한을 넘으면 최고 상한으로 자른다(상한 100,000, 두 번째 99,000 → 100,000)', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 99_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({
      kind: 'sold',
      price: 100_000,
      buyerId: t.owners[0],
    });
  });

  it('호가 단위 경계: 두 번째 상한 9,999 → 10,499, 두 번째 49,999 → 50,999 (최저가 5,000 으로 낮춘 세일)', () => {
    const t = tableState();
    const event = { ...tableEvent(), minimumBid: 5_000 };
    const mk = (second: number) =>
      lotOf({
        horseId: t.horseId,
        vendor: { kind: 'breeder', id: t.breederId },
        aiBids: [bid(t.owners[0], 500_000), bid(t.owners[1], second)],
      });
    expect(resolveLot(t.state, mk(9_999), event, null).result).toMatchObject({ kind: 'sold', price: 10_499 });
    expect(resolveLot(t.state, mk(49_999), event, null).result).toMatchObject({ kind: 'sold', price: 50_999 });
  });

  it('최저가 미만 상한 9,999(최저가 10,000)는 입찰자가 아니므로 두 번째 호가 계산에 들지 않는다', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      aiBids: [bid(t.owners[0], 500_000), bid(t.owners[1], 9_999)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({ kind: 'sold', price: 10_000, buyerId: t.owners[0] });
  });

  it('유보가 위: 낙찰가 65,000 < 유보가 90,000 이고 최고 상한 100,000 ≥ 유보가 → 유보가 90,000 으로 판매', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      reserve: 90_000,
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 60_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({
      kind: 'sold',
      price: 90_000,
      buyerId: t.owners[0],
    });
  });

  it('유보가 위(최고 상한도 미달): bought_back, lastBid = 최고 상한', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      reserve: 120_000,
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 60_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({ kind: 'bought_back', lastBid: 100_000 });
  });

  it('유보가 아래: 유보가 무시, 낙찰가는 경매 가격 65,000', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      reserve: 20_000,
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 60_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toMatchObject({ kind: 'sold', price: 65_000 });
  });

  it('플레이어가 최고: 상한 200,000 vs AI 100,000 → 플레이어 낙찰, 가격 105,000', () => {
    const t = tableState();
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: [bid(t.owners[0], 100_000)] });
    expect(resolveLot(t.state, lot, tableEvent(), 200_000)).toEqual({
      result: { kind: 'sold', price: 105_000, buyerId: t.state.playerOwnerId },
      buyerIsPlayer: true,
    });
  });

  it('플레이어가 두 번째: AI 200,000 vs 플레이어 150,000 → AI 낙찰, 가격 155,000', () => {
    const t = tableState();
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: [bid(t.owners[0], 200_000)] });
    expect(resolveLot(t.state, lot, tableEvent(), 150_000)).toEqual({
      result: { kind: 'sold', price: 155_000, buyerId: t.owners[0] },
      buyerIsPlayer: false,
    });
  });

  it('동률(플레이어 vs AI 100,000): AI 우선, 가격 100,000', () => {
    const t = tableState();
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: [bid(t.owners[0], 100_000)] });
    expect(resolveLot(t.state, lot, tableEvent(), 100_000)).toEqual({
      result: { kind: 'sold', price: 100_000, buyerId: t.owners[0] },
      buyerIsPlayer: false,
    });
  });

  it('동률(AI 두 명 100,000): 입찰 순서가 앞선 마주(aiBids 배열 앞)가 이긴다', () => {
    const t = tableState();
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      aiBids: [bid(t.owners[1], 100_000), bid(t.owners[0], 100_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({
      kind: 'sold',
      price: 100_000,
      buyerId: t.owners[1],
    });
  });

  it('자금 부족 입찰 제외: 자금 < 상한 × (1 + 수수료) 인 AI 는 빠진다(다음 입찰자가 최저가로 낙찰)', () => {
    const t = tableState();
    const poor = t.state.owners[t.owners[0]];
    if (poor === undefined) throw new Error('없음');
    poor.funds = 100_000 * 1.05 - 1;
    const lot = lotOf({
      horseId: t.horseId,
      vendor: { kind: 'breeder', id: t.breederId },
      aiBids: [bid(t.owners[0], 100_000), bid(t.owners[1], 60_000)],
    });
    expect(resolveLot(t.state, lot, tableEvent(), null).result).toEqual({ kind: 'sold', price: 10_000, buyerId: t.owners[1] });
  });

  it('플레이어 자금 부족: canSpend 실패면 플레이어 입찰은 빠진다', () => {
    const t = tableState();
    const player = t.state.owners[t.state.playerOwnerId];
    if (player === undefined) throw new Error('없음');
    player.funds = 1_000;
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: [bid(t.owners[0], 100_000)] });
    expect(playerBidValid(t.state, tableEvent(), lot, 200_000)).toBe(false);
    expect(resolveLot(t.state, lot, tableEvent(), 200_000).result).toMatchObject({ kind: 'sold', buyerId: t.owners[0] });
  });

  it('최저가 미만 상한은 빠진다: AI 9,000 · 플레이어 9,999 는 입찰자가 아니다', () => {
    const t = tableState();
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: [bid(t.owners[0], 9_000)] });
    expect(resolveLot(t.state, lot, tableEvent(), 9_999).result).toEqual({ kind: 'bought_back', lastBid: 0 });
  });

  it('withdrawn: 말이 없거나, dead 이거나, 소유자가 판매자와 다르면', () => {
    const t = tableState();
    const event = tableEvent();
    const bids = [bid(t.owners[0], 100_000)];
    const missing = lotOf({ horseId: 'h-missing', vendor: { kind: 'breeder', id: t.breederId }, aiBids: bids });
    expect(resolveLot(t.state, missing, event, null).result).toEqual({ kind: 'withdrawn' });

    const dead = structuredClone(t.state);
    const deadHorse = dead.horses[t.horseId];
    if (deadHorse === undefined) throw new Error('없음');
    deadHorse.status = 'dead';
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, aiBids: bids });
    expect(resolveLot(dead, lot, event, null).result).toEqual({ kind: 'withdrawn' });

    const moved = structuredClone(t.state);
    const movedHorse = moved.horses[t.horseId];
    if (movedHorse === undefined) throw new Error('없음');
    movedHorse.ownerId = t.owners[1];
    expect(resolveLot(moved, lot, event, null).result).toEqual({ kind: 'withdrawn' });
  });

  it('소수 플레이어 상한은 내림해서 쓴다(200,000.7 → 200,000)', () => {
    const t = tableState();
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } });
    expect(resolveLot(t.state, lot, tableEvent(), 200_000.7).result).toEqual({
      kind: 'sold',
      price: 10_000,
      buyerId: t.state.playerOwnerId,
    });
  });
});

describe('AI 입찰 상한 computeAiBids', () => {
  it('세일 나라 마주·외국 major 만 후보, 플레이어·판매자 제외, 저장 수 상한, 높은 순, 예산 이하, 정수', () => {
    const state = fresh();
    const event = eventOfKind('yearling');
    const breeder = Object.values(state.breeders).find((b) => b.country === 'GB');
    if (breeder === undefined) throw new Error('테스트 전제 위반: GB 생산자 없음');
    const horseId = addHorse(state, { breederId: breeder.id, countryOfBirth: 'GB' });
    const lot = lotOf({ horseId, vendor: { kind: 'breeder', id: breeder.id }, valuation: 80_000, book: 1 });
    for (let seed = 0; seed < 20; seed++) {
      const bids = computeAiBids(state, lot, event, createRng(`t:${seed}`), 'GB');
      expect(bids.length).toBeLessThanOrEqual(SALE_AI_BIDS_STORED);
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i - 1]?.max ?? 0).toBeGreaterThanOrEqual(bids[i]?.max ?? 0);
      }
      for (const b of bids) {
        const owner = state.owners[b.ownerId];
        expect(owner, b.ownerId).toBeDefined();
        if (owner === undefined) continue;
        expect(owner.isPlayer).toBe(false);
        const sameCountry = owner.country === 'GB';
        const openMajor = owner.tier === 'major' && ['IE', 'FR', 'DE', 'IT', 'AE'].includes(owner.country);
        expect(sameCountry || openMajor).toBe(true);
        expect(Number.isInteger(b.max)).toBe(true);
        expect(b.max).toBeLessThanOrEqual(Math.floor(owner.funds * (owner.tier === 'major' ? 0.25 : owner.tier === 'mid' ? 0.15 : 0.1)));
      }
    }
  });

  it('같은 rng 스트림 → 같은 입찰, 후보가 없으면 빈 배열', () => {
    const state = fresh();
    const event = eventOfKind('yearling');
    const breeder = Object.values(state.breeders)[0];
    if (breeder === undefined) throw new Error('없음');
    const horseId = addHorse(state, { breederId: breeder.id });
    const lot = lotOf({ horseId, vendor: { kind: 'breeder', id: breeder.id }, valuation: 50_000 });
    const a = computeAiBids(state, lot, event, createRng('same'), 'GB');
    const b = computeAiBids(state, lot, event, createRng('same'), 'GB');
    expect(a).toEqual(b);

    const broke = structuredClone(state);
    for (const o of Object.values(broke.owners)) o.funds = 0;
    expect(computeAiBids(broke, lot, event, createRng('same'), 'GB')).toEqual([]);
  });

  it('로트 발표 시 aiBids 는 SALE_AI_BIDS_STORED 이하이고 플레이어·판매 마주를 담지 않는다', () => {
    const state = announced(eventOfKind('yearling'));
    const cat = catalogueOf(state, eventOfKind('yearling'));
    expect(cat.lots.length).toBeGreaterThan(0);
    for (const lot of cat.lots) {
      expect(lot.aiBids.length).toBeLessThanOrEqual(SALE_AI_BIDS_STORED);
      for (const b of lot.aiBids) {
        expect(b.ownerId).not.toBe(state.playerOwnerId);
        if (lot.vendor.kind === 'owner') expect(b.ownerId).not.toBe(lot.vendor.id);
      }
    }
  });
});

describe('낙찰 후 처리 settleLot', () => {
  it('AI 가 1세마 낙찰: 구매자 가격·수수료 차감, 생산자에 대금 − 판매 수수료, 말은 구매자 소유·생산자 목록에서 빠짐, 상태 유지', () => {
    const event = { ...tableEvent(), id: 'x' };
    const t = tableState();
    const draft = structuredClone(t.state);
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, lotNo: 3 });
    const breederBefore = draft.breeders[t.breederId];
    if (breederBefore === undefined) throw new Error('없음');
    const buyerBefore = draft.owners[t.owners[0]]?.funds ?? 0;
    const breederFunds = breederBefore.funds;
    const date = { year: YEAR, week: 40 };
    const events = settleLot(
      draft,
      event,
      YEAR,
      lot,
      { result: { kind: 'sold', price: 65_000, buyerId: t.owners[0] }, buyerIsPlayer: false },
      date,
      false,
    );
    expect(events).toEqual([]);
    expect(lot.result).toEqual({ kind: 'sold', price: 65_000, buyerId: t.owners[0] });
    expect(draft.owners[t.owners[0]]?.funds).toBe(buyerBefore - 65_000 - Math.round(65_000 * 0.05));
    expect(draft.breeders[t.breederId]?.funds).toBe(breederFunds + 65_000 - Math.round(65_000 * SALE_VENDOR_COMMISSION));
    expect(draft.horses[t.horseId]?.ownerId).toBe(t.owners[0]);
    expect(draft.owners[t.owners[0]]?.horseIds).toContain(t.horseId);
    expect(draft.breeders[t.breederId]?.horseIds).not.toContain(t.horseId);
    expect(draft.horses[t.horseId]?.status).toBe('yearling');
    expect(draft.horses[t.horseId]?.trainerId).toBeNull();
  });

  it('플레이어 구매: 장부 sale_purchase·sale_commission, 플레이어 말·horseIds, 연간 합계, buyer 이벤트', () => {
    const event = tableEvent();
    const t = tableState();
    const draft = structuredClone(t.state);
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, lotNo: 7 });
    const date = { year: YEAR, week: 40 };
    const price = 10_000;
    const events = settleLot(
      draft,
      event,
      YEAR,
      lot,
      { result: { kind: 'sold', price, buyerId: draft.playerOwnerId }, buyerIsPlayer: true },
      date,
      true,
    );
    const ledger = draft.economy.playerLedger;
    expect(ledger.filter((e) => e.category === 'sale_purchase')).toEqual([
      { date, category: 'sale_purchase', amount: -price, horseId: t.horseId },
    ]);
    expect(ledger.filter((e) => e.category === 'sale_commission')).toEqual([
      { date, category: 'sale_commission', amount: -Math.round(price * event.buyerPremiumRate), horseId: t.horseId },
    ]);
    expect(draft.horses[t.horseId]?.ownerId).toBe(draft.playerOwnerId);
    expect(draft.owners[draft.playerOwnerId]?.horseIds).toContain(t.horseId);
    expect(draft.sales.playerSpendByYear[YEAR]).toBe(price);
    expect(events).toEqual([
      {
        type: 'sale_lot_result',
        saleId: event.id,
        year: YEAR,
        lotNo: 7,
        horseId: t.horseId,
        role: 'buyer',
        result: { kind: 'sold', price, buyerId: draft.playerOwnerId },
        date,
      },
    ]);
  });

  it('플레이어가 낙찰 못 함: underbidder 이벤트 (입찰은 했고 졌다)', () => {
    const event = tableEvent();
    const t = tableState();
    const draft = structuredClone(t.state);
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, lotNo: 2 });
    const date = { year: YEAR, week: 41 };
    const events = settleLot(
      draft,
      event,
      YEAR,
      lot,
      { result: { kind: 'sold', price: 65_000, buyerId: t.owners[0] }, buyerIsPlayer: false },
      date,
      true,
    );
    expect(events).toEqual([
      {
        type: 'sale_lot_result',
        saleId: event.id,
        year: YEAR,
        lotNo: 2,
        horseId: t.horseId,
        role: 'underbidder',
        result: { kind: 'sold', price: 65_000, buyerId: t.owners[0] },
        date,
      },
    ]);
    expect(draft.economy.playerLedger).toEqual([]);
  });

  it('플레이어가 입찰하지 않은 AI 낙찰: 이벤트 없음', () => {
    const t = tableState();
    const draft = structuredClone(t.state);
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } });
    const events = settleLot(
      draft,
      tableEvent(),
      YEAR,
      lot,
      { result: { kind: 'sold', price: 10_000, buyerId: t.owners[0] }, buyerIsPlayer: false },
      { year: YEAR, week: 40 },
      false,
    );
    expect(events).toEqual([]);
  });

  it('생산자 로트 바이백: 세계에서 빠진다(horses·horseIds), 로트 horseName 사본은 남는다', () => {
    const t = tableState();
    const draft = structuredClone(t.state);
    const breeder = draft.breeders[t.breederId];
    if (breeder === undefined) throw new Error('없음');
    breeder.horseIds.push(t.horseId);
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId }, horseName: 'Kept Name' });
    settleLot(draft, tableEvent(), YEAR, lot, { result: { kind: 'bought_back', lastBid: 0 }, buyerIsPlayer: false }, { year: YEAR, week: 40 }, false);
    expect(draft.horses[t.horseId]).toBeUndefined();
    expect(draft.breeders[t.breederId]?.horseIds).not.toContain(t.horseId);
    expect(referencesTo(draft, t.horseId)).toEqual([]);
    expect(lot.horseName).toBe('Kept Name');
  });

  it('수출: 미국 마주가 낙찰하면 말은 세계에서 빠진다', () => {
    const t = tableState();
    const draft = structuredClone(t.state);
    const usOwner = draft.owners[t.owners[2]];
    if (usOwner === undefined) throw new Error('없음');
    usOwner.country = 'US';
    const lot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } });
    settleLot(draft, tableEvent(), YEAR, lot, { result: { kind: 'sold', price: 10_000, buyerId: usOwner.id }, buyerIsPlayer: false }, { year: YEAR, week: 40 }, false);
    expect(draft.horses[t.horseId]).toBeUndefined();
    expect(referencesTo(draft, t.horseId)).toEqual([]);
    expect(usOwner.funds).toBe(500_000_000 - 10_000 - Math.round(10_000 * 0.05));
  });

  it('번식마: AI 가 사면 세계에서 빠지고, 플레이어가 사면 소유·번식 기록(Mare)이 생긴다', () => {
    const event = eventOfKind('breeding_stock');
    const t = tableState();
    const ai = structuredClone(t.state);
    const aiLot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } });
    settleLot(ai, event, YEAR, aiLot, { result: { kind: 'sold', price: 10_000, buyerId: t.owners[0] }, buyerIsPlayer: false }, { year: YEAR, week: 51 }, false);
    expect(ai.horses[t.horseId]).toBeUndefined();
    expect(ai.mares[t.horseId]).toBeUndefined();

    const pl = structuredClone(t.state);
    const plLot = lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } });
    settleLot(pl, event, YEAR, plLot, { result: { kind: 'sold', price: 10_000, buyerId: pl.playerOwnerId }, buyerIsPlayer: true }, { year: YEAR, week: 51 }, true);
    expect(pl.horses[t.horseId]?.ownerId).toBe(pl.playerOwnerId);
    expect(pl.mares[t.horseId]).toEqual({
      horseId: t.horseId,
      coveredBy: null,
      coveredWeek: null,
      pregnant: false,
      dueWeek: null,
      foals: [],
      blackTypeProduce: 0,
    });
  });

  it('breeze_up: AI 구매자면 status 는 yearling 그대로(조교사 없음, 다음 연간 교체에서 편입), 플레이어 구매도 그대로', () => {
    const event = eventOfKind('breeze_up');
    const t = tableState();
    const ai = structuredClone(t.state);
    const aiHorse = ai.horses[t.horseId];
    if (aiHorse === undefined) throw new Error('없음');
    aiHorse.status = 'yearling';
    aiHorse.birthYear = YEAR - 2;
    const buyer = ai.owners[t.owners[0]];
    if (buyer === undefined) throw new Error('없음');
    buyer.country = 'GB';
    settleLot(ai, event, YEAR, lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } }), { result: { kind: 'sold', price: 10_000, buyerId: buyer.id }, buyerIsPlayer: false }, { year: YEAR, week: 16 }, false);
    expect(ai.horses[t.horseId]?.ownerId).toBe(t.owners[0]);
    expect(ai.horses[t.horseId]?.status).toBe('yearling');
    expect(ai.horses[t.horseId]?.trainerId).toBeNull();

    const pl = structuredClone(t.state);
    const plHorse = pl.horses[t.horseId];
    if (plHorse === undefined) throw new Error('없음');
    plHorse.status = 'yearling';
    plHorse.birthYear = YEAR - 2;
    settleLot(pl, event, YEAR, lotOf({ horseId: t.horseId, vendor: { kind: 'breeder', id: t.breederId } }), { result: { kind: 'sold', price: 10_000, buyerId: pl.playerOwnerId }, buyerIsPlayer: true }, { year: YEAR, week: 16 }, true);
    expect(pl.horses[t.horseId]?.status).toBe('yearling');
    expect(pl.horses[t.horseId]?.trainerId).toBeNull();
  });

  it('플레이어가 판 자손 있는 번식마를 AI 가 사면: 말은 남고(구매자 소유, retired), 번식 기록만 지워지며, 자손의 damId 는 그대로 유효', () => {
    const event = eventOfKind('breeding_stock');
    const t = tableState();
    const draft = structuredClone(t.state);
    const mareId = addHorse(draft, { ownerId: draft.playerOwnerId, sex: 'female', status: 'broodmare', birthYear: YEAR - 6 });
    draft.owners[draft.playerOwnerId]?.horseIds.push(mareId);
    draft.mares[mareId] = { horseId: mareId, coveredBy: null, coveredWeek: null, pregnant: false, dueWeek: null, foals: [], blackTypeProduce: 0 };
    const foalId = addHorse(draft, { ownerId: draft.playerOwnerId, damId: mareId, birthYear: YEAR - 1, status: 'yearling' });
    draft.owners[draft.playerOwnerId]?.horseIds.push(foalId);
    draft.mares[mareId]?.foals.push(foalId);
    const lot = lotOf({ horseId: mareId, vendor: { kind: 'owner', id: draft.playerOwnerId } });
    const events = settleLot(draft, event, YEAR, lot, { result: { kind: 'sold', price: 40_000, buyerId: t.owners[0] }, buyerIsPlayer: false }, { year: YEAR, week: 51 }, false);

    expect(draft.horses[mareId]?.ownerId).toBe(t.owners[0]);
    expect(draft.horses[mareId]?.status).toBe('retired');
    expect(draft.horses[mareId]?.trainerId).toBeNull();
    expect(draft.mares[mareId]).toBeUndefined();
    expect(draft.owners[t.owners[0]]?.horseIds).toContain(mareId);
    expect(draft.owners[draft.playerOwnerId]?.horseIds).not.toContain(mareId);
    expect(draft.horses[foalId]?.damId).toBe(mareId);
    expect(draft.horses[draft.horses[foalId]?.damId ?? '']).toBeDefined();
    expect(events.map((e) => e.type)).toEqual(['horse_sold', 'sale_lot_result']);
  });

  it('플레이어가 판 말은 수출 국가(미국 구매자)여도 세계에서 빼지 않는다: 소유만 구매자로 옮긴다', () => {
    const event = eventOfKind('yearling');
    const t = tableState();
    const draft = structuredClone(t.state);
    const playerHorse = addHorse(draft, { ownerId: draft.playerOwnerId, birthYear: YEAR - 1, status: 'yearling' });
    draft.owners[draft.playerOwnerId]?.horseIds.push(playerHorse);
    const usOwner = draft.owners[t.owners[2]];
    if (usOwner === undefined) throw new Error('없음');
    usOwner.country = 'US';
    const lot = lotOf({ horseId: playerHorse, vendor: { kind: 'owner', id: draft.playerOwnerId } });
    settleLot(draft, event, YEAR, lot, { result: { kind: 'sold', price: 10_000, buyerId: usOwner.id }, buyerIsPlayer: false }, { year: YEAR, week: 41 }, false);
    expect(draft.horses[playerHorse]?.ownerId).toBe(usOwner.id);
    expect(draft.horses[playerHorse]?.status).toBe('yearling');
  });

  it('horses_in_training: 마주 판매자 → 플레이어 구매면 horse_sold(from 마주, to 플레이어), 조교사 그대로', () => {
    const event = eventOfKind('horses_in_training');
    const seller = aiOwner((o) => o.country === 'GB');
    const state = fresh();
    const horseId = addHorse(state, {
      ownerId: seller.id,
      birthYear: YEAR - 3,
      status: 'in_training',
      trainerId: Object.keys(state.trainers)[0] ?? null,
    });
    const sellerOwner = state.owners[seller.id];
    if (sellerOwner === undefined) throw new Error('없음');
    sellerOwner.horseIds.push(horseId);
    const trainerBefore = state.horses[horseId]?.trainerId ?? null;
    const lot = lotOf({ horseId, vendor: { kind: 'owner', id: seller.id } });
    const events = settleLot(state, event, YEAR, lot, { result: { kind: 'sold', price: 40_000, buyerId: state.playerOwnerId }, buyerIsPlayer: true }, { year: YEAR, week: 43 }, true);
    expect(state.horses[horseId]?.ownerId).toBe(state.playerOwnerId);
    expect(state.horses[horseId]?.trainerId ?? null).toBe(trainerBefore);
    expect(state.owners[seller.id]?.horseIds).not.toContain(horseId);
    expect(events.map((e) => e.type)).toEqual(['horse_sold', 'sale_lot_result']);
    expect(events[0]).toEqual({
      type: 'horse_sold',
      horseId,
      fromOwnerId: seller.id,
      toOwnerId: state.playerOwnerId,
      price: 40_000,
      date: { year: YEAR, week: 43 },
    });
  });

  it('판매자가 플레이어이고 유찰: sale_lot_result(role vendor, bought_back), 말은 그대로 플레이어 소유', () => {
    const state = fresh();
    const horseId = addHorse(state, { ownerId: state.playerOwnerId, status: 'yearling', birthYear: YEAR - 1 });
    state.owners[state.playerOwnerId]?.horseIds.push(horseId);
    const lot = lotOf({ horseId, vendor: { kind: 'owner', id: state.playerOwnerId } });
    const events = settleLot(state, eventOfKind('yearling'), YEAR, lot, { result: { kind: 'bought_back', lastBid: 0 }, buyerIsPlayer: false }, { year: YEAR, week: 41 }, false);
    expect(state.horses[horseId]?.ownerId).toBe(state.playerOwnerId);
    expect(events).toEqual([
      {
        type: 'sale_lot_result',
        saleId: eventOfKind('yearling').id,
        year: YEAR,
        lotNo: 1,
        horseId,
        role: 'vendor',
        result: { kind: 'bought_back', lastBid: 0 },
        date: { year: YEAR, week: 41 },
      },
    ]);
  });

  it('summarizeCatalogue: offered·sold·turnover·median·top', () => {
    const event = eventOfKind('yearling');
    const lots = [
      lotOf({ horseId: 'a', vendor: { kind: 'breeder', id: 'b' }, lotNo: 1, result: { kind: 'sold', price: 30_000, buyerId: 'x' } }),
      lotOf({ horseId: 'b', vendor: { kind: 'breeder', id: 'b' }, lotNo: 2, result: { kind: 'sold', price: 10_000, buyerId: 'x' } }),
      lotOf({ horseId: 'c', vendor: { kind: 'breeder', id: 'b' }, lotNo: 3, result: { kind: 'bought_back', lastBid: 5_000 } }),
      lotOf({ horseId: 'd', vendor: { kind: 'breeder', id: 'b' }, lotNo: 4, result: { kind: 'sold', price: 20_000, buyerId: 'x' } }),
    ];
    const summary = summarizeCatalogue(event, { saleId: event.id, year: YEAR, status: 'closed', lots });
    expect(summary).toEqual({
      saleId: event.id,
      year: YEAR,
      kind: 'yearling',
      offered: 4,
      sold: 3,
      turnover: 60_000,
      median: 20_000,
      top: { price: 30_000, horseName: 'Lot', sireId: null },
    });
  });
});

/** 상태의 모든 카탈로그(이번 해)에서 낙찰된 로트의 수수료 합(구매 수수료 + 판매 수수료) */
function feesOf(state: GameState): number {
  let fees = 0;
  for (const cat of state.sales.catalogues) {
    if (cat.year !== YEAR) continue;
    const event = SALES.events.find((e) => e.id === cat.saleId);
    if (event === undefined) continue;
    for (const lot of cat.lots) {
      if (lot.result !== null && lot.result.kind === 'sold') {
        fees += Math.round(lot.result.price * event.buyerPremiumRate) + Math.round(lot.result.price * SALE_VENDOR_COMMISSION);
      }
    }
  }
  return fees;
}

describe('세일 한 번의 돈 보존 (수용 3)', () => {
  // 같은 주에 발표되는 세일은 함께 처리된다(예: 10월 1세마 세일과 현역마 세일은 둘 다 발표 주 37)
  it('1세마 세일 처리 전후: (모든 마주 + 모든 생산자 자금) 감소분 = 구매 수수료 + 판매 수수료 합(같은 주 세일 포함)', () => {
    const event = eventOfKind('yearling');
    const before = announced(event);
    const beforeFunds = worldFunds(before);
    let current = before;
    for (const date of bookWeeks(event)) current = runSalesAt(current, date);
    const cat = catalogueOf(current, event);
    expect(cat.status).toBe('closed');
    expect(cat.lots.some((l) => l.result?.kind === 'sold')).toBe(true);
    expect(beforeFunds - worldFunds(current)).toBe(feesOf(current));
  });

  it('번식마 세일(12월 단일 북): 같은 보존 규칙', () => {
    const event = eventOfKind('breeding_stock');
    const before = announced(event);
    const beforeFunds = worldFunds(before);
    const after = runSalesAt(before, bookWeeks(event)[0] ?? { year: YEAR, week: event.week });
    expect(beforeFunds - worldFunds(after)).toBe(feesOf(after));
  });
});

describe('플레이어 입찰 (수용 5)', () => {
  it('1세마 로트에 상한가 → 낙찰이면 플레이어 말·장부·이벤트, 못 사면 underbidder 이벤트', () => {
    const event = eventOfKind('yearling');
    const base = announced(event);
    const cat = catalogueOf(base, event);
    const lot = cat.lots.find((l) => l.vendor.kind === 'breeder');
    if (lot === undefined) throw new Error('테스트 전제 위반: 생산자 로트 없음');

    // 낙찰: AI 입찰 없음, 플레이어 상한 = 최저가 이상
    const won = structuredClone(base);
    const wonPlayer = won.owners[won.playerOwnerId];
    if (wonPlayer === undefined) throw new Error('없음');
    wonPlayer.funds = 50_000_000;
    const wonCat = catalogueOf(won, event);
    const wonLot = wonCat.lots.find((l) => l.lotNo === lot.lotNo);
    if (wonLot === undefined) throw new Error('없음');
    wonLot.aiBids = [];
    wonLot.reserve = null; // 유보가 때문에 바이백되는 경우는 resolveLot 표 테스트가 본다
    won.sales.playerBids = [{ saleId: event.id, year: YEAR, lotNo: lot.lotNo, maxBid: 60_000 }];
    const wonState = runBooks(won, event).state;
    const wonResult = catalogueOf(wonState, event).lots.find((l) => l.lotNo === lot.lotNo);
    expect(wonResult?.result).toEqual({ kind: 'sold', price: event.minimumBid, buyerId: won.playerOwnerId });
    expect(wonState.horses[lot.horseId]?.ownerId).toBe(won.playerOwnerId);
    expect(wonState.owners[won.playerOwnerId]?.horseIds).toContain(lot.horseId);
    const wonLedger = wonState.economy.playerLedger.filter((e) => e.horseId === lot.horseId);
    expect(wonLedger.map((e) => e.category)).toEqual(['sale_purchase', 'sale_commission']);
    expect(wonLedger[0]?.amount).toBe(-event.minimumBid);
    expect(wonLedger[1]?.amount).toBe(-Math.round(event.minimumBid * event.buyerPremiumRate));
    expect(wonState.sales.playerSpendByYear[YEAR]).toBe(event.minimumBid);

    // 못 삼: 자금 충분한 AI 가 훨씬 높은 상한
    const lost = structuredClone(base);
    const lostPlayer = lost.owners[lost.playerOwnerId];
    if (lostPlayer === undefined) throw new Error('없음');
    lostPlayer.funds = 50_000_000;
    const ai = aiOwner((o) => o.country === 'GB');
    const rival = lost.owners[ai.id];
    if (rival === undefined) throw new Error('없음');
    rival.funds = 500_000_000;
    const lostLot = catalogueOf(lost, event).lots.find((l) => l.lotNo === lot.lotNo);
    if (lostLot === undefined) throw new Error('없음');
    lostLot.aiBids = [{ ownerId: ai.id, max: 900_000 }];
    lostLot.reserve = null;
    lost.sales.playerBids = [{ saleId: event.id, year: YEAR, lotNo: lot.lotNo, maxBid: 60_000 }];
    const lostState = runBooks(lost, event).state;
    const lostResult = catalogueOf(lostState, event).lots.find((l) => l.lotNo === lot.lotNo);
    expect(lostResult?.result).toMatchObject({ kind: 'sold', buyerId: ai.id });
    expect(lostState.economy.playerLedger.filter((e) => e.horseId === lot.horseId)).toEqual([]);
  });

  it('플레이어 결과 이벤트는 해당 북 주에 나온다(sale_lot_result 의 role 과 date)', () => {
    const event = eventOfKind('yearling');
    const base = announced(event);
    const cat = catalogueOf(base, event);
    const lot = cat.lots.find((l) => l.vendor.kind === 'breeder');
    if (lot === undefined) throw new Error('없음');
    const draft = structuredClone(base);
    const p = draft.owners[draft.playerOwnerId];
    if (p === undefined) throw new Error('없음');
    p.funds = 50_000_000;
    const dl = catalogueOf(draft, event).lots.find((l) => l.lotNo === lot.lotNo);
    if (dl === undefined) throw new Error('없음');
    dl.aiBids = [];
    dl.reserve = null;
    draft.sales.playerBids = [{ saleId: event.id, year: YEAR, lotNo: lot.lotNo, maxBid: 60_000 }];
    const { events } = runBooks(draft, event);
    const found = events.filter((e) => e.type === 'sale_lot_result' && e.lotNo === lot.lotNo);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: 'sale_lot_result', role: 'buyer', lotNo: lot.lotNo });
  });

  it('플레이어 위탁 로트: 판매자 플레이어면 vendor 이벤트', () => {
    const event = eventOfKind('yearling');
    const state = fresh();
    const horseId = addHorse(state, {
      ownerId: state.playerOwnerId,
      birthYear: YEAR - 1,
      status: 'yearling',
      officialRating: null,
    });
    state.owners[state.playerOwnerId]?.horseIds.push(horseId);
    state.sales.consignments.push({ saleId: event.id, year: YEAR, horseId, reserve: 1_000_000_000 });
    const announcedState = runSalesAt(state, { year: YEAR, week: announceWeekOf(event) });
    const lotNo = catalogueOf(announcedState, event).lots.find((l) => l.horseId === horseId)?.lotNo;
    expect(lotNo).toBeDefined();
    const { events } = runBooks(announcedState, event);
    const vendorEvents = events.filter((e) => e.type === 'sale_lot_result' && e.horseId === horseId);
    expect(vendorEvents).toHaveLength(1);
    expect(vendorEvents[0]).toMatchObject({ role: 'vendor', result: { kind: 'bought_back', lastBid: expect.any(Number) } });
  });
});

describe('로트 처리 흐름과 세계에서 빼기 (수용 2·3 보조)', () => {
  it('세일이 끝나면 카탈로그는 closed, 요약 1개가 history 에 들어간다', () => {
    const event = eventOfKind('yearling');
    const done = runWholeSale(event);
    expect(catalogueOf(done, event).status).toBe('closed');
    const summaries = done.sales.history.filter((h) => h.saleId === event.id && h.year === YEAR);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ offered: catalogueOf(done, event).lots.length });
  });

  it('번식마 세일: AI 낙찰·바이백 로트의 말은 전부 세계에서 빠지고 참조가 없다', () => {
    const event = eventOfKind('breeding_stock');
    const done = runWholeSale(event);
    const cat = catalogueOf(done, event);
    const removed = cat.lots.filter(
      (l) => l.vendor.kind === 'breeder' && (l.result?.kind === 'bought_back' || (l.result?.kind === 'sold' && l.result.buyerId !== done.playerOwnerId)),
    );
    expect(removed.length).toBeGreaterThan(0);
    for (const lot of removed) {
      expect(done.horses[lot.horseId], lot.horseId).toBeUndefined();
      expect(referencesTo(done, lot.horseId), lot.horseId).toEqual([]);
    }
  });

  it('1세마 세일: 생산자 로트 중 AI 낙찰 말은 세계에 남고 마주 목록에 있다, 바이백 말은 빠진다', () => {
    const event = eventOfKind('yearling');
    const done = runWholeSale(event);
    const cat = catalogueOf(done, event);
    const sold = cat.lots.find((l) => l.vendor.kind === 'breeder' && l.result?.kind === 'sold');
    const back = cat.lots.find((l) => l.vendor.kind === 'breeder' && l.result?.kind === 'bought_back');
    if (sold !== undefined && sold.result?.kind === 'sold') {
      const horse = done.horses[sold.horseId];
      expect(horse?.ownerId).toBe(sold.result.buyerId);
      expect(done.owners[sold.result.buyerId]?.horseIds).toContain(sold.horseId);
    }
    if (back !== undefined) {
      expect(done.horses[back.horseId]).toBeUndefined();
    }
  });
});

describe('현역 편입 racingCountryOf', () => {
  it('태생국이 유럽 5개국이면 태생국, 아니면 마주 나라(유럽 5개국), 아니면 GB', () => {
    const state = fresh();
    const base = Object.values(state.horses)[0];
    if (base === undefined) throw new Error('없음');
    const fr = aiOwner((o) => o.country === 'FR');
    const us = structuredClone(state);
    us.owners[fr.id] = { ...(us.owners[fr.id] as Owner), country: 'FR' };
    expect(racingCountryOf(us, { ...base, countryOfBirth: 'IE', ownerId: fr.id })).toBe('IE');
    expect(racingCountryOf(us, { ...base, countryOfBirth: 'US', ownerId: fr.id })).toBe('FR');
    expect(racingCountryOf(us, { ...base, countryOfBirth: 'US', ownerId: null })).toBe('GB');
    const ae = structuredClone(us);
    const aeOwner = ae.owners[fr.id];
    if (aeOwner === undefined) throw new Error('없음');
    aeOwner.country = 'AE';
    expect(racingCountryOf(ae, { ...base, countryOfBirth: 'US', ownerId: fr.id })).toBe('GB');
  });

  it('bootstrap 직후 모든 AI 현역마는 태생국 = racingCountryOf (유럽산이라 결과 불변)', () => {
    for (const id of racingHorseIds(BASE)) {
      const horse = BASE.horses[id];
      if (horse === undefined) continue;
      expect(racingCountryOf(BASE, horse)).toBe(horse.countryOfBirth);
    }
  });
});

describe('세일 주간 발표 주와 북 날짜', () => {
  it('세일 카탈로그 발표·판매 날짜는 SALE_CATALOGUE_BUILD_LEAD_WEEKS 로 맞물린다', () => {
    const event = eventOfKind('yearling');
    expect(announceWeekOf(event)).toBe(event.week - SALE_CATALOGUE_BUILD_LEAD_WEEKS);
    expect(lastBookDate(event, YEAR)).toEqual(bookWeeks(event)[event.books.length - 1]);
  });
});

/* ── 104주 진행: 측정 (수용 2·4·6) ─────────────────────────────── */

interface EnrolmentReport {
  /** 2년째 주 1 직전 세일 출신 대상 두수(AI 마주 소유, foal/weanling/yearling, 나이 ≥ 편입 나이) */
  candidates: number;
  byCountry: Partial<Record<string, number>>;
  /** 은퇴 두수 (이벤트 horse_status_changed → retired) */
  retired: number;
  /** 신규 투입으로 새로 생긴 말 두수 */
  spawned: number;
  /** 편입 뒤 나라별 현역마 수 */
  racingByCountry: Record<string, number>;
}

/** 마감 카탈로그의 로트 결과 스냅샷(카탈로그는 마감 뒤 보존 기간이 지나면 지워지므로 진행 중에 모은다) */
interface ClosedSnapshot {
  saleId: string;
  year: number;
  kind: SaleKind;
  lots: { horseId: string; valuation: number; result: SaleLot['result']; vendorKind: 'breeder' | 'owner' }[];
}

interface LongRun {
  state: GameState;
  weekMs: number[];
  saleWeekMs: number[];
  enrolment: EnrolmentReport | null;
  closed: ClosedSnapshot[];
}

/** 세일 주 집합: 발표 주와 모든 북 주(두 해) */
function saleWeekKeys(): Set<string> {
  const keys = new Set<string>();
  for (const event of SALES.events) {
    for (const year of [YEAR, YEAR + 1]) {
      keys.add(`${year}-${announceWeekOf(event)}`);
      keys.add(`${year}-${event.week}`);
      for (const b of event.books) {
        const d = addWeeks({ year, week: event.week }, b.weekOffset);
        keys.add(`${d.year}-${d.week}`);
      }
    }
  }
  return keys;
}

/** 2년(104주) 진행. 주마다 ms 를 잰다. 2년째 주 1 직전·직후를 스냅샷해 편입을 기록한다 */
function runTwoYears(withSales: boolean): LongRun {
  const systems: readonly WeeklySystem[] = createGameSystems(gameData(withSales));
  const saleKeys = saleWeekKeys();
  let current = fresh();
  const weekMs: number[] = [];
  const saleWeekMs: number[] = [];
  let enrolment: EnrolmentReport | null = null;
  const closed: ClosedSnapshot[] = [];
  const seen = new Set<string>();
  const replacementIndex = WEEKS_PER_YEAR; // 2년째 1주 = 53번째 진행
  for (let k = 0; k < 2 * WEEKS_PER_YEAR; k++) {
    const before = current;
    const processed = { year: before.date.year, week: before.date.week };
    const t0 = performance.now();
    const result = advanceWeek(before, systems);
    const ms = performance.now() - t0;
    weekMs.push(ms);
    if (saleKeys.has(`${processed.year}-${processed.week}`)) saleWeekMs.push(ms);
    if (k === replacementIndex) enrolment = enrolmentReport(before, result.state, result.events);
    for (const cat of result.state.sales.catalogues) {
      const key = `${cat.saleId}:${cat.year}`;
      if (cat.status !== 'closed' || seen.has(key)) continue;
      seen.add(key);
      const event = SALES.events.find((e) => e.id === cat.saleId);
      if (event === undefined) continue;
      closed.push({
        saleId: cat.saleId,
        year: cat.year,
        kind: event.kind,
        lots: cat.lots.map((l) => ({
          horseId: l.horseId,
          valuation: l.valuation,
          result: l.result,
          vendorKind: l.vendor.kind,
        })),
      });
    }
    current = result.state;
  }
  return { state: current, weekMs, saleWeekMs, enrolment, closed };
}

function enrolmentReport(before: GameState, after: GameState, events: readonly GameEvent[]): EnrolmentReport {
  const year = before.date.year;
  const byCountry: Partial<Record<string, number>> = {};
  let candidates = 0;
  for (const h of Object.values(before.horses)) {
    if (!['foal', 'weanling', 'yearling'].includes(h.status)) continue;
    if (h.ownerId === null || h.ownerId === before.playerOwnerId) continue;
    if (before.owners[h.ownerId]?.isPlayer !== false) continue;
    if (year - h.birthYear < POPULATION_ENTRY_AGE) continue;
    candidates += 1;
    const country = racingCountryOf(before, h);
    byCountry[country] = (byCountry[country] ?? 0) + 1;
  }
  const retired = events.filter((e) => e.type === 'horse_status_changed' && e.to === 'retired').length;
  const spawned = Object.keys(after.horses).filter((id) => before.horses[id] === undefined).length;
  const racingByCountry: Record<string, number> = {};
  for (const id of racingHorseIds(after)) {
    const h = after.horses[id];
    if (h === undefined) continue;
    const country = racingCountryOf(after, h);
    racingByCountry[country] = (racingByCountry[country] ?? 0) + 1;
  }
  return { candidates, byCountry, retired, spawned, racingByCountry };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

describe('104주 진행 측정 (수용 2·4·6)', () => {
  let withSales: LongRun;
  let withoutSales: LongRun;

  beforeAll(() => {
    withSales = runTwoYears(true);
    withoutSales = runTwoYears(false);
  }, LONG_TIMEOUT);

  it('세일 15개 × 2년 모두 closed, 요약 30개 생성', () => {
    // 마감 카탈로그는 마지막 북 + SALE_CATALOGUE_KEEP_WEEKS 주 뒤 지워지므로, 두 해 모두 요약(history)으로 확인한다
    expect(withSales.closed).toHaveLength(15 * 2);
    for (const cat of withSales.state.sales.catalogues) expect(cat.status, `${cat.saleId} ${cat.year}`).toBe('closed');
    const keys = withSales.state.sales.history.map((h) => `${h.saleId}:${h.year}`);
    expect(keys).toHaveLength(15 * 2);
    expect(new Set(keys).size).toBe(15 * 2);
    for (const event of SALES.events) {
      for (const year of [YEAR, YEAR + 1]) expect(keys, `${event.id} ${year}`).toContain(`${event.id}:${year}`);
    }
  }, LONG_TIMEOUT);

  it('측정 보고: 판매율·1세마 가격 비율·세일 종류별 낙찰·현역 편입·주당 ms·세계 두수', () => {
    const perKind: Record<string, { offered: number; sold: number }> = {};
    const yearlingValuations: number[] = [];
    const yearlingSold: number[] = [];
    const perYear: Record<string, { offered: number; sold: number }> = {};
    for (const cat of withSales.closed) {
      const slot = (perKind[cat.kind] ??= { offered: 0, sold: 0 });
      const yslot = (perYear[`${cat.kind}:${cat.year}`] ??= { offered: 0, sold: 0 });
      slot.offered += cat.lots.length;
      yslot.offered += cat.lots.length;
      for (const lot of cat.lots) {
        if (cat.kind === 'yearling') yearlingValuations.push(lot.valuation);
        if (lot.result?.kind === 'sold') {
          slot.sold += 1;
          yslot.sold += 1;
          if (cat.kind === 'yearling') yearlingSold.push(lot.result.price);
        }
      }
    }
    const lines: string[] = [];
    for (const kind of KINDS) {
      const s = perKind[kind] ?? { offered: 0, sold: 0 };
      const rate = s.offered === 0 ? 0 : s.sold / s.offered;
      lines.push(`${kind} ${s.sold}/${s.offered} = ${(rate * 100).toFixed(1)}%`);
    }
    const priceRatio = median(yearlingSold) / median(yearlingValuations);
    lines.push(`1세마 낙찰가 중앙값 ${median(yearlingSold).toFixed(0)} ÷ 평가값 중앙값 ${median(yearlingValuations).toFixed(0)} = ${priceRatio.toFixed(3)}`);
    for (const [key, s2] of Object.entries(perYear)) lines.push(`  ${key} ${s2.sold}/${s2.offered}`);
    // 로트 말의 운명: 세계에 남았는가(낙찰 후 세계에서 빼기 규칙), 종류별
    const fate: Record<string, { sold: number; bought_back: number; removed: number; kept: number }> = {};
    for (const cat of withSales.closed) {
      for (const lot of cat.lots) {
        if (lot.result === null) continue;
        const f = (fate[cat.kind] ??= { sold: 0, bought_back: 0, removed: 0, kept: 0 });
        if (lot.result.kind === 'sold') f.sold += 1;
        if (lot.result.kind === 'bought_back') f.bought_back += 1;
        if (lot.result.kind === 'sold' || lot.result.kind === 'bought_back') {
          if (withSales.state.horses[lot.horseId] === undefined) f.removed += 1;
          else f.kept += 1;
        }
      }
    }
    lines.push(`로트 말 운명(104주 후 세계에 남은 말 kept / 뺀 말 removed): ${JSON.stringify(fate)}`);
    // 상업 생산자 판매 낙찰 중 breeze_up 의 AI 구매 말이 현재 어느 나라 현역인가(현역 편입 밖 증가분 점검)
    const breezeByCountry: Record<string, number> = {};
    for (const cat of withSales.closed) {
      if (cat.kind !== 'breeze_up') continue;
      for (const lot of cat.lots) {
        if (lot.result?.kind !== 'sold' || lot.result.buyerId === withSales.state.playerOwnerId) continue;
        const h = withSales.state.horses[lot.horseId];
        if (h === undefined) continue;
        const c = racingCountryOf(withSales.state, h);
        breezeByCountry[c] = (breezeByCountry[c] ?? 0) + 1;
      }
    }
    lines.push(`breeze_up AI 낙찰 말(2년, 현재 세계에 남은 말)의 나라별 현역 집계: ${JSON.stringify(breezeByCountry)}`);

    const sortedWeeks = [...withSales.weekMs].sort((a, b) => a - b);
    const sortedNoSale = [...withoutSales.weekMs].sort((a, b) => a - b);
    lines.push(
      `주당 ms(세일 on): 중앙값 ${median(withSales.weekMs).toFixed(2)} · 최대 ${(sortedWeeks[sortedWeeks.length - 1] ?? 0).toFixed(1)} · 세일 주 최대 ${Math.max(0, ...withSales.saleWeekMs).toFixed(1)} · 세일 주 중앙값 ${median(withSales.saleWeekMs).toFixed(1)}`,
    );
    lines.push(
      `주당 ms(세일 off): 중앙값 ${median(withoutSales.weekMs).toFixed(2)} · 최대 ${(sortedNoSale[sortedNoSale.length - 1] ?? 0).toFixed(1)}`,
    );
    lines.push(`state.horses 104주 후: 세일 on ${Object.keys(withSales.state.horses).length} · 세일 off(세일 도입 전) ${Object.keys(withoutSales.state.horses).length}`);
    lines.push(`state.horses 세일 on 중 상태별: ${statusCounts(withSales.state)}`);
    lines.push(`2년째 1주 편입: ${JSON.stringify(withSales.enrolment)}`);
    lines.push(`세일 off 2년째 1주 현역 나라별: ${JSON.stringify(withoutSales.enrolment?.racingByCountry)}`);
    lines.push(`목표 현역 두수: ${JSON.stringify(POPULATION_IN_TRAINING)}`);
    console.info(`[M4-C4 측정]\n${lines.join('\n')}`);
    expect(lines.length).toBeGreaterThan(0);
  }, LONG_TIMEOUT);

  it('현역 편입: 2년째 주 1 에 세일 출신 대상 > 0, 나라별 현역마 수를 목표와 비교(보고)', () => {
    const e = withSales.enrolment;
    expect(e).not.toBeNull();
    if (e === null) return;
    expect(e.candidates).toBeGreaterThan(0);
    const report: string[] = [];
    for (const country of POPULATION_COUNTRY_ORDER) {
      const target = POPULATION_IN_TRAINING[country];
      const got = e.racingByCountry[country] ?? 0;
      const dev = (got - target) / target;
      report.push(`${country} ${got}/${target} (${(dev * 100).toFixed(1)}%)`);
    }
    console.info(`[M4-C4 편입] 세일 출신 ${e.candidates} · 은퇴 ${e.retired} · 신규 투입 ${e.spawned} · 나라별 ${report.join(', ')}`);
  });
});

function statusCounts(state: GameState): string {
  const counts: Record<string, number> = {};
  for (const h of Object.values(state.horses)) counts[h.status] = (counts[h.status] ?? 0) + 1;
  return JSON.stringify(counts);
}

/* ── 저장·결정성 (수용 7) ──────────────────────────────────────── */

describe('결정성과 저장 (수용 7)', () => {
  it('같은 시드 1세마 세일 전 과정: 두 번 돌린 결과가 같다', () => {
    const event = eventOfKind('yearling');
    const a = runWholeSale(event);
    const b = runWholeSale(event);
    expect(b.sales).toEqual(a.sales);
    expect(b.horses).toEqual(a.horses);
    expect(b.owners).toEqual(a.owners);
    expect(b.breeders).toEqual(a.breeders);
  }, LONG_TIMEOUT);

  it('저장 왕복 후 sales·horses·mares 가 같다', () => {
    const event = eventOfKind('breeding_stock');
    const done = runWholeSale(event);
    const result = deserializeGame(serializeGame(done, '2026-10-12T00:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.sales).toEqual(done.sales);
      expect(result.state.horses).toEqual(done.horses);
      expect(result.state.mares).toEqual(done.mares);
    }
  }, LONG_TIMEOUT);

  it('1년째 26주 이전의 레이스 결과는 세일 유무와 같다(26주까지 진행)', () => {
    const run = (withSales: boolean): GameState => {
      const systems = createGameSystems(gameData(withSales));
      let current = fresh();
      for (let k = 0; k < 25; k++) current = advanceWeek(current, systems).state;
      return current;
    };
    const on = run(true);
    const off = run(false);
    expect(on.raceResults).toEqual(off.raceResults);
  }, LONG_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('src/engine/sales 와 populationSystem 에는 Math.random·Date.now·DOM 접근이 없다', () => {
    const dir = fileURLToPath(new URL('../../src/engine/sales/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('auction.ts');
    for (const file of files) {
      const text = readFileSync(`${dir}${file}`, 'utf8');
      expect(text, file).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\b/);
    }
    const pop = readFileSync(fileURLToPath(new URL('../../src/engine/world/populationSystem.ts', import.meta.url)), 'utf8');
    expect(pop).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\b/);
  });
});
