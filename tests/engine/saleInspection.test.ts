import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { PLAYER_ASSESSOR_SKILL } from '../../src/engine/config/playerView';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { contractFor } from '../../src/engine/economy/contractQuery';
import { relationKey } from '../../src/engine/economy/relations';
import { gradeOf } from '../../src/engine/horse/assessment';
import { assessForPlayer, assessorSkillFor } from '../../src/engine/horse/playerView';
import { createRng } from '../../src/engine/rng';
import { buildCatalogue, type CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { eligibleInspectors, inspectLot } from '../../src/engine/sales/inspection';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { Grade, GameState, Horse, SaleCatalogue, SaleEventDef, TrainerId } from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;
const LONG_TIMEOUT = 900_000;
/** 정확도 검사에 쓰는 1세마 로트 수(수용 기준 5) */
const ACCURACY_LOTS = 100;
/** 정확도 검사의 종합 등급 기준 능력치. assessment.ts 의 OVERALL_TRAITS 와 같은 항목 */
const OVERALL_TRAITS = ['speed', 'stamina', 'acceleration', 'guts', 'power'] as const;
/** 등급 차 계산용 서수 */
const GRADE_ORDINAL: Record<Grade, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };

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

const SALES = getSalesData();
const CATALOGUE_DATA: CatalogueStaticData = {
  sales: SALES,
  stallionRecords: getStallionRecords(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

let BASE: GameState;
/** 1세마 카탈로그(시드 기반)를 넣은 상태. 로트 말은 horses 에 들어 있다 */
let CAT_STATE: GameState;
let CATALOGUE: SaleCatalogue;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  const event = yearlingEvent();
  const draft = structuredClone(BASE);
  // 게임 흐름(sales/system.ts)과 같은 카탈로그 rng 키
  const rng = createRng(`${BASE.initialSeed}:catalogue:${event.id}:${START_YEAR}`);
  CATALOGUE = buildCatalogue(draft, event, START_YEAR, CATALOGUE_DATA, rng);
  draft.sales.catalogues.push(CATALOGUE);
  CAT_STATE = draft;
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

function yearlingEvent(): SaleEventDef {
  const event = SALES.events.find((e) => e.id === 'sev_ashcombe_yearling_oct');
  if (event === undefined) throw new Error('세일 없음: sev_ashcombe_yearling_oct');
  return event;
}

function horseOf(state: GameState, horseId: string): Horse {
  const horse = state.horses[horseId];
  if (horse === undefined) throw new Error(`말 없음: ${horseId}`);
  return horse;
}

function firstHorseId(state: GameState): string {
  const id = Object.keys(state.horses).sort()[0];
  if (id === undefined) throw new Error('말 없음');
  return id;
}

/** 조교사 id 를 정렬 순으로 n 명 */
function trainerIds(state: GameState, n: number): TrainerId[] {
  const ids = Object.keys(state.trainers).sort();
  if (ids.length < n) throw new Error(`조교사 부족: ${ids.length} < ${n}`);
  return ids.slice(0, n);
}

function firstTrainerId(state: GameState): TrainerId {
  const [id] = trainerIds(state, 1);
  if (id === undefined) throw new Error('조교사 없음');
  return id;
}

/** 조교사의 eye·관계·전속 설정을 바꾼다(state 를 직접 바꾸므로 복제본에 쓴다) */
function setTrainer(
  state: GameState,
  trainerId: TrainerId,
  opts: { eye?: number; relation?: number; retained?: boolean },
): void {
  const trainer = state.trainers[trainerId];
  if (trainer === undefined) throw new Error(`조교사 없음: ${trainerId}`);
  if (opts.eye !== undefined) trainer.eye = opts.eye;
  if (opts.relation !== undefined) state.relations.values[relationKey('trainer', trainerId)] = opts.relation;
  if (opts.retained) {
    state.relations.contracts.push({
      kind: 'trainer',
      personId: trainerId,
      startYear: START_YEAR,
      endYear: START_YEAR,
      annualFee: 0,
    });
  }
}

/** 말의 조교사를 바꾼 복제본(null 이면 조교사 없음) */
function withHorseTrainer(state: GameState, horseId: string, trainerId: TrainerId | null): GameState {
  const next = structuredClone(state);
  horseOf(next, horseId).trainerId = trainerId;
  return next;
}

function catalogueOf(state: GameState): SaleCatalogue {
  const cat = state.sales.catalogues[0];
  if (cat === undefined) throw new Error('카탈로그 없음');
  return cat;
}

/** 로트 말의 실제 등급: potential 의 종합 항목 평균을 gradeOf 에 넣는다(1세마 단계의 진짜 값) */
function trueGradeOf(horse: Horse): Grade {
  const sum = OVERALL_TRAITS.reduce((acc, key) => acc + horse.potential[key], 0);
  return gradeOf(sum / OVERALL_TRAITS.length);
}

describe('assessorSkillFor (수용 1)', () => {
  it('조교사 없음 → 50, eye 40 조교사 → 40, 전속 eye 90 → 100, 전속 eye 40 → 55', () => {
    const base = fresh();
    const horseId = firstHorseId(base);
    const trainerId = firstTrainerId(base);

    const none = withHorseTrainer(base, horseId, null);
    expect(assessorSkillFor(none, horseOf(none, horseId))).toBe(50);

    const plain = fresh();
    setTrainer(plain, trainerId, { eye: 40 });
    const withPlain = withHorseTrainer(plain, horseId, trainerId);
    expect(assessorSkillFor(withPlain, horseOf(withPlain, horseId))).toBe(40);

    const strong = fresh();
    setTrainer(strong, trainerId, { eye: 90, retained: true });
    const withStrong = withHorseTrainer(strong, horseId, trainerId);
    expect(assessorSkillFor(withStrong, horseOf(withStrong, horseId))).toBe(100);

    const weak = fresh();
    setTrainer(weak, trainerId, { eye: 40, retained: true });
    const withWeak = withHorseTrainer(weak, horseId, trainerId);
    expect(assessorSkillFor(withWeak, horseOf(withWeak, horseId))).toBe(55);
  });

  it('조교사 없음 값은 PLAYER_ASSESSOR_SKILL 과 같다', () => {
    const base = fresh();
    const horseId = firstHorseId(base);
    const none = withHorseTrainer(base, horseId, null);
    expect(assessorSkillFor(none, horseOf(none, horseId))).toBe(PLAYER_ASSESSOR_SKILL);
  });
});

describe('assessForPlayer 인자 규칙 (수용 2)', () => {
  it('인자 생략 시 assessorSkillFor 값을 쓰고, 인자를 주면 그 값을 쓴다', () => {
    const base = fresh();
    const horseId = firstHorseId(base);
    const trainerId = firstTrainerId(base);
    const strong = fresh();
    setTrainer(strong, trainerId, { eye: 90, retained: true });
    const state = withHorseTrainer(strong, horseId, trainerId);
    const horse = horseOf(state, horseId);

    expect(assessForPlayer(state, horseId)).toEqual(
      assessForPlayer(state, horseId, assessorSkillFor(state, horse)),
    );
    expect(assessForPlayer(state, horseId)).toEqual(assessForPlayer(state, horseId, 100));
    // 인자 50 을 주면 조교사 능력과 무관하게 50 으로 평가한다(조교사 없는 상태의 기본값과 같다)
    const noTrainer = withHorseTrainer(base, horseId, null);
    expect(assessForPlayer(state, horseId, PLAYER_ASSESSOR_SKILL)).toEqual(assessForPlayer(noTrainer, horseId));
  });
});

describe('eligibleInspectors (수용 3)', () => {
  it('전속·관계 10 이상만, 9.99 는 제외, 전속이 먼저, eye 키 없음', () => {
    const state = fresh();
    state.relations.values = {};
    state.relations.contracts = [];
    const [retainedId, relatedId, lowId] = trainerIds(state, 3);
    if (retainedId === undefined || relatedId === undefined || lowId === undefined) {
      throw new Error('조교사 3명 필요');
    }
    setTrainer(state, retainedId, { eye: 40, retained: true });
    setTrainer(state, relatedId, { relation: 10 });
    setTrainer(state, lowId, { relation: 9.99 });

    const list = eligibleInspectors(state);
    expect(list.map((row) => row.trainerId)).toEqual([retainedId, relatedId]);
    expect(list[0]?.reason).toBe('retained');
    expect(list[1]?.reason).toBe('relation');
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual(['name', 'reason', 'trainerId']);
    }
    expect(JSON.stringify(list)).not.toContain('eye');
  });

  it('같은 묶음 안은 이름 오름차순, 전속이 먼저', () => {
    const state = fresh();
    state.relations.values = {};
    state.relations.contracts = [];
    const ids = Object.keys(state.trainers).sort();
    for (const id of ids) setTrainer(state, id, { relation: 50 });
    const retainedId = ids[ids.length - 1];
    if (retainedId === undefined) throw new Error('조교사 없음');
    setTrainer(state, retainedId, { retained: true });

    const list = eligibleInspectors(state);
    expect(list).toHaveLength(ids.length);
    expect(list[0]?.trainerId).toBe(retainedId);
    const names = list.slice(1).map((row) => row.name);
    expect(names).toEqual([...names].sort());
  });

  it('계약 여부는 contractFor 로 확인된다(테스트 전제)', () => {
    const state = fresh();
    expect(contractFor(state, 'trainer', firstTrainerId(state))).toBeUndefined();
  });
});

describe('inspectLot (수용 4)', () => {
  /** 조교사에게 관계 50 을 준 상태(검사 가능) */
  function readyState(): { state: GameState; trainerId: TrainerId } {
    const state = structuredClone(CAT_STATE);
    const trainerId = firstTrainerId(state);
    setTrainer(state, trainerId, { relation: 50 });
    return { state, trainerId };
  }

  it('실패 사유 5개가 각각 나오고, 조건을 맞추면 성공한다', () => {
    const { state, trainerId } = readyState();
    const cat = catalogueOf(state);
    const lot = cat.lots[0];
    if (lot === undefined) throw new Error('로트 없음');

    expect(inspectLot(state, 'sev_no_such_sale', START_YEAR, lot.lotNo, trainerId)).toEqual({
      ok: false,
      error: 'catalogue_not_found',
    });
    expect(inspectLot(state, cat.saleId, START_YEAR, 999_999, trainerId)).toEqual({
      ok: false,
      error: 'lot_not_found',
    });

    const closed = structuredClone(state);
    catalogueOf(closed).lots[0] = { ...lot, result: { kind: 'withdrawn' } };
    expect(inspectLot(closed, cat.saleId, START_YEAR, lot.lotNo, trainerId)).toEqual({
      ok: false,
      error: 'lot_closed',
    });

    const missing = structuredClone(state);
    delete missing.horses[lot.horseId];
    expect(inspectLot(missing, cat.saleId, START_YEAR, lot.lotNo, trainerId)).toEqual({
      ok: false,
      error: 'horse_missing',
    });

    const low = structuredClone(state);
    setTrainer(low, trainerId, { relation: 9.99 });
    expect(inspectLot(low, cat.saleId, START_YEAR, lot.lotNo, trainerId)).toEqual({
      ok: false,
      error: 'not_eligible',
    });
    expect(inspectLot(state, cat.saleId, START_YEAR, lot.lotNo, 'tr-does-not-exist')).toEqual({
      ok: false,
      error: 'not_eligible',
    });

    const ok = inspectLot(state, cat.saleId, START_YEAR, lot.lotNo, trainerId);
    expect(ok.ok).toBe(true);
  });

  it('같은 입력 2회는 같은 결과이고 상태를 바꾸지 않는다', () => {
    const { state, trainerId } = readyState();
    const cat = catalogueOf(state);
    const lot = cat.lots[3];
    if (lot === undefined) throw new Error('로트 없음');
    const before = structuredClone(state);
    const first = inspectLot(state, cat.saleId, START_YEAR, lot.lotNo, trainerId);
    const second = inspectLot(state, cat.saleId, START_YEAR, lot.lotNo, trainerId);
    expect(second).toEqual(first);
    expect(state).toEqual(before);
  });

  it('다른 조교사는 다른 결과가 섞여 나온다(같은 로트 여러 개 중 하나 이상 다름)', () => {
    const state = structuredClone(CAT_STATE);
    const [a, b] = trainerIds(state, 2);
    if (a === undefined || b === undefined) throw new Error('조교사 2명 필요');
    setTrainer(state, a, { relation: 50, eye: 50 });
    setTrainer(state, b, { relation: 50, eye: 50 });
    const cat = catalogueOf(state);
    const lots = cat.lots.slice(0, 30);
    const differs = lots.some((lot) => {
      const x = inspectLot(state, cat.saleId, START_YEAR, lot.lotNo, a);
      const y = inspectLot(state, cat.saleId, START_YEAR, lot.lotNo, b);
      return JSON.stringify(x) !== JSON.stringify(y);
    });
    expect(differs).toBe(true);
  });
});

describe('상마안에 따른 정확도 (수용 5)', () => {
  it('1세마 로트 100개: eye 90 쪽의 평균 등급 차가 eye 20 보다 작다', () => {
    const cat = catalogueOf(CAT_STATE);
    expect(cat.lots.length).toBeGreaterThanOrEqual(ACCURACY_LOTS);
    const lots = cat.lots.slice(0, ACCURACY_LOTS);
    const trainerId = firstTrainerId(CAT_STATE);
    expect(contractFor(CAT_STATE, 'trainer', trainerId)).toBeUndefined();

    const low = structuredClone(CAT_STATE);
    setTrainer(low, trainerId, { eye: 20, relation: 50 });
    const high = structuredClone(CAT_STATE);
    setTrainer(high, trainerId, { eye: 90, relation: 50 });

    let sumLow = 0;
    let sumHigh = 0;
    for (const lot of lots) {
      const truth = GRADE_ORDINAL[trueGradeOf(horseOf(CAT_STATE, lot.horseId))];
      const a = inspectLot(low, cat.saleId, cat.year, lot.lotNo, trainerId);
      const b = inspectLot(high, cat.saleId, cat.year, lot.lotNo, trainerId);
      if (!a.ok || !b.ok) throw new Error(`검사 실패: lot ${lot.lotNo}`);
      sumLow += Math.abs(GRADE_ORDINAL[a.assessment.conformation.overall] - truth);
      sumHigh += Math.abs(GRADE_ORDINAL[b.assessment.conformation.overall] - truth);
    }
    const avgLow = sumLow / ACCURACY_LOTS;
    const avgHigh = sumHigh / ACCURACY_LOTS;
    expect(avgHigh).toBeLessThan(avgLow);
  }, LONG_TIMEOUT);
});
