import { describe, expect, it } from 'vitest';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  RIVAL_INTENSITY_CLASH,
  RIVAL_INTENSITY_DECAY,
  RIVAL_INTENSITY_START,
  RIVAL_MAX_ACTIVE,
  RIVAL_SALE_BATTLE_MIN,
} from '../../src/engine/config/rivals';
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
import { createRivalsSystem, rivalViews } from '../../src/engine/legacy/rivals';
import { appendChronicle } from '../../src/engine/legacy/chronicle';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { addWeeks } from '../../src/engine/time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseStatus,
  Owner,
  OwnerId,
  RaceResult,
  RaceTemplate,
  Rival,
  SaleCatalogue,
  SaleLot,
} from '../../src/engine/types';

const OPTIONS = {
  seed: 20261016,
  playerName: '구름들 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const },
};
const templates = getRaceTemplates();
/** 대레이스(G1 클래식) · 그룹(G2/G3) · 비그룹 한 가지 */
const g1Classic = templates.find((t) => t.grade === 'G1' && t.tags.includes('classic'))!;
const group = templates.find((t) => t.grade === 'G2' || t.grade === 'G3')!;
const plain = templates.find((t) => t.grade === null)!;
const sale = getSalesData().events[0]!;

function fresh(): GameState {
  return createNewGame(OPTIONS);
}

/** 가상 마주 추가(horseIds 는 호출자가 채운다) */
function addOwner(state: GameState, id: OwnerId, country: Owner['country'], tier: Owner['tier']): Owner {
  const owner = {
    id, name: `가상 마주 ${id}`, country, isPlayer: false, silks: state.owners[state.playerOwnerId]!.silks,
    funds: 1_000_000, studName: null, retainedJockeyId: null, horseIds: [], tier,
    persona: { commercial: 0.5, prestige: 0.5, patience: 0.5 }, namePrefix: null,
  } as Owner;
  state.owners[id] = owner;
  return owner;
}

/** 말 추가(소유 마주가 있으면 horseIds 에도 넣는다) */
function addHorse(state: GameState, id: string, ownerId: OwnerId, status: HorseStatus = 'in_training', earnings = 0): Horse {
  const horse = {
    id, name: id, ownerId, breederId: null, status,
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings, blackTypePlacings: 0, groupWins: 0 },
  } as unknown as Horse;
  state.horses[id] = horse;
  state.owners[ownerId]?.horseIds.push(id);
  return horse;
}

/** 플레이어가 현역마를 가진 상태 + AI 마주 셋 */
function withBusiness(): GameState {
  const state = fresh();
  addHorse(state, 'p1', state.playerOwnerId, 'in_training', 50_000);
  addOwner(state, 'ai_a', 'GB', 'mid');
  addHorse(state, 'a1', 'ai_a', 'in_training', 20_000);
  addOwner(state, 'ai_b', 'FR', 'major');
  addHorse(state, 'b1', 'ai_b', 'in_training', 300_000);
  addOwner(state, 'ai_c', 'GB', 'small');
  addHorse(state, 'c1', 'ai_c', 'resting', 5_000);
  return state;
}

function rival(ownerId: OwnerId, patch: Partial<Rival> = {}): Rival {
  return { ownerId, since: 2026, reason: 'same_tier', playerAhead: 0, rivalAhead: 0, intensity: 40, active: true, ...patch };
}

function run(state: GameState, date: GameDate, seed = 1): GameEvent[] {
  return createRivalsSystem().run(state, { date: { ...date }, rng: createRng(seed) });
}

/** 한 레이스 결과. placings = [말 id, 착순] */
function raceResult(template: RaceTemplate, date: GameDate, placings: [string, number][]): RaceResult {
  return {
    raceId: template.id,
    racecourseId: template.racecourseId,
    date: { ...date },
    going: 'good',
    distance: template.distance,
    seed: 1,
    winningTime: 0,
    sectionalMarks: [],
    runners: placings.map(([horseId, position], index) => ({
      runnerIndex: index, horseId, saddleCloth: index + 1, draw: 1, jockeyId: 'jockey', weightLb: 0,
      position, finishTime: 0, margin: null, beatenLengths: 0, sectionals: [], performanceFigure: 0, odds: null,
    })),
  } as unknown as RaceResult;
}

