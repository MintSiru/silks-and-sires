import { describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { DEBT_CAP_FALLBACK, DEBT_INTEREST_BASE_CAP, DEBT_INTEREST_WEEKLY } from '../../src/engine/config/economy';
import { createSolvencySystem } from '../../src/engine/economy/solvency';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';

const sd = { ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords() };

describe('M6 캐주얼 이자 완화', () => {
  const base = bootstrapGame({ seed: 20261011, playerName: '가상 마주', economyMode: 'casual',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, sd);
  const run = (debt: number, lastCosts: number | null) => {
    const s = structuredClone(base);
    s.economy.debt = debt;
    s.owners[s.playerOwnerId]!.funds = 0;
    if (lastCosts !== null) {
      s.economy.yearSummaries.push({ ...structuredClone(s.economy.yearSummaries.at(-1) ?? {} as never),
        year: s.date.year - 1, player: { facility: -lastCosts }, aiTotals: {}, aiFundsMedian: 0, aiFundsTotal: 0 } as never);
    }
    createSolvencySystem().run(s, { date: s.date, rng: createRng('debt-cap') });
    return s.economy.debt;
  };

  it('이자는 빚 중 DEBT_INTEREST_BASE_CAP 까지에만 붙는다', () => {
    const debt = 400_000;
    expect(run(debt, 10_000_000)).toBe(debt + Math.round(debt * DEBT_INTEREST_WEEKLY));
    const big = 3_000_000;
    expect(run(big, 10_000_000)).toBe(big + Math.round(DEBT_INTEREST_BASE_CAP * DEBT_INTEREST_WEEKLY));
  });

  it('빚은 지난해 지출 2년분(기록이 없으면 기본값)을 넘지 않는다', () => {
    expect(run(5_000_000, 300_000)).toBe(600_000 + Math.round(DEBT_INTEREST_BASE_CAP * DEBT_INTEREST_WEEKLY));
    const s = structuredClone(base);
    expect(s.economy.yearSummaries.length).toBe(0);
    expect(run(5_000_000, null)).toBe(DEBT_CAP_FALLBACK + Math.round(DEBT_INTEREST_BASE_CAP * DEBT_INTEREST_WEEKLY));
  });
});

describe('M6 빚이 있어도 4~5티어 교배 허용', () => {
  it('캐주얼 빚: 4~5티어 종부료는 예약 허용, 그보다 비싸면 거절, 레거시는 그대로', async () => {
    const { bookCovering, debtMatingAllowed } = await import('../../src/engine/breeding/season');
    const { tierFromFee } = await import('../../src/engine/world/sirePool');
    const s = bootstrapGame({ seed: 20261011, playerName: '가상 마주', economyMode: 'casual',
      silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, sd);
    s.economy.debt = 100_000;
    s.owners[s.playerOwnerId]!.funds = 0;
    expect(debtMatingAllowed(s, 6_000, s.playerOwnerId)).toBe(true);
    expect(debtMatingAllowed(s, 150_000, s.playerOwnerId)).toBe(false);
    const legacy = { ...s, economy: { ...s.economy, mode: 'legacy' as const } };
    expect(debtMatingAllowed(legacy, 6_000, s.playerOwnerId)).toBe(false);
    const mareId = Object.keys(s.mares).find((id) => s.horses[id]?.ownerId === s.playerOwnerId)!;
    s.date = { year: s.date.year, week: 2 };
    const cheap = Object.keys(s.stallions).find((id) => s.stallions[id]!.fee > 0 && tierFromFee(s.stallions[id]!.fee) >= 4
      && s.horses[id]?.ownerId !== s.playerOwnerId && !s.stallions[id]!.privateTo)!;
    const dear = Object.keys(s.stallions).find((id) => tierFromFee(s.stallions[id]!.fee) <= 2 && !s.stallions[id]!.privateTo)!;
    const d = bookCovering(s, s.playerOwnerId, mareId, dear);
    expect(d.ok ? 'ok' : d.error).toBe('insufficient_funds');
    const c = bookCovering(s, s.playerOwnerId, mareId, cheap);
    expect(c.ok ? 'ok' : c.error).toBe('ok');
  });
});
