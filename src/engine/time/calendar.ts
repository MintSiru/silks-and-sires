import { PHASE_WINDOWS, WEEKS_PER_YEAR } from '../config/game';
import type { CalendarPhaseId, CalendarWindow, GameDate, Season, Week } from '../types';

/** 한 해의 달 수. 주→월 매핑에 쓴다. */
const MONTHS_PER_YEAR = 12;

/** 달력 단계 판정·이벤트 발행 순서. */
export const CALENDAR_PHASE_ORDER: readonly CalendarPhaseId[] = [
  'foaling',
  'breeding',
  'turf_flat',
  'aw_winter',
];

function assertWeek(week: number): void {
  if (!Number.isInteger(week) || week < 1 || week > WEEKS_PER_YEAR) {
    throw new RangeError(`week 는 1~${WEEKS_PER_YEAR} 정수여야 한다: ${week}`);
  }
}

/** 52주 다음은 {year+1, week:1}. */
export function nextDate(d: GameDate): GameDate {
  assertWeek(d.week);
  if (d.week === WEEKS_PER_YEAR) {
    return { year: d.year + 1, week: 1 };
  }
  return { year: d.year, week: d.week + 1 };
}

/** n >= 0 정수 주 만큼 뒤의 날짜. */
export function addWeeks(d: GameDate, n: number): GameDate {
  assertWeek(d.week);
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`addWeeks: n 은 0 이상의 정수여야 한다: ${n}`);
  }
  const index = d.year * WEEKS_PER_YEAR + (d.week - 1) + n;
  const year = Math.floor(index / WEEKS_PER_YEAR);
  const week = index - year * WEEKS_PER_YEAR + 1;
  return { year, week };
}

/** 음수면 a 가 앞, 0 이면 같음, 양수면 a 가 뒤. */
export function compareDates(a: GameDate, b: GameDate): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  return a.week - b.week;
}

/** b - a 의 주 수 (음수 가능). */
export function weeksBetween(a: GameDate, b: GameDate): number {
  return (b.year - a.year) * WEEKS_PER_YEAR + (b.week - a.week);
}

/** 주 → 월(1~12). 52주를 12달에 고르게 나눈다. */
export function monthOfWeek(week: Week): number {
  assertWeek(week);
  return Math.min(
    MONTHS_PER_YEAR,
    Math.floor(((week - 1) * MONTHS_PER_YEAR) / WEEKS_PER_YEAR) + 1,
  );
}

export function isInWindows(week: Week, windows: readonly CalendarWindow[]): boolean {
  return windows.some((w) => week >= w.startWeek && week <= w.endWeek);
}

export function isInPhase(week: Week, phase: CalendarPhaseId): boolean {
  return isInWindows(week, PHASE_WINDOWS[phase]);
}

/** 해당 연도의 시즌 정보. phases 는 PHASE_WINDOWS 의 가변 복사본이다. */
export function seasonForYear(year: number): Season {
  const phases = {} as Record<CalendarPhaseId, CalendarWindow[]>;
  for (const phase of CALENDAR_PHASE_ORDER) {
    phases[phase] = PHASE_WINDOWS[phase].map((w) => ({
      startWeek: w.startWeek,
      endWeek: w.endWeek,
    }));
  }
  return { year, phases };
}

export function ageInYear(birthYear: number, year: number): number {
  return year - birthYear;
}

/** 예: "2026년 6월 2주" — 그 달에 속한 주 중 몇 번째인지. */
export function formatDateKo(d: GameDate): string {
  assertWeek(d.week);
  const month = monthOfWeek(d.week);
  let firstWeekOfMonth = d.week;
  while (firstWeekOfMonth > 1 && monthOfWeek(firstWeekOfMonth - 1) === month) {
    firstWeekOfMonth -= 1;
  }
  const weekInMonth = d.week - firstWeekOfMonth + 1;
  return `${d.year}년 ${month}월 ${weekInMonth}주`;
}
