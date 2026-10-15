import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { createBreedingSystem, bookCovering, type BreedingStaticData } from '../../src/engine/breeding/season';
import { loadRacecourses } from '../../src/engine/course/load';
import {
  closeEconomyYear,
  ledgerTotalsSum,
  prunePlayerLedger,
  recordMoney,
} from '../../src/engine/economy/ledger';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import type { SampleField } from '../../src/engine/race/sampleField';
import { applyRaceResult } from '../../src/engine/season/apply';
import { isEligible } from '../../src/engine/season/eligibility';
import { assignTrainer, declarePlayerHorse } from '../../src/engine/season/player';
import { createSeasonSystem, type SeasonStaticData } from '../../src/engine/season/system';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { allocateHorseId } from '../../src/engine/state/world';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type {
  CountryCode,
  Declaration,
  GameDate,
  GameState,
  Going,
  Horse,
  HorseId,
  LedgerEntry,
  Meeting,
  Race,
  RaceResult,
  RaceTemplate,
  Racecourse,
  RunnerResult,
  ScheduledRace,
  SeriesDefinition,
  TrainerId,
  WeeklySystem,
} from '../../src/engine/types';

const SEED = 20261012;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SILKS_REQUEST = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };
const APRIL_FIRST_WEEK = weekOfSlot({ month: 4, weekOfMonth: 1 });
const SHORT_WEEKS = 8;
const YEAR_WEEKS = 53;
const DATE: GameDate = { year: START_YEAR, week: 20 };
/** 무거운 진행 테스트용 제한 시간(ms) */
const MID_TIMEOUT = 120_000;
/** 플레이어 테스트 말의 OR (핸디캡 대역에 드는 값) */
const PLAYER_RACER_OR = 70;

const CROWN_BONUS = 80_000;
const POINTS_BONUS = 50_000;
const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const CROWN_ID = 'test-crown';
const POINTS_ID = 'test-points';

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

/** 테스트용 G1 템플릿(가상 이름) */
function g1Template(
  id: string,
  courseId: string,
  distance: number,
  schedule: RaceTemplate['schedule'],
  name: string,
): RaceTemplate {
  const course = courseOf(courseId);
  return {
    id,
    name,
    racecourseId: course.id,
    distance,
    layoutId: layoutOf(course, distance),
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
    schedule,
    cardOrder: 1,
    tags: ['classic'],
  };
}

const TEMPLATES: RaceTemplate[] = [
  g1Template(G1_A_ID, 'ashcombe', 2012, { month: 4, weekOfMonth: 2 }, 'Test Group One Ashcombe'),
  g1Template(G1_B_ID, 'saint_ourens', 2000, { month: 6, weekOfMonth: 1 }, 'Test Group One Saint'),
];

/** 연말 points 시리즈(진행 테스트용) */
const SEASON_SERIES: SeriesDefinition[] = [
  {
    id: POINTS_ID,
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: POINTS_BONUS,
  },
];

/** 한 레이스로 끝나는 crown 시리즈(상금·시리즈 보너스 기록 테스트용) */
const CROWN_SERIES: SeriesDefinition[] = [
  {
    id: CROWN_ID,
    nameKey: 'test.crown',
    kind: 'crown',
    legs: [G1_A_ID],
    winsRequired: 1,
    bonus: CROWN_BONUS,
  },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SEASON_SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SEASON_SERIES,
};

const SEASON_STATIC: SeasonStaticData = { courses: COURSES, templates: TEMPLATES, series: SEASON_SERIES, nicks: getNicks() };

const BREEDING_DATA: BreedingStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

/** 교배 시스템과 달력만(교배 예약 후 수태 판정 확인용) */
const BREEDING_SYSTEMS: readonly WeeklySystem[] = [calendarSystem, createBreedingSystem(BREEDING_DATA)];

const meetingStub: Meeting = {
  id: 'synthetic:ledger',
  date: DATE,
  racecourseId: 'saint_ourens',
  going: 'good',
  races: [],
};

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 날짜만 바꾼 복사본 */
function atWeek(state: GameState, year: number, week: number): GameState {
  const next = structuredClone(state);
  next.date = { year, week };
  return next;
}

