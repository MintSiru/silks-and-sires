import { expect, it } from 'vitest';
import * as dataSource from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { createFeeReviewSystem, demandMultiplier, progenyMultiplier, reviewFee } from '../../src/engine/stud/market';
import { baseDemandRatio } from '../../src/engine/stud/books';
import { roundStudFee } from '../../src/engine/stud/value';
import { FEE_ADJUST_SPEED, FEE_BASE_DRIFT_EXPONENT, FEE_REVIEW_WEEK } from '../../src/engine/config/stud';
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

it('중립·초과 수요·자마 성적·가격 사다리와 순수성을 검증한다', () => {
  const state = boot();
  const id = Object.keys(state.stallions)[0]!;
  const sire = state.stallions[id]!;
  state.horses[id]!.birthYear = 2020;
  // 수요 배수는 인기에서 기대되는 수요와 비교한다(2026-10-15 Opus 수정) — 기대 수요와 같으면 중립
  const neutralDemand = Math.round(100 * baseDemandRatio(50));
  Object.assign(sire, { fee: 20_000, aiDemand: neutralDemand, bookLimit: 100, fertility: 0.9, popularity: 50 });
  const before = structuredClone(state);
  expect(reviewFee(state, id, 2026)).toEqual({ fee: 20_000, fertility: 0.9, popularity: 52, marketBaseFee: 20_000 });
  expect(state).toEqual(before);
  sire.aiDemand = 160;
  expect(demandMultiplier(sire)).toBe(1.3);
  expect(reviewFee(state, id, 2026).fee).toBe(23_000);
  sire.aiDemand = 0;
  expect(demandMultiplier(sire)).toBe(1);
  sire.aiDemand = neutralDemand;
  const ids = Object.keys(state.stallions).slice(0, 8);
  // 자마 성적은 같은 가격대끼리 비교하므로 비교 대상을 같은 가격으로 맞춘다
  for (const peer of ids) state.stallions[peer]!.fee = 20_000;
  for (const peer of ids) state.sireStats[peer] = {
    starters: 10, winners: 0, runs: 10, wins: 0, groupWins: 0,
    groupWinners: 0, earnings: peer === id ? 40_000 : 40_000 / 7, winDistanceSum: 0,
  };
  expect(progenyMultiplier(state, id)).toBe(1.8);
  expect(reviewFee(state, id, 2026).fee).toBe(roundStudFee(20_000 * (1.8 ** FEE_BASE_DRIFT_EXPONENT) ** FEE_ADJUST_SPEED));
  for (const peer of ids) state.sireStats[peer]!.earnings = peer === id ? 2_500 : 77_500 / 7;
  expect(progenyMultiplier(state, id)).toBe(0.6);
  expect(reviewFee(state, id, 2026).fee).toBe(roundStudFee(20_000 * (0.6 ** FEE_BASE_DRIFT_EXPONENT) ** FEE_ADJUST_SPEED));
  sire.aiDemand = 1;
  expect(reviewFee(state, id, 2026).fee).toBe(roundStudFee(20_000 * (0.6 ** FEE_BASE_DRIFT_EXPONENT * 0.75) ** FEE_ADJUST_SPEED));
  for (const fee of [1_000, 1_500, 9_500, 10_000, 21_000]) {
    sire.fee = fee;
    const result = reviewFee(state, id, 2026).fee;
    expect(result).toBeGreaterThanOrEqual(1_000);
    expect(result % (result < 10_000 ? 500 : 1_000)).toBe(0);
  }
});

it('저장한 기준 가치·가격 기반 인기·연간 조정 상한을 적용한다', () => {
  const state = boot();
  const id = Object.keys(state.stallions)[0]!;
  const sire = state.stallions[id]!;
  state.horses[id]!.birthYear = 2020;
  Object.assign(sire, { fee: 20_000, marketBaseFee: 80_000, aiDemand: 100,
    bookLimit: 100, fertility: 0.9, popularity: 10 });
  expect(reviewFee(state, id, 2026)).toMatchObject({ fee: 30_000, marketBaseFee: 80_000 });
  sire.marketBaseFee = 1_000;
  expect(reviewFee(state, id, 2026).fee).toBe(10_000);
  sire.aiDemand = 0; // 수요 배수 1(종부료 유지) 상태에서 인기 함수만 확인
  for (const [fee, popularity] of [[6_000, 30], [150_000, 90], [1_000, 10], [300_000, 95]]) {
    Object.assign(sire, { fee, marketBaseFee: fee });
    expect(reviewFee(state, id, 2026).popularity).toBe(popularity);
    sire.popularity = 95;
    expect(reviewFee(state, id, 2026).popularity).toBe(popularity);
  }
});

