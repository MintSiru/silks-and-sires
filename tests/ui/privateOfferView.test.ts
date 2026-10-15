import { beforeAll, describe, expect, it } from 'vitest';
import { SALE_PATRON_SILVER_SPEND, SALE_PATRON_GOLD_SPEND } from '../../src/engine/config/sales';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameState } from '../../src/engine/types';
import { privateOfferRows, patronBadge } from '../../src/ui/sales/salesView';
import { feeKo } from '../../src/ui/game/text';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};


let base: GameState;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261011, playerName: '가상 마주', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, BOOT_DATA);
}, 600_000);

describe('개인 거래 화면', () => {
  it('제안의 공개 정보와 추정 범위만 표시하고 기한 이후 숨긴다', () => {
    const state = structuredClone(base);
    state.date = { year: 2026, week: 1 };
    const horse = Object.values(state.horses).find((h) => h.ownerId !== null && h.ownerId !== state.playerOwnerId && state.owners[h.ownerId] !== undefined);
    if (horse === undefined || horse.ownerId === null) throw new Error('테스트 말 없음');
    horse.name = '은빛 새벽';
    horse.birthYear = 2024;
    horse.sex = 'male';
    horse.gelded = false;
    state.sales.privateOffers = [{ id: 'po_test', horseId: horse.id, ownerId: horse.ownerId, price: 100_000, createdYear: 2026, createdWeek: 1, expiresYear: 2026, expiresWeek: 10 }];
    const rows = privateOfferRows(state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ offerId: 'po_test', horseId: horse.id, horseName: '은빛 새벽', sexAgeKo: '수 2세', ownerName: state.owners[horse.ownerId]?.name, priceKo: '€100,000', expiresKo: '2026년 3월 1주까지' });
    expect(rows[0]?.estimateKo).toMatch(/^€[\d,]+ ~ €[\d,]+$/);
    expect(rows[0]?.sireName).toBe(horse.sireId === null ? '—' : state.horses[horse.sireId]?.name ?? '—');
    const json = JSON.stringify({ rows, badge: patronBadge(state) });
    expect(json).not.toContain('valuation');
    expect(json).not.toContain('aiBids');
    state.date.week = 11;
    expect(privateOfferRows(state)).toEqual([]);
  });

  it.each([
    [0, '일반', '실버', SALE_PATRON_SILVER_SPEND, 0, 0],
    [SALE_PATRON_SILVER_SPEND - 1, '일반', '실버', 1, 0, 0],
    [SALE_PATRON_SILVER_SPEND, '실버', '골드', SALE_PATRON_GOLD_SPEND - SALE_PATRON_SILVER_SPEND, 1, 1],
    [SALE_PATRON_GOLD_SPEND - 1, '실버', '골드', 1, 1, 1],
    [SALE_PATRON_GOLD_SPEND, '골드', null, 0, 2, 2],
  ])('최근 2년 구매액 %i의 등급 경계', (spend, tier, next, remaining, weeks, discount) => {
    const state = structuredClone(base);
    const year = state.date.year;
    state.sales.playerSpendByYear = { [year]: spend / 2, [year - 1]: spend / 2, [year - 2]: SALE_PATRON_GOLD_SPEND };
    const badge = patronBadge(state);
    expect(badge.tierKo).toBe(tier);
    expect(badge.spendKo).toBe(feeKo(spend));
    expect(badge.nextKo).toBe(next === null ? '최고 등급' : `${next}까지 ${feeKo(remaining)}`);
    if (tier === '일반') {
      expect(badge.benefitsKo).toHaveLength(1);
      expect(badge.benefitsKo[0]).toContain('혜택 없음');
    } else {
      expect(badge.benefitsKo).toEqual([`카탈로그 ${weeks}주 먼저 열람`, `구매 수수료 −${discount}%p`, '내 출품을 한 북 앞에 배정']);
    }
    expect(JSON.stringify(badge)).not.toContain('valuation');
  });
});
