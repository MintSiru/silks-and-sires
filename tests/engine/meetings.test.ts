import { describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  AW_MEETINGS_PER_WEEK,
  HANDICAP_OR_RANGE,
  MEETING_RACES_TARGET,
  MINOR_MEETINGS_PER_WEEK,
  TWO_YO_FROM_WEEK,
} from '../../src/engine/config/meetings';
import { loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath, findCourseDistance } from '../../src/engine/course/path';
import { createRng } from '../../src/engine/rng';
import { generateRace } from '../../src/engine/season/generateRace';
import { buildWeekMeetings } from '../../src/engine/season/meetings';
import { slotOfWeek, weekOfSlot } from '../../src/engine/season/schedule';
import { monthOfWeek } from '../../src/engine/time/calendar';
import type {
  CountryCode,
  Racecourse,
  RaceClass,
  RaceTemplate,
  RacecourseId,
  Surface,
  Week,
} from '../../src/engine/types';

const BASE_COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const SEASON_YEAR = 2026;

function baseCourse(id: RacecourseId): Racecourse {
  const c = BASE_COURSES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`fixture 에 ${id} 없음`);
  return c;
}

/** 기준 경마장을 복제해 id·나라·표면을 바꾼다(레이아웃·거리는 그대로) */
function clone(id: string, from: RacecourseId, country: CountryCode, surface?: Surface): Racecourse {
  const base = baseCourse(from);
  return { ...base, id, name: `Test ${id}`, country, surface: surface ?? base.surface };
}

/** 이번 주 고정 일정 레이스 하나. 거리는 경마장 첫 거리 */
function template(id: string, course: Racecourse, week: Week, cardOrder: number, raceClass: RaceClass = 3): RaceTemplate {
  const cd = course.distances[0];
  if (cd === undefined) throw new Error(`${course.id} 에 거리가 없음`);
  return {
    id,
    name: `${course.name} ${id}`,
    racecourseId: course.id,
    distance: cd.distance,
    layoutId: cd.layoutId,
    kind: 'handicap',
    grade: null,
    raceClass,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: HANDICAP_OR_RANGE[3].min,
      ratingMax: HANDICAP_OR_RANGE[3].max,
      weightSystem: 'handicap',
      baseWeightLb: 133,
    },
    prizeMoney: [15000, 6000],
    maxRunners: 18,
    schedule: slotOfWeek(week),
    cardOrder,
    tags: [],
  };
}

function build(
  week: Week,
  courses: readonly Racecourse[],
  templates: readonly RaceTemplate[] = [],
  seed = 1,
  nextGeneratedRace = 0,
) {
  return buildWeekMeetings({
    date: { year: SEASON_YEAR, week },
    templates,
    courses,
    rng: createRng(seed),
    nextGeneratedRace,
  });
}

function countryOf(courses: readonly Racecourse[], id: RacecourseId): CountryCode {
  const c = courses.find((x) => x.id === id);
  if (c === undefined) throw new Error(`경마장 ${id} 없음`);
  return c.country;
}

describe('weekOfSlot / slotOfWeek', () => {
  it('모든 주 1~52 에서 weekOfSlot(slotOfWeek(w)) === w', () => {
    for (let w = 1; w <= WEEKS_PER_YEAR; w++) {
      expect(weekOfSlot(slotOfWeek(w))).toBe(w);
    }
  });

  it('그 달을 넘는 weekOfMonth 는 RangeError', () => {
    for (let month = 1; month <= 12; month++) {
      let weeksInMonth = 0;
      for (let w = 1; w <= WEEKS_PER_YEAR; w++) {
        if (monthOfWeek(w) === month) weeksInMonth++;
      }
      expect(() => weekOfSlot({ month, weekOfMonth: weeksInMonth + 1 })).toThrow(RangeError);
    }
  });
});

