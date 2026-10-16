/**
 * 시즌 주간 시스템 (M3-A6c, id 'season'; (d) 컨디션은 M3-C1).
 * 주마다 순서: (a) 연도 전환 → (b) 이번 주 개최 실행 → (c) 다음 주 개최 생성 → (d) 조교·휴양·부상 처리 → (e) 다음 주 AI 선언.
 * 개최 흐름: state.date 가 D 일 때 seasonState.meetings 에 D 주 개최가 들어 있다(플레이어 출주 접수 대상).
 * run(D) 이 D 주 개최를 실행하고 D+1 주 개최를 만든다.
 */
import { INJURY_KINDS } from '../config/injury';
import { MIN_FIELD_SIZE } from '../config/entries';
import { RESULTS_KEEP_SEASONS } from '../config/season';
import { weeklyConditionInPlace } from '../horse/conditioning';
import { ageInYear, nextDate } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  Going,
  HorseStatus,
  LeadingEntry,
  Meeting,
  NickEntry,
  PersonCareer,
  Racecourse,
  RacecourseId,
  RaceGrade,
  RaceId,
  RaceTemplate,
  Rng,
  SeriesDefinition,
  WeekContext,
  WeeklySystem,
} from '../types';
import { closeEconomyYear, prunePlayerLedger, recordMoney } from '../economy/ledger';
import { adjustReputation, reputationFromLeadingOwners } from '../economy/relations';
import { REPUTATION_SERIES } from '../config/economy';
import { computeSeasonAwards, hadRacesIn } from './awards';
import { declareAiRunners, reconsiderRivalG1Entries } from './declarations';
import type { CourseCountryLookup } from './eligibility';
import { buildWeekMeetings } from './meetings';
import { runMeetingInPlace } from './raceday';
import { emptyLeadingTables } from './state';
import { settleRacePlans } from './racePlan';

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
    if (ownerId !== null && owner !== undefined) {
      recordMoney(draft, ownerId, 'series_bonus', def.bonus, date, champion);
      if (ownerId === draft.playerOwnerId) adjustReputation(draft, REPUTATION_SERIES);
    }
    events.push({ type: 'series_completed', seriesId: def.id, horseId: champion, date: { ...date } });
  }
}

/** 리딩 한 줄을 통산 성적에 더한다(연말 누적, M4-P1). g1Wins 는 호출자가 센 값을 넘긴다. */
function addCareer(career: PersonCareer, entry: LeadingEntry, g1Wins: number): PersonCareer {
  return {
    runners: career.runners + entry.runners,
    wins: career.wins + entry.wins,
    places: career.places + entry.places,
    groupWins: career.groupWins + entry.groupWins,
    g1Wins: career.g1Wins + g1Wins,
    earnings: career.earnings + entry.earnings,
  };
}

/**
 * 연말 누적(M4-P1): 지난해 유럽 합산 리딩의 기수·조교사 항목을 각자 통산 성적에 더한다.
 * g1Wins 는 지난해 결과(raceResults)에서 G1 레이스의 1착 기수로 센다. 결과에는 조교사 id 가 없어
 * 조교사 g1Wins 는 0 증가로 둔다(리딩의 그룹 승 비율로 추정하지 않는다).
 */
function accumulateCareers(
  draft: GameState,
  prevYear: number,
  gradeById: ReadonlyMap<RaceId, RaceGrade | null>,
): void {
  const g1ByJockey: Record<string, number> = {};
  for (const result of draft.raceResults) {
    if (result.date.year !== prevYear || gradeById.get(result.raceId) !== 'G1') continue;
    for (const runner of result.runners) {
      if (runner.position !== 1) continue;
      g1ByJockey[runner.jockeyId] = (g1ByJockey[runner.jockeyId] ?? 0) + 1;
    }
  }
  for (const [jockeyId, entry] of Object.entries(draft.seasonState.leading.jockey)) {
    const jockey = draft.jockeys[jockeyId];
    if (jockey === undefined) continue;
    jockey.career = addCareer(jockey.career, entry, g1ByJockey[jockeyId] ?? 0);
  }
  for (const [trainerId, entry] of Object.entries(draft.seasonState.leading.trainer)) {
    const trainer = draft.trainers[trainerId];
    if (trainer === undefined) continue;
    trainer.career = addCareer(trainer.career, entry, 0);
  }
}

