import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { bookCovering } from '../../src/engine/breeding/season';
import { LEGACY_BANKRUPT_WEEKS } from '../../src/engine/config/economy';
import { loadRacecourses } from '../../src/engine/course/load';
import { canSpendDiscretionary, createSolvencySystem, distressPrice } from '../../src/engine/economy/solvency';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import { weeksBetween } from '../../src/engine/time/calendar';
import type {
  EconomyMode,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  HorseStatus,
  Owner,
  OwnerId,
  Racecourse,
  RaceTemplate,
  SeriesDefinition,
  WeeklySystem,
} from '../../src/engine/types';

const SEED = 20261012;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SEASON_WEEKS = 52;
const THREE_SEASONS = 3 * SEASON_WEEKS;
/** 무거운 진행 테스트용 제한 시간(ms) */
const HEAVY_TIMEOUT = 300_000;
const MID_TIMEOUT = 120_000;
const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const POINTS_ID = 'test-points';
const POINTS_BONUS = 50_000;

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);

function layoutOf(courseId: string, distance: number): string {
  const course = COURSES.find((c) => c.id === courseId);
  const cd = course?.distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`fixture 에 ${courseId} ${distance}m 없음`);
  return cd.layoutId;
}

/** 테스트용 G1 템플릿(가상 이름) */
function g1Template(id: string, courseId: string, distance: number, schedule: RaceTemplate['schedule'], name: string): RaceTemplate {
  return {
    id,
    name,
    racecourseId: courseId,
    distance,
    layoutId: layoutOf(courseId, distance),
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
      baseWeightLb: 126,
    },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
    schedule,
    cardOrder: 1,
    tags: ['classic'],
  };
}

const TEMPLATES: RaceTemplate[] = [
  g1Template(G1_A_ID, 'ashcombe', 2012, { month: 4, weekOfMonth: 2 }, 'Test Group One Ashcombe'),
  g1Template(G1_B_ID, 'saint_ourens', 2000, { month: 6, weekOfMonth: 1 }, 'Test Group One Saint'),
];

const SEASON_SERIES: SeriesDefinition[] = [
  {
    id: POINTS_ID,
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: POINTS_BONUS,
  },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SEASON_SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SEASON_SERIES,
};

const WORLD_DATA: WorldStaticData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
};

type WarningEvent = Extract<GameEvent, { type: 'economy_warning' }>;

function warningsOf(events: readonly GameEvent[]): WarningEvent[] {
  return events.filter((e): e is WarningEvent => e.type === 'economy_warning');
}

function ownerOf(state: GameState, id: OwnerId): Owner {
  const owner = state.owners[id];
  if (owner === undefined) throw new Error(`테스트 전제: 마주 ${id} 없음`);
  return owner;
}

/** 플레이어만 있는 새 게임(빠름). 모드 지정 */
function playerGame(mode: EconomyMode, seed = SEED): GameState {
  return createNewGame({ seed, playerName: 'Test Owner', silks: { ...SILKS }, economyMode: mode });
}

/** 판정 시스템만 돌리는 진행(날짜만 1주씩 간다) */
const SOLVENCY_ONLY: readonly WeeklySystem[] = [createSolvencySystem()];

/** 2026년 10주, 플레이어 암말 1두, 종마 1두가 있는 교배 가능 상태 */
function bookable(): { state: GameState; mareId: HorseId; stallionId: HorseId } {
  const base = createNewGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } });
  const world = bootstrapWorld(base, WORLD_DATA, createRng(SEED));
  const state = structuredClone(world);
  state.date = { year: 2026, week: 10 };
  const mareId = ownerOf(state, state.playerOwnerId).horseIds.find((h) => state.mares[h] !== undefined);
  const stallionId = Object.keys(state.stallions).sort()[0];
  if (mareId === undefined || stallionId === undefined) throw new Error('테스트 전제: 암말·종마가 있어야 한다');
  return { state, mareId, stallionId };
}

let CASUAL_BASE: GameState;

beforeAll(() => {
  CASUAL_BASE = bootstrapGame(
    { seed: SEED, playerName: 'Test Owner', silks: { ...SILKS }, economyMode: 'casual' },
    BOOT_DATA,
  );
}, MID_TIMEOUT);

