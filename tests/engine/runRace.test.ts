import { describe, expect, it } from 'vitest';
import { getNamePool, getRace, getRaces, getRacecourse, getRacecourses } from '../../src/engine/data/staticData';
import { buildRacePath } from '../../src/engine/course/path';
import { createRng } from '../../src/engine/rng';
import { generateSampleField } from '../../src/engine/race/sampleField';
import type { SampleField } from '../../src/engine/race/sampleField';
import { runRace } from '../../src/engine/race/runRace';
import type { RunRaceOutput } from '../../src/engine/race/runRace';
import type { GameDate, Going, Race, Racecourse } from '../../src/engine/types';

const DATE: GameDate = { year: 2026, week: 24 };
const SEED = 20261011;

function goingFor(course: Racecourse): Going {
  return course.surface === 'turf' ? 'good' : 'standard';
}

function fieldFor(race: Race, course: Racecourse, seed: number, size: number): SampleField {
  return generateSampleField(createRng(seed).fork('field'), {
    size,
    distance: race.distance,
    surface: course.surface,
    year: DATE.year,
    namePool: getNamePool(),
    level: 60,
    playerIndex: 0,
  });
}

/** 함수 필드(path.sample, path.sampleInto)를 제외한 비교용 복사본 */
function comparable(out: RunRaceOutput): unknown {
  return { ...out, path: { ...out.path, sample: undefined, sampleInto: undefined } };
}

function runOne(raceId: string, seed: number, size: number, recordReplay?: boolean): RunRaceOutput {
  const race = getRace(raceId);
  const course = getRacecourse(race.racecourseId);
  const field = fieldFor(race, course, seed, size);
  return runRace({
    race,
    course,
    going: goingFor(course),
    date: DATE,
    seed,
    field,
    ...(recordReplay === undefined ? {} : { recordReplay }),
  });
}

describe('staticData', () => {
  it('경마장 11, 레이스 12, 이름 풀 80/30/30 이다', () => {
    expect(getRacecourses()).toHaveLength(11);
    expect(getRaces()).toHaveLength(12);
    const pool = getNamePool();
    expect(pool.horses).toHaveLength(80);
    expect(pool.jockeys).toHaveLength(30);
    expect(pool.owners).toHaveLength(30);
  });

  it('모든 레이스는 경마장 조회와 buildRacePath 가 성공한다', () => {
    for (const race of getRaces()) {
      const course = getRacecourse(race.racecourseId);
      expect(course.id).toBe(race.racecourseId);
      expect(getRace(race.id).id).toBe(race.id);
      expect(() => buildRacePath(course, race.distance)).not.toThrow();
    }
  });

  it('없는 id 는 Error 를 던진다', () => {
    expect(() => getRace('no_such_race')).toThrow(Error);
    expect(() => getRacecourse('no_such_course')).toThrow(Error);
  });
});

describe('runRace', () => {
  const raceId = 'saint_ourens_grand_prix';

  it('같은 입력을 두 번 실행하면 결과가 toEqual 이다', () => {
    const a = runOne(raceId, SEED, 10);
    const b = runOne(raceId, SEED, 10);
    // RacePath.sample 은 함수라서 인스턴스마다 참조가 달라 toEqual 에서 제외하고 샘플 값으로 비교한다.
    expect(comparable(a)).toEqual(comparable(b));
    for (const s of [0, 400, 1000, 2400]) {
      expect(a.path.sample(s)).toEqual(b.path.sample(s));
    }
  });

  it('시드만 다른 5회 실행 중 우승마가 적어도 두 종류 이상 나온다', () => {
    const winners = new Set<string>();
    for (let s = 1; s <= 5; s++) {
      const out = runOne(raceId, SEED + s, 10);
      const winner = out.sim.result.runners[0];
      expect(winner).toBeDefined();
      if (winner !== undefined) winners.add(winner.horseId);
    }
    expect(winners.size).toBeGreaterThanOrEqual(2);
  });

  it('모든 entries.odds 는 null 이 아니다', () => {
    const out = runOne(raceId, SEED, 10);
    expect(out.entries).toHaveLength(10);
    for (const e of out.entries) {
      expect(e.odds).not.toBeNull();
    }
  });

  it('12개 레이스 각각 min(10, maxRunners) 두가 모두 결승하고 1착이 존재한다', () => {
    for (const race of getRaces()) {
      const course = getRacecourse(race.racecourseId);
      const n = Math.min(10, race.maxRunners);
      const out = runOne(race.id, SEED, n);
      const runners = out.sim.result.runners;
      expect(runners, race.id).toHaveLength(n);
      expect(runners.some((r) => r.position === 1), race.id).toBe(true);
      for (const r of runners) {
        expect(Number.isFinite(r.finishTime), race.id).toBe(true);
        expect(r.finishTime, race.id).toBeGreaterThan(0);
      }
      expect(out.path.surface, race.id).toBe(course.surface);
    }
  });

  it('draw 스트림은 jockeyAllowanceLb 변화에 독립이다', () => {
    const race = getRace(raceId);
    const course = getRacecourse(race.racecourseId);
    const base = fieldFor(race, course, SEED, 10);
    const changed: SampleField = {
      ...base,
      requests: base.requests.map((q, i) => (i === 0 || i === 3 ? { ...q, jockeyAllowanceLb: 7 } : q)),
    };
    const a = runRace({ race, course, going: goingFor(course), date: DATE, seed: SEED, field: base });
    const b = runRace({ race, course, going: goingFor(course), date: DATE, seed: SEED, field: changed });
    expect(b.entries.map((e) => e.draw)).toEqual(a.entries.map((e) => e.draw));
    expect(b.entries[0]?.weightLb).not.toBe(a.entries[0]?.weightLb);
  });

  it('recordReplay 를 false 로 주면 replay 는 null 이다', () => {
    const out = runOne(raceId, SEED, 10, false);
    expect(out.sim.replay).toBeNull();
  });

  it('경마장 불일치 또는 최대 출주 두수 초과면 Error 를 던진다', () => {
    const race = getRace(raceId);
    const other = getRacecourse('ashcombe');
    const field = fieldFor(race, getRacecourse(race.racecourseId), SEED, 10);
    expect(() =>
      runRace({ race, course: other, going: 'good', date: DATE, seed: SEED, field }),
    ).toThrow(Error);

    const course = getRacecourse(race.racecourseId);
    const tooMany = fieldFor(race, course, SEED, race.maxRunners + 1);
    expect(() =>
      runRace({ race, course, going: goingFor(course), date: DATE, seed: SEED, field: tooMany }),
    ).toThrow(Error);
  });
});
