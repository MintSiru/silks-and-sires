import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { bookCovering } from '../../src/engine/breeding/season';
import { PRIVATE_DEMAND_SHARE, PRIVATE_STALLION_CHANCE } from '../../src/engine/config/stud';
import * as dataSource from '../../src/engine/data/staticData';
import { relationKey } from '../../src/engine/economy/relations';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { createStudBooksSystem, seasonDemand } from '../../src/engine/stud/books';
import { privateAccess, setStallionPrivate } from '../../src/engine/stud/private';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState } from '../../src/engine/types';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';

const data = {
  stallionRecords: dataSource.getStallionRecords(), stallionNames: dataSource.getStallionNames(),
  naming: dataSource.getNamingData(), nicks: dataSource.getNicks(), ...dataSource.getPeopleData(),
  courses: dataSource.getRacecourses(), templates: dataSource.getRaceTemplates(),
  series: dataSource.getSeriesDefinitions(), sales: dataSource.getSalesData(),
};
const options = { seed: 20261011, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const base = bootstrapGame(options, data);

function fixture(own = false) {
  const state = structuredClone(base);
  state.date = { year: 2026, week: 10 };
  const mareId = Object.keys(state.mares).find((id) => state.horses[id]?.ownerId === state.playerOwnerId)!;
  const stallionId = Object.keys(state.stallions).sort()[0]!;
  const ownerId = Object.values(state.owners).find((owner) => !owner.isPlayer && owner.studName !== null
    && owner.tier === 'major')!.id;
  Object.assign(state.mares[mareId]!, { pregnant: false, coveredBy: null, bookedFor: null, dueWeek: null });
  state.horses[mareId]!.birthYear = 2020;
  state.horses[stallionId]!.ownerId = own ? state.playerOwnerId : ownerId;
  state.stallions[stallionId] = { ...state.stallions[stallionId]!, privateTo: own ? state.playerOwnerId : ownerId,
    bookedThisSeason: 0, aiBooked: 0, aiDemand: 0 };
  return { state, mareId, stallionId, ownerId };
}

it('공개·자기 소유·관계 40과 39의 허가 경계를 순수하게 조회한다', () => {
  const { state, stallionId, ownerId } = fixture();
  const before = structuredClone(state);
  expect(privateAccess(state, stallionId, state.playerOwnerId)).toBe('denied');
  expect(privateAccess(state, stallionId, ownerId)).toBe('own');
  expect(state).toEqual(before);
  state.relations.values[relationKey('owner', ownerId)] = 39;
  expect(privateAccess(state, stallionId, state.playerOwnerId)).toBe('denied');
  state.relations.values[relationKey('owner', ownerId)] = 40;
  expect(privateAccess(state, stallionId, state.playerOwnerId)).toBe('allowed');
  state.stallions[stallionId]!.privateTo = null;
  expect(privateAccess(state, stallionId, ownerId)).toBe('public');
  delete state.stallions[stallionId]!.privateTo;
  expect(privateAccess(state, stallionId, ownerId)).toBe('public');
});

it('AI 비공개 종마는 허가 뒤 유료 예약, 플레이어 비공개 종마는 자기 암말 무료 예약이다', () => {
  const { state, mareId, stallionId, ownerId } = fixture();
  const before = structuredClone(state);
  expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'private_stallion' });
  expect(state).toEqual(before);
  state.relations.values[relationKey('owner', ownerId)] = 40;
  const funds = state.owners[state.playerOwnerId]!.funds;
  const paid = bookCovering(state, state.playerOwnerId, mareId, stallionId);
  expect(paid.ok).toBe(true);
  if (!paid.ok) throw new Error(paid.error);
  expect(paid.state.owners[state.playerOwnerId]!.funds).toBe(funds - state.stallions[stallionId]!.fee);
  const own = fixture(true);
  own.state.owners[own.state.playerOwnerId]!.funds = 0;
  const free = bookCovering(own.state, own.state.playerOwnerId, own.mareId, own.stallionId);
  expect(free.ok).toBe(true);
  if (!free.ok) throw new Error(free.error);
  expect(free.state.owners[own.state.playerOwnerId]!.funds).toBe(0);
  expect(free.state.stallions[own.stallionId]!.bookedThisSeason).toBe(1);
});

