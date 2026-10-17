// 경주 캘린더 뷰 모델(M6-U7, 종합 문서 E). React 없이 테스트할 수 있도록 순수 함수만 둔다.
// 고정 일정은 확정, 일반 개최는 후보·예상일 뿐이라 화면 문구도 그렇게 말한다.
import { getRacecourses } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import type { UpcomingRaceWeek } from '../../engine/season/lookahead';
import { compareDates, formatDateKo } from '../../engine/time/calendar';
import type {
  CountryCode,
  GameDate,
  GameState,
  HorseId,
  RaceGrade,
  RaceKind,
  RaceTemplate,
} from '../../engine/types';
import { countryKo, raceConditionsKo, raceGradeKo } from '../game/text';

/** 접힌 행(한 줄)에 보이는 대표 고정 레이스 개수(G1·G2 우선). 나머지는 '외 N'. */
export const CALENDAR_FIXED_PREVIEW_COUNT = 1;
/** 접힌 행(한 줄)에 보이는 내 말 칩 개수. 나머지는 '외 N'. */
export const CALENDAR_HORSE_PREVIEW_COUNT = 1;

const KIND_KO: Record<RaceKind, string> = {
  maiden: '미승리',
  novice: '노비스',
  handicap: '핸디캡',
  conditions: '조건',
  listed: '리스티드',
  group: '그룹',
};

/** 등급 우선순위: 작을수록 먼저. 등급이 없는 레이스(조건·핸디캡)는 맨 뒤 */
const GRADE_RANK: Record<RaceGrade, number> = { G1: 0, G2: 1, G3: 2, L: 3 };
const UNGRADED_RANK = 4;

export interface CalendarFixedRaceView {
  id: string;
  name: string;
  /** 등급 원본(G1·G2·G3·L). 등급이 없으면 null (배지 톤은 회색) */
  grade: RaceGrade | null;
  /** 등급 칸 표기: 'G1', '리스티드', '핸디캡 · 클래스 4' 같은 형식 */
  gradeLabel: string;
  /** 거리 칸 표기. 예: '1,600m' */
  distanceLabel: string;
  /** 조건 한 줄. 예: '3세 · 암말 · WFA' */
  conditionsLabel: string;
  /** 경마장 이름. 정적 데이터에 없으면 빈 문자열 */
  courseName: string;
  /** 나라 표기. 경마장을 못 찾으면 null */
  countryLabel: string | null;
}

export interface CalendarMeetingView {
  courseId: string;
  /** 경마장 이름(가상 이름) */
  label: string;
  /** 예: '영국 · 고정 일정' */
  certaintyLabel: string;
  /** 예상 레이스 종류 요약. 실제 편성을 보장하지 않는다 */
  expectedLabel: string;
}

export interface CalendarPlayerEntry {
  horseId: HorseId;
  name: string;
  /** 'declared' 는 이 주 출주 신청, 'planned' 는 조교사 제안·승인된 계획 */
  kind: 'declared' | 'planned';
  /** 배지 글자: '신청' 또는 '계획' */
  label: '신청' | '계획';
}

export interface CalendarWeekRow {
  key: string;
  dateLabel: string;
  date: GameDate;
  /** 접힌 행에 보이는 주요 고정 레이스(G1·G2 우선, 최대 CALENDAR_FIXED_PREVIEW_COUNT) */
  fixedPreview: CalendarFixedRaceView[];
  /** 접힌 행에서 '외 N'으로 가리는 고정 레이스 수 */
  fixedMoreCount: number;
  /** 펼친 행의 고정 레이스 전체(등급 우선, 같은 등급은 원래 순서) */
  fixed: CalendarFixedRaceView[];
  /** 접힌 행의 일반 개최 한 줄 요약(곳 수만). 예: '일반 개최 3곳' 또는 '일반 개최 없음' */
  generalSummary: string;
  /** 펼친 행의 일반 개최 나라별 개최 수. 예: '영국 2곳, 아일랜드 1곳' 또는 '없음' */
  generalDetail: string;
  /** 펼친 행의 경마장 목록(고정 일정 경마장 포함) */
  meetings: CalendarMeetingView[];
  /** 접힌 행에 보이는 내 말 칩(최대 CALENDAR_HORSE_PREVIEW_COUNT) */
  horsePreview: CalendarPlayerEntry[];
  /** 접힌 행에서 '외 N'으로 가리는 내 말 수 */
  horseMoreCount: number;
  /** 펼친 행의 내 말 계획·신청 전체 */
  playerEntries: CalendarPlayerEntry[];
}

function gradeRank(race: RaceTemplate): number {
  return race.grade === null ? UNGRADED_RANK : GRADE_RANK[race.grade];
}

/** 거리 칸 표기. 예: 1600 → '1,600m' */
export function calendarDistanceLabel(meters: number): string {
  return `${meters.toLocaleString('ko-KR')}m`;
}

