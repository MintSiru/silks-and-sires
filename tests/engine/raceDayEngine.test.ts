import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { buildWeekMeetings } from '../../src/engine/season/meetings';
import { buildRaceField } from '../../src/engine/season/field';
import { createRacePlansSystem } from '../../src/engine/season/racePlan';
import { pendingRaceDays, prepareRaceDay, raceDayBrief, setRaceOrder } from '../../src/engine/season/raceDayBrief';
import { runMeeting } from '../../src/engine/season/raceday';
import { rollGoing } from '../../src/engine/going/going';
import { monthOfWeek } from '../../src/engine/time/calendar';
import { runRace } from '../../src/engine/race/runRace';
import { buildEntries, type EntryRequest } from '../../src/engine/race/setup';
import { summarizeRace } from '../../src/engine/season/summary';
import * as simulator from '../../src/engine/race/simulate';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import type { GameState, RaceResult, RunningStyle } from '../../src/engine/types';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
const country = (id: string) => staticData.courses.find((c) => c.id === id)?.country;
let base: GameState;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
});

function fixture(seed = 0) {
  const state = structuredClone(base);
  const meeting = state.seasonState.meetings[0]!;
  state.date = { ...meeting.date };
  meeting.seed = seed;
  const sr = meeting.races.find((r) => r.status === 'open' && r.declarations.length >= 3)!;
  const horse = Object.values(state.horses).find((h) => h.ownerId === state.playerOwnerId
    && h.status === 'in_training' && state.date.year - h.birthYear === 3)!;
  // 현 편성의 자격을 복사하되 기존 플레이어 말의 이름·소유·조교사는 유지한다.
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
  return { state, meetingId: meeting.id, raceId: sr.race.id, horseId: horse.id };
}

function prepared(seed = 0) {
  const f = fixture(seed);
  return { ...f, ...prepareRaceDay(f.state, staticData) };
}

describe('M7-RD1 개최와 당일 신청', () => {
  it('개최당 정수 시드 하나를 배정하고 같은 입력으로 재현한다', () => {
    const args = { date: base.date, courses: staticData.courses, templates: staticData.templates, nextGeneratedRace: 1 };
    const a = buildWeekMeetings({ ...args, rng: createRng('meeting-seed') });
    expect(buildWeekMeetings({ ...args, rng: createRng('meeting-seed') })).toEqual(a);
    expect(a.meetings.length).toBeGreaterThan(0);
    expect(a.meetings.every((m) => Number.isInteger(m.seed))).toBe(true);
    expect(buildWeekMeetings({ ...args, rng: createRng('other-meeting-seed') })).not.toEqual(a);
  });

  it('준비는 원본·rng 를 보존하고 반복 호출 및 주간 시스템에서 중복 신청하지 않는다', () => {
    const f = fixture();
    const before = structuredClone(f.state);
    expect(pendingRaceDays(f.state)).toEqual([]);
    const first = prepareRaceDay(f.state, staticData);
    expect(f.state).toEqual(before);
    expect(first.state.rng).toEqual(before.rng);
    expect(first.events.filter((e) => e.type === 'race_plan_declared')).toEqual([
      { type: 'race_plan_declared', raceId: f.raceId, horseId: f.horseId, date: f.state.date },
    ]);
    expect(pendingRaceDays(first.state)).toContainEqual({ meetingId: f.meetingId, raceId: f.raceId, horseId: f.horseId });
    const second = prepareRaceDay(first.state, staticData);
    expect(second).toEqual({ state: first.state, events: [] });
    const draft = structuredClone(first.state);
    const rng = createRng('untouched');
    const rngBefore = rng.getState();
    expect(createRacePlansSystem(staticData).run(draft, { date: draft.date, rng })).toEqual([]);
    expect(draft).toEqual(first.state);
    expect(rng.getState()).toEqual(rngBefore);
  });

  it('수동 승인 대기 계획은 신청하지 않고 미래·취소·이미 실행한 레이스는 pending 에서 제외한다', () => {
    const f = fixture();
    f.state.settings.autoApproveRacePlans = false;
    f.state.seasonState.racePlans![f.horseId]![0]!.status = 'proposed';
    expect(pendingRaceDays(prepareRaceDay(f.state, staticData).state)).toEqual([]);
    const p = prepared();
    const m = p.state.seasonState.meetings.find((m) => m.id === p.meetingId)!;
    const sr = m.races.find((r) => r.race.id === p.raceId)!;
    sr.status = 'abandoned';
    expect(pendingRaceDays(p.state)).toEqual([]);
    sr.status = 'run';
    expect(pendingRaceDays(p.state)).toEqual([]);
    sr.status = 'open';
    p.state.date.week++;
    expect(pendingRaceDays(p.state)).toEqual([]);
  });
});

