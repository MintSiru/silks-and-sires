import { getRaceTemplates, getRacecourses } from '../../engine/data/staticData';
import { TWO_YO_FROM_WEEK } from '../../engine/config/meetings';
import { RACE_PLAN_TARGET_SLACK_WEEKS } from '../../engine/config/racePlan';
import { displayName } from '../../engine/naming/register';
import type { RacePlanError } from '../../engine/season/racePlan';
import type { UpcomingRaceWeek } from '../../engine/season/lookahead';
import { ageInYear, compareDates, formatDateKo } from '../../engine/time/calendar';
import type {
  CountryCode,
  GameDate,
  GameState,
  Horse,
  PlannedRace,
  RaceKind,
  RacePlanTarget,
} from '../../engine/types';
import type { StatusTone } from '../common/badges';
import { countryKo, raceConditionsKo, raceGradeKo } from '../game/text';

const KIND_KO: Record<RaceKind, string> = {
  maiden: '미승리',
  novice: '노비스',
  handicap: '핸디캡',
  conditions: '조건',
  listed: '리스티드',
  group: '그룹',
};
const STATUS_KO: Record<PlannedRace['status'], string> = {
  proposed: '조교사 제안(진행 예정)',
  approved: '승인됨',
  declared: '출주 신청됨',
  run: '출주 완료',
  skipped: '건너뜀',
};
const ERROR_KO: Record<RacePlanError, string> = {
  not_found: '말을 찾을 수 없습니다.',
  not_player_horse: '내 말만 계획을 정할 수 있습니다.',
  invalid_status: '지금 상태에서는 계획을 변경할 수 없습니다.',
  invalid_plan: '날짜와 출주 조건을 확인하세요.',
  plan_not_found: '출주 계획을 찾을 수 없습니다.',
};

export function racePlanErrorKo(error: RacePlanError): string {
  return ERROR_KO[error];
}

/** 조건 목표의 클래스 표시. 클래스 조건이 없으면 null. 예: '클래스 5', '클래스 4~5' */
function classRangeLabel(target: RacePlanTarget): string | null {
  if (target.minClass === undefined && target.maxClass === undefined) return null;
  const minClass = target.minClass ?? 1;
  const maxClass = target.maxClass ?? 7;
  return `클래스 ${minClass === maxClass ? minClass : `${minClass}~${maxClass}`}`;
}

/** 조건 목표의 대략 거리(중간값을 100m 단위로 반올림). 표시와 거리 힌트 비교에 함께 쓴다. */
function targetDistance(target: RacePlanTarget): number {
  return Math.round((target.minDistance + target.maxDistance) / 2 / 100) * 100;
}

/** 조건 목표 등급 배지 글자. 리스티드 단독이면 L, 그 밖에는 클래스(없으면 종류 이름). */
function targetGradeLabel(target: RacePlanTarget): string {
  const first = target.kinds[0];
  if (first === undefined) return '—';
  if (first === 'listed' && target.kinds.length === 1) return 'L';
  return classRangeLabel(target) ?? KIND_KO[first];
}

export function targetLabel(target: RacePlanTarget): string {
  const classes = classRangeLabel(target);
  return `${target.kinds.map((k) => KIND_KO[k]).join('/')} · 약 ${targetDistance(target).toLocaleString('ko-KR')}m 전후${classes === null ? '' : ` · ${classes}`}`;
}

/**
 * 말의 거리 힌트(min~max) 밖이면 화면 주 문구가 되는 거리 판단 문구. 안이면 null.
 * 예: '거리 연장 도전 — 적성 상한보다 214m 김', '거리 단축 — 적성 하한보다 300m 짧음'
 * 엔진 메모 문자열은 바꾸지 않는다. 화면에서는 이 문구만 보이고 원문은 '조교사 메모' 펼침으로 간다.
 */
export function distanceNoteKo(distance: number, hint: { min: number; max: number }): string | null {
  if (distance > hint.max) {
    return `거리 연장 도전 — 적성 상한보다 ${(distance - hint.max).toLocaleString('ko-KR')}m 김`;
  }
  if (distance < hint.min) {
    return `거리 단축 — 적성 하한보다 ${(hint.min - distance).toLocaleString('ko-KR')}m 짧음`;
  }
  return null;
}

/**
 * 출주 계획 상태 문구·톤. 상태 조작과 같은 모드(자동 / 승인제)에 맞춘다.
 * requireApproval = true 면 제안은 '승인 대기'(주의), 아니면 '자동 출주 예정'(좋음).
 */
