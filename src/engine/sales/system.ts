/**
 * 세일 주간 시스템(M4-C2b·C4). 매주: (a) 발표 — 세일 발표 주가 된 세일의 그 해 카탈로그를 만들고 위탁을 로트로 옮긴 뒤
 * 로트마다 AI 입찰 상한을 정한다(C4), (c) 판매 — 이번 주가 북 주인 로트를 경매 처리하고, 마지막 북이면 마감·요약(C4),
 * (b) 정리 — 마감 카탈로그와 그 플레이어 입찰, 오래된 세일 요약(history)을 지운다.
 * 난수: ctx.rng 를 쓰지 않는다. 카탈로그마다 `${initialSeed}:catalogue:${saleId}:${year}` 스트림,
 * 로트 입찰은 `${initialSeed}:bids:${saleId}:${year}:${lotNo}` 스트림을 쓴다.
 * 설계: docs/m4-sales-design.md 1·4장.
 */
import { SALE_CATALOGUE_KEEP_WEEKS, SALE_CATALOGUE_LEAD_WEEKS, SALE_HISTORY_YEARS } from '../config/sales';
import { createRng } from '../rng';
import { addWeeks, weeksBetween } from '../time/calendar';
import type {
  CountryCode,
  GameDate,
  GameEvent,
  GameState,
  SaleBookDef,
  SaleCatalogue,
  SaleEventDef,
  SalesDataFile,
  WeekContext,
  WeeklySystem,
} from '../types';
import { computeAiBids, playerBidValid, resolveLot, settleLot, summarizeCatalogue } from './auction';
import { buildCatalogue, type CatalogueStaticData } from './catalogue';

/** 세일 정적 데이터. 없으면 세일 시스템은 아무것도 하지 않는다 */
export interface SalesStaticData {
  sales?: SalesDataFile;
}

/** 세일의 카탈로그 발표 주 = 세일 시작 주 − SALE_CATALOGUE_LEAD_WEEKS */
export function announceWeekOf(event: SaleEventDef): number {
  return event.week - SALE_CATALOGUE_LEAD_WEEKS;
}

/** 세일의 마지막 북 주(카탈로그 연도 기준). 세일 시작 주 + 가장 늦은 북 오프셋 */
export function lastBookDate(event: SaleEventDef, year: number): GameDate {
  if (event.books.length === 0) {
    throw new RangeError(`세일 시스템: ${event.id} 에 북이 없다`);
  }
  const maxOffset = Math.max(...event.books.map((b) => b.weekOffset));
  return addWeeks({ year, week: event.week }, maxOffset);
}

function byId(a: SaleEventDef, b: SaleEventDef): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 북의 판매 주 = 카탈로그 연도의 세일 시작 주 + 북 오프셋(연도 넘김 포함) */
function bookDateOf(event: SaleEventDef, year: number, book: SaleBookDef): GameDate {
  return addWeeks({ year, week: event.week }, book.weekOffset);
}

function sameWeek(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.week === b.week;
}

/** 세일이 열리는 나라(회사 country). 회사가 없으면 RangeError */
function saleCountryOf(sales: SalesDataFile, event: SaleEventDef): CountryCode {
  const company = sales.companies.find((c) => c.id === event.companyId);
  if (company === undefined) {
    throw new RangeError(`세일 시스템: 회사 ${event.companyId} 가 없다`);
  }
  return company.country;
}

/**
 * 이번 주가 북 주인 로트를 로트 번호 순으로 경매 처리한다(플레이어 상한은 playerBids). 마지막 북 주이면 마감하고 요약을 남긴다.
 * 로트마다 resolveLot → settleLot 순서라, 앞 로트에서 산 돈이 뒤 로트 입찰의 자금 판정에 반영된다.
 */
function runSaleWeek(draft: GameState, now: GameDate, eventById: ReadonlyMap<string, SaleEventDef>): GameEvent[] {
  const events: GameEvent[] = [];
  for (const catalogue of draft.sales.catalogues) {
    if (catalogue.status !== 'catalogued') continue;
    const event = eventById.get(catalogue.saleId);
    if (event === undefined) continue;

    const dueBooks = new Set(
      event.books.filter((b) => sameWeek(bookDateOf(event, catalogue.year, b), now)).map((b) => b.book),
    );
    if (dueBooks.size > 0) {
      for (const lot of catalogue.lots) {
        if (!dueBooks.has(lot.book) || lot.result !== null) continue;
        const bid = draft.sales.playerBids.find(
          (b) => b.saleId === catalogue.saleId && b.year === catalogue.year && b.lotNo === lot.lotNo,
        );
        const playerMax = bid === undefined ? null : bid.maxBid;
        const playerBidded = playerBidValid(draft, event, lot, playerMax);
        const outcome = resolveLot(draft, lot, event, playerMax);
        events.push(...settleLot(draft, event, catalogue.year, lot, outcome, now, playerBidded));
      }
    }

    if (sameWeek(lastBookDate(event, catalogue.year), now)) {
      catalogue.status = 'closed';
      draft.sales.history.push(summarizeCatalogue(event, catalogue));
    }
  }
  return events;
}

