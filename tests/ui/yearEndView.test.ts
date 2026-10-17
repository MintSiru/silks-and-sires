import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSalesData, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { advanceWeek } from '../../src/engine/time/advance';
import { advanceWeekGated, submitYearEnd, yearEndCandidates, yearEndPending } from '../../src/engine/stud/yearEnd';
import { salePriceQuote, stallionSalePrice } from '../../src/engine/stud/trade';
import { stallionRecordSaleMult } from '../../src/engine/stud/value';
import type { GameState, HorseId } from '../../src/engine/types';
import { feeKo } from '../../src/ui/game/text';
import { defaultSubmission, salePriceWithNominationsKo, yearEndView } from '../../src/ui/yearEnd/yearEndView';

let state: GameState;
beforeAll(() => {
  const data = { nicks: getNicks(), naming: getNamingData(), ...getPeopleData(),
    templates: getRaceTemplates(), courses: getRacecourses(), sales: getSalesData(),
    series: getSeriesDefinitions(), stallionNames: getStallionNames(), stallionRecords: getStallionRecords() };
  state = bootstrapGame({ seed: 20261011, playerName: '테스트', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, data);
  const year = state.date.year;
  const systems = createGameSystems(data);
  while (state.date.year === year) state = advanceWeek(state, systems).state;
}, 600_000);

describe('연말 정산 화면', () => {
  it('모든 후보와 허용 진로를 같은 순서로 표시하며 OR을 노출하지 않는다', () => {
    const view = yearEndView(state);
    const candidates = yearEndCandidates(state);
    expect(view.horses.length).toBeGreaterThan(0);
    expect(view.horses).toHaveLength(candidates.length);
    view.horses.forEach((row, i) => {
      expect(row.horseId).toBe(candidates[i]!.horseId);
      expect(row.options.map((option) => option.choice)).toEqual(candidates[i]!.allowed);
      expect(JSON.stringify(row)).not.toContain('OR');
    });
  });
  it('기본 제출이 성공하고 진행 게이트를 해제한다', () => {
    expect(yearEndPending(state)).toBe(true);
    expect(advanceWeekGated(state, []).blocked).toBe('year_end');
    const result = submitYearEnd(state, defaultSubmission(state));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(yearEndPending(result.state)).toBe(false);
      expect(advanceWeekGated(result.state, []).blocked).toBeNull();
    }
  });
  it('은퇴 선택은 소유 목록에서 말을 제외한다', () => {
    const input = defaultSubmission(state);
    const horse = input.horses.find((h) => yearEndCandidates(state).find((c) => c.horseId === h.horseId)!.allowed.includes('retire'))!;
    horse.choice = 'retire';
    const result = submitYearEnd(state, input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.horses[horse.horseId]!.ownerId).toBeNull();
      expect(result.state.owners[state.playerOwnerId]!.horseIds).not.toContain(horse.horseId);
    }
  });
});

/** 연말 정산 후보 3두를 골라 각각 4세 수말, 4세 암말, 4세 거세마로 바꾼 복제 상태를 만든다. */
function withThreeCandidates(): { sim: GameState; male: HorseId; mare: HorseId; gelding: HorseId } {
  const sim = structuredClone(state);
  sim.sales.consignments = [];
  const ids = yearEndCandidates(sim).map((candidate) => candidate.horseId);
  if (ids.length < 3) throw new Error('테스트 전제 위반: 연말 정산 후보가 3두 미만');
  const [male, mare, gelding] = ids as [HorseId, HorseId, HorseId];
  const year = sim.date.year;
  // 종마·판매 선택지는 통산 1승 이상만 허용된다(M7-C1). 수말은 1승(우승마 배율 0.2)으로 둔다.
  Object.assign(sim.horses[male]!, { sex: 'male', gelded: false, birthYear: year - 4,
    record: { ...sim.horses[male]!.record, starts: 1, wins: 1 } });
  Object.assign(sim.horses[mare]!, { sex: 'female', gelded: false, birthYear: year - 4 });
  Object.assign(sim.horses[gelding]!, { sex: 'male', gelded: true, birthYear: year - 4 });
  return { sim, male, mare, gelding };
}

describe('연말 정산 종마 판매 선택지', () => {
  it('4세 거세 안 한 수말은 국내·해외 판매가 가격과 함께 있고, 암말·거세마에는 없다', () => {
    const { sim, male, mare, gelding } = withThreeCandidates();
    const view = yearEndView(sim);
    const rowOf = (id: HorseId) => view.horses.find((row) => row.horseId === id)!;
    const quote = salePriceQuote(sim, male)!;

    const maleRow = rowOf(male);
    expect(maleRow.options.map((option) => option.choice)).toEqual(
      expect.arrayContaining(['sell_domestic', 'sell_overseas']),
    );
    expect(maleRow.options.find((option) => option.choice === 'sell_domestic')!.labelKo)
      .toBe(`국내 판매 (${feeKo(quote.domestic)})`);
    expect(maleRow.options.find((option) => option.choice === 'sell_overseas')!.labelKo)
      .toBe(`해외 판매 (${feeKo(quote.overseas)})`);
    expect(maleRow.nominationCostKo).toBe(`교배권 1개당 판매가 −${feeKo(quote.nominationCost)}`);

    for (const id of [mare, gelding]) {
      const row = rowOf(id);
      const choices = row.options.map((option) => option.choice);
      expect(choices).not.toContain('sell_domestic');
      expect(choices).not.toContain('sell_overseas');
      expect(row.nominationCostKo).toBeNull();
    }
  });

  it('salePriceWithNominationsKo 는 stallionSalePrice 공식과 같고 교배권이 늘면 가격이 내려간다', () => {
    const { sim, male } = withThreeCandidates();
    const horse = sim.horses[male]!;
    const quote = salePriceQuote(sim, male)!;
    const age = sim.date.year - horse.birthYear;
    const mult = stallionRecordSaleMult(horse.record);
    expect(salePriceWithNominationsKo(sim, male, 2))
      .toBe(feeKo(stallionSalePrice(quote.fee, age, 'domestic', 2, mult)));
    expect(salePriceWithNominationsKo(sim, male, 0)).toBe(feeKo(quote.domestic));
    expect(stallionSalePrice(quote.fee, age, 'domestic', 2, mult)).toBeLessThanOrEqual(quote.domestic);
  });
});