export function planStatusView(
  status: PlannedRace['status'],
  requireApproval: boolean,
  searching = false,
): { label: string; tone: StatusTone } {
  if (searching) return { label: SEARCHING_LABEL, tone: 'warn' };
  if (status === 'proposed') {
    return requireApproval ? { label: '승인 대기', tone: 'warn' } : { label: '자동 출주 예정', tone: 'good' };
  }
  if (status === 'approved') return { label: '확정', tone: 'good' };
  if (status === 'declared') return { label: '출주 신청됨', tone: 'good' };
  if (status === 'run') return { label: '출주 완료', tone: 'muted' };
  return { label: '건너뜀', tone: 'muted' };
}

/** 지난 조건 목표 계획의 찾는 중 문구(상태 칸·마구간 다음 출주 공통) */
export const SEARCHING_LABEL = '맞는 레이스 찾는 중';

/**
 * 날짜가 지났는데 아직 진행 중(제안·확정)인 조건 목표 계획인지. 레이스가 정해진 계획은 해당하지 않는다.
 * currentDate 가 없으면 false.
 */
export function isSearchingTarget(plan: PlannedRace, currentDate: GameDate | undefined): boolean {
  if (currentDate === undefined || plan.target === null) return false;
  if (plan.status !== 'proposed' && plan.status !== 'approved') return false;
  return compareDates(plan.date, currentDate) < 0;
}

export function racePlanRows(
  plans: readonly PlannedRace[],
  context: {
    requireApproval?: boolean;
    country?: CountryCode;
    /** 말의 거리 힌트. 주면 힌트 밖일 때 주 문구를 거리 판단 문구로 바꾸고 엔진 메모는 펼침으로 뺀다. */
    distanceHint?: { min: number; max: number };
    /** 지금 날짜. 주면 날짜가 지난 조건 목표 계획(제안·확정)을 '맞는 레이스 찾는 중'으로 표시한다. */
    currentDate?: GameDate;
  } = {},
) {
  return plans.map((plan) => {
    const race = getRaceTemplates().find((t) => t.id === plan.templateId);
    const course =
      race === undefined ? undefined : getRacecourses().find((c) => c.id === race.racecourseId);
    const country = course?.country ?? plan.target?.country;
    const away =
      country && context.country && country !== context.country
        ? ` · 원정: ${countryKo(country)}`
        : '';
    const target = plan.target;
    const distance =
      race !== undefined ? race.distance : target !== null ? targetDistance(target) : null;
    const hintNote =
      context.distanceHint !== undefined && distance !== null
        ? distanceNoteKo(distance, context.distanceHint)
        : null;
    const searching = isSearchingTarget(plan, context.currentDate);
    return {
      id: plan.id,
      status: plan.status,
      dateLabel: formatDateKo(plan.date),
      /** 날짜가 지난 조건 목표: 엔진이 RACE_PLAN_TARGET_SLACK_WEEKS 주까지 맞는 레이스를 더 찾는다 */
      searching,
      statusLabel: searching
        ? `${SEARCHING_LABEL} (최대 ${RACE_PLAN_TARGET_SLACK_WEEKS}주)`
        : plan.status === 'proposed'
          ? context.requireApproval
            ? '검토 대기'
            : '조교사 제안(진행 예정)'
          : STATUS_KO[plan.status],
      name:
        race === undefined
          ? target === null
            ? '레이스 정보 없음'
            : targetLabel(target)
          : `${race.name} · ${course?.name ?? ''} · ${raceGradeKo(race)} · ${race.distance}m`,
      /** 화면 등급 배지 글자: G1~G3·L 은 색, 핸디캡·조건 등은 '클래스 N'(회색) */
      gradeLabel:
        race !== undefined
          ? (race.grade ?? `클래스 ${race.raceClass}`)
          : target === null
            ? '—'
            : targetGradeLabel(target),
      /** 화면 첫 줄: 레이스 이름(또는 조건 종류) */
      titleLine:
        race !== undefined
          ? race.name
          : target === null
            ? '레이스 정보 없음'
            : target.kinds.map((k) => KIND_KO[k]).join('/'),
      /** 화면 둘째 줄(보조): 경마장 · 거리 (또는 조건 목표의 대략 거리) */
      conditionLine:
        race !== undefined
          ? `${course?.name ?? ''} · ${race.distance.toLocaleString('ko-KR')}m`
          : target === null
            ? ''
            : `약 ${targetDistance(target).toLocaleString('ko-KR')}m 전후`,
      away,
      /** 화면 주 문구: 힌트 밖이면 거리 판단 문구 하나, 안이면 엔진 메모 원문 */
      note: hintNote ?? plan.note,
      /** 엔진 메모 원문(펼침용). 바꾸지 않는다. */
      engineNote: plan.note,
      /** true 면 주 문구는 거리 판단이고 원문은 '조교사 메모' 펼침 안에 있다 */
      noteFolded: hintNote !== null,
      canApprove: plan.status === 'proposed',
      canRemove:
        plan.status === 'proposed' || plan.status === 'approved' || plan.status === 'skipped',
    };
  });
}

