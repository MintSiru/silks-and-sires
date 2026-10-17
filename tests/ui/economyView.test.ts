import { describe, expect, it } from 'vitest';
import { LEGACY_BANKRUPT_WEEKS } from '../../src/engine/config/economy';
import { formatDateKo } from '../../src/engine/time/calendar';
import { closeEconomyYear, ledgerTotalsSum, recordMoney } from '../../src/engine/economy/ledger';
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
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameDate, GameState, HorseId, LedgerCategory } from '../../src/engine/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EconomyScreen from '../../src/ui/economy/EconomyScreen';
import {
  expenseShares, fundsBanner, ledgerDisplayName, ledgerWeekGroups, operatingVerdict, pnlHistory,
  recentLedger, yearPnl, type LedgerRowView, type PnlLine,
} from '../../src/ui/economy/economyView';
import type { GameApi } from '../../src/ui/game/useGame';

const SEED = 20261012;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;

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

let cachedBase: GameState | null = null;

/** 새 게임 상태의 복제본. 장부와 연말 요약을 비운 뒤 돌려준다(테스트마다 같은 출발점). */
function freshGame(): GameState {
  if (cachedBase === null) {
    cachedBase = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  }
  const state = structuredClone(cachedBase);
  state.economy.mode = 'casual';
  state.economy.debt = 0;
  state.economy.negativeWeeks = 0;
  state.economy.bankrupt = false;
  state.economy.playerLedger = [];
  state.economy.currentYear = { player: {}, aiTotals: {} };
  state.economy.yearSummaries = [];
  return state;
}

function playerHorseId(state: GameState): HorseId {
  const id = state.owners[state.playerOwnerId]?.horseIds[0];
  if (id === undefined) throw new Error('플레이어 말이 없다');
  return id;
}

/** 플레이어 장부에 항목을 남긴다(자금·장부·올해 합계를 함께 바꾼다) */
function post(
  state: GameState,
  category: LedgerCategory,
  amount: number,
  week: number,
  horseId: HorseId | null = null,
  year: number = state.date.year,
): void {
  const date: GameDate = { year, week };
  recordMoney(state, state.playerOwnerId, category, amount, date, horseId);
}

describe('fundsBanner', () => {
  it('정상 상태: 자금·모드를 보이고 경고는 없다', () => {
    const state = freshGame();
    const owner = state.owners[state.playerOwnerId];
    const banner = fundsBanner(state);
    expect(banner.funds).toBe(owner?.funds);
    expect(banner.debt).toBe(0);
    expect(banner.mode).toBe('casual');
    expect(banner.warning).toBeNull();
  });

  it('캐주얼 빚이 있으면 kind 가 debt 이고 weeksLeft 는 null', () => {
    const state = freshGame();
    state.economy.debt = 4_200;
    const banner = fundsBanner(state);
    expect(banner.debt).toBe(4_200);
    expect(banner.warning).toEqual({ kind: 'debt', weeksLeft: null });
  });

  it('레거시 자금 마이너스면 파산까지 남은 주를 준다', () => {
    const state = freshGame();
    state.economy.mode = 'legacy';
    const owner = state.owners[state.playerOwnerId];
    if (owner === undefined) throw new Error('플레이어 마주가 없다');
    owner.funds = -3_000;
    state.economy.negativeWeeks = 3;
    const banner = fundsBanner(state);
    expect(banner.warning).toEqual({ kind: 'negative', weeksLeft: LEGACY_BANKRUPT_WEEKS - 3 });
    expect(banner.warning?.weeksLeft).toBeGreaterThanOrEqual(0);
  });

  it('레거시 파산이면 kind 가 bankrupt 이고, 빚보다 우선한다', () => {
    const state = freshGame();
    state.economy.mode = 'legacy';
    state.economy.bankrupt = true;
    state.economy.debt = 900;
    const banner = fundsBanner(state);
    expect(banner.warning).toEqual({ kind: 'bankrupt', weeksLeft: null });
  });

  it('레거시라도 자금이 0 이상이면 경고가 없다', () => {
    const state = freshGame();
    state.economy.mode = 'legacy';
    expect(fundsBanner(state).warning).toBeNull();
  });
});

