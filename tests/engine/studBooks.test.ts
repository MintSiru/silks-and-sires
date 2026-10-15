import { expect, it } from 'vitest';
import { bookCovering } from '../../src/engine/breeding/season';
import * as dataSource from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { accrualProgress, createStudBooksSystem, seasonDemand } from '../../src/engine/stud/books';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState } from '../../src/engine/types';

const data = {
  stallionRecords: dataSource.getStallionRecords(), stallionNames: dataSource.getStallionNames(),
  naming: dataSource.getNamingData(), nicks: dataSource.getNicks(), ...dataSource.getPeopleData(),
  courses: dataSource.getRacecourses(), templates: dataSource.getRaceTemplates(),
  series: dataSource.getSeriesDefinitions(), sales: dataSource.getSalesData(),
};
function boot() {
  return bootstrapGame({ seed: 20261011, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, data);
}
function run(state: GameState, year: number, week: number) {
  state.date = { year, week };
  return createStudBooksSystem().run(state, { date: state.date, rng: createRng(1) });
}

it('예약 창 경계·시즌 수요 결정성과 순수성을 지킨다', () => {
  expect(accrualProgress({ year: 2026, week: 43 }, 2027)).toBe(0);
  expect(accrualProgress({ year: 2026, week: 44 }, 2027)).toBe(1 / 25);
  expect(accrualProgress({ year: 2027, week: 16 }, 2027)).toBe(1);
  expect(accrualProgress({ year: 2027, week: 26 }, 2027)).toBe(1);
  const state = boot();
  const before = structuredClone(state);
  const id = Object.keys(state.stallions)[0]!;
  expect(seasonDemand(state, id, 2027)).toBe(seasonDemand(state, id, 2027));
  expect(state).toEqual(before);
});

it('티어별 마감률·마감 주와 이른 예약·늦은 예약을 검증한다', () => {
  let state = boot();
  state.date = { year: 2026, week: 44 };
  const systems = createGameSystems(data);
  const closed = new Map<string, number>();
  const mare = Object.values(state.horses).find(h => h.ownerId === state.playerOwnerId && h.status === 'broodmare')!;
  const tierOf = (id: string) => data.stallionRecords.find(r => r.key === state.stallions[id]!.realKey)!.marketTier;
  for (let index = 0; index < 35; index++) {
    const year = index < 9 ? 2026 : 2027;
    const week = index < 9 ? index + 44 : index - 8;
    state = advanceWeek(state, systems).state;
    // 이번 주 예약 결과를 같은 주의 플레이어 입력으로 검사한다.
    const bookingState = { ...state, date: { year, week } };
    for (const [id, stallion] of Object.entries(state.stallions)) {
      if (stallion.bookedThisSeason >= stallion.bookLimit && !closed.has(id)) closed.set(id, index);
      if (tierOf(id) === 1 && year === 2026 && week === 45) {
        expect(bookCovering(bookingState, state.playerOwnerId, mare.id, id).ok).toBe(true);
      }
      if (tierOf(id) === 1 && year === 2027 && week === 20 && closed.has(id)) {
        expect(bookCovering(bookingState, state.playerOwnerId, mare.id, id)).toEqual({ ok: false, error: 'book_full' });
      }
    }
  }
  const rows = [1, 2, 3, 4, 5].map(tier => {
    const ids = Object.keys(state.stallions).filter(id => tierOf(id) === tier);
    const weeks = ids.flatMap(id => closed.has(id) ? [closed.get(id)!] : []).sort((a, b) => a - b);
    const middle = weeks.length ? (weeks[Math.floor((weeks.length - 1) / 2)]! + weeks[Math.floor(weeks.length / 2)]!) / 2 : null;
    return { tier, total: ids.length, closed: weeks.length, ratio: weeks.length / ids.length,
      median2027Week: middle === null ? null : middle - 8 };
  });
  console.table(rows);
  expect(rows[0]!.ratio).toBeGreaterThanOrEqual(0.6);
  expect(rows[4]!.ratio).toBeLessThanOrEqual(0.25);
  expect(rows[0]!.median2027Week).toBeGreaterThanOrEqual(1);
  expect(rows[0]!.median2027Week).toBeLessThanOrEqual(10);
}, 120_000);

it('플레이어 종마 수입·장부·이벤트·중복 방지·기록 상한을 검증한다', () => {
  const state = boot();
  const stallion = Object.values(state.stallions)[0]!;
  state.horses[stallion.horseId]!.ownerId = state.playerOwnerId;
  Object.assign(stallion, { fee: 17_000, fertility: 0.85, bookLimit: 110, popularity: 38, firstSeasonYear: 2027 });
  const copy = structuredClone(state);
  for (const current of [state, copy]) {
    for (let week = 44; week <= 52; week++) run(current, 2026, week);
    for (let week = 1; week <= 26; week++) run(current, 2027, week);
  }
  const events = run(state, 2027, 27);
  expect(run(copy, 2027, 27)).toEqual(events);
  expect(copy).toEqual(state);
  const record = state.stud.seasons[0]!;
  console.log('플레이어 종마 정산', record);
  expect(record.income).toBeGreaterThanOrEqual(900_000);
  expect(record.income).toBeLessThanOrEqual(2_000_000);
  expect(state.economy.playerLedger.filter(e => e.category === 'stud_fee_received').reduce((sum, e) => sum + e.amount, 0)).toBe(record.income);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'stud_season_settled', income: record.income });
  expect(run(state, 2027, 27)).toEqual([]);
  state.stud.seasons = Array.from({ length: 60 }, (_, i) => ({ ...record, year: 1900 + i }));
  expect(run(state, 2027, 27)).toHaveLength(1);
  expect(state.stud.seasons).toHaveLength(60);
});

it('52주 뒤 같은 시드가 같고 시스템 제외 시 레이스·현역마·공용 난수가 같다', () => {
  const initial = boot();
  const systems = createGameSystems(data);
  const advance = (include: boolean) => {
    let state = structuredClone(initial);
    for (let i = 0; i < 52; i++) state = advanceWeek(state, include ? systems : systems.filter(s => s.id !== 'stud_books')).state;
    return state;
  };
  const first = advance(true);
  expect(advance(true)).toEqual(first);
  const without = advance(false);
  expect(first.raceResults.length).toBeGreaterThan(0);
  expect(first.raceResults).toEqual(without.raceResults);
  expect(first.horses).toEqual(without.horses);
  expect(first.rng).toEqual(without.rng);
}, 600_000);
