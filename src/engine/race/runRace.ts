import { buildRacePath } from '../course/path';
import { createRng } from '../rng';
import type {
  GameDate,
  Going,
  Race,
  Racecourse,
  RaceEntry,
  RacePath,
  RaceSimOutput,
  RunnerInput,
} from '../types';
import { priceField } from './odds';
import type { SampleField } from './sampleField';
import { buildEntries } from './setup';
import { simulateRace } from './simulate';
import { estimateStrength, type RaceContext } from './runnerModel';

const PERCENT = 100;

export interface RunRaceInput {
  race: Race;
  course: Racecourse;
  going: Going;
  date: GameDate;
  seed: number;
  /** runners[i] ↔ requests[i] */
  field: SampleField;
  /** 기본 true */
  recordReplay?: boolean;
}

export interface RunRaceOutput {
  /** odds 채워진 것, index = runner index */
  entries: RaceEntry[];
  path: RacePath;
  strengths: number[];
  sim: RaceSimOutput;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`runRace: 인덱스 범위 밖 (${index})`);
  }
  return item;
}

/**
 * 출주 준비(게이트 추첨) → 오즈 산출 → 레이스 시뮬레이션을 시드 하나로 실행한다.
 * 같은 입력 = 같은 출력. 스트림은 시드에서 fork 로 분리한다(draw / odds / sim).
 */
/**
 * 예상 전력(-예상 시간, 초)을 필드 평균 대비 % 로 바꾼다. 거리와 무관한 척도라 시장 온도를 한 값으로 쓸 수 있다.
 * 결과: 클수록 강함, 1.0 = 평균보다 예상 시간이 1% 짧음.
 */
export function relativeStrengths(strengths: readonly number[]): number[] {
  if (strengths.length === 0) return [];
  const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  const scale = Math.abs(mean) / PERCENT;
  return strengths.map((s) => (s - mean) / scale);
}

export function runRace(input: RunRaceInput): RunRaceOutput {
  const { race, course, going, date, seed, field } = input;
  const recordReplay = input.recordReplay ?? true;

  if (race.racecourseId !== course.id) {
    throw new Error(`runRace: 레이스 경마장(${race.racecourseId})과 전달된 경마장(${course.id})이 다르다`);
  }
  if (field.runners.length !== field.requests.length) {
    throw new Error('runRace: field.runners 와 field.requests 길이가 다르다');
  }
  if (field.runners.length > race.maxRunners) {
    throw new Error(`runRace: 출주 두수(${field.runners.length})가 최대(${race.maxRunners})를 넘는다`);
  }

  // 1. 게이트 추첨
  const entries = buildEntries(createRng(seed).fork('draw'), field.requests);

  // 2. 경로와 레이스 컨텍스트
  const path = buildRacePath(course, race.distance, race.layoutId);
  const ctx: RaceContext = {
    distance: race.distance,
    going,
    surface: path.surface,
    handedness: path.handedness,
    undulation: course.undulation,
    trackWidth: path.width,
  };

  // 3. 주자 입력 (entry 객체는 entries 와 같은 참조)
  const runners: RunnerInput[] = field.runners.map((r, i) => ({ ...r, entry: at(entries, i) }));

  // 4. 능력 추정 → 오즈
  const strengths = runners.map((r) => estimateStrength(r, ctx));
  const odds = priceField(createRng(seed).fork('odds'), relativeStrengths(strengths));
  // runners[i].entry 는 entries[i] 와 같은 객체이므로 한 번만 쓰면 양쪽에 반영된다.
  entries.forEach((e, i) => {
    e.odds = at(odds, i);
  });

  // 5. 시뮬레이션
  const sim = simulateRace({
    race,
    course,
    going,
    date,
    runners,
    seed,
    options: { recordReplay },
  });

  return { entries, path, strengths, sim };
}
