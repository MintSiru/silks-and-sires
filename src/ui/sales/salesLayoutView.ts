import { monthOfWeek } from '../../engine/time/calendar';
import type { GameDate } from '../../engine/types';
import type { SaleCalendarRow } from './salesView';

/** 이번 달부터 세 달. 월 번호를 연도와 합쳐 연말 경계도 처리한다. */
export function nearSaleCalendar(
  rows: readonly SaleCalendarRow[],
  date: GameDate,
): SaleCalendarRow[] {
  const current = date.year * 12 + monthOfWeek(date.week);
  return rows.filter((row) => {
    const offset = row.year * 12 + monthOfWeek(row.saleWeek) - current;
    return offset >= 0 && offset < 3;
  });
}