/** 주 시스템 전체를 n 주 진행한다(입력 state 는 바꾸지 않는다) */
function step(state: GameState, weeks: number): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  for (let i = 0; i < weeks; i++) {
    current = advanceWeek(current, systems).state;
  }
  return current;
}

/** 현역(in_training) AI 말 id 를 정렬 순서대로 고른다 */
function aiRacingHorseIds(state: GameState): HorseId[] {
  return Object.keys(state.horses)
    .sort()
    .filter((id) => {
      const h = state.horses[id];
      return h !== undefined && h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId;
    });
}

/** 3세 이상 AI 현역마를 복제해 플레이어 소유의 새 말을 만든다(기록 0, 준비도 충분) */
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

/**
 * 플레이어 말을 아직 접수하지 않은 가장 이른 적격 레이스(올해 개최)에 접수한다.
 * 이미 접수한 open 레이스가 있으면 그대로 둔다. 올해 개최만 고르므로 2027년 1주 레이스에는 접수되지 않는다.
 */
function declareNext(state: GameState, horseId: HorseId): GameState {
  const horse = state.horses[horseId];
  if (horse === undefined) throw new Error('테스트 전제 위반: 플레이어 말 없음');
  const meetings = state.seasonState.meetings;
  const alreadyDeclared = meetings.some((m) =>
    m.races.some((sr) => sr.status === 'open' && sr.declarations.some((d) => d.horseId === horseId)),
  );
  if (alreadyDeclared) return state;
  for (const m of meetings) {
    if (m.date.year !== START_YEAR) continue;
    for (const sr of m.races) {
      if (sr.status !== 'open' || !isEligible(horse, sr.race, m.date, state.seasonState)) continue;
      const declared = declarePlayerHorse(state, m.id, sr.race.id, horseId);
      if (declared.ok) return declared.state;
    }
  }
  return state;
}

/** 조교사를 배정한 플레이어 테스트 말을 만든다 */
function racerReadyState(): { state: GameState; horseId: HorseId } {
  const racer = makePlayerRacer(BASE);
  const assigned = assignTrainer(racer.state, racer.horseId, trainerWithRoom(racer.state));
  if (!assigned.ok) throw new Error('테스트 전제 위반: 조교사 배정 실패');
  return { state: assigned.state, horseId: racer.horseId };
}

/** 플레이어 말 접수를 포함해 n 주 진행한다 */
function runRacerWeeks(weeks: number): { state: GameState; horseId: HorseId } {
  const ready = racerReadyState();
  const systems = createGameSystems(STATIC_GAME);
  let state = ready.state;
  for (let i = 0; i < weeks; i++) {
    state = declareNext(state, ready.horseId);
    state = advanceWeek(state, systems).state;
  }
  return { state, horseId: ready.horseId };
}

/** 현역 AI 말 n두 */
function pickHorseIds(state: GameState, n: number): HorseId[] {
  const ids = aiRacingHorseIds(state);
  if (ids.length < n) throw new Error('테스트 전제 위반: 현역 AI 말이 부족하다');
  return ids.slice(0, n);
}

