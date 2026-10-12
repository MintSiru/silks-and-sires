/**
 * 세일 주간 시스템(M4-C2b). 매주: (a) 발표 — 세일 발표 주가 된 세일의 그 해 카탈로그를 만들고 위탁을 로트로 옮긴다,
 * (b) 정리 — 마감 카탈로그와 그 플레이어 입찰, 오래된 세일 요약(history)을 지운다. 경매 처리는 C4 가 붙인다.
 * 난수: ctx.rng 를 쓰지 않는다. 카탈로그마다 `${initialSeed}:catalogue:${saleId}:${year}` 스트림을 쓴다.
 * 설계: docs/m4-sales-design.md 1장.
 */
import { SALE_CATALOGUE_KEEP_WEEKS, SALE_CATALOGUE_LEAD_WEEKS, SALE_HISTORY_YEARS } from '../config/sales';
import { createRng } from '../rng';
import { addWeeks, weeksBetween } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  SaleCatalogue,
  SaleEventDef,
  SalesDataFile,
  WeekContext,
  WeeklySystem,
} from '../types';
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
        events.push({
          type: 'sale_catalogue_published',
          saleId: event.id,
          year: now.year,
          lots: catalogue.lots.length,
          date: { ...now },
        });
      }

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
