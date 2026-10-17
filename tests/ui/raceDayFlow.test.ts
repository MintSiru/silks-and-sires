import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import * as simulator from '../../src/engine/race/simulate';
import { pendingRaceDays, prepareRaceDay, raceDayBrief, setRaceOrder } from '../../src/engine/season/raceDayBrief';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeeksGated } from '../../src/engine/stud/yearEnd';
import type { GameState, HorseId, RaceId } from '../../src/engine/types';
import type { GameApi } from '../../src/ui/game/useGame';
import { WeightUnitProvider } from '../../src/ui/game/WeightUnitContext';
import { decisionStopFrom, decisionStopReason, RACE_DAY_REASON } from '../../src/ui/shell/decisionStop';
import RaceDayScreen from '../../src/ui/raceDay/RaceDayScreen';

/** useGame 의 gameStaticData 와 같은 구성(정적 데이터 전체) */
const staticData = {
  ...data.getPeopleData(),
  courses: data.getRacecourses(),
  templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(),
  nicks: data.getNicks(),
  naming: data.getNamingData(),
  stallionNames: data.getStallionNames(),
  stallionRecords: data.getStallionRecords(),
  sales: data.getSalesData(),
};
let base: GameState;

beforeAll(() => {
  base = bootstrapGame({
    seed: 20261017, playerName: '가상 마주', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  }, staticData);
});

/** 플레이어 말 한 마리가 이번 주 개최 레이스에 자동 신청되는 상태(engine 테스트의 fixture 와 같은 방식) */
function fixture(seed = 0) {
  const state = structuredClone(base);
  const meeting = state.seasonState.meetings[0]!;
  state.date = { ...meeting.date };
  meeting.seed = seed;
  const sr = meeting.races.find((r) => r.status === 'open' && r.declarations.length >= 3)!;
  const horse = Object.values(state.horses).find((h) => h.ownerId === state.playerOwnerId
    && h.status === 'in_training' && state.date.year - h.birthYear === 3)!;
  const source = state.horses[sr.declarations[0]!.horseId]!;
  horse.birthYear = source.birthYear;
  horse.sex = source.sex;
  horse.record = { ...source.record };
  horse.officialRating = source.officialRating;
  horse.aptitude = { ...source.aptitude, distanceOptimum: sr.race.distance };
  horse.condition = { fitness: 100, fatigue: 0, mental: 100, injury: null };
  horse.preferredStyle = 'prominent';
  delete state.seasonState.lastRun[horse.id];
  sr.templateId = sr.race.id;
  state.seasonState.racePlans = { [horse.id]: [{ id: `${horse.id}:${state.date.year}-${state.date.week}`,
    date: { ...state.date }, templateId: sr.race.id, target: null, status: 'approved', note: '당일 신청' }] };
  return { state, meetingId: meeting.id, raceId: sr.race.id as RaceId, horseId: horse.id as HorseId };
}

/** 화면이 하는 순서: 신청 확정 → 상태에 넣기 */
function afterPrepare(state: GameState): GameState {
  const { state: prepared } = prepareRaceDay(state, staticData);
  return prepared;
}

describe('M7-RD 화면 흐름의 엔진 호출 순서', () => {
  it('작전을 추입으로 바꾸고 주를 진행하면 내 말의 출주 기록 작전이 held_up 이다', () => {
    const f = fixture();
    const prepared = afterPrepare(f.state);
    expect(pendingRaceDays(prepared)).toContainEqual({ meetingId: f.meetingId, raceId: f.raceId, horseId: f.horseId });
    const order = setRaceOrder(prepared, f.raceId, f.horseId, 'held_up');
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(raceDayBrief(order.state, f.raceId, f.horseId, staticData).tactic).toBe('held_up');

    const spy = vi.spyOn(simulator, 'simulateRace');
    try {
      const out = advanceWeeksGated(order.state, createGameSystems(staticData), 1);
      const input = spy.mock.calls.find(([arg]) => arg.race.id === f.raceId)?.[0];
      expect(input?.runners.find((r) => r.horse.id === f.horseId)?.entry.tactic).toBe('held_up');
      const replay = out.state.seasonState.replayable.find((r) => r.race.id === f.raceId && r.meetingId === f.meetingId);
      expect(replay?.field.requests.find((r) => r.horseId === f.horseId)?.tactic).toBe('held_up');
      expect(pendingRaceDays(out.state)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('신청 전에는 작전을 바꿀 수 없고 상태는 그대로 둔다', () => {
    const f = fixture();
    const before = structuredClone(f.state);
    expect(setRaceOrder(f.state, f.raceId, f.horseId, 'held_up')).toEqual({ ok: false, error: 'not_declared' });
    expect(f.state).toEqual(before);
  });
});

describe('M7-RD 정지 규칙', () => {
  it('내 말 출주 주에 멈추고, raceDayMode 가 skip 이면 멈추지 않는다', () => {
    const f = fixture();
    expect(decisionStopReason(f.state)).toBe(RACE_DAY_REASON);
    f.state.settings.raceDayMode = 'skip';
    expect(decisionStopReason(f.state)).not.toBe(RACE_DAY_REASON);
    const stop = decisionStopFrom({ ...f.state.date, week: f.state.date.week - 1 });
    f.state.settings.raceDayMode = 'brief';
    expect(stop.stop(f.state)).toBe(true);
    expect(stop.reason).toBe(RACE_DAY_REASON);
  });

  it('승인제에서 승인하지 않은 계획은 출주 주라도 멈추지 않는다', () => {
    const f = fixture();
    f.state.settings.autoApproveRacePlans = false;
    f.state.seasonState.racePlans![f.horseId]![0]!.status = 'proposed';
    expect(decisionStopReason(f.state)).not.toBe(RACE_DAY_REASON);
  });
});

describe('M7-RD 출주표 화면 렌더', () => {
  it('출주표 화면은 작전 지시와 두 가지 진행 버튼을 보인다', () => {
    const f = fixture();
    const prepared = afterPrepare(f.state);
    const game = {
      state: prepared,
      raceDayBrief: (raceId: RaceId, horseId: HorseId) => raceDayBrief(prepared, raceId, horseId, staticData),
      setRaceOrder: () => ({ ok: false, error: 'not_declared' }),
      advance: () => undefined,
    } as unknown as GameApi;
    const html = renderToStaticMarkup(createElement(WeightUnitProvider, null,
      createElement(RaceDayScreen, {
        game, entries: [{ meetingId: f.meetingId, raceId: f.raceId, horseId: f.horseId }], onClose: () => undefined,
      })));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('출주표');
    expect(html).toContain('작전 지시');
    expect(html).toContain('추입');
    expect(html).toContain('출주 — 레이스 보기');
    expect(html).toContain('결과만 보기');
    expect(html).toContain('is-mine');
  });
});