function syntheticG1(id: string): Race {
  const course = courseOf('saint_ourens');
  return {
    id,
    name: 'Synthetic Ledger Stakes',
    racecourseId: course.id,
    distance: 2000,
    layoutId: layoutOf(course, 2000),
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
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

/** 주어진 말들을 1착부터 순서대로 G1 레이스에 세워 결과를 반영한다(applyRaceResult 직접 호출) */
function applySyntheticG1(state: GameState, horseIds: HorseId[], templateId: string, series: SeriesDefinition[]): GameState {
  const race = syntheticG1('test-ledger-race');
  const declarations: Declaration[] = horseIds.map((horseId) => {
    const h = state.horses[horseId];
    if (h === undefined || h.ownerId === null) throw new Error(`테스트 전제 위반: 말 ${horseId} 의 마주가 없다`);
    return {
      horseId,
      ownerId: h.ownerId,
      trainerId: h.trainerId,
      jockeyId: 'jk-ledger',
      weightLb: 126,
      isPlayer: h.ownerId === state.playerOwnerId,
    };
  });
  const scheduled: ScheduledRace = {
    race,
    templateId,
    status: 'run',
    declarations,
    simulated: true,
  };
  const runners: RunnerResult[] = horseIds.map((horseId, i) => ({
    runnerIndex: i,
    horseId,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: 'jk-ledger',
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
      jockeyId: 'jk-ledger',
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
    series,
    country: 'GB' as CountryCode,
    nicks: [],
  }).state;
}

/** 플레이어 장부 중 종류가 category 인 항목 */
function entriesOf(state: GameState, category: LedgerEntry['category']): LedgerEntry[] {
  return state.economy.playerLedger.filter((e) => e.category === category);
}

function sumAmounts(entries: readonly LedgerEntry[]): number {
  return entries.reduce((acc, e) => acc + e.amount, 0);
}

let BASE: GameState;

beforeAll(() => {
  BASE = boot(SEED);
}, MID_TIMEOUT);

describe('recordMoney (M4-A2a)', () => {
  it('1. 플레이어: funds 가 바뀌고 playerLedger 에 항목이 남고 currentYear.player 합계가 늘고 aiTotals 는 그대로다', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    const fundsBefore = draft.owners[pid]?.funds ?? 0;
    const ledgerBefore = draft.economy.playerLedger.length;
    const aiBefore = structuredClone(draft.economy.currentYear.aiTotals);
    const playerPrizeBefore = draft.economy.currentYear.player.prize ?? 0;

    recordMoney(draft, pid, 'prize', 5000, DATE, 'h-1');

    expect(draft.owners[pid]?.funds).toBe(fundsBefore + 5000);
    expect(draft.economy.playerLedger.slice(ledgerBefore)).toEqual([
      { date: DATE, category: 'prize', amount: 5000, horseId: 'h-1' },
    ]);
    expect(draft.economy.currentYear.player.prize).toBe(playerPrizeBefore + 5000);
    expect(draft.economy.currentYear.aiTotals).toEqual(aiBefore);
  });

  it('2. AI 마주: funds 가 바뀌고 항목은 남지 않으며 aiTotals 합계만 늘고 플레이어 합계는 그대로다', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    const aiId = Object.keys(draft.owners).sort().find((id) => id !== pid);
    if (aiId === undefined) throw new Error('테스트 전제 위반: AI 마주가 없다');
    const fundsBefore = draft.owners[aiId]?.funds ?? 0;
    const ledgerBefore = structuredClone(draft.economy.playerLedger);
    const aiPrizeBefore = draft.economy.currentYear.aiTotals.prize ?? 0;
    const playerBefore = structuredClone(draft.economy.currentYear.player);

    recordMoney(draft, aiId, 'prize', 700, DATE);

    expect(draft.owners[aiId]?.funds).toBe(fundsBefore + 700);
    expect(draft.economy.playerLedger).toEqual(ledgerBefore);
    expect(draft.economy.currentYear.aiTotals.prize).toBe(aiPrizeBefore + 700);
    expect(draft.economy.currentYear.player).toEqual(playerBefore);
  });

  it('3. 정수가 아닌 금액은 RangeError 이고 아무것도 바뀌지 않는다', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    const before = structuredClone(draft);
    expect(() => recordMoney(draft, pid, 'prize', 1.5, DATE)).toThrow(RangeError);
    expect(draft).toEqual(before);
  });

  it('4. 금액 0 이면 아무것도 바뀌지 않는다', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    const before = structuredClone(draft);
    recordMoney(draft, pid, 'prize', 0, DATE, 'h-1');
    expect(draft).toEqual(before);
  });

  it('5. horseId 를 생략하면 null 로 남는다', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    recordMoney(draft, pid, 'other', 10, DATE);
    expect(draft.economy.playerLedger[draft.economy.playerLedger.length - 1]).toEqual({
      date: DATE,
      category: 'other',
      amount: 10,
      horseId: null,
    });
  });

  it('6. ledgerTotalsSum 은 종류별 합계의 합이고 빈 객체는 0 이다', () => {
    expect(ledgerTotalsSum({ prize: 10, stud_fee_paid: -4 })).toBe(6);
    expect(ledgerTotalsSum({})).toBe(0);
  });
});

