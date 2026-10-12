import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { SALE_UPCOMING_LIMIT } from '../../src/engine/config/sales';
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
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { consignToSale } from '../../src/engine/sales/player';
import { announceWeekOf, createSalesSystem, type SalesStaticData } from '../../src/engine/sales/system';
import type { GameState, SaleEventDef, SaleKind } from '../../src/engine/types';
import {
  catalogueRows,
  consignableRows,
  lotDetailView,
  liveAuctionView,
  saleCalendarRows,
} from '../../src/ui/sales/salesView';

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;

const SALES = getSalesData();
const DATA: SalesStaticData = { sales: SALES };
/** 세일 시스템(카탈로그 생성)용 데이터 */
const SYSTEM_DATA: SalesStaticData & Omit<CatalogueStaticData, 'sales'> = {
  sales: SALES,
  stallionRecords: getStallionRecords(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

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

const SALE_STATUS_SET = new Set(['발표 전', '카탈로그 발표', '마감']);
const SALE_KIND_NAMES = new Set(['이유마 세일', '1세마 세일', '2세 브리즈업 세일', '현역마 세일', '번식마 세일']);

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

/** 세일 처리를 주 date 에 한 번 돌린 복제본 */
function runSalesAt(state: GameState, date: { year: number; week: number }): GameState {
  const draft = structuredClone(state);
  createSalesSystem(SYSTEM_DATA).run(draft, { date, rng: createRng(1) });
  return draft;
}

/** 세일 발표 주에 카탈로그를 만든 상태(현재 주도 발표 주) */
function announced(event: SaleEventDef): GameState {
  const week = announceWeekOf(event);
  const draft = runSalesAt(fresh(), { year: YEAR, week });
  draft.date = { year: YEAR, week };
  return draft;
}

/** 발표 주가 가장 이른 세일 한 개(종류 지정 가능) */
function earliestOf(kind: SaleKind): SaleEventDef {
  const sorted = SALES.events
    .filter((e) => e.kind === kind)
    .sort((a, b) => announceWeekOf(a) - announceWeekOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const event = sorted[0];
  if (event === undefined) throw new Error(`세일 없음: ${kind}`);
  return event;
}

function playerHorseIds(state: GameState): string[] {
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) throw new Error('테스트 전제 위반: 플레이어 마주 없음');
  return owner.horseIds;
}

describe('세일 캘린더 행', () => {
  it('시드 상태에서 행이 있고 SALE_UPCOMING_LIMIT 를 넘지 않는다', () => {
    const rows = saleCalendarRows(BASE, DATA);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(SALE_UPCOMING_LIMIT);
    for (const row of rows) {
      expect(row.monthKo).toMatch(/^\d+월$/);
      expect(SALE_KIND_NAMES.has(row.kindKo)).toBe(true);
      expect(SALE_STATUS_SET.has(row.statusKo)).toBe(true);
      expect(row.companyName.length).toBeGreaterThan(0);
    }
  });

  it('발표 전 상태에서는 카탈로그 로트 수가 null 이다', () => {
    const rows = saleCalendarRows(BASE, DATA);
    expect(rows.every((r) => r.lots === null)).toBe(true);
    expect(rows.every((r) => r.statusKo === '발표 전')).toBe(true);
  });
});

describe('카탈로그 로트 목록', () => {
  it('1세마 세일 발표 후 로트 수가 카탈로그 로트 수와 같다', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const catalogue = state.sales.catalogues.find((c) => c.saleId === event.id && c.year === YEAR);
    expect(catalogue).toBeDefined();
    expect(catalogue?.lots.length ?? 0).toBeGreaterThan(0);
    const rows = catalogueRows(state, event.id, YEAR, DATA);
    expect(rows.length).toBe(catalogue?.lots.length);

    const calendar = saleCalendarRows(state, DATA).find((r) => r.saleId === event.id);
    expect(calendar?.lots).toBe(catalogue?.lots.length);
    expect(calendar?.statusKo).toBe('카탈로그 발표');
  });

  it('부 이름 부분 일치 필터는 대소문자를 무시하고 그 부 로트만 남긴다', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const rows = catalogueRows(state, event.id, YEAR, DATA);
    const target = rows.find((r) => r.sireName !== '—');
    expect(target).toBeDefined();
    if (target === undefined) return;
    const query = target.sireName.slice(0, 3).toUpperCase();
    const filtered = catalogueRows(state, event.id, YEAR, DATA, { sireQuery: query });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.sireName.toLowerCase().includes(query.toLowerCase()))).toBe(true);
    expect(filtered.some((r) => r.lotNo === target.lotNo)).toBe(true);
  });

  it('북 필터는 그 북의 로트만 남긴다', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const rows = catalogueRows(state, event.id, YEAR, DATA);
    const book = rows[0]?.book;
    expect(book).toBeDefined();
    if (book === undefined) return;
    const filtered = catalogueRows(state, event.id, YEAR, DATA, { book });
    expect(filtered.every((r) => r.book === book)).toBe(true);
    expect(filtered.length).toBe(rows.filter((r) => r.book === book).length);
  });

  it('행 형식: 성별·나이·추정 범위·판매자 문구', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const rows = catalogueRows(state, event.id, YEAR, DATA);
    const first = rows[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.sexAgeKo).toMatch(/^(암|수|거세) 1세$/);
    expect(first.estimateKo).toMatch(/^€[\d,]+ ~ €[\d,]+$/);
    expect(first.vendorKo).toMatch(/^(상업 생산자 |마주 |내 위탁)/);
    expect(first.resultKo).toBeNull();
    expect(first.myBid).toBeNull();
  });

  it('존재하지 않는 카탈로그는 빈 목록', () => {
    expect(catalogueRows(BASE, 'no-such-sale', YEAR, DATA)).toEqual([]);
  });
});

