/**
 * 목장 매물·구매·이전·번식 암말 수용 한도 (M4-E0b).
 * - 매물은 해마다 나라 5 × 규모 3 슬롯마다 독립 스트림(`${initialSeed}:farm-listings:${year}:${country}:${size}`)으로 만든다(공용 rng 미사용).
 * - 구매·이전은 자금을 recordMoney(장부 farm_purchase)로 바꾸고, 원본 state 는 바꾸지 않는다(structuredClone).
 * - 번식 암말 수는 목장 수용 한도(규모 기본 + 마방 증축 보너스)를 넘지 못한다.
 */
import { validateFarmName, type FarmNameError } from './naming';
import { BREEDER_NAME_MAX_ATTEMPTS } from '../config/breeders';
import {
  FARM_BASE_PRICE,
  FARM_COUNTRY_PRICE_MULT,
  FARM_LISTING_PRICE_ROUND,
  FARM_LISTING_PRICE_SPREAD,
  FARM_LISTINGS_PER_SLOT_MAX,
  FARM_LISTINGS_PER_SLOT_MIN,
  FARM_MARE_CAPACITY,
  FARM_RESALE_SHARE,
  HOME_COUNTRIES,
  STABLE_BLOCK_CAPACITY_BONUS,
  uniformFacilities,
} from '../config/farm';
import { getPeopleData } from '../data/staticData';
import { recordMoney } from '../economy/ledger';
import { canSpendDiscretionary } from '../economy/solvency';
import { createPeopleContext, makeStudName, type PeopleContext } from '../people/generate';
import { normalizeFullName } from '../people/names';
import { createRng } from '../rng';
import type {
  FacilityKind,
  FarmListing,
  FarmSize,
  FarmState,
  GameDate,
  GameEvent,
  GameState,
  HomeCountry,
  Money,
  Rng,
  WeekContext,
  WeeklySystem,
} from '../types';

/** 규모 표시 순서(매물 생성 순서) */
const FARM_SIZES: readonly FarmSize[] = ['small', 'medium', 'large'];

/** 매물 가격 반올림 단위(€, config) */
const LISTING_PRICE_ROUND = FARM_LISTING_PRICE_ROUND;

/** 구매 결과 오류: 매물 없음 / 순지출 자금 부족 / 새 수용 한도가 현재 번식 암말 수보다 작음 */
export type PurchaseFarmError = 'not_found' | 'insufficient_funds' | 'too_small' | FarmNameError;

export type PurchaseFarmResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: PurchaseFarmError };

/** 규모·시설 단계에서 번식 암말 수용 두수를 구한다(마방 증축 단계 보너스 포함) */
function capacityOf(size: FarmSize, facilities: Record<FacilityKind, number>): number {
  return FARM_MARE_CAPACITY[size] + (STABLE_BLOCK_CAPACITY_BONUS[facilities.stable_block] ?? 0);
}

/** 목장 없음이면 0, 아니면 규모 기본 두수 + 마방 증축 보너스 */
export function mareCapacity(state: GameState): number {
  const farm = state.farm;
  if (!farm.owned || farm.size === null) return 0;
  return capacityOf(farm.size, farm.facilities);
}

/** 플레이어가 소유한 번식 암말(status 'broodmare') 수 */
export function playerBroodmareCount(state: GameState): number {
  let count = 0;
  for (const horse of Object.values(state.horses)) {
    if (horse.ownerId === state.playerOwnerId && horse.status === 'broodmare') count += 1;
  }
  return count;
}

/** 매각 가치(이전 때 기존 목장이 받는 돈). 목장이 없으면 0 */
function farmResaleValue(farm: FarmState): Money {
  if (!farm.owned || farm.country === null || farm.size === null) return 0;
  return Math.round(FARM_BASE_PRICE[farm.size] * FARM_COUNTRY_PRICE_MULT[farm.country] * FARM_RESALE_SHARE);
}

/**
 * 매물 가격: 흔들림 전 값(raw)을 반올림 단위로 맞추되, 기준가 ± SPREAD 범위 안(반올림 단위 안쪽 경계)에 가두어 둔다.
 * 범위 경계가 반올림 단위의 배수가 아니므로 단순 반올림하면 범위를 조금 벗어날 수 있다.
 */
function listingPrice(base: number, raw: number): Money {
  const low = Math.ceil((base * (1 - FARM_LISTING_PRICE_SPREAD)) / LISTING_PRICE_ROUND) * LISTING_PRICE_ROUND;
  const high = Math.floor((base * (1 + FARM_LISTING_PRICE_SPREAD)) / LISTING_PRICE_ROUND) * LISTING_PRICE_ROUND;
  const rounded = Math.round(raw / LISTING_PRICE_ROUND) * LISTING_PRICE_ROUND;
  return Math.min(high, Math.max(low, rounded));
}

/**
 * 목장 이름 한 개. 기존 마주 studName·생산자 이름·현재 목장 이름·차단 목록과 겹치면 다시 뽑는다.
 * 이름은 생산목장 이름 생성(makeStudName)을 그대로 쓴다.
 */
function drawFarmName(rng: Rng, ctx: PeopleContext, country: HomeCountry, used: Set<string>): string {
  for (let attempt = 0; attempt < BREEDER_NAME_MAX_ATTEMPTS; attempt++) {
    const name = makeStudName(rng, ctx, country);
    const key = normalizeFullName(name);
    if (used.has(key) || ctx.blocked.has(key)) continue;
    used.add(key);
    return name;
  }
  throw new Error(`목장 매물: ${country} 목장 이름을 ${BREEDER_NAME_MAX_ATTEMPTS}회 안에 뽑지 못했다`);
}

