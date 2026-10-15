import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { SALE_LIVE_MAX_STEPS } from '../../src/engine/config/sales';
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
import type { CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { resolveLot, type LotOutcome } from '../../src/engine/sales/auction';
import {
  clearMaxBid,
  liveAuctionSteps,
  lotView,
  saleCalendarView,
  setMaxBid,
  type AuctionStep,
} from '../../src/engine/sales/bidding';
import { announceWeekOf, createSalesSystem, type SalesStaticData } from '../../src/engine/sales/system';
import { estimateRange } from '../../src/engine/sales/valuation';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { allocateHorseId } from '../../src/engine/state/world';
import { addWeeks } from '../../src/engine/time/calendar';
import type {
  GameEvent,
  GameState,
  Horse,
  Money,
  Owner,
  SaleCatalogue,
  SaleEventDef,
  SaleKind,
  SaleLot,
} from '../../src/engine/types';

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;
const RUN_TIMEOUT = 600_000;
/** 플레이어·AI 자금을 넉넉히 채울 때 쓰는 값 */
const RICH = 5_000_000_000;

const SALES = getSalesData();
const DATA: SalesStaticData = { sales: SALES };

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

/** 발표 주가 가장 이른 세일(화면 일정 첫 12개 안에 들어간다) */
function earliestEvent(): SaleEventDef {
  const sorted = [...SALES.events].sort(
    (a, b) => announceWeekOf(a) - announceWeekOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const event = sorted[0];
  if (event === undefined) throw new Error('세일 데이터 없음');
  return event;
}

function playerOf(state: GameState): Owner {
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) throw new Error('테스트 전제 위반: 플레이어 마주 없음');
  return owner;
}

function ownerById(state: GameState, id: string): Owner {
  const owner = state.owners[id];
  if (owner === undefined) throw new Error(`테스트 전제 위반: 마주 없음 ${id}`);
  return owner;
}

/** 플레이어 자금을 넉넉히 채우고 빚을 없앤다 */
function enrich(state: GameState): GameState {
  playerOf(state).funds = RICH;
  state.economy.debt = 0;
  return state;
}

/** 세일 처리를 주 date 에 한 번 돌린 복제본 */
function runSalesAt(state: GameState, date: { year: number; week: number }): GameState {
  const draft = structuredClone(state);
  createSalesSystem(SALES_DATA).run(draft, { date, rng: createRng(1) });
  return draft;
}

/** 세일 발표 주에 카탈로그를 만든 복제본(현재 주도 발표 주로 맞춘다) */
function announced(event: SaleEventDef): GameState {
  const week = announceWeekOf(event);
  const draft = runSalesAt(fresh(), { year: YEAR, week });
  draft.date = { year: YEAR, week: event.week - 4 };
  return draft;
}

/** 세일의 북 날짜들(해 YEAR 기준, 오름차순) */
function bookWeeks(event: SaleEventDef): { year: number; week: number }[] {
  return event.books
    .slice()
    .sort((a, b) => a.book - b.book)
    .map((b) => addWeeks({ year: YEAR, week: event.week }, b.weekOffset));
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

function catalogueOf(state: GameState, event: SaleEventDef): SaleCatalogue {
  const cat = state.sales.catalogues.find((c) => c.saleId === event.id && c.year === YEAR);
  if (cat === undefined) throw new Error(`카탈로그 없음: ${event.id}`);
  return cat;
}

function lotIn(catalogue: SaleCatalogue, lotNo: number): SaleLot {
  const lot = catalogue.lots.find((l) => l.lotNo === lotNo);
  if (lot === undefined) throw new Error(`로트 없음: ${lotNo}`);
  return lot;
}

function firstLot(catalogue: SaleCatalogue, pred: (l: SaleLot) => boolean = () => true): SaleLot {
  const lot = catalogue.lots.find(pred);
  if (lot === undefined) throw new Error('테스트 전제 위반: 조건에 맞는 로트 없음');
  return lot;
}

/** 로트의 판매 주(세일 시작 주 + 북 주 오프셋), 테스트에서 따로 계산한다 */
function saleWeekOfLot(event: SaleEventDef, lot: SaleLot): { year: number; week: number } {
  const book = event.books.find((b) => b.book === lot.book);
  if (book === undefined) throw new Error('테스트 전제 위반: 북 없음');
  return addWeeks({ year: YEAR, week: event.week }, book.weekOffset);
}

/** 성공 결과의 상태(실패면 테스트 실패) */
function okState(r: { ok: true; state: GameState } | { ok: false; error: string }): GameState {
  if (!r.ok) throw new Error(`실패한 호출: ${r.error}`);
  return r.state;
}

const ZERO_RECORD = { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 };

/** 테스트용 말 한 마리를 draft 에 만든다 */
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

/** 플레이어가 1세마 한 마리를 위탁한 뒤 발표한 상태 */
function consignedAnnounced(event: SaleEventDef): { state: GameState; horseId: string } {
  const state = fresh();
  const horseId = addHorse(state, { ownerId: state.playerOwnerId });
  playerOf(state).horseIds.push(horseId);
  state.sales.consignments.push({ saleId: event.id, year: YEAR, horseId, reserve: 50_000 });
  const week = announceWeekOf(event);
  const draft = runSalesAt(state, { year: YEAR, week });
  draft.date = { year: YEAR, week: event.week - 4 };
  return { state: enrich(draft), horseId };
}

/** 경매 결과를 단계 목록과 대조한다(마지막 단계 = resolveLot, 단계 가격 단조 증가, 상한 준수) */
function expectStepsMatch(steps: readonly AuctionStep[], outcome: LotOutcome, minimum: Money, checkFirst: boolean): void {
  const result = outcome.result;
  if (result.kind === 'withdrawn') {
    expect(steps).toEqual([]);
    return;
  }
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.length).toBeLessThanOrEqual(SALE_LIVE_MAX_STEPS);
  const last = steps[steps.length - 1];
  if (result.kind === 'sold') {
    expect(last).toMatchObject({ price: result.price, leader: outcome.buyerIsPlayer ? 'player' : 'ai' });
  } else {
    expect(last).toMatchObject({ price: result.lastBid, leader: 'none' });
  }
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev === undefined || cur === undefined) throw new Error('단계 없음');
    expect(cur.price).toBeGreaterThan(prev.price);
  }
  for (const step of steps) {
    expect(Number.isInteger(step.dropped) && step.dropped >= 0).toBe(true);
  }
  const noBidders = result.kind === 'bought_back' && result.lastBid === 0;
  // 단계가 SALE_LIVE_MAX_STEPS 로 잘렸으면 앞쪽(최저가 쪽)이 버려진다(설계 규칙). 2026-10-15 데이터 변화로 €3M 낙찰 로트가 표본에 들어옴
  const truncated = steps.length === SALE_LIVE_MAX_STEPS;
  if (checkFirst && !noBidders && !truncated) expect(steps[0]?.price).toBe(minimum);
}

