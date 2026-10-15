import { expect, it } from 'vitest';
import * as dataSource from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { createStudBooksSystem } from '../../src/engine/stud/books';
import { reviewFee } from '../../src/engine/stud/market';
import {
  createStudFertilitySystem, observedRate, publicFertility, retirePlayerStallion,
} from '../../src/engine/stud/fertility';
import * as config from '../../src/engine/config/stud';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState, HorseId, StallionFertilitySeason, WeekContext, WeeklySystem } from '../../src/engine/types';

const data = {
  stallionRecords: dataSource.getStallionRecords(), stallionNames: dataSource.getStallionNames(),
  naming: dataSource.getNamingData(), nicks: dataSource.getNicks(), ...dataSource.getPeopleData(),
  courses: dataSource.getRacecourses(), templates: dataSource.getRaceTemplates(),
  series: dataSource.getSeriesDefinitions(), sales: dataSource.getSalesData(),
};

function boot(): GameState {
  return bootstrapGame({ seed: 20261015, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, data);
}

const sortedIds = (state: GameState): string[] => Object.keys(state.stallions).sort();

const ctxAt = (year: number, week: number): WeekContext => ({ date: { year, week }, rng: createRng(1) });

const season = (year: number, covers: number, conceptions: number): StallionFertilitySeason =>
  ({ year, covers, conceptions });

/** 소수 3자리 이하 값이 STEP 배수인지 확인 */
const onStep = (value: number): boolean => {
  const units = value / config.PUBLIC_FERTILITY_STEP;
  return Math.abs(units - Math.round(units)) < 1e-9;
};

it('공개 수태율: 기록 없음은 추정, 최근 세 시즌 합이 40두 이상이면 정확값, 미만이면 구간', () => {
  const state = boot();
  const id = sortedIds(state)[0]!;
  const sire = state.stallions[id]!;
  delete sire.fertilityHistory;
  sire.fertility = 0.85;
  expect(publicFertility(sire)).toEqual({ kind: 'estimate', rate: 0.85 });
  sire.fertility = 0.83;
  expect(publicFertility(sire)).toEqual({ kind: 'estimate', rate: 0.85 });

  // 최근 세 시즌만 합산한다: 앞선 1000두 기록은 빠져야 한다
  sire.fertilityHistory = [season(2020, 1000, 1000), season(2023, 30, 25), season(2024, 40, 30), season(2025, 30, 29)];
  expect(observedRate(sire.fertilityHistory, config.PUBLIC_FERTILITY_SEASONS)).toEqual({ covers: 100, conceptions: 84 });
  expect(publicFertility(sire)).toEqual({ kind: 'exact', rate: 0.84 });

  sire.fertilityHistory = [season(2025, 20, 14)];
  const shown = publicFertility(sire);
  expect(shown.kind).toBe('range');
  if (shown.kind !== 'range') return;
  expect(shown.low).toBeLessThanOrEqual(0.7);
  expect(shown.high).toBeGreaterThanOrEqual(0.7);
  expect(onStep(shown.low) && onStep(shown.high)).toBe(true);
  expect(shown.low).toBeGreaterThanOrEqual(0);
  expect(shown.high).toBeLessThanOrEqual(1);
});

it('저수태 판명은 첫 시즌 종마만 말별 스트림으로 판정하고, 판명 값은 0.35~0.55 이다', () => {
  const state = boot();
  const year = state.date.year;
  const ids = sortedIds(state).slice(0, 60);
  for (const id of ids) {
    state.horses[id]!.status = 'stud';
    state.stallions[id]!.firstSeasonYear = year;
  }
  // 첫 시즌이 아닌 종마는 스트림이 걸려도 판정하지 않는다
  const late = ids[0]!;
  state.stallions[late]!.firstSeasonYear = year - 1;
  const hitsOf = (seed: number): string[] => ids.filter((id) =>
    createRng(`${seed}:subfertile:${id}`).chance(config.SUBFERTILE_CHANCE));

  // late 종마가 걸리고 다른 첫 시즌 종마도 걸리는 시드를 고른다(결정적 탐색)
  let seed = 1;
  while (!(createRng(`${seed}:subfertile:${late}`).chance(config.SUBFERTILE_CHANCE)
    && hitsOf(seed).some((id) => id !== late))) {
    seed++;
    if (seed > 200_000) throw new Error('테스트용 시드를 찾지 못함');
  }
  state.initialSeed = seed;
  const before = structuredClone(state);
  const events = createStudFertilitySystem().run(state, ctxAt(year, config.SUBFERTILE_CHECK_WEEK));
  const hits = new Set(hitsOf(seed).filter((id) => id !== late));
  expect(hits.size).toBeGreaterThan(0);

  for (const id of Object.keys(state.stallions)) {
    const now = state.stallions[id]!.fertility;
    if (hits.has(id)) {
      expect(now).toBeGreaterThanOrEqual(config.SUBFERTILE_MIN);
      expect(now).toBeLessThanOrEqual(config.SUBFERTILE_MAX);
    } else {
      expect(now).toBe(before.stallions[id]!.fertility);
    }
  }
  expect(state.stallions[late]!.fertility).toBe(before.stallions[late]!.fertility);
  // 이벤트는 플레이어 또는 실명 종마에만 남는다
  for (const event of events) {
    expect(event.type).toBe('stallion_subfertile');
    if (event.type === 'stallion_subfertile') expect(hits.has(event.stallionId)).toBe(true);
  }
  // 같은 시드는 같은 결과
  const again = createStudFertilitySystem().run(structuredClone(before), ctxAt(year, config.SUBFERTILE_CHECK_WEEK));
  expect(again).toEqual(events);
});

/** 번식 시즌을 두 해 진행하며 주별 정산(stud_books)과 수태율 시스템을 직접 호출한다. */
function runTwoSeasons(state: GameState): void {
  const books = createStudBooksSystem();
  const fertility = createStudFertilitySystem();
  for (const year of [state.date.year, state.date.year + 1]) {
    for (let week = 1; week <= 52; week++) {
      books.run(state, ctxAt(year, week));
      fertility.run(state, ctxAt(year, week));
    }
  }
}

it('시즌 기록: 28주에 기록이 쌓이고, 내 종마는 정산 기록 수와 같으며, 임대 중 시즌은 기록이 없다', () => {
  const build = (): { state: GameState; player: string; ai: string; away: string } => {
    const state = boot();
    const [player, ai, away] = sortedIds(state);
    const owner = state.owners[state.playerOwnerId]!;
    for (const id of [player!, ai!, away!]) {
      state.horses[id]!.status = 'stud';
      state.stallions[id]!.firstSeasonYear = state.date.year;
    }
    state.horses[player!]!.ownerId = state.playerOwnerId;
    owner.horseIds = [...owner.horseIds, player!];
    state.stallions[away!]!.leasedAwayUntil = state.date.year + 2;
    return { state, player: player!, ai: ai!, away: away! };
  };
  const { state, player, ai, away } = build();
  runTwoSeasons(state);
  const again = build();
  runTwoSeasons(again.state);
  expect(again.state.stallions).toEqual(state.stallions);

  const playerRecords = state.stud.seasons.filter((record) => record.stallionId === player && record.outsideCovers > 0);
  expect(playerRecords.length).toBeGreaterThan(0);
  const history = state.stallions[player]!.fertilityHistory ?? [];
  expect(history.map((h) => h.year)).toEqual(playerRecords.map((r) => r.year));
  for (const record of playerRecords) {
    const entry = history.find((h) => h.year === record.year)!;
    expect(entry.covers).toBe(record.outsideCovers);
    expect(entry.conceptions).toBe(record.conceptions);
  }

  const aiHistory = state.stallions[ai]!.fertilityHistory ?? [];
  expect(aiHistory.length).toBeGreaterThan(0);
  expect(aiHistory.every((h) => h.covers > 0 && h.conceptions <= h.covers)).toBe(true);

  expect(state.stallions[away]!.fertilityHistory ?? []).toEqual([]);
});

/** 종마 하나를 번식 시즌 28주 직전 상태로 맞춘다(교배 200두, 기록 이력 지정) */
function setupRetire(opts: {
  owner: 'ai' | 'player'; history: StallionFertilitySeason[]; realKey?: string | null; sold?: boolean;
}): { state: GameState; id: string } {
  const state = boot();
  const year = state.date.year;
  const id = sortedIds(state)[3]!;
  const horse = state.horses[id]!;
  const stallion = state.stallions[id]!;
  horse.status = 'stud';
  horse.ownerId = opts.owner === 'player' ? state.playerOwnerId : null;
  stallion.firstSeasonYear = year - 5;
  stallion.bookingSeason = year;
  stallion.bookedThisSeason = 200;
  stallion.aiBooked = 200;
  stallion.aiDemand = 200;
  stallion.fertility = 0.5;
  stallion.leasedAwayUntil = null;
  stallion.realKey = opts.realKey === undefined ? null : opts.realKey;
  stallion.fertilityHistory = opts.history;
  if (opts.sold) state.stud.sales.push({ stallionId: id, year, mode: 'domestic', price: 1, buyerId: null, nominations: 0 });
  return { state, id };
}

it('은퇴: 연속 두 시즌 미달인 AI 종마는 은퇴하고, 내 종마는 경고만 남긴다', () => {
  const year = boot().date.year;
  const twoBelow = [season(year - 1, 200, 100)];

  const aiRetire = setupRetire({ owner: 'ai', history: twoBelow, realKey: null });
  const aiEvents = createStudFertilitySystem().run(aiRetire.state, ctxAt(year, config.FERTILITY_RECORD_WEEK));
  expect(aiRetire.state.horses[aiRetire.id]!.status).toBe('retired');
  expect(aiRetire.state.stallions[aiRetire.id]!.lastSeasonYear).toBe(year);
  expect(aiEvents).toEqual([]);

  const realRetire = setupRetire({ owner: 'ai', history: twoBelow, realKey: 'real-stallion-key' });
  const realEvents = createStudFertilitySystem().run(realRetire.state, ctxAt(year, config.FERTILITY_RECORD_WEEK));
  expect(realRetire.state.horses[realRetire.id]!.status).toBe('retired');
  expect(realRetire.state.stallions[realRetire.id]!.lastSeasonYear).toBe(year);
  expect(realEvents.map((e) => e.type)).toEqual(['horse_status_changed', 'stallion_pensioned']);

  const playerStay = setupRetire({ owner: 'player', history: twoBelow, realKey: 'real-stallion-key' });
  const playerEvents = createStudFertilitySystem().run(playerStay.state, ctxAt(year, config.FERTILITY_RECORD_WEEK));
  expect(playerStay.state.horses[playerStay.id]!.status).toBe('stud');
  expect(playerStay.state.stallions[playerStay.id]!.lastSeasonYear).toBeUndefined();
  expect(playerEvents).toHaveLength(1);
  expect(playerEvents[0]).toMatchObject({ type: 'stallion_fertility_warning', stallionId: playerStay.id });
  if (playerEvents[0]?.type === 'stallion_fertility_warning') {
    expect(playerEvents[0].rate).toBeGreaterThan(0.4);
    expect(playerEvents[0].rate).toBeLessThan(0.6);
  }
});

it('은퇴 제외: 한 시즌만 미달이거나 교배 10두 미만 시즌이 끼면 은퇴하지 않는다', () => {
  const year = boot().date.year;
  const oneMiss = setupRetire({ owner: 'ai', history: [season(year - 1, 200, 180)] });
  createStudFertilitySystem().run(oneMiss.state, ctxAt(year, config.FERTILITY_RECORD_WEEK));
  expect(oneMiss.state.horses[oneMiss.id]!.status).toBe('stud');

  const thin = setupRetire({ owner: 'ai', history: [season(year - 1, 5, 0)] });
  createStudFertilitySystem().run(thin.state, ctxAt(year, config.FERTILITY_RECORD_WEEK));
  expect(thin.state.horses[thin.id]!.status).toBe('stud');
});

it('내 종마 은퇴: 거래 창(28~44주) 안에서만 성공하고 종마사 칸이 비며 임대 중이면 거절한다', () => {
  const state = boot();
  const [id, other] = sortedIds(state) as [string, string];
  const pid = state.playerOwnerId;
  const horse = state.horses[id]!;
  horse.status = 'stud';
  horse.ownerId = pid;
  const owner = state.owners[pid]!;
  owner.horseIds = [...owner.horseIds.filter((h) => h !== id), id];
  const stud = (s: GameState): number => Object.values(s.horses)
    .filter((h) => h.ownerId === pid && h.status === 'stud').length;

  state.date = { year: state.date.year, week: 30 };
  const before = structuredClone(state);
  const result = retirePlayerStallion(state, id);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(state).toEqual(before);
  expect(result.state.horses[id]).toMatchObject({ status: 'retired', ownerId: null });
  expect(result.state.stallions[id]!.lastSeasonYear).toBe(state.date.year);
  expect(result.state.owners[pid]!.horseIds).not.toContain(id);
  expect(result.state.owners[pid]!.horseIds).toHaveLength(before.owners[pid]!.horseIds.length - 1);
  expect(stud(result.state)).toBe(stud(before) - 1);
  expect(result.events.map((e) => e.type)).toEqual(['horse_status_changed', 'stallion_pensioned']);
  expect(result.events[1]).toMatchObject({ reason: 'player' });

  state.date = { year: state.date.year, week: 10 };
  expect(retirePlayerStallion(state, id)).toEqual({ ok: false, error: 'outside_deal_window' });

  state.date = { year: state.date.year, week: 30 };
  state.stud.leases.push({ stallionId: id, kind: 'shuttle', year: state.date.year, returnSeason: state.date.year + 1,
    rent: 1, paidSeasons: 0 });
  expect(retirePlayerStallion(state, id)).toEqual({ ok: false, error: 'leased' });
  state.stud.leases = [];

  expect(retirePlayerStallion(state, 'no-such-horse' as HorseId)).toEqual({ ok: false, error: 'not_found' });
  expect(retirePlayerStallion(state, other as HorseId)).toEqual({ ok: false, error: 'not_player_stallion' });
});

it('수태율 감소: 바닥 이하 종마는 올리지 않고, 18세부터 매년 2%p 낮춘다', () => {
  const state = boot();
  const id = sortedIds(state)[0]!;
  const sire = state.stallions[id]!;
  const horse = state.horses[id]!;
  Object.assign(sire, { fee: 20_000, aiDemand: 0, fertility: 0.4 });
  horse.birthYear = 2006; // 2026년 기준 20세
  expect(reviewFee(state, id, 2026).fertility).toBe(0.4);
  sire.fertility = 0.8;
  expect(reviewFee(state, id, 2026).fertility).toBe(0.78);
  horse.birthYear = 2008; // 18세
  expect(reviewFee(state, id, 2026).fertility).toBe(0.78);
  horse.birthYear = 2009; // 17세는 감소 전
  expect(reviewFee(state, id, 2026).fertility).toBe(0.8);
});

function simulate(initial: GameState, weeks: number, extra: WeeklySystem[]): GameState {
  let state = structuredClone(initial);
  const systems = createGameSystems(data);
  const at = systems.findIndex((system) => system.id === 'stud_books') + 1;
  systems.splice(at, 0, ...extra);
  for (let i = 0; i < weeks; i++) state = advanceWeek(state, systems).state;
  return state;
}

it('52주 진행에서 수태율 시스템을 넣어도 레이스 결과와 공용 난수가 바뀌지 않는다', () => {
  const initial = boot();
  const withSystem = simulate(initial, 52, [createStudFertilitySystem()]);
  const without = simulate(initial, 52, []);
  expect(withSystem.raceResults.length).toBeGreaterThan(0);
  expect(withSystem.raceResults).toEqual(without.raceResults);
  expect(withSystem.rng).toEqual(without.rng);
  expect(Object.values(withSystem.stallions).some((s) => (s.fertilityHistory ?? []).length > 0)).toBe(true);
}, 1_500_000);
