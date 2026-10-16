import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses,
  getSeriesDefinitions, getStallionNames, getStallionRecords,
} from '../../src/engine/data/staticData';
import { createLegacySystem, familyCandidates, lineCandidates } from '../../src/engine/legacy/lines';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState } from '../../src/engine/types';

const REPORT_PATH = fileURLToPath(new URL('../../docs/reports/2026-10-16-m5-c-lines.json', import.meta.url));
const SEED = 20261011;
const YEARS = 5;
const staticData = {
  nicks: getNicks(), naming: getNamingData(), stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(), courses: getRacecourses(),
  templates: getRaceTemplates(), series: getSeriesDefinitions(),
};

function gameplay(state: GameState) {
  const game = { ...state };
  delete game.legacy;
  delete game.chronicle;
  return { ...game, eventLog: game.eventLog.filter((e) => e.type !== 'sire_line_established'
    && e.type !== 'female_family_established') };
}

/** 기본 전체 테스트에서는 생략. M5_C_MEASURE=1 로 실행하면 통과 시에도 파일로 측정값을 남긴다. */
it.skipIf(process.env.M5_C_MEASURE !== '1')('M5-C 시드 20261011 5년·기존 게임 동일성·연말 성능 측정', () => {
  const started = performance.now();
  const systems = createGameSystems(staticData);
  const legacy = createLegacySystem();
  const annual: object[] = [];
  const measuredLegacy: typeof legacy = {
    id: legacy.id,
    run(draft, ctx) {
      if (ctx.date.week !== 1 || ctx.date.year <= START_YEAR) return legacy.run(draft, ctx);
      // 실제 등록 위치의 draft 로 잰다. 전체 주간 처리·structuredClone·보고용 조회 비용은 제외한다.
      const rngBefore = ctx.rng.getState();
      const start = performance.now();
      const events = legacy.run(draft, ctx);
      const ms = performance.now() - start;
      expect(ctx.rng.getState()).toEqual(rngBefore);
      annual.push({ year: ctx.date.year, horses: Object.keys(draft.horses).length, judgmentMs: ms,
        lines: draft.legacy!.lines.length, families: draft.legacy!.families.length,
        topLines: lineCandidates(draft).sort((a, b) => b.groupWinners - a.groupWinners
          || b.sons - a.sons || a.founderId.localeCompare(b.founderId)).slice(0, 5)
          .map((candidate) => ({ ...candidate, name: draft.horses[candidate.founderId]!.name })),
        topFamilies: familyCandidates(draft).sort((a, b) => b.blackTypeWinners - a.blackTypeWinners
          || b.groupWinners - a.groupWinners || a.founderMareId.localeCompare(b.founderMareId)).slice(0, 5)
          .map((candidate) => ({ ...candidate, name: draft.horses[candidate.founderMareId]!.name })),
      });
      return events;
    },
  };
  // 시상 확정·시즌 정리가 실행되는 season 바로 뒤에 시험 등록한다(제품 시스템 목록은 수정하지 않는다).
  const seasonIndex = systems.findIndex((system) => system.id === 'season');
  const withLegacy = [...systems.slice(0, seasonIndex + 1), measuredLegacy, ...systems.slice(seasonIndex + 1)];
  let state = bootstrapGame({ seed: SEED, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, { ...staticData, ...getPeopleData() });
  let reference = structuredClone(state);
  const report = (completed = false) => {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify({ completed, seed: SEED, years: YEARS, annual,
      finalDate: state.date, horses: Object.keys(state.horses).length,
      legacy: state.legacy, rngEqual: JSON.stringify(state.rng) === JSON.stringify(reference.rng),
      gameplayEqual: completed, saveRoundTrip: completed,
      limitation: '통산 리스티드 우승 필드가 없어 보존 기간 밖의 리스티드 우승은 집계 불가. 공용 타입 변경 확인 필요.',
      elapsedMs: performance.now() - started }, null, 2) + '\n');
  };

  for (let week = 0; week < WEEKS_PER_YEAR * YEARS + 1; week++) {
    state = advanceWeek(state, withLegacy).state;
    reference = advanceWeek(reference, systems).state;
    if (state.date.week === 2) report();
  }
  expect(state.date.year).toBe(START_YEAR + YEARS);
  expect(state.date.week).toBe(2);
  expect(annual).toHaveLength(YEARS);
  expect(gameplay(state)).toEqual(gameplay(reference));
  expect(state.legacy).toBeDefined();
  for (const line of state.legacy!.lines) {
    expect(state.horses[line.founderId]).toBeDefined();
    expect(Number.isFinite(line.groupWinners)).toBe(true);
  }
  for (const family of state.legacy!.families) {
    expect(state.horses[family.founderMareId]).toBeDefined();
    expect(Number.isFinite(family.blackTypeWinners)).toBe(true);
  }
  const saved = deserializeGame(serializeGame(state, '2026-10-16T00:00:00.000Z'));
  expect(saved.ok).toBe(true);
  if (saved.ok) expect(saved.state.legacy).toEqual(state.legacy);
  report(true);
}, 1_800_000);