describe('setMaxBid 실패 사유 (수용 1)', () => {
  it('catalogue_not_found: 발표 전(카탈로그 없음)', () => {
    const event = eventOfKind('yearling');
    const r = setMaxBid(fresh(), event.id, YEAR, 1, event.minimumBid, DATA);
    expect(r).toEqual({ ok: false, error: 'catalogue_not_found' });
  });

  it('lot_not_found: 카탈로그에 없는 로트 번호', () => {
    const event = eventOfKind('yearling');
    const base = announced(event);
    const r = setMaxBid(base, event.id, YEAR, 999_999, event.minimumBid, DATA);
    expect(r).toEqual({ ok: false, error: 'lot_not_found' });
  });

  it('lot_closed: 마감된 카탈로그(모든 북 진행 뒤)', () => {
    const event = eventOfKind('yearling');
    const done = runBooks(announced(event), event).state;
    const lot = firstLot(catalogueOf(done, event));
    const r = setMaxBid(done, event.id, YEAR, lot.lotNo, event.minimumBid, DATA);
    expect(r).toEqual({ ok: false, error: 'lot_closed' });
  });

  it('lot_closed: 카탈로그는 진행 중이어도 로트 결과가 이미 있으면 거절', () => {
    const event = eventOfKind('yearling');
    const base = announced(event);
    const lot = firstLot(catalogueOf(base, event));
    lotIn(catalogueOf(base, event), lot.lotNo).result = { kind: 'withdrawn' };
    const r = setMaxBid(base, event.id, YEAR, lot.lotNo, event.minimumBid, DATA);
    expect(r).toEqual({ ok: false, error: 'lot_closed' });
  });

  it('too_late: 판매 주가 지났으면 거절, 같은 주는 허용', () => {
    const event = eventOfKind('yearling');
    const base = announced(event);
    const lot = firstLot(catalogueOf(base, event));
    const sale = saleWeekOfLot(event, lot);

    const late = structuredClone(base);
    late.date = addWeeks(sale, 1);
    expect(setMaxBid(enrich(late), event.id, YEAR, lot.lotNo, event.minimumBid, DATA)).toEqual({
      ok: false,
      error: 'too_late',
    });

    const sameWeek = structuredClone(base);
    sameWeek.date = { ...sale };
    expect(setMaxBid(enrich(sameWeek), event.id, YEAR, lot.lotNo, event.minimumBid, DATA).ok).toBe(true);
  });

  it('own_lot: 플레이어 위탁 로트에는 입찰할 수 없다', () => {
    const event = eventOfKind('yearling');
    const { state, horseId } = consignedAnnounced(event);
    const lot = firstLot(catalogueOf(state, event), (l) => l.horseId === horseId);
    expect(lot.vendor).toEqual({ kind: 'owner', id: state.playerOwnerId });
    const r = setMaxBid(state, event.id, YEAR, lot.lotNo, event.minimumBid, DATA);
    expect(r).toEqual({ ok: false, error: 'own_lot' });
  });

  it('invalid_amount: 최저가 미만, 정수가 아닌 값, NaN 은 거절', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    for (const amount of [event.minimumBid - 1, event.minimumBid + 0.5, Number.NaN]) {
      const r = setMaxBid(base, event.id, YEAR, lot.lotNo, amount, DATA);
      expect(r, String(amount)).toEqual({ ok: false, error: 'invalid_amount' });
    }
  });

  it('insufficient_funds: 상한 × (1 + 구매 수수료) 를 낼 자금이 없으면 거절(경계 포함)', () => {
    const event = eventOfKind('yearling');
    const base = announced(event);
    const lot = firstLot(catalogueOf(base, event));
    const amount = 10_000;
    const need = Math.round(amount * (1 + event.buyerPremiumRate));

    const poor = structuredClone(base);
    playerOf(poor).funds = 0;
    expect(setMaxBid(poor, event.id, YEAR, lot.lotNo, amount, DATA)).toEqual({ ok: false, error: 'insufficient_funds' });

    const short = structuredClone(base);
    playerOf(short).funds = need - 1;
    expect(setMaxBid(short, event.id, YEAR, lot.lotNo, amount, DATA)).toEqual({ ok: false, error: 'insufficient_funds' });

    const exact = structuredClone(base);
    playerOf(exact).funds = need;
    expect(setMaxBid(exact, event.id, YEAR, lot.lotNo, amount, DATA).ok).toBe(true);
  });
});

