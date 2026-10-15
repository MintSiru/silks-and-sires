import { declareAiRunners } from '../../src/engine/season/declarations';
import { createRng } from '../../src/engine/rng';
import { beforeAll, describe, expect, it } from 'vitest';
import { cancelBet, eachWayTerms, forecastOdds, placeBet } from '../../src/engine/betting/betting';
import { BET_MAX_OUTLAY_PER_RACE } from '../../src/engine/config/betting';
import * as data from '../../src/engine/data/staticData';
import { recordMoney } from '../../src/engine/economy/ledger';
import { formatOdds } from '../../src/engine/race/odds';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { advanceWeek } from '../../src/engine/time/advance';
import { createGameSystems } from '../../src/engine/state/systems';
import type { GameState } from '../../src/engine/types';
import { myBetsView, raceBettingView } from '../../src/ui/betting/bettingView';
import { betErrorKo, betKindKo, feeKo } from '../../src/ui/game/text';

const staticData = {
  nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
  courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), sales: data.getSalesData(),
};
let base: GameState;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261011, playerName: '테스트 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } },
  { ...staticData, ...data.getPeopleData() });
});
function fixture() {
  const state = structuredClone(base);
  const meeting = state.seasonState.meetings.find((m) => m.date.week === state.date.week + 1)!;
  const declared = declareAiRunners(state, [meeting], createRng(20261011),
    (id) => staticData.courses.find((c) => c.id === id)?.country)[0]!;
  state.seasonState.meetings = state.seasonState.meetings.map((m) => m.id === meeting.id ? declared : m);
  const race = declared.races.find((r) => r.status === 'closed' && r.declarations.length >= 8)!;
  return { state, meeting, race, meetingId: meeting.id, raceId: race.race.id };
}
function placed(kind: 'win' | 'each_way' = 'win') {
  const f = fixture();
  const result = placeBet(f.state, { bookmakerId: data.getBookmakers()[0]!.id,
    meetingId: f.meetingId, raceId: f.raceId, horseId: f.race.declarations[0]!.horseId,
    kind, stake: 100 }, { bookmakers: data.getBookmakers() });
  if (!result.ok) throw new Error(result.error);
  return { ...f, state: result.state };
}
describe('베팅 화면', () => {
  it('다음 주 레이스의 선언 순서·두수·오즈·소유 여부를 보인다', () => {
    const { state, meetingId, raceId, race } = fixture();
    const view = raceBettingView(state, meetingId, raceId)!;
    expect(view.runners).toHaveLength(race.declarations.length);
    expect(view.runners.map((r) => r.horseId)).toEqual(race.declarations.map((d) => d.horseId));
    expect(view.runners.map((r) => r.forecastKo)).toEqual(forecastOdds(state, meetingId, raceId).map((r) => formatOdds(r.odds)));
    expect(view.runners[0]!.saddle).toBe(1);
    expect(view.runners.every((r) => r.isMine === (state.horses[r.horseId]!.ownerId === state.playerOwnerId))).toBe(true);
    expect(formatOdds({ num: 1, den: 1 })).toBe('Evs');
    expect(formatOdds({ num: 7, den: 2 })).toBe('7/2');
  });
  it('실제 선언 두수와 핸디캡 여부에 따라 연승 조건을 보인다', () => {
    const { state, meetingId, raceId, race } = fixture();
    const terms = eachWayTerms(race.declarations.length, race.race.kind === 'handicap');
    expect(raceBettingView(state, meetingId, raceId)!.eachWayKo).toBe(terms === null
      ? '연승 불가(4두 이하)' : `연승: ${terms.places}착까지 배당 1/${Math.round(1 / terms.fraction)}`);
    race.declarations = race.declarations.slice(0, 4);
    expect(raceBettingView(state, meetingId, raceId)!.eachWayKo).toBe('연승 불가(4두 이하)');
  });
  it('단승·연승 지출을 합산하고 취소하면 한도를 돌려준다', () => {
    const { state, meetingId, raceId } = placed();
    const bet = state.betting.open[0]!;
    const result = placeBet(state, { ...bet, kind: 'each_way', stake: 100 }, { bookmakers: data.getBookmakers() });
    if (!result.ok) throw new Error(result.error);
    expect(raceBettingView(result.state, meetingId, raceId)!.limitLeftKo).toBe(feeKo(BET_MAX_OUTLAY_PER_RACE - 300));
    const cancelled = cancelBet(result.state, bet.id);
    if (!cancelled.ok) throw new Error(cancelled.error);
    expect(raceBettingView(cancelled.state, meetingId, raceId)!.limitLeftKo).toBe(feeKo(BET_MAX_OUTLAY_PER_RACE - 200));
    expect(myBetsView(cancelled.state).open[0]!.outlayKo).toBe(feeKo(200));
  });
  it('베팅으로 자금이 감소하고 경주 후 정산 SP·회수·장부 손익을 보인다', () => {
    const { state } = placed();
    expect(state.owners[state.playerOwnerId]!.funds).toBe(base.owners[base.playerOwnerId]!.funds - 100);
    expect(myBetsView(state).open[0]!.canCancel).toBe(true);
    let next = advanceWeek(state, createGameSystems(staticData)).state;
    if (next.betting.history.length === 0) next = advanceWeek(next, createGameSystems(staticData)).state;
    const view = myBetsView(next);
    expect(view.open).toHaveLength(0);
    expect(view.history).toHaveLength(1);
    const settled = next.betting.history[0]!;
    expect(view.history[0]!.startingPriceKo).toBe(settled.startingPrice === null ? '—' : formatOdds(settled.startingPrice));
    expect(view.history[0]!.returnedKo).toBe(feeKo(settled.returned));
    const ledgerSum = next.economy.playerLedger.filter((e) => e.category === 'betting' && e.date.year === next.date.year)
      .reduce((sum, e) => sum + e.amount, 0);
    expect(view.yearNet).toBe(ledgerSum);
    next.betting.history = Array.from({ length: 25 }, (_, i) => ({ ...settled, id: `정산-${i}` }));
    expect(myBetsView(next).history).toHaveLength(20);
    expect(myBetsView(next).yearNet).toBe(ledgerSum);
  });
  it('올해 합계는 지난 해 거래를 제외한다', () => {
    const { state } = placed();
    recordMoney(state, state.playerOwnerId, 'betting', 500, state.date, null);
    state.economy.playerLedger.push({ category: 'betting', amount: 999, date: { year: state.date.year - 1, week: 1 }, horseId: null });
    expect(myBetsView(state).yearNet).toBe(400);
    expect(raceBettingView(state, '없는 개최', '없는 레이스')).toBeNull();
    expect(betKindKo('each_way')).toBe('연승');
    expect(betErrorKo('invalid_stake')).toContain('정수');
  });
});
