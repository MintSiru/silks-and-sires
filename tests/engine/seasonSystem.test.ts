import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { isEligible } from '../../src/engine/season/eligibility';
import { emptyLeadingTables } from '../../src/engine/season/state';
import { createSeasonSystem, type SeasonStaticData } from '../../src/engine/season/system';
import {
  assignTrainer,
  declarePlayerHorse,
  withdrawPlayerHorse,
} from '../../src/engine/season/player';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { loadRacecourses } from '../../src/engine/course/load';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { allocateHorseId } from '../../src/engine/state/world';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type {
  Going,
  GameState,
  Horse,
  HorseId,
  Racecourse,
  RaceResult,
  RaceTemplate,
  SeriesDefinition,
  TrainerId,
} from '../../src/engine/types';

const SEED = 20261011;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const APRIL_FIRST_WEEK = weekOfSlot({ month: 4, weekOfMonth: 1 });
const SHORT_WEEKS = 8;
const YEAR_WEEKS = WEEKS_PER_YEAR;
/** 긴 진행 테스트용 제한 시간(ms). 기본 5초로는 부족하다 */
const LONG_TIMEOUT = 600_000;
const MID_TIMEOUT = 120_000;

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);

const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const CROWN_ID = 'test-crown';
const POINTS_ID = 'test-points';
const POINTS_BONUS = 50_000;
const CROWN_BONUS = 100_000;

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

/** 테스트용 G1 템플릿(가상 이름). 그룹 선발은 OR 100 이상이 필요하다 */
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

