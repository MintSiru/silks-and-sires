import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { START_YEAR } from '../../src/engine/config/game';
import {
  OWNER_RELATION_BRED_G1_WIN,
  OWNER_RELATION_BRED_WIN,
  OWNER_RELATION_PRIVATE_PURCHASE,
  PRIVATE_OFFER_MAX_ACTIVE,
  PRIVATE_OFFER_MIN_PRICE,
  PRIVATE_OFFER_PER_RUN,
  PRIVATE_OFFER_PREMIUM,
  PRIVATE_OFFER_ROUND,
  PRIVATE_OFFER_VALID_WEEKS,
} from '../../src/engine/config/privateTrade';
import { PRIVATE_OR_BAND_WIDTH } from '../../src/engine/config/sales';
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
import { adjustRelation, relationKey, relationOf } from '../../src/engine/economy/relations';
import { eligibleInspectors } from '../../src/engine/sales/inspection';
import {
  acceptPrivateOffer,
  createPrivateTradeSystem,
  declinePrivateOffer,
  inspectOfferHorse,
  privateOfferView,
} from '../../src/engine/sales/privateTrade';
import { valueLot } from '../../src/engine/sales/valuation';
import type { SampleField } from '../../src/engine/race/sampleField';
import { createRng } from '../../src/engine/rng';
import { applyRaceResult } from '../../src/engine/season/apply';
import { assignTrainer } from '../../src/engine/season/player';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { allocateHorseId } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  CountryCode,
  Declaration,
  GameEvent,
  GameState,
  Going,
  Horse,
  HorseId,
  Meeting,
  OwnerId,
  PrivateOffer,
  Race,
  RaceGrade,
  RaceResult,
  Rng,
  RunnerResult,
  ScheduledRace,
  TrainerId,
} from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SILKS_REQUEST = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };
const JOCKEY_ID = 'jk-private-test';
const BOOT_TIMEOUT = 600_000;
const HEAVY_TIMEOUT = 600_000;
const DATE_WEEK = 3;
const COURSES = loadRacecourses(racecoursesJson);
const SALES = getSalesData();

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

/** ctx.rng 를 건드리면 실패하는 rng(제안 시스템은 ctx.rng 를 쓰지 않아야 한다) */
const FORBIDDEN_RNG = new Proxy({} as Rng, {
  get() {
    throw new Error('ctx.rng 사용 금지');
  },
});

let BASE: GameState;
let TEMPLATE: Horse;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  const template = Object.values(BASE.horses)[0];
  if (template === undefined) throw new Error('테스트 전제 위반: 말이 없다');
  TEMPLATE = template;
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

/** AI 마주 id(정렬 순서) */
function aiOwnerIds(state: GameState): OwnerId[] {
  return Object.keys(state.owners)
    .sort()
    .filter((id) => id !== state.playerOwnerId && state.owners[id]?.isPlayer !== true);
}

function atWeek(state: GameState, week: number): GameState {
  const next = structuredClone(state);
  next.date = { year: state.date.year, week };
  return next;
}

/** 제안 시스템 한 주만 돌린다(입력 불변) */
function stepSystem(state: GameState): { state: GameState; events: GameEvent[] } {
  return advanceWeek(state, [createPrivateTradeSystem()]);
}

function offersOf(state: GameState, ownerId: OwnerId): PrivateOffer[] {
  return state.sales.privateOffers.filter((o) => o.ownerId === ownerId);
}

function ownerRelationKey(ownerId: OwnerId) {
  return relationKey('owner', ownerId);
}

interface PrepOptions {
  /** 판매 마주 수(앞에서부터 AI 마주 몇 명을 판매자로 쓸지) */
  sellers?: number;
  /** 판매자 관계 값 */
  relation?: number;
  /** 플레이어 명성 */
  reputation?: number;
  /** 판매자들이 아닌 AI 마주를 small 로 내려 자격에서 뺀다(명성 경로 등 다른 마주가 끼지 않게) */
  isolate?: boolean;
  /** 후보 말 속성 덮어쓰기(모든 판매자의 후보에 적용) */
  horseOverrides?: Partial<Horse>;
  /** 판매자 등급(기본 major) */
  tier?: 'major' | 'mid' | 'small';
}

interface Prepared {
  state: GameState;
  sellers: OwnerId[];
  /** 판매자마다 만든 후보 말(같은 순서) */
  horses: Horse[];
}

