/**
 * 플레이어 입찰 API와 실시간 경매 보기(M4-C5). 설계: docs/m4-sales-design.md 5장.
 * setMaxBid·clearMaxBid 는 structuredClone 한 새 상태를 돌려준다(입력 불변). lotView·liveAuctionSteps·saleCalendarView 는 읽기만 한다.
 * 난수는 쓰지 않는다. 입찰자 판정은 auction.ts 의 collectBidders 를 그대로 쓴다.
 * 경매 결과는 항상 resolveLot 을 그대로 쓴다. 실시간 단계의 마지막 가격·선두가 resolveLot 과 어긋나지 않게 하려는 것이다.
 */
import { playerPremiumRate } from './patron';
import { SALE_LIVE_MAX_STEPS } from '../config/sales';
import { canSpendDiscretionary } from '../economy/solvency';
import type { PlayerResult } from '../season/player';
import { addWeeks, compareDates } from '../time/calendar';
import type {
  GameDate,
  GameState,
  HorseId,
  Money,
  PlayerBid,
  SaleCatalogue,
  SaleEventDef,
  SaleLot,
  SaleLotResult,
  SaleVendor,
} from '../types';
import { bidIncrement, collectBidders, resolveLot } from './auction';
import { upcomingSales, type UpcomingSale } from './player';
import type { SalesStaticData } from './system';
import { estimateRange } from './valuation';

/** setMaxBid 실패 사유 */
export type BidError =
  | 'catalogue_not_found'
  | 'lot_not_found'
  | 'lot_closed'
  | 'own_lot'
  | 'invalid_amount'
  | 'insufficient_funds'
  | 'too_late';

/** 실시간 호가 한 단계. dropped = 이 단계에서 빠진 AI 입찰자 수. leader = 이 단계의 선두(최고 상한 쪽) */
export interface AuctionStep {
  price: Money;
  leader: 'player' | 'ai' | 'none';
  dropped: number;
}

/** 화면용 로트 정보. valuation·aiBids 는 담지 않는다(숨김 값) */
export interface LotView {
  lot: {
    lotNo: number;
    book: number;
    horseId: HorseId;
    horseName: string;
    sireId: HorseId | null;
    vendorKind: SaleVendor['kind'];
    /** 플레이어 위탁 로트의 유보가(없으면 null). 다른 판매자의 유보가는 숨긴다 */
    reserveKnown: Money | null;
  };
  /** 화면에 보여 줄 추정 범위(estimateRange) */
  estimate: { low: Money; high: Money };
  /** 로트의 판매 주(세일 시작 주 + 북 오프셋) */
  saleWeek: GameDate;
  myBid: Money | null;
  result: SaleLotResult | null;
}

/** 세일 일정 한 줄 + 내 입찰·위탁 수 + 발표 여부(화면 C10 용) */
export interface SaleCalendarEntry extends UpcomingSale {
  myBidCount: number;
  myConsignmentCount: number;
  announced: boolean;
}

type Leader = AuctionStep['leader'];

interface LiveBidder {
  max: Money;
  isPlayer: boolean;
}

function fail<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

function findEvent(data: SalesStaticData, saleId: string): SaleEventDef | undefined {
  return data.sales?.events.find((e) => e.id === saleId);
}

function findCatalogue(state: GameState, saleId: string, year: number): SaleCatalogue | undefined {
  return state.sales.catalogues.find((c) => c.saleId === saleId && c.year === year);
}

function findBid(bids: readonly PlayerBid[], saleId: string, year: number, lotNo: number): PlayerBid | undefined {
  return bids.find((b) => b.saleId === saleId && b.year === year && b.lotNo === lotNo);
}

/** 플레이어 입찰 정렬 순서: saleId, year, lotNo */
function compareBids(a: PlayerBid, b: PlayerBid): number {
  if (a.saleId !== b.saleId) return a.saleId < b.saleId ? -1 : 1;
  if (a.year !== b.year) return a.year - b.year;
  return a.lotNo - b.lotNo;
}

/** 로트의 판매 주 = 카탈로그 연도의 세일 시작 주 + 로트 북의 주 오프셋. 북 정의가 없으면 RangeError */
export function saleWeekOf(event: SaleEventDef, year: number, lot: SaleLot): GameDate {
  const book = event.books.find((b) => b.book === lot.book);
  if (book === undefined) {
    throw new RangeError(`세일 입찰: ${event.id} 에 북 ${lot.book} 이 없다`);
  }
  return addWeeks({ year, week: event.week }, book.weekOffset);
}

/** 플레이어 위탁 로트인가(판매자가 플레이어 마주) */
function isOwnConsignment(state: GameState, lot: SaleLot): boolean {
  return lot.vendor.kind === 'owner' && lot.vendor.id === state.playerOwnerId;
}

