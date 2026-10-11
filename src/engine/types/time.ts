/** 1~52. 1년 = 52주 턴. */
export type Week = number;

export interface GameDate {
  year: number;
  week: Week;
}

/** 달력 단계. 범위는 src/engine/config/calendar.ts 에 정의. */
export type CalendarPhaseId = 'foaling' | 'breeding' | 'turf_flat' | 'aw_winter';

/** 같은 해 안의 주 범위(양끝 포함, startWeek <= endWeek). 연말을 넘는 단계는 창 2개로 표현. */
export interface CalendarWindow {
  startWeek: Week;
  endWeek: Week;
}

/** 한 해(시즌) 단위 정보. M3 에서 fixtures(레이스 일정) 등이 추가된다. */
export interface Season {
  year: number;
  /** 올해 적용되는 단계별 주 범위 */
  phases: Record<CalendarPhaseId, CalendarWindow[]>;
}