describe('입찰 저장: 덮어쓰기·정렬·clear (수용 1)', () => {
  it('같은 로트는 덮어쓰고, 목록은 (saleId, year, lotNo) 순서로 정렬된다', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const cat = catalogueOf(base, event);
    const lotA = cat.lots[4];
    const lotB = cat.lots[1];
    if (lotA === undefined || lotB === undefined) throw new Error('테스트 전제 위반: 로트 부족');

    let state = okState(setMaxBid(base, event.id, YEAR, lotA.lotNo, 20_000, DATA));
    state = okState(setMaxBid(state, event.id, YEAR, lotB.lotNo, 30_000, DATA));
    expect(state.sales.playerBids.map((b) => b.lotNo)).toEqual([lotB.lotNo, lotA.lotNo].sort((x, y) => x - y));

    state = okState(setMaxBid(state, event.id, YEAR, lotA.lotNo, 45_000, DATA));
    expect(state.sales.playerBids).toHaveLength(2);
    const bidA = state.sales.playerBids.find((b) => b.lotNo === lotA.lotNo);
    expect(bidA?.maxBid).toBe(45_000);
  });

  it('정렬은 saleId 가 먼저다(다른 세일 입찰이 섞여 있어도 setMaxBid 뒤 목록이 정렬된다)', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    base.sales.playerBids = [
      { saleId: 'sev_zz_other', year: YEAR, lotNo: 9, maxBid: 5_000 },
      { saleId: 'sev_aa_other', year: YEAR, lotNo: 3, maxBid: 5_000 },
    ];
    const after = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, 6_000, DATA));
    expect(after.sales.playerBids.map((b) => b.saleId)).toEqual(['sev_aa_other', event.id, 'sev_zz_other']);
  });

  it('clearMaxBid: 있으면 지우고, 없으면 bid_not_found', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    const bidded = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, event.minimumBid, DATA));
    const cleared = clearMaxBid(bidded, event.id, YEAR, lot.lotNo);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) throw new Error('지우기 실패');
    expect(cleared.state.sales.playerBids).toEqual([]);
    expect(clearMaxBid(cleared.state, event.id, YEAR, lot.lotNo)).toEqual({ ok: false, error: 'bid_not_found' });
  });
});

