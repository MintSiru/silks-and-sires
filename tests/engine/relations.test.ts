import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { loadRacecourses } from '../../src/engine/course/load';
import {
  adjustRelation,
  adjustReputation,
  applyTenure,
  createRelationsSystem,
  decayRelations,
  regressReputation,
  relationKey,
  relationOf,
  relationTier,
  reputationFromLeadingOwners,
} from '../../src/engine/economy/relations';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import type { SampleField } from '../../src/engine/race/sampleField';
import { applyRaceResult } from '../../src/engine/season/apply';
import { assignTrainer } from '../../src/engine/season/player';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { allocateHorseId } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type {
  CountryCode,
  Declaration,
  GameDate,
  GameState,
  Going,
  Horse,
  HorseId,
  HorseStatus,
  LeadingEntry,
  Meeting,
  Race,
  RaceGrade,
  RaceResult,
  RaceTemplate,
  RelationKey,
  Racecourse,
  RunnerResult,
  ScheduledRace,
  SeriesDefinition,
  TrainerId,
} from '../../src/engine/types';

const SEED = 20261012;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SILKS_REQUEST = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };
const JOCKEY_ID = 'jk-relations-test';
const DATE: GameDate = { year: START_YEAR, week: 20 };
/** 무거운 진행 테스트용 제한 시간(ms) */
const HEAVY_TIMEOUT = 300_000;
const MID_TIMEOUT = 120_000;
const PLAYER_RACER_OR = 70;
const SEASON_WEEKS = 53;
const G1_ID = 'test-rel-g1';
const CROWN_ID = 'test-rel-crown';
const CROWN_BONUS = 80_000;

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);

function courseOf(id: string): Racecourse {
  const c = COURSES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`fixture 에 ${id} 없음`);
  return c;
}

function layoutOf(course: Racecourse, distance: number): string {
  const cd = course.distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`${course.id} 에 ${distance}m 없음`);
  return cd.layoutId;
}

/** 테스트용 G1 템플릿(가상 이름). classic 태그는 템플릿 목록이 아니라 classicTemplateIds 인자로 넘긴다 */
function g1Template(id: string): RaceTemplate {
  const course = courseOf('ashcombe');
  return {
    id,
    name: 'Test Relation Stakes',
    racecourseId: course.id,
    distance: 2012,
    layoutId: layoutOf(course, 2012),
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
      baseWeightLb: 126,
    },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
    schedule: { month: 4, weekOfMonth: 2 },
    cardOrder: 1,
    tags: ['classic'],
  };
}

const TEMPLATES: RaceTemplate[] = [g1Template(G1_ID)];

/** 크라운 시리즈: G1 한 레이스 우승으로 달성(시리즈 명성·보너스 테스트용) */
const CROWN_SERIES: SeriesDefinition[] = [
  { id: CROWN_ID, nameKey: 'test.crown', kind: 'crown', legs: [G1_ID], winsRequired: 1, bonus: CROWN_BONUS },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: [],
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: [],
};

const meetingStub: Meeting = {
  id: 'synthetic:relations',
  date: DATE,
  racecourseId: 'saint_ourens',
  going: 'good',
  races: [],
};

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, MID_TIMEOUT);

/** 날짜·상태를 복사한 뒤 n 주 진행(시스템 전체) */
function step(state: GameState, weeks: number): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  for (let i = 0; i < weeks; i++) {
    current = advanceWeek(current, systems).state;
  }
  return current;
}

/** 현역 AI 말 id(정렬 순서) */
function aiRacingHorseIds(state: GameState): HorseId[] {
  return Object.keys(state.horses)
    .sort()
    .filter((id) => {
      const h = state.horses[id];
      return h !== undefined && h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId;
    });
}

/** 3세 이상 AI 현역마를 복제해 플레이어 소유의 새 말을 만든다(기록 0) */
function makePlayerRacer(base: GameState): { state: GameState; horseId: HorseId } {
  const state = structuredClone(base);
  const templateId = aiRacingHorseIds(state).find((id) => {
    const h = state.horses[id];
    return h !== undefined && ageInYear(h.birthYear, START_YEAR) >= 3 && h.officialRating !== null;
  });
  const template = templateId === undefined ? undefined : state.horses[templateId];
  if (template === undefined) throw new Error('테스트 전제 위반: 3세 이상 AI 현역마가 없다');

  const id = allocateHorseId(state);
  const horse: Horse = {
    ...structuredClone(template),
    id,
    name: 'Test Racer',
    officialRating: PLAYER_RACER_OR,
    ownerId: state.playerOwnerId,
    breederId: state.playerOwnerId,
    trainerId: null,
    status: 'in_training',
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 },
    condition: { fitness: 80, fatigue: 0, mental: 70, injury: null },
  };
  state.horses[id] = horse;
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) throw new Error('테스트 전제 위반: 플레이어 마주가 없다');
  owner.horseIds.push(id);
  return { state, horseId: id };
}

