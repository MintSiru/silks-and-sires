import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { SALE_CATALOGUE_KEEP_WEEKS, SALE_CATALOGUE_LEAD_WEEKS, SALE_UPCOMING_LIMIT } from '../../src/engine/config/sales';
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
import { consignToSale, upcomingSales, withdrawConsignment } from '../../src/engine/sales/player';
import { announceWeekOf, createSalesSystem, lastBookDate, type SalesStaticData } from '../../src/engine/sales/system';
import { fitsKind, type CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { createRng } from '../../src/engine/rng';
import { serializeGame, deserializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { allocateHorseId } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import { addWeeks } from '../../src/engine/time/calendar';
import type {
  GameEvent,
  GameState,
  Horse,
  SaleCatalogue,
  SaleEventDef,
  SaleKind,
  SaleSummary,
  WeeklySystem,
} from '../../src/engine/types';

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;
const RUN_TIMEOUT = 600_000;

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

/** 주 시스템 정적 데이터. withSales 가 false 면 sales 키 자체를 넣지 않는다 */
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

/** 세일 시스템 직접 호출용 데이터(카탈로그 생성 + 발표) */
const SALES_DATA: SalesStaticData & Omit<CatalogueStaticData, 'sales'> = {
  sales: SALES,
  stallionRecords: getStallionRecords(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

let BASE: GameState;
let TEMPLATE: Horse;
let SALES_RUN: { state: GameState; events: GameEvent[] } | undefined;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  const template = Object.values(BASE.horses)[0];
  if (template === undefined) throw new Error('테스트 전제 위반: 말이 없다');
  TEMPLATE = template;
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

function eventOf(id: string): SaleEventDef {
  const event = SALES.events.find((e) => e.id === id);
  if (event === undefined) throw new Error(`세일 없음: ${id}`);
  return event;
}

function eventOfKind(kind: SaleKind): SaleEventDef {
  const event = SALES.events.find((e) => e.kind === kind);
  if (event === undefined) throw new Error(`종류 세일 없음: ${kind}`);
  return event;
}

function runWeeks(start: GameState, systems: readonly WeeklySystem[], weeks: number): { state: GameState; events: GameEvent[] } {
  let current = start;
  const events: GameEvent[] = [];
  for (let i = 0; i < weeks; i++) {
    const result = advanceWeek(current, systems);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** 세일 데이터를 넣은 52주 진행(한 번만 돌리고 여러 테스트가 같이 쓴다) */
function salesRun(): { state: GameState; events: GameEvent[] } {
  if (SALES_RUN === undefined) {
    SALES_RUN = runWeeks(fresh(), createGameSystems(gameData(true)), WEEKS_PER_YEAR);
  }
  return SALES_RUN;
}

/** 올해 주 week 에 세일 시스템만 한 번 돌린 복제본 */
function runSalesWeek(state: GameState, week: number): GameState {
  const draft = structuredClone(state);
  createSalesSystem(SALES_DATA).run(draft, { date: { year: YEAR, week }, rng: createRng(1) });
  return draft;
}

const ZERO_RECORD = { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 };

/** 종류별로 위탁 조건을 만족하는 플레이어 말 설정(officialRating null: 현역마 판매 후보에서 뺀다) */
const KIND_PATCH: Record<SaleKind, Partial<Horse>> = {
  yearling: { birthYear: YEAR - 1, status: 'yearling', officialRating: null, record: { ...ZERO_RECORD } },
  foal: { birthYear: YEAR, status: 'weanling', officialRating: null, record: { ...ZERO_RECORD } },
  breeze_up: { birthYear: YEAR - 2, status: 'yearling', officialRating: null, record: { ...ZERO_RECORD } },
  horses_in_training: { birthYear: YEAR - 3, status: 'in_training', officialRating: null, record: { ...ZERO_RECORD, starts: 2 } },
  breeding_stock: { birthYear: YEAR - 6, status: 'broodmare', sex: 'female', officialRating: null, record: { ...ZERO_RECORD, starts: 9 } },
};

/** 플레이어 말을 draft 에 하나 만들고 id 를 돌려준다 */
function addPlayerHorse(draft: GameState, patch: Partial<Horse>): string {
  const id = allocateHorseId(draft);
  draft.horses[id] = {
    ...structuredClone(TEMPLATE),
    id,
    name: `Test ${id}`,
    ownerId: draft.playerOwnerId,
    trainerId: null,
    breederId: null,
    ...patch,
  };
  return id;
}

describe('세일 정적 규칙(순수 함수)', () => {
  it('발표 주 = 세일 시작 주 − SALE_CATALOGUE_LEAD_WEEKS, 마지막 북 주 = 시작 주 + 가장 늦은 북 오프셋', () => {
    const oct = eventOf('sev_ashcombe_yearling_oct'); // week 41, 북 오프셋 0·0·1·1
    expect(announceWeekOf(oct)).toBe(oct.week - SALE_CATALOGUE_LEAD_WEEKS);
    expect(lastBookDate(oct, YEAR)).toEqual({ year: YEAR, week: oct.week + 1 });
  });

  it('발표 주가 1보다 작은 세일이 있으면 createSalesSystem 이 RangeError 를 던진다', () => {
    const bad = eventOf('sev_ashcombe_yearling_oct');
    const sales = { ...SALES, events: [{ ...bad, week: SALE_CATALOGUE_LEAD_WEEKS }] };
    expect(() => createSalesSystem({ ...SALES_DATA, sales })).toThrow(RangeError);
  });

  it('데이터 15개 세일의 발표 주는 모두 1 이상이다', () => {
    expect(SALES.events).toHaveLength(15);
    for (const event of SALES.events) {
      expect(announceWeekOf(event), event.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('발표 (수용 1)', () => {
  it('52주 진행: 15개 세일 모두 발표 주에 카탈로그 1개씩, 이벤트 15개, 발표 주 = 세일 주 − 4', () => {
    const { state, events } = salesRun();
    const published = events.filter((e) => e.type === 'sale_catalogue_published');
    expect(published).toHaveLength(15);

    for (const event of SALES.events) {
      const matches = published.filter((e) => e.type === 'sale_catalogue_published' && e.saleId === event.id);
      expect(matches, event.id).toHaveLength(1);
      const ev = matches[0];
      if (ev === undefined || ev.type !== 'sale_catalogue_published') throw new Error('이벤트 없음');
      expect(ev.year, event.id).toBe(YEAR);
      expect(ev.date, event.id).toEqual({ year: YEAR, week: event.week - SALE_CATALOGUE_LEAD_WEEKS });

      const catalogues = state.sales.catalogues.filter((c) => c.saleId === event.id && c.year === YEAR);
      expect(catalogues, event.id).toHaveLength(1);
      expect(ev.lots, event.id).toBe(catalogues[0]?.lots.length);
    }
    expect(state.sales.catalogues).toHaveLength(15);
  }, RUN_TIMEOUT);

  it('sales 데이터 없이 만든 시스템 목록으로 52주 진행하면 state.sales 는 그대로이고 발표도 없다', () => {
    const { state, events } = runWeeks(fresh(), createGameSystems(gameData(false)), WEEKS_PER_YEAR);
    expect(state.sales).toEqual(BASE.sales);
    expect(events.some((e) => e.type === 'sale_catalogue_published')).toBe(false);
  }, RUN_TIMEOUT);

  it('같은 발표 주를 두 번 돌려도 그 해 카탈로그는 한 번만 만든다', () => {
    const event = eventOfKind('yearling');
    const once = runSalesWeek(fresh(), announceWeekOf(event));
    const twice = runSalesWeek(once, announceWeekOf(event));
    expect(twice.sales.catalogues).toEqual(once.sales.catalogues);
    expect(once.sales.catalogues.filter((c) => c.saleId === event.id)).toHaveLength(1);
  }, RUN_TIMEOUT);
});

describe('정리 (수용 2)', () => {
  const ASHCOMBE_OCT = 'sev_ashcombe_yearling_oct';
  const OTHER_SALE = 'sev_quenmoor_yearling_sep';

  function closedCatalogue(saleId: string, year: number, status: SaleCatalogue['status'] = 'closed'): SaleCatalogue {
    return { saleId, year, status, lots: [] };
  }

  it('마감 카탈로그는 마지막 북 주 + SALE_CATALOGUE_KEEP_WEEKS 주가 지나면 지우고, 그 전에는 남긴다', () => {
    const event = eventOf(ASHCOMBE_OCT);
    const last = lastBookDate(event, YEAR);
    const draft = fresh();
    draft.sales.catalogues = [closedCatalogue(event.id, YEAR)];
    const system = createSalesSystem(SALES_DATA);

    expect(system.run(draft, { date: addWeeks(last, SALE_CATALOGUE_KEEP_WEEKS - 1), rng: createRng(1) })).toEqual([]);
    expect(draft.sales.catalogues).toHaveLength(1);
    expect(system.run(draft, { date: addWeeks(last, SALE_CATALOGUE_KEEP_WEEKS), rng: createRng(1) })).toEqual([]);
    expect(draft.sales.catalogues).toHaveLength(0);
  });

  it('카탈로그를 지울 때 그 세일·해의 playerBids 만 지우고 다른 세일 입찰은 남긴다', () => {
    const event = eventOf(ASHCOMBE_OCT);
    const last = lastBookDate(event, YEAR);
    const draft = fresh();
    draft.sales.catalogues = [closedCatalogue(event.id, YEAR)];
    draft.sales.playerBids = [
      { saleId: event.id, year: YEAR, lotNo: 1, maxBid: 5_000 },
      { saleId: OTHER_SALE, year: YEAR, lotNo: 2, maxBid: 6_000 },
    ];
    createSalesSystem(SALES_DATA).run(draft, { date: addWeeks(last, SALE_CATALOGUE_KEEP_WEEKS), rng: createRng(1) });
    expect(draft.sales.catalogues).toEqual([]);
    expect(draft.sales.playerBids).toEqual([{ saleId: OTHER_SALE, year: YEAR, lotNo: 2, maxBid: 6_000 }]);
  });

  it('연도 넘김: 12월 세일(마지막 북 주 51)은 다음 해 7주에 지운다', () => {
    const event = eventOf('sev_ashcombe_breeding_stock_dec');
    const last = lastBookDate(event, YEAR);
    expect(last).toEqual({ year: YEAR, week: 51 });
    const system = createSalesSystem(SALES_DATA);
    const draft = fresh();
    draft.sales.catalogues = [closedCatalogue(event.id, YEAR)];
    system.run(draft, { date: { year: YEAR + 1, week: 6 }, rng: createRng(1) });
    expect(draft.sales.catalogues).toHaveLength(1);
    system.run(draft, { date: { year: YEAR + 1, week: 7 }, rng: createRng(1) });
    expect(draft.sales.catalogues).toHaveLength(0);
  });

  it('진행 중(catalogued) 카탈로그는 날짜가 지나도 지우지 않는다', () => {
    const event = eventOf(ASHCOMBE_OCT);
    const draft = fresh();
    draft.sales.catalogues = [closedCatalogue(event.id, YEAR, 'catalogued')];
    createSalesSystem(SALES_DATA).run(draft, { date: addWeeks(lastBookDate(event, YEAR), 30), rng: createRng(1) });
    expect(draft.sales.catalogues).toHaveLength(1);
  });

  it('세일 요약(history)은 SALE_HISTORY_YEARS 년보다 오래된 것만 지운다', () => {
    const summary = (year: number): SaleSummary => ({
      saleId: ASHCOMBE_OCT,
      year,
      kind: 'yearling',
      offered: 10,
      sold: 5,
      turnover: 100_000,
      median: 20_000,
      top: null,
    });
    const draft = fresh();
    draft.sales.history = [summary(YEAR - 4), summary(YEAR - 3), summary(YEAR - 1)];
    createSalesSystem(SALES_DATA).run(draft, { date: { year: YEAR, week: 1 }, rng: createRng(1) });
    expect(draft.sales.history.map((h) => h.year)).toEqual([YEAR - 3, YEAR - 1]);
  });
});

describe('위탁 (수용 3)', () => {
  it('종류별로 위탁 1건 이상이 성공한다', () => {
    for (const kind of KINDS) {
      const draft = fresh();
      const horseId = addPlayerHorse(draft, KIND_PATCH[kind]);
      const result = consignToSale(draft, horseId, eventOfKind(kind).id, null, SALES_DATA);
      expect(result.ok, kind).toBe(true);
    }
  });

  it('위탁한 말은 그 세일 카탈로그의 로트(vendor owner, reserve 그대로)가 되고 consignments 에서 빠진다', () => {
    for (const kind of KINDS) {
      const event = eventOfKind(kind);
      const draft = fresh();
      const horseId = addPlayerHorse(draft, KIND_PATCH[kind]);
      const result = consignToSale(draft, horseId, event.id, 12_345, SALES_DATA);
      if (!result.ok) throw new Error(`위탁 실패: ${kind} ${result.error}`);

      const published = runSalesWeek(result.state, announceWeekOf(event));
      const catalogue = published.sales.catalogues.find((c) => c.saleId === event.id && c.year === YEAR);
      const lot = catalogue?.lots.find((l) => l.horseId === horseId);
      expect(lot, kind).toBeDefined();
      expect(lot?.vendor, kind).toEqual({ kind: 'owner', id: draft.playerOwnerId });
      expect(lot?.reserve, kind).toBe(12_345);
      expect(published.sales.consignments.some((c) => c.horseId === horseId), kind).toBe(false);
    }
  }, RUN_TIMEOUT);

  it('위탁 실패 사유: 세일 없음·말 없음·AI 말·종류 불일치', () => {
    const draft = fresh();
    const yearling = addPlayerHorse(draft, KIND_PATCH.yearling);
    const foal = eventOfKind('foal');
    expect(consignToSale(draft, yearling, 'sev_nowhere', null, SALES_DATA)).toEqual({ ok: false, error: 'sale_not_found' });
    expect(consignToSale(draft, 'h-missing', eventOfKind('yearling').id, null, SALES_DATA)).toEqual({ ok: false, error: 'not_found' });
    const aiHorse = Object.values(draft.horses).find((h) => h.ownerId !== draft.playerOwnerId);
    if (aiHorse === undefined) throw new Error('테스트 전제 위반: AI 말이 없다');
    expect(consignToSale(draft, aiHorse.id, eventOfKind('yearling').id, null, SALES_DATA)).toEqual({
      ok: false,
      error: 'not_player_horse',
    });
    // 1세마를 이유마 세일에 낸다
    expect(consignToSale(draft, yearling, foal.id, null, SALES_DATA)).toEqual({ ok: false, error: 'wrong_kind' });
  });

  it('위탁 실패 사유(wrong_kind): 종류 판정은 카탈로그 fitsKind 와 같다 — 2세 조교마는 조교마 세일 불가', () => {
    const draft = fresh();
    const twoYearOld = addPlayerHorse(draft, { ...KIND_PATCH.horses_in_training, birthYear: YEAR - 2 });
    expect(consignToSale(draft, twoYearOld, eventOfKind('horses_in_training').id, null, SALES_DATA)).toEqual({
      ok: false,
      error: 'wrong_kind',
    });
  });

  it('위탁 실패 사유(wrong_kind): 브리즈업은 2세 yearling 만(조교 중인 2세마는 불가)', () => {
    const draft = fresh();
    const training = addPlayerHorse(draft, { ...KIND_PATCH.breeze_up, status: 'in_training' });
    expect(consignToSale(draft, training, eventOfKind('breeze_up').id, null, SALES_DATA)).toEqual({
      ok: false,
      error: 'wrong_kind',
    });
  });

  it('위탁 실패 사유(wrong_kind): 번식 암말은 4~12세 암말 broodmare 만', () => {
    const draft = fresh();
    const old = addPlayerHorse(draft, { ...KIND_PATCH.breeding_stock, birthYear: YEAR - 13 });
    expect(consignToSale(draft, old, eventOfKind('breeding_stock').id, null, SALES_DATA)).toEqual({
      ok: false,
      error: 'wrong_kind',
    });
    const male = addPlayerHorse(draft, { ...KIND_PATCH.breeding_stock, sex: 'male' });
    expect(consignToSale(draft, male, eventOfKind('breeding_stock').id, null, SALES_DATA)).toEqual({
      ok: false,
      error: 'wrong_kind',
    });
  });

  it('위탁 검사와 카탈로그 판정(fitsKind)이 같다: 여러 나이·상태 조합에서 ok 가 fitsKind 와 일치', () => {
    const cases: Partial<Horse>[] = [];
    for (const age of [0, 1, 2, 3, 4, 12, 13]) {
      for (const status of ['foal', 'weanling', 'yearling', 'in_training', 'resting', 'broodmare'] as const) {
        for (const sex of ['male', 'female'] as const) {
          cases.push({ birthYear: YEAR - age, status, sex });
        }
      }
    }
    for (const kind of KINDS) {
      const event = eventOfKind(kind);
      const draft = fresh();
      for (const patch of cases) {
        const horseId = addPlayerHorse(draft, { ...KIND_PATCH[kind], ...patch });
        const horse = draft.horses[horseId];
        if (horse === undefined) throw new Error('말 없음');
        const result = consignToSale(draft, horseId, event.id, null, SALES_DATA);
        const expected = fitsKind(horse, kind, YEAR);
        if (expected) {
          expect(result.ok, `${kind} ${JSON.stringify(patch)}`).toBe(true);
        } else {
          expect(result, `${kind} ${JSON.stringify(patch)}`).toEqual({ ok: false, error: 'wrong_kind' });
        }
      }
    }
  });

  it('위탁 실패 사유: 발표 주 이번 주·이미 지남은 too_late, 하루 전 주는 가능', () => {
    const event = eventOfKind('yearling');
    const announce = announceWeekOf(event);
    const draft = fresh();
    const horseId = addPlayerHorse(draft, KIND_PATCH.yearling);

    const atAnnounce = { ...draft, date: { year: YEAR, week: announce } };
    expect(consignToSale(atAnnounce, horseId, event.id, null, SALES_DATA)).toEqual({ ok: false, error: 'too_late' });
    const after = { ...draft, date: { year: YEAR, week: announce + 1 } };
    expect(consignToSale(after, horseId, event.id, null, SALES_DATA)).toEqual({ ok: false, error: 'too_late' });
    const before = { ...draft, date: { year: YEAR, week: announce - 1 } };
    expect(consignToSale(before, horseId, event.id, null, SALES_DATA).ok).toBe(true);
  });

  it('위탁 실패 사유: 같은 말은 이미 위탁 중이거나 진행 중 카탈로그의 미판매 로트면 already_consigned', () => {
    const yearlings = SALES.events.filter((e) => e.kind === 'yearling');
    const first = yearlings[0];
    const second = yearlings[1];
    if (first === undefined || second === undefined) throw new Error('테스트 전제 위반: 1세 세일이 둘 필요');

    const draft = fresh();
    const horseId = addPlayerHorse(draft, KIND_PATCH.yearling);
    const once = consignToSale(draft, horseId, first.id, null, SALES_DATA);
    if (!once.ok) throw new Error('위탁 실패');
    expect(consignToSale(once.state, horseId, second.id, null, SALES_DATA)).toEqual({ ok: false, error: 'already_consigned' });
    expect(consignToSale(once.state, horseId, first.id, null, SALES_DATA)).toEqual({ ok: false, error: 'already_consigned' });

    // 발표되어 로트가 된 뒤: 주 1 에서 다른 1세 세일에 다시 내면 아직 판매 전 로트이므로 막힌다
    const published = runSalesWeek(once.state, announceWeekOf(first));
    expect(consignToSale(published, horseId, second.id, null, SALES_DATA)).toEqual({ ok: false, error: 'already_consigned' });
  });

  it('위탁 실패 사유: 유보가가 null 이 아닌 0 미만·정수 아닌 값이면 invalid_reserve', () => {
    const event = eventOfKind('yearling');
    const draft = fresh();
    const horseId = addPlayerHorse(draft, KIND_PATCH.yearling);
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(consignToSale(draft, horseId, event.id, bad, SALES_DATA)).toEqual({ ok: false, error: 'invalid_reserve' });
    }
    expect(consignToSale(draft, horseId, event.id, 0, SALES_DATA).ok).toBe(true);
    expect(consignToSale(draft, horseId, event.id, null, SALES_DATA).ok).toBe(true);
  });

  it('위탁 입력 state 는 바뀌지 않는다', () => {
    const draft = fresh();
    const horseId = addPlayerHorse(draft, KIND_PATCH.yearling);
    const before = structuredClone(draft);
    consignToSale(draft, horseId, eventOfKind('yearling').id, 100, SALES_DATA);
    expect(draft).toEqual(before);
  });

  it('withdrawConsignment: 발표 전 위탁을 취소하고, 없으면 not_consigned', () => {
    const event = eventOfKind('yearling');
    const draft = fresh();
    const horseId = addPlayerHorse(draft, KIND_PATCH.yearling);
    const consigned = consignToSale(draft, horseId, event.id, null, SALES_DATA);
    if (!consigned.ok) throw new Error('위탁 실패');
    const withdrawn = withdrawConsignment(consigned.state, horseId);
    expect(withdrawn.ok).toBe(true);
    if (withdrawn.ok) expect(withdrawn.state.sales.consignments).toEqual([]);
    expect(withdrawConsignment(consigned.state, 'h-none')).toEqual({ ok: false, error: 'not_consigned' });
    expect(withdrawConsignment(fresh(), horseId)).toEqual({ ok: false, error: 'not_consigned' });
  });
});

describe('세일 일정 화면용 목록 upcomingSales', () => {
  it('올해·다음 해 일정을 발표 주 순으로 최대 SALE_UPCOMING_LIMIT 개 돌려준다', () => {
    const list = upcomingSales(fresh(), SALES_DATA);
    expect(list).toHaveLength(SALE_UPCOMING_LIMIT);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (prev === undefined || cur === undefined) throw new Error('목록 항목 없음');
      const prevKey = prev.year * 100 + prev.announceWeek;
      const curKey = cur.year * 100 + cur.announceWeek;
      expect(curKey).toBeGreaterThanOrEqual(prevKey);
    }
    for (const item of list) {
      expect(item.announceWeek).toBe(announceWeekOf(item.event));
      expect(item.status).toBe('upcoming');
      expect([YEAR, YEAR + 1]).toContain(item.year);
    }
  });

  it('데이터가 없으면 빈 목록', () => {
    expect(upcomingSales(fresh(), {})).toEqual([]);
  });

  it('마감된 세일은 앞에서 건너뛰고, 첫 미마감 세일부터 목록을 이어 준다', () => {
    const sorted = SALES.events.slice().sort((a, b) => announceWeekOf(a) - announceWeekOf(b));
    const first = sorted[0];
    if (first === undefined) throw new Error('세일 없음');
    const draft = fresh();
    draft.sales.catalogues = [{ saleId: first.id, year: YEAR, status: 'closed', lots: [] }];
    const list = upcomingSales(draft, SALES_DATA);
    expect(list.find((u) => u.event.id === first.id)).toBeUndefined();
    expect(list[0]?.event.id).toBe(sorted[1]?.id);
    expect(list[0]?.status).toBe('upcoming');
  });

  it('카탈로그가 발표되면 상태가 catalogued 로 바뀐다', () => {
    const target = eventOfKind('yearling');
    const state = runSalesWeek(fresh(), announceWeekOf(target));
    const list = upcomingSales(state, SALES_DATA);
    expect(list.find((u) => u.event.id === target.id && u.year === YEAR)?.status).toBe('catalogued');
  });
});

describe('결정성과 저장 (수용 6)', () => {
  it('같은 시드 52주 2회 진행: state 가 같다', () => {
    const again = runWeeks(fresh(), createGameSystems(gameData(true)), WEEKS_PER_YEAR);
    expect(again.state).toEqual(salesRun().state);
  }, RUN_TIMEOUT);

  it('저장 왕복 후 sales 가 같다', () => {
    const original = salesRun().state;
    const result = deserializeGame(serializeGame(original, '2026-10-12T00:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.sales).toEqual(original.sales);
  }, RUN_TIMEOUT);

});

describe('엔진 순수성', () => {
  it('src/engine/sales 에는 Math.random·Date.now·DOM 접근이 없다', () => {
    const dir = fileURLToPath(new URL('../../src/engine/sales/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(`${dir}${file}`, 'utf8');
      expect(text, file).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\b/);
    }
  });
});
