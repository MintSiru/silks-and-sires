import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { buildRaceField } from '../../src/engine/season/field';
import { createRng } from '../../src/engine/rng';
import { advanceWeek } from '../../src/engine/time/advance';

// 구현 전 동일한 새 게임·정적 데이터·52주로 측정한 부상은 209건이다.
const BASELINE_INJURIES = 209;
const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
function season() {
  let state = bootstrapGame({ seed: 20261011, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } }, staticData);
  const systems = createGameSystems(staticData);
  let injuries = 0;
  for (let week = 0; week < 52; week++) {
    const previous = state;
    state = advanceWeek(state, systems).state;
    for (const horse of Object.values(state.horses)) {
      if (horse.condition.injury !== null && previous.horses[horse.id]?.condition.injury == null) injuries++;
    }
  }
  return { injuries, hash: createHash('sha256').update(JSON.stringify(state)).digest('hex') };
}
it('20261011 새 게임 52주 부상 빈도와 재현성', () => {
  const first = season();
  writeFileSync('/tmp/m4-h12-season.json', JSON.stringify(first));
  expect(first.injuries).toBeGreaterThanOrEqual(BASELINE_INJURIES * 0.8);
  expect(first.injuries).toBeLessThanOrEqual(BASELINE_INJURIES * 1.2);
  expect(first).toEqual(season());
}, 180_000);

it('실제 말의 기복이 출주 필드와 저장 가능한 리플레이 입력에 보존된다', () => {
  const state = bootstrapGame({ seed: 20261011, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } }, staticData);
  const meeting = state.seasonState.meetings.find((m) => m.races.some((sr) => sr.declarations.length >= 2))!;
  const sr = meeting.races.find((r) => r.declarations.length >= 2)!;
  const id = sr.declarations[0]!.horseId;
  state.horses[id]!.formVariance = 0.035;
  const built = buildRaceField(state, sr, meeting.date, createRng(7),
    (courseId) => staticData.courses.find((c) => c.id === courseId)?.country);
  const snapshot = built.field.runners.find((r) => r.horse.id === id)!.horse;
  expect(snapshot).toHaveProperty('formVariance', 0.035);
  state.horses[id]!.formVariance = 0;
  expect(snapshot).toHaveProperty('formVariance', 0.035);
});