function trainerWithRoom(state: GameState): TrainerId {
  const load = new Map<TrainerId, number>();
  for (const h of Object.values(state.horses)) {
    if (h.trainerId !== null) load.set(h.trainerId, (load.get(h.trainerId) ?? 0) + 1);
  }
  const id = Object.keys(state.trainers)
    .sort()
    .find((t) => (load.get(t) ?? 0) < (state.trainers[t]?.capacity ?? 0));
  if (id === undefined) throw new Error('테스트 전제 위반: 여유 있는 조교사가 없다');
  return id;
}

/** 조교사를 배정한 플레이어 테스트 말 */
function racerWithTrainer(): { state: GameState; horseId: HorseId } {
  const racer = makePlayerRacer(BASE);
  const assigned = assignTrainer(racer.state, racer.horseId, trainerWithRoom(racer.state));
  if (!assigned.ok) throw new Error('테스트 전제 위반: 조교사 배정 실패');
  return { state: assigned.state, horseId: racer.horseId };
}

/** 등급을 준 합성 레이스(가상 이름) */
function syntheticRace(id: string, grade: RaceGrade | null): Race {
  const course = courseOf('saint_ourens');
  return {
    id,
    name: 'Synthetic Relations Stakes',
    racecourseId: course.id,
    distance: 2000,
    layoutId: layoutOf(course, 2000),
    kind: grade === null ? 'handicap' : 'group',
    grade,
    raceClass: grade === null ? 4 : 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'level',
      baseWeightLb: 126,
    },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
  };
}

interface RunOpts {
  grade: RaceGrade | null;
  templateId: string | null;
  series?: SeriesDefinition[];
  classicTemplateIds?: string[];
}

/** horseIds 를 1착부터 순서대로 세워 결과를 반영한다(applyRaceResult 직접 호출). 플레이어 말은 isPlayer 로 판정 */
function runSynthetic(state: GameState, horseIds: HorseId[], opts: RunOpts): GameState {
  const race = syntheticRace('test-rel-race', opts.grade);
  const declarations: Declaration[] = horseIds.map((horseId) => {
    const h = state.horses[horseId];
    if (h === undefined || h.ownerId === null) throw new Error(`테스트 전제 위반: 말 ${horseId} 의 마주가 없다`);
    return {
      horseId,
      ownerId: h.ownerId,
      trainerId: h.trainerId,
      jockeyId: JOCKEY_ID,
      weightLb: 126,
      isPlayer: h.ownerId === state.playerOwnerId,
    };
  });
  const scheduled: ScheduledRace = {
    race,
    templateId: opts.templateId,
    status: 'run',
    declarations,
    simulated: true,
  };
  const runners: RunnerResult[] = horseIds.map((horseId, i) => ({
    runnerIndex: i,
    horseId,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: JOCKEY_ID,
    weightLb: 126,
    position: i + 1,
    finishTime: 200 + i,
    margin: i === 0 ? null : { label: 'lengths', lengths: 1 },
    beatenLengths: i,
    sectionals: [200 + i],
    performanceFigure: 0,
    odds: null,
  }));
  const result: RaceResult = {
    raceId: race.id,
    racecourseId: race.racecourseId,
    date: DATE,
    going: 'good' as Going,
    distance: race.distance,
    seed: 4242,
    winningTime: 200,
    sectionalMarks: [],
    runners,
  };
  const field: SampleField = {
    runners: [],
    requests: declarations.map((d) => ({
      horseId: d.horseId,
      jockeyId: JOCKEY_ID,
      tactic: 'midfield' as const,
      silks: { ...SILKS_REQUEST },
      isPlayer: d.isPlayer,
      weightLb: 126,
      jockeyAllowanceLb: 0,
    })),
    ownerNames: declarations.map(() => 'synthetic owner'),
  };
  return applyRaceResult(state, {
    meeting: meetingStub,
    scheduled,
    result,
    field,
    series: opts.series ?? [],
    country: 'GB' as CountryCode,
    nicks: [],
    classicTemplateIds: opts.classicTemplateIds,
  }).state;
}

