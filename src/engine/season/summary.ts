import { SUMMARY_NOISE_SD } from '../config/season';
import { buildRacePath } from '../course/path';
import { createRng } from '../rng';
import { relativeStrengths } from '../race/runRace';
import { estimateStrength, type RaceContext } from '../race/runnerModel';
import { buildRaceResult, sectionalMarks } from '../race/results';
import { priceField } from '../race/odds';
import type { SampleField } from '../race/sampleField';
import { buildEntries } from '../race/setup';
import type {
  FinishRecord,
  GameDate,
  Going,
  Race,
  Racecourse,
  RaceResult,
  RunnerInput,
} from '../types';

export interface SummarizeRaceArgs {
  race: Race;
  course: Racecourse;
  going: Going;
  date: GameDate;
  seed: number;
  field: SampleField;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`summarizeRace: 인덱스 범위 밖 (${index})`);
  }
  return item;
}

/**
 * 요약 모드: 시뮬레이션 없이 결과만 추첨한다.
 * - 게이트·오즈는 runRace 와 같은 시드 분기(fork('draw'), fork('odds'))를 쓴다.
 * - 주자별 예상 시간 = −estimateStrength(초) × (1 + N(0, SUMMARY_NOISE_SD)). 노이즈는 fork('summary') 에서 뽑는다.
 * - markTimes 는 표지 위치에 선형 비례한다.
 * 출력 형식은 runRace 결과(RaceResult)와 같다. 같은 입력 = 같은 출력.
 */
export function summarizeRace(args: SummarizeRaceArgs): RaceResult {
  const { race, course, going, date, seed, field } = args;

  if (race.racecourseId !== course.id) {
    throw new Error(`summarizeRace: 레이스 경마장(${race.racecourseId})과 전달된 경마장(${course.id})이 다르다`);
  }
  if (field.runners.length !== field.requests.length) {
    throw new Error('summarizeRace: field.runners 와 field.requests 길이가 다르다');
  }
  if (field.runners.length > race.maxRunners) {
    throw new Error(`summarizeRace: 출주 두수(${field.runners.length})가 최대(${race.maxRunners})를 넘는다`);
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

  // 3. 주자 입력과 능력 추정 → 오즈
  const runners: RunnerInput[] = field.runners.map((r, i) => ({ ...r, entry: at(entries, i) }));
  const strengths = runners.map((r) => estimateStrength(r, ctx));
  const odds = priceField(createRng(seed).fork('odds'), relativeStrengths(strengths));
  entries.forEach((e, i) => {
    e.odds = at(odds, i);
  });

  // 4. 요약 기록: 예상 시간에 노이즈를 곱한다
  const noise = createRng(seed).fork('summary');
  const marks = sectionalMarks(race.distance);
  const finishes: FinishRecord[] = strengths.map((s, i) => {
    const expected = -s;
    const finishTime = expected * (1 + noise.normal(0, SUMMARY_NOISE_SD));
    return {
      runnerIndex: i,
      finishTime,
      markTimes: marks.map((m) => (finishTime * m) / race.distance),
    };
  });

  return buildRaceResult({ race, going, date, seed, entries, finishes, marks });
}
