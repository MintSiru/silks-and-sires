import { beforeAll, describe, expect, it } from 'vitest';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSalesData, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { displayName } from '../../src/engine/naming/register';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameState, SellProposal } from '../../src/engine/types';
import { homeTasks } from '../../src/ui/home/homeView';
import {
  sellProposalEmptyKo,
  sellProposalErrorKo,
  sellProposalGuideKo,
  sellProposalRows,
  sellStatusKo,
} from '../../src/ui/sales/sellProposalView';

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

const SALES = { sales: getSalesData() };

let base: GameState;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261017, playerName: '가상 마주', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, BOOT_DATA);
}, 600_000);

/** 플레이어 말 id 목록(순서 고정) */
function playerHorseIds(state: GameState): string[] {
  return Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId)
    .map((h) => h.id)
    .sort();
}

/** 주차가 다른 두 세일 이벤트 id(정렬 테스트용) */
function twoSaleEvents(): [string, string] {
  const events = [...(SALES.sales.events)].sort((a, b) => a.week - b.week);
  const early = events[0];
  const late = events.find((e) => e.week > (early?.week ?? 0));
  if (early === undefined || late === undefined) throw new Error('세일 이벤트 부족');
  return [early.id, late.id];
}

function withProposals(list: SellProposal[], autoSell?: boolean): GameState {
  const state = structuredClone(base);
  state.date = { year: 2026, week: 1 };
  state.sales.sellProposals = list;
  if (autoSell === undefined) delete state.settings.autoSell;
  else state.settings.autoSell = autoSell;
  return state;
}