/** 플레이어 말 + AI 말 한 두로 레이스를 치러 플레이어 말의 조교사·기수 관계를 본다 */
function playerRunAt(position: 1 | 2 | 3 | 4, opts: RunOpts): { state: GameState; trainerKey: RelationKey; jockeyKey: RelationKey } {
  const racer = racerWithTrainer();
  const aiIds = aiRacingHorseIds(racer.state);
  const ai = [aiIds[0], aiIds[1], aiIds[2]];
  if (ai.some((id) => id === undefined)) throw new Error('테스트 전제 위반: AI 현역마 부족');
  const aiList = ai as HorseId[];
  const order: HorseId[] = [];
  for (let p = 1; p <= 4; p++) {
    if (p === position) order.push(racer.horseId);
    else if (aiList.length > 0) order.push(aiList.shift() as HorseId);
  }
  const racerHorse = racer.state.horses[racer.horseId];
  const trainerId = racerHorse?.trainerId;
  if (trainerId === null || trainerId === undefined) throw new Error('테스트 전제 위반: 조교사 없음');
  const state = runSynthetic(racer.state, order, opts);
  return { state, trainerKey: relationKey('trainer', trainerId), jockeyKey: relationKey('jockey', JOCKEY_ID) };
}

// ── 값 범위·키 ───────────────────────────────────────────────

describe('관계값·명성 범위와 키', () => {
  it('1. 관계값은 −100 ~ 100 으로 자르고, 소수 둘째 자리로 반올림해 저장한다', () => {
    const s = structuredClone(BASE);
    const key = relationKey('trainer', 'tr-clamp');
    adjustRelation(s, key, 150);
    expect(relationOf(s, key)).toBe(100);
    adjustRelation(s, key, -300);
    expect(relationOf(s, key)).toBe(-100);
    adjustRelation(s, key, 100.123);
    expect(relationOf(s, key)).toBe(0.12);
  });

  it('2. 없는 키의 관계값은 0 이고, 0 이 되면 키를 지운다', () => {
    const s = structuredClone(BASE);
    const key = relationKey('jockey', 'jk-none');
    expect(relationOf(s, key)).toBe(0);
    adjustRelation(s, key, 5);
    expect(s.relations.values[key]).toBe(5);
    adjustRelation(s, key, -5);
    expect(s.relations.values[key]).toBeUndefined();
    expect(Object.keys(s.relations.values)).not.toContain(key);
  });

  it('3. 명성은 0 ~ 100 으로 자른다', () => {
    const s = structuredClone(BASE);
    s.relations.reputation = 98;
    expect(adjustReputation(s, 10)).toBe(100);
    expect(adjustReputation(s, -500)).toBe(0);
  });

  it('4. relationKey 는 `${kind}:${id}` 형식이다', () => {
    expect(relationKey('owner', 'ow-000012')).toBe('owner:ow-000012');
    expect(relationKey('trainer', 'tr-1')).toBe('trainer:tr-1');
    expect(relationKey('jockey', 'jk-1')).toBe('jockey:jk-1');
  });

  it('5. relationTier 경계: 냉랭 ≤ −40, 서먹 < −10, 보통 ≤ 10, 우호 ≤ 40, 친밀 ≤ 70, 신뢰 > 70', () => {
    expect(relationTier(-40)).toBe('cold');
    expect(relationTier(-40.01)).toBe('cold');
    expect(relationTier(-39.99)).toBe('cool');
    expect(relationTier(-10)).toBe('neutral');
    expect(relationTier(10)).toBe('neutral');
    expect(relationTier(10.01)).toBe('warm');
    expect(relationTier(40)).toBe('warm');
    expect(relationTier(70)).toBe('close');
    expect(relationTier(70.01)).toBe('trusted');
    expect(relationTier(100)).toBe('trusted');
  });
});

// ── 시간 감소 ────────────────────────────────────────────────

