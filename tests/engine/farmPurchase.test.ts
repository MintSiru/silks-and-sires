import { describe, expect, it } from 'vitest';
import { FARM_BASE_PRICE, FARM_COUNTRY_PRICE_MULT, FARM_RESALE_SHARE, HOME_COUNTRIES } from '../../src/engine/config/farm';
import {
  createFarmListingsSystem,
  generateFarmListings,
  mareCapacity,
  purchaseFarm,
} from '../../src/engine/farm/purchase';
import * as data from '../../src/engine/data/staticData';
import { normalizeFullName } from '../../src/engine/people/names';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { submitYearEnd, yearEndCandidates, retainerRenewalsDue } from '../../src/engine/stud/yearEnd';
import type { FarmListing, GameState, Horse, StartType, YearEndSubmission } from '../../src/engine/types';

const SEED = 20261016;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SIZES = ['small', 'medium', 'large'] as const;
const BOOT_DATA: BootstrapData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};

/** 난이도 normal 로 만든 새 게임(시작 유형 지정). owner 는 목장 없음, owner_breeder 는 medium GB 목장 */
function newState(startType: StartType): GameState {
  return bootstrapGame({ seed: SEED, playerName: '테스트 마주', silks: SILKS, difficulty: 'normal', startType }, BOOT_DATA);
}

function playerOwner(state: GameState) {
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) throw new Error('플레이어 마주 없음');
  return owner;
}

function listingOf(listings: readonly FarmListing[], country: FarmListing['country'], size: FarmListing['size']): FarmListing {
  const found = listings.find((l) => l.country === country && l.size === size);
  if (found === undefined) throw new Error(`매물 없음: ${country} ${size}`);
  return found;
}

/** 플레이어 말 전부를 은퇴로 돌려 연말 정산 후보에서 뺀다 */
function clearPlayerHorses(state: GameState): void {
  for (const horse of Object.values(state.horses)) {
    if (horse.ownerId === state.playerOwnerId) horse.status = 'retired';
  }
}

/** 플레이어 소유 말을 하나 더 만든다(템플릿 복제) */
function addPlayerHorse(state: GameState, id: string, patch: Partial<Horse>): void {
  const template = Object.values(state.horses)[0];
  if (template === undefined) throw new Error('말 템플릿 없음');
  state.horses[id] = { ...structuredClone(template), id, ownerId: state.playerOwnerId, ...patch };
  playerOwner(state).horseIds.push(id);
}

