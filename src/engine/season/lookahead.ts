import {
  AW_HANDICAP_MIN_CLASS, AW_MEETINGS_PER_WEEK, CONDITIONS_RACE_CLASS,
  DISTANCE_BUCKETS, GENERATED_KIND_WEIGHTS, HANDICAP_CLASSES, HANDICAP_CLASS_WEIGHTS,
  MINOR_MEETINGS_PER_WEEK, TWO_YO_FROM_WEEK, TWO_YO_SHARE,
  type GeneratedRaceKind,
} from '../config/meetings';
import { addWeeks, isInPhase } from '../time/calendar';
import type { GameDate, GameState, RaceClass, Racecourse, RaceTemplate } from '../types';
import { generatedDistancePool } from './generateRace';
import { weekOfSlot } from './schedule';

export interface RaceCalendarData {
  courses: readonly Racecourse[];
  templates: readonly RaceTemplate[];
}

export interface ExpectedRaceKind {
  kind: GeneratedRaceKind;
  /** 생성 규칙의 비중. 실제 레이스 편성을 보장하지 않는다. */
  weight: number;
  classes: { raceClass: RaceClass; weight: number }[];
  distances: { distance: number; weight: number }[];
  twoYearOldDistances: number[];
  twoYearOldShare: number;
}

export interface UpcomingMeeting {
  course: Racecourse;
  /** 확정된 개최 / 고정 일정 개최 / 추첨 후보. 후보 중 minorMeetingCount 곳만 개최된다. */
  certainty: 'confirmed' | 'scheduled' | 'possible';
  expectedKinds: ExpectedRaceKind[];
}

export interface UpcomingRaceWeek {
  date: GameDate;
  fixedRaces: RaceTemplate[];
  meetings: UpcomingMeeting[];
  /** 잔디 시즌은 국가별, 겨울은 전체 올웨더 후보 중 뽑을 개최 수. */
  minorMeetingCount: { country: Racecourse['country'] | null; count: number }[];
}

function compareId(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function expectedKinds(course: Racecourse, date: GameDate): ExpectedRaceKind[] {
  const turf = isInPhase(date.week, 'turf_flat');
  const distances = generatedDistancePool(course, false, date.week).map((d) => d.distance);
  const bucket = (distance: number) => DISTANCE_BUCKETS.find((b) => distance <= b.maxM)!;
  const distanceWeights = distances.map((distance) => ({
    distance, weight: bucket(distance).weight / distances.filter((d) => bucket(d) === bucket(distance)).length,
  }));
  const distanceTotal = distanceWeights.reduce((sum, d) => sum + d.weight, 0);
  return (Object.keys(GENERATED_KIND_WEIGHTS) as GeneratedRaceKind[]).map((kind) => {
    const classes: readonly RaceClass[] = kind === 'handicap'
      ? HANDICAP_CLASSES.filter((c) => turf || c >= AW_HANDICAP_MIN_CLASS)
      : [CONDITIONS_RACE_CLASS];
    const classWeight = (c: RaceClass) => kind === 'handicap' && c !== 1 ? HANDICAP_CLASS_WEIGHTS[c] : 1;
    const total = classes.reduce((sum, c) => sum + classWeight(c), 0);
    const twoYearOldDistances = kind !== 'handicap' && turf && date.week >= TWO_YO_FROM_WEEK
      ? generatedDistancePool(course, true, date.week).map((d) => d.distance) : [];
    return {
      kind, weight: GENERATED_KIND_WEIGHTS[kind],
      classes: classes.map((raceClass) => ({ raceClass, weight: classWeight(raceClass) / total })),
      distances: distanceWeights.map((d) => ({ distance: d.distance, weight: d.weight / distanceTotal })),
      twoYearOldDistances,
      twoYearOldShare: twoYearOldDistances.length > 0 ? TWO_YO_SHARE : 0,
    };
  });
}

/** 현재 주를 포함한 weeks 주. 개최 추첨·레이스 생성을 실행하지 않아 공용 RNG 를 건드리지 않는다. */
export function upcomingRaces(
  state: GameState, data: RaceCalendarData, fromDate: GameDate, weeks: number,
): UpcomingRaceWeek[] {
  // 0주도 날짜 유효성을 검사한다.
  addWeeks(fromDate, weeks);
  const courses = [...data.courses].sort((a, b) => compareId(a.id, b.id));
  return Array.from({ length: weeks }, (_, i) => {
    const date = addWeeks(fromDate, i);
    const fixedRaces = data.templates.filter((t) => weekOfSlot(t.schedule) === date.week)
      .sort((a, b) => compareId(a.racecourseId, b.racecourseId) || a.cardOrder - b.cardOrder || compareId(a.id, b.id));
    const fixedIds = new Set(fixedRaces.map((t) => t.racecourseId));
    const confirmed = state.seasonState.meetings.filter((m) => m.date.year === date.year && m.date.week === date.week);
    const confirmedIds = new Set(confirmed.map((m) => m.racecourseId));
    const turf = isInPhase(date.week, 'turf_flat');
    const candidates = courses.filter((c) => !fixedIds.has(c.id) && (turf
      ? c.surface === 'turf' && c.country in MINOR_MEETINGS_PER_WEEK : c.surface === 'aw'));
    const minorMeetingCount = turf
      ? Object.entries(MINOR_MEETINGS_PER_WEEK).map(([country, count]) => ({
        country: country as Racecourse['country'], count: Math.min(count, candidates.filter((c) => c.country === country).length),
      }))
      : [{ country: null, count: Math.min(AW_MEETINGS_PER_WEEK, candidates.length) }];
    const meetings = courses.filter((c) => confirmedIds.has(c.id) || fixedIds.has(c.id)
      || (confirmed.length === 0 && candidates.some((candidate) => candidate.id === c.id)))
      .map((course): UpcomingMeeting => ({
        course,
        certainty: confirmedIds.has(course.id) ? 'confirmed' : fixedIds.has(course.id) ? 'scheduled' : 'possible',
        expectedKinds: expectedKinds(course, date),
      }));
    // 반환값을 바꿔도 정적 데이터나 상태를 변경하지 않는다.
    return structuredClone({ date, fixedRaces, meetings, minorMeetingCount });
  });
}
