import { getRaceTemplates, getRacecourses } from '../../engine/data/staticData';
import { TWO_YO_FROM_WEEK } from '../../engine/config/meetings';
import { displayName } from '../../engine/naming/register';
import type { RacePlanError } from '../../engine/season/racePlan';
import type { UpcomingRaceWeek } from '../../engine/season/lookahead';
import { ageInYear, compareDates, formatDateKo } from '../../engine/time/calendar';
import type {
  CountryCode,
  GameState,
  Horse,
  PlannedRace,
  RaceKind,
  RacePlanTarget,
} from '../../engine/types';
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

export function targetLabel(target: RacePlanTarget): string {
  const minClass = target.minClass ?? 1;
  const maxClass = target.maxClass ?? 7;
  const classes =
    target.minClass === undefined && target.maxClass === undefined
      ? ''
      : ` · 클래스 ${minClass === maxClass ? minClass : `${minClass}~${maxClass}`}`;
  const distance = Math.round((target.minDistance + target.maxDistance) / 2 / 100) * 100;
  return `${target.kinds.map((k) => KIND_KO[k]).join('/')} · 약 ${distance.toLocaleString('ko-KR')}m 전후${classes}`;
}

export function racePlanRows(
  plans: readonly PlannedRace[],
  context: { requireApproval?: boolean; country?: CountryCode } = {},
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
    return {
      id: plan.id,
      status: plan.status,
      dateLabel: formatDateKo(plan.date),
      statusLabel:
        plan.status === 'proposed'
          ? context.requireApproval
            ? '검토 대기'
            : '조교사 제안(진행 예정)'
          : STATUS_KO[plan.status],
      name:
        race === undefined
          ? plan.target === null
            ? '레이스 정보 없음'
            : targetLabel(plan.target)
          : `${race.name} · ${course?.name ?? ''} · ${raceGradeKo(race)} · ${race.distance}m`,
      away,
      note: plan.note,
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