describe('목장 매물 생성', () => {
  it('같은 시드·연도면 같은 매물, 나라 5 × 규모 3 슬롯마다 1~2개', () => {
    const state = newState('owner_breeder');
    const first = generateFarmListings(state, 2027);
    expect(generateFarmListings(state, 2027)).toEqual(first);

    for (const country of HOME_COUNTRIES) {
      for (const size of SIZES) {
        const count = first.filter((l) => l.country === country && l.size === size).length;
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(2);
      }
    }
    expect(first.length).toBeGreaterThanOrEqual(HOME_COUNTRIES.length * SIZES.length);
  }, 60_000);

  it('가격은 기준가 × 나라 배수 ± 10% 안, €10,000 단위이고 id 는 연도·나라·규모·번호 형식', () => {
    const state = newState('owner_breeder');
    const listings = generateFarmListings(state, 2027);
    for (const listing of listings) {
      const base = FARM_BASE_PRICE[listing.size] * FARM_COUNTRY_PRICE_MULT[listing.country];
      expect(listing.price).toBeGreaterThanOrEqual(base * 0.9);
      expect(listing.price).toBeLessThanOrEqual(base * 1.1);
      expect(listing.price % 10_000).toBe(0);
      expect(listing.id).toMatch(new RegExp(`^2027-${listing.country}-${listing.size}-\\d+$`));
    }
  }, 60_000);

  it('목장 이름은 가상 이름이며 기존 마주·생산자 목장명 및 차단 목록과 겹치지 않고 서로도 겹치지 않는다', () => {
    const state = newState('owner_breeder');
    const listings = generateFarmListings(state, 2027);
    const taken = new Set<string>();
    for (const owner of Object.values(state.owners)) {
      if (owner.studName !== null) taken.add(normalizeFullName(owner.studName));
    }
    for (const breeder of Object.values(state.breeders)) taken.add(normalizeFullName(breeder.name));
    for (const blocked of data.getPeopleData().blockedNames) taken.add(normalizeFullName(blocked));

    const names = new Set<string>();
    for (const listing of listings) {
      const key = normalizeFullName(listing.name);
      expect(taken.has(key)).toBe(false);
      expect(names.has(key)).toBe(false);
      names.add(key);
    }
  }, 60_000);

  it('주간 시스템은 1주(또는 목록이 비었을 때)에만 올해 매물로 바꾸고 이벤트를 내지 않는다', () => {
    const state = newState('owner_breeder');
    const system = createFarmListingsSystem();
    expect(system.id).toBe('farm_listings');

    const draft = structuredClone(state);
    draft.farmListings = [];
    const events = system.run(draft, { date: { year: 2027, week: 1 }, rng: createRng(1) });
    expect(events).toEqual([]);
    expect(draft.farmListings).toEqual(generateFarmListings(draft, 2027));

    const later = structuredClone(draft);
    later.farmListings = later.farmListings.slice(1);
    const kept = structuredClone(later.farmListings);
    system.run(later, { date: { year: 2027, week: 2 }, rng: createRng(1) });
    expect(later.farmListings).toEqual(kept);

    // 새 게임 첫 주처럼 목록이 비어 있으면 1주가 아니어도 채운다(통합 결정).
    const empty = structuredClone(draft);
    empty.farmListings = [];
    system.run(empty, { date: { year: 2027, week: 2 }, rng: createRng(1) });
    expect(empty.farmListings).toEqual(generateFarmListings(empty, 2027));
  }, 60_000);
});

describe('목장 구매', () => {
  it('마주 시작(목장 없음)에서 소형 매물을 사면 오너브리더가 되고 자금·장부·매물이 바뀐다', () => {
    const state = newState('owner');
    expect(state.farm.owned).toBe(false);
    expect(mareCapacity(state)).toBe(0);
    state.farmListings = generateFarmListings(state, state.date.year);
    const listing = listingOf(state.farmListings, 'GB', 'small');
    const before = structuredClone(state);

    const result = purchaseFarm(state, listing.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state).toEqual(before);

    const next = result.state;
    expect(next.farm.owned).toBe(true);
    expect(next.farm.size).toBe('small');
    expect(next.farm.country).toBe(listing.country);
    expect(next.farm.name).toBe(listing.name);
    expect(next.farm.acquiredYear).toBe(state.date.year);
    expect(Object.values(next.farm.facilities).every((level) => level === 1)).toBe(true);
    expect(playerOwner(next).studName).toBe(listing.name);
    expect(next.settings.startType).toBe('owner');
    expect(playerOwner(next).funds).toBe(playerOwner(state).funds - listing.price);
    expect(next.farmListings.some((l) => l.id === listing.id)).toBe(false);
    expect(next.economy.playerLedger.at(-1)).toMatchObject({ category: 'farm_purchase', amount: -listing.price });
    expect(result.events).toEqual([{ type: 'farm_purchased', country: listing.country, size: 'small', price: listing.price, date: state.date }]);
  }, 60_000);

  it('자금이 모자라면 insufficient_funds, 없는 매물이면 not_found', () => {
    const state = newState('owner');
    state.farmListings = generateFarmListings(state, state.date.year);
    const listing = listingOf(state.farmListings, 'GB', 'small');
    playerOwner(state).funds = listing.price - 1;
    expect(purchaseFarm(state, listing.id)).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(purchaseFarm(state, 'no-such-listing')).toEqual({ ok: false, error: 'not_found' });
  }, 60_000);
});