/** 정렬된 AI 마주 ID */
function aiOwnerIds(state: GameState): OwnerId[] {
  return Object.keys(state.owners).sort().filter((id) => id !== state.playerOwnerId);
}

// ── 캐주얼 모드 ─────────────────────────────────────────────────

describe('캐주얼: 음수 자금은 빚으로 옮긴다', () => {
  it('자금 -30,000 → 자금 0, 빚 30,030(같은 주 이자 30 포함), 빚 시작 경고 1회(weeksLeft null)', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = -30_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    const player = ownerOf(r.state, r.state.playerOwnerId);
    expect(player.funds).toBe(0);
    expect(r.state.economy.debt).toBe(30_030);
    expect(r.state.economy.negativeWeeks).toBe(0);
    expect(r.state.economy.bankrupt).toBe(false);

    const warnings = warningsOf(r.events);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'debt_started', weeksLeft: null });
  });

  it('빚 이동 자체는 장부에 남지 않는다(수입·지출 항목 없음)', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = -30_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    expect(r.state.economy.playerLedger.some((e) => e.category === 'other')).toBe(false);
    expect(r.state.economy.playerLedger.some((e) => e.amount === -30_000)).toBe(false);
  });
});

describe('캐주얼: 이자', () => {
  it('빚이 있으면 매주 round(빚 × 0.001) 이 빚에 더해지고 장부에 interest 로 남는다(자금은 그대로)', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = 0;
    s.economy.debt = 100_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    expect(r.state.economy.debt).toBe(100_100);
    expect(ownerOf(r.state, r.state.playerOwnerId).funds).toBe(ownerOf(s, s.playerOwnerId).funds);

    const interest = r.state.economy.playerLedger.filter((e) => e.category === 'interest');
    expect(interest).toHaveLength(1);
    expect(interest[0]).toMatchObject({ amount: -100, horseId: null });
    expect(r.state.economy.currentYear.player.interest).toBe(-100);
  });

  it('빚이 없으면 이자도 장부 항목도 없다', () => {
    const s = playerGame('casual');
    const r = advanceWeek(s, SOLVENCY_ONLY);
    expect(r.state.economy.debt).toBe(0);
    expect(r.state.economy.playerLedger).toHaveLength(0);
  });
});

describe('캐주얼: 자동 상환', () => {
  it('자금이 버퍼(50,000)를 넘으면 넘는 만큼 빚을 갚는다(장부에 남기지 않음)', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = 60_000;
    s.economy.debt = 100_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    // 이자 100 → 빚 100,100, 상환 min(100,100, 60,000 − 50,000) = 10,000
    expect(r.state.economy.debt).toBe(90_100);
    expect(ownerOf(r.state, r.state.playerOwnerId).funds).toBe(50_000);
    expect(r.state.economy.playerLedger.filter((e) => e.category === 'other')).toHaveLength(0);
  });

  it('여유가 충분하면 빚 전액을 갚고 빚은 0 이 된다', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = 80_000;
    s.economy.debt = 20_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    // 이자 20 → 빚 20,020, 상환 min(20,020, 30,000) = 20,020
    expect(r.state.economy.debt).toBe(0);
    expect(ownerOf(r.state, r.state.playerOwnerId).funds).toBe(59_980);
  });

  it('자금이 버퍼 이하면 상환하지 않는다', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = 50_000;
    s.economy.debt = 20_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    expect(r.state.economy.debt).toBe(20_020);
    expect(ownerOf(r.state, r.state.playerOwnerId).funds).toBe(50_000);
  });
});

describe('캐주얼: 경고는 빚이 0 에서 처음 생길 때만', () => {
  it('빚이 이미 있을 때 다시 음수가 되어도 빚 시작 경고를 또 내지 않는다', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = -5_000;
    const first = advanceWeek(s, SOLVENCY_ONLY);
    expect(warningsOf(first.events)).toHaveLength(1);

    const again = structuredClone(first.state);
    ownerOf(again, again.playerOwnerId).funds = -7_000;
    const second = advanceWeek(again, SOLVENCY_ONLY);
    expect(warningsOf(second.events)).toHaveLength(0);
    expect(second.state.economy.debt).toBeGreaterThan(first.state.economy.debt);
  });
});