describe('라이벌 연초 선정', () => {
  it('같은 시드·같은 상태면 같은 마주를 고르고, 연초 1주를 두 번 돌려도 한 명만 지정한다', () => {
    const state = withBusiness();
    const a = structuredClone(state);
    const b = structuredClone(state);
    run(a, { year: 2027, week: 1 });
    run(b, { year: 2027, week: 1 });
    expect(a.rivals).toHaveLength(1);
    expect(a.rivals).toEqual(b.rivals);
    expect(a.rivals![0]).toMatchObject({ reason: 'same_tier', since: 2027, active: true, intensity: RIVAL_INTENSITY_START });
    run(a, { year: 2027, week: 1 });
    expect(a.rivals).toHaveLength(1);
  });

  it('선정은 독립 스트림을 쓰고 공용 ctx.rng 는 소비하지 않는다', () => {
    const state = withBusiness();
    const rng = createRng(9);
    const before = rng.getState();
    createRivalsSystem().run(state, { date: { year: 2027, week: 1 }, rng });
    expect(rng.getState()).toEqual(before);
    expect(state.rivals).toHaveLength(1);
  });

  it('플레이어에게 현역마나 번식 사업이 없으면 지정하지 않는다', () => {
    const state = withBusiness();
    delete state.horses['p1'];
    state.owners[state.playerOwnerId]!.horseIds = [];
    run(state, { year: 2027, week: 1 });
    expect(state.rivals).toBeUndefined();
  });

  it('활성 라이벌이 RIVAL_MAX_ACTIVE 명이면 더 고르지 않는다', () => {
    const state = withBusiness();
    state.rivals = [rival('ai_a'), rival('ai_b')];
    expect(RIVAL_MAX_ACTIVE).toBe(2);
    run(state, { year: 2027, week: 1 });
    expect(state.rivals.map((r) => r.ownerId)).toEqual(['ai_a', 'ai_b']);
    expect(state.rivals.every((r) => r.reason === 'same_tier' && r.since === 2026)).toBe(true);
  });

  it('연초 1주가 아니면 선정하지 않는다', () => {
    const state = withBusiness();
    run(state, { year: 2027, week: 2 });
    expect(state.rivals).toBeUndefined();
  });
});