describe('장부 기록 지점 (상금·시리즈 보너스·종부료·환불)', () => {
  it('7. applyRaceResult: 플레이어 말의 상금은 prize(horseId = 그 말), 크라운 보너스는 series_bonus 로 남는다', () => {
    const racer = makePlayerRacer(BASE);
    const [aiA, aiB] = pickHorseIds(racer.state, 2);
    if (aiA === undefined || aiB === undefined) throw new Error('AI 말이 부족하다');
    const fundsBefore = racer.state.owners[racer.state.playerOwnerId]?.funds ?? 0;
    const aiPrizeBefore = racer.state.economy.currentYear.aiTotals.prize ?? 0;

    const after = applySyntheticG1(racer.state, [racer.horseId, aiA, aiB], G1_A_ID, CROWN_SERIES);

    const prizes = entriesOf(after, 'prize');
    expect(prizes).toEqual([{ date: DATE, category: 'prize', amount: 200000, horseId: racer.horseId }]);
    const bonuses = entriesOf(after, 'series_bonus');
    expect(bonuses).toEqual([{ date: DATE, category: 'series_bonus', amount: CROWN_BONUS, horseId: racer.horseId }]);
    // 등록료: 총상금 320000 × 1% = 3200(M4-A2b). 조교사가 없는 말이라 운송비는 없다
    expect(entriesOf(after, 'entry_fee')).toEqual([
      { date: DATE, category: 'entry_fee', amount: -3200, horseId: racer.horseId },
    ]);
    expect(entriesOf(after, 'transport')).toEqual([]);
    expect(after.owners[after.playerOwnerId]?.funds).toBe(fundsBefore + 200000 + CROWN_BONUS - 3200);
    // AI 2·3착 상금(70000 + 35000)은 AI 합계에만 들어간다
    expect(after.economy.currentYear.aiTotals.prize).toBe(aiPrizeBefore + 70000 + 35000);
  });

  it('8. 교배 예약 종부료는 stud_fee_paid(−fee, horseId = 암말), 불수태 환불은 stud_fee_paid(+fee)로 남는다', () => {
    const base = atWeek(BASE, START_YEAR, 10);
    const mareId = base.owners[base.playerOwnerId]?.horseIds.find((h) => base.mares[h] !== undefined);
    if (mareId === undefined) throw new Error('테스트 전제: 플레이어 암말이 있어야 한다');
    const stallionId = Object.keys(base.stallions).sort()[0];
    if (stallionId === undefined) throw new Error('테스트 전제: 종마가 있어야 한다');

    const state = structuredClone(base);
    const stallion = state.stallions[stallionId];
    if (stallion === undefined) throw new Error('종마 없음');
    /** 수태율 0 으로 두어 예약이 반드시 불수태가 되게 한다(환불 확인용) */
    stallion.fertility = 0;
    const fundsBefore = state.owners[state.playerOwnerId]?.funds ?? 0;

    const booked = bookCovering(state, state.playerOwnerId, mareId, stallionId);
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    const fee = stallion.fee;
    expect(entriesOf(booked.state, 'stud_fee_paid')).toEqual([
      { date: { year: START_YEAR, week: 10 }, category: 'stud_fee_paid', amount: -fee, horseId: mareId },
    ]);
    expect(booked.state.owners[state.playerOwnerId]?.funds).toBe(fundsBefore - fee);

    // 예약 주(10주)는 건너뛰고 11주에 수태 판정이 나온다
    const afterJudge = advanceWeek(advanceWeek(booked.state, BREEDING_SYSTEMS).state, BREEDING_SYSTEMS).state;
    expect(entriesOf(afterJudge, 'stud_fee_paid')).toEqual([
      { date: { year: START_YEAR, week: 10 }, category: 'stud_fee_paid', amount: -fee, horseId: mareId },
      { date: { year: START_YEAR, week: 11 }, category: 'stud_fee_paid', amount: fee, horseId: mareId },
    ]);
    expect(afterJudge.owners[state.playerOwnerId]?.funds).toBe(fundsBefore);
  });

  it('9. 연말 points 챔피언 보너스는 series_bonus 로 남고 지난해 요약의 합계에 들어간다', () => {
    const racer = makePlayerRacer(BASE);
    const draft = racer.state;
    draft.seasonState.meetings = [];
    draft.seasonState.series[POINTS_ID] = {
      seriesId: POINTS_ID,
      year: START_YEAR,
      legWinners: {},
      points: { [racer.horseId]: 10 },
      champion: null,
    };

    createSeasonSystem(SEASON_STATIC).run(draft, {
      date: { year: START_YEAR + 1, week: 1 },
      rng: createRng(SEED),
    });

    expect(entriesOf(draft, 'series_bonus')).toEqual([
      { date: { year: START_YEAR + 1, week: 1 }, category: 'series_bonus', amount: POINTS_BONUS, horseId: racer.horseId },
    ]);
    const summary = draft.economy.yearSummaries.find((s) => s.year === START_YEAR);
    expect(summary?.player.series_bonus).toBe(POINTS_BONUS);
    expect(draft.economy.currentYear).toEqual({ player: {}, aiTotals: {} });
  });
});

