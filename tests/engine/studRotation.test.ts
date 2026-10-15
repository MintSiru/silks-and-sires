import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as dataSource from '../../src/engine/data/staticData';
import { STUD_PENSION_CHECK_WEEK } from '../../src/engine/config/stud';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems } from '../../src/engine/state/systems';
import { bootstrapWorld } from '../../src/engine/state/world';
import { createStudRotationSystem, pensionChance } from '../../src/engine/stud/rotation';
import { advanceWeek } from '../../src/engine/time/advance';

const data = {
  stallionRecords: dataSource.getStallionRecords(), stallionNames: dataSource.getStallionNames(),
  naming: dataSource.getNamingData(), nicks: dataSource.getNicks(), ...dataSource.getPeopleData(),
  courses: dataSource.getRacecourses(), templates: dataSource.getRaceTemplates(),
  series: dataSource.getSeriesDefinitions(), sales: dataSource.getSalesData(),
};
const options = { seed: 20261011, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const base = bootstrapWorld(createNewGame(options), data, createRng(options.seed));
const template = Object.values(base.stallions)[0]!;

it.each([[19, 0], [20, 0.15], [22, 0.15], [23, 0.3], [24, 0.3], [25, 0.3], [26, 0.6], [27, 0.6]])(
  '%i세 종마의 계단식 은퇴 확률은 %s다', (age, expected) => {
    expect(pensionChance(template, age)).toBe(expected);
  },
);

it('저종부료 은퇴는 12세 이상 AI 편입 종마에만 적용하고 나이 확률과 최댓값을 쓴다', () => {
  const sire = { ...template, aiEntrant: true, realKey: null, fee: 2_000 };
  expect(pensionChance(sire, 11)).toBe(0);
  expect(pensionChance(sire, 12)).toBe(0.3);
  expect(pensionChance(sire, 13)).toBe(0.3);
  expect(pensionChance(sire, 20)).toBe(0.3);
  expect(pensionChance(sire, 27)).toBe(0.6);
  expect(pensionChance({ ...sire, fee: 1_000 }, 13)).toBe(0.3);
  expect(pensionChance({ ...sire, fee: 2_001 }, 13)).toBe(0);
  expect(pensionChance({ ...sire, aiEntrant: false, realKey: template.realKey }, 13)).toBe(0);
  expect(pensionChance({ ...template, fee: 2_000 }, 13)).toBe(0);
});

function fixture() {
  const state = structuredClone(base);
  const horse = state.horses[template.horseId]!;
  state.horses = {};
  state.stallions = {};
  // 삽입 순서와 무관하게 ID 순서대로 처리해야 한다.
  for (const id of ['z-real', 'p-player', 'm-domestic', 'r-retired', 'd-dead',
    'c-stays', 'b-away', 'a-ai', 'y-young', 'x-low-fee', 'n-missing']) {
    state.horses[id] = { ...structuredClone(horse), id, status: 'stud',
      birthYear: state.date.year - 27, ownerId: null };
    state.stallions[id] = { ...structuredClone(template), horseId: id, realKey: null };
    delete state.stallions[id]!.lastSeasonYear;
  }
  state.stallions['z-real']!.realKey = template.realKey;
  state.stallions['a-ai']!.aiEntrant = true;
  state.stallions['b-away']!.leasedAwayUntil = state.date.year + 2;
  state.horses['p-player']!.ownerId = state.playerOwnerId;
  state.horses['r-retired']!.status = 'retired';
  state.stallions['r-retired']!.lastSeasonYear = state.date.year - 1;
  state.horses['d-dead']!.status = 'dead';
  state.horses['y-young']!.birthYear = state.date.year - 19;
  state.horses['x-low-fee']!.birthYear = state.date.year - 13;
  Object.assign(state.stallions['x-low-fee']!, { aiEntrant: true, fee: 2_000 });
  delete state.horses['n-missing'];
  state.stud.sales = [{ stallionId: 'm-domestic', year: state.date.year - 1,
    mode: 'domestic', price: 1_000, buyerId: null, nominations: 0 }];
  // 은퇴·잔류·플레이어 제외·저종부료 경로가 모두 관측되는 고정 입력을 찾는다.
  const roll = (seed: number, id: string, chance = 0.6): boolean =>
    createRng(`${seed}:stud-pension:${id}:${state.date.year}`).chance(chance);
  let seed = 1;
  while (!(['z-real', 'p-player', 'm-domestic', 'b-away', 'a-ai'].every((id) => roll(seed, id))
    && !roll(seed, 'c-stays') && roll(seed, 'x-low-fee', 0.3))) {
    if (++seed > 100_000) throw new Error('테스트용 은퇴 시드를 찾지 못함');
  }
  state.initialSeed = seed;
  return state;
}

it('28주 외에는 상태와 공용 난수가 바뀌지 않는다', () => {
  const state = fixture();
  const before = structuredClone(state);
  const system = createStudRotationSystem();
  expect(system.id).toBe('stud_rotation');
  const rng = createRng(42);
  const rngBefore = rng.getState();
  for (let week = 1; week <= 52; week++) {
    if (week === STUD_PENSION_CHECK_WEEK) continue;
    expect(system.run(state, { date: { year: state.date.year, week }, rng })).toEqual([]);
  }
  expect(state).toEqual(before);
  expect(rng.getState()).toEqual(rngBefore);
});

it('28주에는 비플레이어 종마만 독립 시드로 은퇴하며 실명·국내 판매 이벤트는 ID 순이다', () => {
  const state = fixture();
  const before = structuredClone(state);
  const date = { year: state.date.year, week: STUD_PENSION_CHECK_WEEK };
  const rng = createRng(42);
  const rngBefore = rng.getState();
  const system = createStudRotationSystem();
  const events = system.run(state, { date, rng });
  for (const id of ['z-real', 'm-domestic', 'b-away', 'a-ai', 'x-low-fee']) {
    expect(state.horses[id]!.status).toBe('retired');
    expect(state.stallions[id]!.lastSeasonYear).toBe(date.year);
  }
  for (const id of ['p-player', 'r-retired', 'd-dead', 'c-stays', 'y-young', 'n-missing']) {
    expect(state.horses[id]).toEqual(before.horses[id]);
    expect(state.stallions[id]).toEqual(before.stallions[id]);
  }
  expect(events).toEqual(['m-domestic', 'z-real'].flatMap((id) => [
    { type: 'horse_status_changed', horseId: id, from: 'stud', to: 'retired', date },
    { type: 'stallion_pensioned', stallionId: id, reason: 'age', date },
  ]));
  expect(rng.getState()).toEqual(rngBefore);
  expect(state.rng).toEqual(before.rng);
  const again = structuredClone(before);
  expect(system.run(again, { date, rng: createRng(99) })).toEqual(events);
  expect(again).toEqual(state);
});

it.skipIf(!process.env.VERIFY)('시드 20261011의 10년 뒤 시작 시 실명 현역 종마 잔류율을 측정한다', () => {
  let state = bootstrapGame(options, data);
  const initialYear = state.date.year;
  const cohort = Object.keys(state.stallions).filter((id) =>
    state.stallions[id]!.realKey !== null && state.horses[id]?.status === 'stud');
  expect(cohort.length).toBeGreaterThan(0);
  const systems = createGameSystems(data);
  const at = systems.findIndex((system) => system.id === 'stud_fertility');
  expect(at).toBeGreaterThanOrEqual(0);
  systems.splice(at + 1, 0, createStudRotationSystem());
  for (let week = 0; week < 520; week++) state = advanceWeek(state, systems).state;
  expect(state.date).toEqual({ year: initialYear + 10, week: 1 });
  const active = cohort.filter((id) => state.horses[id]?.status === 'stud').length;
  const retired = cohort.filter((id) => state.horses[id]?.status === 'retired').length;
  const dead = cohort.filter((id) => state.horses[id]?.status === 'dead').length;
  expect(active + retired + dead).toBe(cohort.length);
  const report = { seed: options.seed, weeks: 520, initial: cohort.length,
    active, activeRatio: active / cohort.length, retired, dead };
  // 기본 리포터의 출력 숨김과 관계없이 최종 보고에 쓸 측정값을 보존한다.
  writeFileSync('/tmp/m4-d7a-stud-rotation.json', JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
}, 1_500_000);
