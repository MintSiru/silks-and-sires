import { settleBetsForRace } from '../betting/betting';
import { RACE_SEED_MAX, SIMULATE_GRADES } from '../config/season';
import { rollGoing } from '../going/going';
import { runRace } from '../race/runRace';
import { monthOfWeek } from '../time/calendar';
import type {
  GameEvent,
  GameState,
  Meeting,
  NickEntry,
  RaceResult,
  Racecourse,
  RacecourseId,
  Rng,
  ScheduledRace,
  SeriesDefinition,
} from '../types';
import { applyRaceResultInPlace } from './apply';
import type { CourseCountryLookup } from './eligibility';
import { buildRaceField } from './field';
import { summarizeRace } from './summary';

export interface RunMeetingContext {
  courses: readonly Racecourse[];
  series: readonly SeriesDefinition[];
  /** 닉스 표(그룹 우승 때 성적 공개 판정, M3-C4) */
  nicks: readonly NickEntry[];
  /** 클래식 레이스 템플릿 id(명성 보너스, M4-B1). 생략하면 없음 */
  classicTemplateIds?: readonly string[];
}

export interface RunMeetingInPlaceOutput {
  /** going 과 status·simulated 가 채워진 개최일 */
  meeting: Meeting;
  results: RaceResult[];
  events: GameEvent[];
}

export interface RunMeetingOutput extends RunMeetingInPlaceOutput {
  state: GameState;
}

/**
 * 개최일 하나를 실행한다(마장 결정 → 필드 구성 → 시뮬레이션 또는 요약 → 결과 반영). state 를 직접 고친다.
 * - 마장: rollGoing(rng.fork('going:' + meeting.id), 개최 경마장, 개최 월).
 * - 'closed' 레이스만 실행한다. 'open'·'abandoned' 등은 그대로 둔다.
 * - 레이스 시드: rng.fork('race:' + race.id) 에서 정수 하나. 필드 구성도 같은 하위 스트림을 쓴다.
 * - 그룹·리스티드 또는 플레이어 말 출주 레이스는 시뮬레이션(recordReplay false), 나머지는 요약 모드.
 * meeting 은 바꾸지 않는다. 개최일을 seasonState.meetings 에서 빼는 일은 호출자(A6c)가 한다.
 * 복제하지 않으므로 시즌 시스템(draft)에서 쓴다. 입력을 보존해야 하면 runMeeting 을 쓴다.
 */
export function runMeetingInPlace(
  state: GameState,
  meeting: Meeting,
  ctx: RunMeetingContext,
  rng: Rng,
): RunMeetingInPlaceOutput {
  const courseById = new Map<RacecourseId, Racecourse>();
  for (const c of ctx.courses) {
    courseById.set(c.id, c);
  }
  const requireCourse = (id: RacecourseId): Racecourse => {
    const course = courseById.get(id);
    if (course === undefined) throw new RangeError(`runMeeting: 경마장 ${id} 를 찾을 수 없음`);
    return course;
  };
  const courseCountry: CourseCountryLookup = (id) => courseById.get(id)?.country;

  // 1. 개최일 마장
  const host = requireCourse(meeting.racecourseId);
  const going = rollGoing(rng.fork('going:' + meeting.id), host, monthOfWeek(meeting.date.week));
  const out: Meeting = { ...structuredClone(meeting), going };

  // 2. 레이스별 실행
  const draft = state;
  const races: ScheduledRace[] = [];
  const results: RaceResult[] = [];
  const events: GameEvent[] = [];

  for (const sr of meeting.races) {
    if (sr.status === 'abandoned') {
      events.push(...settleBetsForRace(draft, meeting.id, sr.race.id, null, sr.race.kind === 'handicap'));
    }
    if (sr.status !== 'closed') {
      races.push(structuredClone(sr));
      continue;
    }

    const course = requireCourse(sr.race.racecourseId);
    const raceRng = rng.fork('race:' + sr.race.id);
    const seed = raceRng.int(0, RACE_SEED_MAX);
    const built = buildRaceField(draft, sr, meeting.date, raceRng, courseCountry);

    const hasPlayer = built.field.requests.some((r) => r.isPlayer);
    const grade = sr.race.grade;
    const simulate = hasPlayer || (grade !== null && SIMULATE_GRADES.includes(grade));
    const scheduled: ScheduledRace = { ...built.race, status: 'run', simulated: simulate };

    const result: RaceResult = simulate
      ? runRace({
          race: sr.race,
          course,
          going,
          date: meeting.date,
          seed,
          field: built.field,
          recordReplay: false,
        }).sim.result
      : summarizeRace({
          race: sr.race,
          course,
          going,
          date: meeting.date,
          seed,
          field: built.field,
        });

    events.push(
      ...applyRaceResultInPlace(draft, {
        meeting: out,
        scheduled,
        result,
        field: built.field,
        series: ctx.series,
        country: course.country,
        nicks: ctx.nicks,
        classicTemplateIds: ctx.classicTemplateIds,
      }),
    );
    events.push(...settleBetsForRace(draft, meeting.id, sr.race.id, result, sr.race.kind === 'handicap'));
    results.push(result);
    races.push(scheduled);
  }

  return {
    meeting: { ...out, races },
    results,
    events,
  };
}

/**
 * 개최일 실행의 입력 보존 버전. state 를 복제한 뒤 runMeetingInPlace 를 돌린다(테스트·외부용).
 * 입력 state·meeting 은 바꾸지 않는다.
 */
export function runMeeting(
  state: GameState,
  meeting: Meeting,
  ctx: RunMeetingContext,
  rng: Rng,
): RunMeetingOutput {
  const next = structuredClone(state);
  const out = runMeetingInPlace(next, meeting, ctx, rng);
  return { state: next, ...out };
}