describe('연말 요약과 장부 정리', () => {
  it('10. closeEconomyYear: 중앙값·합계·플레이어 자금·빚을 요약하고 currentYear 를 비운다, 같은 해 두 번째 호출은 무시한다', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    const aiId = Object.keys(draft.owners).sort().find((id) => id !== pid);
    if (aiId === undefined) throw new Error('AI 마주가 없다');
    recordMoney(draft, pid, 'prize', 1000, DATE, null);
    recordMoney(draft, aiId, 'prize', 700, DATE);

    const aiFunds = Object.values(draft.owners)
      .filter((o) => o.id !== pid)
      .map((o) => o.funds)
      .sort((a, b) => a - b);
    const n = aiFunds.length;
    const upper = aiFunds[Math.floor(n / 2)] ?? 0;
    const lower = aiFunds[Math.floor(n / 2) - 1] ?? 0;
    const median = n % 2 === 1 ? upper : Math.floor((lower + upper) / 2);
    const total = aiFunds.reduce((acc, f) => acc + f, 0);

    closeEconomyYear(draft, START_YEAR);

    expect(draft.economy.yearSummaries).toEqual([
      {
        year: START_YEAR,
        player: { prize: 1000 },
        aiTotals: { prize: 700 },
        aiFundsMedian: median,
        aiFundsTotal: total,
        playerFunds: draft.owners[pid]?.funds ?? 0,
        playerDebt: draft.economy.debt,
      },
    ]);
    expect(draft.economy.currentYear).toEqual({ player: {}, aiTotals: {} });

    closeEconomyYear(draft, START_YEAR);
    expect(draft.economy.yearSummaries).toHaveLength(1);
  });

  it('11. prunePlayerLedger: 104주보다 오래된 플레이어 항목만 지운다(정확히 104주 전은 남긴다)', () => {
    const draft = structuredClone(BASE);
    const pid = draft.playerOwnerId;
    const now: GameDate = { year: START_YEAR, week: 20 };
    recordMoney(draft, pid, 'other', 100, { year: START_YEAR - 2, week: 19 }); // 105주 전: 지운다
    recordMoney(draft, pid, 'other', 200, { year: START_YEAR - 2, week: 20 }); // 104주 전: 남긴다
    recordMoney(draft, pid, 'other', 300, now);

    prunePlayerLedger(draft, now);

    expect(draft.economy.playerLedger.map((e) => e.amount)).toEqual([200, 300]);
  });
});