export function racePlanSections(plans: readonly PlannedRace[]) {
  const history = plans
    .filter((p) => p.status === 'run' || p.status === 'skipped')
    .sort((a, b) => compareDates(b.date, a.date));
  return {
    active: plans
      .filter((p) => p.status !== 'run' && p.status !== 'skipped')
      .sort((a, b) => compareDates(a.date, b.date)),
    history: history.slice(0, 3),
    historyCount: history.length,
  };
}

export function emptyRacePlanHint(state: GameState, horse: Horse): string {
  if (ageInYear(horse.birthYear, state.date.year) === 2 && state.date.week < TWO_YO_FROM_WEEK)
    return `2세 데뷔 가능: ${formatDateKo({ year: state.date.year, week: TWO_YO_FROM_WEEK }).replace(/^\d+년 /, '')}부터`;
  if (horse.condition.injury) return '부상으로 출주 계획을 쉬고 있습니다.';
  if (horse.trainerId === null) return '조교사 미배정: 개요에서 조교사를 배정하세요.';
  if (horse.status === 'resting') return '휴양 중에는 출주 계획을 쉬고 있습니다.';
  return '앞으로 12주에 맞는 레이스가 없습니다. 조교사에게 다시 짜기를 요청할 수 있습니다.';
}

export function upcomingRaceRows(weeks: readonly UpcomingRaceWeek[], state?: GameState) {
  return weeks.map((week) => ({
    key: `${week.date.year}-${week.date.week}`,
    dateLabel: formatDateKo(week.date),
    fixedSummary: week.fixedRaces.map((race) => `${race.name} · ${raceGradeKo(race)}`).join(' / '),
    meetingSummary: week.meetings
      .map((m) => `${m.course.name} (${countryKo(m.course.country)})`)
      .join(' · '),
    kindsSummary: [
      ...new Set(week.meetings.flatMap((m) => m.expectedKinds.map((k) => KIND_KO[k.kind]))),
    ].join('·'),
    playerPlans: state
      ? Object.values(state.horses)
          .filter(
            (horse) =>
              horse.ownerId === state.playerOwnerId &&
              ((state.seasonState.racePlans?.[horse.id] ?? []).some(
                (p) =>
                  compareDates(p.date, week.date) === 0 &&
                  ['proposed', 'approved', 'declared'].includes(p.status),
              ) ||
                state.seasonState.meetings.some(
                  (m) =>
                    compareDates(m.date, week.date) === 0 &&
                    m.races.some(
                      (r) =>
                        r.status !== 'run' &&
                        r.status !== 'abandoned' &&
                        r.declarations.some((d) => d.horseId === horse.id && d.isPlayer),
                    ),
                )),
          )
          .map((h) => ({ horseId: h.id, name: displayName(state, h) }))
      : [],
    fixed: week.fixedRaces.map((race) => ({
      id: race.id,
      label: `${race.name} · ${week.meetings.find((m) => m.course.id === race.racecourseId)?.course.name ?? ''} · ${raceGradeKo(race)} · ${race.distance}m · ${raceConditionsKo(race)}`,
    })),
    meetings: week.meetings.map((meeting) => ({
      id: meeting.course.id,
      label: `${meeting.course.name} (${countryKo(meeting.course.country)}) · ${meeting.certainty === 'possible' ? '개최 후보' : '개최 예정'}`,
      expected: meeting.expectedKinds
        .map((kind) => {
          const distances = kind.distances.map((d) => d.distance);
          return `${KIND_KO[kind.kind]} ${Math.round(kind.weight * 100)}% · ${Math.min(...distances)}~${Math.max(...distances)}m · 클래스 ${kind.classes.map((c) => c.raceClass).join('/')}`;
        })
        .join(' / '),
    })),
    countLabel: week.minorMeetingCount
      .filter((c) => c.count > 0)
      .map((c) => `${c.country === null ? '올웨더' : countryKo(c.country)} ${c.count}곳`)
      .join(', '),
  }));
}