describe('캐주얼: 임의 지출 제한', () => {
  it('canSpendDiscretionary: 빚이 있으면 자금이 충분해도 false, 없으면 자금 ≥ 금액', () => {
    const s = playerGame('casual');
    ownerOf(s, s.playerOwnerId).funds = 100_000;
    expect(canSpendDiscretionary(s, 50_000)).toBe(true);
    expect(canSpendDiscretionary(s, 200_000)).toBe(false);
    s.economy.debt = 1;
    expect(canSpendDiscretionary(s, 50_000)).toBe(false);
  });

  it('교배 예약: 빚이 있으면 insufficient_funds (자금이 종부료보다 많아도)', () => {
    const { state, mareId, stallionId } = bookable();
    const fee = state.stallions[stallionId]?.fee ?? 0;
    const funded = structuredClone(state);
    ownerOf(funded, funded.playerOwnerId).funds = fee + 100_000;
    expect(bookCovering(funded, funded.playerOwnerId, mareId, stallionId).ok).toBe(true);

    const indebted = structuredClone(funded);
    indebted.economy.debt = 1_000;
    const result = bookCovering(indebted, indebted.playerOwnerId, mareId, stallionId);
    expect(result).toEqual({ ok: false, error: 'insufficient_funds' });
  });
});

// ── 레거시 모드 ─────────────────────────────────────────────────

describe('레거시: 음수 주 경고와 파산', () => {
  it('음수 첫 주 경고(weeksLeft 11), 그 뒤 4주마다 경고(7, 3), 12주 연속이면 파산 이벤트', () => {
    let s = playerGame('legacy');
    ownerOf(s, s.playerOwnerId).funds = -1_000;

    const warningWeeks: { week: number; weeksLeft: number | null }[] = [];
    let bankruptWeek: number | null = null;
    for (let week = 1; week <= LEGACY_BANKRUPT_WEEKS; week++) {
      const r = advanceWeek(s, SOLVENCY_ONLY);
      s = r.state;
      for (const w of warningsOf(r.events)) {
        expect(w.kind).toBe('negative_funds');
        warningWeeks.push({ week, weeksLeft: w.weeksLeft });
      }
      if (r.events.some((e) => e.type === 'bankrupt')) bankruptWeek = week;
    }

    expect(warningWeeks).toEqual([
      { week: 1, weeksLeft: 11 },
      { week: 5, weeksLeft: 7 },
      { week: 9, weeksLeft: 3 },
    ]);
    expect(bankruptWeek).toBe(LEGACY_BANKRUPT_WEEKS);
    expect(s.economy.bankrupt).toBe(true);
    expect(s.economy.negativeWeeks).toBe(LEGACY_BANKRUPT_WEEKS);
    expect(s.economy.debt).toBe(0);
  });

  it('레거시는 빚으로 옮기지 않는다(자금은 음수 그대로)', () => {
    const s = playerGame('legacy');
    ownerOf(s, s.playerOwnerId).funds = -1_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    expect(ownerOf(r.state, r.state.playerOwnerId).funds).toBe(-1_000);
    expect(r.state.economy.debt).toBe(0);
  });

  it('파산 뒤 advanceWeek 는 날짜·상태를 바꾸지 않고 빈 이벤트를 돌려준다', () => {
    let s = playerGame('legacy');
    ownerOf(s, s.playerOwnerId).funds = -1_000;
    for (let i = 0; i < LEGACY_BANKRUPT_WEEKS; i++) s = advanceWeek(s, SOLVENCY_ONLY).state;
    expect(s.economy.bankrupt).toBe(true);

    const date = { ...s.date };
    const r = advanceWeek(s);
    expect(r.events).toEqual([]);
    expect(r.state.date).toEqual(date);
    expect(r.state).toEqual(s);
  });

  it('회복하면 음수 연속 주 수가 0 으로 리셋되고, 다시 음수가 되면 첫 주 경고부터 다시 센다', () => {
    let s = playerGame('legacy');
    ownerOf(s, s.playerOwnerId).funds = -1_000;
    for (let i = 0; i < 6; i++) s = advanceWeek(s, SOLVENCY_ONLY).state;
    expect(s.economy.negativeWeeks).toBe(6);

    ownerOf(s, s.playerOwnerId).funds = 1_000;
    s = advanceWeek(s, SOLVENCY_ONLY).state;
    expect(s.economy.negativeWeeks).toBe(0);
    expect(s.economy.bankrupt).toBe(false);

    ownerOf(s, s.playerOwnerId).funds = -1_000;
    const r = advanceWeek(s, SOLVENCY_ONLY);
    expect(r.state.economy.negativeWeeks).toBe(1);
    expect(warningsOf(r.events)).toEqual([
      expect.objectContaining({ kind: 'negative_funds', weeksLeft: 11 }),
    ]);
  });

  it('canSpendDiscretionary: 레거시는 자금이 음수면 false, 아니면 자금 ≥ 금액', () => {
    const s = playerGame('legacy');
    ownerOf(s, s.playerOwnerId).funds = -1;
    expect(canSpendDiscretionary(s, 0)).toBe(false);
    ownerOf(s, s.playerOwnerId).funds = 100_000;
    expect(canSpendDiscretionary(s, 100_000)).toBe(true);
    expect(canSpendDiscretionary(s, 100_001)).toBe(false);
  });
});