describe('lotView 화면 정보 (수용 2)', () => {
  it('키에 valuation·aiBids 가 없다(Object.keys 검사)', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    const view = lotView(base, event.id, YEAR, lot.lotNo, DATA);
    if (view === null) throw new Error('뷰 없음');
    expect(Object.keys(view).sort()).toEqual(['estimate', 'lot', 'myBid', 'result', 'saleWeek']);
    expect(Object.keys(view.lot).sort()).toEqual(
      ['book', 'horseId', 'horseName', 'lotNo', 'reserveKnown', 'sireId', 'vendorKind'].sort(),
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain('valuation');
    expect(text).not.toContain('aiBids');
  });

  it('추정 범위는 estimateRange(valuation), 내 입찰은 myBid, 판매 주는 북 주', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    const bidded = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, 12_000, DATA));
    const view = lotView(bidded, event.id, YEAR, lot.lotNo, DATA);
    if (view === null) throw new Error('뷰 없음');
    expect(view.estimate).toEqual(estimateRange(lot.valuation));
    expect(view.myBid).toBe(12_000);
    expect(view.saleWeek).toEqual(saleWeekOfLot(event, lot));
    expect(view.result).toBeNull();
  });

  it('유보가는 플레이어 위탁 로트에서만 보인다', () => {
    const event = eventOfKind('yearling');
    const { state, horseId } = consignedAnnounced(event);
    const own = firstLot(catalogueOf(state, event), (l) => l.horseId === horseId);
    const ownView = lotView(state, event.id, YEAR, own.lotNo, DATA);
    expect(ownView?.lot.reserveKnown).toBe(own.reserve);
    expect(ownView?.lot.vendorKind).toBe('owner');

    const other = firstLot(catalogueOf(state, event), (l) => l.vendor.kind === 'breeder');
    expect(lotView(state, event.id, YEAR, other.lotNo, DATA)?.lot.reserveKnown).toBeNull();
  });

  it('없는 로트는 null', () => {
    const event = eventOfKind('yearling');
    expect(lotView(announced(event), event.id, YEAR, 999_999, DATA)).toBeNull();
  });
});

