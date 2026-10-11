import { EVENT_LOG_LIMIT, WEEKS_PER_YEAR } from '../config/game';
import { rngFromState } from '../rng';
import type {
  AdvanceResult,
  GameDate,
  GameEvent,
  GameState,
  WeekContext,
  WeeklySystem,
} from '../types';
import { CALENDAR_PHASE_ORDER, isInPhase, nextDate, seasonForYear } from './calendar';

/** 달력 단계 경계(phase_started / phase_ended) 이벤트를 낸다. 난수 미사용. */
export const calendarSystem: WeeklySystem = {
  id: 'calendar',
  run(_draft: GameState, ctx: WeekContext): GameEvent[] {
    const week = ctx.date.week;
    const prevWeek = week === 1 ? WEEKS_PER_YEAR : week - 1;
    const nextWeek = week === WEEKS_PER_YEAR ? 1 : week + 1;

    const events: GameEvent[] = [{ type: 'week_started', date: ctx.date }];

    for (const phase of CALENDAR_PHASE_ORDER) {
      if (isInPhase(week, phase) && !isInPhase(prevWeek, phase)) {
        events.push({ type: 'phase_started', phase, date: ctx.date });
      }
    }
    for (const phase of CALENDAR_PHASE_ORDER) {
      if (isInPhase(week, phase) && !isInPhase(nextWeek, phase)) {
        events.push({ type: 'phase_ended', phase, date: ctx.date });
      }
    }
    return events;
  },
};

export const DEFAULT_SYSTEMS: readonly WeeklySystem[] = [calendarSystem];

/**
 * 게임 시간을 1주 진행한다. 입력 state 는 변형하지 않고 새 state 를 돌려준다.
 * 같은 입력 + 같은 rng 상태 → 같은 결과.
 */
export function advanceWeek(
  state: GameState,
  systems: readonly WeeklySystem[] = DEFAULT_SYSTEMS,
): AdvanceResult {
  const draft: GameState = structuredClone(state);
  const currentDate: GameDate = { year: draft.date.year, week: draft.date.week };
  const rng = rngFromState(draft.rng);
  const ctx: WeekContext = {
    date: { year: currentDate.year, week: currentDate.week },
    rng,
  };

  const events: GameEvent[] = [];
  for (const system of systems) {
    events.push(...system.run(draft, ctx));
  }

  const next = nextDate(currentDate);
  if (next.year !== currentDate.year) {
    draft.season = seasonForYear(next.year);
    events.push({ type: 'new_year', year: next.year });
  }

  draft.date = next;
  draft.rng = rng.getState();

  const merged = [...draft.eventLog, ...events];
  draft.eventLog =
    merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged;

  return { state: draft, events };
}
