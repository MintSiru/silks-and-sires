import { getRaceTemplates, getRacecourses } from '../../engine/data/staticData';
import type { RacePlanError } from '../../engine/season/racePlan';
import type { UpcomingRaceWeek } from '../../engine/season/lookahead';
import { formatDateKo } from '../../engine/time/calendar';
import type { PlannedRace, RaceKind, RacePlanTarget } from '../../engine/types';
import { countryKo, raceConditionsKo, raceGradeKo } from '../game/text';

const KIND_KO: Record<RaceKind, string> = {
  maiden: '미승리', novice: '노비스', handicap: '핸디캡', conditions: '조건', listed: '리스티드', group: '그룹',
};
const STATUS_KO: Record<PlannedRace['status'], string> = {
  proposed: '새 제안', approved: '승인됨', declared: '출주 신청됨', run: '출주 완료', skipped: '건너뜀',
};
const ERROR_KO: Record<RacePlanError, string> = {
  not_found: '말을 찾을 수 없습니다.', not_player_horse: '내 말만 계획을 정할 수 있습니다.',
  invalid_status: '지금 상태에서는 계획을 변경할 수 없습니다.', invalid_plan: '날짜와 출주 조건을 확인하세요.',
  plan_not_found: '출주 계획을 찾을 수 없습니다.',
};

export function racePlanErrorKo(error: RacePlanError): string { return ERROR_KO[error]; }

function targetLabel(target: RacePlanTarget): string {
  const classes = target.minClass === undefined && target.maxClass === undefined ? ''
    : ` · 클래스 ${target.minClass ?? 1}~${target.maxClass ?? 7}`;
  return `${target.kinds.map((k) => KIND_KO[k]).join('/')} · ${target.minDistance}~${target.maxDistance}m${classes}`;
}

export function racePlanRows(plans: readonly PlannedRace[]) {
  return plans.map((plan) => {
    const race = getRaceTemplates().find((t) => t.id === plan.templateId);
    const course = race === undefined ? undefined : getRacecourses().find((c) => c.id === race.racecourseId);
    return { id: plan.id, dateLabel: formatDateKo(plan.date), statusLabel: STATUS_KO[plan.status],
      name: race === undefined ? plan.target === null ? '레이스 정보 없음' : targetLabel(plan.target)
        : `${race.name} · ${course?.name ?? ''} · ${raceGradeKo(race)} · ${race.distance}m`,
      note: plan.note, canApprove: plan.status === 'proposed', canRemove: plan.status === 'proposed' || plan.status === 'approved' || plan.status === 'skipped' };
  });
}

export function upcomingRaceRows(weeks: readonly UpcomingRaceWeek[]) {
  return weeks.map((week) => ({
    key: `${week.date.year}-${week.date.week}`, dateLabel: formatDateKo(week.date),
    fixed: week.fixedRaces.map((race) => ({ id: race.id,
      label: `${race.name} · ${week.meetings.find((m) => m.course.id === race.racecourseId)?.course.name ?? ''} · ${raceGradeKo(race)} · ${race.distance}m · ${raceConditionsKo(race)}` })),
    meetings: week.meetings.map((meeting) => ({ id: meeting.course.id,
      label: `${meeting.course.name} (${countryKo(meeting.course.country)}) · ${meeting.certainty === 'possible' ? '개최 후보' : '개최 예정'}`,
      expected: meeting.expectedKinds.map((kind) => {
        const distances = kind.distances.map((d) => d.distance);
        return `${KIND_KO[kind.kind]} ${Math.round(kind.weight * 100)}% · ${Math.min(...distances)}~${Math.max(...distances)}m · 클래스 ${kind.classes.map((c) => c.raceClass).join('/')}`;
      }).join(' / '),
    })),
    countLabel: week.minorMeetingCount.filter((c) => c.count > 0)
      .map((c) => `${c.country === null ? '올웨더' : countryKo(c.country)} ${c.count}곳`).join(', '),
  }));
}
