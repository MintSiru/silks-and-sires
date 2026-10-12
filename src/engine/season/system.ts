/**
 * 시즌 주간 시스템 (M3-A6c, id 'season'; (d) 컨디션은 M3-C1).
 * 주마다 순서: (a) 연도 전환 → (b) 이번 주 개최 실행 → (c) 다음 주 개최 생성 → (d) 조교·휴양·부상 처리.
 * 개최 흐름: state.date 가 D 일 때 seasonState.meetings 에 D 주 개최가 들어 있다(플레이어 출주 접수 대상).
 * run(D) 이 D 주 개최를 실행하고 D+1 주 개최를 만든다.
 */
import { RESULTS_KEEP_SEASONS } from '../config/season';
import { weeklyConditionInPlace } from '../horse/conditioning';
import { ageInYear, nextDate } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  HorseStatus,
  NickEntry,
  Racecourse,
  RacecourseId,
  RaceTemplate,
  Rng,
  SeriesDefinition,
  WeekContext,
  WeeklySystem,
} from '../types';
import { computeSeasonAwards, hadRacesIn } from './awards';
import { declareAiRunners } from './declarations';
import type { CourseCountryLookup } from './eligibility';
import { buildWeekMeetings } from './meetings';
import { runMeetingInPlace } from './raceday';
import { emptyLeadingTables } from './state';

/** 시즌 시스템 정적 데이터 */
export interface SeasonStaticData {
  courses: Racecourse[];
  templates: RaceTemplate[];
  series: SeriesDefinition[];
  /** 닉스 표(성적 공개 판정, M3-C4) */
  nicks: NickEntry[];
}

/** 연도 전환이 일어나는 주(1월 1주) */
const FIRST_WEEK = 1;
/** 컨디션 주간 처리 대상 상태 */
const CONDITION_STATUSES: readonly HorseStatus[] = ['in_training', 'resting'];

function sameDate(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.week === b.week;
}

function compareId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * 지난해 points 시리즈의 챔피언을 확정한다. 포인트 내림차순, 동점은 horseId 오름차순.
 * 챔피언 마주에게 보너스를 주고 series_completed 이벤트를 낸다. 이미 챔피언이 있거나 득점자가 없으면 건너뛴다.
 */
function closePointsSeries(
  draft: GameState,
  series: readonly SeriesDefinition[],
  date: GameDate,
  events: GameEvent[],
): void {
  const prevYear = draft.seasonState.year;
  for (const def of series) {
    if (def.kind !== 'points') continue;
    const progress = draft.seasonState.series[def.id];
    if (progress === undefined || progress.year !== prevYear || progress.champion !== null) continue;

    const points = progress.points;
    const ranked = Object.keys(points).sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0) || compareId(a, b));
    const champion = ranked[0];
    if (champion === undefined) continue;

    progress.champion = champion;
    const ownerId = draft.horses[champion]?.ownerId ?? null;
    const owner = ownerId === null ? undefined : draft.owners[ownerId];
    if (owner !== undefined) {
      owner.funds += def.bonus;
    }
    events.push({ type: 'series_completed', seriesId: def.id, horseId: champion, date: { ...date } });
  }
}

/**
 * (a) 연도 전환: 시리즈 챔피언 확정 → 지난해 시상 확정(레이스가 있었을 때만) → 리딩·올해 기록 비우기 → 연도 갱신 → 오래된 결과 정리.
 * awardsRng 는 호출자가 rng.fork('awards') 로 넘긴다.
 */
function startNewSeason(
  draft: GameState,
  series: readonly SeriesDefinition[],
  date: GameDate,
  awardsRng: Rng,
  events: GameEvent[],
): void {
  closePointsSeries(draft, series, date, events);
  const prevYear = draft.seasonState.year;
  if (hadRacesIn(draft, prevYear)) {
    draft.awardsHistory.push(computeSeasonAwards(draft, prevYear, awardsRng));
    events.push({ type: 'awards_announced', year: prevYear, date: { ...date } });
  }
  draft.seasonState.leading = emptyLeadingTables();
  draft.seasonState.leadingByCountry = {};
  draft.seasonState.performances = {};
  draft.seasonState.raceRatings = [];
  draft.seasonState.year = date.year;
  const oldest = date.year - RESULTS_KEEP_SEASONS;
  draft.raceResults = draft.raceResults.filter((r) => r.date.year >= oldest);
}

