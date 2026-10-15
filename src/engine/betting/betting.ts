import { BET_FORECAST_TEMPERATURE, BET_HISTORY_LIMIT, BET_MAX_OUTLAY_PER_RACE, BET_MIN_STAKE, BET_PLACE_TERMS } from '../config/betting';
import { MARKET_OVERROUND } from '../config/raceday';
import { recordMoney } from '../economy/ledger';
import { canSpendDiscretionary } from '../economy/solvency';
import { formatOdds, probabilityToOdds } from '../race/odds';
import type { PlayerResult } from '../season/player';
import type { Bet, BookmakerDef, FractionalOdds, GameEvent, GameState, RaceResult, ScheduledRace, SettledBet } from '../types';
import { meanAbility, ratingFromAbility } from '../world/rating';

export type BetError = 'bookmaker_not_found' | 'race_not_found' | 'race_closed' | 'horse_not_declared'
  | 'invalid_stake' | 'each_way_unavailable' | 'over_limit' | 'insufficient_funds';

export function eachWayTerms(runners: number, isHandicap: boolean): { places: number; fraction: number } | null {
  const row = BET_PLACE_TERMS.find((t) => runners >= t.minRunners && (!t.handicapOnly || isHandicap));
  return row === undefined ? null : { places: row.places, fraction: row.fraction };
}

function locate(state: GameState, meetingId: string, raceId: string): ScheduledRace | undefined {
  return state.seasonState.meetings.find((m) => m.id === meetingId)?.races.find((r) => r.race.id === raceId);
}
function beforeRace(race: ScheduledRace): boolean {
  return race.status === 'open' || race.status === 'closed';
}
function outlay(bet: Pick<Bet, 'kind' | 'stake'>): number {
  return bet.stake * (bet.kind === 'each_way' ? 2 : 1);
}

export function placeBet(
  state: GameState,
  input: Pick<Bet, 'bookmakerId' | 'meetingId' | 'raceId' | 'horseId' | 'kind' | 'stake'>,
  data: { bookmakers: readonly BookmakerDef[] },
): PlayerResult<BetError> {
  if (!data.bookmakers.some((b) => b.id === input.bookmakerId)) return { ok: false, error: 'bookmaker_not_found' };
  const sr = locate(state, input.meetingId, input.raceId);
  if (sr === undefined) return { ok: false, error: 'race_not_found' };
  if (!beforeRace(sr)) return { ok: false, error: 'race_closed' };
  if (!sr.declarations.some((d) => d.horseId === input.horseId)) return { ok: false, error: 'horse_not_declared' };
  if (!Number.isSafeInteger(input.stake) || input.stake < BET_MIN_STAKE) return { ok: false, error: 'invalid_stake' };
  if (input.kind === 'each_way' && eachWayTerms(sr.declarations.length, sr.race.kind === 'handicap') === null) {
    return { ok: false, error: 'each_way_unavailable' };
  }
  const spent = state.betting.open.filter((b) => b.meetingId === input.meetingId && b.raceId === input.raceId)
    .reduce((sum, b) => sum + outlay(b), 0);
  if (spent + outlay(input) > BET_MAX_OUTLAY_PER_RACE) return { ok: false, error: 'over_limit' };
  if (!canSpendDiscretionary(state, outlay(input))) return { ok: false, error: 'insufficient_funds' };
  const next = structuredClone(state);
  const bet: Bet = { ...input, id: `bet_${state.date.year}_${next.betting.nextBetNo++}`, placed: { ...state.date } };
  recordMoney(next, next.playerOwnerId, 'betting', -outlay(bet), next.date, bet.horseId);
  next.betting.open.push(bet);
  return { ok: true, state: next, events: [] };
}

export function cancelBet(state: GameState, betId: string): PlayerResult<'bet_not_found' | 'race_closed'> {
  const bet = state.betting.open.find((b) => b.id === betId);
  if (bet === undefined) return { ok: false, error: 'bet_not_found' };
  const sr = locate(state, bet.meetingId, bet.raceId);
  if (sr === undefined || !beforeRace(sr)) return { ok: false, error: 'race_closed' };
  const next = structuredClone(state);
  next.betting.open = next.betting.open.filter((b) => b.id !== betId);
  recordMoney(next, next.playerOwnerId, 'betting', outlay(bet), next.date, bet.horseId);
  return { ok: true, state: next, events: [] };
}

