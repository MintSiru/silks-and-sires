import type { Grade, GameState, Horse, PlannedRace } from '../../engine/types';
import { getRaceTemplates } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import { assessForPlayer } from '../../engine/horse/playerView';
import { ageInYear } from '../../engine/time/calendar';
import { sexKo, statusKo } from '../game/text';
import { mareBookingKo } from '../breeding/bookView';
import { mareQuality } from '../../engine/breeding/matingPlan';
import { matingQualityGrade } from '../breeding/matingPlanView';
import {
  conditionOf,
  mareBreedingView,
  pendingMatingProposal,
  recentRuns,
  RECENT_RUN_COUNT,
  type ConditionView,
  type MareBreedingView,
  type RunForm,
} from '../horse/horseDetailView';
import { emptyRacePlanHint, racePlanRows, targetLabel } from '../season/racePlanView';

export const STABLE_TABS = [
  { id: 'active', label: '현역마' },
  { id: 'young', label: '육성마' },
  { id: 'mares', label: '번식 암말' },
  { id: 'studs', label: '종마' },
] as const;
export type StableTab = (typeof STABLE_TABS)[number]['id'];
export function stableGroup(status: Horse['status']): StableTab | null {
  switch (status) {
    case 'in_training':
    case 'resting':
      return 'active';
    case 'foal':
    case 'weanling':
    case 'yearling':
      return 'young';
    case 'broodmare':
      return 'mares';
    case 'stud':
      return 'studs';
    default:
      return null;
  }
}

/** 번식 암말 표의 '최근 산자' 줄 수(최신순). 화면 표시 상수(밸런스 아님). */
export const RECENT_FOAL_COUNT = 2;

/** 번식 암말 표의 산자 한 줄: 이름 · 나이 · 성적 */
export interface FoalRowView {
  name: string;
  ageKo: string;
  recordKo: string;
}

/** '다음 출주' 두 줄: 1줄 날짜·등급·거리, 2줄 레이스명. 조건 목표면 등급·거리 없이 조건 문구. */
export interface NextRaceView {
  dateLabel: string;
  /** GradeBadge 글자. 등급 없는 레이스는 '클래스 N', 조건 목표는 null */
  gradeText: string | null;
  distanceText: string | null;
  title: string;
  away: string;
  statusLabel: string;
}

export interface StableRow {
  id: string;
  name: string;
  ageSex: string;
  status: string;
  tone: 'good' | 'caution' | 'danger';
  trainer: string;
  rating: number | string;
  /** 종합 등급(평가 기준) */
  overall: Grade;
  condition: ConditionView;
  /** 최근 출주 착순(최신순, 최대 RECENT_RUN_COUNT) */
  form: RunForm[];
  /** 기존 한 줄 문구(검색·테스트용). 다음 출주 상세는 nextRace 를 쓴다 */
  next: string;
  nextRace: NextRaceView | null;
  warnings: string[];
  /** 번식 암말 탭 전용: 번식 상태·출산 예정·교배 계획. 다른 탭은 null */
  breeding: MareBreedingView | null;
  /** 번식 암말 탭 전용: 최근 산자(최신순, 최대 RECENT_FOAL_COUNT). 다른 탭은 빈 배열 */
  foals: FoalRowView[];
  /** 번식 암말 탭 전용: 산자 블랙타입 입상 누계. 다른 탭은 null */
  blackType: number | null;
}

