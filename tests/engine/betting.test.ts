import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cancelBet, eachWayTerms, forecastOdds, placeBet, settleBetsForRace, bettingView } from '../../src/engine/betting/betting';
import * as data from '../../src/engine/data/staticData';
import { runMeeting } from '../../src/engine/season/raceday';
import { createRng } from '../../src/engine/rng';
import { isEligible } from '../../src/engine/season/eligibility';
import { declarePlayerHorse } from '../../src/engine/season/player';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type { Bet, GameState, RaceResult, RaceTemplate, RunnerResult } from '../../src/engine/types';
import g1 from '../../data/calendar/g1.json';
import gb from '../../data/calendar/pattern_gb_ie.json';
import fr from '../../data/calendar/pattern_fr_de_it.json';
import extra from '../../data/calendar/g1_extra.json';

const observations = vi.hoisted(() => ({ winners: [] as string[] }));
vi.mock('../../src/engine/season/raceday', async (original) => {
  const actual = await original<typeof import('../../src/engine/season/raceday')>();
  return { ...actual, runMeetingInPlace: (...args: Parameters<typeof actual.runMeetingInPlace>) => {
    const out = actual.runMeetingInPlace(...args);
    observations.winners.push(...out.results.map((r) => `${r.raceId}:${r.runners.filter((h) => h.position === 1).map((h) => h.horseId).join(',')}`));
    return out;
  } };
});
const options = { seed: 20261011, playerName: 'Test Owner', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const bookmakers = data.getBookmakers();
const input = { bookmakerId: bookmakers[0]!.id, meetingId: 'm', raceId: 'r', horseId: 'h0', kind: 'win' as Bet['kind'], stake: 100 };
function fixture(count = 8) {
  const state = createNewGame(options);
  state.seasonState.meetings = [{ id: 'm', date: { ...state.date }, going: null,
    racecourseId: g1[0]!.racecourseId, races: [{ race: { ...g1[0], id: 'r' } as RaceTemplate,
      templateId: null, status: 'open', simulated: false, declarations: Array.from({ length: count }, (_, i) => ({
        horseId: `h${i}`, ownerId: state.playerOwnerId, trainerId: null, jockeyId: null, weightLb: null, isPlayer: true,
      })) }] }];
  return state;
}
function placed(state = fixture(), override: Partial<typeof input> = {}) {
  const out = placeBet(state, { ...input, ...override }, { bookmakers });
  if (!out.ok) throw new Error(out.error);
  return out.state;
}
function result(position: number, count = 8, tie = false): RaceResult {
  return { raceId: 'r', racecourseId: g1[0]!.racecourseId, date: { year: 2026, week: 1 }, going: 'good',
    distance: 1600, seed: 1, winningTime: 100, sectionalMarks: [],
    runners: Array.from({ length: count }, (_, i) => ({ runnerIndex: i, horseId: `h${i}`, saddleCloth: i + 1,
      draw: i + 1, jockeyId: 'j', weightLb: 126, position: i === 0 ? position : tie && i === 1 ? 1 : i + 1,
      finishTime: 100 + i, margin: null, beatenLengths: i, sectionals: [], performanceFigure: 0, odds: { num: 4, den: 1 },
    } satisfies RunnerResult)) };
}
describe('베팅 엔진', () => {
  it.each([[4,false,null],[5,false,[2,.25]],[7,true,[2,.25]],[8,false,[3,.2]],[11,true,[3,.2]],
    [12,true,[3,.25]],[15,true,[3,.25]],[16,true,[4,.25]],[16,false,[3,.2]]])('연승 경계 %s %s', (n,h,expected) => {
    const terms = eachWayTerms(n as number, h as boolean);
    expect(terms === null ? null : [terms.places, terms.fraction]).toEqual(expected);
  });
  it('실패 8종과 입력 보존', () => {
    const s = fixture(); const before = structuredClone(s);
    const check = (st: GameState, patch: Partial<typeof input>, error: string) =>
      expect(placeBet(st, { ...input, ...patch }, { bookmakers })).toEqual({ ok: false, error });
    check(s, { bookmakerId: 'missing' }, 'bookmaker_not_found');
    check(s, { raceId: 'missing' }, 'race_not_found');
    const closed = fixture(); closed.seasonState.meetings[0]!.races[0]!.status = 'run';
    check(closed, {}, 'race_closed');
    check(s, { horseId: 'missing' }, 'horse_not_declared');
    for (const stake of [0, 9, 10.5, NaN, Infinity]) check(s, { stake }, 'invalid_stake');
    check(fixture(4), { kind: 'each_way' }, 'each_way_unavailable');
    check(s, { stake: 20001 }, 'over_limit');
    const poor = fixture(); poor.owners[poor.playerOwnerId]!.funds = 0;
    check(poor, {}, 'insufficient_funds');
    expect(s).toEqual(before);
  });
  it('회사·종류를 합친 상한과 취소 환불·취소 실패', () => {
    const s = placed(fixture(), { kind: 'each_way', stake: 10000 });
    expect(placeBet(s, { ...input, bookmakerId: bookmakers[1]!.id }, { bookmakers })).toEqual({ ok: false, error: 'over_limit' });
    expect(cancelBet(s, 'missing')).toEqual({ ok: false, error: 'bet_not_found' });
    const cancelled = cancelBet(s, s.betting.open[0]!.id);
    expect(cancelled.ok && cancelled.state.economy.currentYear.player.betting).toBe(0);
    s.seasonState.meetings[0]!.races[0]!.status = 'abandoned';
    expect(cancelBet(s, s.betting.open[0]!.id)).toEqual({ ok: false, error: 'race_closed' });
  });
  it.each([
    ['win',1,8,false,500],['each_way',2,8,false,180],['each_way',8,8,false,0],
    ['win',1,8,true,250],['each_way',1,8,true,430],['each_way',4,4,false,100],
  ] as const)('정산 %s %s착 %s두 동착%s', (kind, position, count, tie, returned) => {
    const s = placed(fixture(), { kind });
    const events = settleBetsForRace(s, 'm', 'r', result(position, count, tie), false);
    expect(s.betting.history[0]!.returned).toBe(returned);
    expect(s.economy.currentYear.player.betting).toBe(-(kind === 'win' ? 100 : 200) + returned);
    expect(events[0]).toMatchObject({ type: 'bet_settled', returned });
    expect(settleBetsForRace(s, 'm', 'r', null, false)).toEqual([]);
    expect(bettingView(s).history[0]!.startingPrice).toBe('4/1');
  });
  it.each([true, false])('레이스 취소 또는 출주 취소 전액 환불 %s', (cancelled) => {
    const s = placed(fixture(), { kind: 'each_way' });
    const r = result(1); r.runners.shift();
    settleBetsForRace(s, 'm', 'r', cancelled ? null : r, false);
    expect(s.betting.history[0]).toMatchObject({ startingPrice: null, returned: 200, position: null });
    expect(s.economy.currentYear.player.betting).toBe(0);
  });
  it('중단 개최 처리에서 환불 이벤트를 내고, 지난 개최의 표시 이름을 보존한다', () => {
    const s = placed(fixture(), { kind: 'each_way' });
    const meeting = s.seasonState.meetings[0]!;
    meeting.races[0]!.status = 'abandoned';
    const out = runMeeting(s, meeting, { courses: data.getRacecourses(), series: [], nicks: [] }, createRng(20261011));
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'bet_settled', returned: 200 }));
    expect(out.state.economy.currentYear.player.betting).toBe(0);
    out.state.seasonState.meetings = [];
    expect(bettingView(out.state).history[0]!.raceName).toBe(meeting.races[0]!.race.name);
    expect(s.betting.open).toHaveLength(1);
  });
  it('최근 기록은 50건이며 회수액은 내림한다', () => {
    let s = fixture(); for (let i = 0; i < 51; i++) s = placed(s, { stake: 11 });
    const r = result(1); r.runners[0]!.odds = { num: 1, den: 3 };
    settleBetsForRace(s, 'm', 'r', r, false);
    expect(s.betting.history).toHaveLength(50);
    expect(s.betting.history[0]!.returned).toBe(14);
  });
});