describe('M7-RD1 출주표와 실행 일치', () => {
  it.each([0, 1, 20261017, 987654321])('개최 시드 %i: 실제 주간 실행의 게이트·기수·감량 후 중량·마번·마장이 같다', (seed) => {
    const f = prepared(seed);
    const brief = raceDayBrief(f.state, f.raceId, f.horseId, staticData);
    const out = advanceWeek(f.state, createGameSystems(staticData));
    const result = out.state.raceResults.find((r) => r.raceId === f.raceId && r.date.year === f.state.date.year)!;
    expect(result).toBeDefined();
    expect(result.going).toBe(brief.card.going);
    expect(result.runners).toHaveLength(brief.card.runners.length);
    for (const row of brief.card.runners) {
      expect(result.runners.find((r) => r.horseId === row.horseId)).toMatchObject({
        horseId: row.horseId, draw: row.draw, jockeyId: row.jockeyId, weightLb: row.weightLb, saddleCloth: row.saddleCloth,
      });
    }
    expect(out.events.filter((e) => e.type === 'race_plan_declared')).toEqual([]);
    expect(out.state.seasonState.racePlans![f.horseId]!.find((p) => p.raceId === f.raceId)?.status).toBe('run');
  });

  it('held_up 지시는 실제 시뮬레이터까지 전달하고 미지정이면 선호 작전을 쓴다', () => {
    const f = prepared();
    const before = structuredClone(f.state);
    const order = setRaceOrder(f.state, f.raceId, f.horseId, 'held_up');
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(f.state).toEqual(before);
    const meeting = order.state.seasonState.meetings.find((m) => m.id === f.meetingId)!;
    const sr = meeting.races.find((r) => r.race.id === f.raceId)!;
    const rng = createRng('field-must-not-consume');
    const rngBefore = rng.getState();
    const built = buildRaceField(order.state, sr, meeting.date, rng, country, meeting.seed);
    expect(rng.getState()).toEqual(rngBefore);
    expect(built.field.requests.find((r) => r.horseId === f.horseId)?.tactic).toBe('held_up');
    expect(raceDayBrief(order.state, f.raceId, f.horseId, staticData).tactic).toBe('held_up');
    const spy = vi.spyOn(simulator, 'simulateRace');
    try {
      advanceWeek(order.state, createGameSystems(staticData));
      expect(spy.mock.calls.find(([input]) => input.race.id === f.raceId)?.[0].runners
        .find((r) => r.horse.id === f.horseId)?.entry.tactic).toBe('held_up');
    } finally { spy.mockRestore(); }
    const original = f.state.seasonState.meetings.find((m) => m.id === f.meetingId)!.races.find((r) => r.race.id === f.raceId)!;
    expect(buildRaceField(f.state, original, meeting.date, createRng(1), country, meeting.seed)
      .field.requests.find((r) => r.horseId === f.horseId)?.tactic).toBe('prominent');
  });

  it('작전은 이번 주 플레이어 선언마만 변경하며 잘못된 작전·소유·레이스는 거절한다', () => {
    const f = prepared();
    const ai = Object.values(f.state.horses).find((h) => h.ownerId !== f.state.playerOwnerId)!;
    expect(setRaceOrder(f.state, f.raceId, 'missing', 'held_up')).toEqual({ ok: false, error: 'not_found' });
    expect(setRaceOrder(f.state, f.raceId, ai.id, 'held_up')).toEqual({ ok: false, error: 'not_player_horse' });
    expect(setRaceOrder(f.state, 'missing', f.horseId, 'held_up')).toEqual({ ok: false, error: 'not_declared' });
    expect(setRaceOrder(f.state, f.raceId, f.horseId, 'invalid' as RunningStyle)).toEqual({ ok: false, error: 'invalid_tactic' });
    f.state.date.week++;
    expect(setRaceOrder(f.state, f.raceId, f.horseId, 'held_up')).toEqual({ ok: false, error: 'not_declared' });
  });

  it('확정 필드는 결과 시드와 독립이고 요약 모드도 확정 게이트를 사용한다', () => {
    const f = prepared(123);
    const brief = raceDayBrief(f.state, f.raceId, f.horseId, staticData);
    const m = f.state.seasonState.meetings.find((m) => m.id === f.meetingId)!;
    const sr = m.races.find((r) => r.race.id === f.raceId)!;
    m.races = [sr];
    sr.status = 'closed';
    sr.race.grade = null;
    sr.declarations.forEach((d) => { d.isPlayer = false; });
    const results = [7, 77].map((seed) => runMeeting(f.state, m, staticData, createRng(seed)).results[0]!);
    expect(results[0]!.seed).not.toBe(results[1]!.seed);
    for (const result of results) {
      expect(result.going).toBe(brief.card.going);
      for (const row of brief.card.runners) expect(result.runners.find((r) => r.horseId === row.horseId))
        .toMatchObject({ draw: row.draw, jockeyId: row.jockeyId, weightLb: row.weightLb });
    }
  });

  it.each([false, true])('seed 없는 개최는 기존 마장·결과 시드·필드·게이트 및 rng 소비를 유지한다 (시뮬레이션 %s)', (simulate) => {
    const f = prepared();
    const m = f.state.seasonState.meetings.find((m) => m.id === f.meetingId)!;
    delete m.seed;
    const sr = m.races.find((r) => r.race.id === f.raceId)!;
    m.races = [sr];
    sr.status = 'closed';
    sr.race.grade = null;
    sr.declarations.forEach((d) => { d.isPlayer = simulate && d.horseId === f.horseId; });
    const rng = createRng('legacy-execution');
    const course = staticData.courses.find((c) => c.id === m.racecourseId)!;
    const going = rollGoing(rng.fork('going:' + m.id), course, monthOfWeek(m.date.week));
    const raceRng = rng.fork('race:' + f.raceId);
    const seed = raceRng.int(0, 0x7fffffff);
    const field = buildRaceField(f.state, sr, m.date, raceRng, country).field;
    const input = { race: sr.race, course, going, date: m.date, seed, field, recordReplay: false };
    const expected = simulate ? runRace(input).sim.result : summarizeRace(input);
    const actualRng = createRng('legacy-execution');
    const actual = runMeeting(f.state, m, staticData, actualRng);
    expect(actual.results).toEqual([expected]);
    expect(actualRng.getState()).toEqual(rng.getState());
  });

  it('다시보기 입력(저장된 field)을 다시 돌리면 실제 실행과 같은 게이트·결과를 낸다', () => {
    const f = prepared(20261017);
    const brief = raceDayBrief(f.state, f.raceId, f.horseId, staticData);
    const out = advanceWeek(f.state, createGameSystems(staticData));
    const replay = out.state.seasonState.replayable.find((r) => r.race.id === f.raceId)!;
    expect(replay).toBeDefined();
    const actual = out.state.raceResults.find((r) => r.raceId === f.raceId && r.date.year === f.state.date.year)!;
    const course = staticData.courses.find((c) => c.id === replay.race.racecourseId)!;
    const rerun = runRace({ race: replay.race, course, going: replay.going, date: replay.date, seed: replay.seed,
      field: replay.field, recordReplay: false });
    for (const row of brief.card.runners) {
      expect(rerun.entries.find((e) => e.horseId === row.horseId))
        .toMatchObject({ draw: row.draw, saddleCloth: row.saddleCloth, weightLb: row.weightLb, jockeyId: row.jockeyId });
    }
    expect(rerun.sim.result.runners.map((r) => [r.horseId, r.position, r.finishTime]))
      .toEqual(actual.runners.map((r) => [r.horseId, r.position, r.finishTime]));
  });

  it('선택 필드는 저장 버전 변경 없이 왕복하고 없는 옛 형태도 읽힌다', () => {
    const f = prepared();
    const order = setRaceOrder(f.state, f.raceId, f.horseId, 'held_up');
    if (!order.ok) throw new Error(order.error);
    for (const state of [order.state, (() => {
      const old = structuredClone(f.state);
      old.seasonState.meetings.forEach((m) => { delete m.seed; m.races.forEach((r) => r.declarations.forEach((d) => { delete d.tactic; })); });
      return old;
    })()]) {
      const restored = deserializeGame(serializeGame(state, '2026-10-17T00:00:00Z'));
      expect(restored.ok).toBe(true);
      if (restored.ok) expect(restored.state).toEqual(state);
    }
  });
});

