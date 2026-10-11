import {
  AW_HANDICAP_MIN_CLASS,
  AW_MEETINGS_PER_WEEK,
  CONDITIONS_RACE_CLASS,
  GENERATED_KIND_WEIGHTS,
  HANDICAP_CLASSES,
  HANDICAP_CLASS_WEIGHTS,
  MEETING_RACES_TARGET,
  MINOR_MEETINGS_PER_WEEK,
  type GeneratedRaceKind,
  type MinorCountry,
} from '../config/meetings';
import { isInPhase } from '../time/calendar';
import type {
  GameDate,
  Meeting,
  Race,
  RaceClass,
  RaceTemplate,
  Racecourse,
  RacecourseId,
  Rng,
  ScheduledRace,
} from '../types';
import { generateRace, pickWeighted } from './generateRace';
import { weekOfSlot } from './schedule';

export interface BuildWeekMeetingsArgs {
  /** 개최 주 (year, week) */
  date: GameDate;
  /** 고정 일정 레이스 전체(다른 주 것도 섞여 있어도 된다. 이번 주 것만 쓴다) */
  templates: readonly RaceTemplate[];
  courses: readonly Racecourse[];
  rng: Rng;
  /** SeasonState.nextGeneratedRace. 생성한 만큼 늘려서 돌려준다 */
  nextGeneratedRace: number;
}

export interface BuildWeekMeetingsResult {
  /** racecourseId 오름차순 */
  meetings: Meeting[];
  nextGeneratedRace: number;
}

const GENERATED_KINDS: readonly GeneratedRaceKind[] = ['maiden', 'novice', 'handicap'];
/** 일반 개최를 두는 나라 순서(상수 객체의 키 순서 = 결정적) */
const MINOR_COUNTRIES = Object.keys(MINOR_MEETINGS_PER_WEEK) as MinorCountry[];

