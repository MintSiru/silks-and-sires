import { bettingView, eachWayTerms, forecastOdds } from '../../engine/betting/betting';
import { BET_MAX_OUTLAY_PER_RACE } from '../../engine/config/betting';
import { getBookmakers } from '../../engine/data/staticData';
import { formatOdds } from '../../engine/race/odds';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameState } from '../../engine/types';
import { betKindKo, feeKo } from '../game/text';

export function raceBettingView(state: GameState, meetingId: string, raceId: string) {
  const meeting = state.seasonState.meetings.find((m) => m.id === meetingId);
  const race = meeting?.races.find((r) => r.race.id === raceId);
  if (meeting === undefined || race === undefined) return null;
  const terms = eachWayTerms(race.declarations.length, race.race.kind === 'handicap');
  const spent = bettingView(state).open
    .filter((b) => b.meetingId === meetingId && b.raceId === raceId)
    .reduce((sum, b) => sum + b.outlay, 0);
  return {
    raceName: race.race.name,
    dateKo: formatDateKo(meeting.date),
    canBet: race.status === 'open' || race.status === 'closed',
    runners: forecastOdds(state, meetingId, raceId).map((r, i) => ({
      horseId: r.horseId,
      name: state.horses[r.horseId]?.name ?? r.horseId,
      saddle: i + 1,
      forecastKo: formatOdds(r.odds),
      isMine: state.horses[r.horseId]?.ownerId === state.playerOwnerId,
    })),
    eachWayKo: terms === null ? '연승 불가(4두 이하)'
      : `연승: ${terms.places}착까지 배당 1/${Math.round(1 / terms.fraction)}`,
    eachWayAvailable: terms !== null,
    limitLeftKo: feeKo(Math.max(0, BET_MAX_OUTLAY_PER_RACE - spent)),
  };
}

/** 최근 정산은 엔진의 최신순 기록 중 20건, 연간 손익은 기록 보존 개수와 무관한 장부 합계다. */
export function myBetsView(state: GameState) {
  const bets = bettingView(state);
  const companies = new Map(getBookmakers().map((b) => [b.id, b.name]));
  return {
    open: bets.open.map((b) => {
      const race = state.seasonState.meetings.find((m) => m.id === b.meetingId)
        ?.races.find((r) => r.race.id === b.raceId);
      return {
        ...b, kindKo: betKindKo(b.kind), outlayKo: feeKo(b.outlay),
        bookmakerName: companies.get(b.bookmakerId) ?? b.bookmakerId,
        canCancel: race?.status === 'open' || race?.status === 'closed',
      };
    }),
    history: bets.history.slice(0, 20).map((b) => ({
      ...b, kindKo: betKindKo(b.kind), startingPriceKo: b.startingPrice ?? '—',
      positionKo: b.position === null ? '—' : `${b.position}착`,
      outlayKo: feeKo(b.outlay), returnedKo: feeKo(b.returned),
      net: b.returned - b.outlay, netKo: feeKo(b.returned - b.outlay),
    })),
    yearNet: state.economy.currentYear.player.betting ?? 0,
    yearNetKo: feeKo(state.economy.currentYear.player.betting ?? 0),
  };
}
