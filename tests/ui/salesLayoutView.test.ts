import { describe, expect, it } from 'vitest';
import { SALE_PATRON_GOLD_SPEND, SALE_PATRON_SILVER_SPEND } from '../../src/engine/config/sales';
import type { SalePatronTier } from '../../src/engine/sales/patron';
import { formatDateKo } from '../../src/engine/time/calendar';
import type { GameState } from '../../src/engine/types';
import { feeKo } from '../../src/ui/game/text';
import type { SaleCalendarRow } from '../../src/ui/sales/salesView';
import {
  defaultSalesTab,
  nearestSaleKey,
  patronProgressView,
  patronTierBadgeClass,
  saleActionLabelKo,
  saleScheduleNoticeKo,
  saleSubLineKo,
} from '../../src/ui/sales/salesLayoutView';

/** 합성 일정 행. 필요한 칸만 바꿔 쓴다. */
function calRow(over: Partial<SaleCalendarRow> = {}): SaleCalendarRow {
  return {
    saleId: 'sale_a',
    year: 2026,
    name: '가상 1세마 세일',
    companyName: '가상 회사',
    country: 'GB',
    kindKo: '1세마 세일',
    monthKo: '8월',
    announceWeek: 30,
    saleWeek: 36,
    statusKo: '발표 전',
    status: 'upcoming',
    lots: null,
    myBids: 0,
    myConsignments: 0,
    consignLastWeek: 29,
    ...over,
  };
}

/** 후원 진행 계산에 필요한 최소 상태: 날짜와 올해·지난해 구매액만 있으면 된다 */
function spendState(year: number, thisYear: number, lastYear = 0): GameState {
  return {
    date: { year, week: 1 },
    sales: { playerSpendByYear: { [year]: thisYear, [year - 1]: lastYear } },
  } as unknown as GameState;
}

describe('세일 탭 기본값', () => {
  it('판매 제안이 없으면 구매, 있으면 판매', () => {
    expect(defaultSalesTab(0)).toBe('buy');
    expect(defaultSalesTab(1)).toBe('sell');
    expect(defaultSalesTab(4)).toBe('sell');
  });
});

describe('진입 시 자동 선택 세일', () => {
  const now = { year: 2026, week: 20 };

  it('일정이 없으면 null', () => {
    expect(nearestSaleKey([], now)).toBeNull();
  });

  it('열람 가능한 세일(카탈로그 로트 있음)이 발표 전 세일보다 우선한다', () => {
    const upcoming = calRow({ saleId: 'up', announceWeek: 21, saleWeek: 27 });
    const open = calRow({ saleId: 'open', status: 'catalogued', statusKo: '카탈로그 발표', lots: 12, announceWeek: 16, saleWeek: 40 });
    expect(nearestSaleKey([upcoming, open], now)).toEqual({ saleId: 'open', year: 2026 });
  });

  it('열람 가능한 세일끼리는 거래 주가 이번 주와 가장 가까운 것', () => {
    const far = calRow({ saleId: 'far', status: 'catalogued', statusKo: '카탈로그 발표', lots: 5, saleWeek: 45 });
    const near = calRow({ saleId: 'near', status: 'catalogued', statusKo: '카탈로그 발표', lots: 5, saleWeek: 22 });
    expect(nearestSaleKey([far, near], now)?.saleId).toBe('near');
  });

  it('열람 가능한 세일이 없으면 발표 주가 가장 가까운 발표 전 세일', () => {
    const later = calRow({ saleId: 'later', announceWeek: 35 });
    const sooner = calRow({ saleId: 'sooner', announceWeek: 24 });
    expect(nearestSaleKey([later, sooner], now)?.saleId).toBe('sooner');
  });

  it('같은 거리면 거래 시점이 이른 세일, 그다음 세일 id 순으로 고른다(결정성)', () => {
    const b = calRow({ saleId: 'b', status: 'catalogued', statusKo: '카탈로그 발표', lots: 1, saleWeek: 30 });
    const a = calRow({ saleId: 'a', status: 'catalogued', statusKo: '카탈로그 발표', lots: 1, saleWeek: 30 });
    expect(nearestSaleKey([b, a], now)?.saleId).toBe('a');
    const earlier = calRow({ saleId: 'z', year: 2026, status: 'catalogued', statusKo: '카탈로그 발표', lots: 1, saleWeek: 10 });
    const later = calRow({ saleId: 'a', year: 2026, status: 'catalogued', statusKo: '카탈로그 발표', lots: 1, saleWeek: 30 });
    // 이번 주(20) 기준 거리는 10 과 10 으로 같다: 이른 거래 주가 이긴다
    expect(nearestSaleKey([later, earlier], now)?.saleId).toBe('z');
  });
});