/** 마감 카탈로그가 보존 기간(마지막 북 주 + KEEP 주)을 넘겼는가 */
function isExpired(
  catalogue: SaleCatalogue,
  now: GameDate,
  eventById: ReadonlyMap<string, SaleEventDef>,
): boolean {
  if (catalogue.status !== 'closed') return false;
  const event = eventById.get(catalogue.saleId);
  if (event === undefined) return false;
  return weeksBetween(lastBookDate(event, catalogue.year), now) >= SALE_CATALOGUE_KEEP_WEEKS;
}

/** 세일 주간 시스템. data.sales 가 없으면 항상 빈 이벤트·변경 없음 */
export function createSalesSystem(data: SalesStaticData & Omit<CatalogueStaticData, 'sales'>): WeeklySystem {
  const sales = data.sales;
  if (sales !== undefined) {
    for (const event of sales.events) {
      if (announceWeekOf(event) < 1) {
        throw new RangeError(`세일 시스템: ${event.id} 의 발표 주가 1보다 작다`);
      }
    }
  }
  const eventById = new Map<string, SaleEventDef>((sales?.events ?? []).map((e) => [e.id, e] as const));
  const catalogueData: CatalogueStaticData | undefined =
    sales === undefined
      ? undefined
      : {
          sales,
          stallionRecords: data.stallionRecords,
          naming: data.naming,
          stallionNames: data.stallionNames,
        };

  return {
    id: 'sales',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      if (sales === undefined || catalogueData === undefined) return [];
      const now: GameDate = { year: ctx.date.year, week: ctx.date.week };
      const events: GameEvent[] = [];

      // (a) 발표: 이번 주가 발표 주인 세일(id 오름차순). 그 해 카탈로그가 이미 있으면 건너뛴다
      const due = sales.events.filter((e) => announceWeekOf(e) === now.week).sort(byId);
      for (const event of due) {
        const exists = draft.sales.catalogues.some((c) => c.saleId === event.id && c.year === now.year);
        if (exists) continue;
        const rng = createRng(`${draft.initialSeed}:catalogue:${event.id}:${now.year}`);
        // 위탁은 buildCatalogue 가 읽으므로 먼저 만들고, 그 뒤에 이 세일·해의 위탁을 지운다
        const catalogue = buildCatalogue(draft, event, now.year, catalogueData, rng);
        draft.sales.consignments = draft.sales.consignments.filter(
          (c) => !(c.saleId === event.id && c.year === now.year),
        );
        draft.sales.catalogues.push(catalogue);
        // AI 입찰 상한(C4): 발표 직후 로트마다 정한다. 판매 주에 자금이 모자라면 경매에서 빠진다
        const saleCountry = saleCountryOf(sales, event);
        for (const lot of catalogue.lots) {
          const bidRng = createRng(`${draft.initialSeed}:bids:${event.id}:${now.year}:${lot.lotNo}`);
          lot.aiBids = computeAiBids(draft, lot, event, bidRng, saleCountry);
        }
        events.push({
          type: 'sale_catalogue_published',
          saleId: event.id,
          year: now.year,
          lots: catalogue.lots.length,
          date: { ...now },
        });
      }

      // (c) 판매: 이번 주가 북 주인 로트 경매 처리, 마지막 북이면 마감·요약
      events.push(...runSaleWeek(draft, now, eventById));

      // (b) 정리: 마감 카탈로그와 그 플레이어 입찰, 오래된 세일 요약
      const dropped = draft.sales.catalogues.filter((c) => isExpired(c, now, eventById));
      if (dropped.length > 0) {
        draft.sales.catalogues = draft.sales.catalogues.filter((c) => !dropped.includes(c));
        draft.sales.playerBids = draft.sales.playerBids.filter(
          (b) => !dropped.some((c) => c.saleId === b.saleId && c.year === b.year),
        );
      }
      draft.sales.history = draft.sales.history.filter((h) => now.year - h.year <= SALE_HISTORY_YEARS);

      return events;
    },
  };
}