describe('라이벌 계기', () => {
  it('대레이스에서 플레이어 말을 앞선 우승 마주를 big_race 라이벌로 지정하고 같은 레이스 맞대결을 한 번 센다', () => {
    const state = withBusiness();
    const date = { year: 2027, week: 20 };
    state.raceResults = [raceResult(g1Classic, date, [['b1', 1], ['p1', 3]])];
    const events = run(state, date);
    const found = state.rivals!.find((r) => r.ownerId === 'ai_b')!;
    expect(found).toMatchObject({ reason: 'big_race', since: 2027, active: true, playerAhead: 0, rivalAhead: 1 });
    expect(found.intensity).toBe(RIVAL_INTENSITY_START + RIVAL_INTENSITY_CLASH);
    expect(events).toEqual([
      { type: 'rival_declared', ownerId: 'ai_b', reason: 'big_race', date },
      { type: 'rival_clash', ownerId: 'ai_b', raceId: g1Classic.id, playerAhead: false, date },
    ]);
    expect(state.chronicle!.map((e) => e.kind)).toEqual(['rival_declared', 'rival_clash']);
    expect(state.chronicle![1]).toMatchObject({ ownerId: 'ai_b', raceId: g1Classic.id, count: 1, player: true });
  });

  it('플레이어 말이 이겼거나 플레이어 말이 없으면 big_race 후보가 아니다', () => {
    const won = withBusiness();
    won.raceResults = [raceResult(g1Classic, { year: 2027, week: 20 }, [['p1', 1], ['b1', 2]])];
    run(won, { year: 2027, week: 20 });
    expect(won.rivals ?? []).toEqual([]);
    const absent = withBusiness();
    absent.raceResults = [raceResult(g1Classic, { year: 2027, week: 20 }, [['b1', 1], ['a1', 2]])];
    run(absent, { year: 2027, week: 20 });
    expect(absent.rivals ?? []).toEqual([]);
  });

  it('자리가 찼으면 big_race 로 새 라이벌을 지정하지 않는다', () => {
    const state = withBusiness();
    state.rivals = [rival('ai_a'), rival('ai_c')];
    const date = { year: 2027, week: 20 };
    state.raceResults = [raceResult(g1Classic, date, [['b1', 1], ['p1', 2]])];
    const events = run(state, date);
    expect(state.rivals.map((r) => r.ownerId)).toEqual(['ai_a', 'ai_c']);
    expect(events.some((e) => e.type === 'rival_declared')).toBe(false);
  });

  it('플레이어가 기준 이상 입찰했다가 진 로트의 낙찰 마주를 sale_battle 로 지정하고, 그 로트가 열린 주에만 본다', () => {
    const state = fresh();
    addOwner(state, 'ai_s', 'GB', 'major');
    const year = 2027;
    const when = addWeeks({ year, week: sale.week }, sale.books[0]!.weekOffset);
    state.sales.catalogues = [catalogueWith(year, [soldLot(1, sale.books[0]!.book, 'ai_s', 60_000)])];
    state.sales.playerBids = [{ saleId: sale.id, year, lotNo: 1, maxBid: RIVAL_SALE_BATTLE_MIN }];
    run(structuredClone(state), addWeeks(when, 1));
    expect(state.rivals ?? []).toEqual([]);
    run(state, when);
    expect(state.rivals).toEqual([rival('ai_s', { since: 2027, reason: 'sale_battle', intensity: RIVAL_INTENSITY_START })]);
  });

  it('입찰 상한이 기준 미만이거나 플레이어가 낙찰했으면 sale_battle 이 아니다', () => {
    const year = 2027;
    const when = addWeeks({ year, week: sale.week }, sale.books[0]!.weekOffset);
    const low = fresh();
    addOwner(low, 'ai_s', 'GB', 'major');
    low.sales.catalogues = [catalogueWith(year, [soldLot(1, sale.books[0]!.book, 'ai_s', 60_000)])];
    low.sales.playerBids = [{ saleId: sale.id, year, lotNo: 1, maxBid: RIVAL_SALE_BATTLE_MIN - 1 }];
    run(low, when);
    expect(low.rivals ?? []).toEqual([]);
    const won = fresh();
    won.sales.catalogues = [catalogueWith(year, [soldLot(1, sale.books[0]!.book, won.playerOwnerId, 60_000)])];
    won.sales.playerBids = [{ saleId: sale.id, year, lotNo: 1, maxBid: 90_000 }];
    run(won, when);
    expect(won.rivals ?? []).toEqual([]);
  });
});

