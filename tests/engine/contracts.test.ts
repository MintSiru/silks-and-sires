import { beforeAll, describe, expect, it } from 'vitest';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { REPUTATION_MAX, STARTING_REPUTATION } from '../../src/engine/config/economy';
import { contractFor, isContractedKey } from '../../src/engine/economy/contractQuery';
import {
  createContractsSystem,
  retainerFee,
  retainerQuote,
  signRetainer,
  terminateRetainer,
} from '../../src/engine/economy/contracts';
import { adjustRelation, relationKey, relationOf } from '../../src/engine/economy/relations';
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
import { createRng } from '../../src/engine/rng';
import { emptyCareer } from '../../src/engine/people/generate';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  GameEvent,
  GameState,
  Jockey,
  Owner,
  RetainerContract,
  Trainer,
  WeekContext,
} from '../../src/engine/types';

const SEED = 20261012;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SAVED_AT = '2026-10-12T00:00:00.000Z';
/** 시즌 두 번(104주) 진행 테스트용 제한 시간(ms) */
const HEAVY_TIMEOUT = 300_000;
const MID_TIMEOUT = 120_000;

// ── 가상 인물 고정값 ──

function makeJockey(id: string, skill: number, birthYear: number, extra: Partial<Jockey> = {}): Jockey {
  return {
    id,
    name: `Test Jockey ${id}`,
    country: 'GB',
    birthYear,
    skill,
    minRidingWeightLb: 110,
    apprenticeAllowanceLb: 0,
    retainedBy: null,
    abilities: { start: 50, pace: 50, finish: 50, strength: 50 },
    preferredStyle: null,
    retired: false,
    career: emptyCareer(),
    ...extra,
  };
}

function makeTrainer(id: string, skill: number, birthYear: number): Trainer {
  return {
    id,
    name: `Test Trainer ${id}`,
    country: 'GB',
    yardName: 'Test Yard',
    region: 'Test Region',
    facilityGrade: 3,
    style: 'all_round',
    skill,
    weeklyFee: 200,
    capacity: 20,
    birthYear,
    staminaBias: 0,
    juvenileFocus: 0.5,
    eye: 50,
    career: emptyCareer(),
  };
}

/** 나이(2026 기준): 80·70·45·46·56 기수는 30세, young 기수는 22세 */
const JOCKEYS: Jockey[] = [
  makeJockey('jk-test-80', 80, 1996),
  makeJockey('jk-test-young', 60, 2004),
  makeJockey('jk-test-61', 61, 2004),
  makeJockey('jk-test-b', 70, 1996),
  makeJockey('jk-test-45', 45, 1996),
  makeJockey('jk-test-46', 46, 1996),
  makeJockey('jk-test-56', 56, 1996),
  makeJockey('jk-test-retired', 70, 1990, { retired: true }),
  makeJockey('jk-test-other', 70, 1996, { retainedBy: 'owner-ai-test' }),
];

/** tr-test-70 은 나이 50, tr-test-40 은 나이 50, tr-test-young 은 나이 35(젊음) */
const TRAINERS: Trainer[] = [
  makeTrainer('tr-test-70', 70, 1976),
  makeTrainer('tr-test-40', 40, 1976),
  makeTrainer('tr-test-young', 70, 1991),
];

/**
 * 테스트용 새 게임: 플레이어 한 명 + 가상 기수·조교사.
 * 명성 기본값은 최대(100)라서 skill 80 기수도 체결 테스트를 통과한다. 위상 경계를 재는 테스트만 STARTING_REPUTATION(10)을 명시한다.
 */
function baseGame(reputation: number = REPUTATION_MAX): GameState {
  const state = createNewGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } });
  state.jockeys = Object.fromEntries(JOCKEYS.map((j) => [j.id, structuredClone(j)]));
  state.trainers = Object.fromEntries(TRAINERS.map((t) => [t.id, structuredClone(t)]));
  state.relations.reputation = reputation;
  return state;
}