describe('판매 제안 칸 행', () => {
  it('제안이 없으면 빈 목록이다', () => {
    const state = withProposals([]);
    expect(sellProposalRows(state, SALES)).toEqual([]);
    expect(sellProposalEmptyKo()).toBe('판매 제안이 없습니다.');
  });

  it('말 이름·세일 이름·연도·유보가·이유·상태를 한국어로 채운다', () => {
    const state = structuredClone(base);
    const [horseId] = playerHorseIds(state);
    if (horseId === undefined) throw new Error('플레이어 말 없음');
    const [saleId] = twoSaleEvents();
    const saleName = SALES.sales.events.find((e) => e.id === saleId)?.name ?? '';
    state.sales.sellProposals = [{ horseId, saleId, year: 2026, reserve: 60000, note: '능력 하위 · 유지비 절감', status: 'proposed' }];
    const [row] = sellProposalRows(state, SALES);
    expect(row).toMatchObject({
      horseId,
      horseName: displayName(state, state.horses[horseId]!),
      saleId,
      saleLabel: `${saleName} · 2026년`,
      reserveKo: '€60,000',
      note: '능력 하위 · 유지비 절감',
      status: 'proposed',
      statusKo: '자동 위탁 예정',
      statusTone: 'good',
      canRemove: true,
      canConsignNow: true,
    });
  });

  it('유보가가 null 이면 유보 없음으로 표기한다', () => {
    const state = structuredClone(base);
    const [horseId] = playerHorseIds(state);
    const [saleId] = twoSaleEvents();
    if (horseId === undefined) throw new Error('플레이어 말 없음');
    state.sales.sellProposals = [{ horseId, saleId, year: 2026, reserve: null, note: '', status: 'proposed' }];
    expect(sellProposalRows(state, SALES)[0]?.reserveKo).toBe('유보 없음');
  });

  it('상태 칩: consigned 는 위탁함, skipped 는 뺌·지나감, 그 행만 빼기·지금 위탁이 빠진다', () => {
    const state = structuredClone(base);
    const ids = playerHorseIds(state);
    const [saleId] = twoSaleEvents();
    if (ids.length < 3) throw new Error('플레이어 말 부족');
    state.sales.sellProposals = [
      { horseId: ids[0]!, saleId, year: 2026, reserve: null, note: '', status: 'consigned' },
      { horseId: ids[1]!, saleId, year: 2026, reserve: null, note: '플레이어가 뺌', status: 'skipped' },
      { horseId: ids[2]!, saleId, year: 2026, reserve: null, note: '', status: 'proposed' },
    ];
    const rows = sellProposalRows(state, SALES);
    const byId = new Map(rows.map((r) => [r.horseId, r] as const));
    expect(byId.get(ids[0]!)).toMatchObject({ statusKo: '위탁함', statusTone: 'good', canRemove: false, canConsignNow: false });
    expect(byId.get(ids[1]!)).toMatchObject({ statusKo: '뺌·지나감', statusTone: 'plain', canRemove: false, canConsignNow: false });
    expect(byId.get(ids[2]!)).toMatchObject({ canRemove: true, canConsignNow: true });
  });

  it('자동 위탁이 꺼져 있으면 proposed 는 검토 대기이고 안내 문구가 바뀐다', () => {
    const state = withProposals([], false);
    const [horseId] = playerHorseIds(state);
    const [saleId] = twoSaleEvents();
    if (horseId === undefined) throw new Error('플레이어 말 없음');
    state.sales.sellProposals = [{ horseId, saleId, year: 2026, reserve: null, note: '', status: 'proposed' }];
    expect(sellProposalRows(state, SALES)[0]).toMatchObject({ statusKo: '검토 대기', statusTone: 'caution' });
    expect(sellStatusKo('proposed', false)).toBe('검토 대기');
    expect(sellStatusKo('proposed', true)).toBe('자동 위탁 예정');
    expect(sellProposalGuideKo(true)).toBe('빼지 않으면 위탁 마감 전 주에 자동으로 세일에 냅니다.');
    expect(sellProposalGuideKo(false)).not.toBe(sellProposalGuideKo(true));
  });

  it('settings.autoSell 이 없으면 켜진 것으로 본다', () => {
    const state = withProposals([]);
    expect(sellProposalGuideKo(state.settings.autoSell !== false)).toBe(sellProposalGuideKo(true));
  });

  it('말이 없는 제안은 뺀다', () => {
    const state = structuredClone(base);
    const [saleId] = twoSaleEvents();
    state.sales.sellProposals = [{ horseId: 'no_such_horse', saleId, year: 2026, reserve: null, note: '', status: 'proposed' }];
    expect(sellProposalRows(state, SALES)).toEqual([]);
  });

  it('세일 날짜 → 말 이름 순으로 정렬하고 입력 상태는 바꾸지 않는다', () => {
    const state = structuredClone(base);
    const ids = playerHorseIds(state);
    const [early, late] = twoSaleEvents();
    if (ids.length < 3) throw new Error('플레이어 말 부족');
    const list: SellProposal[] = [
      { horseId: ids[0]!, saleId: late!, year: 2026, reserve: null, note: '', status: 'proposed' },
      { horseId: ids[1]!, saleId: early!, year: 2026, reserve: null, note: '', status: 'proposed' },
      { horseId: ids[2]!, saleId: early!, year: 2026, reserve: null, note: '', status: 'proposed' },
    ];
    state.sales.sellProposals = list;
    const before = structuredClone(state);
    const rows = sellProposalRows(state, SALES);
    expect(rows.map((r) => r.saleId)).toEqual([early, early, late]);
    const [first, second] = rows;
    expect(first!.horseName.localeCompare(second!.horseName, 'ko')).toBeLessThanOrEqual(0);
    expect(state).toEqual(before);
    expect(sellProposalRows(state, SALES)).toEqual(rows);
  });
});

describe('판매 제안 오류 문구', () => {
  it('빼기·지금 위탁 실패 사유를 한국어로 돌려준다', () => {
    expect(sellProposalErrorKo('no_proposal')).toBe('판매 제안을 찾을 수 없습니다.');
    expect(sellProposalErrorKo('too_late')).toContain('위탁');
    expect(sellProposalErrorKo('already_consigned')).toContain('위탁');
  });
});

describe('홈 할 일 · 판매 제안', () => {
  it('검토 대기 제안이 있으면 세일 메뉴로 가는 할 일을 낸다', () => {
    const state = structuredClone(base);
    const ids = playerHorseIds(state);
    const [saleId] = twoSaleEvents();
    if (ids.length < 2) throw new Error('플레이어 말 부족');
    state.sales.sellProposals = [
      { horseId: ids[0]!, saleId: saleId!, year: 2026, reserve: null, note: '', status: 'proposed' },
      { horseId: ids[1]!, saleId: saleId!, year: 2026, reserve: null, note: '', status: 'consigned' },
    ];
    const task = homeTasks(state).find((t) => t.id === 'sell-proposals');
    expect(task).toEqual({ id: 'sell-proposals', label: '판매 제안 1두 — 세일에서 검토', screen: 'sales' });
  });

  it('검토할 제안이 없으면 할 일을 내지 않는다', () => {
    const state = withProposals([]);
    expect(homeTasks(state).some((t) => t.id === 'sell-proposals')).toBe(false);
  });
});