describe('목장 이전', () => {
  it('중형(GB) → 대형(IE): 순지출 = 새 값 − 기존 매각가, 시설 단계 유지', () => {
    const state = newState('owner_breeder');
    expect(state.farm).toMatchObject({ owned: true, size: 'medium', country: 'GB' });
    state.farm.facilities = { ...state.farm.facilities, stable_block: 2, pool: 3 };
    playerOwner(state).funds = 10_000_000;
    state.farmListings = generateFarmListings(state, state.date.year);
    const listing = listingOf(state.farmListings, 'IE', 'large');
    const fundsBefore = playerOwner(state).funds;

    const result = purchaseFarm(state, listing.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sale = FARM_BASE_PRICE.medium * FARM_COUNTRY_PRICE_MULT.GB * FARM_RESALE_SHARE;
    expect(fundsBefore - playerOwner(result.state).funds).toBe(listing.price - sale);
    expect(sale).toBe(750_000);
    expect(result.state.farm).toMatchObject({ owned: true, size: 'large', country: 'IE', name: listing.name });
    expect(result.state.farm.facilities).toMatchObject({ stable_block: 2, pool: 3 });
    expect(result.state.economy.playerLedger.filter((e) => e.category === 'farm_purchase').map((e) => e.amount))
      .toEqual([sale, -listing.price]);
  }, 60_000);

  it('번식 암말 20두에서 소형으로 옮기면 too_small', () => {
    const state = newState('owner_breeder');
    for (let i = 0; i < 20; i++) addPlayerHorse(state, `test-mare-${i}`, { sex: 'female', status: 'broodmare', gelded: false });
    playerOwner(state).funds = 10_000_000;
    state.farmListings = generateFarmListings(state, state.date.year);
    const listing = listingOf(state.farmListings, 'GB', 'small');
    expect(purchaseFarm(state, listing.id)).toEqual({ ok: false, error: 'too_small' });
  }, 60_000);
});

describe('연말 정산 번식 암말 진로와 수용 한도', () => {
  it('목장이 없으면 broodmare 진로가 허용 목록에 없고 제출하면 거절된다', () => {
    const state = newState('owner');
    state.date = { year: state.date.year + 1, week: 1 };
    state.yearEnd.lastSubmittedYear = state.date.year - 1;
    clearPlayerHorses(state);
    addPlayerHorse(state, 'test-mare-candidate', { sex: 'female', birthYear: state.date.year - 5, status: 'in_training' });

    const candidate = yearEndCandidates(state).find((c) => c.horseId === 'test-mare-candidate');
    expect(candidate).toBeDefined();
    expect(candidate?.allowed).not.toContain('broodmare');
    expect(candidate?.recommended).not.toBe('broodmare');

    const submission: YearEndSubmission = {
      year: state.date.year,
      horses: [{ horseId: 'test-mare-candidate', choice: 'broodmare' }],
      retainers: retainerRenewalsDue(state).map((c) => ({ kind: c.kind, personId: c.personId, renew: true })),
    };
    expect(submitYearEnd(state, submission)).toEqual({ ok: false, error: 'choice_not_allowed', horseId: 'test-mare-candidate' });
  }, 60_000);

  it('수용 한도를 넘는 번식 암말 제출은 mare_capacity', () => {
    const state = newState('owner_breeder');
    state.date = { year: state.date.year + 1, week: 1 };
    state.yearEnd.lastSubmittedYear = state.date.year - 1;
    clearPlayerHorses(state);
    // 중형 목장(15) + 마방 증축 1단계(3) = 18두. 이미 18두가 있으면 한 두 더 들일 수 없다
    const capacity = mareCapacity(state);
    for (let i = 0; i < capacity; i++) addPlayerHorse(state, `test-broodmare-${i}`, { sex: 'female', status: 'broodmare', gelded: false });
    addPlayerHorse(state, 'test-mare-candidate', { sex: 'female', birthYear: state.date.year - 5, status: 'in_training' });

    const submission: YearEndSubmission = {
      year: state.date.year,
      horses: [{ horseId: 'test-mare-candidate', choice: 'broodmare' }],
      retainers: retainerRenewalsDue(state).map((c) => ({ kind: c.kind, personId: c.personId, renew: true })),
    };
    expect(submitYearEnd(state, submission)).toEqual({ ok: false, error: 'mare_capacity' });
  }, 60_000);
});