/** 판매 마주와 후보 2세마를 만든 상태(주 3). 판매자의 기존 말은 2세가 아니게 바꿔 후보에서 뺀다 */
function prepare(opts: PrepOptions = {}): Prepared {
  const state = fresh();
  const count = opts.sellers ?? 1;
  const sellers = aiOwnerIds(state).slice(0, count);
  if (sellers.length < count) throw new Error('테스트 전제 위반: AI 마주가 부족하다');
  if (opts.isolate === true) {
    for (const id of aiOwnerIds(state)) {
      const owner = state.owners[id];
      if (owner !== undefined && !sellers.includes(id)) owner.tier = 'small';
    }
  }
  for (const id of sellers) {
    const owner = state.owners[id];
    if (owner === undefined) throw new Error(`테스트 전제 위반: 마주 ${id} 없음`);
    owner.tier = opts.tier ?? 'major';
    owner.studName = `Test Stud ${id}`;
    if (opts.relation !== undefined) adjustRelation(state, ownerRelationKey(id), opts.relation);
  }
  for (const horse of Object.values(state.horses)) {
    if (horse.ownerId !== null && sellers.includes(horse.ownerId)) horse.birthYear = START_YEAR - 5;
  }
  if (opts.reputation !== undefined) state.relations.reputation = opts.reputation;
  const horses = sellers.map((id) => addYearling(state, id, opts.horseOverrides));
  return { state: atWeek(state, DATE_WEEK), sellers, horses };
}

/** 마주 소유·생산 2세 현역 후보 말 한 두를 추가한다 */
function addYearling(state: GameState, ownerId: OwnerId, overrides: Partial<Horse> = {}): Horse {
  const id = allocateHorseId(state);
  const horse: Horse = {
    ...structuredClone(TEMPLATE),
    id,
    name: `Test Yearling ${id}`,
    ownerId,
    breederId: ownerId,
    trainerId: null,
    birthYear: START_YEAR - 2,
    status: 'in_training',
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 },
    ...overrides,
  };
  state.horses[id] = horse;
  const owner = state.owners[ownerId];
  if (owner === undefined) throw new Error(`테스트 전제 위반: 마주 ${ownerId} 없음`);
  owner.horseIds.push(id);
  return horse;
}

/** 판매자 1명, 관계 relation 으로 주 3 에 제안을 하나 만든 상태 */
function withOffer(relation = 30): { state: GameState; sellerId: OwnerId; offer: PrivateOffer } {
  const prep = prepare({ relation, isolate: true });
  const result = stepSystem(prep.state);
  const sellerId = prep.sellers[0] ?? '';
  const offer = offersOf(result.state, sellerId)[0];
  if (offer === undefined) throw new Error('테스트 전제 위반: 제안이 생기지 않았다');
  // 제안 생성 뒤 주가 넘어갔으므로 되돌려 같은 주(3주)에서 수락·거절을 본다
  return { state: atWeek(result.state, DATE_WEEK), sellerId, offer };
}

// ── 레이스 결과 헬퍼(relations 테스트와 같은 방식의 합성 결과) ─────────

const MEETING: Meeting = {
  id: 'synthetic:private-trade',
  date: { year: START_YEAR, week: 20 },
  racecourseId: 'saint_ourens',
  going: 'good',
  races: [],
};

function trainerWithRoom(state: GameState): TrainerId {
  const load = new Map<TrainerId, number>();
  for (const h of Object.values(state.horses)) {
    if (h.trainerId !== null) load.set(h.trainerId, (load.get(h.trainerId) ?? 0) + 1);
  }
  const id = Object.keys(state.trainers)
    .sort()
    .find((t) => (load.get(t) ?? 0) < (state.trainers[t]?.capacity ?? 0));
  if (id === undefined) throw new Error('테스트 전제 위반: 여유 있는 조교사가 없다');
  return id;
}

/** 플레이어 소유 3세 현역마(생산자 지정), 조교사 배정 */
function playerRacer(state: GameState, breederId: string): { state: GameState; horseId: HorseId } {
  const next = structuredClone(state);
  const id = allocateHorseId(next);
  const horse: Horse = {
    ...structuredClone(TEMPLATE),
    id,
    name: 'Test Racer',
    ownerId: next.playerOwnerId,
    breederId,
    trainerId: null,
    birthYear: START_YEAR - 3,
    status: 'in_training',
    officialRating: 70,
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 },
  };
  next.horses[id] = horse;
  next.owners[next.playerOwnerId]?.horseIds.push(id);
  const assigned = assignTrainer(next, id, trainerWithRoom(next));
  if (!assigned.ok) throw new Error('테스트 전제 위반: 조교사 배정 실패');
  return { state: assigned.state, horseId: id };
}