function fixedRaceView(race: RaceTemplate, courses: ReadonlyMap<string, { name: string; country: CountryCode }>): CalendarFixedRaceView {
  const course = courses.get(race.racecourseId);
  return {
    id: race.id,
    name: race.name,
    grade: race.grade,
    gradeLabel: raceGradeKo(race),
    distanceLabel: calendarDistanceLabel(race.distance),
    conditionsLabel: raceConditionsKo(race),
    courseName: course?.name ?? '',
    countryLabel: course === undefined ? null : countryKo(course.country),
  };
}

function byIdAsc(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 이 주의 내 말 신청·계획 칩 목록(말 id 오름차순). 신청이 계획보다 우선한다. */
export function calendarPlayerEntries(state: GameState, date: GameDate): CalendarPlayerEntry[] {
  const out: CalendarPlayerEntry[] = [];
  for (const horse of Object.values(state.horses).sort(byIdAsc)) {
    if (horse.ownerId !== state.playerOwnerId) continue;
    const declaredInMeeting = state.seasonState.meetings.some(
      (m) =>
        compareDates(m.date, date) === 0 &&
        m.races.some(
          (r) =>
            r.status !== 'run' &&
            r.status !== 'abandoned' &&
            r.declarations.some((d) => d.horseId === horse.id && d.isPlayer),
        ),
    );
    const weekPlans = (state.seasonState.racePlans?.[horse.id] ?? []).filter(
      (p) => compareDates(p.date, date) === 0,
    );
    const declaredInPlan = weekPlans.some((p) => p.status === 'declared');
    const name = displayName(state, horse);
    if (declaredInMeeting || declaredInPlan) {
      out.push({ horseId: horse.id, name, kind: 'declared', label: '신청' });
    } else if (weekPlans.some((p) => p.status === 'proposed' || p.status === 'approved')) {
      out.push({ horseId: horse.id, name, kind: 'planned', label: '계획' });
    }
  }
  return out;
}

function meetingViewOf(week: UpcomingRaceWeek): CalendarMeetingView[] {
  return week.meetings.map((meeting) => {
    const certainty =
      meeting.certainty === 'confirmed'
        ? '개최 확정'
        : meeting.certainty === 'scheduled'
          ? '고정 일정'
          : '개최 후보';
    return {
      courseId: meeting.course.id,
      label: meeting.course.name,
      certaintyLabel: `${countryKo(meeting.course.country)} · ${certainty}`,
      expectedLabel: meeting.expectedKinds
        .map((kind) => {
          const distances = kind.distances.map((d) => d.distance);
          const range = distances.length === 0 ? '' : ` · ${Math.min(...distances)}~${Math.max(...distances)}m`;
          return `${KIND_KO[kind.kind]} ${Math.round(kind.weight * 100)}%${range}`;
        })
        .join(' / '),
    };
  });
}

/** 나라별 일반 개최 수 표기. 0곳인 나라는 뺀다. 개최 후보가 없으면 null */
function generalCountText(week: UpcomingRaceWeek): string | null {
  const parts = week.minorMeetingCount
    .filter((c) => c.count > 0)
    .map((c) => `${c.country === null ? '올웨더' : countryKo(c.country)} ${c.count}곳`);
  return parts.length === 0 ? null : parts.join(', ');
}

function generalTotal(week: UpcomingRaceWeek): number {
  return week.minorMeetingCount.reduce((sum, c) => sum + c.count, 0);
}

/**
 * 캘린더 주별 행 목록(들어온 주 순서 그대로).
 * 고정 레이스는 G1·G2 를 먼저 보여 주고, 일반 개최·예상 종류는 펼친 행에서만 쓴다.
 */
export function calendarWeekRows(weeks: readonly UpcomingRaceWeek[], state: GameState): CalendarWeekRow[] {
  const courses = new Map(getRacecourses().map((c) => [c.id, { name: c.name, country: c.country }]));
  return weeks.map((week) => {
    const ranked = week.fixedRaces
      .map((race, index) => ({ race, index }))
      .sort((a, b) => gradeRank(a.race) - gradeRank(b.race) || a.index - b.index)
      .map(({ race }) => fixedRaceView(race, courses));
    const generalCount = generalCountText(week);
    const playerEntries = calendarPlayerEntries(state, week.date);
    return {
      key: `${week.date.year}-${week.date.week}`,
      dateLabel: formatDateKo(week.date),
      date: { ...week.date },
      fixedPreview: ranked.slice(0, CALENDAR_FIXED_PREVIEW_COUNT),
      fixedMoreCount: Math.max(0, ranked.length - CALENDAR_FIXED_PREVIEW_COUNT),
      fixed: ranked,
      generalSummary: generalTotal(week) > 0 ? `일반 개최 ${generalTotal(week)}곳` : '일반 개최 없음',
      generalDetail: generalCount ?? '없음',
      meetings: meetingViewOf(week),
      horsePreview: playerEntries.slice(0, CALENDAR_HORSE_PREVIEW_COUNT),
      horseMoreCount: Math.max(0, playerEntries.length - CALENDAR_HORSE_PREVIEW_COUNT),
      playerEntries,
    };
  });
}