/** 경주 확정 또는 취소 시 한 번 정산한다. 이미 정산한 경주를 다시 호출해도 지급하지 않는다. */
export function settleBetsForRace(
  draft: GameState, meetingId: string, raceId: string, result: RaceResult | null, isHandicap: boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  const bets = draft.betting.open.filter((b) => b.meetingId === meetingId && b.raceId === raceId);
  for (const bet of bets) {
    const runner = result?.runners.find((r) => r.horseId === bet.horseId);
    const terms = bet.kind === 'each_way' && result !== null ? eachWayTerms(result.runners.length, isHandicap) : null;
    let returned = outlay(bet);
    if (runner !== undefined) {
      const odds = runner.odds;
      // SP 미제공은 가격을 임의로 만들지 않고 전액 환불한다.
      if (odds !== null) {
        const ties = result!.runners.filter((r) => r.position === 1).length;
        returned = runner.position === 1 ? bet.stake / ties * (1 + odds.num / odds.den) : 0;
        if (bet.kind === 'each_way') {
          returned += terms === null ? bet.stake
            : runner.position <= terms.places ? bet.stake * (1 + odds.num / odds.den * terms.fraction) : 0;
        }
      }
    }
    returned = Math.floor(returned);
    const settled: SettledBet = {
      ...bet, horseName: draft.horses[bet.horseId]?.name ?? bet.horseId,
      raceName: locate(draft, meetingId, raceId)?.race.name ?? raceId,
      startingPrice: runner?.odds ?? null, position: runner?.position ?? null,
      placeTerms: terms, returned, settled: { ...draft.date },
    };
    if (returned > 0) recordMoney(draft, draft.playerOwnerId, 'betting', returned, draft.date, bet.horseId);
    draft.betting.history.unshift(settled);
    events.push({ type: 'bet_settled', betId: bet.id, horseId: bet.horseId, outlay: outlay(bet), returned, date: { ...draft.date } });
  }
  draft.betting.history = draft.betting.history.slice(0, BET_HISTORY_LIMIT);
  const ids = new Set(bets.map((b) => b.id));
  draft.betting.open = draft.betting.open.filter((b) => !ids.has(b.id));
  return events;
}

/** 화면용 예상 오즈(난수 없음). 실제 정산에는 경주 확정 오즈(SP)를 쓴다. */
export function forecastOdds(state: GameState, meetingId: string, raceId: string): { horseId: string; odds: FractionalOdds }[] {
  const declarations = locate(state, meetingId, raceId)?.declarations ?? [];
  const ratings = declarations.map((d) => {
    const horse = state.horses[d.horseId];
    if (horse === undefined) throw new Error(`말을 찾을 수 없음: ${d.horseId}`);
    return horse.officialRating ?? ratingFromAbility(meanAbility(horse.ability));
  });
  const max = ratings.reduce((a, b) => Math.max(a, b), -Infinity);
  const weights = ratings.map((r) => Math.exp((r - max) / BET_FORECAST_TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  return declarations.map((d, i) => ({ horseId: d.horseId, odds: probabilityToOdds(weights[i]! / total, MARKET_OVERROUND) }));
}

export function bettingView(state: GameState) {
  const view = (bet: SettledBet | Bet) => ({
    ...bet,
    horseName: 'horseName' in bet ? bet.horseName : (state.horses[bet.horseId]?.name ?? bet.horseId),
    raceName: 'raceName' in bet ? bet.raceName : (locate(state, bet.meetingId, bet.raceId)?.race.name ?? bet.raceId),
    outlay: outlay(bet),
  });
  return {
    open: state.betting.open.map((bet) => ({ ...view(bet), startingPrice: null, returned: null })),
    history: state.betting.history.map((bet) => ({ ...view(bet), ...bet,
      startingPrice: bet.startingPrice === null ? null : formatOdds(bet.startingPrice) })),
  };
}