function jockeyOf(state: GameState, id: string): Jockey {
  const j = state.jockeys[id];
  if (j === undefined) throw new Error(`테스트 전제: 기수 ${id} 없음`);
  return j;
}

function trainerOf(state: GameState, id: string): Trainer {
  const t = state.trainers[id];
  if (t === undefined) throw new Error(`테스트 전제: 조교사 ${id} 없음`);
  return t;
}

function playerOf(state: GameState): Owner {
  const o = state.owners[state.playerOwnerId];
  if (o === undefined) throw new Error('테스트 전제: 플레이어 마주 없음');
  return o;
}

/**
 * 관계값을 직접 정한다(테스트 전제). 계약 중인 키는 adjustRelation 의 상승 배수·하한이 걸리므로
 * 계약 뒤에 관계를 맞출 때는 adjustRelation 을 쓰지 않는다.
 */
function setRelationValue(state: GameState, kind: 'jockey' | 'trainer', id: string, value: number): void {
  state.relations.values[relationKey(kind, id)] = value;
}

function withDate(state: GameState, year: number, week: number): GameState {
  const next = structuredClone(state);
  next.date = { year, week };
  return next;
}

function withBirthYear(state: GameState, kind: 'jockey' | 'trainer', id: string, birthYear: number): GameState {
  const next = structuredClone(state);
  if (kind === 'jockey') {
    jockeyOf(next, id).birthYear = birthYear;
  } else {
    trainerOf(next, id).birthYear = birthYear;
  }
  return next;
}

/** 성공 결과의 상태를 꺼낸다(실패면 테스트 전제 위반) */
function okState(r: { ok: true; state: GameState } | { ok: false; error: string }): GameState {
  if (!r.ok) throw new Error(`테스트 전제 위반: 체결 실패 ${r.error}`);
  return r.state;
}

function lastLedger(state: GameState): { category: string; amount: number } {
  const entry = state.economy.playerLedger[state.economy.playerLedger.length - 1];
  if (entry === undefined) throw new Error('장부가 비었다');
  return { category: entry.category, amount: entry.amount };
}

/** 기수 한 명과 계약한 상태(2026년 1주) */
function signedJockey(id = 'jk-test-80', week = 1): GameState {
  return okState(signRetainer(withDate(baseGame(), START_YEAR, week), 'jockey', id));
}

/** 연초 갱신 시스템을 한 주에 돈다(draft.date 는 ctx 와 맞춘다) */
function runContracts(state: GameState, year: number, week: number): { state: GameState; events: GameEvent[] } {
  const draft = structuredClone(state);
  draft.date = { year, week };
  const ctx: WeekContext = { date: { year, week }, rng: createRng(SEED) };
  const events = createContractsSystem().run(draft, ctx);
  return { state: draft, events };
}

// ── 계약금 ──

describe('retainerFee 계약금', () => {
  it('기수 skill 80·관계 0·나이 30 → 91,800 을 500 단위로 반올림해 92,000', () => {
    expect(retainerFee(baseGame(), 'jockey', 'jk-test-80')).toBe(92_000);
  });

  it('관계 60 이면 ×0.75 → 68,850 을 반올림해 69,000', () => {
    const state = baseGame();
    adjustRelation(state, relationKey('jockey', 'jk-test-80'), 60);
    expect(retainerFee(state, 'jockey', 'jk-test-80')).toBe(69_000);
  });

  it('나이 22 이면 추가 ×0.8 → 91,800 × 0.8 = 73,440 → 73,500', () => {
    const state = withBirthYear(baseGame(), 'jockey', 'jk-test-80', 2004);
    expect(retainerFee(state, 'jockey', 'jk-test-80')).toBe(73_500);
  });

  it('나이 22 + 관계 60 → 68,850 × 0.8 = 55,080 → 55,000', () => {
    const state = withBirthYear(baseGame(), 'jockey', 'jk-test-80', 2004);
    adjustRelation(state, relationKey('jockey', 'jk-test-80'), 60);
    expect(retainerFee(state, 'jockey', 'jk-test-80')).toBe(55_000);
  });

  it('조교사 skill 40·나이 50 → 8,000 + 1,600 × 6 = 17,600 → 17,500', () => {
    expect(retainerFee(baseGame(), 'trainer', 'tr-test-40')).toBe(17_500);
  });

  it('젊은 조교사(나이 35) skill 70 → 37,400 × 0.8 = 29,920 → 30,000', () => {
    expect(retainerFee(baseGame(), 'trainer', 'tr-test-young')).toBe(30_000);
  });

  it('나이 41 조교사는 젊음 배수가 없다: skill 70 → 37,400 → 37,500', () => {
    const state = withBirthYear(baseGame(), 'trainer', 'tr-test-70', 1985);
    expect(retainerFee(state, 'trainer', 'tr-test-70')).toBe(37_500);
  });

  it('계약금은 항상 500 의 배수다', () => {
    const state = baseGame();
    for (const id of JOCKEYS.map((j) => j.id)) {
      expect(retainerFee(state, 'jockey', id) % 500).toBe(0);
    }
  });
});