describe('시간 감소', () => {
  it('6. 0.1 은 한 주에 0 을 넘지 않고 0 이 되어 키가 지워진다(양수·음수 모두)', () => {
    const s = structuredClone(BASE);
    const pos = relationKey('trainer', 'tr-a');
    const neg = relationKey('trainer', 'tr-b');
    adjustRelation(s, pos, 0.1);
    adjustRelation(s, neg, -0.1);
    decayRelations(s);
    expect(s.relations.values[pos]).toBeUndefined();
    expect(s.relations.values[neg]).toBeUndefined();
  });

  it('7. 1 은 한 주에 0.85, −1 은 −0.85 로 0 쪽으로 움직인다', () => {
    const s = structuredClone(BASE);
    const pos = relationKey('trainer', 'tr-a');
    const neg = relationKey('trainer', 'tr-b');
    adjustRelation(s, pos, 1);
    adjustRelation(s, neg, -1);
    decayRelations(s);
    expect(relationOf(s, pos)).toBe(0.85);
    expect(relationOf(s, neg)).toBe(-0.85);
  });

  it('8. 감소는 값을 0 너머로 넘기지 않는다(0.16 → 0.01, 0.15 → 키 삭제)', () => {
    const s = structuredClone(BASE);
    const a = relationKey('trainer', 'tr-a');
    const b = relationKey('trainer', 'tr-b');
    adjustRelation(s, a, 0.16);
    adjustRelation(s, b, 0.15);
    decayRelations(s);
    expect(relationOf(s, a)).toBe(0.01);
    expect(s.relations.values[b]).toBeUndefined();
  });

  it('9. 매주 감소를 반복하면 값은 0 에서 멈추고 키는 남지 않는다', () => {
    const s = structuredClone(BASE);
    const key = relationKey('jockey', 'jk-x');
    adjustRelation(s, key, 30);
    adjustRelation(s, relationKey('jockey', 'jk-y'), -30);
    const next = advanceWeek(s, [createRelationsSystem()]).state;
    expect(relationOf(next, key)).toBe(29.85);
    for (let i = 0; i < 300; i++) decayRelations(next);
    expect(Object.keys(next.relations.values)).toEqual([]);
  });
});

// ── 위탁 지속 ────────────────────────────────────────────────

describe('위탁 지속', () => {
  it('10. 현역마(in_training)를 맡은 조교사는 조교사마다 한 번만 +0.1 을 받는다(같은 조교사의 말이 둘이어도)', () => {
    const racer = racerWithTrainer();
    const state = structuredClone(racer.state);
    const source = state.horses[racer.horseId];
    if (source === undefined || source.trainerId === null) throw new Error('테스트 전제 위반');
    const twinId = allocateHorseId(state);
    state.horses[twinId] = { ...structuredClone(source), id: twinId, name: 'Test Twin' };
    applyTenure(state);
    expect(relationOf(state, relationKey('trainer', source.trainerId))).toBe(0.1);
  });

  it('11. 휴양(resting)도 위탁이지만 번식마(broodmare) 등 현역이 아니면 위탁이 아니다', () => {
    const racer = racerWithTrainer();
    const state = structuredClone(racer.state);
    const horse = state.horses[racer.horseId];
    if (horse === undefined || horse.trainerId === null) throw new Error('테스트 전제 위반');
    const key = relationKey('trainer', horse.trainerId);

    horse.status = 'resting';
    applyTenure(state);
    expect(relationOf(state, key)).toBe(0.1);

    horse.status = 'broodmare' as HorseStatus;
    const other = structuredClone(state);
    other.relations.values = {};
    applyTenure(other);
    expect(relationOf(other, key)).toBe(0);
  });

  it('12. 위탁으로 쌓는 관계는 40 에서 멈춘다. 이미 40 을 넘은 값(레이스로 얻은 값)은 위탁이 줄이지 않는다', () => {
    const racer = racerWithTrainer();
    const state = structuredClone(racer.state);
    const horse = state.horses[racer.horseId];
    if (horse === undefined || horse.trainerId === null) throw new Error('테스트 전제 위반');
    const key = relationKey('trainer', horse.trainerId);

    adjustRelation(state, key, 39.95);
    applyTenure(state);
    expect(relationOf(state, key)).toBe(40);
    applyTenure(state);
    expect(relationOf(state, key)).toBe(40);

    adjustRelation(state, key, 20);
    applyTenure(state);
    expect(relationOf(state, key)).toBe(60);
  });

  it('13. 위탁 중인 조교사는 그 주 감소를 면제받아 위탁(+0.1)만 붙는다(20 → 20.1, Opus 결정)', () => {
    const racer = racerWithTrainer();
    const state = structuredClone(racer.state);
    const horse = state.horses[racer.horseId];
    if (horse === undefined || horse.trainerId === null) throw new Error('테스트 전제 위반');
    const key = relationKey('trainer', horse.trainerId);
    adjustRelation(state, key, 20);
    const next = advanceWeek(state, [createRelationsSystem()]).state;
    expect(relationOf(next, key)).toBe(20.1);
  });
});

