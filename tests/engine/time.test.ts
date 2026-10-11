import { describe, expect, it } from 'vitest';
import { EVENT_LOG_LIMIT, PHASE_WINDOWS, START_YEAR } from '../../src/engine/config/game';
import {
  addWeeks,
  compareDates,
  formatDateKo,
  isInPhase,
  monthOfWeek,
  nextDate,
  seasonForYear,
  weeksBetween,
} from '../../src/engine/time/calendar';
import { DEFAULT_SYSTEMS, advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import { createNewGame } from '../../src/engine/state/newGame';
import type { CalendarPhaseId, GameEvent, GameState, WeeklySystem } from '../../src/engine/types';

const SILKS = { primary: '#1d4ed8', secondary: '#facc15', pattern: 'hoops' as const };

function newGame(seed = 7): GameState {
  return createNewGame({ seed, playerName: 'Test Owner', silks: SILKS });
}

function runWeeks(state: GameState, weeks: number): { state: GameState; events: GameEvent[][] } {
  let current = state;
  const perWeek: GameEvent[][] = [];
  for (let i = 0; i < weeks; i++) {
    const result = advanceWeek(current);
    perWeek.push(result.events);
    current = result.state;
  }
  return { state: current, events: perWeek };
}

describe('수용 기준 1: 52주 진행 후 다음 해 1주', () => {
  it('52회 진행하면 date 가 {2027, 1} 이고 52번째 events 의 마지막은 new_year(2027)', () => {
    const { state, events } = runWeeks(newGame(), 52);
    expect(state.date).toEqual({ year: 2027, week: 1 });
    const last = events[51]?.at(-1);
    expect(last).toEqual({ type: 'new_year', year: 2027 });
    expect(state.season.year).toBe(2027);
  });
});

describe('수용 기준 2: 단계 시작·종료 이벤트 1년 1회씩', () => {
  it('각 단계의 phase_started / phase_ended 가 정확히 1회씩, aw_winter 는 46주 시작·12주 종료', () => {
    const { events } = runWeeks(newGame(), 52);
    const all = events.flat();
    const phases: CalendarPhaseId[] = ['foaling', 'breeding', 'turf_flat', 'aw_winter'];
    for (const phase of phases) {
      const started = all.filter((e) => e.type === 'phase_started' && e.phase === phase);
      const ended = all.filter((e) => e.type === 'phase_ended' && e.phase === phase);
      expect(started).toHaveLength(1);
      expect(ended).toHaveLength(1);
    }
    const awStart = all.find((e) => e.type === 'phase_started' && e.phase === 'aw_winter');
    expect(awStart).toEqual({
      type: 'phase_started',
      phase: 'aw_winter',
      date: { year: START_YEAR, week: 46 },
    });
    const awEnd = all.find((e) => e.type === 'phase_ended' && e.phase === 'aw_winter');
    expect(awEnd).toEqual({
      type: 'phase_ended',
      phase: 'aw_winter',
      date: { year: START_YEAR, week: 12 },
    });
  });

  it('turf_flat 은 13주에 시작, 45주에 종료', () => {
    const { events } = runWeeks(newGame(), 52);
    const all = events.flat();
    expect(all).toContainEqual({
      type: 'phase_started',
      phase: 'turf_flat',
      date: { year: START_YEAR, week: 13 },
    });
    expect(all).toContainEqual({
      type: 'phase_ended',
      phase: 'turf_flat',
      date: { year: START_YEAR, week: 45 },
    });
  });

  it('1주 진행 시 aw_winter 는 시작 이벤트가 없다(전주 52주도 단계 안)', () => {
    const { events } = runWeeks(newGame(), 1);
    expect(events[0]).not.toContainEqual(
      expect.objectContaining({ type: 'phase_started', phase: 'aw_winter' }),
    );
  });
});

describe('수용 기준 3: 입력 state 불변', () => {
  it('advanceWeek 호출 전후 입력 state 의 JSON 이 같다', () => {
    const state = newGame();
    const before = JSON.stringify(state);
    const result = advanceWeek(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.state).not.toBe(state);
    expect(JSON.stringify(result.state)).not.toBe(before);
  });
});

describe('수용 기준 4: 같은 시드 = 같은 결과', () => {
  it('같은 시드 두 게임을 104주 진행하면 최종 JSON 이 완전히 같다', () => {
    const a = runWeeks(newGame(99), 104).state;
    const b = runWeeks(newGame(99), 104).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.date).toEqual({ year: START_YEAR + 2, week: 1 });
  });
});