describe('liveAuctionSteps 실시간 호가 (수용 3·4)', () => {
  it(
    '무작위 로트 200개 × playerMax(null·최저가·높게) 3가지: 마지막 단계 = resolveLot, 단조 증가, 첫 단계 = 최저가',
    () => {
      // 1단계: 전 세일의 발표 카탈로그에서 로트 목록을 모은다
      const pairs: { eventId: string; lotNo: number }[] = [];
      for (const event of SALES.events) {
        for (const lot of catalogueOf(announced(event), event).lots) pairs.push({ eventId: event.id, lotNo: lot.lotNo });
      }
      const picked = createRng(`${SEED}:live-pick`).shuffle(pairs).slice(0, 200);
      expect(picked).toHaveLength(200);

      // 2단계: 세일별로 한 번만 상태를 만들어 그 세일의 뽑힌 로트를 전부 검사한다
      let checked = 0;
      for (const event of SALES.events) {
        const mine = picked.filter((p) => p.eventId === event.id);
        if (mine.length === 0) continue;
        const state = enrich(announced(event));
        const cat = catalogueOf(state, event);
        for (const { lotNo } of mine) {
          const lot = lotIn(cat, lotNo);
          for (const playerMax of [null, event.minimumBid, lot.valuation * 3]) {
            const steps = liveAuctionSteps(state, event.id, YEAR, lotNo, playerMax, DATA);
            expectStepsMatch(steps, resolveLot(state, lot, event, playerMax), event.minimumBid, true);
            checked++;
          }
        }
      }
      expect(checked).toBe(600);
    },
    RUN_TIMEOUT,
  );

  it('단계 상한: 두 명의 큰 상한이 상한 200 단계를 넘기면 앞쪽을 버리고 마지막 결과는 그대로', () => {
    const event = eventOfKind('yearling');
    const state = enrich(announced(event));
    const lot = firstLot(catalogueOf(state, event), (l) => l.vendor.kind === 'breeder');
    const owners = Object.values(state.owners)
      .filter((o) => !o.isPlayer)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const first = owners[0];
    const second = owners[1];
    if (first === undefined || second === undefined) throw new Error('테스트 전제 위반: AI 마주 2명 필요');
    ownerById(state, first.id).funds = RICH;
    ownerById(state, second.id).funds = RICH;
    lot.aiBids = [
      { ownerId: first.id, max: 5_000_000 },
      { ownerId: second.id, max: 4_000_000 },
    ];
    lot.reserve = null;

    const steps = liveAuctionSteps(state, event.id, YEAR, lot.lotNo, null, DATA);
    expect(steps).toHaveLength(SALE_LIVE_MAX_STEPS);
    expectStepsMatch(steps, resolveLot(state, lot, event, null), event.minimumBid, false);
    expect(steps[steps.length - 1]).toMatchObject({ leader: 'ai' });
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const cur = steps[i];
      if (prev === undefined || cur === undefined) throw new Error('단계 없음');
      expect(cur.price).toBeGreaterThan(prev.price);
    }
  });

  it('입찰이 전혀 없으면 바이백 단계 하나(가격 0, 선두 none)', () => {
    const event = eventOfKind('yearling');
    const state = enrich(announced(event));
    const lot = firstLot(catalogueOf(state, event), (l) => l.vendor.kind === 'breeder');
    lot.aiBids = [];
    expect(liveAuctionSteps(state, event.id, YEAR, lot.lotNo, null, DATA)).toEqual([{ price: 0, leader: 'none', dropped: 0 }]);
  });

  it('로트가 없으면 빈 목록', () => {
    const event = eventOfKind('yearling');
    expect(liveAuctionSteps(announced(event), event.id, YEAR, 999_999, null, DATA)).toEqual([]);
  });
});