function opponentsOf(state: GameState, count: number): HorseId[] {
  return Object.values(state.horses)
    .filter((h) => h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId)
    .map((h) => h.id)
    .sort()
    .slice(0, count);
}

/** horseIds 를 1착부터 세워 결과를 반영한다. 플레이어 말은 isPlayer 로 판정 */
function runRace(state: GameState, horseIds: HorseId[], grade: RaceGrade | null): GameState {
  const course = COURSES.find((c) => c.id === 'saint_ourens');
  const cd = course?.distances.find((d) => d.distance === 2000);
  if (course === undefined || cd === undefined) throw new Error('fixture 에 saint_ourens 2000m 없음');
  const race: Race = {
    id: 'test-private-race',
    name: 'Synthetic Private Stakes',
    racecourseId: course.id,
    distance: 2000,
    layoutId: cd.layoutId,
    kind: grade === null ? 'handicap' : 'group',
    grade,
    raceClass: grade === null ? 4 : 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'level',
      baseWeightLb: 126,
    },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
  };
  const declarations: Declaration[] = horseIds.map((horseId) => {
    const h = state.horses[horseId];
    if (h === undefined || h.ownerId === null) throw new Error(`테스트 전제 위반: 말 ${horseId} 의 마주가 없다`);
    return {
      horseId,
      ownerId: h.ownerId,
      trainerId: h.trainerId,
      jockeyId: JOCKEY_ID,
      weightLb: 126,
      isPlayer: h.ownerId === state.playerOwnerId,
    };
  });
  const scheduled: ScheduledRace = { race, templateId: null, status: 'run', declarations, simulated: true };
  const runners: RunnerResult[] = horseIds.map((horseId, i) => ({
    runnerIndex: i,
    horseId,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: JOCKEY_ID,
    weightLb: 126,
    position: i + 1,
    finishTime: 200 + i,
    margin: i === 0 ? null : { label: 'lengths', lengths: 1 },
    beatenLengths: i,
    sectionals: [200 + i],
    performanceFigure: 0,
    odds: null,
  }));
  const result: RaceResult = {
    raceId: race.id,
    racecourseId: race.racecourseId,
    date: MEETING.date,
    going: 'good' as Going,
    distance: race.distance,
    seed: 4242,
    winningTime: 200,
    sectionalMarks: [],
    runners,
  };
  const field: SampleField = {
    runners: [],
    requests: declarations.map((d) => ({
      horseId: d.horseId,
      jockeyId: JOCKEY_ID,
      tactic: 'midfield' as const,
      silks: { ...SILKS_REQUEST },
      isPlayer: d.isPlayer,
      weightLb: 126,
      jockeyAllowanceLb: 0,
    })),
    ownerNames: declarations.map(() => 'synthetic owner'),
  };
  return applyRaceResult(state, {
    meeting: MEETING,
    scheduled,
    result,
    field,
    series: [],
    country: 'GB' as CountryCode,
    nicks: [],
  }).state;
}

// ── 1. 자격·후보·추첨 ─────────────────────────────────────

