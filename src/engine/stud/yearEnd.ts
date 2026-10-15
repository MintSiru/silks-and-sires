/**
 * 연말 정산(M4-D1). 설계: docs/m4-stud-design.md
 * 새해 1주를 처리하기 전에 플레이어가 연말 정산을 제출해야 한다. advanceWeek 자체는 막지 않고
 * (해를 넘기는 테스트·자동 시뮬레이션용), 화면은 advanceWeekGated 로만 진행한다.
 */
import { advanceWeek } from '../time/advance';
import type { AdvanceResult, GameState, WeeklySystem } from '../types';

/** 연말 정산 대기 중인지: 새해 1주(아직 처리 전)이고 올해 제출 기록이 없다 */
export function yearEndPending(state: GameState): boolean {
  return state.date.week === 1 && state.yearEnd.lastSubmittedYear < state.date.year;
}

/** 연말 정산이 대기 중이면 진행하지 않고 blocked 를 돌려준다. 그 밖에는 advanceWeek 와 같다 */
export function advanceWeekGated(
  state: GameState,
  systems: readonly WeeklySystem[],
): AdvanceResult & { blocked: 'year_end' | null } {
  if (yearEndPending(state)) return { state, events: [], blocked: 'year_end' };
  return { ...advanceWeek(state, systems), blocked: null };
}