const SERIES: SeriesDefinition[] = [
  {
    id: CROWN_ID,
    nameKey: 'test.crown',
    kind: 'crown',
    legs: [G1_A_ID, G1_B_ID],
    winsRequired: 2,
    bonus: CROWN_BONUS,
  },
  {
    id: POINTS_ID,
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: POINTS_BONUS,
  },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  words: getHorseWords(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  words: getHorseWords(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const SEASON_STATIC: SeasonStaticData = { courses: COURSES, templates: TEMPLATES, series: SERIES, nicks: getNicks() };

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
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

function aiOwnerFunds(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const owner of Object.values(state.owners)) {
    if (!owner.isPlayer) out[owner.id] = owner.funds;
  }
  return out;
}

function totalRunners(state: GameState): number {
  return Object.values(state.seasonState.leading.jockey).reduce((sum, e) => sum + e.runners, 0);
}

function aiRacingHorseIds(state: GameState): HorseId[] {
  return Object.keys(state.horses)
    .sort()
    .filter((id) => {
      const h = state.horses[id];
      return h !== undefined && h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId;
    });
}

/** 2026년 기준 3세 이상 AI 현역마 하나를 복제해 플레이어 소유의 새 말을 만든다(기록 0, 준비도 충분) */
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

/** 플레이어 말이 출주할 수 있는 'open' 레이스를 찾는다. skipRaceId 는 제외 */
function findOpenRace(
  state: GameState,
  horse: Horse,
  skipRaceId: string | null = null,
): { meetingId: string; raceId: string } {
  for (const m of state.seasonState.meetings) {
    for (const sr of m.races) {
      if (sr.race.id === skipRaceId || sr.status !== 'open') continue;
      if (isEligible(horse, sr.race, m.date, state.seasonState)) {
        return { meetingId: m.id, raceId: sr.race.id };
      }
    }
  }
  throw new Error('테스트 전제 위반: 출주 가능한 open 레이스가 없다');
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

/** 공용 기준 상태: 2026년 1주, 다음 주(2주) 개최가 들어 있다. 테스트는 이 값을 바꾸지 않는다(함수들은 복제해서 쓴다) */
let BASE: GameState;

beforeAll(() => {
  BASE = boot(SEED);
}, MID_TIMEOUT);

describe('bootstrapGame (M3-A6c)', () => {
  it('1. 같은 시드면 toEqual 이고, 인물·현역마·다음 주 개최가 들어 있다', () => {
    const a = boot(SEED);
    const b = boot(SEED);
    expect(a).toEqual(b);

    expect(Object.values(a.jockeys).length).toBeGreaterThan(0);
    expect(Object.values(a.trainers).length).toBeGreaterThan(0);
    expect(Object.values(a.owners).filter((o) => !o.isPlayer).length).toBeGreaterThan(0);
    expect(aiRacingHorseIds(a).length).toBeGreaterThan(0);
    expect(a.seasonState.meetings.length).toBeGreaterThan(0);
    expect(a.seasonState.meetings.every((m) => m.date.year === START_YEAR && m.date.week === 2)).toBe(true);
    expect(a.seasonState.year).toBe(START_YEAR);
    expect(a.seasonState.lastPopulationYear).toBe(START_YEAR);
    expect(a.date).toEqual({ year: START_YEAR, week: 1 });
  }, MID_TIMEOUT);
});

describe('시즌 주간 진행 (createGameSystems + advanceWeek)', () => {
  it('2. 2026년 4월 1주부터 8주: 매주 개최 실행, 레이스 수 > 0, AI funds 증가, 지난 개최는 남지 않는다', () => {
    const systems = createGameSystems(STATIC_GAME);
    let state = step(BASE, APRIL_FIRST_WEEK - 1);
    expect(state.date).toEqual({ year: START_YEAR, week: APRIL_FIRST_WEEK });

    for (let i = 0; i < SHORT_WEEKS; i++) {
      const week = state.date.week;
      expect(state.seasonState.meetings.some((m) => m.date.week === week)).toBe(true);

      const runnersBefore = totalRunners(state);
      const fundsBefore = aiOwnerFunds(state);
      const next = advanceWeek(state, systems).state;

      expect(totalRunners(next)).toBeGreaterThan(runnersBefore);
      const fundsAfter = aiOwnerFunds(next);
      const someFundsUp = Object.keys(fundsAfter).some((id) => (fundsAfter[id] ?? 0) > (fundsBefore[id] ?? 0));
      expect(someFundsUp).toBe(true);
      expect(next.seasonState.meetings.some((m) => m.date.week === week)).toBe(false);
      expect(next.seasonState.meetings.some((m) => m.date.week === week + 1)).toBe(true);
      state = next;
    }
    expect(state.seasonState.meetings.every((m) => m.date.week === state.date.week)).toBe(true);
  }, MID_TIMEOUT);

  it('3. 같은 시드로 8주 진행을 두 번 하면 최종 state 가 toEqual 이다', () => {
    const first = step(boot(SEED), SHORT_WEEKS);
    const second = step(boot(SEED), SHORT_WEEKS);
    expect(second).toEqual(first);
  }, MID_TIMEOUT);

  it('6. 8주 진행 상태를 serializeGame → deserializeGame 하면 같은 상태다', () => {
    const state = step(BASE, SHORT_WEEKS);
    const json = serializeGame(state, '2026-10-11T00:00:00.000Z');
    const loaded = deserializeGame(json);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state).toEqual(state);
    }
  }, MID_TIMEOUT);
});

describe('플레이어 출주 API (declare / withdraw / assignTrainer)', () => {
  it('4. 조교사 배정 → 출주 접수 → 다음 주 출주: raceResults·replayable·race_run 에 남는다', () => {
    const systems = createGameSystems(STATIC_GAME);
    const { state: racer, horseId } = makePlayerRacer(BASE);
    const assigned = assignTrainer(racer, horseId, trainerWithRoom(racer));
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;

    const horse = assigned.state.horses[horseId];
    if (horse === undefined) throw new Error('말이 없다');
    const target = findOpenRace(assigned.state, horse);
    const declared = declarePlayerHorse(assigned.state, target.meetingId, target.raceId, horseId);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;

    // 접수는 1주차(BASE)에 한다. 대상 레이스는 2주차 개최이므로 2주차 진행(두 번째 advance)에서 달린다.
    const weekOne = advanceWeek(declared.state, systems).state;
    expect(weekOne.date.week).toBe(2);
    expect(weekOne.seasonState.meetings.some((m) => m.id === target.meetingId)).toBe(true);
    expect(weekOne.raceResults.some((r) => r.raceId === target.raceId)).toBe(false);

    const result = advanceWeek(weekOne, systems);
    const after = result.state;
    expect(after.raceResults.some((r) => r.raceId === target.raceId && r.runners.some((x) => x.horseId === horseId))).toBe(true);
    expect(after.seasonState.replayable.some((r) => r.race.id === target.raceId && r.meetingId === target.meetingId)).toBe(true);
    expect(
      result.events.some((e) => e.type === 'race_run' && e.raceId === target.raceId && e.playerHorseIds.includes(horseId)),
    ).toBe(true);
    expect(after.horses[horseId]?.record.starts).toBe(1);
  }, MID_TIMEOUT);

  it('declarePlayerHorse 실패 사유 코드를 각각 확인한다', () => {
    const { state: racer, horseId } = makePlayerRacer(BASE);
    const trainerId = trainerWithRoom(racer);
    const assigned = assignTrainer(racer, horseId, trainerId);
    if (!assigned.ok) throw new Error('assignTrainer 실패');
    const withTrainer = assigned.state;
    const horse = withTrainer.horses[horseId];
    if (horse === undefined) throw new Error('말이 없다');
    const target = findOpenRace(withTrainer, horse);
    const aiHorseId = aiRacingHorseIds(withTrainer)[0];
    if (aiHorseId === undefined) throw new Error('AI 말이 없다');

    // not_found: 없는 개최·없는 말
    const notFoundMeeting = declarePlayerHorse(withTrainer, 'no-such-meeting', target.raceId, horseId);
    expect(notFoundMeeting).toEqual({ ok: false, error: 'not_found' });
    const notFoundHorse = declarePlayerHorse(withTrainer, target.meetingId, target.raceId, 'h-missing');
    expect(notFoundHorse).toEqual({ ok: false, error: 'not_found' });

    // not_player_horse: AI 말
    const notPlayer = declarePlayerHorse(withTrainer, target.meetingId, target.raceId, aiHorseId);
    expect(notPlayer).toEqual({ ok: false, error: 'not_player_horse' });

    // no_trainer: 조교사 배정 전
    const noTrainer = declarePlayerHorse(racer, target.meetingId, target.raceId, horseId);
    expect(noTrainer).toEqual({ ok: false, error: 'no_trainer' });

    // not_eligible: 준비도 0
    const weak = structuredClone(withTrainer);
    const weakHorse = weak.horses[horseId];
    if (weakHorse === undefined) throw new Error('말이 없다');
    weakHorse.condition.fitness = 0;
    expect(declarePlayerHorse(weak, target.meetingId, target.raceId, horseId)).toEqual({ ok: false, error: 'not_eligible' });

    // race_closed: 레이스가 이미 closed
    const closed = structuredClone(withTrainer);
    const closedMeeting = closed.seasonState.meetings.find((m) => m.id === target.meetingId);
    const closedRace = closedMeeting?.races.find((r) => r.race.id === target.raceId);
    if (closedRace === undefined) throw new Error('레이스가 없다');
    closedRace.status = 'closed';
    expect(declarePlayerHorse(closed, target.meetingId, target.raceId, horseId)).toEqual({ ok: false, error: 'race_closed' });

    // field_full: 두수 상한을 현재 선언 두수로 낮춘다
    const full = structuredClone(withTrainer);
    const fullRace = full.seasonState.meetings.find((m) => m.id === target.meetingId)?.races.find((r) => r.race.id === target.raceId);
    if (fullRace === undefined) throw new Error('레이스가 없다');
    fullRace.race.maxRunners = fullRace.declarations.length;
    expect(declarePlayerHorse(full, target.meetingId, target.raceId, horseId)).toEqual({ ok: false, error: 'field_full' });

    // 정상 접수 후 같은 주 다른 레이스 → already_declared
    const ok = declarePlayerHorse(withTrainer, target.meetingId, target.raceId, horseId);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const other = findOpenRace(ok.state, horse, target.raceId);
    expect(declarePlayerHorse(ok.state, other.meetingId, other.raceId, horseId)).toEqual({ ok: false, error: 'already_declared' });
  }, MID_TIMEOUT);

  it('withdrawPlayerHorse: 접수 취소 후 다시 취소하면 not_declared, 없는 개최는 not_found', () => {
    const { state: racer, horseId } = makePlayerRacer(BASE);
    const assigned = assignTrainer(racer, horseId, trainerWithRoom(racer));
    if (!assigned.ok) throw new Error('assignTrainer 실패');
    const horse = assigned.state.horses[horseId];
    if (horse === undefined) throw new Error('말이 없다');
    const target = findOpenRace(assigned.state, horse);
    const declared = declarePlayerHorse(assigned.state, target.meetingId, target.raceId, horseId);
    if (!declared.ok) throw new Error('declare 실패');

    const withdrawn = withdrawPlayerHorse(declared.state, target.meetingId, target.raceId, horseId);
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    const race = withdrawn.state.seasonState.meetings
      .find((m) => m.id === target.meetingId)
      ?.races.find((r) => r.race.id === target.raceId);
    expect(race?.declarations.some((d) => d.horseId === horseId)).toBe(false);

    expect(withdrawPlayerHorse(withdrawn.state, target.meetingId, target.raceId, horseId)).toEqual({
      ok: false,
      error: 'not_declared',
    });
    expect(withdrawPlayerHorse(withdrawn.state, 'no-such-meeting', target.raceId, horseId)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('assignTrainer 실패 사유: not_found · not_player_horse · trainer_not_found · invalid_status · trainer_full', () => {
    const { state: racer, horseId } = makePlayerRacer(BASE);
    const trainerId = trainerWithRoom(racer);
    const aiHorseId = aiRacingHorseIds(racer)[0];
    if (aiHorseId === undefined) throw new Error('AI 말이 없다');
    const mareId = racer.owners[racer.playerOwnerId]?.horseIds.find((id) => racer.horses[id]?.status === 'broodmare');
    if (mareId === undefined) throw new Error('플레이어 번식마가 없다');

    expect(assignTrainer(racer, 'h-missing', trainerId)).toEqual({ ok: false, error: 'not_found' });
    expect(assignTrainer(racer, aiHorseId, trainerId)).toEqual({ ok: false, error: 'not_player_horse' });
    expect(assignTrainer(racer, horseId, 'tr-missing')).toEqual({ ok: false, error: 'trainer_not_found' });
    expect(assignTrainer(racer, mareId, trainerId)).toEqual({ ok: false, error: 'invalid_status' });

    const full = structuredClone(racer);
    const fullTrainer = full.trainers[trainerId];
    if (fullTrainer === undefined) throw new Error('조교사가 없다');
    fullTrainer.capacity = 0;
    expect(assignTrainer(full, horseId, trainerId)).toEqual({ ok: false, error: 'trainer_full' });
  });

  it('assignTrainer: 2세 yearling 은 조교사 배정과 함께 in_training 이 되고 이벤트가 남는다', () => {
    const { state: racer, horseId } = makePlayerRacer(BASE);
    const yearling = structuredClone(racer);
    const horse = yearling.horses[horseId];
    if (horse === undefined) throw new Error('말이 없다');
    horse.status = 'yearling';
    horse.birthYear = START_YEAR - 2;
    const result = assignTrainer(yearling, horseId, trainerWithRoom(yearling));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.horses[horseId]?.status).toBe('in_training');
    expect(result.events).toEqual([
      {
        type: 'horse_status_changed',
        horseId,
        from: 'yearling',
        to: 'in_training',
        date: { year: START_YEAR, week: 1 },
      },
    ]);
  });
});

describe('연도 전환 (createSeasonSystem)', () => {
  it('5a. points 챔피언은 포인트 1위(동점은 horseId 순), 보너스·이벤트, 리딩 빈 표, 오래된 결과 정리', () => {
    const draft = structuredClone(BASE);
    draft.seasonState.meetings = [];
    const [a, b, c] = aiRacingHorseIds(draft);
    if (a === undefined || b === undefined || c === undefined) throw new Error('AI 말이 부족하다');
    const [low, high] = [a, b].sort();
    if (low === undefined || high === undefined) throw new Error('정렬 실패');

    draft.seasonState.series[POINTS_ID] = {
      seriesId: POINTS_ID,
      year: START_YEAR,
      legWinners: {},
      points: { [high]: 10, [low]: 10, [c]: 4 },
      champion: null,
    };
    draft.seasonState.leading.jockey['some-jockey'] = {
      id: 'some-jockey',
      runners: 3,
      wins: 1,
      places: 1,
      groupWins: 0,
      earnings: 1000,
    };
    const championOwnerId = draft.horses[low]?.ownerId ?? null;
    if (championOwnerId === null) throw new Error('챔피언 마주가 없다');
    const fundsBefore = draft.owners[championOwnerId]?.funds ?? 0;

    const fakeResult = (year: number, raceId: string): RaceResult => ({
      raceId,
      racecourseId: 'ashcombe',
      date: { year, week: 5 },
      going: 'good' as Going,
      distance: 1609,
      seed: 1,
      winningTime: 100,
      sectionalMarks: [],
      runners: [],
    });
    draft.raceResults = [fakeResult(2023, 'old-2023'), fakeResult(2025, 'kept-2025'), fakeResult(START_YEAR, 'kept-2026')];

    const events = createSeasonSystem(SEASON_STATIC).run(draft, {
      date: { year: START_YEAR + 1, week: 1 },
      rng: createRng(SEED),
    });

    expect(draft.seasonState.year).toBe(START_YEAR + 1);
    expect(draft.seasonState.leading).toEqual(emptyLeadingTables());
    expect(draft.seasonState.series[POINTS_ID]?.champion).toBe(low);
    expect(draft.owners[championOwnerId]?.funds).toBe(fundsBefore + POINTS_BONUS);
    expect(events).toContainEqual({
      type: 'series_completed',
      seriesId: POINTS_ID,
      horseId: low,
      date: { year: START_YEAR + 1, week: 1 },
    });
    expect(draft.raceResults.map((r) => r.raceId)).toEqual(['kept-2025', 'kept-2026']);
  });

  it('5b. 52주 진행 후 2027년 1주 처리: 리딩 집계가 새해에 비워지고, points 챔피언 확정, 시즌 연도 갱신(수행 시간 출력)', () => {
    const systems = createGameSystems(STATIC_GAME);
    const t0 = Date.now();
    const yearEnd = step(BASE, YEAR_WEEKS);
    const t1 = Date.now();
    const newYear = advanceWeek(yearEnd, systems).state;
    const t2 = Date.now();
    console.log(`[season] 52주 진행 ${t1 - t0} ms, 2027년 1주 연도 전환 포함 진행 ${t2 - t1} ms (합 ${t2 - t0} ms)`);

    expect(yearEnd.date).toEqual({ year: START_YEAR + 1, week: 1 });
    expect(yearEnd.seasonState.year).toBe(START_YEAR);
    expect(totalRunners(yearEnd)).toBeGreaterThan(0);

    expect(newYear.date).toEqual({ year: START_YEAR + 1, week: 2 });
    expect(newYear.seasonState.year).toBe(START_YEAR + 1);
    expect(newYear.seasonState.lastPopulationYear).toBe(START_YEAR + 1);
    expect(newYear.seasonState.series[POINTS_ID]?.champion).not.toBeNull();
    // 2027년 1주에 뛴 레이스 집계만 남는다(2026년 전체 집계는 비워진다)
    expect(totalRunners(newYear)).toBeLessThan(totalRunners(yearEnd));
  }, LONG_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('새 시즌·초기화·플레이어 API 파일에 Math.random · Date.now 가 없다', () => {
    const files = [
      'src/engine/season/system.ts',
      'src/engine/season/player.ts',
      'src/engine/state/bootstrap.ts',
      'src/engine/state/systems.ts',
      'src/engine/world/populationSystem.ts',
    ];
    for (const file of files) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('Math.random');
      expect(text, file).not.toContain('Date.now');
    }
  });
});