it('비공개 예약 오류는 시즌·북 검사 뒤, 자금 검사 전에 반환한다', () => {
  const { state, mareId, stallionId, ownerId } = fixture();
  state.owners[state.playerOwnerId]!.funds = 0;
  expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'private_stallion' });
  state.stallions[stallionId]!.bookedThisSeason = state.stallions[stallionId]!.bookLimit;
  expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'book_full' });
  state.date.week = 30;
  expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'not_breeding_season' });
  state.date.week = 10;
  state.stallions[stallionId]!.bookedThisSeason = 0;
  state.relations.values[relationKey('owner', ownerId)] = 40;
  expect(bookCovering(state, state.playerOwnerId, mareId, stallionId)).toEqual({ ok: false, error: 'insufficient_funds' });
});

function runBooks(state: GameState, year: number, week: number) {
  state.date = { year, week };
  const rng = createRng(123);
  const before = rng.getState();
  const events = createStudBooksSystem().run(state, { date: state.date, rng });
  expect(rng.getState()).toEqual(before);
  return events;
}

it('플레이어 비공개 북은 자기 예약을 보존하고 외부 수요·예약·정산 수입이 0이다', () => {
  const { state, stallionId } = fixture(true);
  Object.assign(state.stallions[stallionId]!, { bookingSeason: 2027, bookedThisSeason: 1 });
  const funds = state.owners[state.playerOwnerId]!.funds;
  for (let i = 0; i < 35; i++) {
    runBooks(state, i < 9 ? 2026 : 2027, i < 9 ? 44 + i : i - 8);
    expect(state.stallions[stallionId]).toMatchObject({ aiDemand: 0, aiBooked: 0, bookedThisSeason: 1 });
  }
  expect(runBooks(state, 2027, 27)).toContainEqual({ type: 'stud_season_settled', stallionId,
    year: 2027, outsideCovers: 0, conceptions: 0, income: 0, date: { year: 2027, week: 27 } });
  expect(state.stud.seasons.find((record) => record.stallionId === stallionId))
    .toMatchObject({ outsideCovers: 0, ownCovers: 1, income: 0 });
  expect(state.owners[state.playerOwnerId]!.funds).toBe(funds);
  expect(state.economy.playerLedger.filter((entry) => entry.category === 'stud_fee_received')).toEqual([]);
});

it.each([60, 1])('AI 비공개 수요는 공개 수요의 30%% 내림·최소 1이다(북 %i)', (bookLimit) => {
  const { state, stallionId } = fixture();
  state.stallions[stallionId]!.bookLimit = bookLimit;
  const publicState = structuredClone(state);
  publicState.stallions[stallionId]!.privateTo = null;
  runBooks(publicState, 2026, 44);
  runBooks(state, 2026, 44);
  expect(state.stallions[stallionId]!.aiDemand)
    .toBe(Math.max(1, Math.floor(publicState.stallions[stallionId]!.aiDemand * PRIVATE_DEMAND_SHARE)));
  expect(publicState.stallions[stallionId]!.aiDemand).toBe(Math.max(1, seasonDemand(state, stallionId, 2027)));
});

it.each([28, 30, 43])('%i주에 비공개 설정·해제를 복제본에 적용한다', (week) => {
  const { state, stallionId } = fixture(true);
  state.date.week = week;
  state.stallions[stallionId]!.privateTo = null;
  const before = structuredClone(state);
  const closed = setStallionPrivate(state, stallionId, true);
  expect(closed.ok).toBe(true);
  if (!closed.ok) throw new Error(closed.error);
  expect(closed.events).toEqual([]);
  expect(closed.state.stallions[stallionId]!.privateTo).toBe(state.playerOwnerId);
  expect(state).toEqual(before);
  const closedBefore = structuredClone(closed.state);
  const opened = setStallionPrivate(closed.state, stallionId, false);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.error);
  expect(opened.state.stallions[stallionId]!.privateTo).toBeNull();
  expect(closed.state).toEqual(closedBefore);
});

