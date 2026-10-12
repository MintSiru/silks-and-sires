import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { HANDICAP_OR_RANGE } from '../../src/engine/config/meetings';
import { loadRacecourses } from '../../src/engine/course/load';
import { createRng } from '../../src/engine/rng';
import { runRace } from '../../src/engine/race/runRace';
import { buildWeekMeetings } from '../../src/engine/season/meetings';
import { slotOfWeek, weekOfSlot } from '../../src/engine/season/schedule';
import { declareAiRunners } from '../../src/engine/season/declarations';
import { isEligible, type CourseCountryLookup } from '../../src/engine/season/eligibility';
import { buildRaceField, type BuildRaceFieldResult } from '../../src/engine/season/field';
import { handicapWeights, sexAllowanceLb, wfaAllowanceLb } from '../../src/engine/season/weights';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { bootstrapRacingPopulation, type RacingPopulationStaticData } from '../../src/engine/world/population';
import type {
  Declaration,
  GameDate,
  GameState,
  Horse,
  Meeting,
  Race,
  RaceTemplate,
  Racecourse,
  ScheduledRace,
} from '../../src/engine/types';

const SEED = 20261011;
const YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const JUNE_FIRST_WEEK = weekOfSlot({ month: 6, weekOfMonth: 1 });
const APRIL_WEEK = weekOfSlot({ month: 4, weekOfMonth: 2 });
const OCTOBER_WEEK = weekOfSlot({ month: 10, weekOfMonth: 1 });
const JUNE_DATE: GameDate = { year: YEAR, week: JUNE_FIRST_WEEK };
const GROUP_TEMPLATE_ID = 'test-group-g3';
const HANDICAP_TEMPLATE_ID = 'test-handicap-c4';

const lookupCountry: CourseCountryLookup = (id) => COURSES.find((c) => c.id === id)?.country;

function courseOf(id: string): Racecourse {
  const c = COURSES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`fixture 에 ${id} 없음`);
  return c;
}

/** 경마장의 거리 목록에서 layoutId 를 찾는다 */
function layoutFor(courseId: string, distance: number): string {
  const cd = courseOf(courseId).distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`${courseId} 에 ${distance}m 없음`);
  return cd.layoutId;
}

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

/** 인물 → 세계 → 현역마 순서로 만든 새 게임 상태 */
function boot(seed = SEED): GameState {
  const base = createNewGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } });
  const withPeople = bootstrapPeople(base, getPeopleData(), createRng(seed));
  const withWorld = bootstrapWorld(withPeople, worldData(), createRng(seed + 1));
  return bootstrapRacingPopulation(withWorld, populationData(), createRng(seed + 2));
}

/** 6월 1주 그룹 G3(프랑스, 2,000m) 템플릿 */
function groupTemplate(): RaceTemplate {
  return {
    id: GROUP_TEMPLATE_ID,
    name: 'Test Group Three',
    racecourseId: 'saint_ourens',
    distance: 2000,
    layoutId: layoutFor('saint_ourens', 2000),
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
    schedule: slotOfWeek(JUNE_FIRST_WEEK),
    cardOrder: 1,
    tags: [],
  };
}

/** 같은 주 핸디캡 클래스 4(영국, 1,207m) 템플릿 */
function handicapTemplate(): RaceTemplate {
  const range = HANDICAP_OR_RANGE[4];
  return {
    id: HANDICAP_TEMPLATE_ID,
    name: 'Test Handicap Class Four',
    racecourseId: 'ashcombe',
    distance: 1207,
    layoutId: layoutFor('ashcombe', 1207),
    kind: 'handicap',
    grade: null,
    raceClass: 4,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: range.min,
      ratingMax: range.max,
      weightSystem: 'handicap',
      baseWeightLb: 133,
    },
    prizeMoney: [15000, 6000],
    maxRunners: 18,
    schedule: slotOfWeek(JUNE_FIRST_WEEK),
    cardOrder: 2,
    tags: [],
  };
}