describe('내부거래 제안 자격과 후보', () => {
  it('1. 관계 19.99 인 AI 마주는 자격이 없다(명성 10)', () => {
    const prep = prepare({ relation: 19.99 });
    const result = stepSystem(prep.state);
    expect(offersOf(result.state, prep.sellers[0] ?? '')).toEqual([]);
  });

  it('2. 관계 20 은 자격이 있다', () => {
    const prep = prepare({ relation: 20 });
    const result = stepSystem(prep.state);
    expect(offersOf(result.state, prep.sellers[0] ?? '').length).toBe(1);
  });

  it('3. 명성 35 면 관계가 0 이어도 자격이 있고, 34.99 면 없다', () => {
    const yes = prepare({ reputation: 35, isolate: true });
    expect(offersOf(stepSystem(yes.state).state, yes.sellers[0] ?? '').length).toBe(1);
    const no = prepare({ reputation: 34.99, isolate: true });
    expect(offersOf(stepSystem(no.state).state, no.sellers[0] ?? '')).toEqual([]);
  });

  it('4. small 등급 마주는 관계가 높아도 제외된다', () => {
    const prep = prepare({ relation: 30, tier: 'small' });
    expect(offersOf(stepSystem(prep.state).state, prep.sellers[0] ?? '')).toEqual([]);
  });

  it('5. 생산목장(studName)이 없는 마주는 제외된다', () => {
    const prep = prepare({ relation: 30 });
    const state = prep.state;
    const seller = state.owners[prep.sellers[0] ?? ''];
    if (seller === undefined) throw new Error('테스트 전제 위반');
    seller.studName = null;
    expect(offersOf(stepSystem(state).state, seller.id)).toEqual([]);
  });

  it('6. 이미 출주한 말은 후보가 아니다', () => {
    const prep = prepare({ relation: 30 });
    const horse = prep.horses[0];
    if (horse === undefined) throw new Error('테스트 전제 위반');
    const state = prep.state;
    const raced = state.horses[horse.id];
    if (raced === undefined) throw new Error('테스트 전제 위반');
    raced.record.starts = 1;
    expect(offersOf(stepSystem(state).state, prep.sellers[0] ?? '')).toEqual([]);
  });

  it.each([
    ['3세마', { birthYear: START_YEAR - 3 }],
    ['다른 마주가 생산한 말', { breederId: 'ow-someone-else' }],
    ['휴양 중인 말', { status: 'resting' as const }],
  ])('7. %s 는 후보가 아니다', (_label, overrides) => {
    const prep = prepare({ relation: 30, horseOverrides: overrides });
    expect(offersOf(stepSystem(prep.state).state, prep.sellers[0] ?? '')).toEqual([]);
  });

  it('8. 진행 중 제안이 있는 마주는 새 제안 대상에서 빠진다', () => {
    const prep = prepare({ relation: 30 });
    const sellerId = prep.sellers[0] ?? '';
    const horse = prep.horses[0];
    if (horse === undefined) throw new Error('테스트 전제 위반');
    prep.state.sales.privateOffers.push({
      id: 'po_2026_99',
      ownerId: sellerId,
      horseId: horse.id,
      price: 10_000,
      createdYear: START_YEAR,
      createdWeek: 1,
      expiresYear: START_YEAR,
      expiresWeek: 20,
    });
    const offers = offersOf(stepSystem(prep.state).state, sellerId);
    expect(offers.map((o) => o.id)).toEqual(['po_2026_99']);
  });

  it('9. 한 주 최대 PRIVATE_OFFER_PER_RUN 건, 진행 중 제안이 MAX 이면 새 제안 없음', () => {
    const many = prepare({ sellers: 4, relation: 30, isolate: true });
    const created = stepSystem(many.state).state;
    expect(created.sales.privateOffers.length).toBe(PRIVATE_OFFER_PER_RUN);

    const full = prepare({ sellers: 4, relation: 30, isolate: true });
    const extras = full.sellers.slice(1, 1 + PRIVATE_OFFER_MAX_ACTIVE);
    extras.forEach((ownerId, i) => {
      const horse = full.horses[i + 1];
      if (horse === undefined) throw new Error('테스트 전제 위반');
      full.state.sales.privateOffers.push({
        id: `po_2026_${50 + i}`,
        ownerId,
        horseId: horse.id,
        price: 10_000,
        createdYear: START_YEAR,
        createdWeek: 1,
        expiresYear: START_YEAR,
        expiresWeek: 20,
      });
    });
    const after = stepSystem(full.state).state;
    expect(after.sales.privateOffers.length).toBe(PRIVATE_OFFER_MAX_ACTIVE);
    expect(offersOf(after, full.sellers[0] ?? '')).toEqual([]);
  });

  it('10. 제안은 3·6·9주에만 만들어진다(4주는 없음)', () => {
    const prep = prepare({ relation: 30 });
    const week4 = atWeek(prep.state, 4);
    expect(stepSystem(week4).state.sales.privateOffers).toEqual([]);
  });

  it('11. 제안 시스템은 ctx.rng 를 쓰지 않는다', () => {
    const prep = prepare({ relation: 30 });
    const system = createPrivateTradeSystem();
    const events = system.run(prep.state, { date: { ...prep.state.date }, rng: FORBIDDEN_RNG });
    expect(events.some((e) => e.type === 'private_offer' && e.change === 'offered')).toBe(true);
  });

  it('12. 같은 입력이면 같은 제안(id·말·가격)이 나온다', () => {
    const a = stepSystem(prepare({ relation: 30, sellers: 3, isolate: true }).state).state;
    const b = stepSystem(prepare({ relation: 30, sellers: 3, isolate: true }).state).state;
    expect(a.sales.privateOffers).toEqual(b.sales.privateOffers);
  });
});