function compareStr(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortCourses(list: readonly Racecourse[]): Racecourse[] {
  return [...list].sort((a, b) => compareStr(a.id, b.id));
}

function requireCourse(courseById: ReadonlyMap<RacecourseId, Racecourse>, id: RacecourseId): Racecourse {
  const course = courseById.get(id);
  if (course === undefined) {
    throw new RangeError(`고정 일정 레이스의 경마장 ${id} 를 찾을 수 없음`);
  }
  return course;
}

/** 고정 일정 레이스(RaceTemplate) → 개최일에 담는 Race 스냅샷. 일정 전용 필드는 뺀다. */
function toRaceSnapshot(t: RaceTemplate): Race {
  const race: Race = {
    id: t.id,
    name: t.name,
    racecourseId: t.racecourseId,
    distance: t.distance,
    kind: t.kind,
    grade: t.grade,
    raceClass: t.raceClass,
    conditions: { ...t.conditions },
    prizeMoney: [...t.prizeMoney],
    maxRunners: t.maxRunners,
  };
  if (t.layoutId !== undefined) {
    race.layoutId = t.layoutId;
  }
  return race;
}

function makeMeeting(date: GameDate, course: Racecourse, races: ScheduledRace[]): Meeting {
  return {
    id: `${course.id}:${date.year}-${date.week}`,
    date: { year: date.year, week: date.week },
    racecourseId: course.id,
    going: null,
    races,
  };
}

/** 자동 생성 경주의 클래스. 핸디캡은 시즌별 허용 범위에서 가중치로, 메이든·노비스는 고정값 */
function pickRaceClass(rng: Rng, kind: GeneratedRaceKind, turfSeason: boolean): RaceClass {
  if (kind !== 'handicap') {
    return CONDITIONS_RACE_CLASS;
  }
  const classes = turfSeason ? HANDICAP_CLASSES : HANDICAP_CLASSES.filter((c) => c >= AW_HANDICAP_MIN_CLASS);
  return pickWeighted(
    rng,
    classes.map((c) => ({ value: c, weight: HANDICAP_CLASS_WEIGHTS[c] })),
  );
}

/** 후보 경마장에서 n 곳을 rng 로 고른다(후보가 모자라면 있는 만큼). 결과는 id 오름차순. */
function pickCourses(rng: Rng, sortedCandidates: readonly Racecourse[], n: number): Racecourse[] {
  return sortCourses(rng.shuffle(sortedCandidates).slice(0, n));
}

/**
 * 한 주의 개최일 목록을 만든다.
 * 1) 이번 주 고정 일정 레이스를 경마장별로 묶고 cardOrder 순으로 담는다.
 * 2) 모든 개최일을 MEETING_RACES_TARGET 까지 자동 생성 경주로 채운다.
 * 3) 잔디 시즌: 나라별 MINOR_MEETINGS_PER_WEEK 만큼 이번 주 개최가 없는 잔디 경마장에서 일반 개최.
 *    올웨더 시즌: surface 'aw' 경마장에서 AW_MEETINGS_PER_WEEK 개.
 * 같은 입력·시드면 같은 결과다.
 */
export function buildWeekMeetings(args: BuildWeekMeetingsArgs): BuildWeekMeetingsResult {
  const { date, templates, courses, rng } = args;
  const week = date.week;
  const turfSeason = isInPhase(week, 'turf_flat');
  let seq = args.nextGeneratedRace;

  const courseById = new Map<RacecourseId, Racecourse>();
  for (const c of courses) {
    courseById.set(c.id, c);
  }

  const byCourse = new Map<RacecourseId, RaceTemplate[]>();
  for (const t of templates) {
    if (weekOfSlot(t.schedule) !== week) continue;
    const list = byCourse.get(t.racecourseId);
    if (list === undefined) {
      byCourse.set(t.racecourseId, [t]);
    } else {
      list.push(t);
    }
  }

  /** 자동 생성 경주 count 개. seq 를 앞에서부터 쓰고 늘린다. */
  const makeGenerated = (course: Racecourse, count: number): ScheduledRace[] => {
    const out: ScheduledRace[] = [];
    for (let i = 0; i < count; i++) {
      const kind = pickWeighted<GeneratedRaceKind>(
        rng,
        GENERATED_KINDS.map((k) => ({ value: k, weight: GENERATED_KIND_WEIGHTS[k] })),
      );
      const raceClass = pickRaceClass(rng, kind, turfSeason);
      const race = generateRace(rng, course, kind, raceClass, { year: date.year, seq, week });
      seq += 1;
      out.push({ race, templateId: null, status: 'open', declarations: [], simulated: false });
    }
    return out;
  };

  const meetings: Meeting[] = [];
  const used = new Set<RacecourseId>();

  const templateCourseIds = [...byCourse.keys()].sort(compareStr);
  for (const id of templateCourseIds) {
    const course = requireCourse(courseById, id);
    const list = [...(byCourse.get(id) ?? [])].sort(
      (a, b) => a.cardOrder - b.cardOrder || compareStr(a.id, b.id),
    );
    const races: ScheduledRace[] = list.map((t) => ({
      race: toRaceSnapshot(t),
      templateId: t.id,
      status: 'open',
      declarations: [],
      simulated: false,
    }));
    races.push(...makeGenerated(course, Math.max(0, MEETING_RACES_TARGET - races.length)));
    meetings.push(makeMeeting(date, course, races));
    used.add(id);
  }

  if (turfSeason) {
    for (const country of MINOR_COUNTRIES) {
      const n = MINOR_MEETINGS_PER_WEEK[country];
      const candidates = sortCourses(
        courses.filter((c) => c.country === country && c.surface === 'turf' && !used.has(c.id)),
      );
      for (const course of pickCourses(rng, candidates, n)) {
        used.add(course.id);
        meetings.push(makeMeeting(date, course, makeGenerated(course, MEETING_RACES_TARGET)));
      }
    }
  } else {
    const candidates = sortCourses(courses.filter((c) => c.surface === 'aw' && !used.has(c.id)));
    for (const course of pickCourses(rng, candidates, AW_MEETINGS_PER_WEEK)) {
      used.add(course.id);
      meetings.push(makeMeeting(date, course, makeGenerated(course, MEETING_RACES_TARGET)));
    }
  }

  meetings.sort((a, b) => compareStr(a.racecourseId, b.racecourseId));
  return { meetings, nextGeneratedRace: seq };
}
