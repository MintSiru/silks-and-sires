import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { START_YEAR } from '../../src/engine/config/game';
import { PRIVATE_OFFER_ROUND } from '../../src/engine/config/privateTrade';
import {
  PRIVATE_ENQUIRY_PREMIUM_MAX,
  PRIVATE_ENQUIRY_PREMIUM_MIN,
  PRIVATE_MARKET_PREMIUM_MAX,
  PRIVATE_MARKET_PREMIUM_MIN,
  PRIVATE_OR_BAND_WIDTH,
} from '../../src/engine/config/sales';
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
import { loadRacecourses } from '../../src/engine/course/load';
import { createRng } from '../../src/engine/rng';
import { acceptPrivateOffer, privateOfferView } from '../../src/engine/sales/privateTrade';
import { createPrivateMarketSystem, enquirePrivatePurchase } from '../../src/engine/sales/privateMarket';
import { estimateRange, valueLot } from '../../src/engine/sales/valuation';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  Declaration,
  GameState,
  Horse,
  HorseId,
  Meeting,
  OwnerId,
  PerformanceEntry,
  PrivateOffer,
  Race,
  Rng,
} from '../../src/engine/types';

const SEED = 20261011;
const BOOT_TIMEOUT = 600_000;
const SALES = getSalesData();
const COURSES = loadRacecourses(racecoursesJson);

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

const FULL_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
  sales: SALES,
};

/** ctx.rng 를 건드리면 실패한다(시장 시스템은 ctx.rng 를 쓰지 않아야 한다) */
const FORBIDDEN_RNG = new Proxy({} as Rng, {
  get() {
    throw new Error('ctx.rng 사용 금지');
  },
});

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } }, BOOT_DATA);
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

function atWeek(state: GameState, week: number): GameState {
  const next = structuredClone(state);
  next.date = { year: state.date.year, week };
  return next;
}

/** 시장 시스템 한 주(입력 불변) */
function stepMarket(state: GameState) {
  return advanceWeek(state, [createPrivateMarketSystem()]);
}

function marketOffers(state: GameState): PrivateOffer[] {
  return state.sales.privateOffers.filter((o) => o.source === 'market');
}

function isAi(state: GameState, horse: Horse): boolean {
  if (horse.ownerId === null || horse.ownerId === state.playerOwnerId) return false;
  const owner = state.owners[horse.ownerId];
  return owner !== undefined && !owner.isPlayer;
}

/** AI 마주 현역마 3세 이상(id 순서) */
function aiRacers(state: GameState): Horse[] {
  const year = state.date.year;
  return Object.keys(state.horses)
    .sort()
    .map((id) => state.horses[id])
    .filter((h): h is Horse => h !== undefined && h.status === 'in_training' && isAi(state, h) && year - h.birthYear >= 3);
}

/** 레이팅이 낮고 G1 우승이 없는 AI 현역마 n두 */
function plainRacers(state: GameState, n: number): Horse[] {
  return aiRacers(state)
    .filter((h) => h.officialRating === null || h.officialRating < 110)
    .slice(0, n);
}

function g1WinEntry(year: number): PerformanceEntry {
  return { raceId: 'synthetic-g1-win', templateId: null, date: { year, week: 2 }, grade: 'G1', distance: 2000, country: 'GB', position: 1, pr: 100 };
}

/** 합성 G1 레이스(선언 목록을 붙인 개최). 테스트 전용 이름 */
function g1Meeting(state: GameState, week: number, horses: Horse[], status: 'open' | 'closed' = 'open'): Meeting {
  const course = COURSES.find((c) => c.id === 'saint_ourens');
  const cd = course?.distances.find((d) => d.distance === 2000);
  if (course === undefined || cd === undefined) throw new Error('fixture 에 saint_ourens 2000m 없음');
  const race: Race = {
    id: `synthetic-g1-${week}`,
    name: 'Synthetic Market Stakes',
    racecourseId: course.id,
    distance: 2000,
    layoutId: cd.layoutId,
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
    conditions: { minAge: 3, maxAge: null, sex: 'open', ratingMin: null, ratingMax: null, weightSystem: 'level', baseWeightLb: 126 },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
  };
  const declarations: Declaration[] = horses.map((h) => {
    if (h.ownerId === null) throw new Error('테스트 전제 위반: 무소유 말');
    return { horseId: h.id, ownerId: h.ownerId, trainerId: h.trainerId, jockeyId: null, weightLb: null, isPlayer: false };
  });
  return {
    id: `synthetic:g1:${state.date.year}-${week}`,
    date: { year: state.date.year, week },
    racecourseId: course.id,
    going: null,
    races: [{ race, templateId: null, status, declarations, simulated: false }],
  };
}

