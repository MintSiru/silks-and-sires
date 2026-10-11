import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { createRng } from '../../src/engine/rng';
import { ODDS_LADDER, SAMPLE_ABILITY_MAX, SAMPLE_ABILITY_MIN } from '../../src/engine/config/raceday';
import { SIMULATE_GRADES } from '../../src/engine/config/season';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { loadRacecourses } from '../../src/engine/course/load';
import { runRace } from '../../src/engine/race/runRace';
import { sectionalMarks } from '../../src/engine/race/results';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import {
  bootstrapRacingPopulation,
  racingHorseIds,
  type RacingPopulationStaticData,
} from '../../src/engine/world/population';
import { buildWeekMeetings } from '../../src/engine/season/meetings';
import { weekOfSlot, slotOfWeek } from '../../src/engine/season/schedule';
import { declareAiRunners } from '../../src/engine/season/declarations';
import type { CourseCountryLookup } from '../../src/engine/season/eligibility';
import { summarizeRace } from '../../src/engine/season/summary';
import { applyRaceResult } from '../../src/engine/season/apply';
import { runMeeting, type RunMeetingContext } from '../../src/engine/season/raceday';
import { buildEntries, drawStalls, type EntryRequest } from '../../src/engine/race/setup';
import {
  formatOdds,
  impliedProbability,
  marketProbabilities,
  oddsToDecimal,
  priceField,
  probabilityToOdds,
} from '../../src/engine/race/odds';
import { generateSampleField, type NamePool, type SampleField } from '../../src/engine/race/sampleField';
import type {
  Abilities,
  Declaration,
  FractionalOdds,
  GameEvent,
  GameState,
  Meeting,
  Race,
  RaceResult,
  RaceTemplate,
  Racecourse,
  RunnerResult,
  ScheduledRace,
  SeriesDefinition,
} from '../../src/engine/types';

const SILKS = { primary: '#c8102e', secondary: '#ffffff', pattern: 'hoops' as const };

function makeRequests(weights: number[], allowances: number[] = weights.map(() => 0)): EntryRequest[] {
  return weights.map((w, i) => ({
    horseId: `h-${i}`,
    jockeyId: `j-${i}`,
    tactic: 'midfield',
    silks: SILKS,
    isPlayer: i === 0,
    weightLb: w,
    jockeyAllowanceLb: allowances[i] ?? 0,
  }));
}

function inLadder(o: FractionalOdds): boolean {
  return ODDS_LADDER.some(([n, d]) => n === o.num && d === o.den);
}

const NAME_POOL: NamePool = {
  horses: Array.from({ length: 30 }, (_, i) => `Horse ${i + 1}`),
  jockeys: Array.from({ length: 30 }, (_, i) => `Jockey ${i + 1}`),
  owners: Array.from({ length: 30 }, (_, i) => `Owner ${i + 1}`),
};

