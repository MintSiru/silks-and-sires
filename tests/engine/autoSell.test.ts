import { describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { getNamingData, getNicks, getSalesData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import {
  consignProposal,
  createAutoSellSystem,
  proposeSales,
  removeSellProposal,
  setAutoSell,
} from '../../src/engine/sales/autoSell';
import type { SalesStaticData } from '../../src/engine/sales/system';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { meetsAutoTrainingGrade, playerGradeOf } from '../../src/engine/season/autoTraining';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import type { GameState, Horse, HorseId, Rng, SaleEventDef, SaleKind, SellProposal } from '../../src/engine/types';

const SEED = 20261017;
const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;
/** 판매 제안 창 안의 주: 두 테스트 세일의 발표 주(시작 주 20 − 위탁 마감 리드 6 = 14)보다 앞, 창(10~13) 안 */
const NOW_WEEK = 12;
const RACE_SALE = 'sev_test_race';
const YEARLING_SALE = 'sev_test_yearling';
const BREEZE_SALE = 'sev_test_breeze';
const EARLY_SALE = 'sev_test_early';

const SALES_BASE = getSalesData();

function worldData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
  };
}

/** 기준 종류의 실제 세일 정의를 복사해 테스트용 id·시작 주로 바꾼다(회사·북은 실데이터 그대로) */
function eventOf(kind: SaleKind, id: string, week: number): SaleEventDef {
  const base = SALES_BASE.events.find((e) => e.kind === kind);
  if (base === undefined) throw new Error(`테스트 전제 위반: ${kind} 세일이 없다`);
  return { ...base, id, week };
}

/** 테스트용 세일 데이터: 현역 세일·1세 세일은 발표 주 14(시작 20), 조기 현역 세일은 발표 주 3(시작 9) */
const DATA: SalesStaticData = {
  sales: {
    version: SALES_BASE.version,
    companies: SALES_BASE.companies,
    events: [
      eventOf('horses_in_training', RACE_SALE, 20),
      eventOf('yearling', YEARLING_SALE, 20),
      eventOf('breeze_up', BREEZE_SALE, 20),
    ],
  },
};
const EARLY_DATA: SalesStaticData = {
  sales: {
    version: SALES_BASE.version,
    companies: SALES_BASE.companies,
    events: [eventOf('horses_in_training', EARLY_SALE, 9)],
  },
};

function boot(): GameState {
  const game = createNewGame({ seed: SEED, playerName: 'Test Owner', silks: SILKS });
  return bootstrapWorld(game, worldData(), createRng(SEED));
}

/** 플레이어 말 목록을 통째로 바꾼다(기존 플레이어 말은 뺀다). 주차는 NOW_WEEK, 연말 정산은 끝난 상태 */
function withPlayerHorses(base: GameState, horses: readonly Horse[], week = NOW_WEEK): GameState {
  const owner = base.owners[base.playerOwnerId];
  if (owner === undefined) throw new Error('테스트 전제 위반: 플레이어 마주가 없다');
  const others = Object.values(base.horses).filter((h) => h.ownerId !== base.playerOwnerId);
  const horseMap: Record<HorseId, Horse> = {};
  for (const h of others) horseMap[h.id] = h;
  for (const h of horses) horseMap[h.id] = h;
  return {
    ...base,
    date: { year: START_YEAR, week },
    horses: horseMap,
    owners: {
      ...base.owners,
      [base.playerOwnerId]: { ...owner, horseIds: horses.map((h) => h.id) },
    },
    yearEnd: { lastSubmittedYear: START_YEAR, declinedRenewals: [] },
  };
}

function templateOf(base: GameState): Horse {
  const template = Object.values(base.horses).find((h) => h.ownerId === base.playerOwnerId);
  if (template === undefined) throw new Error('테스트 전제 위반: 플레이어 말이 없다');
  return template;
}

const LOW_ABILITY = { speed: 40, stamina: 40, acceleration: 40, guts: 40, power: 40 };

interface RacerSpec {
  id: string;
  or: number;
  groupWins?: number;
}

