import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import {
  BACKWARD_FITNESS,
  INJURY_TABLE,
  MAX_FATIGUE_TO_RUN,
  SORE_SHINS_KNOCK_AGE,
} from '../../src/engine/config/conditioning';
import { FATIGUE_GAIN_BY_DISTANCE, FITNESS_LOSS_PER_RUN } from '../../src/engine/config/season';
import { getHorseWords, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { rollInjury, trainerReport, weeklyConditionInPlace } from '../../src/engine/horse/conditioning';
import type { TrainerReportKey } from '../../src/engine/horse/conditioning';
import { loadRacecourses } from '../../src/engine/course/load';
import { isEligible } from '../../src/engine/season/eligibility';
import { createSeasonSystem, type SeasonStaticData } from '../../src/engine/season/system';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear, nextDate } from '../../src/engine/time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  Injury,
  Race,
  Racecourse,
  RaceTemplate,
  Rng,
  SeriesDefinition,
  Trainer,
} from '../../src/engine/types';

const SEED = 20261011;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const MID_TIMEOUT = 120_000;
/** 시즌 통합 긴 진행 제한 시간(ms) */
const LONG_TIMEOUT = 120_000;
/** 몬테카를로: 말 수·주 수·출주 주기 */
const MC_HORSES = 2000;
const MC_WEEKS = 32;
const MC_RUN_EVERY = 3;
/** 몬테카를로 말 나이(4세) */
const MC_AGE = 4;

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

const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const TEMPLATES: RaceTemplate[] = [
  g1Template(G1_A_ID, 'ashcombe', 2012, { month: 4, weekOfMonth: 2 }, 'Test Group One Ashcombe'),
  g1Template(G1_B_ID, 'saint_ourens', 2000, { month: 6, weekOfMonth: 1 }, 'Test Group One Saint'),
];