// ── 2. 가격·만료 ───────────────────────────────────────────

describe('내부거래 제안 가격과 만료', () => {
  it('13. 시드 20261011, 관계 30, 3주차 진행: 제안 1건 이상, 가격은 규칙식, 만료는 생성 주 + 4', () => {
    const prep = prepare({ relation: 30 });
    const sellerId = prep.sellers[0] ?? '';
    const horse = prep.horses[0];
    if (horse === undefined) throw new Error('테스트 전제 위반');

    const value = valueLot(prep.state, horse, 'breeze_up', START_YEAR, createRng(`${SEED}:privval:${horse.id}`));
    const discount = Math.min(Math.max(30, 0), 60) / 400;
    const expected = Math.max(
      PRIVATE_OFFER_MIN_PRICE,
      Math.round((value * PRIVATE_OFFER_PREMIUM * (1 - discount)) / PRIVATE_OFFER_ROUND) * PRIVATE_OFFER_ROUND,
    );

    const result = stepSystem(prep.state);
    const offers = offersOf(result.state, sellerId);
    expect(offers.length).toBeGreaterThanOrEqual(1);
    const offer = offers[0];
    if (offer === undefined) throw new Error('테스트 전제 위반');
    expect(offer.price).toBe(expected);
    expect(offer.price % PRIVATE_OFFER_ROUND).toBe(0);
    expect(offer.price).toBeGreaterThanOrEqual(PRIVATE_OFFER_MIN_PRICE);
    expect(offer.id).toBe('po_2026_1');
    expect(offer.expiresYear).toBe(START_YEAR);
    expect(offer.expiresWeek).toBe(DATE_WEEK + PRIVATE_OFFER_VALID_WEEKS);
    expect(result.state.sales.nextPrivateOfferNo).toBe(2);
    expect(result.events).toContainEqual({
      type: 'private_offer',
      offerId: offer.id,
      ownerId: sellerId,
      horseId: horse.id,
      price: offer.price,
      change: 'offered',
      date: { year: START_YEAR, week: DATE_WEEK },
    });
  });

  it('14. 9주 제안은 13주까지 유지되고, 14주 처리 때 expired 이벤트와 함께 삭제된다', () => {
    const prep = prepare({ relation: 30 });
    const sellerId = prep.sellers[0] ?? '';
    const created = stepSystem(atWeek(prep.state, 9));
    const offer = offersOf(created.state, sellerId)[0];
    if (offer === undefined) throw new Error('테스트 전제 위반');
    expect(offer.expiresWeek).toBe(13);

    let current = created.state;
    for (const week of [10, 11, 12, 13]) {
      current = stepSystem(atWeek(current, week)).state;
      expect(current.sales.privateOffers.map((o) => o.id)).toContain(offer.id);
    }
    const expired = stepSystem(atWeek(current, 14));
    expect(expired.state.sales.privateOffers.map((o) => o.id)).not.toContain(offer.id);
    expect(expired.events).toContainEqual({
      type: 'private_offer',
      offerId: offer.id,
      ownerId: sellerId,
      horseId: offer.horseId,
      price: offer.price,
      change: 'expired',
      date: { year: START_YEAR, week: 14 },
    });
  });

  it('15. 말이 다른 마주 소유가 되면 제안은 이벤트 없이 조용히 사라진다', () => {
    const { state, sellerId, offer } = withOffer(30);
    const moved = structuredClone(state);
    const horse = moved.horses[offer.horseId];
    if (horse === undefined) throw new Error('테스트 전제 위반');
    horse.ownerId = moved.playerOwnerId;
    const result = stepSystem(atWeek(moved, DATE_WEEK + 1));
    expect(offersOf(result.state, sellerId)).toEqual([]);
    expect(result.events.some((e) => e.type === 'private_offer' && e.change === 'expired')).toBe(false);
  });
});

// ── 3. 수락·거절·화면·동행 검사 ────────────────────────────