/**
 * (b) 이번 주 개최 실행: AI 출주 확정 → 개최별 실행. 실행한 개최는 meetings 에서 뺀다.
 * draft 는 advanceWeek 가 이미 복제한 것이므로 runMeetingInPlace 로 직접 고친다(레이스마다 복제하지 않는다).
 */
function runThisWeek(
  draft: GameState,
  data: SeasonStaticData,
  courseCountry: CourseCountryLookup,
  date: GameDate,
  rng: Rng,
  events: GameEvent[],
): void {
  const thisWeek = draft.seasonState.meetings.filter((m) => sameDate(m.date, date));
  if (thisWeek.length === 0) return;
  draft.seasonState.meetings = draft.seasonState.meetings.filter((m) => !sameDate(m.date, date));

  const declared = declareAiRunners(draft, thisWeek, rng.fork('declare'), courseCountry);
  for (const meeting of declared) {
    const out = runMeetingInPlace(
      draft,
      meeting,
      { courses: data.courses, series: data.series, nicks: data.nicks },
      rng.fork('meeting:' + meeting.id),
    );
    events.push(...out.events);
  }
}

/**
 * (c) 다음 주 개최 생성. 이미 다음 주 개최가 있으면(초기화 직후 2주차) 중복 생성하지 않는다.
 */
function scheduleNextWeek(draft: GameState, data: SeasonStaticData, date: GameDate, rng: Rng): void {
  const next = nextDate(date);
  if (draft.seasonState.meetings.some((m) => sameDate(m.date, next))) return;

  const built = buildWeekMeetings({
    date: next,
    templates: data.templates,
    courses: data.courses,
    rng: rng.fork('meetings'),
    nextGeneratedRace: draft.seasonState.nextGeneratedRace,
  });
  draft.seasonState.meetings.push(...built.meetings);
  draft.seasonState.nextGeneratedRace = built.nextGeneratedRace;
}

/**
 * (d) 컨디션 주간 처리(M3-C1): in_training·resting 말을 id 순으로 돌며 조교·휴양·부상을 적용한다.
 * ranThisWeek 는 이번 주 개최 실행(b) 이후의 lastRun 으로 판정한다. 플레이어 말에 새 부상이 나면 horse_injured 를 낸다.
 */
function conditionWeek(draft: GameState, date: GameDate, rng: Rng, events: GameEvent[]): void {
  for (const id of Object.keys(draft.horses).sort()) {
    const horse = draft.horses[id];
    if (horse === undefined || !CONDITION_STATUSES.includes(horse.status)) continue;

    const trainer = horse.trainerId === null ? undefined : draft.trainers[horse.trainerId];
    const last = draft.seasonState.lastRun[horse.id];
    const ranThisWeek = last !== undefined && sameDate(last, date);
    const age = ageInYear(horse.birthYear, date.year);

    const injury = weeklyConditionInPlace(horse, trainer, age, ranThisWeek, rng);
    if (injury !== null && horse.ownerId === draft.playerOwnerId) {
      events.push({
        type: 'horse_injured',
        horseId: horse.id,
        kind: injury.kind,
        weeksOut: injury.weeksOut,
        date: { ...date },
      });
    }
  }
}

/**
 * 시즌 주간 시스템을 만든다. 정적 데이터(경마장·고정 일정·시리즈)는 호출 시점에 고정한다.
 * rng 는 ctx.rng.fork('season') 하위로만 쓴다.
 */
export function createSeasonSystem(data: SeasonStaticData): WeeklySystem {
  const courseById = new Map<RacecourseId, Racecourse>(data.courses.map((c) => [c.id, c] as const));
  const courseCountry: CourseCountryLookup = (id) => courseById.get(id)?.country;

  return {
    id: 'season',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      const events: GameEvent[] = [];
      const date: GameDate = { year: ctx.date.year, week: ctx.date.week };
      const rng = ctx.rng.fork('season');

      if (date.week === FIRST_WEEK && draft.seasonState.year !== date.year) {
        startNewSeason(draft, data.series, date, rng.fork('awards'), events);
      }
      runThisWeek(draft, data, courseCountry, date, rng, events);
      scheduleNextWeek(draft, data, date, rng);
      conditionWeek(draft, date, rng.fork('condition'), events);
      return events;
    },
  };
}