const SERIES: SeriesDefinition[] = [
  {
    id: 'test-crown',
    nameKey: 'test.crown',
    kind: 'crown',
    legs: [G1_A_ID, G1_B_ID],
    winsRequired: 2,
    bonus: 100_000,
  },
  {
    id: 'test-points',
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: 50_000,
  },
];

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

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  words: getHorseWords(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const SEASON_STATIC: SeasonStaticData = { courses: COURSES, templates: TEMPLATES, series: SERIES };

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 공용 기준 상태(2026년 1주). 테스트는 이 값을 바꾸지 않는다(복제해서 쓴다) */
let BASE: GameState;

beforeAll(() => {
  BASE = boot(SEED);
}, MID_TIMEOUT);

let RACER_TEMPLATE: Horse | null = null;

/** 기준 상태의 3세 이상 AI 현역 말 하나(OR 있음). 한 번만 찾아 캐시한다 */
function racerTemplate(): Horse {
  if (RACER_TEMPLATE !== null) return structuredClone(RACER_TEMPLATE);
  const id = Object.keys(BASE.horses)
    .sort()
    .find((k) => {
      const h = BASE.horses[k];
      return h !== undefined && h.status === 'in_training' && h.ownerId !== null && h.ownerId !== BASE.playerOwnerId
        && ageInYear(h.birthYear, START_YEAR) >= 3 && h.officialRating !== null;
    });
  const h = id === undefined ? undefined : BASE.horses[id];
  if (h === undefined) throw new Error('테스트 전제 위반: 3세 이상 AI 현역마가 없다');
  RACER_TEMPLATE = structuredClone(h);
  return structuredClone(h);
}

/** 조건을 바꿀 수 있는 테스트용 말(조교사 없음, 기록 0, 체질·준비도·피로·정신 지정) */
function makeHorse(over: {
  fitness?: number;
  fatigue?: number;
  mental?: number;
  injury?: Injury | null;
  soundness?: number;
}): Horse {
  const h = racerTemplate();
  h.status = 'in_training';
  h.trainerId = null;
  h.record = { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 };
  h.soundness = over.soundness ?? 60;
  h.condition = {
    fitness: over.fitness ?? 60,
    fatigue: over.fatigue ?? 0,
    mental: over.mental ?? 70,
    injury: over.injury ?? null,
  };
  return h;
}

/** 조교사 테스트용 값. 기준 상태의 첫 조교사를 복제해 덮어쓴다 */
function makeTrainer(over: Partial<Trainer>): Trainer {
  const first = Object.keys(BASE.trainers).sort()[0];
  const t = first === undefined ? undefined : BASE.trainers[first];
  if (t === undefined) throw new Error('테스트 전제 위반: 조교사가 없다');
  return { ...structuredClone(t), skill: 50, facilityGrade: 3, juvenileFocus: 0.5, ...over };
}

/** 조교만 n 주 진행(출주 없음, 부상 없이 가정은 호출 측이 확인) */
function trainWeeks(horse: Horse, trainer: Trainer | undefined, age: number, weeks: number, rng: Rng): (Injury | null)[] {
  const out: (Injury | null)[] = [];
  for (let w = 0; w < weeks; w++) {
    out.push(weeklyConditionInPlace(horse, trainer, age, false, rng));
  }
  return out;
}

/** 출주 주기(RUN_EVERY 주마다)와 출주 피로·준비도 감소를 흉내 낸 한 말의 1년 진행 */
function simulateSeason(horse: Horse, trainer: Trainer | undefined, rng: Rng): { injuries: Injury[] } {
  const raceGain = FATIGUE_GAIN_BY_DISTANCE.find((b) => b.maxDistance === 2414)?.gain ?? 0;
  const injuries: Injury[] = [];
  for (let w = 0; w < MC_WEEKS; w++) {
    const ran = w % MC_RUN_EVERY === 0 && horse.condition.injury === null;
    if (ran) {
      horse.condition.fatigue = Math.min(100, horse.condition.fatigue + raceGain);
      horse.condition.fitness = Math.max(0, horse.condition.fitness - FITNESS_LOSS_PER_RUN);
    }
    const inj = weeklyConditionInPlace(horse, trainer, MC_AGE, ran, rng);
    if (inj !== null) injuries.push(inj);
  }
  return { injuries };
}

/** 몬테카를로: 체질 soundness 인 말 n두의 시즌 부상률·장기 부상 비율 */
function injuryStats(soundness: number, horses: number, seed: number): { rate: number; longShare: number; injuries: number } {
  const rng = createRng(seed);
  const trainer = makeTrainer({ skill: 50, facilityGrade: 3, juvenileFocus: 0.5 });
  let injuredHorses = 0;
  let injuries = 0;
  let longInjuries = 0;
  for (let i = 0; i < horses; i++) {
    const horse = makeHorse({ fitness: 60, fatigue: 0, mental: 70, soundness });
    const { injuries: list } = simulateSeason(horse, trainer, rng);
    if (list.length > 0) injuredHorses++;
    injuries += list.length;
    longInjuries += list.filter((x) => x.kind === 'tendon' || x.kind === 'fracture').length;
  }
  return {
    rate: injuredHorses / horses,
    longShare: injuries === 0 ? 0 : longInjuries / injuries,
    injuries,
  };
}

/** 주 진행 + 이벤트 수집 + AI 말이 처음 다친 횟수 계측 */
function runCollect(state: GameState, weeks: number): { state: GameState; events: GameEvent[]; aiInjured: Set<HorseId> } {
  const systems = createGameSystems(STATIC_GAME);
  let cur = state;
  const events: GameEvent[] = [];
  const aiInjured = new Set<HorseId>();
  for (let i = 0; i < weeks; i++) {
    const res = advanceWeek(cur, systems);
    events.push(...res.events);
    for (const [id, after] of Object.entries(res.state.horses)) {
      const before = cur.horses[id];
      if (after.ownerId !== cur.playerOwnerId && before !== undefined && before.condition.injury === null && after.condition.injury !== null) {
        aiInjured.add(id);
      }
    }
    cur = res.state;
  }
  return { state: cur, events, aiInjured };
}

describe('weeklyConditionInPlace 단위', () => {
  it('1. 같은 시드면 같은 결과(말 상태·부상 목록이 toEqual)', () => {
    const runOnce = (): { horse: Horse; injuries: (Injury | null)[] } => {
      const horse = makeHorse({ fitness: 50, fatigue: 20, soundness: 40 });
      const trainer = makeTrainer({ skill: 70, facilityGrade: 4, juvenileFocus: 0.3 });
      const rng = createRng(SEED);
      const injuries: (Injury | null)[] = [];
      for (let w = 0; w < 40; w++) {
        injuries.push(weeklyConditionInPlace(horse, trainer, 4, w % 3 === 0, rng));
      }
      return { horse, injuries };
    };
    expect(runOnce()).toEqual(runOnce());
  });

  it('2a. fitness 40 인 4세 말(부상 없음·체질 100)은 skill 50 조교사에서 8주 안에 85 이상', () => {
    const horse = makeHorse({ fitness: 40, soundness: 100 });
    const trainer = makeTrainer({ skill: 50 });
    const results = trainWeeks(horse, trainer, 4, 8, createRng(SEED));
    expect(results.every((r) => r === null)).toBe(true);
    expect(horse.condition.fitness).toBeGreaterThanOrEqual(85);
  });

  it('2b. 같은 기간 skill 90 조교사 쪽이 skill 10 쪽보다 준비도가 높다', () => {
    const high = makeHorse({ fitness: 40, soundness: 100 });
    const low = makeHorse({ fitness: 40, soundness: 100 });
    const rngHigh = trainWeeks(high, makeTrainer({ skill: 90 }), 4, 8, createRng(SEED));
    const rngLow = trainWeeks(low, makeTrainer({ skill: 10 }), 4, 8, createRng(SEED));
    expect(rngHigh.every((r) => r === null)).toBe(true);
    expect(rngLow.every((r) => r === null)).toBe(true);
    expect(high.condition.fitness).toBeGreaterThan(low.condition.fitness);
  });

  it('2c. 2세는 juvenileFocus 0.9 조교사 쪽이 0.1 쪽보다 빨리 85 에 닿는다', () => {
    const weeksTo85 = (focus: number): number => {
      const horse = makeHorse({ fitness: 40, soundness: 100 });
      const trainer = makeTrainer({ skill: 50, juvenileFocus: focus });
      const rng = createRng(SEED);
      for (let w = 1; w <= 30; w++) {
        const inj = weeklyConditionInPlace(horse, trainer, 2, false, rng);
        if (inj !== null) throw new Error(`테스트 전제 위반: 2세 말이 ${w}주차에 부상`);
        if (horse.condition.fitness >= 85) return w;
      }
      return Number.POSITIVE_INFINITY;
    };
    const fast = weeksTo85(0.9);
    const slow = weeksTo85(0.1);
    expect(fast).toBeLessThan(slow);
    expect(Number.isFinite(fast)).toBe(true);
  });

  it('4a. 부상 중 말: weeksOut 이 매주 1 줄고 0 이 되면 injury 가 null', () => {
    const horse = makeHorse({ fitness: 80, injury: { kind: 'knock', weeksOut: 3 } });
    const trainer = makeTrainer({});
    const rng = createRng(SEED);
    const trail: (number | null)[] = [];
    for (let w = 0; w < 3; w++) {
      expect(weeklyConditionInPlace(horse, trainer, 4, false, rng)).toBeNull();
      trail.push(horse.condition.injury?.weeksOut ?? null);
    }
    expect(trail).toEqual([2, 1, null]);
    expect(horse.condition.injury).toBeNull();
  });

  it('4b. 부상 기간 준비도는 내려가고 하한 30 에서 멈춘다', () => {
    const horse = makeHorse({ fitness: 80, injury: { kind: 'tendon', weeksOut: 12 } });
    const trainer = makeTrainer({});
    const rng = createRng(SEED);
    const series: number[] = [horse.condition.fitness];
    for (let w = 0; w < 12; w++) {
      weeklyConditionInPlace(horse, trainer, 4, false, rng);
      series.push(horse.condition.fitness);
    }
    for (let i = 1; i < series.length; i++) {
      expect(series[i] ?? 0).toBeLessThanOrEqual(series[i - 1] ?? 0);
    }
    expect(Math.min(...series)).toBe(30);
    expect(series[series.length - 1]).toBe(30);
    expect(horse.condition.injury).toBeNull();
  });

  it('rollInjury: 4세 이상은 sore_shins 가 나오지 않고, 기간은 종류별 범위 안이다', () => {
    const rng = createRng(SEED);
    const range = new Map(INJURY_TABLE.map((e) => [e.kind, e] as const));
    let soreAt3 = 0;
    for (let i = 0; i < 2000; i++) {
      const old = rollInjury(SORE_SHINS_KNOCK_AGE, rng);
      expect(old.kind).not.toBe('sore_shins');
      const e = range.get(old.kind);
      expect(e).toBeDefined();
      expect(old.weeksOut).toBeGreaterThanOrEqual(e?.minWeeks ?? Number.POSITIVE_INFINITY);
      expect(old.weeksOut).toBeLessThanOrEqual(e?.maxWeeks ?? Number.NEGATIVE_INFINITY);

      const young = rollInjury(3, rng);
      if (young.kind === 'sore_shins') soreAt3++;
    }
    expect(soreAt3).toBeGreaterThan(0);
  });
});

describe('isEligible 피로 조건 (M3-C1)', () => {
  it('4c. 부상 중이면 false, fatigue 46 은 false, 45 는 true (다른 조건 충족 시)', () => {
    const base = BASE.seasonState;
    const horse = makeHorse({ fitness: 80, mental: 70 });
    horse.ownerId = BASE.playerOwnerId;
    let found: { race: Race; date: GameDate } | undefined;
    for (const m of BASE.seasonState.meetings) {
      for (const sr of m.races) {
        if (found === undefined && isEligible(horse, sr.race, m.date, base)) found = { race: sr.race, date: m.date };
      }
    }
    if (found === undefined) throw new Error('테스트 전제 위반: 출주 가능한 레이스가 없다');

    expect(isEligible(horse, found.race, found.date, base)).toBe(true);

    horse.condition.injury = { kind: 'knock', weeksOut: 2 };
    expect(isEligible(horse, found.race, found.date, base)).toBe(false);
    horse.condition.injury = null;

    horse.condition.fatigue = MAX_FATIGUE_TO_RUN + 1;
    expect(isEligible(horse, found.race, found.date, base)).toBe(false);
    horse.condition.fatigue = MAX_FATIGUE_TO_RUN;
    expect(isEligible(horse, found.race, found.date, base)).toBe(true);
  });
});

describe('trainerReport (M3-C1)', () => {
  it('6. 합성 말 7개 사례가 7개 키를 각각 낸다', () => {
    const cases: [Horse, TrainerReportKey][] = [
      [makeHorse({ fitness: 80, injury: { kind: 'knock', weeksOut: 2 } }), 'injured'],
      [makeHorse({ fitness: 90, fatigue: 50 }), 'tired'],
      [makeHorse({ fitness: 60, mental: 30 }), 'flat'],
      [makeHorse({ fitness: BACKWARD_FITNESS - 15 }), 'backward'],
      [makeHorse({ fitness: 60 }), 'needs_run'],
      [makeHorse({ fitness: 78 }), 'nearly_ready'],
      [makeHorse({ fitness: 90 }), 'peak'],
    ];
    const keys = cases.map(([h]) => trainerReport(h));
    expect(keys).toEqual(['injured', 'tired', 'flat', 'backward', 'needs_run', 'nearly_ready', 'peak']);
    expect(new Set(keys).size).toBe(7);
  });
});

describe('부상률 몬테카를로 (수용 기준 3, 시드 고정)', () => {
  it('3a. soundness 60, 32주, 3주마다 출주, 2,000두: 시즌 중 1회 이상 부상 6~15%, tendon+fracture ≤ 25%', () => {
    const stats = injuryStats(60, MC_HORSES, SEED);
    const again = injuryStats(60, MC_HORSES, SEED);
    expect(again).toEqual(stats);
    console.log(
      `[conditioning] soundness 60 부상률 ${(stats.rate * 100).toFixed(2)}%, 부상 ${stats.injuries}건, tendon+fracture 비율 ${(stats.longShare * 100).toFixed(2)}%`,
    );
    expect(stats.rate).toBeGreaterThanOrEqual(0.06);
    expect(stats.rate).toBeLessThanOrEqual(0.15);
    expect(stats.longShare).toBeLessThanOrEqual(0.25);
  }, MID_TIMEOUT);

  it('3b. soundness 30 집단의 부상률은 soundness 85 집단보다 높다', () => {
    const weak = injuryStats(30, MC_HORSES, SEED);
    const sound = injuryStats(85, MC_HORSES, SEED);
    console.log(
      `[conditioning] soundness 30 부상률 ${(weak.rate * 100).toFixed(2)}% / soundness 85 부상률 ${(sound.rate * 100).toFixed(2)}%`,
    );
    expect(weak.rate).toBeGreaterThan(sound.rate);
  }, MID_TIMEOUT);
});

describe('시즌 통합 (createGameSystems + advanceWeek)', () => {
  it('1b. 같은 시드로 8주 진행을 두 번 하면 최종 state 가 toEqual 이다', () => {
    const a = runCollect(boot(SEED), 8).state;
    const b = runCollect(boot(SEED), 8).state;
    expect(b).toEqual(a);
  }, MID_TIMEOUT);

  it('7. 16주 진행: horse_injured 는 플레이어 말에만, AI 말 부상은 1두 이상', () => {
    const state = structuredClone(BASE);
    const { events, aiInjured } = runCollect(state, 16);

    const injuredEvents = events.filter((e) => e.type === 'horse_injured');
    for (const e of injuredEvents) {
      if (e.type !== 'horse_injured') continue;
      expect(state.horses[e.horseId]?.ownerId).toBe(state.playerOwnerId);
    }
    expect(aiInjured.size).toBeGreaterThanOrEqual(1);
  }, LONG_TIMEOUT);

  it('7b. 52주 진행(수행 시간 출력): 수치 범위 유지, horse_injured 는 플레이어 말만', () => {
    const systems = createGameSystems(STATIC_GAME);
    const events: GameEvent[] = [];
    let state = structuredClone(BASE);
    const t0 = Date.now();
    for (let i = 0; i < 52; i++) {
      const res = advanceWeek(state, systems);
      events.push(...res.events);
      state = res.state;
    }
    const ms = Date.now() - t0;
    console.log(`[conditioning] 52주 진행 ${ms} ms (이벤트 ${events.length}건)`);

    for (const h of Object.values(state.horses)) {
      const c = h.condition;
      expect(c.fitness).toBeGreaterThanOrEqual(0);
      expect(c.fitness).toBeLessThanOrEqual(100);
      expect(c.fatigue).toBeGreaterThanOrEqual(0);
      expect(c.fatigue).toBeLessThanOrEqual(100);
      expect(c.mental).toBeGreaterThanOrEqual(0);
      expect(c.mental).toBeLessThanOrEqual(100);
    }
    for (const e of events) {
      if (e.type !== 'horse_injured') continue;
      expect(state.horses[e.horseId]?.ownerId).toBe(state.playerOwnerId);
    }
  }, LONG_TIMEOUT);
});

describe('플레이어 말 부상 이벤트 (season 시스템 직접 실행)', () => {
  it('8. 플레이어 말 부상은 horse_injured 로 나오고, AI 말 부상은 이벤트가 없다', () => {
    const draft = structuredClone(BASE);
    const aiIds = Object.keys(draft.horses)
      .sort()
      .filter((id) => {
        const h = draft.horses[id];
        return h !== undefined && h.status === 'in_training' && h.ownerId !== null && h.ownerId !== draft.playerOwnerId;
      })
      .slice(0, 20);
    if (aiIds.length < 20) throw new Error('테스트 전제 위반: AI 현역마가 20두 없다');

    const playerIds = new Set<HorseId>();
    const horses: Record<HorseId, Horse> = {};
    aiIds.forEach((id, i) => {
      const h = draft.horses[id];
      if (h === undefined) return;
      h.soundness = 0;
      h.trainerId = null;
      if (i < 10) {
        h.ownerId = draft.playerOwnerId;
        playerIds.add(id);
      }
      horses[id] = h;
    });
    draft.horses = horses;
    draft.seasonState.lastRun = {};

    const system = createSeasonSystem(SEASON_STATIC);
    const rng = createRng(SEED);
    const aiInjured = new Set<HorseId>();
    const events: GameEvent[] = [];
    let date: GameDate = { year: START_YEAR, week: 2 };
    for (let w = 0; w < 30; w++) {
      for (const h of Object.values(draft.horses)) {
        if (h.status === 'in_training') h.condition.fatigue = 100;
      }
      draft.seasonState.meetings = [];
      const before: Record<HorseId, Injury | null> = {};
      for (const [id, h] of Object.entries(draft.horses)) before[id] = h.condition.injury;
      events.push(...system.run(draft, { date, rng }));
      for (const [id, h] of Object.entries(draft.horses)) {
        if (h.ownerId !== draft.playerOwnerId && before[id] === null && h.condition.injury !== null) aiInjured.add(id);
      }
      date = nextDate(date);
    }

    const injuredEvents = events.filter((e): e is Extract<GameEvent, { type: 'horse_injured' }> => e.type === 'horse_injured');
    expect(injuredEvents.length).toBeGreaterThanOrEqual(1);
    for (const e of injuredEvents) {
      expect(playerIds.has(e.horseId)).toBe(true);
    }
    expect(aiInjured.size).toBeGreaterThanOrEqual(1);
  }, MID_TIMEOUT);
});

describe('엔진 순수성 (M3-C1 신규 파일)', () => {
  it('config/conditioning.ts · horse/conditioning.ts · season/system.ts 에 Math.random · Date.now 가 없다', () => {
    const files = [
      'src/engine/config/conditioning.ts',
      'src/engine/horse/conditioning.ts',
      'src/engine/season/system.ts',
    ];
    for (const file of files) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('Math.random');
      expect(text, file).not.toContain('Date.now');
    }
  });
});