describe('내부거래 수락과 거절', () => {
  it('16. 수락: 장부 private_sale 양쪽, 소유 이전(조교사 유지), 판매 마주 관계 +8, accepted 와 horse_sold 이벤트', () => {
    const { state, sellerId, offer } = withOffer(30);
    const funded = structuredClone(state);
    const player = funded.owners[funded.playerOwnerId];
    const seller = funded.owners[sellerId];
    if (player === undefined || seller === undefined) throw new Error('테스트 전제 위반');
    player.funds = offer.price + 1_000;
    const horseBefore = funded.horses[offer.horseId];
    if (horseBefore === undefined) throw new Error('테스트 전제 위반');
    const trainerBefore = horseBefore.trainerId;
    const sellerAiBefore = funded.economy.currentYear.aiTotals.private_sale ?? 0;
    const relationBefore = relationOf(funded, ownerRelationKey(sellerId));

    const result = acceptPrivateOffer(funded, offer.id);
    if (!result.ok) throw new Error(`수락 실패: ${result.error}`);
    const next = result.state;

    const nextPlayer = next.owners[next.playerOwnerId];
    const nextSeller = next.owners[sellerId];
    const horse = next.horses[offer.horseId];
    expect(nextPlayer?.funds).toBe(1_000);
    expect(nextSeller?.funds).toBe(seller.funds + offer.price);
    expect(next.economy.playerLedger.at(-1)).toMatchObject({
      category: 'private_sale',
      amount: -offer.price,
      horseId: offer.horseId,
    });
    expect(next.economy.currentYear.player.private_sale).toBe(-offer.price);
    expect(next.economy.currentYear.aiTotals.private_sale ?? 0).toBe(sellerAiBefore + offer.price);

    expect(horse?.ownerId).toBe(next.playerOwnerId);
    expect(horse?.trainerId).toBe(trainerBefore);
    expect(nextPlayer?.horseIds).toContain(offer.horseId);
    expect(nextSeller?.horseIds).not.toContain(offer.horseId);

    expect(relationOf(next, ownerRelationKey(sellerId))).toBe(relationBefore + OWNER_RELATION_PRIVATE_PURCHASE);
    expect(next.sales.privateOffers.map((o) => o.id)).not.toContain(offer.id);
    expect(result.events).toContainEqual({
      type: 'private_offer',
      offerId: offer.id,
      ownerId: sellerId,
      horseId: offer.horseId,
      price: offer.price,
      change: 'accepted',
      date: { year: START_YEAR, week: DATE_WEEK },
    });
    expect(result.events).toContainEqual({
      type: 'horse_sold',
      horseId: offer.horseId,
      fromOwnerId: sellerId,
      toOwnerId: next.playerOwnerId,
      price: offer.price,
      date: { year: START_YEAR, week: DATE_WEEK },
    });
    // 입력 state 는 바뀌지 않는다
    expect(funded.horses[offer.horseId]?.ownerId).toBe(sellerId);
    expect(funded.owners[funded.playerOwnerId]?.funds).toBe(offer.price + 1_000);
  });

  it('17. 자금이 부족하면 insufficient_funds, 입력은 그대로다', () => {
    const { state, offer } = withOffer(30);
    const poor = structuredClone(state);
    const player = poor.owners[poor.playerOwnerId];
    if (player === undefined) throw new Error('테스트 전제 위반');
    player.funds = offer.price - 1;
    const result = acceptPrivateOffer(poor, offer.id);
    expect(result).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(poor.sales.privateOffers.map((o) => o.id)).toContain(offer.id);
  });

  it('18. 없는 제안은 offer_not_found', () => {
    const { state } = withOffer(30);
    expect(acceptPrivateOffer(state, 'po_none')).toEqual({ ok: false, error: 'offer_not_found' });
  });

  it('19. 이미 출주한 말이면 offer_invalid 이고 제안은 남는다', () => {
    const { state, offer } = withOffer(30);
    const started = structuredClone(state);
    const horse = started.horses[offer.horseId];
    if (horse === undefined) throw new Error('테스트 전제 위반');
    horse.record.starts = 1;
    expect(acceptPrivateOffer(started, offer.id)).toEqual({ ok: false, error: 'offer_invalid' });
    expect(started.sales.privateOffers.map((o) => o.id)).toContain(offer.id);
  });

  it('20. 유효 기간이 지났으면 offer_invalid', () => {
    const { state, offer } = withOffer(30);
    const late = structuredClone(state);
    late.date = { year: START_YEAR, week: offer.expiresWeek + 1 };
    expect(acceptPrivateOffer(late, offer.id)).toEqual({ ok: false, error: 'offer_invalid' });
  });

  it('21. 거절: 제안 삭제, declined 이벤트, 관계 변화 없음. 없는 제안은 offer_not_found', () => {
    const { state, sellerId, offer } = withOffer(30);
    const relationBefore = relationOf(state, ownerRelationKey(sellerId));
    const result = declinePrivateOffer(state, offer.id);
    if (!result.ok) throw new Error('거절 실패');
    expect(result.state.sales.privateOffers.map((o) => o.id)).not.toContain(offer.id);
    expect(relationOf(result.state, ownerRelationKey(sellerId))).toBe(relationBefore);
    expect(result.events).toEqual([
      {
        type: 'private_offer',
        offerId: offer.id,
        ownerId: sellerId,
        horseId: offer.horseId,
        price: offer.price,
        change: 'declined',
        date: { year: START_YEAR, week: DATE_WEEK },
      },
    ]);
    expect(declinePrivateOffer(state, 'po_none')).toEqual({ ok: false, error: 'offer_not_found' });
  });
});

