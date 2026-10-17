import { describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeekGated, advanceWeeksGated } from '../../src/engine/stud/yearEnd';
import type { GameEvent, GameState } from '../../src/engine/types';

const sd = { ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), sales: data.getSalesData(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords() };

function weekly(state: GameState, weeks: number, stop?: (s: GameState) => boolean) {
  const systems = createGameSystems(sd);
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < weeks; i++) {
    const r = advanceWeekGated(current, systems);
    current = r.state;
    events.push(...r.events);
    if (r.blocked !== null) break;
    if (stop?.(current)) break;
  }
  return { state: current, events };
}

describe('M6-P 여러 주 한 번 복제 진행', () => {
  const base = bootstrapGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, sd);

  it('8주 진행 결과·이벤트가 한 주씩 진행과 같고 입력을 바꾸지 않는다', () => {
    const before = JSON.stringify(base);
    const batched = advanceWeeksGated(base, createGameSystems(sd), 8);
    expect(JSON.stringify(base)).toBe(before);
    const stepped = weekly(base, 8);
    expect(batched.state).toEqual(stepped.state);
    expect(batched.events).toEqual(stepped.events);
  }, 120_000);

  it('stop 조건과 연말 정산 대기에서 멈춘다', () => {
    const stop = (s: GameState) => s.date.week >= 4;
    const batched = advanceWeeksGated(base, createGameSystems(sd), 10, stop);
    expect(batched.state.date.week).toBe(4);
    expect(batched.state).toEqual(weekly(base, 10, stop).state);
    const pending = { ...base, date: { year: base.date.year + 1, week: 1 } };
    expect(advanceWeeksGated(pending, createGameSystems(sd), 3).blocked).toBe('year_end');
  }, 120_000);
});
