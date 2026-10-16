/**
 * 세일 AI 입찰·경매 처리·낙찰 후 처리(M4-C4). 설계: docs/m4-sales-design.md 1·2·4장.
 * computeAiBids·resolveLot·bidIncrement·playerBidValid·summarizeCatalogue 는 순수 함수(난수는 인자 rng 만).
 * settleLot 만 draft 를 바꾼다(돈·소유 이전·세계에서 빼기·이벤트). 호출 순서(로트 번호 순)는 sales/system 이 정한다.
 */
import { playerPremiumRate } from './patron';
import { RIVAL_BID_BOOST } from '../config/rivals';
import {
  SALE_AI_BIDS_STORED,
  SALE_BID_LADDER,
  SALE_BID_SPREAD,
  SALE_BUDGET_SHARE,
  SALE_INTEREST_BOOK1_BONUS,
  SALE_INTEREST_MAX,
  SALE_INTEREST_MIN,
  SALE_INTEREST_WEIGHT,
  SALE_MIN_BUDGET_RATIO,
  SALE_OPEN_BUYER_COUNTRIES,
  SALE_PRESTIGE_PULL,
  SALE_PRESTIGE_PULL_BOOK1,
  SALE_PRESTIGE_PULL_OTHER,
  SALE_VENDOR_COMMISSION,
} from '../config/sales';
import type { PopulationCountry } from '../config/population';
import { recordMoney } from '../economy/ledger';
import { canSpendDiscretionary } from '../economy/solvency';
import { mareCapacity, playerBroodmareCount } from '../farm/purchase';
import { createRng } from '../rng';
import { buildMarket, pickTrainer, pickWeightedIndex } from '../world/population';
import { racingCountryOf } from '../world/populationSystem';
import type {
  AiBid,
  CountryCode,
  GameDate,
  GameEvent,
  GameState,
  Mare,
  Money,
  Owner,
  OwnerId,
  Rng,
  SaleCatalogue,
  SaleEventDef,
  SaleLot,
  SaleLotResult,
  SaleSummary,
  SaleVendor,
  TrainerId,
} from '../types';

/** 경매 결과 한 로트: 결과와 구매자가 플레이어인지 */
export interface LotOutcome {
  result: SaleLotResult;
  buyerIsPlayer: boolean;
}

