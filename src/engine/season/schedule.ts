import { WEEKS_PER_YEAR } from '../config/game';
import { monthOfWeek } from '../time/calendar';
import type { ScheduleSlot, Week } from '../types';

/** 한 해의 달 수. calendar.ts 의 MONTHS_PER_YEAR 와 같다. */
const MONTHS_PER_YEAR = 12;

/** 그 달의 첫 주(1~52). 모든 달은 최소 4주를 가지므로 항상 존재한다. */
function firstWeekOfMonth(month: number): Week {
  for (let week = 1; week <= WEEKS_PER_YEAR; week++) {
    if (monthOfWeek(week) === month) {
      return week;
    }
  }
  throw new RangeError(`month ${month} 의 첫 주를 찾을 수 없음`);
}

/**
 * 고정 일정 슬롯(월 + 그 달의 몇째 주) → 해의 주(1~52).
 * 그 달의 첫 주 + weekOfMonth − 1 이며, 결과가 그 달을 넘으면 RangeError.
 */
export function weekOfSlot(slot: ScheduleSlot): Week {
  const { month, weekOfMonth } = slot;
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) {
    throw new RangeError(`month 는 1~${MONTHS_PER_YEAR} 정수여야 한다: ${month}`);
  }
  if (!Number.isInteger(weekOfMonth) || weekOfMonth < 1) {
    throw new RangeError(`weekOfMonth 는 1 이상의 정수여야 한다: ${weekOfMonth}`);
  }
  const week = firstWeekOfMonth(month) + weekOfMonth - 1;
  if (week > WEEKS_PER_YEAR || monthOfWeek(week) !== month) {
    throw new RangeError(`${month}월 ${weekOfMonth}주는 그 달을 넘는다`);
  }
  return week;
}

/** 해의 주(1~52) → 고정 일정 슬롯. weekOfSlot 의 역함수. */
export function slotOfWeek(week: Week): ScheduleSlot {
  const month = monthOfWeek(week);
  return { month, weekOfMonth: week - firstWeekOfMonth(month) + 1 };
}