// ── AI 급매 ─────────────────────────────────────────────────────

describe('AI 급매: 가격', () => {
  it('가격 = max(10,000, (평가값 − 40) × 1,500)', () => {
    expect(distressPrice(40)).toBe(10_000);
    expect(distressPrice(30)).toBe(10_000);
    expect(distressPrice(50)).toBe(15_000);
    expect(distressPrice(60)).toBe(30_000);
  });
});

/**
 * 급매 시나리오: 기본 상태의 AI 마주 두 명(판매자 A, 구매자 B 같은 나라)만 말을 가진다.
 * 판매자 A 는 자금 -50,000. 나머지 AI 마주는 자금 1,000(팔 일이 없게), B 는 5,000,000(가장 부유).
 */
function distressScenario(otherCountry = false): { state: GameState; sellerId: OwnerId; buyerId: OwnerId } {
  const s = structuredClone(CASUAL_BASE);
  const ids = aiOwnerIds(s);
  const sellerId = ids[0];
  const buyerId = ids[1];
  if (sellerId === undefined || buyerId === undefined) throw new Error('테스트 전제: AI 마주 2명 이상');
  const seller = ownerOf(s, sellerId);
  const buyer = ownerOf(s, buyerId);

  for (const id of ids) {
    const o = ownerOf(s, id);
    o.funds = 1_000;
    if (id !== sellerId && id !== buyerId && otherCountry) o.country = seller.country === 'FR' ? 'GB' : 'FR';
  }
  buyer.country = otherCountry ? (seller.country === 'FR' ? 'GB' : 'FR') : seller.country;
  seller.funds = -50_000;
  buyer.funds = 5_000_000;

  // 두 마주의 기존 말을 떼어 내고 테스트 말만 둔다
  for (const h of Object.values(s.horses)) {
    if (h.ownerId === sellerId || h.ownerId === buyerId) h.ownerId = null;
  }
  seller.horseIds = [];
  buyer.horseIds = [];

  const template = Object.values(s.horses)[0];
  if (template === undefined) throw new Error('테스트 전제: 말이 있어야 한다');
  const place = (id: string, owner: OwnerId, status: HorseStatus, or: number): void => {
    const h: Horse = { ...structuredClone(template), id, ownerId: owner, status, officialRating: or, breederId: null };
    s.horses[id] = h;
    ownerOf(s, owner).horseIds.push(id);
  };
  place('h-test-racer-a', sellerId, 'in_training', 70);
  place('h-test-racer-b', sellerId, 'resting', 55);
  place('h-test-broodmare', sellerId, 'broodmare', 30);
  return { state: s, sellerId, buyerId };
}