describe('그룹 레이스 맞대결 집계', () => {
  function withRival(intensity = 40): GameState {
    const state = withBusiness();
    state.rivals = [rival('ai_b', { intensity })];
    return state;
  }

  it('플레이어 말과 라이벌 말이 함께 나온 그룹 레이스를 착순으로 비교해 한 번 집계하고 이벤트·연대기를 남긴다', () => {
    const state = withRival();
    const date = { year: 2027, week: 10 };
    state.raceResults = [raceResult(group, date, [['b1', 1], ['p1', 2]])];
    const events = run(state, date);
    expect(state.rivals![0]).toMatchObject({ playerAhead: 0, rivalAhead: 1, intensity: 40 + RIVAL_INTENSITY_CLASH });
    expect(events).toEqual([{ type: 'rival_clash', ownerId: 'ai_b', raceId: group.id, playerAhead: false, date }]);
    expect(state.chronicle).toHaveLength(1);
    expect(state.chronicle![0]).toMatchObject({ kind: 'rival_clash', ownerId: 'ai_b', count: 1, horseId: 'p1' });
    run(state, date);
    expect(state.rivals![0]!.rivalAhead).toBe(1);
    expect(state.chronicle).toHaveLength(1);
  });

  it('플레이어 말이 앞서면 playerAhead 를 올린다', () => {
    const state = withRival();
    const date = { year: 2027, week: 11 };
    state.raceResults = [raceResult(group, date, [['p1', 1], ['b1', 3]])];
    const events = run(state, date);
    expect(state.rivals![0]).toMatchObject({ playerAhead: 1, rivalAhead: 0 });
    expect(events).toEqual([{ type: 'rival_clash', ownerId: 'ai_b', raceId: group.id, playerAhead: true, date }]);
  });

  it('동착은 앞선 쪽이 없으므로 집계·이벤트·연대기를 남기지 않는다', () => {
    const state = withRival();
    const date = { year: 2027, week: 12 };
    state.raceResults = [raceResult(group, date, [['p1', 1], ['b1', 1]])];
    const events = run(state, date);
    expect(state.rivals![0]).toMatchObject({ playerAhead: 0, rivalAhead: 0, intensity: 40 });
    expect(events).toEqual([]);
    expect(state.chronicle).toBeUndefined();
  });

  it('같은 레이스에 여러 두가 나오면 플레이어 최상위와 라이벌 최상위를 한 번만 비교한다', () => {
    const state = withRival();
    state.horses['p2'] = { ...state.horses['p1']!, id: 'p2' };
    state.owners[state.playerOwnerId]!.horseIds.push('p2');
    addHorse(state, 'b2', 'ai_b');
    const date = { year: 2027, week: 13 };
    state.raceResults = [raceResult(group, date, [['b1', 1], ['p1', 2], ['p2', 3], ['b2', 4]])];
    run(state, date);
    expect(state.rivals![0]).toMatchObject({ playerAhead: 0, rivalAhead: 1 });
    expect(state.chronicle!.filter((e) => e.kind === 'rival_clash')).toHaveLength(1);
  });

  it('비그룹 레이스는 맞대결이 아니다', () => {
    const state = withRival();
    const date = { year: 2027, week: 14 };
    state.raceResults = [raceResult(plain, date, [['b1', 1], ['p1', 2]])];
    const events = run(state, date);
    expect(state.rivals![0]).toMatchObject({ playerAhead: 0, rivalAhead: 0, intensity: 40 });
    expect(events).toEqual([]);
  });
});

describe('해마다 감소·비활성', () => {
  it('연초 1주에 경쟁심을 줄이고 0 이하가 되면 지난 라이벌로 남긴다', () => {
    const state = fresh();
    for (const id of ['ai_a', 'ai_b', 'ai_c'] as const) addOwner(state, id, 'GB', 'mid');
    state.rivals = [
      rival('ai_a', { intensity: 20 }),
      rival('ai_b', { intensity: RIVAL_INTENSITY_DECAY }),
      rival('ai_c', { intensity: 50 }),
    ];
    run(state, { year: 2027, week: 2 });
    expect(state.rivals.map((r) => r.intensity)).toEqual([20, RIVAL_INTENSITY_DECAY, 50]);
    run(state, { year: 2027, week: 1 });
    expect(state.rivals).toEqual([
      rival('ai_a', { intensity: 20 - RIVAL_INTENSITY_DECAY }),
      rival('ai_b', { intensity: 0, active: false }),
      rival('ai_c', { intensity: 50 - RIVAL_INTENSITY_DECAY }),
    ]);
    expect(rivalViews(state).map((v) => [v.ownerId, v.active])).toEqual([['ai_a', true], ['ai_c', true], ['ai_b', false]]);
  });

  it('마주가 사라지면 그 주에 비활성으로 두고 기록은 지우지 않는다', () => {
    const state = fresh();
    state.rivals = [rival('ai_gone', { intensity: 30 })];
    run(state, { year: 2027, week: 5 });
    expect(state.rivals).toEqual([rival('ai_gone', { intensity: 30, active: false })]);
  });

  it('비활성 라이벌은 자리를 차지하지 않는다', () => {
    const state = withBusiness();
    state.rivals = [rival('ai_a', { active: false, intensity: 0 }), rival('ai_b', { active: false, intensity: 0 })];
    run(state, { year: 2027, week: 1 });
    expect(state.rivals.filter((r) => r.active).map((r) => r.reason)).toEqual(['same_tier']);
  });
});