describe('generateRace', () => {
  it('거리·레이아웃은 그 경마장의 유효한 쌍이고 같은 거리는 첫 레이아웃을 쓴다', () => {
    const courses = [baseCourse('marlow_downs'), baseCourse('saint_ourens'), baseCourse('ardvarrow_park')];
    for (const course of courses) {
      for (let seed = 1; seed <= 80; seed++) {
        const week = 16 + (seed % 30);
        const race = generateRace(createRng(seed), course, 'handicap', 4, { year: SEASON_YEAR, seq: seed, week });
        expect(race.layoutId).toBeDefined();
        const found = findCourseDistance(course, race.distance, race.layoutId);
        expect(found).toBeDefined();
        const first = course.distances.find((d) => d.distance === race.distance);
        expect(race.layoutId).toBe(first?.layoutId);
        expect(() => buildRacePath(course, race.distance, race.layoutId)).not.toThrow();
      }
    }
  });

  it('TWO_YO_FROM_WEEK 이전에는 2세 경주가 생성되지 않는다', () => {
    const course = baseCourse('marlow_downs');
    for (let week = 1; week < TWO_YO_FROM_WEEK; week++) {
      for (let seed = 1; seed <= 60; seed++) {
        for (const kind of ['maiden', 'novice'] as const) {
          const race = generateRace(createRng(seed), course, kind, 5, { year: SEASON_YEAR, seq: 0, week });
          expect(race.conditions.minAge).toBe(3);
          expect(race.conditions.maxAge).toBeNull();
        }
      }
    }
  });

  it('2세 경주 거리: 시작 달 1,006~1,207m, 9월 이전 상한 1,609, 9월 이후 상한 2,012', () => {
    const course = baseCourse('marlow_downs');
    const check = (week: Week, minDist: number, maxDist: number): number => {
      let twoYo = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const race = generateRace(createRng(seed), course, 'maiden', 5, { year: SEASON_YEAR, seq: seed, week });
        if (race.conditions.minAge !== 2) continue;
        twoYo++;
        expect(race.conditions.maxAge).toBe(2);
        expect(race.distance).toBeGreaterThanOrEqual(minDist);
        expect(race.distance).toBeLessThanOrEqual(maxDist);
      }
      return twoYo;
    };
    // 15주(4월)~18주: 시작 달 → 1,006~1,207
    expect(check(TWO_YO_FROM_WEEK, 1006, 1207)).toBeGreaterThan(0);
    // 20주(5월), 35주(8월): 9월 이전 상한 1,609
    expect(check(20, 1006, 1609)).toBeGreaterThan(0);
    expect(check(35, 1006, 1609)).toBeGreaterThan(0);
    // 36주(9월), 45주(11월 초): 9월 이후 상한 2,012
    expect(check(36, 1006, 2012)).toBeGreaterThan(0);
    expect(check(45, 1006, 2012)).toBeGreaterThan(0);
  });

  it('상금은 정수 €, 배분 합이 총상금과 같다 (메이든 9,000 / 클래스 5 핸디캡 6,500)', () => {
    const course = baseCourse('marlow_downs');
    const maiden = generateRace(createRng(3), course, 'maiden', 5, { year: SEASON_YEAR, seq: 1, week: 20 });
    expect(maiden.prizeMoney).toHaveLength(6);
    expect(maiden.prizeMoney.reduce((a, b) => a + b, 0)).toBe(9000);
    expect(maiden.prizeMoney.every((v) => Number.isInteger(v))).toBe(true);

    const hcp = generateRace(createRng(4), course, 'handicap', 5, { year: SEASON_YEAR, seq: 2, week: 20 });
    expect(hcp.prizeMoney.reduce((a, b) => a + b, 0)).toBe(6500);
    expect(hcp.prizeMoney.every((v) => Number.isInteger(v))).toBe(true);
  });

  it('핸디캡 조건: 3세 이상, OR 범위, handicap 중량 체계, 상한 중량 133lb, 출주 두수', () => {
    const course = baseCourse('marlow_downs');
    const top = generateRace(createRng(5), course, 'handicap', 3, { year: SEASON_YEAR, seq: 0, week: 20 });
    expect(top.conditions.minAge).toBe(3);
    expect(top.conditions.maxAge).toBeNull();
    expect(top.conditions.ratingMin).toBe(HANDICAP_OR_RANGE[3].min);
    expect(top.conditions.ratingMax).toBe(HANDICAP_OR_RANGE[3].max);
    expect(top.conditions.weightSystem).toBe('handicap');
    expect(top.conditions.baseWeightLb).toBe(133);
    expect(top.maxRunners).toBe(20);
    expect(top.grade).toBeNull();
    expect(top.name).toBe(`${course.name} Class 3 Handicap`);

    const low = generateRace(createRng(6), course, 'handicap', 4, { year: SEASON_YEAR, seq: 0, week: 20 });
    expect(low.maxRunners).toBe(18);
  });

  it('메이든·노비스 조건과 id 형식', () => {
    const course = baseCourse('marlow_downs');
    const race = generateRace(createRng(8), course, 'novice', 5, { year: SEASON_YEAR, seq: 42, week: 40 });
    expect(race.id).toBe(`gen-${SEASON_YEAR}-000042`);
    expect(race.conditions.weightSystem).toBe('wfa');
    expect(race.conditions.baseWeightLb).toBe(126);
    expect(race.conditions.ratingMin).toBeNull();
    expect(race.conditions.ratingMax).toBeNull();
    expect(race.maxRunners).toBe(14);
    expect(race.kind).toBe('novice');
    expect(race.name).toBe(`${course.name} Novice Stakes`);
  });

  it('같은 시드면 같은 결과', () => {
    const course = baseCourse('marlow_downs');
    const a = generateRace(createRng(9), course, 'handicap', 6, { year: SEASON_YEAR, seq: 5, week: 25 });
    const b = generateRace(createRng(9), course, 'handicap', 6, { year: SEASON_YEAR, seq: 5, week: 25 });
    expect(a).toEqual(b);
  });
});

