import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { getNamePool, getRaces, getRacecourse } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { generateSampleField } from '../../src/engine/race/sampleField';
import { runRace } from '../../src/engine/race/runRace';
import type { RunRaceOutput } from '../../src/engine/race/runRace';
import { AW_GOING_ORDER, DIRT_GOING_ORDER, TURF_GOING_ORDER } from '../../src/engine/types';
import type { GameDate, Going, Race, Racecourse, RaceSimOutput, Surface } from '../../src/engine/types';

/** 지표 출력. console.log 는 기본 리포터에서 숨겨지므로 stdout 에 직접 쓴다. */
function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/** VERIFY=1 이면 전체 횟수, 아니면 빠른 기본 횟수 */
const FULL = !!process.env.VERIFY;
const RACE_COUNT = FULL ? 1000 : 30;
const REPLAY_COUNT = FULL ? 50 : 10;
const SEED_BASE = 1000;
const LEVEL = 60;
const DATE: GameDate = { year: 2026, week: 24 };
const TEST_TIMEOUT_MS = FULL ? 900_000 : 60_000;

function goingOrderFor(surface: Surface): readonly Going[] {
  if (surface === 'turf') return TURF_GOING_ORDER;
  if (surface === 'aw') return AW_GOING_ORDER;
  return DIRT_GOING_ORDER;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`인덱스 범위 밖 (${index})`);
  }
  return item;
}

interface RaceCase {
  seed: number;
  race: Race;
  course: Racecourse;
  going: Going;
  size: number;
}

/** 레이스 i 의 설정. 시드 s = 1000 + i. */
function caseFor(i: number): RaceCase {
  const seed = SEED_BASE + i;
  const races = getRaces();
  const race = at(races, seed % races.length);
  const course = getRacecourse(race.racecourseId);
  const goings = goingOrderFor(course.surface);
  const going = at(goings, Math.floor(seed / races.length) % goings.length);
  const size = 4 + (seed % (race.maxRunners - 3));
  return { seed, race, course, going, size };
}

/** 한 레이스를 처음부터 끝까지 실행한다(필드 생성 + runRace). 호출마다 새 객체를 만든다. */
function runIndex(i: number, recordReplay: boolean): RunRaceOutput {
  const c = caseFor(i);
  const field = generateSampleField(createRng(c.seed).fork('field'), {
    size: c.size,
    distance: c.race.distance,
    surface: c.course.surface,
    year: DATE.year,
    namePool: getNamePool(),
    level: LEVEL,
  });
  return runRace({
    race: c.race,
    course: c.course,
    going: c.going,
    date: DATE,
    seed: c.seed,
    field,
    recordReplay,
  });
}

/** sim 출력 비교: sim.result 는 JSON 문자열(키 순서 포함)과 깊은 비교 모두 통과해야 한다. */
function sameResult(a: RaceSimOutput, b: RaceSimOutput): boolean {
  return JSON.stringify(a.result) === JSON.stringify(b.result) && isDeepStrictEqual(a.result, b.result);
}

function sameReplay(a: RaceSimOutput, b: RaceSimOutput): boolean {
  return JSON.stringify(a.replay) === JSON.stringify(b.replay) && isDeepStrictEqual(a.replay, b.replay);
}

describe('재현성: 같은 시드 = 같은 결과', () => {
  it(`레이스 ${RACE_COUNT}개를 각각 두 번 실행해 sim.result 가 완전히 같다 (앞 ${REPLAY_COUNT}개는 replay 까지)`, () => {
    const mismatches: number[] = [];
    let matched = 0;
    for (let i = 0; i < RACE_COUNT; i++) {
      const rec = i < REPLAY_COUNT;
      const a = runIndex(i, rec);
      const b = runIndex(i, rec);
      const seed = SEED_BASE + i;
      const resultSame = sameResult(a.sim, b.sim);
      const replaySame = rec ? sameReplay(a.sim, b.sim) : a.sim.replay === null && b.sim.replay === null;
      if (resultSame && replaySame) {
        matched++;
      } else {
        mismatches.push(seed);
      }
    }
    say(`[재현성] 두 번 실행 일치: ${matched}/${RACE_COUNT}, 불일치 시드: ${JSON.stringify(mismatches)}`);
    expect(mismatches).toEqual([]);
    expect(matched).toBe(RACE_COUNT);
  }, TEST_TIMEOUT_MS);

  it('같은 시드를 역순으로 실행해도 결과가 같다 (전역 상태 누수 없음)', () => {
    const forward: string[] = [];
    for (let i = 0; i < RACE_COUNT; i++) {
      forward.push(JSON.stringify(runIndex(i, false).sim.result));
    }
    const mismatches: number[] = [];
    for (let i = RACE_COUNT - 1; i >= 0; i--) {
      const backward = JSON.stringify(runIndex(i, false).sim.result);
      if (backward !== at(forward, i)) {
        mismatches.push(SEED_BASE + i);
      }
    }
    say(`[재현성] 역순 실행 불일치 시드: ${JSON.stringify(mismatches)}`);
    expect(mismatches).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('recordReplay 를 켜거나 꺼도 sim.result 는 같다', () => {
    const mismatches: number[] = [];
    for (let i = 0; i < REPLAY_COUNT; i++) {
      const withReplay = runIndex(i, true);
      const withoutReplay = runIndex(i, false);
      if (!sameResult(withReplay.sim, withoutReplay.sim)) {
        mismatches.push(SEED_BASE + i);
      }
    }
    expect(mismatches).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it(`JSON 직렬화 왕복(JSON.parse(JSON.stringify(x)))이 원본과 같다 (레이스 ${RACE_COUNT}개)`, () => {
    const mismatches: number[] = [];
    for (let i = 0; i < RACE_COUNT; i++) {
      const rec = i < REPLAY_COUNT;
      const out = runIndex(i, rec);
      const roundTrip = JSON.parse(JSON.stringify(out.sim)) as RaceSimOutput;
      if (!isDeepStrictEqual(roundTrip, out.sim)) {
        mismatches.push(SEED_BASE + i);
      }
    }
    say(`[재현성] 직렬화 왕복 불일치 시드: ${JSON.stringify(mismatches)}`);
    expect(mismatches).toEqual([]);
  }, TEST_TIMEOUT_MS);
});
