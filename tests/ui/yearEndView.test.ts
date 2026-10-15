import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSalesData, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { advanceWeek } from '../../src/engine/time/advance';
import { advanceWeekGated, submitYearEnd, yearEndCandidates, yearEndPending } from '../../src/engine/stud/yearEnd';
import type { GameState } from '../../src/engine/types';
import { defaultSubmission, yearEndView } from '../../src/ui/yearEnd/yearEndView';

let state: GameState;
beforeAll(() => {
  const data = { nicks: getNicks(), naming: getNamingData(), ...getPeopleData(),
    templates: getRaceTemplates(), courses: getRacecourses(), sales: getSalesData(),
    series: getSeriesDefinitions(), stallionNames: getStallionNames(), stallionRecords: getStallionRecords() };
  state = bootstrapGame({ seed: 20261011, playerName: '테스트', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, data);
  const year = state.date.year;
  const systems = createGameSystems(data);
  while (state.date.year === year) state = advanceWeek(state, systems).state;
}, 600_000);

describe('연말 정산 화면', () => {
  it('모든 후보와 허용 진로를 같은 순서로 표시하며 OR을 노출하지 않는다', () => {
    const view = yearEndView(state);
    const candidates = yearEndCandidates(state);
    expect(view.horses.length).toBeGreaterThan(0);
    expect(view.horses).toHaveLength(candidates.length);
    view.horses.forEach((row, i) => {
      expect(row.horseId).toBe(candidates[i]!.horseId);
      expect(row.options.map((option) => option.choice)).toEqual(candidates[i]!.allowed);
      expect(JSON.stringify(row)).not.toContain('OR');
    });
  });
  it('기본 제출이 성공하고 진행 게이트를 해제한다', () => {
    expect(yearEndPending(state)).toBe(true);
    expect(advanceWeekGated(state, []).blocked).toBe('year_end');
    const result = submitYearEnd(state, defaultSubmission(state));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(yearEndPending(result.state)).toBe(false);
      expect(advanceWeekGated(result.state, []).blocked).toBeNull();
    }
  });
  it('은퇴 선택은 소유 목록에서 말을 제외한다', () => {
    const input = defaultSubmission(state);
    const horse = input.horses.find((h) => yearEndCandidates(state).find((c) => c.horseId === h.horseId)!.allowed.includes('retire'))!;
    horse.choice = 'retire';
    const result = submitYearEnd(state, input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.horses[horse.horseId]!.ownerId).toBeNull();
      expect(result.state.owners[state.playerOwnerId]!.horseIds).not.toContain(horse.horseId);
    }
  });
});