/**
 * 플레이어 입찰 상한을 저장한다(같은 로트는 덮어쓴다). 검사 순서:
 * 카탈로그(없거나 세일 정의 없음) → 로트 → 로트 마감(카탈로그 마감 또는 결과 있음) → 판매 주 지남 → 자기 위탁 →
 * 금액(정수, ≥ minimumBid) → 자금(상한 × (1 + 구매 수수료)).
 * playerBids 는 (saleId, year, lotNo) 순으로 정렬한다.
 */
export function setMaxBid(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
  maxBid: Money,
  data: SalesStaticData,
): PlayerResult<BidError> {
  const catalogue = findCatalogue(state, saleId, year);
  if (catalogue === undefined) return fail('catalogue_not_found');
  const event = findEvent(data, saleId);
  if (event === undefined) return fail('catalogue_not_found');
  const lot = catalogue.lots.find((l) => l.lotNo === lotNo);
  if (lot === undefined) return fail('lot_not_found');
  if (catalogue.status !== 'catalogued' || lot.result !== null) return fail('lot_closed');
  if (compareDates(saleWeekOf(event, year, lot), state.date) < 0) return fail('too_late');
  if (isOwnConsignment(state, lot)) return fail('own_lot');
  if (!Number.isInteger(maxBid) || maxBid < event.minimumBid) return fail('invalid_amount');
  if (!canSpendDiscretionary(state, Math.round(maxBid * (1 + playerPremiumRate(state, event))))) {
    return fail('insufficient_funds');
  }

  const next = structuredClone(state);
  const existing = findBid(next.sales.playerBids, saleId, year, lotNo);
  if (existing !== undefined) {
    existing.maxBid = maxBid;
  } else {
    next.sales.playerBids.push({ saleId, year, lotNo, maxBid });
  }
  next.sales.playerBids.sort(compareBids);
  return { ok: true, state: next, events: [] };
}

/** 플레이어 입찰 상한을 지운다. 해당 입찰이 없으면 bid_not_found */
export function clearMaxBid(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
): PlayerResult<'bid_not_found'> {
  if (findBid(state.sales.playerBids, saleId, year, lotNo) === undefined) return fail('bid_not_found');
  const next = structuredClone(state);
  next.sales.playerBids = next.sales.playerBids.filter(
    (b) => !(b.saleId === saleId && b.year === year && b.lotNo === lotNo),
  );
  return { ok: true, state: next, events: [] };
}

/**
 * 화면용 로트 정보(읽기 전용). 세일 정의·카탈로그·로트가 없으면 null.
 * valuation·aiBids 는 어떤 키로도 내보내지 않는다.
 */
export function lotView(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
  data: SalesStaticData,
): LotView | null {
  const event = findEvent(data, saleId);
  if (event === undefined) return null;
  const catalogue = findCatalogue(state, saleId, year);
  if (catalogue === undefined) return null;
  const lot = catalogue.lots.find((l) => l.lotNo === lotNo);
  if (lot === undefined) return null;
  const bid = findBid(state.sales.playerBids, saleId, year, lotNo);
  return {
    lot: {
      lotNo: lot.lotNo,
      book: lot.book,
      horseId: lot.horseId,
      horseName: lot.horseName,
      sireId: lot.sireId,
      vendorKind: lot.vendor.kind,
      reserveKnown: isOwnConsignment(state, lot) ? lot.reserve : null,
    },
    estimate: estimateRange(lot.valuation),
    saleWeek: saleWeekOf(event, year, lot),
    myBid: bid === undefined ? null : bid.maxBid,
    result: lot.result === null ? null : { ...lot.result },
  };
}

/**
 * 경매에 들어가는 입찰자(순서: AI 는 aiBids 순서, 플레이어는 마지막).
 * auction.ts 의 collectBidders 와 같은 규칙: AI 는 소유자 존재·플레이어 아님·판매자 아님·상한 ≥ minimumBid·자금 ≥ 상한 × (1 + 수수료).
 * 플레이어는 playerBidValid 가 참일 때만, 상한은 내림한 값.
 */
function liveBidders(state: GameState, lot: SaleLot, event: SaleEventDef, playerMax: Money | null): LiveBidder[] {
  return collectBidders(state, lot, event, playerMax);
}

