import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { loadRacecourses } from '../../src/engine/course/load';
import { RETAINER_EXTRA_BOXES, RETAINER_RELATION_FLOOR } from '../../src/engine/config/economy';
import { isContractedKey } from '../../src/engine/economy/contractQuery';
import { adjustRelation, createRelationsSystem, relationKey, relationOf } from '../../src/engine/economy/relations';
import { createRng } from '../../src/engine/rng';
import type { CourseCountryLookup } from '../../src/engine/season/eligibility';
import { buildRaceField } from '../../src/engine/season/field';
import { assignTrainer } from '../../src/engine/season/player';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { bootstrapRacingPopulation, type RacingPopulationStaticData } from '../../src/engine/world/population';
import { advanceWeek } from '../../src/engine/time/advance';
import { weekOfSlot } from '../../src/engine/season/schedule';
import type {
  Declaration,
  GameDate,
  GameState,
  Horse,
  HorseId,
  Race,
  Racecourse,
  ScheduledRace,
  TrainerId,
} from '../../src/engine/types';

const SEED = 20261012;
const YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const JUNE_FIRST_WEEK = weekOfSlot({ month: 6, weekOfMonth: 1 });
const JUNE_DATE: GameDate = { year: YEAR, week: JUNE_FIRST_WEEK };
const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const lookupCountry: CourseCountryLookup = (id) => COURSES.find((c) => c.id === id)?.country;
/** 조건전 1,200m 레이스(가상 이름). 6월 1주 일정 */
const RACE_ID = 'test-retainer-conditions';
/** 시드 개수(수용 기준 4) */
const SEED_COUNT = 20;

function populationData(): RacingPopulationStaticData {
  return { stallionRecords: getStallionRecords(), naming: getNamingData(), stallionNames: getStallionNames() };
}

function worldData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
  };
}

/** 인물 → 세계 → 현역마 순서로 만든 새 게임 상태(테스트 전용 기준 상태) */
function boot(seed = SEED): GameState {
  const base = createNewGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } });
  const withPeople = bootstrapPeople(base, getPeopleData(), createRng(seed));
  const withWorld = bootstrapWorld(withPeople, worldData(), createRng(seed + 1));
  return bootstrapRacingPopulation(withWorld, populationData(), createRng(seed + 2));
}

/** 가상 조건전 레이스(1,200m, 애슈콤) */
function conditionsRace(): Race {
  return {
    id: RACE_ID,
    name: 'Test Retainer Conditions',
    racecourseId: 'ashcombe',
    distance: 1200,
    kind: 'conditions',
    grade: null,
    raceClass: 5,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
      baseWeightLb: 126,
    },
    prizeMoney: [9000],
    maxRunners: 14,
  };
}

/** AI 말 중 3세 이상 수컷을 id 오름차순으로 n 두 */
function aiMaleHorses(state: GameState, n: number): Horse[] {
  const found = Object.keys(state.horses)
    .sort()
    .map((id) => state.horses[id])
    .filter(
      (h): h is Horse =>
        h !== undefined && h.ownerId !== null && h.ownerId !== state.playerOwnerId && h.sex === 'male' && h.birthYear <= YEAR - 3,
    );
  if (found.length < n) throw new Error(`AI 수컷 말이 ${n}두 없음`);
  return found.slice(0, n);
}

function declFor(h: Horse): Declaration {
  return {
    horseId: h.id,
    ownerId: h.ownerId ?? '',
    trainerId: h.trainerId,
    jockeyId: null,
    weightLb: null,
    isPlayer: false,
  };
}

/**
 * 레이스 한 판 준비: AI 5두(앞 순서) + 플레이어 말 1두(마지막 선언).
 * 다른 마주의 전속 기수는 모두 지운다(검증 대상 밖의 예약 영향 제거).
 * withRetainer 면 플레이어 마주의 전속 기수를 GB 기수로 둔다(최저 기승 체중 112lb).
 */
function setupRace(base: GameState, withRetainer: boolean): { state: GameState; sr: ScheduledRace; retainedId: string } {
  const state = structuredClone(base);
  for (const owner of Object.values(state.owners)) owner.retainedJockeyId = null;
  const gbJockey = Object.keys(state.jockeys)
    .sort()
    .map((id) => state.jockeys[id])
    .find((j) => j !== undefined && j.country === 'GB' && !j.retired);
  if (gbJockey === undefined) throw new Error('GB 기수 없음');
  gbJockey.minRidingWeightLb = 112;
  gbJockey.retainedBy = withRetainer ? state.playerOwnerId : null;

  const picked = aiMaleHorses(state, 6);
  const aiFive = picked.slice(0, 5);
  const playerHorse = picked[5];
  if (playerHorse === undefined) throw new Error('플레이어 말 없음');
  const playerRecord = state.horses[playerHorse.id];
  if (playerRecord === undefined) throw new Error('플레이어 말 기록 없음');
  playerRecord.ownerId = state.playerOwnerId;

  const declarations: Declaration[] = [
    ...aiFive.map(declFor),
    { ...declFor(playerRecord), ownerId: state.playerOwnerId, isPlayer: true },
  ];
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) throw new Error('플레이어 마주 없음');
  owner.retainedJockeyId = withRetainer ? gbJockey.id : null;

  const sr: ScheduledRace = {
    race: conditionsRace(),
    templateId: null,
    status: 'closed',
    declarations,
    simulated: false,
  };
  return { state, sr, retainedId: gbJockey.id };
}