/** 경매 입찰 한 줄(입찰 순서: AI 먼저, 플레이어 마지막 — 동률은 먼저 낸 쪽이 이긴다) */
export interface Bidder {
  ownerId: OwnerId;
  max: Money;
  isPlayer: boolean;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 마주의 입찰 예산 = 자금 × 규모별 비율 */
function budgetOf(owner: Owner): Money {
  return owner.funds * SALE_BUDGET_SHARE[owner.tier];
}

/** 판매자가 마주이면 그 id, 아니면 null */
function vendorOwnerId(vendor: SaleVendor): OwnerId | null {
  return vendor.kind === 'owner' ? vendor.id : null;
}

/** 호가 단위: 낙찰가 price 가 속한 구간의 단위(SALE_BID_LADDER) */
export function bidIncrement(price: Money): Money {
  const step = SALE_BID_LADDER.find((s) => price < s.below);
  if (step === undefined) {
    throw new RangeError(`세일 경매: 호가 표가 ${price} 를 덮지 않는다`);
  }
  return step.increment;
}

/**
 * 로트의 AI 입찰 상한(발표 때 한 번). 세일 나라(saleCountry)와 같은 나라 마주 또는 세일 나라 밖 major(SALE_OPEN_BUYER_COUNTRIES)가 후보.
 * 플레이어·판매자 마주는 뺀다. 예산이 평가값 × SALE_MIN_BUDGET_RATIO 미만인 마주도 뺀다.
 * 관심 수 = rng.int(MIN, MAX) (북 1 이면 + SALE_INTEREST_BOOK1_BONUS, 후보 수가 상한). 규모 가중 비복원 추첨.
 * 상한 = 평가값 × exp(normal(0, SALE_BID_SPREAD)) × (1 + (prestige − 0.5) × PULL × 북 보정), 예산으로 자르고 내림.
 * 상한 높은 순(동률 ownerId 오름차순) 상위 SALE_AI_BIDS_STORED 개를 돌려준다. 난수는 rng 만 쓴다.
 */
export function computeAiBids(
  state: GameState,
  lot: SaleLot,
  _event: SaleEventDef,
  rng: Rng,
  saleCountry: CountryCode,
): AiBid[] {
  const seller = vendorOwnerId(lot.vendor);
  const candidates: Owner[] = [];
  for (const owner of Object.values(state.owners).sort((a, b) => compareIds(a.id, b.id))) {
    if (owner.isPlayer || owner.id === state.playerOwnerId || owner.id === seller) continue;
    const sameCountry = owner.country === saleCountry;
    const openMajor = owner.tier === 'major' && SALE_OPEN_BUYER_COUNTRIES.includes(owner.country);
    if (!sameCountry && !openMajor) continue;
    if (budgetOf(owner) < lot.valuation * SALE_MIN_BUDGET_RATIO) continue;
    candidates.push(owner);
  }
  if (candidates.length === 0) return [];

  let interest = rng.int(SALE_INTEREST_MIN, SALE_INTEREST_MAX);
  if (lot.book === 1) interest += SALE_INTEREST_BOOK1_BONUS;
  interest = Math.min(interest, candidates.length);

  const pool = [...candidates];
  const chosen: Owner[] = [];
  for (let i = 0; i < interest; i++) {
    const index = pickWeightedIndex(
      rng,
      pool.map((o) => SALE_INTEREST_WEIGHT[o.tier]),
    );
    chosen.push(pool.splice(index, 1)[0] as Owner);
  }

  const pullScale = lot.book === 1 ? SALE_PRESTIGE_PULL_BOOK1 : SALE_PRESTIGE_PULL_OTHER;
  const bids: AiBid[] = chosen.map((owner) => {
    const noise = Math.exp(rng.normal(0, SALE_BID_SPREAD));
    const prestige = 1 + (owner.persona.prestige - 0.5) * SALE_PRESTIGE_PULL * pullScale;
    const raw = lot.valuation * noise * prestige;
    return { ownerId: owner.id, max: Math.floor(Math.min(raw, budgetOf(owner))) };
  });
  bids.sort((a, b) => b.max - a.max || compareIds(a.ownerId, b.ownerId));
  return bids.slice(0, SALE_AI_BIDS_STORED);
}

/**
 * 플레이어 입찰이 이 경매에 들어갈 수 있는가: 상한이 있고, 판매자가 플레이어가 아니고,
 * 상한(정수로 내림)이 minimumBid 이상이고, canSpendDiscretionary(상한 × (1 + 구매자 수수료)).
 * 번식마 세일(breeding_stock)은 번식 암말 수가 목장 수용 한도에 찰 때 입찰하지 못한다(M4-E0b).
 */
export function playerBidValid(state: GameState, event: SaleEventDef, lot: SaleLot, playerMax: Money | null): boolean {
  if (playerMax === null) return false;
  if (vendorOwnerId(lot.vendor) === state.playerOwnerId) return false;
  if (event.kind === 'breeding_stock' && playerBroodmareCount(state) >= mareCapacity(state)) return false;
  const max = Math.floor(playerMax);
  if (!(max >= event.minimumBid)) return false;
  return canSpendDiscretionary(state, max * (1 + playerPremiumRate(state, event)));
}

/** 말이 아직 판매할 수 있는가: 말이 있고, dead·retired 가 아니며, 소유자가 판매자와 같다(breeder 판매자면 무소속) */
function lotIsLive(state: GameState, lot: SaleLot): boolean {
  const horse = state.horses[lot.horseId];
  if (horse === undefined || horse.status === 'dead' || horse.status === 'retired') return false;
  if (lot.vendor.kind === 'owner') return horse.ownerId === lot.vendor.id;
  return horse.ownerId === null;
}

/** 유효 입찰자: AI 는 자금이 상한 × (1 + 구매자 수수료) 이상이고 상한이 minimumBid 이상인 입찰, 플레이어는 playerBidValid */
/** 유효 입찰자 목록(AI 저장 상한 중 자금·최저가 조건을 지키는 것 + 유효한 플레이어 상한). 실시간 보기(bidding.ts)도 이 함수를 쓴다 */
export function collectBidders(state: GameState, lot: SaleLot, event: SaleEventDef, playerMax: Money | null): Bidder[] {
  const rate = event.buyerPremiumRate;
  const seller = vendorOwnerId(lot.vendor);
  const playerBidded = playerBidValid(state, event, lot, playerMax);
  const bidders: Bidder[] = [];
  for (const bid of lot.aiBids) {
    const owner = state.owners[bid.ownerId];
    if (owner === undefined || owner.isPlayer || bid.ownerId === seller) continue;
    if (!(bid.max >= event.minimumBid)) continue;
    if (!(owner.funds >= bid.max * (1 + rate))) continue;
    // 저장 상한은 유지한다. 실제 플레이어 입찰이 있을 때만 기존 후보의 예산 안에서 가중한다.
    const rival = playerBidded ? state.rivals?.find((r) => r.active && r.ownerId === owner.id) : undefined;
    const max = rival === undefined || rival.intensity <= 0 ? bid.max
      : Math.max(bid.max, Math.floor(Math.min(bid.max * (1 + rival.intensity / 100 * RIVAL_BID_BOOST), budgetOf(owner))));
    if (!(max >= event.minimumBid) || !(owner.funds >= max * (1 + rate))) continue;
    bidders.push({ ownerId: owner.id, max, isPlayer: false });
  }
  if (playerBidded) {
    bidders.push({ ownerId: state.playerOwnerId, max: Math.floor(playerMax as Money), isPlayer: true });
  }
  return bidders;
}

/**
 * 로트 한 개의 경매(순수). 시작가 = minimumBid. 최고 상한 입찰자가 이기고(동률은 먼저 낸 쪽),
 * 낙찰가 = min(최고 상한, max(minimumBid, 두 번째 상한 + bidIncrement(두 번째 상한))), 두 번째가 없으면 minimumBid.
 * 유보가가 있고 낙찰가 < 유보가: 최고 상한 ≥ 유보가면 유보가로 판매, 아니면 bought_back(lastBid = 최고 상한).
 * 입찰자가 없으면 bought_back(lastBid 0). 말이 없거나 dead·retired 이거나 소유자가 판매자와 다르면 withdrawn.
 * playerMax 는 소수가 오면 내림한다.
 */
export function resolveLot(state: GameState, lot: SaleLot, event: SaleEventDef, playerMax: Money | null): LotOutcome {
  if (!lotIsLive(state, lot)) return { result: { kind: 'withdrawn' }, buyerIsPlayer: false };

  const bidders = collectBidders(state, lot, event, playerMax);
  if (bidders.length === 0) return { result: { kind: 'bought_back', lastBid: 0 }, buyerIsPlayer: false };

  // 높은 상한 순, 동률은 입찰 순서(배열 순서)가 앞선 쪽
  const ranked = bidders
    .map((bidder, order) => ({ bidder, order }))
    .sort((a, b) => b.bidder.max - a.bidder.max || a.order - b.order)
    .map((entry) => entry.bidder);
  const top = ranked[0] as Bidder;
  const second = ranked[1];

  const minimum = event.minimumBid;
  let price: Money =
    second === undefined ? minimum : Math.min(top.max, Math.max(minimum, second.max + bidIncrement(second.max)));

  if (lot.reserve !== null && price < lot.reserve) {
    if (top.max < lot.reserve) {
      return { result: { kind: 'bought_back', lastBid: top.max }, buyerIsPlayer: false };
    }
    price = lot.reserve;
  }
  return { result: { kind: 'sold', price, buyerId: top.ownerId }, buyerIsPlayer: top.isPlayer };
}

/** 정렬된 숫자 배열의 중앙값(짝수 개면 가운데 두 값의 평균을 내림). 비었으면 0 */
function medianOf(sorted: readonly Money[]): Money {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  const upper = sorted[mid] ?? 0;
  if (n % 2 === 1) return upper;
  const lower = sorted[mid - 1] ?? 0;
  return Math.floor((lower + upper) / 2);
}

/** 세일 한 번의 결과 요약(모든 북이 끝난 뒤). offered = 로트 수, sold = 낙찰 수, top = 최고 낙찰(동률은 로트 순 첫 번째) */
export function summarizeCatalogue(event: SaleEventDef, catalogue: SaleCatalogue): SaleSummary {
  const sold: { price: Money; lot: SaleLot }[] = [];
  for (const lot of catalogue.lots) {
    const result = lot.result;
    if (result !== null && result.kind === 'sold') sold.push({ price: result.price, lot });
  }
  const prices = sold.map((s) => s.price).sort((a, b) => a - b);
  let turnover = 0;
  for (const price of prices) turnover += price;

  let top: SaleSummary['top'] = null;
  for (const s of sold) {
    if (top === null || s.price > top.price) {
      top = { price: s.price, horseName: s.lot.horseName, sireId: s.lot.sireId };
    }
  }
  return {
    saleId: event.id,
    year: catalogue.year,
    kind: event.kind,
    offered: catalogue.lots.length,
    sold: sold.length,
    turnover,
    median: medianOf(prices),
    top,
  };
}

function ownerOf(draft: GameState, ownerId: OwnerId): Owner {
  const owner = draft.owners[ownerId];
  if (owner === undefined) throw new Error(`세일 경매: 마주가 없다: ${ownerId}`);
  return owner;
}

/** 말을 세계에서 뺀다: state.horses·state.mares 에서 지우고, 모든 마주·생산자 horseIds 에서 뺀다 */
export function removeFromWorld(draft: GameState, horseId: string): void {
  delete draft.horses[horseId];
  delete draft.mares[horseId];
  for (const owner of Object.values(draft.owners)) {
    if (owner.horseIds.includes(horseId)) owner.horseIds = owner.horseIds.filter((id) => id !== horseId);
  }
  for (const breeder of Object.values(draft.breeders)) {
    if (breeder.horseIds.includes(horseId)) breeder.horseIds = breeder.horseIds.filter((id) => id !== horseId);
  }
}

/** 판매자의 horseIds 에서 말을 뺀다(마주 판매자 또는 상업 생산자) */
function detachFromVendor(draft: GameState, lot: SaleLot): void {
  if (lot.vendor.kind === 'owner') {
    const seller = draft.owners[lot.vendor.id];
    if (seller !== undefined) seller.horseIds = seller.horseIds.filter((id) => id !== lot.horseId);
  } else {
    const breeder = draft.breeders[lot.vendor.id];
    if (breeder !== undefined) breeder.horseIds = breeder.horseIds.filter((id) => id !== lot.horseId);
  }
}

/** 플레이어 번식마 기록을 빈 값으로 만든다(없을 때만) */
function ensureMare(draft: GameState, horseId: string): void {
  if (draft.mares[horseId] !== undefined) return;
  const mare: Mare = {
    horseId,
    coveredBy: null,
    coveredWeek: null,
    pregnant: false,
    dueWeek: null,
    foals: [],
    blackTypeProduce: 0,
  };
  draft.mares[horseId] = mare;
}

/**
 * AI 구매자의 조교사를 고른다(구매자 경주 나라 기준). 수용 여유가 없으면 null.
 * 난수는 rng 만 쓴다(pickTrainer 는 rng 를 1회 이상 쓴다).
 */
function pickTrainerId(draft: GameState, country: PopulationCountry, rng: Rng): TrainerId | null {
  const market = buildMarket(draft);
  const open = market.trainers[country].some((t) => (market.load.get(t.id) ?? 0) < t.capacity);
  return open ? pickTrainer(rng, market, country).id : null;
}

/**
 * 낙찰 말의 소유 이전(종류별, 설계 2장). 플레이어가 판매자인 말은 어떤 경우에도 세계에서 빼지 않는다.
 * 그 밖의 수출(플레이어 아닌 구매자가 유럽 5개국·AE 밖, 또는 AI 번식마 구매)이면 세계에서 뺀다.
 * 나머지는 소유자·구매자 horseIds 를 바꾼다. 플레이어 구매 번식마는 기록(Mare)을 만든다.
 * AI 구매 브리즈업은 status 'yearling' 그대로 둔다(조교사 없음): 다음 연간 교체의 세일 출신 편입(population)이 현역으로 올린다.
 * 플레이어가 판 번식마를 AI 가 사면 말은 남기고 status 'retired', 조교사 없음, 번식 기록(Mare)만 지운다(번식 모의 없음).
 * AI 구매 조교마는 조교사 나라가 구매자 경주 나라와 다를 때만 조교사를 다시 고른다. 플레이어 구매 조교마는 조교사를 그대로 둔다.
 */
function transferLot(draft: GameState, event: SaleEventDef, lot: SaleLot, buyer: Owner, rng: Rng): void {
  const horse = draft.horses[lot.horseId];
  if (horse === undefined) throw new Error(`세일 경매: 낙찰된 말이 없다: ${lot.horseId}`);
  const fromPlayer = vendorOwnerId(lot.vendor) === draft.playerOwnerId;

  const exported =
    !fromPlayer && !buyer.isPlayer && (event.kind === 'breeding_stock' || !SALE_OPEN_BUYER_COUNTRIES.includes(buyer.country));
  if (exported) {
    removeFromWorld(draft, horse.id);
    return;
  }

  detachFromVendor(draft, lot);
  horse.ownerId = buyer.id;
  if (!buyer.horseIds.includes(horse.id)) {
    buyer.horseIds = [...buyer.horseIds, horse.id].sort(compareIds);
  }

  if (buyer.isPlayer) {
    if (event.kind === 'breeding_stock') ensureMare(draft, horse.id);
    return;
  }
  if (fromPlayer && event.kind === 'breeding_stock') {
    horse.status = 'retired';
    horse.trainerId = null;
    delete draft.mares[horse.id];
    return;
  }
  if (event.kind === 'horses_in_training') {
    const country = racingCountryOf(draft, horse);
    const current = horse.trainerId === null ? undefined : draft.trainers[horse.trainerId];
    if (current === undefined || current.country !== country) {
      horse.trainerId = pickTrainerId(draft, country, rng) ?? horse.trainerId;
    }
  }
}

/** 낙찰 돈: 구매자 가격·구매 수수료, 판매자(마주: 대금·판매 수수료 / 상업 생산자: 대금 − 판매 수수료, 장부 없음). 플레이어 구매는 연간 합계에 더한다 */
function settleMoney(
  draft: GameState,
  event: SaleEventDef,
  year: number,
  lot: SaleLot,
  buyer: Owner,
  price: Money,
  buyerIsPlayer: boolean,
  date: GameDate,
): void {
  const buyerFee = Math.round(price * (buyerIsPlayer ? playerPremiumRate(draft, event) : event.buyerPremiumRate));
  const vendorFee = Math.round(price * SALE_VENDOR_COMMISSION);
  recordMoney(draft, buyer.id, 'sale_purchase', -price, date, lot.horseId);
  recordMoney(draft, buyer.id, 'sale_commission', -buyerFee, date, lot.horseId);
  if (lot.vendor.kind === 'owner') {
    recordMoney(draft, lot.vendor.id, 'sale_proceeds', price, date, lot.horseId);
    recordMoney(draft, lot.vendor.id, 'sale_commission', -vendorFee, date, lot.horseId);
  } else {
    const breeder = draft.breeders[lot.vendor.id];
    if (breeder === undefined) throw new Error(`세일 경매: 상업 생산자가 없다: ${lot.vendor.id}`);
    breeder.funds += price - vendorFee;
  }
  if (buyerIsPlayer) {
    draft.sales.playerSpendByYear[year] = (draft.sales.playerSpendByYear[year] ?? 0) + price;
  }
}

/**
 * 로트 결과를 state 에 반영한다(draft 직접 수정). 순서: lot.result 기록 → sold 면 돈·소유 이전 →
 * bought_back 이고 판매자가 상업 생산자면 세계에서 뺀다.
 * 이벤트: 플레이어가 구매자·판매자·낙찰 못 한 입찰자(playerBidded 이고 withdrawn 이 아님)일 때 sale_lot_result 하나,
 * 플레이어 관련 마주 간 소유 이전이면 horse_sold(상업 생산자 판매는 출처 마주가 없어 내지 않는다).
 * playerBidded: 경매 전에 playerBidValid 였는가(호출자가 resolveLot 전에 구한다).
 */
export function settleLot(
  draft: GameState,
  event: SaleEventDef,
  year: number,
  lot: SaleLot,
  outcome: LotOutcome,
  date: GameDate,
  playerBidded: boolean,
): GameEvent[] {
  const result = outcome.result;
  lot.result = result;
  const events: GameEvent[] = [];
  const vendorIsPlayer = vendorOwnerId(lot.vendor) === draft.playerOwnerId;

  if (result.kind === 'sold') {
    const buyer = ownerOf(draft, result.buyerId);
    settleMoney(draft, event, year, lot, buyer, result.price, outcome.buyerIsPlayer, date);
    const seller = vendorOwnerId(lot.vendor);
    transferLot(draft, event, lot, buyer, createRng(`${draft.initialSeed}:settle:${event.id}:${year}:${lot.lotNo}`));
    if (seller !== null && (vendorIsPlayer || outcome.buyerIsPlayer)) {
      events.push({
        type: 'horse_sold',
        horseId: lot.horseId,
        fromOwnerId: seller,
        toOwnerId: buyer.id,
        price: result.price,
        date: { ...date },
      });
    }
  } else if (result.kind === 'bought_back' && lot.vendor.kind === 'breeder') {
    removeFromWorld(draft, lot.horseId);
  }

  let role: 'buyer' | 'vendor' | 'underbidder' | null = null;
  if (outcome.buyerIsPlayer) role = 'buyer';
  else if (vendorIsPlayer) role = 'vendor';
  else if (playerBidded && result.kind !== 'withdrawn') role = 'underbidder';
  if (role !== null) {
    events.push({
      type: 'sale_lot_result',
      saleId: event.id,
      year,
      lotNo: lot.lotNo,
      horseId: lot.horseId,
      role,
      result,
      date: { ...date },
    });
  }
  return events;
}