describe('수용 기준 1: 출주 준비', () => {
  it('drawStalls(rng, 20) 은 1..20 의 순열이고 n<1 이면 RangeError', () => {
    const draw = drawStalls(createRng('stalls-1'), 20);
    expect([...draw].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(() => drawStalls(createRng(1), 0)).toThrow(RangeError);
  });

  it('buildEntries: 순서 = 요청 순서, 마번 1..n 순열, 최고 중량 = 마번 1, 감량 반영, odds null', () => {
    // 감량 전 중량: idx2=130, idx0=126, idx3=126, idx1=124. 마번은 감량 전 기준 내림차순.
    // 126 동률은 요청 index 오름차순(idx0 이 먼저). 감량은 마번에 영향 없음.
    const requests = makeRequests([126, 124, 130, 126], [0, 3, 0, 0]);
    const entries = buildEntries(createRng('entries-1'), requests);

    expect(entries).toHaveLength(4);
    entries.forEach((e, i) => expect(e.horseId).toBe(`h-${i}`));
    expect(entries.map((e) => e.saddleCloth).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(entries[2]?.saddleCloth).toBe(1);
    expect(entries[0]?.saddleCloth).toBe(2);
    expect(entries[3]?.saddleCloth).toBe(3);
    expect(entries[1]?.saddleCloth).toBe(4);
    expect(entries[1]?.weightLb).toBe(124 - 3);
    expect(entries[0]?.weightLb).toBe(126);
    expect(entries.every((e) => e.odds === null)).toBe(true);
    expect(entries.map((e) => e.draw).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(entries.map((e) => e.isPlayer)).toEqual([true, false, false, false]);
  });

  it('buildEntries: horseId 중복이거나 요청이 비면 throw', () => {
    const dup = makeRequests([120, 121]);
    dup[1] = { ...dup[1]!, horseId: 'h-0' };
    expect(() => buildEntries(createRng(1), dup)).toThrow();
    expect(() => buildEntries(createRng(1), [])).toThrow();
  });
});

describe('수용 기준 2: 같은 시드 = 같은 추첨', () => {
  it('같은 시드로 buildEntries 두 번 → 같은 draw', () => {
    const requests = makeRequests([120, 122, 124, 126, 128, 130, 118, 116]);
    const a = buildEntries(createRng('seed-x'), requests).map((e) => e.draw);
    const b = buildEntries(createRng('seed-x'), requests).map((e) => e.draw);
    expect(a).toEqual(b);
  });

  it('다른 시드 10개 중 적어도 하나는 draw 가 다르다', () => {
    const requests = makeRequests([120, 122, 124, 126, 128, 130]);
    const draws = new Set<string>();
    for (let s = 1; s <= 10; s++) {
      draws.add(buildEntries(createRng(s), requests).map((e) => e.draw).join(','));
    }
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe('수용 기준 3: 시장 확률', () => {
  it('합 = 1 (±1e-9), 빈 배열이면 []', () => {
    const p = marketProbabilities(createRng('mkt-1'), [0, 1, 2, -1, 0.5]);
    const sum = p.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
    expect(marketProbabilities(createRng(1), [])).toEqual([]);
  });

  it('+3초 강한 말이 100회 중 95회 이상 확률 최대', () => {
    const strengths = [3, 0, 0, 0, 0];
    let top = 0;
    for (let s = 0; s < 100; s++) {
      const p = marketProbabilities(createRng(`top-${s}`), strengths);
      const max = Math.max(...p);
      if (p[0] === max) top++;
    }
    expect(top).toBeGreaterThanOrEqual(95);
  });
});

describe('수용 기준 4: 확률 → 분수 오즈', () => {
  it('대표 값 변환 (overround 1)', () => {
    expect(probabilityToOdds(0.5, 1)).toEqual({ num: 1, den: 1 });
    expect(formatOdds(probabilityToOdds(0.5, 1))).toBe('Evs');
    expect(probabilityToOdds(0.2857, 1)).toEqual({ num: 5, den: 2 });
    expect(formatOdds(probabilityToOdds(0.2857, 1))).toBe('5/2');
    expect(probabilityToOdds(0.99, 1)).toEqual({ num: 1, den: 5 });
  });

  it('p=0.001 → 사다리 마지막 3칸 안 (200/1 근처)', () => {
    const o = probabilityToOdds(0.001);
    const tail = ODDS_LADDER.slice(-3).map(([n, d]) => `${n}/${d}`);
    expect(tail).toContain(`${o.num}/${o.den}`);
  });

  it('모든 결과가 ODDS_LADDER 안의 값 (넓은 p 스윕, 기본 overround)', () => {
    for (let p = 0.0005; p <= 1; p += 0.0137) {
      expect(inLadder(probabilityToOdds(p))).toBe(true);
    }
  });

  it('반환은 새 객체 (사다리 원본 공유 없음)', () => {
    const a = probabilityToOdds(0.5, 1);
    a.num = 999;
    expect(probabilityToOdds(0.5, 1)).toEqual({ num: 1, den: 1 });
  });

  it('oddsToDecimal, impliedProbability 기본 값', () => {
    expect(oddsToDecimal({ num: 1, den: 1 })).toBe(2);
    expect(impliedProbability({ num: 1, den: 1 })).toBe(0.5);
    expect(impliedProbability({ num: 5, den: 2 })).toBeCloseTo(2 / 7, 12);
  });
});

describe('수용 기준 5: 10두 필드의 오버라운드', () => {
  it('impliedProbability 합이 여러 시드에서 1.0~1.4', () => {
    const strengths = [4, 3.5, 3, 2.5, 2, 1, 0.5, 0, -1, -2];
    for (let s = 1; s <= 20; s++) {
      const odds = priceField(createRng(`field-${s}`), strengths);
      expect(odds).toHaveLength(10);
      const total = odds.reduce((acc, o) => acc + impliedProbability(o), 0);
      expect(total).toBeGreaterThanOrEqual(1.0);
      expect(total).toBeLessThanOrEqual(1.4);
      expect(odds.every(inLadder)).toBe(true);
    }
  });
});

describe('수용 기준 6: 샘플 출주마 생성', () => {
  it('size 20: 능력치 1~100, 이름 중복 없음, id 고유, 요청·주자 수 일치', () => {
    const field = generateSampleField(createRng('sample-1'), {
      size: 20,
      distance: 1600,
      surface: 'turf',
      year: 2026,
      namePool: NAME_POOL,
    });
    expect(field.runners).toHaveLength(20);
    expect(field.requests).toHaveLength(20);
    expect(field.ownerNames).toHaveLength(20);

    for (const r of field.runners) {
      for (const v of Object.values(r.horse.ability)) {
        expect(v).toBeGreaterThanOrEqual(SAMPLE_ABILITY_MIN);
        expect(v).toBeLessThanOrEqual(SAMPLE_ABILITY_MAX);
      }
      expect(r.jockey.skill).toBeGreaterThanOrEqual(SAMPLE_ABILITY_MIN);
      expect(r.jockey.skill).toBeLessThanOrEqual(SAMPLE_ABILITY_MAX);
    }

    const horseNames = field.runners.map((r) => r.horse.name);
    const jockeyNames = field.runners.map((r) => r.jockey.name);
    const allNames = [...horseNames, ...jockeyNames, ...field.ownerNames];
    expect(new Set(horseNames).size).toBe(20);
    expect(new Set(jockeyNames).size).toBe(20);
    expect(new Set(field.ownerNames).size).toBe(20);
    expect(new Set(allNames).size).toBe(allNames.length);

    const horseIds = field.runners.map((r) => r.horse.id);
    const jockeyIds = field.runners.map((r) => r.jockey.id);
    expect(new Set(horseIds).size).toBe(20);
    expect(new Set(jockeyIds).size).toBe(20);
    expect(field.requests.map((r) => r.horseId)).toEqual(horseIds);
    expect(field.requests.map((r) => r.jockeyId)).toEqual(jockeyIds);
  });

  it('3000m 평균 stamina 가 1200m 보다 25 이상 높다 (같은 시드 쌍 20회)', () => {
    let sumShort = 0;
    let sumLong = 0;
    let count = 0;
    for (let s = 0; s < 20; s++) {
      const base = { size: 20, surface: 'turf' as const, year: 2026, namePool: NAME_POOL };
      const short = generateSampleField(createRng(`st-${s}`), { ...base, distance: 1200 });
      const long = generateSampleField(createRng(`st-${s}`), { ...base, distance: 3000 });
      for (const r of short.runners) {
        sumShort += r.horse.ability.stamina;
        count++;
      }
      for (const r of long.runners) sumLong += r.horse.ability.stamina;
    }
    const avgShort = sumShort / count;
    const avgLong = sumLong / count;
    expect(avgLong - avgShort).toBeGreaterThanOrEqual(25);
  });

  it('이름 풀이 size 보다 작으면 RangeError, size < 1 도 RangeError', () => {
    const small: NamePool = { horses: ['a'], jockeys: ['b'], owners: ['c'] };
    expect(() =>
      generateSampleField(createRng(1), { size: 5, distance: 1200, surface: 'turf', year: 2026, namePool: small }),
    ).toThrow(RangeError);
    expect(() =>
      generateSampleField(createRng(1), { size: 0, distance: 1200, surface: 'turf', year: 2026, namePool: NAME_POOL }),
    ).toThrow(RangeError);
  });

  it('같은 rng 상태 + 같은 opts → 깊은 비교로 같은 결과', () => {
    const opts = { size: 12, distance: 2000, surface: 'aw' as const, year: 2026, namePool: NAME_POOL, playerIndex: 3 };
    const a = generateSampleField(createRng('deep'), opts);
    const b = generateSampleField(createRng('deep'), opts);
    expect(a).toEqual(b);
    expect(a.requests[3]?.isPlayer).toBe(true);
    expect(a.requests.filter((r) => r.isPlayer)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// M3-A6b: 개최일 실행 · 요약 모드 · 결과 반영
// ---------------------------------------------------------------------------

const RUN_SEED = 20261011;
const RUN_YEAR = 2026;
const RUN_SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const RUN_COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const RUN_JUNE_WEEK = weekOfSlot({ month: 6, weekOfMonth: 1 });
const RUN_GROUP_ID = 'run-test-group-g3';
const RUN_HANDICAP_ID = 'run-test-handicap-c4';

const runLookupCountry: CourseCountryLookup = (id) => RUN_COURSES.find((c) => c.id === id)?.country;

function runCourse(id: string): Racecourse {
  const c = RUN_COURSES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`fixture 에 ${id} 없음`);
  return c;
}

function runLayout(course: Racecourse, distance: number): string {
  const cd = course.distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`${course.id} 에 ${distance}m 없음`);
  return cd.layoutId;
}

function bootRun(seed = RUN_SEED): GameState {
  const base = createNewGame({ seed, playerName: 'Test Owner', silks: { ...RUN_SILKS } });
  const withPeople = bootstrapPeople(base, getPeopleData(), createRng(seed));
  const worldData: WorldStaticData = {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    words: getHorseWords(),
  };
  const withWorld = bootstrapWorld(withPeople, worldData, createRng(seed + 1));
  const popData: RacingPopulationStaticData = { stallionRecords: getStallionRecords(), words: getHorseWords() };
  return bootstrapRacingPopulation(withWorld, popData, createRng(seed + 2));
}

function runGroupTemplate(): RaceTemplate {
  const course = runCourse('saint_ourens');
  return {
    id: RUN_GROUP_ID,
    name: 'Test Group Three',
    racecourseId: course.id,
    distance: 2000,
    layoutId: runLayout(course, 2000),
    kind: 'group',
    grade: 'G3',
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
    prizeMoney: [60000, 20000, 10000],
    maxRunners: 14,
    schedule: slotOfWeek(RUN_JUNE_WEEK),
    cardOrder: 1,
    tags: [],
  };
}

function runHandicapTemplate(): RaceTemplate {
  const course = runCourse('ashcombe');
  return {
    id: RUN_HANDICAP_ID,
    name: 'Test Handicap Class Four',
    racecourseId: course.id,
    distance: 1207,
    layoutId: runLayout(course, 1207),
    kind: 'handicap',
    grade: null,
    raceClass: 4,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: 60,
      ratingMax: 90,
      weightSystem: 'handicap',
      baseWeightLb: 133,
    },
    prizeMoney: [15000, 6000],
    maxRunners: 18,
    schedule: slotOfWeek(RUN_JUNE_WEEK),
    cardOrder: 2,
    tags: [],
  };
}

function runJuneMeetings(seed: number): Meeting[] {
  return buildWeekMeetings({
    date: { year: RUN_YEAR, week: RUN_JUNE_WEEK },
    templates: [runGroupTemplate(), runHandicapTemplate()],
    courses: RUN_COURSES,
    rng: createRng(seed),
    nextGeneratedRace: 1,
  }).meetings;
}

function closedCount(m: Meeting): number {
  return m.races.filter((sr) => sr.status === 'closed').length;
}

/** 확정 선언이 가장 많은 개최일 */
function busiestMeeting(meetings: readonly Meeting[]): Meeting {
  const first = meetings[0];
  if (first === undefined) throw new Error('개최일이 없다');
  return meetings.reduce((best, m) => (closedCount(m) > closedCount(best) ? m : best), first);
}

function ownerFundsTotal(state: GameState): number {
  return Object.values(state.owners).reduce((sum, o) => sum + o.funds, 0);
}

function sumLeadingWins(table: Record<string, { wins: number }>): number {
  return Object.values(table).reduce((sum, e) => sum + e.wins, 0);
}

function sumLeadingEarnings(table: Record<string, { earnings: number }>): number {
  return Object.values(table).reduce((sum, e) => sum + e.earnings, 0);
}

function boostAbilities(a: Abilities, d: number): Abilities {
  const cap = (v: number): number => Math.min(SAMPLE_ABILITY_MAX, v + d);
  return {
    speed: cap(a.speed),
    stamina: cap(a.stamina),
    acceleration: cap(a.acceleration),
    guts: cap(a.guts),
    power: cap(a.power),
  };
}

/** RaceResult 형식 검증(착순·착차·구간·번호 일관성) */
function expectValidRaceResult(result: RaceResult, race: Race, field: SampleField): void {
  const n = field.runners.length;
  expect(result.raceId).toBe(race.id);
  expect(result.racecourseId).toBe(race.racecourseId);
  expect(result.distance).toBe(race.distance);
  expect(result.sectionalMarks).toEqual(sectionalMarks(race.distance));
  expect(result.runners).toHaveLength(n);

  const sortedSaddles = result.runners.map((r) => r.saddleCloth).sort((a, b) => a - b);
  expect(sortedSaddles).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  const sortedDraws = result.runners.map((r) => r.draw).sort((a, b) => a - b);
  expect(sortedDraws).toEqual(Array.from({ length: n }, (_, i) => i + 1));

  const winner = result.runners[0];
  expect(winner?.position).toBe(1);
  expect(winner?.margin).toBeNull();
  expect(result.winningTime).toBe(winner?.finishTime);
  expect(winner?.performanceFigure).toBe(0);

  result.runners.forEach((r: RunnerResult, i: number) => {
    expect(r.odds).not.toBeNull();
    expect(r.sectionals).toHaveLength(result.sectionalMarks.length + 1);
    const sum = r.sectionals.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(r.finishTime, 6);
    if (i > 0) {
      const prev = result.runners[i - 1];
      expect(r.finishTime).toBeGreaterThanOrEqual(prev?.finishTime ?? 0);
      expect(r.position).toBeGreaterThanOrEqual(prev?.position ?? 0);
    }
  });
}

describe('M3-A6b 개최일 실행 · 결과 반영', () => {
  let state: GameState;
  let declared: Meeting[];
  let ctx: RunMeetingContext;

  beforeAll(() => {
    state = bootRun();
    declared = declareAiRunners(state, runJuneMeetings(RUN_SEED), createRng(RUN_SEED + 7), runLookupCountry);
    ctx = { courses: RUN_COURSES, series: [] };
  });

  it('1. 같은 시드면 runMeeting 의 state·results·events·meeting 이 toEqual 이고, 입력은 바뀌지 않는다', () => {
    const meeting = busiestMeeting(declared);
    const before = structuredClone(state);
    const beforeMeeting = structuredClone(meeting);

    const a = runMeeting(state, meeting, ctx, createRng(RUN_SEED + 11));
    const b = runMeeting(state, meeting, ctx, createRng(RUN_SEED + 11));

    expect(a.state).toEqual(b.state);
    expect(a.results).toEqual(b.results);
    expect(a.events).toEqual(b.events);
    expect(a.meeting).toEqual(b.meeting);

    expect(state).toEqual(before);
    expect(meeting).toEqual(beforeMeeting);
    expect(a.meeting.going).not.toBeNull();
    expect(a.results.length).toBe(closedCount(meeting));
  });

  it('1b. 실행 결과 상태: closed → run(simulated 표시), abandoned 는 그대로, 시뮬 여부는 등급·플레이어 기준', () => {
    const meeting = busiestMeeting(declared);
    const out = runMeeting(state, meeting, ctx, createRng(RUN_SEED + 11));
    out.meeting.races.forEach((sr, i) => {
      const src = meeting.races[i];
      if (src?.status === 'closed') {
        expect(sr.status).toBe('run');
        const grade = sr.race.grade;
        const expectSim = grade !== null && SIMULATE_GRADES.includes(grade);
        expect(sr.simulated).toBe(expectSim);
      } else {
        expect(sr).toEqual(src);
      }
    });
  });

  it('2. summarizeRace 는 RaceResult 형식을 지키고, 능력 +15 말이 200회 중 1착 60% 이상', () => {
    const course = RUN_COURSES.find((c) => c.surface === 'turf' && c.distances.some((d) => d.distance === 1609));
    if (course === undefined) throw new Error('1609m 잔디 경마장 없음');
    const race: Race = {
      id: 'summary-probe',
      name: 'Summary Probe',
      racecourseId: course.id,
      distance: 1609,
      layoutId: runLayout(course, 1609),
      kind: 'conditions',
      grade: null,
      raceClass: 4,
      conditions: {
        minAge: 3,
        maxAge: null,
        sex: 'open',
        ratingMin: null,
        ratingMax: null,
        weightSystem: 'level',
        baseWeightLb: 126,
      },
      prizeMoney: [10000, 4000, 2000],
      maxRunners: 14,
    };
    const field = generateSampleField(createRng('summary-field'), {
      size: 8,
      distance: 1609,
      surface: 'turf',
      year: RUN_YEAR,
      namePool: NAME_POOL,
      playerIndex: null,
    });
    const strongId = field.runners[0]?.horse.id;
    const strong: SampleField = structuredClone(field);
    const first = strong.runners[0];
    if (first === undefined || strongId === undefined) throw new Error('샘플 필드가 비었다');
    first.horse = { ...first.horse, ability: boostAbilities(first.horse.ability, 15) };

    const date = { year: RUN_YEAR, week: RUN_JUNE_WEEK };
    expectValidRaceResult(summarizeRace({ race, course, going: 'good', date, seed: 1, field }), race, field);

    let wins = 0;
    for (let i = 0; i < 200; i++) {
      const r = summarizeRace({ race, course, going: 'good', date, seed: 1000 + i, field: strong });
      if (r.runners[0]?.horseId === strongId) wins += 1;
    }
    expect(wins / 200).toBeGreaterThanOrEqual(0.6);
  });

  it('3. 플레이어 레이스의 ReplayableRace 를 runRace 로 다시 돌리면 착순·finishTime 이 저장 결과와 같다', () => {
    const meeting = busiestMeeting(declared);
    const target = meeting.races.find((sr) => sr.status === 'closed' && sr.declarations.length >= 2);
    if (target === undefined) throw new Error('선언 2두 이상인 closed 레이스 없음');
    const playerRaceId = target.race.id;
    const withPlayer: Meeting = {
      ...meeting,
      races: meeting.races.map((sr) =>
        sr.race.id === playerRaceId
          ? {
              ...sr,
              declarations: sr.declarations.map((d, i) => ({ ...d, isPlayer: i === 0 })),
            }
          : sr,
      ),
    };

    const out = runMeeting(state, withPlayer, ctx, createRng(RUN_SEED + 13));
    const stored = out.results.find((r) => r.raceId === playerRaceId);
    const rep = out.state.seasonState.replayable.find((r) => r.race.id === playerRaceId);
    if (stored === undefined || rep === undefined) throw new Error('플레이어 레이스 결과·다시보기 없음');

    const course = runCourse(rep.race.racecourseId);
    const again = runRace({
      race: rep.race,
      course,
      going: rep.going,
      date: rep.date,
      seed: rep.seed,
      field: rep.field,
    }).sim.result;
    expect(again.runners.map((r) => [r.horseId, r.position, r.finishTime])).toEqual(
      stored.runners.map((r) => [r.horseId, r.position, r.finishTime]),
    );
    expect(again.winningTime).toBe(stored.winningTime);

    const playerEvent: GameEvent | undefined = out.events.find(
      (e) => e.type === 'race_run' && e.raceId === playerRaceId,
    );
    expect(playerEvent?.type).toBe('race_run');
    expect(out.state.raceResults.some((r) => r.raceId === playerRaceId)).toBe(true);
    expect(out.meeting.races.find((sr) => sr.race.id === playerRaceId)?.simulated).toBe(true);
  });

  it('4. 한 개최일의 마주 funds 증가 합 = 착순별 상금 합(출주 두수까지)', () => {
    const meeting = busiestMeeting(declared);
    const before = ownerFundsTotal(state);
    const out = runMeeting(state, meeting, ctx, createRng(RUN_SEED + 17));
    const paid = ownerFundsTotal(out.state) - before;

    let expected = 0;
    for (const result of out.results) {
      const sr = meeting.races.find((x) => x.race.id === result.raceId);
      if (sr === undefined) throw new Error(`레이스 ${result.raceId} 없음`);
      // 레이스 단위: 주자별 상금(말 누적 상금 증가분) 합 = prizeMoney 중 출주 두수까지의 합
      const perRace = result.runners.reduce(
        (sum, r) => sum + (out.state.horses[r.horseId]?.record.earnings ?? 0) - (state.horses[r.horseId]?.record.earnings ?? 0),
        0,
      );
      const cap = sr.race.prizeMoney.slice(0, result.runners.length).reduce((a, b) => a + b, 0);
      expect(perRace).toBe(cap);
      expected += cap;
    }
    expect(paid).toBe(expected);
  });

  it('5. 리딩 sire 표: wins 합 = 레이스 수, earnings 합 = 지급 상금 합(sire 있는 말 기준)', () => {
    const meeting = busiestMeeting(declared);
    const out = runMeeting(state, meeting, ctx, createRng(RUN_SEED + 19));
    const sireWins = sumLeadingWins(out.state.seasonState.leading.sire) - sumLeadingWins(state.seasonState.leading.sire);
    const sireEarnings =
      sumLeadingEarnings(out.state.seasonState.leading.sire) - sumLeadingEarnings(state.seasonState.leading.sire);

    let expectWins = 0;
    let expectEarnings = 0;
    for (const result of out.results) {
      const sr = meeting.races.find((x) => x.race.id === result.raceId);
      if (sr === undefined) throw new Error(`레이스 ${result.raceId} 없음`);
      if (sr === undefined) throw new Error(`레이스 ${result.raceId} 없음`);
      for (const r of result.runners) {
        const horse = out.state.horses[r.horseId];
        if (horse?.sireId === null || horse === undefined) continue;
        if (r.position === 1) expectWins += 1;
        expectEarnings += horse.record.earnings - (state.horses[r.horseId]?.record.earnings ?? 0);
      }
    }
    expect(sireWins).toBe(expectWins);
    expect(sireEarnings).toBe(expectEarnings);
    expect(Object.keys(out.state.seasonState.leading.jockey).length).toBeGreaterThan(0);
  });
});

describe('M3-A6b 결과 반영 단위 (합성 결과)', () => {
  let state: GameState;
  const DATE = { year: RUN_YEAR, week: RUN_JUNE_WEEK };
  const meetingStub: Meeting = {
    id: 'synthetic:meeting',
    date: DATE,
    racecourseId: 'saint_ourens',
    going: 'good',
    races: [],
  };

  beforeAll(() => {
    state = bootRun(RUN_SEED + 100);
  });

  function pickHorses(n: number): { id: string; ownerId: string; trainerId: string | null }[] {
    const out: { id: string; ownerId: string; trainerId: string | null }[] = [];
    for (const id of racingHorseIds(state)) {
      const h = state.horses[id];
      if (h?.ownerId && out.length < n) out.push({ id, ownerId: h.ownerId, trainerId: h.trainerId });
    }
    if (out.length < n) throw new Error('현역마가 부족하다');
    return out;
  }

  function syntheticRace(
    id: string,
    grade: Race['grade'],
    prize: number[],
    distance = 2000,
    courseId = 'saint_ourens',
  ): Race {
    const course = runCourse(courseId);
    return {
      id,
      name: 'Synthetic',
      racecourseId: course.id,
      distance,
      layoutId: runLayout(course, distance),
      kind: grade === null ? 'conditions' : 'group',
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
      prizeMoney: prize,
      maxRunners: 14,
    };
  }

  /** 상위 순서대로 선언·요청·결과를 만든다. horses[0] 이 1착 */
  function legInput(
    race: Race,
    templateId: string | null,
    horses: { id: string; ownerId: string; trainerId: string | null }[],
    playerIndex: number | null = null,
  ): { scheduled: ScheduledRace; field: SampleField; result: RaceResult } {
    const declarations: Declaration[] = horses.map((h, i) => ({
      horseId: h.id,
      ownerId: h.ownerId,
      trainerId: h.trainerId,
      jockeyId: 'jk-synthetic',
      weightLb: 126,
      isPlayer: i === playerIndex,
    }));
    const requests = horses.map((h, i) => ({
      horseId: h.id,
      jockeyId: 'jk-synthetic',
      tactic: 'midfield' as const,
      silks: { ...RUN_SILKS },
      isPlayer: i === playerIndex,
      weightLb: 126,
      jockeyAllowanceLb: 0,
    }));
    const field: SampleField = {
      runners: [],
      requests,
      ownerNames: horses.map(() => 'synthetic owner'),
    };
    const scheduled: ScheduledRace = {
      race,
      templateId,
      status: 'run',
      declarations,
      simulated: true,
    };
    const runners: RunnerResult[] = horses.map((h, i) => ({
      runnerIndex: i,
      horseId: h.id,
      saddleCloth: i + 1,
      draw: i + 1,
      jockeyId: 'jk-synthetic',
      weightLb: 126,
      position: i + 1,
      finishTime: 200 + i,
      margin: i === 0 ? null : { label: 'lengths', lengths: 1 },
      beatenLengths: i,
      sectionals: [200 + i],
      performanceFigure: -i,
      odds: null,
    }));
    const result: RaceResult = {
      raceId: race.id,
      racecourseId: race.racecourseId,
      date: DATE,
      going: 'good',
      distance: race.distance,
      seed: 4242,
      winningTime: 200,
      sectionalMarks: [],
      runners,
    };
    return { scheduled, field, result };
  }

  it('6. crown 시리즈: 레그 2개에서 같은 말이 두 번 우승 → champion, 보너스 지급, series_completed 1건', () => {
    const [x, y] = pickHorses(2) as [
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
    ];
    const series: SeriesDefinition = {
      id: 'run-test-crown',
      nameKey: 'test.crown',
      kind: 'crown',
      legs: ['leg-a', 'leg-b'],
      bonus: 10000,
    };
    const legA = legInput(syntheticRace('leg-a', 'G3', [0, 0]), 'leg-a', [x, y]);
    const legB = legInput(syntheticRace('leg-b', 'G3', [0, 0]), 'leg-b', [x, y]);

    const ownerX = state.owners[x.ownerId];
    if (ownerX === undefined) throw new Error('마주 없음');
    const fundsBefore = ownerX.funds;

    const a = applyRaceResult(state, { meeting: meetingStub, ...legA, series: [series] });
    expect(a.events.filter((e) => e.type === 'series_completed')).toHaveLength(0);
    expect(a.state.seasonState.series['run-test-crown']?.champion).toBeNull();

    const b = applyRaceResult(a.state, { meeting: meetingStub, ...legB, series: [series] });
    expect(b.state.seasonState.series['run-test-crown']?.champion).toBe(x.id);
    const completed = [...a.events, ...b.events].filter((e) => e.type === 'series_completed');
    expect(completed).toEqual([{ type: 'series_completed', seriesId: 'run-test-crown', horseId: x.id, date: DATE }]);
    expect((b.state.owners[x.ownerId]?.funds ?? 0) - fundsBefore).toBe(10000);

    // 이미 달성된 뒤 같은 말이 또 이겨도 보너스는 다시 주지 않는다
    const c = applyRaceResult(b.state, { meeting: meetingStub, ...legB, series: [series] });
    expect(c.events.filter((e) => e.type === 'series_completed')).toHaveLength(0);
    expect((c.state.owners[x.ownerId]?.funds ?? 0) - (b.state.owners[x.ownerId]?.funds ?? 0)).toBe(0);
  });

  it('6b. points 시리즈: 착순 포인트 누적, champion 은 설정하지 않는다(시즌 종료 시 A6c)', () => {
    const [x, y] = pickHorses(2) as [
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
    ];
    const series: SeriesDefinition = {
      id: 'run-test-points',
      nameKey: 'test.points',
      kind: 'points',
      legs: ['pts-a'],
      pointsByPosition: [10, 6],
      bonus: 5000,
    };
    const leg = legInput(syntheticRace('pts-a', 'G3', [0, 0]), 'pts-a', [x, y]);
    const out = applyRaceResult(state, { meeting: meetingStub, ...leg, series: [series] });
    const progress = out.state.seasonState.series['run-test-points'];
    expect(progress?.points[x.id]).toBe(10);
    expect(progress?.points[y.id]).toBe(6);
    expect(progress?.champion).toBeNull();
  });

  it('6c. 피로·준비도: 거리대별 피로 증가(1609m → +22), 준비도 −8, 0~100 clamp', () => {
    const [x, y] = pickHorses(2) as [
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
    ];
    const leg = legInput(syntheticRace('fat-a', null, [0, 0], 1609, 'ashcombe'), null, [x, y]);
    const before = state.horses[x.id]?.condition;
    const out = applyRaceResult(state, { meeting: meetingStub, ...leg, series: [] });
    const after = out.state.horses[x.id]?.condition;
    expect(after?.fatigue).toBe(Math.min(100, (before?.fatigue ?? 0) + 22));
    expect(after?.fitness).toBe(Math.max(0, (before?.fitness ?? 0) - 8));
    expect(out.state.seasonState.lastRun[x.id]).toEqual(DATE);
    expect(state.horses[x.id]?.condition).toEqual(before);
  });

  it('6d. 결과 보존·다시보기·race_run: 그룹 레이스는 보존+이벤트, 무관한 비그룹 레이스는 보존하지 않는다', () => {
    const [x, y] = pickHorses(2) as [
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
    ];
    const group = legInput(syntheticRace('keep-g3', 'G3', [0, 0]), null, [x, y]);
    const plain = legInput(syntheticRace('keep-plain', null, [0, 0], 1207, 'ashcombe'), null, [x, y]);
    const g = applyRaceResult(state, { meeting: meetingStub, ...group, series: [] });
    expect(g.state.raceResults.map((r) => r.raceId)).toContain('keep-g3');
    expect(g.events.some((e) => e.type === 'race_run' && e.raceId === 'keep-g3')).toBe(true);
    expect(g.state.seasonState.replayable).toHaveLength(0);

    const p = applyRaceResult(state, { meeting: meetingStub, ...plain, series: [] });
    expect(p.state.raceResults.map((r) => r.raceId)).not.toContain('keep-plain');
    expect(p.events.some((e) => e.type === 'race_run')).toBe(false);
  });

  it('6e. 동착: 점유한 착순의 상금을 나눈다(합계 보존, 나머지 1원은 앞 주자부터). 동착 없으면 착순 상금 그대로', () => {
    const picked = pickHorses(4);
    const [a, b, c, d] = picked as [
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
      { id: string; ownerId: string; trainerId: string | null },
    ];
    const leg = legInput(syntheticRace('dh-split', 'G3', [60000, 20000, 10000, 5000]), null, [a, b, c, d]);
    const r = leg.result.runners;
    const second = r[1];
    const third = r[2];
    const fourth = r[3];
    if (second === undefined || third === undefined || fourth === undefined) throw new Error('주자 부족');
    second.position = 2;
    third.position = 2;
    third.margin = { label: 'dead_heat', lengths: 0 };
    fourth.position = 4;

    const before = structuredClone(state);
    const out = applyRaceResult(state, { meeting: meetingStub, ...leg, series: [] });
    const gain = (id: string): number =>
      (out.state.horses[id]?.record.earnings ?? 0) - (before.horses[id]?.record.earnings ?? 0);
    expect(gain(a.id)).toBe(60000);
    expect(gain(b.id)).toBe(15000);
    expect(gain(c.id)).toBe(15000);
    expect(gain(d.id)).toBe(5000);

    const fundsBefore = ownerFundsTotal(before);
    expect(ownerFundsTotal(out.state) - fundsBefore).toBe(95000);

    // 홀수 상금: 1착 동착 두 마리가 10001 을 나누면 앞 주자가 1원 더 받는다
    const odd = legInput(syntheticRace('dh-odd', 'G3', [10001, 0]), null, [a, b]);
    const oddSecond = odd.result.runners[1];
    if (oddSecond === undefined) throw new Error('주자 부족');
    oddSecond.position = 1;
    oddSecond.margin = null;
    const o = applyRaceResult(state, { meeting: meetingStub, ...odd, series: [] });
    expect((o.state.horses[a.id]?.record.earnings ?? 0) - (before.horses[a.id]?.record.earnings ?? 0)).toBe(5001);
    expect((o.state.horses[b.id]?.record.earnings ?? 0) - (before.horses[b.id]?.record.earnings ?? 0)).toBe(5000);
  });
});
