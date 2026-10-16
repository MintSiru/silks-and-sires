import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';

// ST3_MEASURE_OUT=/tmp/st3-before.json npx vitest run tests/verify/virtualDamPerformance.test.ts
it.skipIf(!process.env.ST3_MEASURE_OUT)('시드 20261011: 워밍업 후 1시즌 3회 측정·파일 기록', () => {
  const staticData = {
    ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
    series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
    stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(), sales: data.getSalesData(),
  };
  const systems = createGameSystems(staticData);
  const runs = [];
  const measuredRuns = Number(process.env.ST3_MEASURE_RUNS ?? 3);
  const warmup = Number(process.env.ST3_MEASURE_WARMUP ?? 1);
  const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  for (let run = 0; run < measuredRuns + warmup; run++) {
    const start = performance.now();
    let state = bootstrapGame({ seed: 20261011, playerName: 'ST3 Measure',
      silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
    const bootMs = performance.now() - start;
    const bootCount = Object.keys(state.horses).length;
    const bootNextHorseNumber = state.nextHorseNumber;
    const bootRng = hash(state.rng);
    const bootIds = new Set(Object.keys(state.horses));
    const weeklyRng = [];
    const seasonStart = performance.now();
    for (let week = 0; week < 52; week++) {
      state = advanceWeek(state, systems).state;
      weeklyRng.push(hash(state.rng));
    }
    const seasonMs = performance.now() - seasonStart;
    if (run >= warmup) runs.push({ bootMs, seasonMs, bootCount, endCount: Object.keys(state.horses).length,
      bootRng, weeklyRng, races: hash(state.raceResults), endDate: state.date });
    if (process.env.ST3_AUDIT_OUT && run === measuredRuns + warmup - 1) {
      const summarize = (h: typeof state.horses[string]) => ({ id: h.id, name: h.name, status: h.status,
        birthYear: h.birthYear, sireId: h.sireId, damId: h.damId, ownerId: h.ownerId });
      writeFileSync(process.env.ST3_AUDIT_OUT, JSON.stringify({
        bootNextHorseNumber, endNextHorseNumber: state.nextHorseNumber,
        created: Object.values(state.horses).filter(h => !bootIds.has(h.id)).map(summarize),
        removed: [...bootIds].filter(id => !state.horses[id]),
      }, null, 2) + '\n');
    }
  }
  const sorted = runs.map(r => r.seasonMs).sort((a, b) => a - b);
  writeFileSync(process.env.ST3_MEASURE_OUT!, JSON.stringify({ seed: 20261011, weeks: 52,
    warmup, runs, medianSeasonMs: sorted[Math.floor(sorted.length / 2)] }, null, 2) + '\n');
  expect(runs).toHaveLength(measuredRuns);
  expect(runs.every(r => r.endDate.year === 2027 && r.endDate.week === 1)).toBe(true);
}, 600_000);
