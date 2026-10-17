// 날짜 옆 시즌 배지 문구(M6-U2 A4). 순수 함수: DOM·저장소·난수 없음.
// 판정 근거는 엔진 config(PHASE_WINDOWS, BOOKING_OPEN_WEEK)와 정적 세일 데이터(1세 세일 주)만 쓴다.
import { BOOKING_OPEN_WEEK } from '../../engine/config/stud';
import { PHASE_WINDOWS } from '../../engine/config/game';
import { getSalesData } from '../../engine/data/staticData';
import { isInWindows } from '../../engine/time/calendar';
import type { GameDate, Week } from '../../engine/types';

/** 한 날짜에 붙이는 시즌 배지 최대 개수. 표면(잔디·올웨더) 1개 + 그 밖 1개가 기본. */
export const SEASON_BADGE_MAX = 2;

/** 1세 세일이 열리는 주 범위(정적 세일 데이터의 yearling 행사 주의 최소·최대). 없으면 null. */
export function yearlingSaleWeeks(): { first: Week; last: Week } | null {
  const weeks = getSalesData()
    .events.filter((event) => event.kind === 'yearling')
    .map((event) => event.week);
  if (weeks.length === 0) return null;
  return { first: Math.min(...weeks), last: Math.max(...weeks) };
}

/**
 * 날짜가 속한 시즌 이름 목록(최대 SEASON_BADGE_MAX 개).
 * 순서: 표면(잔디 시즌 / 올웨더 시즌), 번식 시즌, 교배 예약 기간, 1세 세일 시기.
 * - 잔디 시즌·올웨더 시즌: PHASE_WINDOWS.turf_flat / aw_winter
 * - 번식 시즌: PHASE_WINDOWS.breeding
 * - 교배 예약 기간: BOOKING_OPEN_WEEK 이후(다음 시즌 예약 창)
 * - 1세 세일 시기: 정적 세일 데이터의 1세 세일 주 범위
 */
export function seasonLabel(date: GameDate): string[] {
  const week = date.week;
  const labels: string[] = [];
  if (isInWindows(week, PHASE_WINDOWS.turf_flat)) labels.push('잔디 시즌');
  else if (isInWindows(week, PHASE_WINDOWS.aw_winter)) labels.push('올웨더 시즌');
  if (isInWindows(week, PHASE_WINDOWS.breeding)) labels.push('번식 시즌');
  if (week >= BOOKING_OPEN_WEEK) labels.push('교배 예약 기간');
  const yearling = yearlingSaleWeeks();
  if (yearling !== null && week >= yearling.first && week <= yearling.last) labels.push('1세 세일 시기');
  return labels.slice(0, SEASON_BADGE_MAX);
}