/** 현역(in_training, 4세) 한 두. 부 없음·낮은 능력이라 혈통·평가 보존에 걸리지 않게 둔다 */
function racer(base: GameState, spec: RacerSpec): Horse {
  const template = templateOf(base);
  return {
    ...template,
    id: spec.id,
    name: `Racer ${spec.id}`,
    sex: 'male',
    gelded: true,
    birthYear: START_YEAR - 4,
    status: 'in_training',
    sireId: null,
    damId: null,
    ownerId: base.playerOwnerId,
    breederId: null,
    officialRating: spec.or,
    ability: { ...LOW_ABILITY },
    potential: { ...LOW_ABILITY },
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: spec.groupWins ?? 0 },
    condition: { fitness: 80, fatigue: 0, mental: 80, injury: null },
  };
}

/** 현역 7두: A 는 그룹 우승(보존), B 는 OR 95(보존), C~G 는 OR 60~68. 남길 6두라 C 한 두가 하위 제안 대상 */
function sevenRacers(base: GameState): Horse[] {
  return [
    racer(base, { id: 'h-test-a', or: 50, groupWins: 1 }),
    racer(base, { id: 'h-test-b', or: 95 }),
    racer(base, { id: 'h-test-c', or: 60 }),
    racer(base, { id: 'h-test-d', or: 62 }),
    racer(base, { id: 'h-test-e', or: 64 }),
    racer(base, { id: 'h-test-f', or: 66 }),
    racer(base, { id: 'h-test-g', or: 68 }),
  ];
}

/** 시스템에 넘기면 공용 rng 를 건드렸을 때 던지는 가짜 rng */
function forbiddenRng(): Rng {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(`공용 rng 접근 금지: ${String(prop)}`);
    },
  }) as unknown as Rng;
}

/** 선택 사항 덮어쓰기: 반환값이 대상 말 ID 목록 */
function proposedIds(list: readonly SellProposal[]): string[] {
  return list.map((p) => p.horseId);
}

describe('판매 담당: 제안 생성', () => {
  it('우수마(입상·OR 상위)는 남기고 하위 현역 한 두만 제안한다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const proposals = proposeSales(state, DATA);
    expect(proposedIds(proposals)).toEqual(['h-test-c']);
    const [only] = proposals;
    expect(only).toBeDefined();
    expect(only?.saleId).toBe(RACE_SALE);
    expect(only?.year).toBe(START_YEAR);
    expect(only?.status).toBe('proposed');
    expect(only?.note).toContain('현역 두수 초과');
    expect(Number.isInteger(only?.reserve ?? -1)).toBe(true);
  });

  it('1세 세일은 같은 로트의 평가 하위 절반(내림)을 제안한다', () => {
    const base = boot();
    const yearlings: Horse[] = ['h-test-y1', 'h-test-y2', 'h-test-y3', 'h-test-y4'].map((id) => ({
      ...racer(base, { id, or: 0 }),
      birthYear: START_YEAR - 1,
      status: 'yearling',
      officialRating: null,
      trainerId: null,
    }));
    const state = withPlayerHorses(base, yearlings);
    const proposals = proposeSales(state, DATA).filter((p) => p.saleId === YEARLING_SALE);
    expect(proposals).toHaveLength(2);
    for (const p of proposals) expect(p.note).toContain('1세 하위');
  });

  it('빚이 있으면 남길 현역 두수가 줄어 제안이 늘어난다(IN_DEBT 4두)', () => {
    const base = boot();
    const racers = sevenRacers(base);
    const calm = withPlayerHorses(base, racers);
    expect(proposedIds(proposeSales(calm, DATA))).toEqual(['h-test-c']);

    const indebted: GameState = { ...calm, economy: { ...calm.economy, debt: 500_000 } };
    const ids = proposedIds(proposeSales(indebted, DATA));
    expect(ids).toEqual(['h-test-c', 'h-test-d', 'h-test-e']);
    for (const p of proposeSales(indebted, DATA)) expect(p.note).toContain('빚 상환');
  });

  it('같은 상태면 같은 결과이고, 입력 상태와 공용 rng 상태는 바뀌지 않는다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const snapshot = structuredClone(state);
    const first = proposeSales(state, DATA);
    const second = proposeSales(state, DATA);
    expect(second).toEqual(first);
    expect(state).toEqual(snapshot);
    expect(state.rng).toEqual(snapshot.rng);
  });

  it('판매 담당 시스템은 공용 rng 를 쓰지 않고 제안 이벤트를 낸다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const system = createAutoSellSystem(DATA);
    const draft = structuredClone(state);
    const events = system.run(draft, { date: { year: START_YEAR, week: NOW_WEEK }, rng: forbiddenRng() });
    expect(events).toEqual([{ type: 'sell_proposals_ready', count: 1, date: { year: START_YEAR, week: NOW_WEEK } }]);
    expect(draft.sales.sellProposals?.map((p) => p.horseId)).toEqual(['h-test-c']);
  });

  it('연말 정산 대기 중이면 정산 대상 현역은 제안에서 뺀다', () => {
    const base = boot();
    const racers = sevenRacers(base);
    const pendingState: GameState = {
      ...withPlayerHorses(base, racers, 1),
      yearEnd: { lastSubmittedYear: START_YEAR - 1, declinedRenewals: [] },
    };
    expect(proposeSales(pendingState, EARLY_DATA)).toEqual([]);

    const settledState: GameState = {
      ...pendingState,
      yearEnd: { lastSubmittedYear: START_YEAR, declinedRenewals: [] },
    };
    expect(proposedIds(proposeSales(settledState, EARLY_DATA))).toEqual(['h-test-c']);
  });
});