// ── 레이스 결과 반영 ─────────────────────────────────────────

describe('레이스 결과 반영(플레이어 말)', () => {
  it('14. 일반 레이스 1착: 조교사 +3, 기수 +4, 명성은 그대로(그룹 아님)', () => {
    const r = playerRunAt(1, { grade: null, templateId: null });
    expect(relationOf(r.state, r.trainerKey)).toBe(3);
    expect(relationOf(r.state, r.jockeyKey)).toBe(4);
    expect(r.state.relations.reputation).toBe(BASE.relations.reputation);
  });

  it('15. 그룹(G2) 1착: 조교사 +6, 기수 +4, 명성 +2', () => {
    const r = playerRunAt(1, { grade: 'G2', templateId: null });
    expect(relationOf(r.state, r.trainerKey)).toBe(6);
    expect(relationOf(r.state, r.jockeyKey)).toBe(4);
    expect(r.state.relations.reputation).toBe(BASE.relations.reputation + 2);
  });

  it('16. G1 1착(클래식 지정): 조교사 +10, 기수 +8, 명성 +5 +3', () => {
    const r = playerRunAt(1, { grade: 'G1', templateId: G1_ID, classicTemplateIds: [G1_ID] });
    expect(relationOf(r.state, r.trainerKey)).toBe(10);
    expect(relationOf(r.state, r.jockeyKey)).toBe(8);
    expect(r.state.relations.reputation).toBe(BASE.relations.reputation + 8);
  });

  it('17. G1 2착: 조교사 +1, 기수 +1, 명성은 그대로', () => {
    const r = playerRunAt(2, { grade: 'G1', templateId: G1_ID, classicTemplateIds: [G1_ID] });
    expect(relationOf(r.state, r.trainerKey)).toBe(1);
    expect(relationOf(r.state, r.jockeyKey)).toBe(1);
    expect(r.state.relations.reputation).toBe(BASE.relations.reputation);
  });

  it('18. 3착은 +1, 4착은 관계 변화 없음', () => {
    const third = playerRunAt(3, { grade: null, templateId: null });
    expect(relationOf(third.state, third.trainerKey)).toBe(1);
    expect(relationOf(third.state, third.jockeyKey)).toBe(1);
    const fourth = playerRunAt(4, { grade: null, templateId: null });
    expect(relationOf(fourth.state, fourth.trainerKey)).toBe(0);
    expect(relationOf(fourth.state, fourth.jockeyKey)).toBe(0);
  });

  it('19. 크라운 시리즈 달성(플레이어 말): 명성 +5(시리즈) 가 G1 우승·그룹 우승 명성과 함께 붙는다', () => {
    const r = playerRunAt(1, { grade: 'G1', templateId: G1_ID, series: CROWN_SERIES });
    expect(r.state.relations.reputation).toBe(BASE.relations.reputation + 5 + 5);
  });

  it('20. AI 말이 이긴 레이스는 플레이어 관계·명성을 바꾸지 않는다(AI 관계는 저장하지 않는다)', () => {
    const racer = racerWithTrainer();
    const aiIds = aiRacingHorseIds(racer.state).slice(0, 2);
    const state = runSynthetic(racer.state, [aiIds[0] as HorseId, aiIds[1] as HorseId], {
      grade: 'G1',
      templateId: G1_ID,
      classicTemplateIds: [G1_ID],
    });
    expect(Object.keys(state.relations.values).some((k) => k.startsWith('jockey:'))).toBe(false);
    expect(state.relations.reputation).toBe(BASE.relations.reputation);
  });
});

// ── 명성 ─────────────────────────────────────────────────────