// ── 제의 판정 ──

describe('retainerQuote 거절 사유', () => {
  it('없는 사람 → not_found', () => {
    expect(retainerQuote(baseGame(), 'jockey', 'jk-none')).toEqual({ ok: false, reason: 'not_found' });
    expect(retainerQuote(baseGame(), 'trainer', 'tr-none')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('은퇴한 기수 → retired (위상이 모자라도 은퇴가 먼저)', () => {
    expect(retainerQuote(baseGame(), 'jockey', 'jk-test-retired')).toEqual({ ok: false, reason: 'retired' });
  });

  it('이미 이 사람과 계약 중 → already_contracted', () => {
    const state = signedJockey();
    expect(retainerQuote(state, 'jockey', 'jk-test-80')).toEqual({ ok: false, reason: 'already_contracted' });
  });

  it('같은 종류 계약이 상한(1)이면 다른 기수는 slot_full', () => {
    const state = signedJockey();
    expect(retainerQuote(state, 'jockey', 'jk-test-b')).toEqual({ ok: false, reason: 'slot_full' });
  });

  it('다른 마주가 전속한 기수 → retained_elsewhere (위상 부족보다 먼저)', () => {
    expect(retainerQuote(baseGame(), 'jockey', 'jk-test-other')).toEqual({ ok: false, reason: 'retained_elsewhere' });
  });

  it('관계가 −10 미만 → relation_too_low (위상 부족보다 먼저)', () => {
    const state = baseGame();
    adjustRelation(state, relationKey('jockey', 'jk-test-80'), -20);
    expect(retainerQuote(state, 'jockey', 'jk-test-80')).toEqual({ ok: false, reason: 'relation_too_low' });
  });

  it('명성 10·관계 0 이면 skill 45 수락, skill 46 은 standing_too_low', () => {
    const state = baseGame(STARTING_REPUTATION);
    expect(retainerQuote(state, 'jockey', 'jk-test-45')).toEqual({ ok: true, fee: expect.any(Number) });
    expect(retainerQuote(state, 'jockey', 'jk-test-46')).toEqual({ ok: false, reason: 'standing_too_low' });
  });

  it('나이 22 기수는 요구 위상이 15 낮다: skill 60 수락, skill 61 은 standing_too_low', () => {
    const state = baseGame(STARTING_REPUTATION);
    expect(retainerQuote(state, 'jockey', 'jk-test-young').ok).toBe(true);
    expect(retainerQuote(state, 'jockey', 'jk-test-61')).toEqual({ ok: false, reason: 'standing_too_low' });
  });

  it('관계 20 이면 위상 +10(명성 10 + 관계 10 + 기본 35 = 55): skill 46 수락, skill 56 은 거절', () => {
    const state = baseGame(STARTING_REPUTATION);
    adjustRelation(state, relationKey('jockey', 'jk-test-46'), 20);
    adjustRelation(state, relationKey('jockey', 'jk-test-56'), 20);
    expect(retainerQuote(state, 'jockey', 'jk-test-46').ok).toBe(true);
    expect(retainerQuote(state, 'jockey', 'jk-test-56')).toEqual({ ok: false, reason: 'standing_too_low' });
  });

  it('수락 결과의 계약금은 retainerFee 와 같다', () => {
    const state = baseGame();
    const quote = retainerQuote(state, 'trainer', 'tr-test-40');
    expect(quote).toEqual({ ok: true, fee: retainerFee(state, 'trainer', 'tr-test-40') });
  });
});

// ── 체결 ──

describe('signRetainer 체결', () => {
  it('주 1 이면 계약금 전액을 지불하고 장부에 retainer_fee 로 남긴다', () => {
    const before = baseGame();
    const result = signRetainer(before, 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;
    expect(playerOf(state).funds).toBe(playerOf(before).funds - 92_000);
    expect(lastLedger(state)).toEqual({ category: 'retainer_fee', amount: -92_000 });
    expect(contractFor(state, 'jockey', 'jk-test-80')).toEqual({
      kind: 'jockey',
      personId: 'jk-test-80',
      startYear: START_YEAR,
      endYear: START_YEAR,
      annualFee: 92_000,
    });
    expect(result.events).toEqual([
      {
        type: 'retainer_changed',
        kind: 'jockey',
        personId: 'jk-test-80',
        change: 'signed',
        fee: 92_000,
        date: { year: START_YEAR, week: 1 },
      },
    ]);
  });

  it('입력 상태는 바꾸지 않는다', () => {
    const before = baseGame();
    signRetainer(before, 'jockey', 'jk-test-80');
    expect(playerOf(before).funds).toBe(500_000);
    expect(before.relations.contracts).toEqual([]);
    expect(before.economy.playerLedger).toEqual([]);
  });

  it('주 27 이면 첫 해 지불은 절반(92,000 × 26/52 = 46,000), 연간 계약금은 전액 92,000 이다', () => {
    const state = withDate(baseGame(), START_YEAR, 27);
    const result = signRetainer(state, 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(lastLedger(result.state)).toEqual({ category: 'retainer_fee', amount: -46_000 });
    expect(playerOf(result.state).funds).toBe(500_000 - 46_000);
    expect(contractFor(result.state, 'jockey', 'jk-test-80')?.annualFee).toBe(92_000);
  });

  it('주 52 이면 1/52 만 낸다(92,000 / 52 = 1,769)', () => {
    const state = withDate(baseGame(), START_YEAR, 52);
    const result = signRetainer(state, 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(lastLedger(result.state).amount).toBe(-1_769);
  });

  it('관계 하한 50 적용: 관계 0 → 50', () => {
    const result = signRetainer(baseGame(), 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(relationOf(result.state, relationKey('jockey', 'jk-test-80'))).toBe(50);
  });

  it('관계 하한 50 적용: 관계 70 이면 70 을 유지한다', () => {
    const state = baseGame();
    adjustRelation(state, relationKey('jockey', 'jk-test-80'), 70);
    const result = signRetainer(state, 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(relationOf(result.state, relationKey('jockey', 'jk-test-80'))).toBe(70);
    expect(contractFor(result.state, 'jockey', 'jk-test-80')?.annualFee).toBe(69_000);
  });

  it('기수 계약은 기수 링크를 양쪽에 설정한다', () => {
    const result = signRetainer(baseGame(), 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(playerOf(result.state).retainedJockeyId).toBe('jk-test-80');
    expect(jockeyOf(result.state, 'jk-test-80').retainedBy).toBe(result.state.playerOwnerId);
  });

  it('조교사 계약은 기수 링크를 건드리지 않는다', () => {
    const result = signRetainer(baseGame(), 'trainer', 'tr-test-40');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(playerOf(result.state).retainedJockeyId).toBeNull();
    expect(contractFor(result.state, 'trainer', 'tr-test-40')?.annualFee).toBe(17_500);
    expect(isContractedKey(result.state, 'trainer:tr-test-40')).toBe(true);
  });

  it('두 번째 기수 계약은 slot_full', () => {
    const state = signedJockey('jk-test-80');
    expect(signRetainer(state, 'jockey', 'jk-test-b')).toEqual({ ok: false, error: 'slot_full' });
  });

  it('기수 계약이 있어도 조교사 계약은 따로 체결된다', () => {
    const state = signedJockey('jk-test-80');
    const result = signRetainer(state, 'trainer', 'tr-test-40');
    expect(result.ok).toBe(true);
  });

  it('캐주얼 빚이 있으면 insufficient_funds', () => {
    const state = baseGame();
    state.economy.debt = 5_000;
    expect(signRetainer(state, 'jockey', 'jk-test-80')).toEqual({ ok: false, error: 'insufficient_funds' });
  });

  it('첫 해 지불액이 자금보다 크면 insufficient_funds', () => {
    const state = baseGame();
    playerOf(state).funds = 10_000;
    expect(signRetainer(state, 'jockey', 'jk-test-80')).toEqual({ ok: false, error: 'insufficient_funds' });
  });

  it('제의 거절 사유는 그대로 실패로 돌려준다', () => {
    expect(signRetainer(baseGame(STARTING_REPUTATION), 'jockey', 'jk-test-46')).toEqual({
      ok: false,
      error: 'standing_too_low',
    });
    expect(signRetainer(baseGame(), 'jockey', 'jk-none')).toEqual({ ok: false, error: 'not_found' });
  });
});

// ── 해지 ──

describe('terminateRetainer 해지', () => {
  it('위약금은 연간 계약금의 25%(92,000 → 23,000), 장부에 남고 계약·링크가 사라진다', () => {
    const signed = signedJockey();
    const funds = playerOf(signed).funds;
    const result = terminateRetainer(signed, 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(playerOf(result.state).funds).toBe(funds - 23_000);
    expect(lastLedger(result.state)).toEqual({ category: 'retainer_fee', amount: -23_000 });
    expect(contractFor(result.state, 'jockey', 'jk-test-80')).toBeUndefined();
    expect(playerOf(result.state).retainedJockeyId).toBeNull();
    expect(jockeyOf(result.state, 'jk-test-80').retainedBy).toBeNull();
    expect(result.events).toEqual([
      {
        type: 'retainer_changed',
        kind: 'jockey',
        personId: 'jk-test-80',
        change: 'terminated',
        fee: 23_000,
        date: { year: START_YEAR, week: 1 },
      },
    ]);
  });

  it('관계 −40: 계약을 지운 뒤라 하한 50 이 없다 → 50 이면 10', () => {
    const signed = signedJockey();
    expect(relationOf(signed, relationKey('jockey', 'jk-test-80'))).toBe(50);
    const result = terminateRetainer(signed, 'jockey', 'jk-test-80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(relationOf(result.state, relationKey('jockey', 'jk-test-80'))).toBe(10);
  });

  it('조교사 해지도 같은 위약금·관계 규칙을 따른다', () => {
    const signed = okState(signRetainer(baseGame(), 'trainer', 'tr-test-40'));
    const result = terminateRetainer(signed, 'trainer', 'tr-test-40');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(contractFor(result.state, 'trainer', 'tr-test-40')).toBeUndefined();
    expect(relationOf(result.state, relationKey('trainer', 'tr-test-40'))).toBe(10);
    expect(lastLedger(result.state).amount).toBe(-Math.round(17_500 * 0.25));
  });

  it('계약이 없으면 not_contracted', () => {
    expect(terminateRetainer(baseGame(), 'jockey', 'jk-test-80')).toEqual({ ok: false, error: 'not_contracted' });
  });

  it('입력 상태는 바꾸지 않는다', () => {
    const signed = signedJockey();
    terminateRetainer(signed, 'jockey', 'jk-test-80');
    expect(contractFor(signed, 'jockey', 'jk-test-80')).toBeDefined();
    expect(playerOf(signed).retainedJockeyId).toBe('jk-test-80');
  });
});

// ── 연초 갱신 시스템 ──

describe('createContractsSystem 연초 갱신', () => {
  it('관계 60 → renewed: 전액 지불, endYear 갱신, 새 계약금(69,000)', () => {
    const state = signedJockey();
    setRelationValue(state, 'jockey', 'jk-test-80', 60);
    const { state: next, events } = runContracts(state, START_YEAR + 1, 1);
    const funds = playerOf(state).funds;
    expect(events).toEqual([
      {
        type: 'retainer_changed',
        kind: 'jockey',
        personId: 'jk-test-80',
        change: 'renewed',
        fee: 69_000,
        date: { year: START_YEAR + 1, week: 1 },
      },
    ]);
    expect(contractFor(next, 'jockey', 'jk-test-80')).toEqual({
      kind: 'jockey',
      personId: 'jk-test-80',
      startYear: START_YEAR,
      endYear: START_YEAR + 1,
      annualFee: 69_000,
    });
    expect(playerOf(next).funds).toBe(funds - 69_000);
    expect(lastLedger(next)).toEqual({ category: 'retainer_fee', amount: -69_000 });
  });

  it('관계 54 → declined: 계약 삭제, 링크 해제, 지불 없음', () => {
    const state = signedJockey();
    setRelationValue(state, 'jockey', 'jk-test-80', 54);
    const funds = playerOf(state).funds;
    const { state: next, events } = runContracts(state, START_YEAR + 1, 1);
    expect(events).toEqual([
      {
        type: 'retainer_changed',
        kind: 'jockey',
        personId: 'jk-test-80',
        change: 'declined',
        fee: 0,
        date: { year: START_YEAR + 1, week: 1 },
      },
    ]);
    expect(next.relations.contracts).toEqual([]);
    expect(playerOf(next).retainedJockeyId).toBeNull();
    expect(jockeyOf(next, 'jk-test-80').retainedBy).toBeNull();
    expect(playerOf(next).funds).toBe(funds);
  });

  it('자금 부족 → lapsed: 계약 삭제, 지불 없음', () => {
    const state = signedJockey();
    setRelationValue(state, 'jockey', 'jk-test-80', 60);
    playerOf(state).funds = 1_000;
    const { state: next, events } = runContracts(state, START_YEAR + 1, 1);
    expect(events).toEqual([
      expect.objectContaining({ type: 'retainer_changed', change: 'lapsed', fee: 0 }),
    ]);
    expect(next.relations.contracts).toEqual([]);
    expect(playerOf(next).funds).toBe(1_000);
  });

  it('은퇴한 기수 → lapsed', () => {
    const state = signedJockey();
    setRelationValue(state, 'jockey', 'jk-test-80', 60);
    jockeyOf(state, 'jk-test-80').retired = true;
    const { state: next, events } = runContracts(state, START_YEAR + 1, 1);
    expect(events).toEqual([
      expect.objectContaining({ type: 'retainer_changed', change: 'lapsed', fee: 0, personId: 'jk-test-80' }),
    ]);
    expect(next.relations.contracts).toEqual([]);
    expect(playerOf(next).retainedJockeyId).toBeNull();
  });

  it('주 2·26·52 에는 아무 일도 없다(계약 그대로, 이벤트 없음)', () => {
    const state = signedJockey();
    setRelationValue(state, 'jockey', 'jk-test-80', 60);
    for (const week of [2, 26, 52]) {
      const { state: next, events } = runContracts(state, START_YEAR + 1, week);
      expect(events).toEqual([]);
      expect(next.relations.contracts).toEqual(state.relations.contracts);
      expect(playerOf(next).funds).toBe(playerOf(state).funds);
    }
  });

  it('같은 해에 두 번 돌려도 두 번 갱신하지 않는다', () => {
    const state = signedJockey();
    setRelationValue(state, 'jockey', 'jk-test-80', 60);
    const first = runContracts(state, START_YEAR + 1, 1);
    const second = runContracts(first.state, START_YEAR + 1, 1);
    expect(second.events).toEqual([]);
    expect(second.state.relations.contracts).toEqual(first.state.relations.contracts);
    expect(playerOf(second.state).funds).toBe(playerOf(first.state).funds);
  });

  it('endYear 가 올해 이상인 계약은 건드리지 않는다', () => {
    const state = signedJockey();
    const { events } = runContracts(state, START_YEAR, 1);
    expect(events).toEqual([]);
  });

  it('처리 순서는 kind, personId 오름차순이다(조교사 계약이 먼저 판정된다)', () => {
    const state = signedJockey('jk-test-80');
    const trainerSigned = okState(signRetainer(state, 'trainer', 'tr-test-40'));
    setRelationValue(trainerSigned, 'trainer', 'tr-test-40', 70);
    setRelationValue(trainerSigned, 'jockey', 'jk-test-80', 60);
    const { events } = runContracts(trainerSigned, START_YEAR + 1, 1);
    expect(events.map((e) => (e.type === 'retainer_changed' ? e.kind : ''))).toEqual(['jockey', 'trainer']);
  });

  it('계약 목록은 체결 뒤 kind·personId 순으로 정렬된다', () => {
    const state = okState(signRetainer(baseGame(), 'trainer', 'tr-test-40'));
    const next = okState(signRetainer(withDate(state, START_YEAR, 1), 'jockey', 'jk-test-80'));
    const order: RetainerContract[] = next.relations.contracts;
    expect(order.map((c) => `${c.kind}:${c.personId}`)).toEqual(['jockey:jk-test-80', 'trainer:tr-test-40']);
  });
});

// ── 저장 왕복·결정성 (시즌 두 번 진행) ──

describe('저장 왕복과 결정성', () => {
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
  const STATIC_GAME: GameStaticData = {
    nicks: getNicks(),
    naming: getNamingData(),
    stallionNames: getStallionNames(),
    stallionRecords: getStallionRecords(),
    courses: getRacecourses(),
    templates: getRaceTemplates(),
    series: getSeriesDefinitions(),
  };

  let BASE: GameState;

  beforeAll(() => {
    BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  }, MID_TIMEOUT);

  /** 조교사 계약 1개를 넣고 시즌 두 번(104주)을 진행한다. 계약 상대는 정렬상 첫 조교사 */
  function runTwoSeasons(): { state: GameState; trainerId: string } {
    const state = structuredClone(BASE);
    state.relations.reputation = REPUTATION_MAX;
    const trainerId = Object.keys(state.trainers).sort()[0];
    if (trainerId === undefined) throw new Error('테스트 전제 위반: 조교사가 없다');
    adjustRelation(state, relationKey('trainer', trainerId), 100);
    const signed = okState(signRetainer(state, 'trainer', trainerId));

    const systems = createGameSystems(STATIC_GAME);
    let current = signed;
    for (let i = 0; i < 2 * WEEKS_PER_YEAR; i++) {
      current = advanceWeek(current, systems).state;
    }
    return { state: current, trainerId };
  }

  it('계약 1개를 넣고 시즌 두 번 진행 → 저장 왕복 후 contracts 가 같다', () => {
    const { state, trainerId } = runTwoSeasons();
    expect(state.relations.contracts).toHaveLength(1);
    expect(state.relations.contracts[0]).toMatchObject({ kind: 'trainer', personId: trainerId, endYear: START_YEAR + 1 });

    const loaded = deserializeGame(serializeGame(state, SAVED_AT));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.relations.contracts).toEqual(state.relations.contracts);
  }, HEAVY_TIMEOUT);

  it('같은 시드로 두 번 진행하면 저장 결과가 같다', () => {
    const first = runTwoSeasons();
    const second = runTwoSeasons();
    expect(serializeGame(second.state, SAVED_AT)).toBe(serializeGame(first.state, SAVED_AT));
  }, HEAVY_TIMEOUT);
});