describe('내부거래 화면 목록과 동행 검사', () => {
  it('22. 화면 목록은 추정 범위만 주고 가치 원값 필드는 없다', () => {
    const { state, offer } = withOffer(30);
    const rows = privateOfferView(state);
    expect(rows.length).toBe(1);
    const row = rows[0];
    if (row === undefined) throw new Error('테스트 전제 위반');
    expect(Object.keys(row).sort()).toEqual([
      'age',
      'estimate',
      'expiresWeek',
      'expiresYear',
      'horseId',
      'horseName',
      'kind',
      'offerId',
      'orBand',
      'ownerId',
      'ownerName',
      'price',
      'record',
      'sex',
      'sireId',
      'source',
    ]);
    expect(row.offerId).toBe(offer.id);
    expect(row.age).toBe(2);
    expect(row.price).toBe(offer.price);
    expect(row.estimate.low).toBeLessThanOrEqual(row.estimate.high);
    // M7-G1: 출처 없는 옛 제안은 관계 제안, 2세 말, 레이팅 구간은 원값 없이 폭만 준다
    expect(row.source).toBe('relation');
    expect(row.kind).toBe('two_year_old');
    const horseRow = state.horses[offer.horseId];
    if (horseRow === undefined) throw new Error('테스트 전제 위반: 말 없음');
    const band = row.orBand;
    if (horseRow.officialRating === null) {
      expect(band).toBeNull();
    } else {
      if (band === null) throw new Error('테스트 전제 위반: 레이팅 구간 없음');
      expect(band.high - band.low).toBe(PRIVATE_OR_BAND_WIDTH);
      expect(horseRow.officialRating).toBeGreaterThanOrEqual(band.low);
      expect(horseRow.officialRating).toBeLessThan(band.high);
    }
    expect(row.record).toEqual({
      starts: horseRow.record.starts,
      wins: horseRow.record.wins,
      groupWins: horseRow.record.groupWins,
      lastPosition: null,
    });
  });

  it('23. 동행 검사: 관계 100 조교사는 소견을 받고, 자격 없는 조교사는 not_eligible, 없는 제안은 offer_not_found', () => {
    const { state, offer } = withOffer(30);
    const trainers = Object.keys(state.trainers).sort();
    const eligible = new Set(eligibleInspectors(state).map((i) => i.trainerId));
    const outsider = trainers.find((t) => !eligible.has(t));
    const insider = trainers[0];
    if (outsider === undefined || insider === undefined) throw new Error('테스트 전제 위반: 조교사 부족');

    expect(inspectOfferHorse(state, offer.id, outsider)).toEqual({ ok: false, error: 'not_eligible' });
    expect(inspectOfferHorse(state, 'po_none', insider)).toEqual({ ok: false, error: 'offer_not_found' });

    const trusted = structuredClone(state);
    adjustRelation(trusted, relationKey('trainer', insider), 100);
    const first = inspectOfferHorse(trusted, offer.id, insider);
    expect(first.ok).toBe(true);
    expect(inspectOfferHorse(trusted, offer.id, insider)).toEqual(first);
  });
});