describe('yearPnl (올해)', () => {
  it('손익 합계 = 장부 합, 수입·지출 행은 금액 순으로 정렬된다', () => {
    const state = freshGame();
    const horseId = playerHorseId(state);
    post(state, 'prize', 50_000, 3);
    post(state, 'stud_fee_paid', -20_000, 5, horseId);
    post(state, 'training_fee', -5_000, 6);
    post(state, 'prize', 30_000, 9);
    post(state, 'farm_upkeep', -1_200, 10);

    const pnl = yearPnl(state);
    expect(pnl).not.toBeNull();
    if (pnl === null) return;

    expect(pnl.current).toBe(true);
    expect(pnl.year).toBe(state.date.year);
    expect(pnl.income).toEqual([{ category: 'prize', amount: 80_000 }]);
    expect(pnl.expense.map((l) => l.category)).toEqual(['stud_fee_paid', 'training_fee', 'farm_upkeep']);
    expect(pnl.incomeTotal + pnl.expenseTotal).toBe(pnl.net);

    const ledgerSum = state.economy.playerLedger.reduce((sum, e) => sum + e.amount, 0);
    expect(pnl.net).toBe(ledgerSum);
    expect(pnl.net).toBe(ledgerTotalsSum(state.economy.currentYear.player));
    expect(pnl.net).toBe(80_000 - 20_000 - 5_000 - 1_200);
  });

  it('거래가 없으면 행이 비고 순익은 0', () => {
    const state = freshGame();
    const pnl = yearPnl(state);
    expect(pnl).toEqual({
      year: state.date.year,
      current: true,
      income: [],
      expense: [],
      incomeTotal: 0,
      expenseTotal: 0,
      net: 0,
    });
  });
});

describe('yearPnl (지난 해 선택)', () => {
  it('연말 요약을 year 로 고르고, 없는 해는 null', () => {
    const state = freshGame();
    const closed = state.date.year;
    post(state, 'prize', 10_000, 4);
    closeEconomyYear(state, closed);
    post(state, 'stud_fee_paid', -700, 8);

    const past = yearPnl(state, closed);
    expect(past).not.toBeNull();
    expect(past?.current).toBe(false);
    expect(past?.income).toEqual([{ category: 'prize', amount: 10_000 }]);
    expect(past?.expense).toEqual([]);
    expect(past?.net).toBe(10_000);

    const now = yearPnl(state);
    expect(now?.current).toBe(true);
    expect(now?.net).toBe(-700);

    expect(yearPnl(state, closed + 5)).toBeNull();
  });
});

describe('recentLedger', () => {
  it('최신순으로 limit 개를 준다. 날짜·종류·금액·말 이름을 담는다', () => {
    const state = freshGame();
    const horseId = playerHorseId(state);
    const horseName = state.horses[horseId]?.name ?? horseId;
    post(state, 'prize', 100, 1);
    post(state, 'farm_upkeep', -50, 2, horseId);
    post(state, 'interest', -7, 3);

    const two = recentLedger(state, 2);
    expect(two.map((r) => r.category)).toEqual(['interest', 'farm_upkeep']);
    expect(two[0]).toEqual({
      date: { year: state.date.year, week: 3 },
      dateLabel: formatDateKo({ year: state.date.year, week: 3 }),
      category: 'interest',
      amount: -7,
      horseName: null,
    });
    expect(two[1]?.horseName).toBe(horseName);
    expect(two[1]?.amount).toBe(-50);

    expect(recentLedger(state)).toHaveLength(3);
    expect(recentLedger(state, 0)).toEqual([]);
    expect(() => recentLedger(state, -1)).toThrow(RangeError);
  });
});

describe('pnlHistory', () => {
  it('지난 해를 오래된 순으로, 연말 자금·빚과 순익을 준다', () => {
    const state = freshGame();
    const first = state.date.year;
    post(state, 'prize', 10_000, 4, null, first);
    const fundsAtFirstClose = state.owners[state.playerOwnerId]?.funds;
    closeEconomyYear(state, first);

    post(state, 'stud_fee_paid', -30_000, 6, null, first + 1);
    closeEconomyYear(state, first + 1);

    const rows = pnlHistory(state);
    expect(rows.map((r) => r.year)).toEqual([first, first + 1]);
    expect(rows[0]?.net).toBe(10_000);
    expect(rows[0]?.positive).toBe(true);
    expect(rows[0]?.playerFunds).toBe(fundsAtFirstClose);
    expect(rows[1]?.net).toBe(-30_000);
    expect(rows[1]?.positive).toBe(false);
    // 최대 |순익| 기준 막대: 30,000 이 100%, 10,000 은 33%
    expect(rows[1]?.barPercent).toBe(100);
    expect(rows[0]?.barPercent).toBe(33);
    expect(rows[1]?.playerFunds).toBe(state.owners[state.playerOwnerId]?.funds);
    expect(rows[1]?.playerDebt).toBe(state.economy.debt);
  });

  it('연말 요약이 없으면 빈 배열', () => {
    expect(pnlHistory(freshGame())).toEqual([]);
  });
});