describe('시드 진행: 플레이어 낙찰 또는 underbidder (수용 5)', () => {
  it(
    '1세마 세일 북 1 로트: 큰 상한이면 플레이어 낙찰, 최저가 상한이면 underbidder',
    () => {
      const event = eventOfKind('yearling');
      const base = enrich(announced(event));
      const lot = firstLot(
        catalogueOf(base, event),
        (l) =>
          l.book === 1 &&
          l.vendor.kind === 'breeder' &&
          l.aiBids.length > 0 &&
          l.reserve !== null &&
          l.reserve > event.minimumBid,
      );
      const topAi = Math.max(...lot.aiBids.map((b) => b.max));
      const big = Math.max(topAi, lot.reserve ?? 0, lot.valuation) * 2;

      // 큰 상한: 북 진행 뒤 플레이어 낙찰
      const won = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, big, DATA));
      const wonDone = runBooks(won, event);
      const wonLot = lotIn(catalogueOf(wonDone.state, event), lot.lotNo);
      expect(wonLot.result).toMatchObject({ kind: 'sold', buyerId: base.playerOwnerId });
      if (wonLot.result?.kind !== 'sold') throw new Error('낙찰 아님');
      expect(wonLot.result.price).toBeLessThanOrEqual(big);
      expect(wonDone.events).toContainEqual(
        expect.objectContaining({ type: 'sale_lot_result', lotNo: lot.lotNo, role: 'buyer' }),
      );
      expect(wonDone.state.horses[lot.horseId]?.ownerId).toBe(base.playerOwnerId);

      // 실시간 보기: 입찰 직전 상태에서 마지막 단계는 resolveLot(플레이어 선두 낙찰)과 같다
      const steps = liveAuctionSteps(won, event.id, YEAR, lot.lotNo, big, DATA);
      expectStepsMatch(steps, resolveLot(won, lot, event, big), event.minimumBid, true);
      expect(steps[steps.length - 1]).toMatchObject({ leader: 'player' });

      // 최저가 상한: 유보가보다 낮아 못 사고 underbidder
      const small = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, event.minimumBid, DATA));
      const lostDone = runBooks(small, event);
      const lostLot = lotIn(catalogueOf(lostDone.state, event), lot.lotNo);
      expect(lostLot.result).not.toMatchObject({ kind: 'sold', buyerId: base.playerOwnerId });
      expect(lostDone.events).toContainEqual(
        expect.objectContaining({ type: 'sale_lot_result', lotNo: lot.lotNo, role: 'underbidder' }),
      );
    },
    RUN_TIMEOUT,
  );
});

describe('saleCalendarView 세일 일정 (화면 C10 용)', () => {
  it('내 입찰 수·내 위탁 수·발표 여부를 붙인다', () => {
    const event = earliestEvent();
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    const bidded = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, event.minimumBid, DATA));
    bidded.sales.consignments.push({ saleId: event.id, year: YEAR, horseId: lot.horseId, reserve: null });

    const rows = saleCalendarView(bidded, DATA);
    const row = rows.find((r) => r.event.id === event.id && r.year === YEAR);
    expect(row).toMatchObject({ myBidCount: 1, myConsignmentCount: 1, announced: true, status: 'catalogued' });

    const other = rows.find((r) => r.event.id !== event.id && r.year === YEAR);
    expect(other).toMatchObject({ myBidCount: 0, myConsignmentCount: 0, announced: false });
  });
});

describe('순수성과 결정성', () => {
  it('입력 상태는 바뀌지 않는다', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    const snapshot = structuredClone(base);
    const bidded = okState(setMaxBid(base, event.id, YEAR, lot.lotNo, 15_000, DATA));
    expect(base).toEqual(snapshot);
    lotView(bidded, event.id, YEAR, lot.lotNo, DATA);
    liveAuctionSteps(bidded, event.id, YEAR, lot.lotNo, 15_000, DATA);
    saleCalendarView(bidded, DATA);
    const cleared = clearMaxBid(bidded, event.id, YEAR, lot.lotNo);
    expect(cleared.ok).toBe(true);
    expect(bidded.sales.playerBids).toHaveLength(1);
  });

  it('같은 입력이면 단계 목록과 로트 뷰가 같다', () => {
    const event = eventOfKind('yearling');
    const base = enrich(announced(event));
    const lot = firstLot(catalogueOf(base, event));
    const a = liveAuctionSteps(base, event.id, YEAR, lot.lotNo, lot.valuation, DATA);
    const b = liveAuctionSteps(structuredClone(base), event.id, YEAR, lot.lotNo, lot.valuation, DATA);
    expect(a).toEqual(b);
    expect(lotView(base, event.id, YEAR, lot.lotNo, DATA)).toEqual(
      lotView(structuredClone(base), event.id, YEAR, lot.lotNo, DATA),
    );
  });

  it('src/engine/sales/bidding.ts 에는 Math.random·Date.now·DOM 접근이 없다', () => {
    const file = fileURLToPath(new URL('../../src/engine/sales/bidding.ts', import.meta.url));
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\b/);
  });
});