it('비공개 전환은 없는 말·남의 종마·비종마·거래 창 밖·임대·같은 상태를 거절한다', () => {
  const { state, stallionId, ownerId, mareId } = fixture(true);
  state.date.week = 30;
  expect(setStallionPrivate(state, 'missing', true)).toEqual({ ok: false, error: 'not_found' });
  expect(setStallionPrivate(state, mareId, true)).toEqual({ ok: false, error: 'not_found' });
  expect(setStallionPrivate(state, stallionId, true)).toEqual({ ok: false, error: 'no_change' });
  state.stallions[stallionId]!.privateTo = null;
  expect(setStallionPrivate(state, stallionId, false)).toEqual({ ok: false, error: 'no_change' });
  for (const week of [10, 27, 44]) {
    state.date.week = week;
    expect(setStallionPrivate(state, stallionId, true)).toEqual({ ok: false, error: 'outside_deal_window' });
  }
  state.date.week = 30;
  for (const kind of ['shuttle', 'long'] as const) {
    state.stud.leases = [{ stallionId, kind, year: 2026, returnSeason: 2027, rent: 1000, paidSeasons: 0 }];
    const before = structuredClone(state);
    expect(setStallionPrivate(state, stallionId, true)).toEqual({ ok: false, error: 'leased' });
    expect(state).toEqual(before);
  }
  state.stud.leases = [];
  state.horses[stallionId]!.status = 'retired';
  expect(setStallionPrivate(state, stallionId, true)).toEqual({ ok: false, error: 'not_player_stallion' });
  state.horses[stallionId]!.status = 'stud';
  state.horses[stallionId]!.ownerId = ownerId;
  expect(setStallionPrivate(state, stallionId, true)).toEqual({ ok: false, error: 'not_player_stallion' });
});

it('대형 오너브리더만 말별 독립 판정으로 소유를 유지하고 공용 난수는 동일하다', () => {
  const { state, ownerId } = fixture();
  for (const horse of Object.values(state.horses)) {
    if (horse.status === 'in_training' || horse.status === 'resting') horse.status = 'retired';
  }
  const source = Object.values(state.horses).find((horse) => horse.sex === 'male')!;
  let id = 'private-candidate';
  while (!createRng(`${state.initialSeed}:private-stallion:${id}`).chance(PRIVATE_STALLION_CHANCE)) id += '-x';
  state.horses[id] = { ...structuredClone(source), id, name: 'Silver Grove', ownerId, status: 'in_training',
    sex: 'male', gelded: false, birthYear: 2024, officialRating: 120 };
  state.owners[ownerId]!.horseIds.push(id);
  const outputs = [state, structuredClone(state), structuredClone(state)];
  outputs[1]!.owners[ownerId]!.tier = 'mid';
  outputs[2]!.owners[ownerId]!.studName = null;
  const rngStates = outputs.map((current) => {
    const rng = createRng('private-entry');
    rng.chance = () => true;
    createPopulationSystem(data).run(current, { date: { year: 2027, week: 1 }, rng });
    return rng.getState();
  });
  expect(state.stallions[id]!.privateTo).toBe(ownerId);
  expect(state.horses[id]!.ownerId).toBe(ownerId);
  expect(state.owners[ownerId]!.horseIds).toContain(id);
  for (const current of outputs.slice(1)) {
    expect(current.stallions[id]!.privateTo).toBeUndefined();
    expect(current.horses[id]!.ownerId).toBeNull();
    expect(current.owners[ownerId]!.horseIds).not.toContain(id);
  }
  expect(rngStates[1]).toEqual(rngStates[0]);
  expect(rngStates[2]).toEqual(rngStates[0]);
});

it('시드 20261011 새 게임 2년의 비공개 편입 수와 소유 일치를 측정하고 2회 동일하다', () => {
  const simulate = () => {
    let state = bootstrapGame(options, data);
    const systems = createGameSystems(data);
    for (let week = 0; week < 104; week++) state = advanceWeek(state, systems).state;
    expect(state.date).toEqual({ year: 2028, week: 1 });
    const entrants = Object.values(state.stallions).filter((stallion) => stallion.aiEntrant);
    const privateEntrants = entrants.filter((stallion) => stallion.privateTo != null);
    for (const stallion of privateEntrants) {
      expect(state.horses[stallion.horseId]!.ownerId).toBe(stallion.privateTo);
      expect(state.owners[stallion.privateTo!]!.horseIds).toContain(stallion.horseId);
    }
    return { count: privateEntrants.length, total: entrants.length,
      hash: createHash('sha256').update(JSON.stringify(state)).digest('hex') };
  };
  const first = simulate();
  expect(first.count).toBeGreaterThanOrEqual(0);
  expect(simulate()).toEqual(first);
  process.stdout.write(`[측정] 시드 20261011 새 게임 2년: AI 편입 ${first.total}두 중 비공개 ${first.count}두, 같은 시드 2회 동일\n`);
}, 600_000);