describe('판매 담당: 빼기·지금 위탁·자동 설정', () => {
  it('뺀 말은 skipped 가 되고 같은 세일에 다른 말로 채우지 않는다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const proposals = proposeSales(state, DATA);
    const withList: GameState = { ...state, sales: { ...state.sales, sellProposals: proposals } };
    const snapshot = structuredClone(withList);

    const removed = removeSellProposal(withList, 'h-test-c');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(withList).toEqual(snapshot);
    const item = removed.state.sales.sellProposals?.find((p) => p.horseId === 'h-test-c');
    expect(item?.status).toBe('skipped');
    expect(item?.note).toBe('플레이어가 뺌');
    expect(proposeSales(removed.state, DATA)).toEqual([]);

    expect(removeSellProposal(removed.state, 'h-test-c')).toEqual({ ok: false, error: 'no_proposal' });
  });

  it('지금 위탁하면 세일 위탁에 올라가고 제안은 consigned 가 된다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const withList: GameState = { ...state, sales: { ...state.sales, sellProposals: proposeSales(state, DATA) } };
    const snapshot = structuredClone(withList);

    const result = consignProposal(withList, 'h-test-c', DATA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(withList).toEqual(snapshot);
    expect(result.state.sales.consignments).toEqual([
      expect.objectContaining({ horseId: 'h-test-c', saleId: RACE_SALE, year: START_YEAR }),
    ]);
    expect(result.state.sales.sellProposals?.find((p) => p.horseId === 'h-test-c')?.status).toBe('consigned');

    expect(consignProposal(withList, 'h-test-b', DATA)).toEqual({ ok: false, error: 'no_proposal' });
  });

  it('setAutoSell 은 설정만 바꾸고 원본은 그대로 둔다', () => {
    const base = boot();
    const result = setAutoSell(base, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.settings.autoSell).toBe(false);
    expect(base.settings.autoSell).toBeUndefined();
  });

  it('autoSell=false 면 마감 직전 주에도 위탁하지 않고 마감이 지나면 skipped 가 된다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const system = createAutoSellSystem(DATA);
    const draft: GameState = { ...structuredClone(state), settings: { ...state.settings, autoSell: false } };

    system.run(draft, { date: { year: START_YEAR, week: NOW_WEEK }, rng: forbiddenRng() });
    system.run(draft, { date: { year: START_YEAR, week: 13 }, rng: forbiddenRng() });
    expect(draft.sales.consignments).toEqual([]);
    expect(draft.sales.sellProposals?.[0]?.status).toBe('proposed');

    system.run(draft, { date: { year: START_YEAR, week: 14 }, rng: forbiddenRng() });
    expect(draft.sales.sellProposals?.[0]?.status).toBe('skipped');
    expect(draft.sales.sellProposals?.[0]?.note).toBe('위탁 마감이 지나 빠짐');
  });

  it('자동 위탁이 켜져 있으면 마감 직전 주(발표 주 − 1)에 위탁한다', () => {
    const base = boot();
    const state = withPlayerHorses(base, sevenRacers(base));
    const system = createAutoSellSystem(DATA);
    const draft = structuredClone(state);

    system.run(draft, { date: { year: START_YEAR, week: NOW_WEEK }, rng: forbiddenRng() });
    expect(draft.sales.consignments).toEqual([]);
    system.run(draft, { date: { year: START_YEAR, week: 13 }, rng: forbiddenRng() });
    expect(draft.sales.consignments.map((c) => c.horseId)).toEqual(['h-test-c']);
    expect(draft.sales.sellProposals?.[0]?.status).toBe('consigned');
  });
});