describe('경영 화면 표시 (M6-U9 H)', () => {
  it('장부 표시 이름: 시설은 건설·유지비, 목장 유지비는 기본 유지비, 나머지는 장부 이름 그대로', () => {
    expect(ledgerDisplayName('facility')).toBe('시설 유지비');
    expect(ledgerDisplayName('facility_build')).toBe('시설 건설비');
    expect(ledgerDisplayName('farm_upkeep')).toBe('목장 기본 유지비');
    expect(ledgerDisplayName('prize')).toBe('레이스 상금');
    expect(ledgerDisplayName('stud_fee_paid')).toBe('종부료 지출');
  });

  it('지출 비중은 지출 합계 대비 반올림 %, 합계가 0이면 모두 0', () => {
    const lines: PnlLine[] = [
      { category: 'stud_fee_paid', amount: -20_000 },
      { category: 'training_fee', amount: -5_000 },
      { category: 'farm_upkeep', amount: -1_200 },
    ];
    const shares = expenseShares(lines, -26_200);
    expect(shares.map((s) => s.percent)).toEqual([76, 19, 5]);
    expect(shares.map((s) => s.label)).toEqual(['종부료 지출', '조교료', '목장 기본 유지비']);
    expect(shares.map((s) => s.amount)).toEqual([-20_000, -5_000, -1_200]);
    expect(expenseShares(lines, 0).every((s) => s.percent === 0)).toBe(true);
  });

  it('운영 판정: 파산·빚·자금 마이너스·자금이 적자를 못 버팀은 적자 위험, 적자는 지출 주의, 그 밖은 운영 여유', () => {
    const base = { net: 100, funds: 1_000, debt: 0, bankrupt: false };
    expect(operatingVerdict(base)).toEqual({ tone: 'good', label: '운영 여유' });
    expect(operatingVerdict({ ...base, net: -100 })).toEqual({ tone: 'warn', label: '지출 주의' });
    expect(operatingVerdict({ ...base, net: -2_000 })).toEqual({ tone: 'danger', label: '적자 위험' });
    expect(operatingVerdict({ ...base, debt: 1 })).toEqual({ tone: 'danger', label: '적자 위험' });
    expect(operatingVerdict({ ...base, funds: -1 })).toEqual({ tone: 'danger', label: '적자 위험' });
    expect(operatingVerdict({ ...base, bankrupt: true })).toEqual({ tone: 'danger', label: '적자 위험' });
  });

  it('주별 묶음: 같은 연·주 항목을 합치고 입력(최신순) 순서를 유지한다', () => {
    const row = (year: number, week: number, category: LedgerRowView['category'], amount: number): LedgerRowView => ({
      date: { year, week }, dateLabel: `${year}년 ${week}주`, category, amount, horseName: null,
    });
    const groups = ledgerWeekGroups([
      row(2026, 5, 'prize', 100), row(2026, 5, 'farm_upkeep', -40), row(2026, 4, 'interest', -7), row(2025, 4, 'prize', 3),
    ]);
    expect(groups.map((g) => [g.key, g.rows.length, g.net])).toEqual([['2026-5', 2, 60], ['2026-4', 1, -7], ['2025-4', 1, 3]]);
    expect(groups[0]?.rows.map((r) => r.category)).toEqual(['prize', 'farm_upkeep']);
    expect(ledgerWeekGroups([])).toEqual([]);
  });

  it('경영 화면: KPI 세 칸·판정 칩·주별 장부·장부 이름 매핑을 렌더링한다', () => {
    const state = freshGame();
    post(state, 'prize', 10_000, 4);
    post(state, 'farm_upkeep', -500, 4);
    post(state, 'facility_build', -150_000, 6);
    const html = renderToStaticMarkup(createElement(EconomyScreen, { game: { state } as unknown as GameApi }));
    for (const text of ['올해 총수입', '올해 총지출', '올해 순손익', '운영 판정', '손익 (', '최근 장부',
      '시설 건설비', '목장 기본 유지비', 'economy-week', '2건']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('economy-amount--income');
    expect(html).toContain('지출 비중');
  });
});