it('검토 주·현역 종마·플레이어 이벤트·나이와 수태율 경계를 지킨다', () => {
  const state = boot();
  const ids = Object.keys(state.stallions).sort();
  const id = ids[0]!;
  const sire = state.stallions[id]!;
  state.horses[id]!.ownerId = state.playerOwnerId;
  state.horses[id]!.birthYear = 2006;
  Object.assign(sire, { fee: 20_000, fertility: 0.74, aiDemand: 0 });
  expect(reviewFee(state, id, 2026)).toMatchObject({ fee: 18_000, fertility: 0.73 });
  sire.fertility = 0.5;
  expect(reviewFee(state, id, 2026).fertility).toBe(0.5);
  state.horses[ids[1]!]!.status = 'retired';
  const retired = structuredClone(state.stallions[ids[1]!]!);
  const run = (week: number) => createFeeReviewSystem().run(state,
    { date: { year: 2026, week }, rng: createRng(1) });
  const before = structuredClone(state);
  expect(run(FEE_REVIEW_WEEK - 1)).toEqual([]);
  expect(state).toEqual(before);
  expect(run(FEE_REVIEW_WEEK)).toContainEqual({ type: 'stud_fee_set', stallionId: id,
    season: 2027, fee: sire.fee, prevFee: 20_000, date: { year: 2026, week: FEE_REVIEW_WEEK } });
  expect(sire.prevFee).toBe(20_000);
  expect(sire.marketBaseFee).toBe(20_000);
  expect(state.stallions[ids[1]!]).toEqual(retired);
});

function simulate(initial: GameState, weeks: number, include: boolean): GameState {
  let state = structuredClone(initial);
  const systems = createGameSystems(data).filter(system => system.id !== 'mortality' && system.id !== 'fee_review');
  if (include) systems.splice(4, 0, createFeeReviewSystem());
  for (let i = 0; i < weeks; i++) state = advanceWeek(state, systems).state;
  expect(state.date.year * 52 + state.date.week).toBe(initial.date.year * 52 + initial.date.week + weeks);
  return state;
}

it('52주 레이스·현역마·공용 난수 독립성과 같은 시드 재현성을 지킨다', () => {
  const initial = boot();
  const first = simulate(initial, 52, true);
  expect(simulate(boot(), 52, true)).toEqual(first);
  const without = simulate(initial, 52, false);
  expect(first.raceResults.length).toBeGreaterThan(0);
  expect(first.raceResults).toEqual(without.raceResults);
  const active = (state: GameState) => Object.values(state.horses).filter(h =>
    h.status === 'in_training' || h.status === 'resting');
  expect(active(first)).toEqual(active(without));
  expect(first.rng).toEqual(without.rng);
}, 600_000);

it.skipIf(!process.env.VERIFY)('520주 티어별 중앙값과 전체 종부료 비율을 측정한다', () => {
  const initial = boot();
  const final = simulate(initial, 520, true);
  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return (values[Math.floor((values.length - 1) / 2)]! + values[Math.floor(values.length / 2)]!) / 2;
  };
  const rows = [1, 2, 3, 4, 5].map(tier => {
    const ids = Object.keys(initial.stallions).filter(id => data.stallionRecords.find(
      r => r.key === initial.stallions[id]!.realKey)!.marketTier === tier);
    const start = median(ids.map(id => initial.stallions[id]!.fee));
    const end = median(ids.map(id => final.stallions[id]!.fee));
    return { tier, start, end, ratio: end / start };
  });
  const total = (state: GameState) => Object.values(state.stallions).reduce((sum, sire) => sum + sire.fee, 0);
  const ratio = total(final) / total(initial);
  console.table(rows);
  console.log('전체 종부료 합 비율', ratio);
  for (const row of rows) {
    expect.soft(row.ratio).toBeGreaterThanOrEqual(0.5);
    expect.soft(row.ratio).toBeLessThanOrEqual(2);
  }
  expect(ratio).toBeGreaterThanOrEqual(0.6);
  expect(ratio).toBeLessThanOrEqual(1.8);
}, 600_000);
