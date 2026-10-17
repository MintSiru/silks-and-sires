import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek, advanceWeekInPlace } from '../../src/engine/time/advance';

/** 수동 성능 검증: RD1_PERF_OUT=/tmp/rd1-performance.json. 일반 전체 테스트에는 부하를 더하지 않는다. */
it.skipIf(!process.env.RD1_PERF_OUT)('30년 진행 뒤 같은 상태에서 개최 시드 유무의 주당 시간 비교', () => {
  const staticData = {
    ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
    series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
    stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
    sales: data.getSalesData(),
  };
  const state = bootstrapGame({ seed: 20261011, playerName: '가상 마주', economyMode: 'casual',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
  const systems = createGameSystems(staticData);
  const startYear = state.date.year;
  const yearly: { year: number; msPerWeek: number; horses: number }[] = [];
  for (let year = 0; year < 30; year++) {
    const started = performance.now();
    for (let week = 0; week < 52; week++) advanceWeekInPlace(state, systems);
    yearly.push({ year: startYear + year, msPerWeek: (performance.now() - started) / 52,
      horses: Object.keys(state.horses).length });
    process.stdout.write(`[RD1 성능] ${year + 1}/30년 ${yearly.at(-1)!.msPerWeek.toFixed(1)}ms/주\n`);
  }
  expect(state.date).toEqual({ year: startYear + 30, week: 1 });
  // 동일한 30년차 입력을 번갈아 측정해 말 수·저장 크기·부하 차이를 줄인다.
  const legacy = structuredClone(state);
  for (const meeting of legacy.seasonState.meetings) delete meeting.seed;
  const timings: { seeded: number[]; legacy: number[] } = { seeded: [], legacy: [] };
  for (let i = 0; i < 8; i++) {
    for (const mode of i % 2 === 0 ? ['seeded', 'legacy'] as const : ['legacy', 'seeded'] as const) {
      const started = performance.now();
      const out = advanceWeek(mode === 'seeded' ? state : legacy, systems);
      expect(out.state.date.week).toBe(2);
      if (i > 0) timings[mode].push(performance.now() - started);
    }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const seededMedianMs = median(timings.seeded);
  const legacyMedianMs = median(timings.legacy);
  const report = { years: 30, weeks: 1560, finalDate: state.date, yearly, timings,
    seededMedianMs, legacyMedianMs, ratio: seededMedianMs / legacyMedianMs,
    scenario: '30년 in-place 진행(캐주얼 경제, 연말 인사·판매 선택 생략) 후 동일 상태 advanceWeek 7회 중앙값. legacy는 개최 seed만 제거.' };
  writeFileSync(process.env.RD1_PERF_OUT!, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`[RD1 성능] 확정 개최 ${seededMedianMs.toFixed(1)}ms / 기존 개최 ${legacyMedianMs.toFixed(1)}ms / 비율 ${report.ratio.toFixed(3)}\n`);
}, 1_800_000);
