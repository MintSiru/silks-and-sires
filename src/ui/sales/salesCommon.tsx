import type { JSX } from 'react';
import { getSalesData } from '../../engine/data/staticData';
import type { SalesStaticData } from '../../engine/sales/system';
import type { SaleEventDef } from '../../engine/types';

/** 세일 정적 데이터(useGame 과 같은 원천). 화면은 세일 이름·호가·북 정보만 쓴다. */
export const SALES_DATA: SalesStaticData = { sales: getSalesData() };
/** 값이 없을 때 칸을 채우는 표기 */
export const NO_VALUE = '—';

/** 화면 안내 한 줄의 톤 */
export interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

export function eventOf(saleId: string): SaleEventDef | undefined {
  return SALES_DATA.sales?.events.find((e) => e.id === saleId);
}

/** 성공·실패 안내 한 줄. 값이 없으면 아무것도 그리지 않는다. */
export function NoticeLine({ notice }: { notice: Notice | null }): JSX.Element | null {
  if (notice === null) return null;
  return (
    <p className={`notice notice--${notice.tone}`} role="status">
      {notice.text}
    </p>
  );
}