describe('명성 회귀와 연말 리딩', () => {
  it('21. 명성은 매주 기준값 10 쪽으로 0.03 씩 옮기고 넘지 않는다', () => {
    const s = structuredClone(BASE);
    s.relations.reputation = 50;
    regressReputation(s);
    expect(s.relations.reputation).toBe(49.97);

    s.relations.reputation = 9.99;
    regressReputation(s);
    expect(s.relations.reputation).toBe(10);

    s.relations.reputation = 0;
    regressReputation(s);
    expect(s.relations.reputation).toBe(0.03);
  });

  it('22. 연말 리딩 마주 순위: 상위 3위 안 +10, 10위 안 +5, 그 밖 0', () => {
    const entry = (id: string): LeadingEntry => ({ id, runners: 1, wins: 0, places: 0, groupWins: 0, earnings: 0 });
    const owners = (playerRank: number): LeadingEntry[] => {
      const list: LeadingEntry[] = [];
      for (let i = 1; i <= 12; i++) {
        list.push(entry(i === playerRank ? BASE.playerOwnerId : `ow-rival-${i}`));
      }
      return list;
    };
    const at = (rank: number): number => {
      const s = structuredClone(BASE);
      s.relations.reputation = 10;
      reputationFromLeadingOwners(s, owners(rank));
      return s.relations.reputation;
    };
    expect(at(1)).toBe(20);
    expect(at(3)).toBe(20);
    expect(at(4)).toBe(15);
    expect(at(10)).toBe(15);
    expect(at(11)).toBe(10);
  });

  it('23. adjustReputation 과 회귀는 주간 시스템에서 함께 돈다(명성 40 → 39.97)', () => {
    const s = structuredClone(BASE);
    s.relations.reputation = 40;
    expect(advanceWeek(s, [createRelationsSystem()]).state.relations.reputation).toBe(39.97);
  });
});

// ── 재현성·저장 ──────────────────────────────────────────────

describe('재현성과 저장 왕복', () => {
  it('24. 같은 시드로 플레이어 말 진행(조교·레이스 포함)을 두 번 하면 최종 state 가 toEqual 이다', () => {
    const run = (): GameState => {
      const racer = racerWithTrainer();
      const aiIds = aiRacingHorseIds(racer.state).slice(0, 1);
      const raced = runSynthetic(racer.state, [racer.horseId, aiIds[0] as HorseId], {
        grade: 'G1',
        templateId: G1_ID,
        classicTemplateIds: [G1_ID],
      });
      return step(raced, 8);
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.relations.reputation).toBeGreaterThan(BASE.relations.reputation);
  }, MID_TIMEOUT);

  it('25. 관계·명성이 든 상태를 serializeGame → deserializeGame 하면 같은 상태다', () => {
    const r = playerRunAt(1, { grade: 'G1', templateId: G1_ID, classicTemplateIds: [G1_ID] });
    expect(Object.keys(r.state.relations.values).length).toBeGreaterThan(0);

    const json = serializeGame(r.state, '2026-10-12T00:00:00.000Z');
    const loaded = deserializeGame(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state.relations).toEqual(r.state.relations);
      expect(loaded.state).toEqual(r.state);
    }
  });

  it('26. 3시즌 무행동 진행: 관계 키는 AI 끼리 것을 담지 않고, 값 범위와 저장 크기를 확인한다', () => {
    let s = structuredClone(BASE);
    const systems = createGameSystems(STATIC_GAME);
    for (let i = 0; i < 3 * SEASON_WEEKS; i++) {
      s = advanceWeek(s, systems).state;
    }
    const keys = Object.keys(s.relations.values);
    for (const key of keys) {
      const value = s.relations.values[key as RelationKey] ?? 0;
      expect(value).toBeGreaterThanOrEqual(-100);
      expect(value).toBeLessThanOrEqual(100);
      expect(value).not.toBe(0);
    }
    expect(s.relations.reputation).toBeGreaterThanOrEqual(0);
    expect(s.relations.reputation).toBeLessThanOrEqual(100);
    // 무행동이면 마주 키는 생기지 않고, 지급 현역마의 조교사·기수 키만 생길 수 있다(AI 끼리의 관계는 저장하지 않는다)
    for (const key of keys) expect(key.startsWith('trainer:') || key.startsWith('jockey:')).toBe(true);
    process.stdout.write(`[relations] 3시즌 무행동 관계 키 ${keys.length}개\n`);
    expect(s.date.year).toBeGreaterThan(START_YEAR);
  }, HEAVY_TIMEOUT);
});
