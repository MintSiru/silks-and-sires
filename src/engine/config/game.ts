import type { CalendarPhaseId, CalendarWindow } from '../types';

/** 게임 전역 상수. 공용 설정이므로 Opus 소유. */
export const START_YEAR = 2026;
export const WEEKS_PER_YEAR = 52;
export const SAVE_SCHEMA_VERSION = 3;
export const EVENT_LOG_LIMIT = 200;
/** 시작 자금(€) */
export const STARTING_FUNDS = 500_000;
export const PLAYER_OWNER_ID = 'owner-player';

/** 단계별 주 범위 (양끝 포함). 연말을 넘는 단계는 창 2개 */
export const PHASE_WINDOWS: Readonly<Record<CalendarPhaseId, readonly CalendarWindow[]>> = {
  foaling: [{ startWeek: 1, endWeek: 22 }], // 1~5월
  breeding: [{ startWeek: 7, endWeek: 26 }], // 2월 중순~6월
  turf_flat: [{ startWeek: 13, endWeek: 45 }], // 3월 말~11월 초
  aw_winter: [
    { startWeek: 1, endWeek: 12 },
    { startWeek: 46, endWeek: 52 },
  ],
};