/**
 * 2세(브리즈업 대상, 조교사 없음) 한 두. 생산자는 플레이어 마주(자가 생산, M7-A1). level 40 은 평가 E, 55 는 C, 80 은 A·B 가 나온다(측정).
 * 부 없음·OR 없음이라 혈통·OR 보존에 걸리지 않는다
 */
function twoYearOld(base: GameState, id: string, level: number): Horse {
  const generated = generateHorse(createRng(`auto-sell-${id}`), {
    id,
    name: 'Silver Fern',
    sex: 'male',
    birthYear: START_YEAR - 2,
    currentYear: START_YEAR,
    countryOfBirth: 'GB',
    status: 'yearling',
    level,
  });
  return {
    ...generated,
    ownerId: base.playerOwnerId,
    breederId: base.playerOwnerId,
    trainerId: null,
    sireId: null,
    damId: null,
    officialRating: null,
  };
}

describe('판매 담당: 2세 브리즈업 판매(M6-B4)', () => {
  it('자동 조교 기준 미달 2세만 브리즈업 세일 제안으로 내고 기준 이상 2세는 남긴다', () => {
    const base = boot();
    const low = [twoYearOld(base, 'h-test-low-1', 40), twoYearOld(base, 'h-test-low-2', 40)];
    const high = twoYearOld(base, 'h-test-high', 80);
    const state = withPlayerHorses(base, [...low, high]);
    expect(meetsAutoTrainingGrade(playerGradeOf(state, high))).toBe(true);
    for (const horse of low) expect(meetsAutoTrainingGrade(playerGradeOf(state, horse))).toBe(false);

    const breeze = proposeSales(state, DATA).filter((p) => p.saleId === BREEZE_SALE);
    expect(proposedIds(breeze).slice().sort()).toEqual(['h-test-low-1', 'h-test-low-2']);
    for (const p of breeze) {
      expect(p.year).toBe(START_YEAR);
      expect(p.note).toContain('2세 하위');
    }
  });

  it('기준 미달 2세가 없으면 브리즈업 세일에는 제안하지 않는다', () => {
    const base = boot();
    const state = withPlayerHorses(base, [twoYearOld(base, 'h-test-high', 80)]);
    expect(proposeSales(state, DATA).filter((p) => p.saleId === BREEZE_SALE)).toEqual([]);
  });

  it('산 2세는 기준 미달이어도 브리즈업 판매 제안 대상이 아니다(M7-A1)', () => {
    const base = boot();
    const homebredLow = twoYearOld(base, 'h-test-low-1', 40);
    const bought = { ...twoYearOld(base, 'h-test-bought', 40), breederId: 'ai-breeder' };
    const state = withPlayerHorses(base, [homebredLow, bought]);
    expect(meetsAutoTrainingGrade(playerGradeOf(state, bought))).toBe(false);
    const breeze = proposeSales(state, DATA).filter((p) => p.saleId === BREEZE_SALE);
    expect(proposedIds(breeze)).toEqual(['h-test-low-1']);
  });

  it('자가 생산 C 등급 2세는 현역이 있으면 남고 브리즈업 판매 제안 대상이다(M7-A1 기존 동작)', () => {
    const base = boot();
    const homebredC = twoYearOld(base, 'h-test-d2', 60);
    const state = withPlayerHorses(base, [...sevenRacers(base), homebredC]);
    expect(playerGradeOf(state, homebredC)).toBe('C');
    const breeze = proposeSales(state, DATA).filter((p) => p.saleId === BREEZE_SALE);
    expect(proposedIds(breeze)).toEqual(['h-test-d2']);
  });
});