/** 관계 키에 계약을 하나 넣는다(체결 로직 없이 상태만) */
function withContract(state: GameState, kind: 'trainer' | 'jockey', personId: string): GameState {
  state.relations.contracts.push({ kind, personId, startYear: YEAR, endYear: YEAR + 1, annualFee: 10_000 });
  return state;
}

/** 관계값이 비어 있고 말이 없는 상태(주간 시스템의 위탁 효과를 배제) */
function relationOnly(base: GameState): GameState {
  const state = structuredClone(base);
  state.relations.values = {};
  state.horses = {};
  return state;
}

const TRAINER_KEY_ID = 'tr-retainer-test' as TrainerId;
const JOCKEY_KEY_ID = 'jk-retainer-test';

describe('전속 계약의 효과 (M4-B3a)', () => {
  let base: GameState;

  beforeAll(() => {
    base = boot();
  });

  // ── 규칙 1: 관계 상승 가속·하한 ──────────────────────────────

  it('1. 계약 중 조교사 키 +10 → +15, 계약 중 기수 키도 같다. 계약 없는 키 +10 → +10. 음수 delta 는 배수 없음', () => {
    const trainerKey = relationKey('trainer', TRAINER_KEY_ID);
    const jockeyKey = relationKey('jockey', JOCKEY_KEY_ID);
    const otherKey = relationKey('trainer', 'tr-no-contract' as TrainerId);

    // 계약 중 키는 체결 때 하한(50) 이상이므로 시작값을 60 으로 둔다(0 에서 시작하면 하한 50 이 먼저 적용된다)
    const contracted = withContract(relationOnly(base), 'trainer', TRAINER_KEY_ID);
    contracted.relations.values[trainerKey] = 60;
    expect(isContractedKey(contracted, trainerKey)).toBe(true);
    expect(adjustRelation(contracted, trainerKey, 10)).toBe(75);
    expect(relationOf(contracted, trainerKey)).toBe(75);

    const jockeyContracted = withContract(relationOnly(base), 'jockey', JOCKEY_KEY_ID);
    jockeyContracted.relations.values[jockeyKey] = 60;
    expect(adjustRelation(jockeyContracted, jockeyKey, 10)).toBe(75);

    const plain = relationOnly(base);
    expect(isContractedKey(plain, otherKey)).toBe(false);
    expect(adjustRelation(plain, otherKey, 10)).toBe(10);
    const plainHigh = relationOnly(base);
    plainHigh.relations.values[otherKey] = 60;
    expect(adjustRelation(plainHigh, otherKey, 10)).toBe(70);

    // 음수 delta: 계약 중이어도 배수 없음(80 − 10 = 70; 배수가 있었다면 65)
    const high = withContract(relationOnly(base), 'trainer', TRAINER_KEY_ID);
    high.relations.values[trainerKey] = 80;
    expect(adjustRelation(high, trainerKey, -10)).toBe(70);
  });

  it('2. 계약 중 키 관계 52 에 −30 → 50(하한). 계약 없으면 22', () => {
    expect(RETAINER_RELATION_FLOOR).toBe(50);
    const trainerKey = relationKey('trainer', TRAINER_KEY_ID);
    const contracted = withContract(relationOnly(base), 'trainer', TRAINER_KEY_ID);
    contracted.relations.values[trainerKey] = 52;
    expect(adjustRelation(contracted, trainerKey, -30)).toBe(50);
    expect(relationOf(contracted, trainerKey)).toBe(50);

    const plain = relationOnly(base);
    plain.relations.values[trainerKey] = 52;
    expect(adjustRelation(plain, trainerKey, -30)).toBe(22);
  });

  // ── 규칙 2: 감소 면제 + 하한 보정 ────────────────────────────

  it('3. 계약 중 키는 주간 감소 뒤에도 값이 그대로(하한 아래면 50), 계약 없는 키는 0.15 감소', () => {
    const contractedKey = relationKey('trainer', TRAINER_KEY_ID);
    const jockeyPlainKey = relationKey('jockey', 'jk-plain' as string);

    const state = withContract(relationOnly(base), 'trainer', TRAINER_KEY_ID);
    state.relations.values[contractedKey] = 60;
    state.relations.values[jockeyPlainKey] = 60;
    const next = advanceWeek(state, [createRelationsSystem()]).state;
    expect(relationOf(next, contractedKey)).toBe(60);
    expect(relationOf(next, jockeyPlainKey)).toBe(59.85);

    // 이론상 하한 아래로 내려간 계약 키는 감소 단계에서 하한까지 올라간다
    const low = withContract(relationOnly(base), 'trainer', TRAINER_KEY_ID);
    low.relations.values[contractedKey] = 30;
    const lifted = advanceWeek(low, [createRelationsSystem()]).state;
    expect(relationOf(lifted, contractedKey)).toBe(50);

    // 계약 키가 값 없음(0)이어도 감소 단계에서 하한까지 올린다
    const empty = withContract(relationOnly(base), 'trainer', TRAINER_KEY_ID);
    const filled = advanceWeek(empty, [createRelationsSystem()]).state;
    expect(relationOf(filled, contractedKey)).toBe(50);
  });

  // ── 규칙 3: 기수 기승 우선 ───────────────────────────────────

  it('4. 플레이어 마주 전속 기수는 AI 말이 앞 순서로 선언돼도 시드 20개 모두 플레이어 말에 탄다', () => {
    const misses: number[] = [];
    const setup = setupRace(base, true);
    for (let k = 0; k < SEED_COUNT; k++) {
      const built = buildRaceField(setup.state, setup.sr, JUNE_DATE, createRng(SEED + k), lookupCountry);
      const playerReq = built.field.requests.find((r) => r.isPlayer);
      if (playerReq === undefined || playerReq.jockeyId !== setup.retainedId) misses.push(k);
    }
    expect(misses).toEqual([]);
  });

  it('5. 전속 기수가 없을 때 buildRaceField 기수 id 목록이 변경 전과 같다(고정값)', () => {
    const setup = setupRace(base, false);
    const picks: string[][] = [];
    for (let k = 0; k < 3; k++) {
      const built = buildRaceField(setup.state, setup.sr, JUNE_DATE, createRng(SEED + k), lookupCountry);
      picks.push(built.field.requests.map((r) => r.jockeyId));
    }
    // 변경 전(M4-B3a 이전 field.ts) 실제 출력값 고정
    expect(picks).toEqual([
      ['jk-000031', 'jk-000023', 'jk-000024', 'jk-000015', 'jk-000027', 'jk-000029'],
      ['jk-000023', 'jk-000015', 'jk-000027', 'jk-000024', 'jk-000001', 'jk-000038'],
      ['jk-000015', 'jk-000008', 'jk-000001', 'jk-000024', 'jk-000038', 'jk-000029'],
    ]);
  });

  // ── 규칙 4: 조교사 위탁 우선 ─────────────────────────────────

  it('6. 계약 조교사는 capacity 를 넘어 +6두까지 배정되고 7두째는 trainer_full, 계약 없는 조교사는 capacity 에서 막힌다', () => {
    expect(RETAINER_EXTRA_BOXES).toBe(6);
    const capacity = 2;
    const horseIds = aiMaleHorses(base, 9).map((h) => h.id);

    const prepare = (contracted: boolean, trainerId: TrainerId): GameState => {
      let state = structuredClone(base);
      const trainer = state.trainers[trainerId];
      if (trainer === undefined) throw new Error(`조교사 ${trainerId} 없음`);
      trainer.capacity = capacity;
      for (const h of Object.values(state.horses)) {
        if (h.trainerId === trainerId) h.trainerId = null;
      }
      horseIds.forEach((id) => {
        const h = state.horses[id];
        if (h === undefined) throw new Error(`말 ${id} 없음`);
        h.ownerId = state.playerOwnerId;
        h.trainerId = null;
        h.status = 'resting';
      });
      if (contracted) state = withContract(state, 'trainer', trainerId);
      return state;
    };

    const trainerId = Object.keys(base.trainers).sort()[0] as TrainerId;
    const results = (contracted: boolean): (string | 'ok')[] => {
      let state = prepare(contracted, trainerId);
      return horseIds.map((horseId: HorseId) => {
        const r = assignTrainer(state, horseId, trainerId);
        if (!r.ok) return r.error;
        state = r.state;
        return 'ok';
      });
    };

    const contractedResults = results(true);
    expect(contractedResults.slice(0, capacity + RETAINER_EXTRA_BOXES)).toEqual(
      Array.from({ length: capacity + RETAINER_EXTRA_BOXES }, () => 'ok'),
    );
    expect(contractedResults[capacity + RETAINER_EXTRA_BOXES]).toBe('trainer_full');

    const plainResults = results(false);
    expect(plainResults.slice(0, capacity)).toEqual(['ok', 'ok']);
    expect(plainResults[capacity]).toBe('trainer_full');
  });
});