describe('M7-RD1 당일 소견', () => {
  it('상태·rng 를 깊게 보존하고 결정적이며 반환값도 원본과 참조를 공유하지 않는다', () => {
    const f = prepared();
    const before = structuredClone(f.state);
    const brief = raceDayBrief(f.state, f.raceId, f.horseId, staticData);
    expect(raceDayBrief(f.state, f.raceId, f.horseId, staticData)).toEqual(brief);
    expect(f.state).toEqual(before);
    expect(brief.paddock[0]?.horseId).toBe(f.horseId);
    expect(brief.paddock).toHaveLength(brief.card.runners.length);
    expect(brief.comments.map((c) => c.speaker)).toEqual(['trainer', 'jockey']);
    expect(brief.comments.every((c) => c.text.length > 0)).toBe(true);
    brief.card.race.conditions.baseWeightLb = -1;
    brief.card.runners[0]!.silks.primary = '#000000';
    brief.card.date.week = -1;
    expect(f.state).toEqual(before);
  });

  it.each([0, 1, 2, 3])('선행형 %i두는 slow/slow/even/fast, 선호 작전 기준 한 단계 추천', (fronts) => {
    const f = prepared();
    const sr = f.state.seasonState.meetings.find((m) => m.id === f.meetingId)!.races.find((r) => r.race.id === f.raceId)!;
    const ai = sr.declarations.filter((d) => d.horseId !== f.horseId);
    ai.forEach((d, i) => { f.state.horses[d.horseId]!.preferredStyle = i < fronts ? 'front' : 'midfield'; });
    f.state.horses[f.horseId]!.preferredStyle = 'midfield';
    const b = raceDayBrief(f.state, f.raceId, f.horseId, staticData);
    expect(b.paceOutlook).toBe(fronts <= 1 ? 'slow' : fronts >= 3 ? 'fast' : 'even');
    expect(b.recommendedTactic).toBe(fronts <= 1 ? 'prominent' : fronts >= 3 ? 'held_up' : 'midfield');
  });

  it('패독은 피로·준비도·성격·휴양·나이를 문장과 tone 으로 표현한다', () => {
    const f = prepared();
    const h = f.state.horses[f.horseId]!;
    h.personality.composure = 50; h.personality.timidity = 50;
    const note = () => raceDayBrief(f.state, f.raceId, f.horseId, staticData).paddock[0]!;
    expect(note()).toMatchObject({ tone: 'good', text: expect.stringContaining('윤기') });
    h.condition.fatigue = 100;
    expect(note()).toMatchObject({ tone: 'bad', text: expect.stringContaining('땀') });
    h.condition.fatigue = 0; h.condition.fitness = 0;
    expect(note()).toMatchObject({ tone: 'bad', text: expect.stringContaining('준비') });
    h.condition.fitness = 100; h.personality.composure = 0;
    expect(note().text).toContain('흥분');
    h.personality.composure = 50; h.personality.timidity = 100;
    expect(note().text).toContain('주변');
    h.personality.timidity = 50;
    f.state.seasonState.lastRun[h.id] = { year: f.state.date.year - 1, week: 1 };
    expect(note().text).toContain('오랜만');
    delete f.state.seasonState.lastRun[h.id];
    h.birthYear = f.state.date.year - 2; h.condition.fitness = 75;
    expect(note()).toMatchObject({ tone: 'neutral', text: expect.stringContaining('어린') });
  });

  it('최근 전적은 최신 5전, 공개 OR·선호 작전·가상 인명을 표시하고 아침 오즈는 숨은 능력을 쓰지 않는다', () => {
    const f = prepared();
    for (let i = 1; i <= 7; i++) {
      f.state.raceResults.push({ raceId: `history-${i}`, racecourseId: 'ashcombe', date: { year: 2025, week: i },
        going: 'good', distance: 1609, seed: i, winningTime: 100, sectionalMarks: [],
        runners: [{ runnerIndex: 0, horseId: f.horseId, saddleCloth: 1, draw: 1, jockeyId: '', weightLb: 126,
          position: i, finishTime: 100, margin: null, beatenLengths: 0, sectionals: [], performanceFigure: 0, odds: null }],
      } satisfies RaceResult);
    }
    const first = raceDayBrief(f.state, f.raceId, f.horseId, staticData);
    const row = first.card.runners.find((r) => r.horseId === f.horseId)!;
    expect(row.recentForm).toEqual([7, 6, 5, 4, 3]);
    expect(row.or).toBe(f.state.horses[f.horseId]!.officialRating);
    expect(row.ownerName).toBe(f.state.owners[f.state.playerOwnerId]!.name);
    for (const r of first.card.runners) {
      const horse = f.state.horses[r.horseId]!;
      horse.ability = { speed: 1, stamina: 2, acceleration: 3, guts: 4, power: 5 };
      expect(r.morningOdds.num).toBeGreaterThan(0);
      expect(r.morningOdds.den).toBeGreaterThan(0);
      expect(r).not.toHaveProperty('ability');
      expect(r).not.toHaveProperty('aptitude');
    }
    expect(raceDayBrief(f.state, f.raceId, f.horseId, staticData).card).toEqual(first.card);
  });
});

describe('M7-RD1b 확정 게이트 입력', () => {
  const silks = () => structuredClone(base.owners[base.playerOwnerId]!.silks);
  const req = (horseId: string, draw?: number): EntryRequest => ({
    horseId, jockeyId: 'jockey-x', tactic: 'midfield', silks: silks(), isPlayer: false,
    weightLb: 126, jockeyAllowanceLb: 0, ...(draw === undefined ? {} : { draw }),
  });

  it('요청에 게이트가 모두 있으면 추첨 rng 를 쓰지 않고 그 값을 쓰며, 일부만 있거나 순열이 아니면 거절한다', () => {
    const rng = createRng('confirmed-draw');
    const before = rng.getState();
    const entries = buildEntries(rng, [req('a', 3), req('b', 1), req('c', 2)]);
    expect(entries.map((e) => e.draw)).toEqual([3, 1, 2]);
    expect(rng.getState()).toEqual(before);
    expect(() => buildEntries(createRng('x'), [req('a', 1), req('b')])).toThrow(RangeError);
    expect(() => buildEntries(createRng('x'), [req('a', 1), req('b', 1)])).toThrow(RangeError);
  });
});
