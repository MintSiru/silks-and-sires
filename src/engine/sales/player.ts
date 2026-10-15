/**
 * 세일 플레이어 API(M4-C2b): 위탁 출품·위탁 취소·화면용 세일 일정. 모두 순수 함수(입력 state 불변, structuredClone).
 * 실패는 예외가 아니라 { ok: false, error } 로 돌려준다. 설계: docs/m4-sales-design.md 5장.
 */
import { SALE_UPCOMING_LIMIT } from '../config/sales';
import type { PlayerResult } from '../season/player';
import type { GameState, Money, SaleEventDef } from '../types';
import { catalogueVisibleWeek, isCatalogueVisible, patronView } from './patron';
import { fitsKind } from './catalogue';
import { announceWeekOf, type SalesStaticData } from './system';

export type ConsignError =
  | 'sale_not_found'
  | 'not_found'
  | 'not_player_horse'
  | 'wrong_kind'
  | 'too_late'
  | 'already_consigned'
  | 'invalid_reserve';

/** 화면용 세일 일정 한 줄 */
export interface UpcomingSale {
  event: SaleEventDef;
  year: number;
  announceWeek: number;
  status: 'upcoming' | 'catalogued' | 'closed';
}

function fail<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/** 이 말이 위탁 중이거나 진행 중 카탈로그의 미판매 로트인가 */
function isConsigned(state: GameState, horseId: string): boolean {
  if (state.sales.consignments.some((c) => c.horseId === horseId)) return true;
  return state.sales.catalogues.some(
    (cat) => cat.status === 'catalogued' && cat.lots.some((l) => l.horseId === horseId && l.result === null),
  );
}

/**
 * 올해 세일에 말을 위탁한다. 대상 해 = 올해(state.date.year).
 * 발표 주가 이번 주 이전·이번 주면 too_late(다음 해 위탁은 받지 않는다).
 * reserve: null(유보 없음) 또는 0 이상의 정수. 아니면 invalid_reserve.
 * 검사 순서: 세일 → 유보가 → 말 존재 → 플레이어 말 → 발표 전 → 종류(fitsKind) → 중복.
 */
export function consignToSale(
  state: GameState,
  horseId: string,
  saleId: string,
  reserve: Money | null,
  data: SalesStaticData,
): PlayerResult<ConsignError> {
  const event = data.sales?.events.find((e) => e.id === saleId);
  if (event === undefined) return fail('sale_not_found');
  if (reserve !== null && !(Number.isInteger(reserve) && reserve >= 0)) return fail('invalid_reserve');
  const horse = state.horses[horseId];
  if (horse === undefined) return fail('not_found');
  if (horse.ownerId !== state.playerOwnerId) return fail('not_player_horse');
  const year = state.date.year;
  if (announceWeekOf(event) <= state.date.week) return fail('too_late');
  // 종류 판정은 카탈로그와 같은 fitsKind 를 쓴다(위탁 검사와 발표 때 로트 판정이 반드시 같아야 한다)
  if (!fitsKind(horse, event.kind, year)) return fail('wrong_kind');
  if (isConsigned(state, horseId)) return fail('already_consigned');

  const next = structuredClone(state);
  next.sales.consignments.push({ saleId, year, horseId, reserve });
  return { ok: true, state: next, events: [] };
}

/** 발표 전 위탁을 취소한다. 발표되면 위탁은 로트가 되어 사라지므로 남아 있는 위탁만 취소할 수 있다. */
export function withdrawConsignment(state: GameState, horseId: string): PlayerResult<'not_consigned'> {
  const index = state.sales.consignments.findIndex((c) => c.horseId === horseId);
  if (index < 0) return fail('not_consigned');
  const next = structuredClone(state);
  next.sales.consignments.splice(index, 1);
  return { ok: true, state: next, events: [] };
}

/**
 * 화면용 세일 일정: 올해·다음 해의 세일을 (연도, 발표 주, id) 순으로 정렬한다.
 * 이미 마감된 세일은 앞에서 건너뛰고, 첫 미마감 세일부터 최대 SALE_UPCOMING_LIMIT 개를 돌려준다.
 * status: 카탈로그 없음 → upcoming, 진행 중 카탈로그 → catalogued, 마감 → closed.
 * data.sales 가 없으면 빈 배열.
 */
export function upcomingSales(state: GameState, data: SalesStaticData): UpcomingSale[] {
  const sales = data.sales;
  if (sales === undefined) return [];
  const thisYear = state.date.year;
  const all: UpcomingSale[] = [];
  for (const year of [thisYear, thisYear + 1]) {
    for (const event of sales.events) {
      const catalogue = state.sales.catalogues.find((c) => c.saleId === event.id && c.year === year);
      const announceWeek = catalogueVisibleWeek(event, patronView(state).tier);
      // 올해 발표 주가 지났는데 카탈로그가 없으면 마감 뒤 정리된 것이다(이번 주 발표분은 진행 때 만들어진다)
      const pruned = catalogue === undefined && year === thisYear && announceWeekOf(event) < state.date.week;
      const status: UpcomingSale['status'] =
        catalogue === undefined
          ? pruned
            ? 'closed'
            : 'upcoming'
          : catalogue.status === 'closed'
            ? 'closed'
            : isCatalogueVisible(state, event, year) ? 'catalogued' : 'upcoming';
      all.push({ event, year, announceWeek, status });
    }
  }
  all.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.announceWeek !== b.announceWeek) return a.announceWeek - b.announceWeek;
    return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
  });
  const first = all.findIndex((u) => u.status !== 'closed');
  const from = first < 0 ? all.length : first;
  return all.slice(from, from + SALE_UPCOMING_LIMIT);
}