describe('일정 보조 줄과 발표 안내', () => {
  it('보조 줄은 월 · 종류 · 상태 순서', () => {
    expect(saleSubLineKo(calRow())).toBe('8월 · 1세마 세일 · 발표 전');
  });

  it('발표 안내는 발표 예정 주 · 거래 시점 · 위탁 마감(발표 주 전 주)을 담는다', () => {
    const row = calRow({ year: 2026, announceWeek: 30, saleWeek: 36, consignLastWeek: 29 });
    expect(saleScheduleNoticeKo(row)).toBe(
      `발표 예정 ${formatDateKo({ year: 2026, week: 30 })} · 거래 ${formatDateKo({ year: 2026, week: 36 })} · 위탁 마감 ${formatDateKo({ year: 2026, week: 29 })}까지`,
    );
  });

  it('위탁 마감 주가 1 미만이면 마감 자리는 대시', () => {
    expect(saleScheduleNoticeKo(calRow({ consignLastWeek: 0 }))).toContain('위탁 마감 —');
  });
});

describe('후원 등급 진행 막대', () => {
  it('일반 등급은 실버 기준까지의 비율', () => {
    const view = patronProgressView(spendState(2026, SALE_PATRON_SILVER_SPEND / 2));
    expect(view).toMatchObject({ tier: 'none', tierKo: '일반', percent: 50, isMax: false });
    expect(view.nextKo).toBe(`다음 등급 실버까지 ${feeKo(SALE_PATRON_SILVER_SPEND / 2)}`);
    expect(view.badgeClass).toBe('badge badge--muted');
  });

  it('실버는 실버 기준부터 골드 기준까지의 비율', () => {
    const quarter = SALE_PATRON_SILVER_SPEND + (SALE_PATRON_GOLD_SPEND - SALE_PATRON_SILVER_SPEND) / 4;
    const view = patronProgressView(spendState(2026, quarter));
    expect(view).toMatchObject({ tier: 'silver', tierKo: '실버', percent: 25 });
    expect(view.nextKo.startsWith('다음 등급 골드까지 ')).toBe(true);
    expect(view.badgeClass).toBe('badge badge--grade-high');
  });

  it('지난해 구매액도 두 해 합계에 들어간다', () => {
    const view = patronProgressView(spendState(2026, 0, SALE_PATRON_SILVER_SPEND));
    expect(view.tier).toBe('silver');
    expect(view.spendKo).toBe(feeKo(SALE_PATRON_SILVER_SPEND));
  });

  it('골드는 최고 등급이고 막대는 100%', () => {
    const view = patronProgressView(spendState(2026, SALE_PATRON_GOLD_SPEND));
    expect(view).toMatchObject({ tier: 'gold', tierKo: '골드', percent: 100, nextKo: '최고 등급', isMax: true });
    expect(view.badgeClass).toBe('badge badge--grade-top');
  });

  it('진행률은 0~100 안에 있다(구매 기록이 기준을 넘어도)', () => {
    const over = patronProgressView(spendState(2026, SALE_PATRON_SILVER_SPEND * 10));
    expect(over.percent).toBe(100);
  });

  it('등급 배지 클래스는 세 등급이 서로 다르다', () => {
    const tiers: SalePatronTier[] = ['none', 'silver', 'gold'];
    expect(new Set(tiers.map((tier) => patronTierBadgeClass(tier))).size).toBe(3);
  });
});

describe('일정 표 버튼 이름(M6-V V7)', () => {
  it('발표 전 세일은 발표 일정 보기, 공개 뒤 세일은 카탈로그 보기', () => {
    expect(saleActionLabelKo(calRow({ status: 'upcoming' }))).toBe('발표 일정 보기');
    expect(saleActionLabelKo(calRow({ status: 'catalogued', lots: 12 }))).toBe('카탈로그 보기');
    expect(saleActionLabelKo(calRow({ status: 'closed', lots: 12 }))).toBe('카탈로그 보기');
  });
});