const staticData = {
  nicks: data.getNicks(), naming: data.getNamingData(), stallionNames: data.getStallionNames(),
  stallionRecords: data.getStallionRecords(), ...data.getPeopleData(), courses: data.getRacecourses(),
  templates: data.getRaceTemplates(), series: data.getSeriesDefinitions(),
};
let base: GameState;
beforeAll(() => { base = bootstrapGame(options, staticData); }, 120000);
it('시드 20261011 실제 주간 진행에서 정산·예상 오즈 결정성', () => {
  const systems = createGameSystems(staticData);
  let s = structuredClone(base);
  for (let i = 0; i < 26; i++) {
    s = advanceWeek(s, systems).state;
    let target: { meetingId: string; raceId: string; horseId: string } | undefined;
    for (const meeting of s.seasonState.meetings) {
      for (const race of meeting.races) {
        for (const horseId of s.owners[s.playerOwnerId]!.horseIds) {
          const horse = s.horses[horseId]!;
          if (horse.trainerId === null || race.status !== 'open' || !isEligible(horse, race.race, meeting.date, s.seasonState)) continue;
          const declared = declarePlayerHorse(s, meeting.id, race.race.id, horseId);
          if (declared.ok) {
            s = declared.state;
            target = { meetingId: meeting.id, raceId: race.race.id, horseId };
            break;
          }
        }
        if (target) break;
      }
      if (target) break;
    }
    if (target) {
      const m = s.seasonState.meetings.find((m) => m.id === target.meetingId)!;
      const sr = m.races.find((r) => r.race.id === target.raceId)!;
      const odds = forecastOdds(s, m.id, sr.race.id);
      expect(odds).toEqual(forecastOdds(s, m.id, sr.race.id));
      expect(odds).toHaveLength(sr.declarations.length);
      const bet = placeBet(s, { ...input, meetingId: m.id, raceId: sr.race.id, horseId: sr.declarations[0]!.horseId }, { bookmakers });
      if (!bet.ok) throw new Error(bet.error);
      s = advanceWeek(bet.state, systems).state;
      if (s.betting.history.length === 0) s = advanceWeek(s, systems).state;
      expect(s.betting.history).toHaveLength(1);
      expect(s.betting.open).toHaveLength(0);
      return;
    }
  }
  throw new Error('베팅 가능한 경주 없음');
}, 120000);
it('베팅 없이 후원 적용 전후 26주 우승마 목록 동일', () => {
  const raw = { ...staticData, templates: [...g1, ...gb, ...fr, ...extra] as RaceTemplate[] };
  const run = (d: typeof staticData) => {
    observations.winners = [];
    let state = bootstrapGame(options, d);
    const systems = createGameSystems(d);
    for (let i = 0; i < 26; i++) state = advanceWeek(state, systems).state;
    return [...observations.winners];
  };
  const before = run(raw);
  const after = run(staticData);
  expect(before.length).toBeGreaterThan(0);
  expect(after).toEqual(before);
}, 600000);