/**
 * (a) 연도 전환: 시리즈 챔피언 확정 → 지난해 시상 확정(레이스가 있었을 때만) → 연말 통산 성적 누적(M4-P1)
 * → 리딩·올해 기록 비우기 → 연도 갱신 → 오래된 결과 정리 → 지난해 경제 요약 확정·오래된 플레이어 장부 정리(M4-A2a).
 * awardsRng 는 호출자가 rng.fork('awards') 로 넘긴다. gradeById 는 고정 일정 레이스의 등급 표(G1 판정용).
 */
function startNewSeason(
  draft: GameState,
  series: readonly SeriesDefinition[],
  date: GameDate,
  awardsRng: Rng,
  events: GameEvent[],
  gradeById: ReadonlyMap<RaceId, RaceGrade | null>,
): void {
  closePointsSeries(draft, series, date, events);
  const prevYear = draft.seasonState.year;
  if (hadRacesIn(draft, prevYear)) {
    const awards = computeSeasonAwards(draft, prevYear, awardsRng);
    draft.awardsHistory.push(awards);
    reputationFromLeadingOwners(draft, awards.leading.owner);
    events.push({ type: 'awards_announced', year: prevYear, date: { ...date } });
  }
  accumulateCareers(draft, prevYear, gradeById);
  draft.seasonState.leading = emptyLeadingTables();
  draft.seasonState.leadingByCountry = {};
  draft.seasonState.performances = {};
  draft.seasonState.raceRatings = [];
  draft.seasonState.year = date.year;
  const oldest = date.year - RESULTS_KEEP_SEASONS;
  draft.raceResults = draft.raceResults.filter((r) => r.date.year >= oldest);
  // 연말 경제 요약(M4-A2a): 시리즈 보너스까지 지난해 합계에 들어간 뒤에 닫는다
  closeEconomyYear(draft, prevYear);
  prunePlayerLedger(draft, date);
}

/** 'classic' 태그가 붙은 템플릿 id (명성 보너스, M4-B1). 템플릿 배열이 같으면 다시 계산하지 않는다 */
const classicIdsCache = new WeakMap<readonly RaceTemplate[], readonly string[]>();
function classicIdsOf(templates: readonly RaceTemplate[]): readonly string[] {
  const hit = classicIdsCache.get(templates);
  if (hit !== undefined) return hit;
  const ids = templates.filter((t) => t.tags.includes('classic')).map((t) => t.id);
  classicIdsCache.set(templates, ids);
  return ids;
}

/**
 * (b) 이번 주 개최 실행: 기존 선언 확정(옛 저장본만 AI 선언) → 개최별 실행. 실행한 개최는 meetings 에서 뺀다.
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
  let thisWeek = draft.seasonState.meetings.filter((m) => sameDate(m.date, date));
  if (thisWeek.length === 0) return;
  draft.seasonState.meetings = draft.seasonState.meetings.filter((m) => !sameDate(m.date, date));

  const hasLegacy = thisWeek.some((m) => !m.races.some((sr) => sr.declarations.some((d) => !d.isPlayer)));
  thisWeek = reconsiderRivalG1Entries(draft, thisWeek, courseCountry);
  for (const meeting of thisWeek) {
    const hasAi = meeting.races.some((sr) => sr.declarations.some((d) => !d.isPlayer));
    if (!hasAi) continue;
    for (const sr of meeting.races) {
      if (sr.status === 'open') {
        sr.status = sr.declarations.length < MIN_FIELD_SIZE ? 'abandoned' : 'closed';
      }
    }
  }
  // 기존 선언도 함께 넘겨 옛 개최 보완 시 같은 주 중복 출주를 막는다.
  const declared = hasLegacy
    ? declareAiRunners(draft, thisWeek, rng.fork('declare'), courseCountry)
    : thisWeek;
  for (const meeting of declared) {
    const out = runMeetingInPlace(
      draft,
      meeting,
      { courses: data.courses, series: data.series, nicks: data.nicks, classicTemplateIds: classicIdsOf(data.templates) },
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

/** AI 선택 규칙은 그대로 쓰고, 플레이어 접수를 위해 확정 상태만 open 으로 되돌린다. */
export function declareUpcomingMeetings(
  state: GameState,
  meetings: readonly Meeting[],
  rng: Rng,
  courseCountry: CourseCountryLookup,
): Meeting[] {
  const declared = declareAiRunners(state, meetings, rng, courseCountry);
  for (const meeting of declared) {
    for (const sr of meeting.races) {
      if (sr.status === 'closed') sr.status = 'open';
    }
  }
  return declared;
}