describe('화면 조회 rivalViews', () => {
  it('활성 라이벌을 먼저, 마주 이름과 맞대결 연대기를 붙여 돌려준다', () => {
    const state = withBusiness();
    state.rivals = [rival('ai_a', { active: false, since: 2025 }), rival('ai_b', { since: 2027 }), rival('ai_gone')];
    appendChronicle(state, { kind: 'rival_clash', date: { year: 2027, week: 3 }, player: true, ownerId: 'ai_b', raceId: group.id, count: 2 });
    appendChronicle(state, { kind: 'rival_clash', date: { year: 2027, week: 9 }, player: true, ownerId: 'ai_a', raceId: group.id, count: 1 });
    const views = rivalViews(state);
    expect(views.map((v) => v.ownerId)).toEqual(['ai_b', 'ai_gone', 'ai_a']);
    expect(views[0]).toMatchObject({ name: '가상 마주 ai_b', country: 'FR', active: true });
    expect(views[0]!.clashes.map((c) => c.count)).toEqual([2]);
    expect(views[1]).toMatchObject({ name: null, country: null });
    expect(views[2]!.clashes).toHaveLength(1);
  });
});

describe('저장 왕복', () => {
  it('라이벌과 맞대결 연대기가 직렬화 뒤에도 같다', () => {
    const state = withBusiness();
    state.raceResults = [raceResult(group, { year: 2027, week: 10 }, [['b1', 1], ['p1', 2]])];
    state.rivals = [rival('ai_b', { intensity: 40 })];
    run(state, { year: 2027, week: 10 });
    const loaded = deserializeGame(serializeGame(state, '2027-01-01T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.rivals).toEqual(state.rivals);
    expect(loaded.state.chronicle).toEqual(state.chronicle);
  });
});

describe('라이벌 없는 게임과 공용 결과 불변', () => {
  const data = {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
    ...getPeopleData(),
    courses: getRacecourses(),
    templates,
    series: getSeriesDefinitions(),
    sales: getSalesData(),
  };

  it('플레이어 입찰·출주가 없으면 라이벌 시스템을 넣어도 레이스 결과·공용 RNG 가 매주 같다 (2시즌)', () => {
    let withRivals = bootstrapGame({ ...OPTIONS, economyMode: 'casual' }, data);
    withRivals.settings.autoApproveRacePlans = false;
    let without = structuredClone(withRivals);
    const systems = createGameSystems(data).filter((system) => system.id !== 'rivals');
    const at = systems.findIndex((s) => s.id === 'sales') + 1;
    const registered = [...systems.slice(0, at), createRivalsSystem(), ...systems.slice(at)];
    for (let week = 0; week < WEEKS_PER_YEAR * 2; week++) {
      const date = { ...withRivals.date };
      withRivals = advanceWeek(withRivals, registered).state;
      without = advanceWeek(without, systems).state;
      expect(withRivals.rng).toEqual(without.rng);
      const sameWeek = (r: RaceResult) => r.date.year === date.year && r.date.week === date.week;
      expect(withRivals.raceResults.filter(sameWeek)).toEqual(without.raceResults.filter(sameWeek));
    }
    expect(withRivals.raceResults).toEqual(without.raceResults);
    expect(withRivals.sales.catalogues).toEqual(without.sales.catalogues);
  }, 600_000);
});

function catalogueWith(year: number, lots: SaleLot[]): SaleCatalogue {
  return { saleId: sale.id, year, status: 'catalogued', lots };
}

function soldLot(lotNo: number, book: number, buyerId: OwnerId, price: number): SaleLot {
  return {
    lotNo, book, horseId: `lot${lotNo}`, horseName: `lot${lotNo}`, sireId: null,
    vendor: { kind: 'breeder', id: 'breeder_x' }, reserve: null, valuation: price, aiBids: [],
    result: { kind: 'sold', price, buyerId },
  } as SaleLot;
}