/** 팔린 말(또는 선언) 확인용: 제안의 말을 찾는다 */
function offerFor(state: GameState, horseId: HorseId): PrivateOffer | undefined {
  return state.sales.privateOffers.find((o) => o.horseId === horseId);
}

// ── 1. 시장 매물 생성 ─────────────────────────────────────

describe('개인 거래 시장 매물', () => {
  it('1. 4주째에 매물이 1~6건 생기고, 현역마·번식 암말 대상 조건과 가격 규칙을 지킨다', () => {
    const state = atWeek(BASE, 4);
    const year = state.date.year;
    const { state: after, events } = stepMarket(state);
    const offers = marketOffers(after);
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.length).toBeLessThanOrEqual(6);

    let racers = 0;
    let mares = 0;
    for (const offer of offers) {
      const horse = state.horses[offer.horseId];
      if (horse === undefined) throw new Error('테스트 전제 위반: 말 없음');
      expect(horse.ownerId).toBe(offer.ownerId);
      expect(isAi(state, horse)).toBe(true);
      const age = year - horse.birthYear;
      let kind: 'horses_in_training' | 'breeding_stock';
      if (horse.status === 'in_training') {
        racers += 1;
        kind = 'horses_in_training';
        expect(age).toBeGreaterThanOrEqual(3);
        expect(age).toBeLessThanOrEqual(6);
        expect(horse.officialRating).not.toBeNull();
      } else {
        mares += 1;
        kind = 'breeding_stock';
        expect(horse.status).toBe('broodmare');
        expect(horse.sex).toBe('female');
        expect(age).toBeGreaterThanOrEqual(4);
        expect(age).toBeLessThanOrEqual(12);
      }
      expect(offer.expiresYear).toBe(START_YEAR);
      expect(offer.expiresWeek).toBe(4 + 8);
      expect(offer.createdWeek).toBe(4);

      const value = valueLot(state, horse, kind, year, createRng(`${state.initialSeed}:privval:${horse.id}`));
      expect(offer.price).toBeGreaterThanOrEqual(value * PRIVATE_MARKET_PREMIUM_MIN - PRIVATE_OFFER_ROUND);
      expect(offer.price).toBeLessThanOrEqual(value * PRIVATE_MARKET_PREMIUM_MAX + PRIVATE_OFFER_ROUND);
      expect(offer.price % PRIVATE_OFFER_ROUND).toBe(0);

      expect(events).toContainEqual({
        type: 'private_offer',
        offerId: offer.id,
        ownerId: offer.ownerId,
        horseId: offer.horseId,
        price: offer.price,
        change: 'offered',
        date: { year, week: 4 },
      });
    }
    expect(racers).toBeLessThanOrEqual(4);
    expect(mares).toBeLessThanOrEqual(2);
  });

  it('2. 4주의 배수가 아닌 주에는 매물이 생기지 않는다', () => {
    expect(marketOffers(stepMarket(atWeek(BASE, 3)).state)).toEqual([]);
    expect(marketOffers(stepMarket(atWeek(BASE, 5)).state)).toEqual([]);
  });

  it('3. 매물 생성은 ctx.rng 를 쓰지 않고, 공용 rng 상태가 그대로다', () => {
    const state = atWeek(BASE, 4);
    const events = createPrivateMarketSystem().run(structuredClone(state), { date: { ...state.date }, rng: FORBIDDEN_RNG });
    expect(events.some((e) => e.type === 'private_offer' && e.change === 'offered')).toBe(true);
    expect(stepMarket(state).state.rng).toEqual(state.rng);
  });

  it('4. 같은 입력이면 같은 매물(id·말·가격)이 나온다', () => {
    const a = marketOffers(stepMarket(atWeek(BASE, 4)).state);
    const b = marketOffers(stepMarket(atWeek(BASE, 4)).state);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('5. 올해 G1 우승 현역마는 매물 후보에서 빠진다', () => {
    const state = atWeek(BASE, 4);
    for (const horse of aiRacers(state)) {
      state.seasonState.performances[horse.id] = [g1WinEntry(state.date.year)];
    }
    expect(aiRacers(state).length).toBeGreaterThan(0);
    const racersOffered = marketOffers(stepMarket(state).state).filter((o) => state.horses[o.horseId]?.status === 'in_training');
    expect(racersOffered).toEqual([]);
  });

  it('6. 앞으로 4주 안에 G1 선언이 있는 현역마는 매물 후보에서 빠진다', () => {
    const state = atWeek(BASE, 4);
    state.seasonState.meetings.push(g1Meeting(state, 6, aiRacers(state)));
    const racersOffered = marketOffers(stepMarket(state).state).filter((o) => state.horses[o.horseId]?.status === 'in_training');
    expect(racersOffered).toEqual([]);
  });
});

// ── 2. 시장 매물 무효·만료 ─────────────────────────────────

describe('개인 거래 시장 매물 정리', () => {
  function afterWeek4(): GameState {
    const after = stepMarket(atWeek(BASE, 4)).state;
    expect(marketOffers(after).length).toBeGreaterThan(0);
    return after;
  }

  it('7. 매물 말이 다른 마주에게 팔리면 이벤트 없이 사라진다', () => {
    const state = afterWeek4();
    const target = marketOffers(state)[0];
    if (target === undefined) throw new Error('테스트 전제 위반');
    const other = Object.keys(state.owners)
      .sort()
      .find((id) => id !== target.ownerId && id !== state.playerOwnerId && state.owners[id]?.isPlayer !== true);
    if (other === undefined) throw new Error('테스트 전제 위반: 다른 AI 마주 없음');
    const moved = structuredClone(state);
    const horse = moved.horses[target.horseId];
    if (horse === undefined) throw new Error('테스트 전제 위반');
    horse.ownerId = other;
    const result = stepMarket(atWeek(moved, 5));
    expect(offerFor(result.state, target.horseId)).toBeUndefined();
    expect(result.events.some((e) => e.type === 'private_offer' && e.offerId === target.id)).toBe(false);
  });

  it('8. 매물 말이 출주 선언되거나 은퇴하면 무효로 정리된다', () => {
    const state = afterWeek4();
    const offers = marketOffers(state);
    const declared = offers[0];
    const retired = offers[1];
    if (declared === undefined || retired === undefined) throw new Error('테스트 전제 위반: 매물 2건 필요');

    const withDeclaration = structuredClone(state);
    withDeclaration.seasonState.meetings.push(g1Meeting(withDeclaration, 5, [withDeclaration.horses[declared.horseId]!], 'open'));
    expect(offerFor(stepMarket(atWeek(withDeclaration, 5)).state, declared.horseId)).toBeUndefined();

    const retiredState = structuredClone(state);
    const horse = retiredState.horses[retired.horseId];
    if (horse === undefined) throw new Error('테스트 전제 위반');
    horse.status = 'retired';
    expect(offerFor(stepMarket(atWeek(retiredState, 5)).state, retired.horseId)).toBeUndefined();
  });

  it('9. 매물은 생성 주 + 8주까지(포함) 살아 있고, 다음 주 expired 이벤트와 함께 사라진다', () => {
    const state = afterWeek4();
    const target = marketOffers(state)[0];
    if (target === undefined) throw new Error('테스트 전제 위반');
    const alive = stepMarket(atWeek(state, 12));
    expect(alive.state.sales.privateOffers.map((o) => o.id)).toContain(target.id);
    const gone = stepMarket(atWeek(state, 13));
    expect(gone.state.sales.privateOffers.map((o) => o.id)).not.toContain(target.id);
    expect(gone.events).toContainEqual({
      type: 'private_offer',
      offerId: target.id,
      ownerId: target.ownerId,
      horseId: target.horseId,
      price: target.price,
      change: 'expired',
      date: { year: START_YEAR, week: 13 },
    });
  });
});

// ── 3. 구매 문의 ─────────────────────────────────────────

describe('구매 문의', () => {
  const WEEK = 3;

  it('10. 일반 현역마 문의는 호가를 만든다(출처 enquiry, 만료 2주, 할증 1.3~1.5배, 화면 구간)', () => {
    const state = atWeek(BASE, WEEK);
    const target = plainRacers(state, 1)[0];
    if (target === undefined) throw new Error('테스트 전제 위반: 문의 가능한 현역마 없음');
    const result = enquirePrivatePurchase(state, target.id);
    if (!result.ok) throw new Error(`문의 실패: ${result.error}`);
    const offer = offerFor(result.state, target.id);
    if (offer === undefined) throw new Error('호가가 생기지 않았다');
    expect(offer.source).toBe('enquiry');
    expect(offer.ownerId).toBe(target.ownerId);
    expect(offer.expiresYear).toBe(START_YEAR);
    expect(offer.expiresWeek).toBe(WEEK + 2);
    expect(offer.price % PRIVATE_OFFER_ROUND).toBe(0);
    const value = valueLot(state, target, 'horses_in_training', START_YEAR, createRng(`${state.initialSeed}:privval:${target.id}`));
    expect(offer.price).toBeGreaterThanOrEqual(value * PRIVATE_ENQUIRY_PREMIUM_MIN - PRIVATE_OFFER_ROUND);
    expect(offer.price).toBeLessThanOrEqual(value * PRIVATE_ENQUIRY_PREMIUM_MAX + PRIVATE_OFFER_ROUND);
    expect(result.events).toContainEqual({
      type: 'private_offer',
      offerId: offer.id,
      ownerId: target.ownerId,
      horseId: target.id,
      price: offer.price,
      change: 'offered',
      date: { year: START_YEAR, week: WEEK },
    });
    // 같은 입력이면 같은 호가
    const again = enquirePrivatePurchase(state, target.id);
    expect(again.ok && offerFor(again.state, target.id)?.price).toBe(offer.price);
    // 화면 목록에 출처가 보인다
    const row = privateOfferView(result.state).find((r) => r.horseId === target.id);
    expect(row?.source).toBe('enquiry');
    expect(row?.kind).toBe('racehorse');
  });

  it('11. 올해 G1 우승마 문의는 거절되고 상태는 그대로다', () => {
    const state = atWeek(BASE, WEEK);
    const target = plainRacers(state, 1)[0];
    if (target === undefined) throw new Error('테스트 전제 위반');
    state.seasonState.performances[target.id] = [g1WinEntry(START_YEAR)];
    const snapshot = structuredClone(state);
    expect(enquirePrivatePurchase(state, target.id)).toEqual({ ok: false, error: 'refused_group_winner' });
    expect(state).toEqual(snapshot);
  });

  it('12. 공식 레이팅 115 이상이면 거절, 114 이하면 허용', () => {
    const state = atWeek(BASE, WEEK);
    const target = plainRacers(state, 1)[0];
    if (target === undefined) throw new Error('테스트 전제 위반');
    const high = structuredClone(state);
    const highHorse = high.horses[target.id];
    if (highHorse === undefined) throw new Error('테스트 전제 위반');
    highHorse.officialRating = 115;
    expect(enquirePrivatePurchase(high, target.id)).toEqual({ ok: false, error: 'refused_rating' });
    const low = structuredClone(state);
    const lowHorse = low.horses[target.id];
    if (lowHorse === undefined) throw new Error('테스트 전제 위반');
    lowHorse.officialRating = 114;
    expect(enquirePrivatePurchase(low, target.id).ok).toBe(true);
  });

  it('13. 같은 주 같은 말 재문의는 already_enquired, 3건 뒤 4번째 문의는 enquiry_limit', () => {
    const racers = plainRacers(atWeek(BASE, WEEK), 4);
    expect(racers.length).toBe(4);
    let state = atWeek(BASE, WEEK);
    for (const horse of racers.slice(0, 3)) {
      const result = enquirePrivatePurchase(state, horse.id);
      if (!result.ok) throw new Error(`문의 실패: ${result.error}`);
      state = result.state;
    }
    expect(enquirePrivatePurchase(state, racers[0]!.id)).toEqual({ ok: false, error: 'already_enquired' });
    const snapshot = structuredClone(state);
    expect(enquirePrivatePurchase(state, racers[3]!.id)).toEqual({ ok: false, error: 'enquiry_limit' });
    expect(state).toEqual(snapshot);
    // 다음 주에는 다시 문의할 수 있다
    const nextWeek = atWeek(state, WEEK + 1);
    expect(enquirePrivatePurchase(nextWeek, racers[3]!.id).ok).toBe(true);
  });

  it('14. 플레이어 말·2세마·없는 말은 문의할 수 없다', () => {
    const state = atWeek(BASE, WEEK);
    const playerHorseId = state.owners[state.playerOwnerId]?.horseIds[0];
    if (playerHorseId === undefined) throw new Error('테스트 전제 위반: 플레이어 말 없음');
    expect(enquirePrivatePurchase(state, playerHorseId)).toEqual({ ok: false, error: 'not_for_sale' });
    expect(enquirePrivatePurchase(state, 'no-such-horse')).toEqual({ ok: false, error: 'horse_not_found' });

    const young = structuredClone(state);
    const racer = plainRacers(young, 1)[0];
    if (racer === undefined) throw new Error('테스트 전제 위반');
    racer.birthYear = START_YEAR - 2;
    expect(enquirePrivatePurchase(young, racer.id)).toEqual({ ok: false, error: 'not_for_sale' });
  });

  it('15. AI 번식 암말 문의는 허용되고 평가는 번식 암말 기준이다', () => {
    const state = atWeek(BASE, WEEK);
    const mare = structuredClone(state);
    const racer = plainRacers(mare, 1)[0];
    if (racer === undefined) throw new Error('테스트 전제 위반');
    racer.status = 'broodmare';
    racer.sex = 'female';
    racer.gelded = false;
    const result = enquirePrivatePurchase(mare, racer.id);
    if (!result.ok) throw new Error(`문의 실패: ${result.error}`);
    const offer = offerFor(result.state, racer.id);
    if (offer === undefined) throw new Error('호가가 생기지 않았다');
    const value = valueLot(mare, racer, 'breeding_stock', START_YEAR, createRng(`${mare.initialSeed}:privval:${racer.id}`));
    expect(offer.price).toBeGreaterThanOrEqual(value * PRIVATE_ENQUIRY_PREMIUM_MIN - PRIVATE_OFFER_ROUND);
    expect(offer.price).toBeLessThanOrEqual(value * PRIVATE_ENQUIRY_PREMIUM_MAX + PRIVATE_OFFER_ROUND);
    expect(privateOfferView(result.state).find((r) => r.horseId === racer.id)?.kind).toBe('broodmare');
  });
});

// ── 4. 수락·화면 ─────────────────────────────────────────

describe('시장·문의 호가 수락과 화면', () => {
  function funded(state: GameState, price: number): GameState {
    const next = structuredClone(state);
    const player = next.owners[next.playerOwnerId];
    if (player === undefined) throw new Error('테스트 전제 위반');
    player.funds = price + 1_000;
    return next;
  }

  /** 플레이어 조교사 배정은 필요 없다(AI 조교사 유지). 말 소유만 본다 */
  it('16. 문의 호가 수락: 소유가 플레이어로 바뀌고 자금 차감·장부 기록, 호가는 사라진다', () => {
    const state = atWeek(BASE, 3);
    const target = plainRacers(state, 1)[0];
    if (target === undefined) throw new Error('테스트 전제 위반');
    const enquiry = enquirePrivatePurchase(state, target.id);
    if (!enquiry.ok) throw new Error('문의 실패');
    const offer = offerFor(enquiry.state, target.id);
    if (offer === undefined) throw new Error('호가 없음');
    const sellerId: OwnerId = offer.ownerId;
    const money = funded(enquiry.state, offer.price);
    const result = acceptPrivateOffer(money, offer.id);
    if (!result.ok) throw new Error(`수락 실패: ${result.error}`);
    const horse = result.state.horses[target.id];
    expect(horse?.ownerId).toBe(BASE.playerOwnerId);
    expect(horse?.trainerId).toBe(target.trainerId);
    expect(result.state.owners[BASE.playerOwnerId]?.funds).toBe(1_000);
    expect(result.state.owners[BASE.playerOwnerId]?.horseIds).toContain(target.id);
    expect(result.state.owners[sellerId]?.horseIds).not.toContain(target.id);
    expect(result.state.economy.playerLedger.at(-1)).toMatchObject({ category: 'private_sale', amount: -offer.price, horseId: target.id });
    expect(result.state.sales.privateOffers.map((o) => o.id)).not.toContain(offer.id);
  });

  it('17. 시장 매물 수락도 같은 방식이다(소유 이전·자금·장부)', () => {
    const state = stepMarket(atWeek(BASE, 4)).state;
    const target = marketOffers(state)[0];
    if (target === undefined) throw new Error('테스트 전제 위반');
    const result = acceptPrivateOffer(funded(state, target.price), target.id);
    if (!result.ok) throw new Error(`수락 실패: ${result.error}`);
    expect(result.state.horses[target.horseId]?.ownerId).toBe(BASE.playerOwnerId);
    expect(result.state.economy.currentYear.player.private_sale).toBe(-target.price);
    expect(result.state.sales.privateOffers.map((o) => o.id)).not.toContain(target.id);
  });

  it('18. 화면 목록은 출처·종류·레이팅 구간을 주고, 레이팅 원값은 주지 않는다', () => {
    const state = stepMarket(atWeek(BASE, 4)).state;
    const rows = privateOfferView(state);
    expect(rows.length).toBe(marketOffers(state).length);
    for (const row of rows) {
      expect(row.source).toBe('market');
      expect(['racehorse', 'broodmare']).toContain(row.kind);
      if (row.orBand !== null) expect(row.orBand.high - row.orBand.low).toBe(PRIVATE_OR_BAND_WIDTH);
      expect(row.record.lastPosition).toBeNull();
      // 추정 범위는 제안 가격과 같은 종류(현역마·번식 암말)의 평가로 잡는다
      const horse = state.horses[row.horseId];
      if (horse === undefined) throw new Error('테스트 전제 위반: 말 없음');
      const kind = row.kind === 'broodmare' ? 'breeding_stock' : 'horses_in_training';
      const value = valueLot(state, horse, kind, START_YEAR, createRng(`${state.initialSeed}:privval:${horse.id}`));
      expect(row.estimate).toEqual(estimateRange(value));
    }
    expect(JSON.stringify(rows)).not.toContain('officialRating');
  });

  it('19. 올해 마지막 출주 착순이 있으면 화면 성적 요약에 나온다', () => {
    const state = stepMarket(atWeek(BASE, 4)).state;
    const target = marketOffers(state).find((o) => state.horses[o.horseId]?.status === 'in_training');
    if (target === undefined) throw new Error('테스트 전제 위반: 현역 매물 없음');
    state.seasonState.performances[target.horseId] = [
      { ...g1WinEntry(START_YEAR), grade: null, date: { year: START_YEAR, week: 2 }, position: 4 },
      { ...g1WinEntry(START_YEAR), grade: null, date: { year: START_YEAR, week: 3 }, position: 2 },
    ];
    const row = privateOfferView(state).find((r) => r.horseId === target.horseId);
    expect(row?.record.lastPosition).toBe(2);
  });
});

// ── 5. 세계 불변 ─────────────────────────────────────────

describe('시장 매물은 플레이어가 사기 전까지 세계를 바꾸지 않는다', () => {
  it('20. 5주 진행(4주째 매물 포함): 시장 시스템을 뺀 진행과 매물 칸을 뺀 상태가 같다', () => {
    const all = createGameSystems(FULL_GAME);
    const withoutMarket = all.filter((s) => s.id !== 'private_market');
    const run = (list: typeof all): GameState => {
      let current = fresh();
      for (let i = 0; i < 5; i++) current = advanceWeek(current, list).state;
      return current;
    };
    const withMarket = run(all);
    const baseline = run(withoutMarket);
    expect(marketOffers(withMarket).length).toBeGreaterThan(0);
    // 매물 칸과 그 이벤트(eventLog 의 private_offer)만 뺀다. 나머지 세계는 같아야 한다
    const masked = (s: GameState): GameState => ({
      ...s,
      sales: { ...s.sales, privateOffers: [], nextPrivateOfferNo: 1 },
      eventLog: s.eventLog.filter((e) => e.type !== 'private_offer'),
    });
    expect(masked(withMarket)).toEqual(masked(baseline));
  });
});
