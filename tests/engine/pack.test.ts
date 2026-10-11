import { describe, expect, it } from 'vitest';
import namesJson from '../../data/names.json';
import racecoursesJson from '../../data/racecourses.json';
import racesJson from '../../data/races.json';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import { createRng } from '../../src/engine/rng';
import { buildEntries } from '../../src/engine/race/setup';
import { generateSampleField, type NamePool } from '../../src/engine/race/sampleField';
import { simulateRace } from '../../src/engine/race/simulate';
import type {
  GameDate,
  Going,
  Race,
  RaceEntry,
  RaceSimInput,
  Racecourse,
  RunnerInput,
} from '../../src/engine/types';

/**
 * 무리(페이스 추종) 동역학 검증 (M1-07c).
 * 출주마는 generateSampleField(level 60), 레이스는 data 의 레이스를 시드별로 순환한다.
 */
const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const NAMES: NamePool = namesJson;
const RACES: Race[] = racesJson as Race[];
const DATE: GameDate = { year: 2026, week: 20 };
/** 1마신 = 2.4m (BLOCK_DISTANCE_M 과 같은 기준) */
const METER_PER_LENGTH = 2.4;
const COHESION_RACES = 400;
const MARGIN_RACES = 600;
const LONG_TIMEOUT_MS = 120_000;

/** 시드 s 의 레이스 입력. 두수 = 4 + (s % (maxRunners - 3)). 잔디 good, AW standard. */
function makeInput(s: number, recordReplay: boolean): RaceSimInput {
  const race = RACES[s % RACES.length];
  if (race === undefined) throw new Error('레이스 데이터 없음');
  const course = getRacecourse(COURSES, race.racecourseId);
  const size = 4 + (s % (race.maxRunners - 3));
  const going: Going = course.surface === 'aw' ? 'standard' : 'good';
  const field = generateSampleField(createRng(s).fork('field'), {
    size,
    distance: race.distance,
    surface: course.surface,
    year: 2026,
    namePool: NAMES,
    level: 60,
  });
  const entries: RaceEntry[] = buildEntries(createRng(s).fork('entries'), field.requests);
  const runners: RunnerInput[] = field.runners.map((r, i) => {
    const entry = entries[i];
    if (entry === undefined) throw new Error(`entry ${i} 없음`);
    return { entry, horse: r.horse, jockey: r.jockey };
  });
  return {
    race,
    course,
    going,
    date: DATE,
    runners,
    seed: s,
    options: { recordReplay },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

describe('무리 응집 (pack cohesion)', () => {
  it(
    `${COHESION_RACES} 레이스에서 선두가 60% 지점을 지날 때 두당 간격 중앙값이 1.5마신 이하다`,
    () => {
      const perHorseGaps: number[] = [];
      for (let s = 1; s <= COHESION_RACES; s++) {
        const input = makeInput(s, true);
        const { replay } = simulateRace(input);
        if (replay === null) throw new Error('리플레이 없음');
        const threshold = input.race.distance * 0.6;
        const frame = replay.frames.find((f) => Math.max(...f.progress) >= threshold);
        if (frame === undefined) throw new Error(`60% 지점 프레임 없음 (seed ${s})`);
        const lead = Math.max(...frame.progress);
        const last = Math.min(...frame.progress);
        const n = frame.progress.length;
        perHorseGaps.push((lead - last) / (n - 1));
      }
      const med = median(perHorseGaps);
      expect(med).toBeLessThanOrEqual(METER_PER_LENGTH * 1.5);
    },
    LONG_TIMEOUT_MS,
  );
});

describe('착차 (pack margins)', () => {
  it(
    `${MARGIN_RACES} 레이스에서 1·2착 착차 중앙값이 2.5마신 이하, 10마신 이상 비율이 5% 이하다`,
    () => {
      const margins: number[] = [];
      let tenPlus = 0;
      for (let s = 1; s <= MARGIN_RACES; s++) {
        const { result } = simulateRace(makeInput(s, false));
        const second = result.runners[1];
        if (second === undefined) throw new Error(`2착 기록 없음 (seed ${s})`);
        margins.push(second.beatenLengths);
        if (second.beatenLengths >= 10) tenPlus++;
      }
      expect(median(margins)).toBeLessThanOrEqual(2.5);
      expect(tenPlus / MARGIN_RACES).toBeLessThanOrEqual(0.05);
    },
    LONG_TIMEOUT_MS,
  );
});