describe('숨김 값 미노출', () => {
  it("catalogueRows·lotDetailView·liveAuctionView 결과 JSON 에 'valuation'·'aiBids' 가 없다", () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const rows = catalogueRows(state, event.id, YEAR, DATA);
    const first = rows[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const detail = lotDetailView(state, event.id, YEAR, first.lotNo, DATA);
    const live = liveAuctionView(state, event.id, YEAR, first.lotNo, null, DATA);
    for (const json of [JSON.stringify(rows), JSON.stringify(detail), JSON.stringify(live)]) {
      expect(json).not.toContain('valuation');
      expect(json).not.toContain('aiBids');
    }
  });
});

describe('로트 상세', () => {
  it('가상 모 이름 자리는 — 이고, 판매 날짜와 추정 범위가 있다', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const first = catalogueRows(state, event.id, YEAR, DATA)[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const detail = lotDetailView(state, event.id, YEAR, first.lotNo, DATA);
    expect(detail).not.toBeNull();
    expect(detail?.damName).toBe('—');
    expect(detail?.saleDateKo).toMatch(/^\d{4}년 \d+월 \d+주$/);
    expect(detail?.estimateKo).toMatch(/^€[\d,]+ ~ €[\d,]+$/);
    expect(detail?.reserveKo).toBeNull();
  });

  it('없는 로트는 null', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    expect(lotDetailView(state, event.id, YEAR, 999_999, DATA)).toBeNull();
  });
});

describe('실시간 경매 보기', () => {
  it('단계마다 가격·선두·이탈 문구가 있고 최종 결과 문구가 있다', () => {
    const event = earliestOf('yearling');
    const state = announced(event);
    const lots = catalogueRows(state, event.id, YEAR, DATA);
    expect(lots.length).toBeGreaterThan(0);
    for (const lot of lots.slice(0, 5)) {
      const view = liveAuctionView(state, event.id, YEAR, lot.lotNo, null, DATA);
      expect(view.resultKo.length).toBeGreaterThan(0);
      for (const step of view.steps) {
        expect(step.priceKo).toMatch(/^€[\d,]+$/);
        expect(['내 입찰', '다른 구매자', '—']).toContain(step.leaderKo);
        expect(step.droppedKo === '—' || /^\d+명 이탈$/.test(step.droppedKo)).toBe(true);
      }
    }
  });
});

describe('위탁 가능 말', () => {
  it('1세 수말을 1세마 세일에 위탁하면 그 세일 이름이 붙는다', () => {
    const state = fresh();
    state.date = { year: YEAR, week: 1 };
    const horseId = playerHorseIds(state)[0];
    if (horseId === undefined) throw new Error('테스트 전제 위반: 플레이어 말 없음');
    const horse = state.horses[horseId];
    if (horse === undefined) throw new Error('테스트 전제 위반: 말 없음');
    horse.birthYear = YEAR - 1;
    horse.status = 'yearling';
    horse.sex = 'male';
    horse.gelded = false;

    const before = consignableRows(state, DATA).find((r) => r.horseId === horseId);
    expect(before).toBeDefined();
    expect(before?.consignedSaleName).toBeNull();
    expect(before?.options.length).toBeGreaterThan(0);
    expect(before?.options.every((o) => o.kindKo === '1세마 세일')).toBe(true);
    expect(before?.options.every((o) => o.announceWeek > 1)).toBe(true);

    const option = before?.options[0];
    if (option === undefined) return;
    const event = SALES.events.find((e) => e.id === option.saleId);
    if (event === undefined) throw new Error('테스트 전제 위반: 세일 없음');
    const result = consignToSale(state, horseId, event.id, null, DATA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = consignableRows(result.state, DATA).find((r) => r.horseId === horseId);
    expect(after?.consignedSaleName).toBe(event.name);
  });
});