/**
 * 올해 매물 목록(순수). 나라 5 × 규모 3 슬롯마다 MIN~MAX 개를 독립 스트림으로 만든다.
 * 가격 = 기준가 × 나라 배수 × (1 ± SPREAD 균등), €10,000 단위 반올림. id = `${year}-${country}-${size}-${n}`.
 * 이름은 기존 마주·생산자·현재 목장 이름과 겹치지 않는다. 같은 시드·연도·상태 → 같은 결과.
 */
export function generateFarmListings(state: GameState, year: number): FarmListing[] {
  const ctx = createPeopleContext(getPeopleData(), year);
  const used = new Set<string>();
  for (const owner of Object.values(state.owners)) {
    if (owner.studName !== null) used.add(normalizeFullName(owner.studName));
  }
  for (const breeder of Object.values(state.breeders)) {
    used.add(normalizeFullName(breeder.name));
  }
  if (state.farm.name !== null) used.add(normalizeFullName(state.farm.name));

  const listings: FarmListing[] = [];
  for (const country of HOME_COUNTRIES) {
    for (const size of FARM_SIZES) {
      const rng = createRng(`${state.initialSeed}:farm-listings:${year}:${country}:${size}`);
      const count = rng.int(FARM_LISTINGS_PER_SLOT_MIN, FARM_LISTINGS_PER_SLOT_MAX);
      for (let n = 1; n <= count; n++) {
        const name = drawFarmName(rng, ctx, country, used);
        const spread = rng.range(1 - FARM_LISTING_PRICE_SPREAD, 1 + FARM_LISTING_PRICE_SPREAD);
        const base = FARM_BASE_PRICE[size] * FARM_COUNTRY_PRICE_MULT[country];
        listings.push({
          id: `${year}-${country}-${size}-${n}`,
          country,
          size,
          name,
          price: listingPrice(base, base * spread),
        });
      }
    }
  }
  return listings;
}

/**
 * 매물 주간 시스템(id 'farm_listings'). 매년 1주(또는 목록이 비어 있을 때 — 새 게임 첫 주)에 state.farmListings 를 그해 매물로 바꾼다.
 * 공용 rng 를 쓰지 않고 이벤트를 내지 않는다.
 */
export function createFarmListingsSystem(): WeeklySystem {
  return {
    id: 'farm_listings',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      if (ctx.date.week === 1 || draft.farmListings.length === 0) {
        draft.farmListings = generateFarmListings(draft, ctx.date.year);
      }
      return [];
    },
  };
}

/**
 * 플레이어 목장 구매 또는 이전. 원본 state 는 바꾸지 않는다.
 * - 목장이 없으면(마주 시작): 매물 값을 낸다. 시설은 모두 1단계, acquiredYear = 올해.
 * - 목장이 있으면(이전): 기존 목장을 기준가 × 나라 배수 × FARM_RESALE_SHARE 에 팔고(장부 +), 매물 값을 낸다(장부 −).
 *   시설 단계는 그대로 옮긴다.
 * 검사 순서: 매물 없음 → 지정 이름 검증 → 새 수용 한도 < 현재 번식 암말 수(too_small) → 순지출(새 값 − 매각가)이 양수면 자금(canSpendDiscretionary).
 * 성공하면 farm 을 바꾸고, 플레이어 owner.studName 을 지정 이름(생략 시 매물 이름)으로 맞추고, 매물을 목록에서 뺀다.
 * settings.startType 은 바꾸지 않는다. eventLog 추가는 호출자가 맡는다.
 */
export function purchaseFarm(state: GameState, listingId: string, name?: string): PurchaseFarmResult {
  const listing = state.farmListings.find((entry) => entry.id === listingId);
  if (listing === undefined) return { ok: false, error: 'not_found' };

  if (name !== undefined) {
    const error = validateFarmName(state, name);
    if (error !== null) return { ok: false, error };
  }
  const farmName = name === undefined ? listing.name : name.trim();
  const current = state.farm;
  const resale = farmResaleValue(current);
  const facilities = current.owned ? { ...current.facilities } : uniformFacilities(1);
  if (capacityOf(listing.size, facilities) < playerBroodmareCount(state)) {
    return { ok: false, error: 'too_small' };
  }
  const netCost = listing.price - resale;
  if (netCost > 0 && !canSpendDiscretionary(state, netCost)) {
    return { ok: false, error: 'insufficient_funds' };
  }

  const draft = structuredClone(state);
  const date: GameDate = { year: draft.date.year, week: draft.date.week };
  const playerId = draft.playerOwnerId;
  const player = draft.owners[playerId];
  if (player === undefined) throw new Error(`purchaseFarm: 플레이어 마주가 없다: ${playerId}`);

  if (resale > 0) recordMoney(draft, playerId, 'farm_purchase', resale, date);
  recordMoney(draft, playerId, 'farm_purchase', -listing.price, date);

  draft.farm = {
    ...current,
    owned: true,
    country: listing.country,
    size: listing.size,
    name: farmName,
    facilities,
    acquiredYear: draft.date.year,
  };
  player.studName = farmName;
  draft.farmListings = draft.farmListings.filter((entry) => entry.id !== listingId);

  const events: GameEvent[] = [{
    type: 'farm_purchased',
    country: listing.country,
    size: listing.size,
    price: listing.price,
    date: { ...date },
  }];
  return { ok: true, state: draft, events };
}