describe('AI 급매: 소유 이전·가격·장부', () => {
  it('자금 음수 AI 마주는 현역마 중 평가값이 가장 낮은 1두를 같은 나라 최부유 AI 마주에게 판다', () => {
    const { state, sellerId, buyerId } = distressScenario();
    const seller = ownerOf(state, sellerId);
    const buyer = ownerOf(state, buyerId);
    const trainerBefore = state.horses['h-test-racer-b']?.trainerId;
    const statusBefore = state.horses['h-test-racer-b']?.status;
    const sellerFunds = seller.funds;
    const buyerFunds = buyer.funds;

    const r = advanceWeek(state, SOLVENCY_ONLY);
    const after = r.state;

    // 번식마(OR 30)는 현역이 아니므로 제외. 현역 중 가장 낮은 OR 55 가 팔린다. 가격 (55 − 40) × 1,500 = 22,500
    expect(after.horses['h-test-racer-b']?.ownerId).toBe(buyerId);
    expect(after.horses['h-test-racer-a']?.ownerId).toBe(sellerId);
    expect(after.horses['h-test-broodmare']?.ownerId).toBe(sellerId);
    expect(ownerOf(after, sellerId).horseIds).not.toContain('h-test-racer-b');
    expect(ownerOf(after, buyerId).horseIds).toContain('h-test-racer-b');
    expect(after.horses['h-test-racer-b']?.trainerId).toBe(trainerBefore ?? null);
    expect(after.horses['h-test-racer-b']?.status).toBe(statusBefore);

    expect(ownerOf(after, sellerId).funds).toBe(sellerFunds + 22_500);
    expect(ownerOf(after, buyerId).funds).toBe(buyerFunds - 22_500);

    // AI 끼리의 거래는 이벤트로 남기지 않고, 올해 AI 합계에서는 0 으로 상쇄된다
    expect(r.events.some((e) => e.type === 'horse_sold')).toBe(false);
  });

  it('같은 나라 구매자가 없으면 팔지 않는다', () => {
    const { state, sellerId } = distressScenario(true);
    const r = advanceWeek(state, SOLVENCY_ONLY);
    expect(r.state.horses['h-test-racer-b']?.ownerId).toBe(sellerId);
    expect(ownerOf(r.state, sellerId).funds).toBe(-50_000);
  });

  it('같은 입력이면 같은 결과다(결정성)', () => {
    const a = advanceWeek(distressScenario().state, SOLVENCY_ONLY).state;
    const b = advanceWeek(distressScenario().state, SOLVENCY_ONLY).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── 시드 재현·저장 왕복 ─────────────────────────────────────────

describe('재현성과 저장 왕복', () => {
  it('같은 시드·같은 입력이면 여러 주 진행 결과가 같다(빚 경로 포함)', () => {
    const systems = createGameSystems(STATIC_GAME);
    const start = structuredClone(CASUAL_BASE);
    ownerOf(start, start.playerOwnerId).funds = -20_000;
    const run = (): GameState => {
      let s = structuredClone(start);
      for (let i = 0; i < 12; i++) s = advanceWeek(s, systems).state;
      return s;
    };
    const a = run();
    const b = run();
    expect(a.economy.debt).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, MID_TIMEOUT);

  it('빚·파산·경고 상태가 저장 후 복원되면 같다', () => {
    const indebted = playerGame('casual');
    indebted.economy.debt = 12_345;
    indebted.economy.negativeWeeks = 0;
    const back = deserializeGame(serializeGame(indebted, '2026-10-12T00:00:00.000Z'));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state).toEqual(indebted);

    let legacy = playerGame('legacy');
    ownerOf(legacy, legacy.playerOwnerId).funds = -1_000;
    for (let i = 0; i < LEGACY_BANKRUPT_WEEKS; i++) legacy = advanceWeek(legacy, SOLVENCY_ONLY).state;
    const back2 = deserializeGame(serializeGame(legacy, '2026-10-12T00:00:00.000Z'));
    expect(back2.ok).toBe(true);
    if (back2.ok) {
      expect(back2.state.economy.bankrupt).toBe(true);
      expect(back2.state).toEqual(legacy);
    }
  });
});

// ── 3시즌 측정(수용 기준 2·3) ───────────────────────────────────

describe('3시즌 무행동 진행 측정', () => {
  it('캐주얼: 빚 경로가 진행을 멈추지 않는다, AI 급매 횟수·AI 음수 마주 수 측정', () => {
    const systems = createGameSystems(STATIC_GAME);
    let s = structuredClone(CASUAL_BASE);
    const startDate = { ...s.date };

    let debtStart: string | null = null;
    let sales = 0;
    const ownerOfHorse = (state: GameState): Map<HorseId, OwnerId | null> =>
      new Map(Object.entries(state.horses).map(([id, h]) => [id, h.ownerId]));
    let prevOwners = ownerOfHorse(s);
    const aiNegativeAtYearEnd: Record<number, number> = {};

    for (let i = 0; i < THREE_SEASONS; i++) {
      const r = advanceWeek(s, systems);
      s = r.state;
      for (const w of warningsOf(r.events)) {
        if (w.kind === 'debt_started' && debtStart === null) {
          debtStart = `${w.date.year}년 ${w.date.week}주`;
        }
      }
      const owners = ownerOfHorse(s);
      for (const [id, owner] of owners) {
        const before = prevOwners.get(id);
        if (before !== undefined && before !== null && owner !== null && owner !== before && owner !== s.playerOwnerId) {
          sales += 1;
        }
      }
      prevOwners = owners;
      if (r.events.some((e) => e.type === 'new_year')) {
        const year = s.date.year;
        aiNegativeAtYearEnd[year] = aiOwnerIds(s).filter((id) => ownerOf(s, id).funds < 0).length;
      }
    }

    const aiNegativeFinal = aiOwnerIds(s).filter((id) => ownerOf(s, id).funds < 0).length;
    const dateEnd = weeksBetween(startDate, s.date);
    console.log(
      `[M4-A3 측정 캐주얼 3시즌] 진행 ${dateEnd}주 · 파산 ${String(s.economy.bankrupt)} · 빚 시작 ${String(debtStart)} · 최종 빚 ${s.economy.debt} · 최종 자금(플레이어) ${ownerOf(s, s.playerOwnerId).funds} · AI 급매 ${sales}회 · AI 자금 음수 마주(3시즌 말) ${aiNegativeFinal}명 · 연도 말 AI 음수 ${JSON.stringify(aiNegativeAtYearEnd)}`,
    );

    expect(dateEnd).toBe(THREE_SEASONS);
    expect(s.economy.bankrupt).toBe(false);
  }, HEAVY_TIMEOUT);

  it('레거시: 무행동 3시즌의 파산 시점이 결정적이다(자금 음수 시작 주 → 파산 주)', () => {
    const systems = createGameSystems(STATIC_GAME);
    const base = bootstrapGame(
      { seed: SEED, playerName: 'Test Owner', silks: { ...SILKS }, economyMode: 'legacy' },
      BOOT_DATA,
    );
    let s = structuredClone(base);
    const startDate = { ...s.date };
    let firstNegative: { year: number; week: number } | null = null;
    let bankrupt: { year: number; week: number } | null = null;
    for (let i = 0; i < THREE_SEASONS; i++) {
      const r = advanceWeek(s, systems);
      s = r.state;
      const first = warningsOf(r.events).find((w) => w.kind === 'negative_funds');
      if (first !== undefined && firstNegative === null && s.economy.negativeWeeks === 1) {
        firstNegative = { ...first.date };
      }
      if (r.events.some((e) => e.type === 'bankrupt')) bankrupt = { ...s.date };
      if (bankrupt !== null) break;
    }

    console.log(
      `[M4-A3 측정 레거시 3시즌] 자금 음수 시작 ${firstNegative === null ? '없음' : `${firstNegative.year}년 ${firstNegative.week}주`} · 파산 ${bankrupt === null ? '없음' : `${bankrupt.year}년 ${bankrupt.week}주`} · 최종 날짜 ${s.date.year}년 ${s.date.week}주 · 시작 ${startDate.year}년 ${startDate.week}주`,
    );

    if (firstNegative !== null && bankrupt !== null) {
      expect(weeksBetween(firstNegative, bankrupt)).toBe(LEGACY_BANKRUPT_WEEKS - 1);
    }
    expect(s.economy.mode).toBe('legacy');
  }, HEAVY_TIMEOUT);
});