// ── 4. AI 생산마 1착 관계 (applyRaceResult) ─────────────────

describe('플레이어 말이 AI 마주 생산마로 우승하면 생산 마주 관계가 오른다', () => {
  function breederRelation(state: GameState, breederId: string): number {
    return relationOf(state, relationKey('owner', breederId));
  }

  it('24. AI 마주 생산마 1착(일반): 그 마주 관계 +2', () => {
    const aiBreeder = aiOwnerIds(BASE)[0] ?? '';
    const racer = playerRacer(BASE, aiBreeder);
    const order = [racer.horseId, ...opponentsOf(racer.state, 2)];
    const before = breederRelation(racer.state, aiBreeder);
    const after = runRace(racer.state, order, null);
    expect(breederRelation(after, aiBreeder)).toBe(before + OWNER_RELATION_BRED_WIN);
  });

  it('25. AI 마주 생산마 G1 1착: 그 마주 관계 +5', () => {
    const aiBreeder = aiOwnerIds(BASE)[0] ?? '';
    const racer = playerRacer(BASE, aiBreeder);
    const order = [racer.horseId, ...opponentsOf(racer.state, 2)];
    const before = breederRelation(racer.state, aiBreeder);
    const after = runRace(racer.state, order, 'G1');
    expect(breederRelation(after, aiBreeder)).toBe(before + OWNER_RELATION_BRED_G1_WIN);
  });

  it('26. AI 마주 생산마라도 2착이면 변화 없음', () => {
    const aiBreeder = aiOwnerIds(BASE)[0] ?? '';
    const racer = playerRacer(BASE, aiBreeder);
    const [first, ...rest] = [...opponentsOf(racer.state, 2)];
    if (first === undefined) throw new Error('테스트 전제 위반');
    const order = [first, racer.horseId, ...rest];
    const before = breederRelation(racer.state, aiBreeder);
    const after = runRace(racer.state, order, null);
    expect(breederRelation(after, aiBreeder)).toBe(before);
  });

  it('27. 상업 생산자 생산마 1착이면 관계 변화 없음(관계 키를 만들지 않는다)', () => {
    const breederId = Object.keys(BASE.breeders).sort()[0];
    if (breederId === undefined) throw new Error('테스트 전제 위반: 상업 생산자 없음');
    const racer = playerRacer(BASE, breederId);
    const order = [racer.horseId, ...opponentsOf(racer.state, 2)];
    const after = runRace(racer.state, order, null);
    expect(after.relations.values[relationKey('owner', breederId)]).toBeUndefined();
  });

  it('28. 플레이어 생산마 1착이면 플레이어 관계는 바뀌지 않는다', () => {
    const racer = playerRacer(BASE, BASE.playerOwnerId);
    const order = [racer.horseId, ...opponentsOf(racer.state, 2)];
    const before = breederRelation(racer.state, BASE.playerOwnerId);
    const after = runRace(racer.state, order, null);
    expect(breederRelation(after, BASE.playerOwnerId)).toBe(before);
  });
});

// ── 5. 기본 진행 회귀 ─────────────────────────────────────

describe('제안이 없는 기본 진행은 이 시스템 전과 같다', () => {
  it(
    '29. 시드 20261011, 관계 0·명성 10: 26주 진행에서 관계 제안은 생기지 않고, 내부거래·시장을 뺀 진행과 세계가 같다(시장 매물 칸 제외)',
    () => {
      const systems = createGameSystems(FULL_GAME);
      const withoutPrivate = systems.filter((s) => s.id !== 'private_trade' && s.id !== 'private_market');
      const run = (list: typeof systems): GameState => {
        let current = fresh();
        for (let i = 0; i < 26; i++) current = advanceWeek(current, list).state;
        return current;
      };
      const full = run(systems);
      const baseline = run(withoutPrivate);
      // 시장 매물(source 'market')은 M7-G1 이 추가한 것이라 이 비교에서 뺀다. 관계 제안은 0건이어야 한다
      expect(full.sales.privateOffers.filter((o) => o.source !== 'market')).toEqual([]);
      const masked = (s: GameState): GameState => ({
        ...s,
        sales: { ...s.sales, privateOffers: [], nextPrivateOfferNo: 1 },
        eventLog: s.eventLog.filter((e) => e.type !== 'private_offer'),
      });
      expect(masked(full)).toEqual(masked(baseline));
    },
    HEAVY_TIMEOUT,
  );
});