describe('한 해 진행과 재현성', () => {
  it('12. 53주 진행: yearSummaries 1건, 플레이어 합계 = 장부 항목 합, prize 합계 = 플레이어 말 상금 합', () => {
    const ready = racerReadyState();
    const systems = createGameSystems(STATIC_GAME);
    let state = ready.state;
    for (let i = 0; i < YEAR_WEEKS; i++) {
      state = declareNext(state, ready.horseId);
      state = advanceWeek(state, systems).state;
    }

    expect(state.date).toEqual({ year: START_YEAR + 1, week: 2 });
    expect(state.economy.yearSummaries.map((s) => s.year)).toEqual([START_YEAR]);
    const summary = state.economy.yearSummaries[0];
    if (summary === undefined) throw new Error('연말 요약이 없다');

    // 연말 요약은 2026년 항목만 담는다(2027년 1~2주 항목은 다음 해 몫)
    const ledgerTotal = sumAmounts(state.economy.playerLedger.filter((e) => e.date.year === START_YEAR));
    expect(ledgerTotalsSum(summary.player)).toBe(ledgerTotal);

    const prizeTotal = sumAmounts(entriesOf(state, 'prize'));
    expect(summary.player.prize ?? 0).toBe(prizeTotal);
    expect(prizeTotal).toBe(state.horses[ready.horseId]?.record.earnings ?? -1);
    // 플레이어 말 상금 유무는 시드·데이터에 따라 0 일 수 있다(2026-10-15 종마 데이터 추가 후 0). 등식 검사가 핵심이다
    expect(prizeTotal).toBeGreaterThanOrEqual(0);
    expect(summary.aiTotals.prize ?? 0).toBeGreaterThan(0);
    // 연말 요약의 자금은 연초 자금 + 그해 장부 합(정기 비용 포함). 요약은 1월 1주 처리 전에 닫히므로 현재 자금과는 다르다
    const startFunds = BASE.owners[BASE.playerOwnerId]?.funds ?? 0;
    const year2026 = state.economy.playerLedger.filter((e) => e.date.year === START_YEAR);
    expect(summary.playerFunds).toBe(startFunds + sumAmounts(year2026));
    // 올해 합계는 연말에 비워졌고, 이후 2027년 1~2주 항목만 들어 있다
    const year2027 = state.economy.playerLedger.filter((e) => e.date.year === START_YEAR + 1);
    expect(ledgerTotalsSum(state.economy.currentYear.player)).toBe(sumAmounts(year2027));
  }, MID_TIMEOUT);

  it('13. 같은 시드로 플레이어 말 진행을 두 번 하면 최종 state 가 toEqual 이다', () => {
    const first = runRacerWeeks(SHORT_WEEKS + APRIL_FIRST_WEEK - 1);
    const second = runRacerWeeks(SHORT_WEEKS + APRIL_FIRST_WEEK - 1);
    expect(second.state).toEqual(first.state);
  }, MID_TIMEOUT);

  it('14. 장부가 든 상태를 serializeGame → deserializeGame 하면 같은 상태다', () => {
    const racer = makePlayerRacer(BASE);
    const [aiA, aiB] = pickHorseIds(racer.state, 2);
    if (aiA === undefined || aiB === undefined) throw new Error('AI 말이 부족하다');
    const state = applySyntheticG1(racer.state, [racer.horseId, aiA, aiB], G1_A_ID, CROWN_SERIES);
    expect(state.economy.playerLedger.length).toBeGreaterThan(0);

    const json = serializeGame(state, '2026-10-12T00:00:00.000Z');
    const loaded = deserializeGame(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state).toEqual(state);
    }
  });

  it('15. 4월 1주부터 8주 진행(AI 포함)을 같은 시드로 두 번 하면 최종 state 가 toEqual 이다', () => {
    const start = step(BASE, APRIL_FIRST_WEEK - 1);
    const first = step(start, SHORT_WEEKS);
    const second = step(start, SHORT_WEEKS);
    expect(second).toEqual(first);
  }, MID_TIMEOUT);
});