describe('buildWeekMeetings', () => {
  it('같은 입력·시드면 결과가 toEqual', () => {
    const courses = BASE_COURSES;
    const templates = [template('T-1', baseCourse('ashcombe'), 20, 1)];
    const a = build(20, courses, templates, 77, 100);
    const b = build(20, courses, templates, 77, 100);
    expect(a).toEqual(b);
  });

  it('같은 주·같은 경마장 템플릿 2개는 개최일 1개에 cardOrder 순서로 들어가고 레이스 수 ≥ 목표', () => {
    const ashcombe = baseCourse('ashcombe');
    const templates = [template('T-B', ashcombe, 20, 2), template('T-A', ashcombe, 20, 1), template('T-OTHER', ashcombe, 21, 1)];
    const { meetings } = build(20, BASE_COURSES, templates);
    const meeting = meetings.find((m) => m.racecourseId === 'ashcombe');
    expect(meeting).toBeDefined();
    expect(meetings.filter((m) => m.racecourseId === 'ashcombe')).toHaveLength(1);
    expect(meeting?.id).toBe(`ashcombe:${SEASON_YEAR}-20`);
    expect(meeting?.races[0]?.race.id).toBe('T-A');
    expect(meeting?.races[0]?.templateId).toBe('T-A');
    expect(meeting?.races[1]?.race.id).toBe('T-B');
    expect(meeting?.races.length).toBeGreaterThanOrEqual(MEETING_RACES_TARGET);
    expect(meeting?.races.length).toBe(MEETING_RACES_TARGET);
  });

  it('템플릿이 목표보다 많으면 그대로 두고 자동 생성하지 않는다', () => {
    const ashcombe = baseCourse('ashcombe');
    const templates = Array.from({ length: 9 }, (_, i) => template(`T-${i + 1}`, ashcombe, 20, i + 1));
    const { meetings, nextGeneratedRace } = build(20, BASE_COURSES, templates, 2, 7);
    const meeting = meetings.find((m) => m.racecourseId === 'ashcombe');
    expect(meeting?.races).toHaveLength(9);
    expect(meeting?.races.every((r) => r.templateId !== null)).toBe(true);
    const generatedHere = meeting?.races.filter((r) => r.templateId === null).length ?? -1;
    expect(generatedHere).toBe(0);
    const generatedTotal = meetings.flatMap((m) => m.races).filter((r) => r.templateId === null).length;
    expect(nextGeneratedRace).toBe(7 + generatedTotal);
  });

  it('잔디 시즌: 나라별 일반 개최 수만큼(경마장이 있는 한), 이번 주 개최가 없는 잔디 경마장에서', () => {
    const courses: Racecourse[] = [
      clone('gb-1', 'ashcombe', 'GB'),
      clone('gb-2', 'ashcombe', 'GB'),
      clone('gb-3', 'ashcombe', 'GB'),
      clone('gb-4', 'ashcombe', 'GB'),
      clone('ie-1', 'ashcombe', 'IE'),
      clone('ie-2', 'ashcombe', 'IE'),
      clone('ie-3', 'ashcombe', 'IE'),
      clone('fr-1', 'ashcombe', 'FR'),
      clone('fr-2', 'ashcombe', 'FR'),
      clone('fr-3', 'ashcombe', 'FR'),
      clone('de-1', 'ashcombe', 'DE'),
      clone('de-2', 'ashcombe', 'DE'),
      clone('it-1', 'ashcombe', 'IT'),
      clone('it-2', 'ashcombe', 'IT'),
      clone('aw-1', 'ardvarrow_park', 'IE'),
    ];
    const { meetings } = build(20, courses);
    const perCountry: Record<string, number> = {};
    for (const m of meetings) {
      const c = countryOf(courses, m.racecourseId);
      perCountry[c] = (perCountry[c] ?? 0) + 1;
    }
    expect(perCountry).toEqual({
      GB: MINOR_MEETINGS_PER_WEEK.GB,
      IE: MINOR_MEETINGS_PER_WEEK.IE,
      FR: MINOR_MEETINGS_PER_WEEK.FR,
      DE: MINOR_MEETINGS_PER_WEEK.DE,
      IT: MINOR_MEETINGS_PER_WEEK.IT,
    });
    expect(meetings.every((m) => courses.find((c) => c.id === m.racecourseId)?.surface === 'turf')).toBe(true);
  });

  it('잔디 시즌: 경마장이 모자라면 있는 만큼 (기본 fixture: GB 2곳, FR 1곳, IE 잔디 0곳)', () => {
    const { meetings } = build(20, BASE_COURSES);
    expect(meetings.map((m) => m.racecourseId)).toEqual(['ashcombe', 'marlow_downs', 'saint_ourens']);
    for (const m of meetings) {
      expect(m.going).toBeNull();
      expect(m.races).toHaveLength(MEETING_RACES_TARGET);
      expect(m.date).toEqual({ year: SEASON_YEAR, week: 20 });
    }
  });

  it('올웨더 시즌: surface aw 개최만 AW_MEETINGS_PER_WEEK 개, 잔디 개최 없음', () => {
    const courses: Racecourse[] = [
      clone('aw-a', 'ardvarrow_park', 'IE'),
      clone('aw-b', 'ardvarrow_park', 'GB'),
      clone('aw-c', 'ardvarrow_park', 'FR'),
      baseCourse('ashcombe'),
    ];
    const { meetings } = build(1, courses);
    expect(meetings).toHaveLength(AW_MEETINGS_PER_WEEK);
    for (const m of meetings) {
      expect(courses.find((c) => c.id === m.racecourseId)?.surface).toBe('aw');
    }
    for (const m of meetings) {
      for (const sr of m.races) {
        expect(sr.race.conditions.minAge).toBe(3);
        expect(sr.race.raceClass).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('올웨더 시즌 1주 fixture: AW 경마장 1곳만 있으면 개최 1개', () => {
    const { meetings } = build(1, BASE_COURSES);
    expect(meetings.map((m) => m.racecourseId)).toEqual(['ardvarrow_park']);
  });

  it('출력은 racecourseId 오름차순', () => {
    const zz = clone('zz-turf', 'marlow_downs', 'GB');
    const aa = clone('aa-turf', 'marlow_downs', 'GB');
    const courses = [zz, aa, baseCourse('saint_ourens')];
    const templates = [template('T-Z', zz, 20, 1), template('T-A', aa, 20, 1)];
    const { meetings } = build(20, courses, templates);
    const ids = meetings.map((m) => m.racecourseId);
    expect(ids).toEqual([...ids].sort());
  });

  it('nextGeneratedRace 는 생성한 경주 수만큼 늘고, 생성 id 는 중복이 없다', () => {
    const { meetings, nextGeneratedRace } = build(30, BASE_COURSES, [], 5, 10);
    const generated = meetings.flatMap((m) => m.races.filter((r) => r.templateId === null));
    expect(nextGeneratedRace).toBe(10 + generated.length);
    const ids = generated.map((r) => r.race.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^gen-2026-\d{6}$/);
    }
  });

  it('전 주(1~52) 생성 경주의 거리·레이아웃은 유효한 쌍이다', () => {
    for (let week = 1; week <= WEEKS_PER_YEAR; week++) {
      const { meetings } = build(week, BASE_COURSES, [], week);
      for (const m of meetings) {
        const course = baseCourse(m.racecourseId);
        for (const sr of m.races) {
          expect(sr.race.racecourseId).toBe(m.racecourseId);
          expect(sr.race.layoutId).toBeDefined();
          expect(() => buildRacePath(course, sr.race.distance, sr.race.layoutId)).not.toThrow();
        }
      }
    }
  });
});