describe('수용 기준 5: eventLog 상한', () => {
  it('300주 진행 후 eventLog 길이가 EVENT_LOG_LIMIT 를 넘지 않는다', () => {
    const { state } = runWeeks(newGame(), 300);
    expect(state.eventLog.length).toBeLessThanOrEqual(EVENT_LOG_LIMIT);
    expect(state.eventLog.length).toBe(EVENT_LOG_LIMIT);
  });
});

describe('수용 기준 6: 월 매핑과 한국어 표기', () => {
  it('monthOfWeek(1)=1, monthOfWeek(52)=12, 모든 주가 1~12 월이고 단조 증가(비감소)', () => {
    expect(monthOfWeek(1)).toBe(1);
    expect(monthOfWeek(52)).toBe(12);
    let prev = 0;
    for (let w = 1; w <= 52; w++) {
      const m = monthOfWeek(w);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(12);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('formatDateKo({year:2026, week:1}) === "2026년 1월 1주"', () => {
    expect(formatDateKo({ year: 2026, week: 1 })).toBe('2026년 1월 1주');
  });

  it('formatDateKo 는 달 안에서 주 번호가 1부터 연속된다', () => {
    const counts = new Map<string, number[]>();
    for (let w = 1; w <= 52; w++) {
      const label = formatDateKo({ year: 2026, week: w });
      const m = /(\d+)월 (\d+)주$/.exec(label);
      expect(m).not.toBeNull();
      const month = m?.[1] ?? '';
      const weekInMonth = Number(m?.[2]);
      const list = counts.get(month) ?? [];
      list.push(weekInMonth);
      counts.set(month, list);
    }
    for (const list of counts.values()) {
      expect(list).toEqual(list.map((_, i) => i + 1));
    }
  });
});

describe('수용 기준 7: 커스텀 시스템과 rng', () => {
  const custom: WeeklySystem = {
    id: 'custom-roll',
    run(_draft, ctx) {
      ctx.rng.next();
      return [];
    },
  };

  it('rng.next() 1회 소비 시스템은 rng 상태를 바꾸고, 같은 입력이면 결과가 같다', () => {
    const state = newGame(3);
    const a = advanceWeek(state, [custom]);
    const b = advanceWeek(state, [custom]);
    expect(a.state.rng).not.toEqual(state.rng);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('기본 시스템(calendar, growth)은 난수를 쓰지 않는다', () => {
    const state = newGame(3);
    const result = advanceWeek(state, DEFAULT_SYSTEMS);
    expect(result.state.rng).toEqual(state.rng);
    expect(DEFAULT_SYSTEMS.map((s) => s.id)).toEqual(['calendar', 'growth']);
    expect(calendarSystem.id).toBe('calendar');
  });
});

describe('달력 유틸', () => {
  it('nextDate 는 52주 다음을 다음 해 1주로 넘긴다', () => {
    expect(nextDate({ year: 2026, week: 51 })).toEqual({ year: 2026, week: 52 });
    expect(nextDate({ year: 2026, week: 52 })).toEqual({ year: 2027, week: 1 });
  });

  it('nextDate / addWeeks / monthOfWeek / formatDateKo 는 잘못된 주에서 RangeError', () => {
    expect(() => nextDate({ year: 2026, week: 0 })).toThrow(RangeError);
    expect(() => nextDate({ year: 2026, week: 53 })).toThrow(RangeError);
    expect(() => nextDate({ year: 2026, week: 1.5 })).toThrow(RangeError);
    expect(() => addWeeks({ year: 2026, week: 60 }, 1)).toThrow(RangeError);
    expect(() => monthOfWeek(0)).toThrow(RangeError);
    expect(() => formatDateKo({ year: 2026, week: 53 })).toThrow(RangeError);
  });

  it('addWeeks 는 연도를 넘기고, 음수·비정수 n 은 RangeError', () => {
    expect(addWeeks({ year: 2026, week: 50 }, 5)).toEqual({ year: 2027, week: 3 });
    expect(addWeeks({ year: 2026, week: 1 }, 0)).toEqual({ year: 2026, week: 1 });
    expect(() => addWeeks({ year: 2026, week: 1 }, -1)).toThrow(RangeError);
    expect(() => addWeeks({ year: 2026, week: 1 }, 1.5)).toThrow(RangeError);
  });

  it('compareDates / weeksBetween 는 연도 경계를 넘어 계산한다', () => {
    const a = { year: 2026, week: 50 };
    const b = { year: 2027, week: 2 };
    expect(compareDates(a, b)).toBeLessThan(0);
    expect(compareDates(b, a)).toBeGreaterThan(0);
    expect(compareDates(a, { year: 2026, week: 50 })).toBe(0);
    expect(weeksBetween(a, b)).toBe(4);
    expect(weeksBetween(b, a)).toBe(-4);
  });

  it('isInPhase 는 PHASE_WINDOWS 를 따른다(aw_winter 는 창 2개)', () => {
    expect(isInPhase(1, 'aw_winter')).toBe(true);
    expect(isInPhase(12, 'aw_winter')).toBe(true);
    expect(isInPhase(13, 'aw_winter')).toBe(false);
    expect(isInPhase(46, 'aw_winter')).toBe(true);
    expect(isInPhase(13, 'turf_flat')).toBe(true);
    expect(isInPhase(12, 'turf_flat')).toBe(false);
  });

  it('seasonForYear 의 phases 는 PHASE_WINDOWS 의 가변 깊은 복사본이다', () => {
    const season = seasonForYear(2030);
    expect(season.year).toBe(2030);
    expect(season.phases).toEqual(PHASE_WINDOWS);
    season.phases.foaling[0] = { startWeek: 9, endWeek: 9 };
    expect(PHASE_WINDOWS.foaling[0]).toEqual({ startWeek: 1, endWeek: 22 });
  });
});

describe('createNewGame', () => {
  it('초기 상태: 2026년 1주, 플레이어 마주 1명, 나머지 레코드는 비어 있다', () => {
    const state = createNewGame({
      seed: 42,
      playerName: '  가상 마주  ',
      silks: SILKS,
      studName: null,
    });
    expect(state.schemaVersion).toBe(1);
    expect(state.initialSeed).toBe(42);
    expect(state.date).toEqual({ year: 2026, week: 1 });
    expect(state.season.year).toBe(2026);
    expect(state.playerOwnerId).toBe('owner-player');
    const owner = state.owners['owner-player'];
    expect(owner?.isPlayer).toBe(true);
    expect(owner?.name).toBe('가상 마주');
    expect(owner?.country).toBe('GB');
    expect(owner?.funds).toBe(500_000);
    expect(owner?.studName).toBeNull();
    expect(owner?.horseIds).toEqual([]);
    expect(Object.keys(state.owners)).toEqual(['owner-player']);
    expect(state.horses).toEqual({});
    expect(state.stallions).toEqual({});
    expect(state.mares).toEqual({});
    expect(state.trainers).toEqual({});
    expect(state.jockeys).toEqual({});
    expect(state.raceResults).toEqual([]);
    expect(state.eventLog).toEqual([]);
  });

  it('빈 playerName(공백만 포함)은 RangeError', () => {
    expect(() => createNewGame({ seed: 1, playerName: '   ', silks: SILKS })).toThrow(RangeError);
  });

  it('같은 시드면 같은 초기 상태', () => {
    expect(JSON.stringify(newGame(5))).toBe(JSON.stringify(newGame(5)));
  });
});