function juneMeetings(seed: number): Meeting[] {
  return buildWeekMeetings({
    date: JUNE_DATE,
    templates: [groupTemplate(), handicapTemplate()],
    courses: COURSES,
    rng: createRng(seed),
    nextGeneratedRace: 1,
  }).meetings;
}

function allRaces(meetings: readonly Meeting[]): { meeting: Meeting; sr: ScheduledRace }[] {
  return meetings.flatMap((meeting) => meeting.races.map((sr) => ({ meeting, sr })));
}

function findRace(meetings: readonly Meeting[], predicate: (sr: ScheduledRace) => boolean): { meeting: Meeting; sr: ScheduledRace } {
  const hit = allRaces(meetings).find((x) => predicate(x.sr));
  if (hit === undefined) throw new Error('조건에 맞는 레이스 없음');
  return hit;
}

function meanOr(state: GameState, decls: readonly Declaration[]): number {
  const ors = decls.map((d) => state.horses[d.horseId]?.officialRating ?? Number.NaN);
  return ors.reduce((a, b) => a + b, 0) / ors.length;
}

describe('AI 출주 결정 · 부담중량 · 기수 배정 (M3-A6a)', () => {
  let state: GameState;
  let meetings: Meeting[];
  let declared: Meeting[];

  beforeAll(() => {
    state = boot();
    meetings = juneMeetings(SEED);
    declared = declareAiRunners(state, meetings, createRng(SEED + 7), lookupCountry);
  });

  it('1. 같은 시드면 declareAiRunners·buildRaceField 결과가 toEqual 이다', () => {
    const again = declareAiRunners(state, meetings, createRng(SEED + 7), lookupCountry);
    expect(again).toEqual(declared);

    const { sr } = findRace(declared, (x) => x.templateId === GROUP_TEMPLATE_ID);
    const a = buildRaceField(state, sr, JUNE_DATE, createRng(SEED + 9), lookupCountry);
    const b = buildRaceField(state, sr, JUNE_DATE, createRng(SEED + 9), lookupCountry);
    expect(a).toEqual(b);
  });

  it('2. 한 주에 한 말이 두 레이스 이상 선언되지 않고, 모든 선언 말이 isEligible 을 만족한다', () => {
    const seen = new Set<string>();
    let declarations = 0;
    for (const { meeting, sr } of allRaces(declared)) {
      expect(['closed', 'abandoned']).toContain(sr.status);
      if (sr.status === 'abandoned') {
        expect(sr.declarations.length).toBeLessThan(2);
      } else {
        expect(sr.declarations.length).toBeGreaterThanOrEqual(2);
      }
      expect(sr.declarations.length).toBeLessThanOrEqual(sr.race.maxRunners);

      for (const d of sr.declarations) {
        declarations += 1;
        expect(seen.has(d.horseId), `한 주 중복 선언 ${d.horseId}`).toBe(false);
        seen.add(d.horseId);
        const horse = state.horses[d.horseId];
        expect(horse).toBeDefined();
        if (horse === undefined) continue;
        expect(isEligible(horse, sr.race, meeting.date, state.seasonState)).toBe(true);
        expect(d.isPlayer).toBe(false);
        expect(d.jockeyId).toBeNull();
        expect(d.weightLb).toBeNull();
        if (sr.race.kind !== 'group') {
          expect(horse.countryOfBirth).toBe(lookupCountry(sr.race.racecourseId));
        }
      }
    }
    expect(declarations).toBeGreaterThan(0);
  });

  it('3. 6월 1주 그룹 레이스 출주마 평균 OR 이 같은 주 핸디캡 클래스 4 출주마 평균 OR 보다 높다', () => {
    const group = findRace(declared, (x) => x.templateId === GROUP_TEMPLATE_ID).sr;
    const handicap = findRace(declared, (x) => x.templateId === HANDICAP_TEMPLATE_ID).sr;
    expect(group.declarations.length).toBeGreaterThanOrEqual(2);
    expect(handicap.declarations.length).toBeGreaterThanOrEqual(2);
    expect(meanOr(state, group.declarations)).toBeGreaterThan(meanOr(state, handicap.declarations));
  });

  it('4. 핸디캡 부담중량: 최고 OR 말 = 상한, OR 5 낮으면 5lb 가볍고, 하한 112 아래로 내려가지 않는다', () => {
    expect(handicapWeights([80, 75, 60], 133)).toEqual([133, 128, 113]);
    expect(handicapWeights([80, 75], 133)).toEqual([133, 128]);
    expect(handicapWeights([50, 20], 133)).toEqual([133, 112]);
    expect(handicapWeights([], 133)).toEqual([]);

    const { sr } = findRace(declared, (x) => x.templateId === HANDICAP_TEMPLATE_ID);
    const built = buildRaceField(state, sr, JUNE_DATE, createRng(SEED + 11), lookupCountry);
    const ors = sr.declarations.map((d) => state.horses[d.horseId]?.officialRating ?? 0);
    const top = Math.max(...ors);
    built.race.declarations.forEach((d, i) => {
      const or = ors[i] ?? 0;
      const expected = Math.max(112, 133 - (top - or));
      expect(d.weightLb).toBe(expected);
      expect(d.weightLb).toBeGreaterThanOrEqual(112);
    });
    expect(built.race.declarations.some((d) => d.weightLb === 133)).toBe(true);
  });

  it('5. WFA: 4월 2,400m 에서 3세가 4세보다 11lb 가볍고, 10월 1,200m 에서는 같다. 그룹 레이스에서 견습 감량은 0', () => {
    expect(wfaAllowanceLb(3, 4, 2400)).toBe(11);
    expect(wfaAllowanceLb(3, 10, 1200)).toBe(0);
    expect(wfaAllowanceLb(3, 12, 2400)).toBe(11);
    expect(wfaAllowanceLb(4, 4, 2400)).toBe(0);

    const three = pickHorse(state, (h) => h.birthYear === YEAR - 3 && h.sex === 'male');
    const four = pickHorse(state, (h) => h.birthYear === YEAR - 4 && h.sex === 'male' && h.id !== three.id);
    const wfaRace = wfaTestRace(2400);
    const decls = [three, four].map((h) => declFor(h));

    const april = buildRaceField(
      state,
      { race: wfaRace, templateId: null, status: 'closed', declarations: decls, simulated: false },
      { year: YEAR, week: APRIL_WEEK },
      createRng(SEED + 13),
      lookupCountry,
    );
    expect(weightOf(april, three.id) - weightOf(april, four.id)).toBe(-11);

    const october = buildRaceField(
      state,
      { race: wfaTestRace(1200), templateId: null, status: 'closed', declarations: decls, simulated: false },
      { year: YEAR, week: OCTOBER_WEEK },
      createRng(SEED + 13),
      lookupCountry,
    );
    expect(weightOf(october, three.id)).toBe(weightOf(october, four.id));

    const { sr } = findRace(declared, (x) => x.templateId === GROUP_TEMPLATE_ID);
    const groupField = buildRaceField(state, sr, JUNE_DATE, createRng(SEED + 17), lookupCountry);
    for (const req of groupField.field.requests) {
      expect(req.jockeyAllowanceLb).toBe(0);
    }
  });

  it('5-1. 성별 감량: open 레이스의 암말 3lb, 핸디캡은 0', () => {
    const mare = { sex: 'female' as const };
    const openRace = wfaTestRace(1200);
    expect(sexAllowanceLb(mare, openRace)).toBe(3);
    expect(sexAllowanceLb({ sex: 'male' }, openRace)).toBe(0);
    const handicap = findRace(declared, (x) => x.templateId === HANDICAP_TEMPLATE_ID).sr.race;
    expect(sexAllowanceLb(mare, handicap)).toBe(0);
  });

  it('6. 같은 레이스에 같은 기수가 없고, 기수 최저 기승 체중 조건을 지킨다', () => {
    let fields = 0;
    for (const { sr } of allRaces(declared)) {
      if (sr.status !== 'closed') continue;
      const built = buildRaceField(state, sr, JUNE_DATE, createRng(SEED + 19), lookupCountry);
      fields += 1;
      const jockeyIds = built.field.requests.map((r) => r.jockeyId);
      expect(new Set(jockeyIds).size).toBe(jockeyIds.length);
      for (const req of built.field.requests) {
        const jockey = state.jockeys[req.jockeyId];
        expect(jockey, `기수 없음 ${req.jockeyId}`).toBeDefined();
        expect(jockey?.retired).toBe(false);
        expect(req.weightLb).toBeGreaterThanOrEqual(jockey?.minRidingWeightLb ?? Number.POSITIVE_INFINITY);
      }
    }
    expect(fields).toBeGreaterThan(0);
  });

  it('6-1. 중량 하한 112: 배정 중량이 112 아래면 112 로 올리고, 탈 수 있는 기수가 없으면 과체중(기수 최저 체중)으로 배정한다', () => {
    const closed = allRaces(declared).find(({ sr }) => sr.status === 'closed');
    if (closed === undefined) throw new Error('closed 레이스 없음');
    const light = structuredClone(closed.sr);
    light.race = {
      ...light.race,
      kind: 'conditions',
      conditions: { ...light.race.conditions, weightSystem: 'level', baseWeightLb: 110 },
    };

    // (a) 모든 기수의 최저 기승 체중이 125lb: 배정 110 → 하한 112 → 아무도 못 탐 → 과체중 125lb
    const heavy = structuredClone(state);
    for (const j of Object.values(heavy.jockeys)) j.minRidingWeightLb = 125;
    const over = buildRaceField(heavy, light, JUNE_DATE, createRng(SEED + 29), lookupCountry);
    expect(over.field.requests.length).toBe(light.declarations.length);
    for (const req of over.field.requests) {
      expect(req.weightLb).toBe(125);
      expect(req.weightLb).toBeGreaterThanOrEqual(heavy.jockeys[req.jockeyId]?.minRidingWeightLb ?? Infinity);
    }

    // (b) 최저 기승 체중 112 인 기수가 한 명이면 그 기수가 112lb 로 탄다(과체중 아님)
    const mixed = structuredClone(state);
    for (const j of Object.values(mixed.jockeys)) j.minRidingWeightLb = 125;
    const first = Object.values(mixed.jockeys).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (first === undefined) throw new Error('기수 없음');
    first.minRidingWeightLb = 112;
    first.retired = false;
    const mixedField = buildRaceField(mixed, light, JUNE_DATE, createRng(SEED + 31), lookupCountry);
    for (const req of mixedField.field.requests) {
      expect(req.weightLb).toBeGreaterThanOrEqual(112);
      expect(req.weightLb).toBeGreaterThanOrEqual(mixed.jockeys[req.jockeyId]?.minRidingWeightLb ?? Infinity);
    }
    expect(mixedField.field.requests.some((r) => r.weightLb === 112)).toBe(true);
  });

  it('7. buildRaceField 결과로 runRace 가 실행된다', () => {
    const { sr, meeting } = findRace(declared, (x) => x.templateId === GROUP_TEMPLATE_ID);
    const built: BuildRaceFieldResult = buildRaceField(state, sr, JUNE_DATE, createRng(SEED + 23), lookupCountry);
    const out = runRace({
      race: sr.race,
      course: courseOf(sr.race.racecourseId),
      going: 'good',
      date: meeting.date,
      seed: SEED,
      field: built.field,
      recordReplay: false,
    });
    expect(out.sim.result.runners).toHaveLength(built.field.runners.length);
    expect(out.sim.result.raceId).toBe(GROUP_TEMPLATE_ID);
  });

  it('8. 취소 규칙: 조건을 만족하는 말이 없으면 abandoned 이고 선언이 남지 않는다', () => {
    const impossible: Race = {
      ...handicapTemplate(),
      id: 'test-impossible',
      conditions: {
        ...handicapTemplate().conditions,
        ratingMin: 999,
        ratingMax: 1000,
      },
    };
    const meeting: Meeting = {
      id: `ashcombe:${JUNE_DATE.year}-${JUNE_DATE.week}`,
      date: JUNE_DATE,
      racecourseId: 'ashcombe',
      going: null,
      races: [{ race: impossible, templateId: null, status: 'open', declarations: [], simulated: false }],
    };
    const out = declareAiRunners(state, [meeting], createRng(SEED + 29), lookupCountry);
    expect(out[0]?.races[0]?.status).toBe('abandoned');
    expect(out[0]?.races[0]?.declarations).toEqual([]);
  });

  it('9. 자격: 상태·부상·컨디션·성별·OR 범위·메이든 승수·마지막 출주 간격을 본다', () => {
    const base = pickHorse(state, (h) => h.status === 'in_training' && h.sex === 'male' && h.birthYear <= YEAR - 3 && h.officialRating !== null);
    const handicap = handicapTemplate();
    const race: Race = { ...handicap, kind: 'handicap' };
    const date = JUNE_DATE;
    const seasonState = state.seasonState;
    const inRange: Horse = { ...structuredClone(base), officialRating: HANDICAP_OR_RANGE[4].min };
    expect(isEligible(inRange, race, date, seasonState)).toBe(true);
    expect(isEligible({ ...inRange, officialRating: null }, race, date, seasonState)).toBe(false);
    expect(isEligible({ ...inRange, status: 'resting' }, race, date, seasonState)).toBe(false);
    expect(isEligible({ ...inRange, condition: { ...inRange.condition, fitness: 54 } }, race, date, seasonState)).toBe(false);
    expect(
      isEligible({ ...inRange, condition: { ...inRange.condition, injury: { kind: 'knock', weeksOut: 2 } } }, race, date, seasonState),
    ).toBe(false);
    const recent = { ...seasonState, lastRun: { [inRange.id]: { year: YEAR, week: JUNE_FIRST_WEEK - 1 } } };
    expect(isEligible(inRange, race, date, recent)).toBe(false);
    const twoAgo = { ...seasonState, lastRun: { [inRange.id]: { year: YEAR, week: JUNE_FIRST_WEEK - 2 } } };
    expect(isEligible(inRange, race, date, twoAgo)).toBe(true);
    const maiden: Race = { ...race, kind: 'maiden', conditions: { ...race.conditions, ratingMin: null, ratingMax: null } };
    expect(isEligible({ ...inRange, record: { ...inRange.record, wins: 1 } }, maiden, date, seasonState)).toBe(false);
    const novice: Race = { ...maiden, kind: 'novice' };
    expect(isEligible({ ...inRange, record: { ...inRange.record, wins: 1 } }, novice, date, seasonState)).toBe(true);
    expect(isEligible({ ...inRange, record: { ...inRange.record, wins: 2 } }, novice, date, seasonState)).toBe(false);
    expect(isEligible(inRange, { ...race, conditions: { ...race.conditions, sex: 'fillies_mares' } }, date, seasonState)).toBe(false);
  });
});

/** state 의 AI 말 중 조건에 맞는 첫 말(id 오름차순) */
function pickHorse(state: GameState, pred: (h: Horse) => boolean): Horse {
  const found = Object.keys(state.horses)
    .sort()
    .map((id) => state.horses[id])
    .find((h): h is Horse => h !== undefined && h.ownerId !== null && h.ownerId !== state.playerOwnerId && pred(h));
  if (found === undefined) throw new Error('조건에 맞는 말 없음');
  return found;
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

function weightOf(result: BuildRaceFieldResult, horseId: string): number {
  const req = result.field.requests.find((r) => r.horseId === horseId);
  if (req === undefined) throw new Error(`요청 없음 ${horseId}`);
  return req.weightLb;
}

function wfaTestRace(distance: number): Race {
  return {
    id: `test-wfa-${distance}`,
    name: 'Test Weights Race',
    racecourseId: 'ashcombe',
    distance,
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
