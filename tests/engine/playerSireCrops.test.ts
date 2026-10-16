import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapWorld } from '../../src/engine/state/world';
import { bootstrapRacingPopulation } from '../../src/engine/world/population';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';
import type { GameState } from '../../src/engine/types';

const SEED = 20261011;
const YEAR = 2027;
const data = { stallionRecords: getStallionRecords(), naming: getNamingData(), stallionNames: getStallionNames() };
function boot(): GameState {
  const base = createNewGame({ seed: SEED, playerName: 'Test Owner', silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } });
  const people = bootstrapPeople(base, getPeopleData(), createRng(SEED));
  const world = bootstrapWorld(people, { ...data, nicks: getNicks() }, createRng(SEED + 1));
  return bootstrapRacingPopulation(world, data, createRng(SEED + 2));
}
function run(state: GameState, year = YEAR): GameState {
  createPopulationSystem(data).run(state, { date: { year, week: 1 }, rng: createRng(SEED + year) });
  return state;
}
describe('플레이어 종마 자마', () => {
  it('시즌 기록이 없으면 변경 전 2년 진행 horses JSON과 같다', () => {
    const state = run(run(boot()), YEAR + 1);
    expect(createHash('sha256').update(JSON.stringify(state.horses)).digest('hex')).toBe('40bd11a1bdbda4d455c959d7337371eb11ae831fbb01c825cb377924f67e4e91'); // 2026-10-16 재고정: 5대 혈통 17회차 데이터·어휘 정리
    expect(state.stud.seasons).toEqual([]);
  }, 30_000);
});

const SIRE_ID = 'player-crop-sire';
function withSire(conceptions?: number): GameState {
  const state = boot();
  const original = Object.values(state.stallions)[0]!;
  state.stallions[SIRE_ID] = { ...structuredClone(original), horseId: SIRE_ID, fee: 17_000, standsIn: 'IE' };
  state.horses[SIRE_ID] = { ...structuredClone(state.horses[original.horseId]!), id: SIRE_ID, name: 'Silver Meadow', ownerId: state.playerOwnerId, status: 'stud' };
  state.owners[state.playerOwnerId]!.horseIds.push(SIRE_ID);
  if (conceptions !== undefined) state.stud.seasons.push({ stallionId: SIRE_ID, year: YEAR - 3, fee: 17_000, outsideCovers: conceptions, ownCovers: 0, conceptions, income: conceptions * 17_000 });
  return state;
}
function entries(state: GameState, country: string) {
  return Object.values(state.horses).filter((h) => h.birthYear === YEAR - 2 && h.countryOfBirth === country && h.status === 'in_training');
}
describe('외부 자마 편입', () => {
  it('69 수태는 AI 소유 IE 2세 3~5두가 되고 나라별 유입 합은 보존된다', () => {
    const baseline = run(withSire());
    const state = run(withSire(69));
    const crop = Object.values(state.horses).filter((h) => h.sireId === SIRE_ID);
    expect(crop.length).toBeGreaterThanOrEqual(3);
    expect(crop.length).toBeLessThanOrEqual(5);
    for (const horse of crop) {
      expect(horse.birthYear).toBe(YEAR - 2);
      expect(horse.countryOfBirth).toBe('IE');
      expect(horse.status).toBe('in_training');
      expect(state.owners[horse.ownerId!]!.isPlayer).toBe(false);
      expect(state.owners[horse.ownerId!]!.horseIds).toContain(horse.id);
      expect(state.trainers[horse.trainerId!]!.country).toBe('IE');
      expect(horse.sireLineId).toBe(state.stallions[SIRE_ID]!.sireLineId);
      expect(horse.gelded).toBe(false);
    }
    for (const country of ['GB', 'IE', 'FR', 'DE', 'IT']) {
      expect(entries(state, country).length).toBe(entries(baseline, country).length);
    }
  }, 30_000);
  it('같은 시드 2회 동일하고 150 수태는 7~11두다', () => {
    const a = run(withSire(150));
    expect(a).toEqual(run(withSire(150)));
    const count = Object.values(a.horses).filter((h) => h.sireId === SIRE_ID).length;
    expect(count).toBeGreaterThanOrEqual(7);
    expect(count).toBeLessThanOrEqual(11);
  }, 30_000);
  it('다른 교배 연도, 0 수태, 사라진 종마는 기존 결과를 유지한다', () => {
    const baseline = run(withSire());
    expect(run(withSire(0)).horses).toEqual(baseline.horses);
    const wrongYear = withSire(69);
    wrongYear.stud.seasons[0]!.year -= 1;
    expect(run(wrongYear).horses).toEqual(baseline.horses);
    const missing = boot();
    missing.stud.seasons = withSire(69).stud.seasons;
    expect(run(missing).horses).toEqual(run(boot()).horses);
  }, 30_000);
});