/** (e) 조교·휴양 처리 후 다음 주 개최의 AI 출주를 미리 선언한다. */
function declareNextWeek(draft: GameState, date: GameDate, rng: Rng, courseCountry: CourseCountryLookup): void {
  const next = nextDate(date);
  const meetings = draft.seasonState.meetings.filter((m) => sameDate(m.date, next)
    && !m.races.some((sr) => sr.declarations.some((d) => !d.isPlayer)));
  const declared = declareUpcomingMeetings(draft, meetings, rng, courseCountry);
  const byId = new Map(declared.map((m) => [m.id, m]));
  draft.seasonState.meetings = draft.seasonState.meetings.map((m) => byId.get(m.id) ?? m);
}

/**
 * (d) 컨디션 주간 처리(M3-C1): in_training·resting 말을 id 순으로 돌며 조교·휴양·부상을 적용한다.
 * ranThisWeek 는 이번 주 개최 실행(b) 이후의 lastRun 으로 판정한다. 플레이어 말의 새 부상은 확진 여부에 따라 horse_injured 또는 injury_suspected 를 낸다.
 */
function conditionWeek(draft: GameState, date: GameDate, rng: Rng, events: GameEvent[]): void {
  const goingByHorse = new Map<string, Going>();
  const raceByHorse = new Map<string, RaceId>();
  for (const result of draft.raceResults) {
    if (!sameDate(result.date, date)) continue;
    for (const runner of result.runners) {
      goingByHorse.set(runner.horseId, result.going);
      raceByHorse.set(runner.horseId, result.raceId);
    }
  }
  for (const id of Object.keys(draft.horses).sort()) {
    const horse = draft.horses[id];
    if (horse === undefined || !CONDITION_STATUSES.includes(horse.status)) continue;

    const trainer = horse.trainerId === null ? undefined : draft.trainers[horse.trainerId];
    const last = draft.seasonState.lastRun[horse.id];
    const ranThisWeek = last !== undefined && sameDate(last, date);
    const age = ageInYear(horse.birthYear, date.year);

    const injury = weeklyConditionInPlace(horse, trainer, age, ranThisWeek, rng, {
      date, initialSeed: draft.initialSeed, isPlayer: horse.ownerId === draft.playerOwnerId,
      notable: (draft.stallions[id]?.realKey ?? null) !== null, events,
      going: goingByHorse.get(id),
      catastrophicInjuries: draft.settings.catastrophicInjuries, raceId: raceByHorse.get(id),
      farm: draft.farm,
    });
    if (horse.status === 'dead' && horse.ownerId !== null) {
      const owner = draft.owners[horse.ownerId];
      if (owner !== undefined) owner.horseIds = owner.horseIds.filter((horseId) => horseId !== id);
    }
    if (horse.status === 'dead') {
      for (const meeting of draft.seasonState.meetings) {
        for (const race of meeting.races) {
          if (race.status === 'open') race.declarations = race.declarations.filter((d) => d.horseId !== id);
        }
      }
      continue;
    }
    if (injury !== null && horse.ownerId === draft.playerOwnerId) {
      if (injury.diagnosed === false) {
        events.push({ type: 'injury_suspected', horseId: horse.id,
          region: INJURY_KINDS[injury.kind].region, date: { ...date } });
        continue;
      }
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
  const gradeById = new Map<RaceId, RaceGrade | null>(data.templates.map((t) => [t.id, t.grade] as const));

  return {
    id: 'season',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      const events: GameEvent[] = [];
      const date: GameDate = { year: ctx.date.year, week: ctx.date.week };
      const rng = ctx.rng.fork('season');

      if (date.week === FIRST_WEEK && draft.seasonState.year !== date.year) {
        startNewSeason(draft, data.series, date, rng.fork('awards'), events, gradeById);
      }
      runThisWeek(draft, data, courseCountry, date, rng, events);
      events.push(...settleRacePlans(draft, date));
      scheduleNextWeek(draft, data, date, rng);
      conditionWeek(draft, date, rng.fork('condition'), events);
      declareNextWeek(draft, date, rng.fork('declare-next'), courseCountry);
      return events;
    },
  };
}