/** 플레이어 소유, 탭에 속하고 검색어에 맞는 말(id 순) */
export function stableHorses(state: GameState, tab: StableTab, query = ''): Horse[] {
  const needle = query.trim().toLocaleLowerCase();
  return Object.values(state.horses)
    .filter(
      (h) =>
        h.ownerId === state.playerOwnerId &&
        stableGroup(h.status) === tab &&
        displayName(state, h).toLocaleLowerCase().includes(needle),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** 탭 버튼의 두수 표시용(평가 계산 없이 센다) */
export function stableCount(state: GameState, tab: StableTab): number {
  return stableHorses(state, tab).length;
}

/** 열 폭에 맞추려고 거리는 미터만(예: 2012m → 2,012m). 펄롱은 말 상세 전적에서 본다. */
/** 거리 표기(천 단위 쉼표). 예: 2012 → '2,012m' — 홈 출주 예정도 같이 쓴다 */
export function metersKo(meters: number): string {
  return `${String(Math.round(meters)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}m`;
}

function nextRaceView(plan: PlannedRace, row: { dateLabel: string; away: string; statusLabel: string }): NextRaceView {
  const race = plan.templateId ? getRaceTemplates().find((t) => t.id === plan.templateId) : undefined;
  return {
    dateLabel: row.dateLabel,
    gradeText: race ? (race.grade ?? `클래스 ${race.raceClass}`) : null,
    distanceText: race ? metersKo(race.distance) : null,
    title: race ? race.name : plan.target ? targetLabel(plan.target) : '레이스 정보 없음',
    away: row.away,
    statusLabel: row.statusLabel,
  };
}

/** 번식 암말의 최근 산자(최신순). 기록이 없는 산자 id 는 건너뛴다. */
function foalRowsOf(state: GameState, foalIds: readonly string[]): FoalRowView[] {
  return foalIds
    .slice(-RECENT_FOAL_COUNT)
    .reverse()
    .flatMap((id): FoalRowView[] => {
      const foal = state.horses[id];
      if (foal === undefined) return [];
      return [
        {
          name: displayName(state, foal),
          ageKo: `${ageInYear(foal.birthYear, state.date.year)}세`,
          recordKo: foal.record.starts === 0 ? '출주 전' : `${foal.record.starts}전 ${foal.record.wins}승`,
        },
      ];
    });
}

export function stableRows(state: GameState, tab: StableTab, query = ''): StableRow[] {
  const nameOf = (id: string) => (state.horses[id] ? displayName(state, state.horses[id]!) : '—');
  return stableHorses(state, tab, query).map((h) => {
    const plans = (state.seasonState.racePlans?.[h.id] ?? [])
      .filter((p) => ['proposed', 'approved', 'declared'].includes(p.status))
      .sort((a, b) => a.date.year - b.date.year || a.date.week - b.date.week);
    const nextRow = racePlanRows(plans, {
      requireApproval: state.settings.autoApproveRacePlans === false,
      country: (h.trainerId === null ? undefined : state.trainers[h.trainerId]?.country) ?? h.countryOfBirth,
      currentDate: state.date,
    })[0];
    const nextPlan = plans[0];
    const mare = state.mares[h.id];
    const stud = state.stallions[h.id];
    const warnings = [
      h.condition.injury ? '부상 확인' : '',
      h.nameRegistered === false ? '이름 필요' : '',
      tab === 'active' && h.trainerId === null ? '조교사 미배정' : '',
      state.settings.autoApproveRacePlans === false && plans.some((p) => p.status === 'proposed') ? '제안 검토' : '',
    ].filter(Boolean);
    return {
      id: h.id,
      name: nameOf(h.id),
      ageSex: `${ageInYear(h.birthYear, state.date.year)}세 · ${sexKo(h.sex, h.gelded)}`,
      status: statusKo(h.status, ageInYear(h.birthYear, state.date.year)),
      tone: h.condition.injury ? 'danger' : h.status === 'resting' ? 'caution' : 'good',
      trainer: h.trainerId === null ? '미배정' : (state.trainers[h.trainerId]?.name ?? '—'),
      rating: h.officialRating ?? '미부여',
      /* 번식 암말은 번식 화면(배합 계획 표)과 같은 수준 등급(mareQuality)을 쓴다. 나머지는 평가 종합 등급. */
      overall:
        tab === 'mares' && mare !== undefined
          ? matingQualityGrade(mareQuality(state, h.id))
          : assessForPlayer(state, h.id).conformation.overall,
      condition: conditionOf(h),
      form: recentRuns(state, h.id, RECENT_RUN_COUNT),
      next: mare
        ? (mareBookingKo(mare, nameOf) ?? '교배 예약 없음')
        : stud
          ? `북 ${stud.bookedThisSeason}/${stud.bookLimit}`
          : nextRow
            ? `${nextRow.dateLabel} · ${nextRow.name}${nextRow.away} · ${nextRow.statusLabel}`
            : tab === 'active' ? emptyRacePlanHint(state, h) : '계획 없음',
      nextRace: nextRow && nextPlan && !mare && !stud ? nextRaceView(nextPlan, nextRow) : null,
      warnings,
      breeding: tab === 'mares' && mare !== undefined ? mareBreedingView(mare, nameOf, pendingMatingProposal(state.stud.matingProposals, h.id)) : null,
      foals: tab === 'mares' && mare !== undefined ? foalRowsOf(state, mare.foals) : [],
      blackType: tab === 'mares' && mare !== undefined ? mare.blackTypeProduce : null,
    };
  });
}