/**
 * 실시간 호가 사다리(순수 함수, 상태 불변). 설계 규칙:
 * - 입찰자가 없으면 [{ price: lastBid(0), leader: 'none', dropped: 0 }] 한 단계.
 * - 가격은 minimumBid 부터 bidIncrement 로 올리며, 두 명 이상이 남은 가격(≤ 둘째 상한)마다 단계를 둔다(선두 = 최고 상한 쪽).
 * - 둘째 상한이 빠지는 자리에서 한 명만 남는다: 가격 = min(최고 상한, 둘째 상한 + bidIncrement(둘째 상한)), 선두 = 최고 상한 쪽.
 * - 유보가 때문에 가격이 올라가야 하면(낙찰) 유보가 단계를 하나 더 둔다. 바이백이면 마지막 단계 = lastBid, 선두 'none'.
 * - 마지막 단계의 가격·선두 = resolveLot 결과(낙찰가·구매자, 바이백 lastBid). 같은 가격이 연속되면 한 단계로 합친다.
 * - dropped = 그 단계 직전 가격 이상 이 가격 미만의 상한을 가진 AI 입찰자 수(첫 단계는 0).
 * 단계가 SALE_LIVE_MAX_STEPS 를 넘으면 앞쪽(낮은 가격)을 버리고 뒤쪽 단계만 남긴다(마지막 단계는 그대로).
 * 로트가 철회(withdrawn)됐으면 빈 목록.
 */
export function liveAuctionSteps(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
  playerMax: Money | null,
  data: SalesStaticData,
): AuctionStep[] {
  const event = findEvent(data, saleId);
  if (event === undefined) return [];
  const catalogue = findCatalogue(state, saleId, year);
  if (catalogue === undefined) return [];
  const lot = catalogue.lots.find((l) => l.lotNo === lotNo);
  if (lot === undefined) return [];

  const outcome = resolveLot(state, lot, event, playerMax);
  const result = outcome.result;
  if (result.kind === 'withdrawn') return [];
  const finalPrice: Money = result.kind === 'sold' ? result.price : result.lastBid;
  const finalLeader: Leader = result.kind === 'sold' ? (outcome.buyerIsPlayer ? 'player' : 'ai') : 'none';

  const bidders = liveBidders(state, lot, event, playerMax);
  if (bidders.length === 0) {
    return [{ price: finalPrice, leader: 'none', dropped: 0 }];
  }

  // resolveLot 과 같은 순위: 상한 높은 순, 동률은 입찰 순서가 앞선 쪽
  const ranked = bidders
    .map((bidder, order) => ({ bidder, order }))
    .sort((a, b) => b.bidder.max - a.bidder.max || a.order - b.order)
    .map((entry) => entry.bidder);
  const top = ranked[0];
  const second = ranked[1];
  if (top === undefined) return [];
  const topLeader: Leader = top.isPlayer ? 'player' : 'ai';

  const raw: { price: Money; leader: Leader }[] = [];
  const push = (price: Money, leader: Leader): void => {
    const last = raw[raw.length - 1];
    if (last !== undefined && last.price === price) {
      last.leader = leader;
      return;
    }
    raw.push({ price, leader });
  };

  // 두 명 이상이 남은 가격 단계(둘째 상한 이하)
  if (second !== undefined) {
    for (let price = event.minimumBid; price <= second.max; price += bidIncrement(price)) {
      push(price, topLeader);
    }
  }
  // 한 명만 남는 가격(유보 전 낙찰가 자리)
  const lonePrice =
    second === undefined ? event.minimumBid : Math.min(top.max, second.max + bidIncrement(second.max));
  push(lonePrice, topLeader);
  // 최종 가격(유보가 올림 또는 바이백 lastBid 포함)
  push(finalPrice, finalLeader);

  const aiMaxes = bidders.filter((b) => !b.isPlayer).map((b) => b.max);
  const steps: AuctionStep[] = raw.map((step, index) => {
    const prev = index === 0 ? undefined : raw[index - 1]?.price;
    const dropped =
      prev === undefined ? 0 : aiMaxes.filter((max) => max >= prev && max < step.price).length;
    return { price: step.price, leader: step.leader, dropped };
  });

  return steps.length > SALE_LIVE_MAX_STEPS ? steps.slice(steps.length - SALE_LIVE_MAX_STEPS) : steps;
}

/**
 * 화면용 세일 일정: upcomingSales 결과에 각 세일의 내 입찰 수·내 위탁 수·발표 여부를 붙인다.
 * 발표 여부 = 상태가 upcoming 이 아님(카탈로그가 있거나 마감됨).
 */
export function saleCalendarView(state: GameState, data: SalesStaticData): SaleCalendarEntry[] {
  return upcomingSales(state, data).map((sale) => ({
    ...sale,
    myBidCount: state.sales.playerBids.filter((b) => b.saleId === sale.event.id && b.year === sale.year).length,
    myConsignmentCount: state.sales.consignments.filter((c) => c.saleId === sale.event.id && c.year === sale.year)
      .length,
    announced: sale.status !== 'upcoming',
  }));
}
