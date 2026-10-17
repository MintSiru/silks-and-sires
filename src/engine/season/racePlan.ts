import {
  FACILITY_NEUTRAL_GRADE, FACILITY_RECOVERY_PER_GRADE, FITNESS_PEAK_ZONE,
  INJURED_DETRAIN, INJURED_FITNESS_FLOOR, JUVENILE_GAIN_BASE, JUVENILE_GAIN_SLOPE,
  MAX_FATIGUE_TO_RUN, PEAK_ZONE_GAIN_MULT, REST_FATIGUE_RECOVERY,
  SKILL_GAIN_BASE, SKILL_GAIN_SLOPE, SKILL_MAX, TRAIN_FATIGUE_RECOVERY, TRAIN_FITNESS_GAIN,
} from '../config/conditioning';
import {
  DISTANCE_TOLERANCE, GROUP_OR_FLOOR, JUVENILE_AGE, MIN_FITNESS_TO_RUN,
  MIN_WEEKS_BETWEEN_GROUP_RUNS, MIN_WEEKS_BETWEEN_RUNS,
} from '../config/entries';
import { BASE_WEIGHT_LB, HANDICAP_OR_RANGE } from '../config/meetings';
import {
  RACE_PLAN_CLASS_SCORE, RACE_PLAN_DISTANCE_SCORE, RACE_PLAN_DISTANCE_SLACK_M, RACE_PLAN_INTERVAL,
  RACE_PLAN_HISTORY_WEEKS, RACE_PLAN_MAX_RUNS, RACE_PLAN_MIN_OR, RACE_PLAN_RENEW_WEEKS,
  RACE_PLAN_TARGET_SLACK_WEEKS, RACE_PLAN_WEEKS,
} from '../config/racePlan';
import { CONDITION_MAX } from '../config/season';
import { WEEKS_PER_YEAR } from '../config/game';
import { addWeeks, ageInYear, compareDates, weeksBetween } from '../time/calendar';
import type {
  GameDate, GameEvent, GameState, Horse, HorseId, PlannedRace, Race,
  RacePlanTarget, WeeklySystem,
} from '../types';
import { isDistanceFit, isEligible } from './eligibility';
import { upcomingRaces, type RaceCalendarData, type UpcomingRaceWeek } from './lookahead';
import { declarePlayerHorseInPlace, type DeclareError, type PlayerResult } from './player';

export type RacePlanError = 'not_found' | 'not_player_horse' | 'invalid_status' | 'invalid_plan' | 'plan_not_found';
type PlanResult = PlayerResult<RacePlanError>;

function compareId(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function playerError(state: GameState, horseId: HorseId): RacePlanError | null {
  const horse = state.horses[horseId];
  if (horse === undefined) return 'not_found';
  return horse.ownerId === state.playerOwnerId ? null : 'not_player_horse';
}

function homeCountry(state: GameState, horse: Horse) {
  return (horse.trainerId === null ? undefined : state.trainers[horse.trainerId]?.country) ?? horse.countryOfBirth;
}

/** 부상 중 감소와 조교 회복만 예측한다. 새 부상·치료 효과를 추첨하지 않는다. */
function projectedHorse(state: GameState, horse: Horse, date: GameDate): Horse {
  const projected = { ...horse, condition: { ...horse.condition } };
  const trainer = horse.trainerId === null ? undefined : state.trainers[horse.trainerId];
  if (trainer === undefined) return projected;
  let injuredWeeks = horse.condition.injury?.weeksOut ?? 0;
  for (let i = 0; i < weeksBetween(state.date, date); i++) {
    if (injuredWeeks > 0) {
      projected.condition.fitness = Math.min(projected.condition.fitness,
        Math.max(INJURED_FITNESS_FLOOR, projected.condition.fitness - INJURED_DETRAIN));
      projected.condition.fatigue = Math.max(0, projected.condition.fatigue - REST_FATIGUE_RECOVERY);
      injuredWeeks--;
    } else {
      let gain = TRAIN_FITNESS_GAIN * (SKILL_GAIN_BASE + SKILL_GAIN_SLOPE * trainer.skill / SKILL_MAX);
      if (projected.condition.fitness >= FITNESS_PEAK_ZONE) gain *= PEAK_ZONE_GAIN_MULT;
      if (ageInYear(horse.birthYear, addWeeks(state.date, i).year) === JUVENILE_AGE) {
        gain *= JUVENILE_GAIN_BASE + JUVENILE_GAIN_SLOPE * trainer.juvenileFocus;
      }
      projected.condition.fitness = Math.min(CONDITION_MAX, projected.condition.fitness + gain);
      projected.condition.fatigue = Math.max(0, projected.condition.fatigue - TRAIN_FATIGUE_RECOVERY
        - (trainer.facilityGrade - FACILITY_NEUTRAL_GRADE) * FACILITY_RECOVERY_PER_GRADE);
    }
  }
  if (injuredWeeks <= 0) projected.condition.injury = null;
  return projected;
}

function raceFits(state: GameState, horse: Horse, race: Race, date: GameDate): boolean {
  if (race.kind === 'handicap' && horse.officialRating === null) return false;
  if (!isEligible(horse, race, date, state.seasonState) || !isDistanceFit(horse, race)) return false;
  return race.grade === null || ageInYear(horse.birthYear, date.year) <= JUVENILE_AGE
    || (horse.officialRating !== null && horse.officialRating >= GROUP_OR_FLOOR[race.grade]);
}

/**
 * 조교사 제안 전용 규칙(M7-C2). 플레이어 말 제안(proposeRacePlan)에만 쓰고 AI 선언·수동 계획에는 쓰지 않는다.
 * - 거리: 적성 범위(distanceOptimum ± distanceRange) ± RACE_PLAN_DISTANCE_SLACK_M 밖은 제안하지 않는다.
 * - 미승리(0승): 미승리전·노비스전, 2세 조건 레이스만.
 * - 승리마: 그룹·리스티드는 OR 이 RACE_PLAN_MIN_OR 이상(OR 없으면 불가), 핸디캡은 OR 이 그 클래스 대역 안일 때만.
 */
function planRaceAllowed(horse: Horse, race: Race): boolean {
  const { distanceOptimum, distanceRange } = horse.aptitude;
  if (Math.abs(distanceOptimum - race.distance) > distanceRange + RACE_PLAN_DISTANCE_SLACK_M) return false;
  if (horse.record.wins === 0) {
    return race.kind === 'maiden' || race.kind === 'novice'
      || (race.kind === 'conditions' && race.conditions.maxAge === JUVENILE_AGE);
  }
  const or = horse.officialRating;
  if (race.kind === 'group' || race.kind === 'listed') {
    return race.grade !== null && or !== null && or >= RACE_PLAN_MIN_OR[race.grade];
  }
  if (race.kind === 'handicap') {
    if (race.raceClass === 1 || or === null) return false;
    const band = HANDICAP_OR_RANGE[race.raceClass];
    return or >= band.min && or <= band.max;
  }
  return true;
}

/** OR 구간 중간과 거리 적성으로 비교한다. 동점은 호출자가 id 순으로 푼다. */
function suitability(horse: Horse, race: Race): number {
  const distance = Math.abs(horse.aptitude.distanceOptimum - race.distance) / horse.aptitude.distanceRange;
  const range = race.conditions;
  const ratingGap = horse.officialRating !== null && range.ratingMin !== null && range.ratingMax !== null
    ? Math.abs(horse.officialRating - (range.ratingMin + range.ratingMax) / 2) / (range.ratingMax - range.ratingMin || 1)
    : 0;
  return distance * RACE_PLAN_DISTANCE_SCORE + ratingGap * RACE_PLAN_CLASS_SCORE;
}

function matchesTarget(state: GameState, data: RaceCalendarData, horse: Horse, race: Race, target: RacePlanTarget): boolean {
  const country = data.courses.find((c) => c.id === race.racecourseId)?.country;
  return country === (target.country ?? homeCountry(state, horse))
    && target.kinds.includes(race.kind) && race.distance >= target.minDistance && race.distance <= target.maxDistance
    && race.raceClass >= (target.minClass ?? 1) && race.raceClass <= (target.maxClass ?? 7);
}

/** 자동 생성 규칙에서 가능한 목표를 찾는다. 아직 생성되지 않은 레이스 id 는 만들지 않는다. */
function targetFor(state: GameState, horse: Horse, week: UpcomingRaceWeek): RacePlanTarget | null {
  const candidates: Race[] = [];
  const country = homeCountry(state, horse);
  const age = ageInYear(horse.birthYear, week.date.year);
  for (const meeting of week.meetings) {
    for (const kind of meeting.expectedKinds) {
      if (age < JUVENILE_AGE || (age === JUVENILE_AGE && kind.twoYearOldShare === 0)) continue;
      const distances = age === JUVENILE_AGE ? kind.twoYearOldDistances : kind.distances.map((d) => d.distance);
      for (const { raceClass } of kind.classes) {
        for (const distance of distances) {
          const rating = kind.kind === 'handicap' && raceClass !== 1 ? HANDICAP_OR_RANGE[raceClass] : null;
          const race: Race = {
            id: '', name: '', racecourseId: meeting.course.id, distance, kind: kind.kind, grade: null, raceClass,
            conditions: { minAge: age === JUVENILE_AGE ? JUVENILE_AGE : JUVENILE_AGE + 1,
              maxAge: age === JUVENILE_AGE ? JUVENILE_AGE : null, sex: 'open',
              ratingMin: rating?.min ?? null, ratingMax: rating?.max ?? null,
              weightSystem: rating === null ? 'wfa' : 'handicap', baseWeightLb: BASE_WEIGHT_LB },
            prizeMoney: [], maxRunners: 0,
          };
          if (planRaceAllowed(horse, race) && raceFits(state, horse, race, week.date)) candidates.push(race);
        }
      }
    }
  }
  const domestic = (race: Race) => week.meetings.find((m) => m.course.id === race.racecourseId)?.course.country === country ? 0 : 1;
  candidates.sort((a, b) => domestic(a) - domestic(b) || suitability(horse, a) - suitability(horse, b)
    || a.raceClass - b.raceClass || a.distance - b.distance || compareId(a.kind, b.kind));
  const best = candidates[0];
  if (best === undefined) return null;
  // 목표 거리 창은 적응 폭(DISTANCE_TOLERANCE)과 계획 거리 여유 중 좁은 쪽. 후보 거리가 두 조건을 모두 만족하므로 창이 비지 않는다.
  const { distanceOptimum, distanceRange } = horse.aptitude;
  const reach = Math.min(distanceRange * DISTANCE_TOLERANCE, distanceRange + RACE_PLAN_DISTANCE_SLACK_M);
  // 같은 클래스에서 자격에 맞는 종류를 함께 허용해 실제 편성과 연결한다.
  const kinds = [...new Set(candidates.filter((r) => r.raceClass === best.raceClass).map((r) => r.kind))];
  return { kinds, minDistance: Math.max(1, Math.ceil(distanceOptimum - reach)),
    maxDistance: Math.floor(distanceOptimum + reach),
    country: week.meetings.find((m) => m.course.id === best.racecourseId)!.course.country,
    minClass: best.raceClass, maxClass: best.raceClass };
}

/** 원본·공용 RNG 불변. 자격과 회복 예상이 허용하는 주에 최대 4회, 기본 약 4주 간격으로 제안한다. */
export function proposeRacePlan(
  state: GameState, data: RaceCalendarData, horseId: HorseId, weeks = RACE_PLAN_WEEKS,
  /** 같은 주에 여러 말을 계획할 때 한 번 계산한 미리보기(M6-P). 읽기만 한다 */
  sharedCalendar?: readonly UpcomingRaceWeek[],
): PlannedRace[] {
  const calendar = sharedCalendar ?? upcomingRaces(state, data, state.date, weeks);
  if (playerError(state, horseId) !== null) return [];
  const horse = state.horses[horseId]!;
  if (horse.status !== 'in_training' || horse.trainerId === null || state.trainers[horse.trainerId] === undefined) return [];
  const plans: PlannedRace[] = [];
  let last = state.seasonState.lastRun[horseId];
  const gap = Math.max(RACE_PLAN_INTERVAL, MIN_WEEKS_BETWEEN_RUNS, MIN_WEEKS_BETWEEN_GROUP_RUNS);
  // 이번 주 접수도 가능하지만, 새 제안은 검토할 수 있게 다음 주부터 잡는다.
  for (let start = 1; start < weeks && plans.length < RACE_PLAN_MAX_RUNS;) {
    const candidateWeeks = calendar.slice(start, Math.min(weeks, start + gap));
    const options = candidateWeeks.flatMap((week): { date: GameDate; templateId: string | null; target: RacePlanTarget | null }[] => {
      if (last !== undefined && weeksBetween(last, week.date) < gap) return [];
      const projected = projectedHorse(state, horse, week.date);
      if (projected.condition.injury !== null || projected.condition.fitness < MIN_FITNESS_TO_RUN
        || projected.condition.fatigue > MAX_FATIGUE_TO_RUN) return [];
      const home = homeCountry(state, horse);
      const domestic = (race: Race) => data.courses.find((c) => c.id === race.racecourseId)?.country === home ? 0 : 1;
      const fixed = week.fixedRaces.filter((race) => planRaceAllowed(horse, race) && raceFits(state, projected, race, week.date))
        .sort((a, b) => domestic(a) - domestic(b) || suitability(horse, a) - suitability(horse, b) || compareId(a.id, b.id));
      const fixedRace = fixed[0];
      const target = targetFor(state, projected, week);
      // 같은 주 후보: 국내 개최가 우선, 같은 나라면 확정된 고정 일정이 우선(조건 목표는 개최가 바뀔 수 있다).
      if (fixedRace !== undefined && (target === null || domestic(fixedRace) === 0 || target.country !== home)) {
        return [{ date: week.date, templateId: fixedRace.id, target: null }];
      }
      return target === null ? [] : [{ date: week.date, templateId: null, target }];
    });
    const pick = options.find((o) => o.templateId !== null) ?? options[0];
    if (pick === undefined) { start += 1; continue; }
    const interval = last === undefined ? null : weeksBetween(last, pick.date);
    plans.push({ ...pick, id: `${horseId}:${pick.date.year}-${pick.date.week}`,
      status: state.settings.autoApproveRacePlans ? 'approved' : 'proposed',
      note: `${horse.condition.injury !== null ? '회복 후 ' : ''}거리 적성과 출주 조건에 맞춤${pick.target !== null && pick.target.country !== homeCountry(state, horse) ? ' · 원정 개최' : ''}${interval === null ? '' : ` · 이전 출주와 ${interval}주 간격`}` });
    last = pick.date;
    start = weeksBetween(state.date, pick.date) + gap;
  }
  return plans;
}

function validPlan(plan: PlannedRace, horseId: HorseId): boolean {
  const date = plan.date;
  if (!Number.isInteger(date.year) || !Number.isInteger(date.week) || date.week < 1 || date.week > WEEKS_PER_YEAR
    || plan.id !== `${horseId}:${date.year}-${date.week}` || typeof plan.note !== 'string') return false;
  if ((plan.templateId === null) === (plan.target === null)) return false;
  if (plan.templateId !== null) return plan.templateId.length > 0;
  const t = plan.target!;
  return t.kinds.length > 0 && t.kinds.every((k) => ['maiden', 'novice', 'handicap', 'conditions', 'listed', 'group'].includes(k))
    && Number.isFinite(t.minDistance) && Number.isFinite(t.maxDistance) && t.minDistance > 0 && t.maxDistance >= t.minDistance
    && [t.minClass, t.maxClass].every((c) => c === undefined || (Number.isInteger(c) && c >= 1 && c <= 7))
    && (t.minClass ?? 1) <= (t.maxClass ?? 7);
}

/** 성공 시 입력 plans 도 복제한다. 완료·신청된 기록은 기존 값 그대로만 보존할 수 있다. */
export function setRacePlan(state: GameState, horseId: HorseId, plans: PlannedRace[]): PlanResult {
  const error = playerError(state, horseId);
  if (error !== null) return { ok: false, error };
  const old = state.seasonState.racePlans?.[horseId] ?? [];
  const sameOld = (plan: PlannedRace) => old.some((p) => p.id === plan.id && JSON.stringify(p) === JSON.stringify(plan));
  if (new Set(plans.map((p) => p.id)).size !== plans.length || plans.some((p) => !validPlan(p, horseId)
    || (!sameOld(p) && (compareDates(p.date, state.date) < 0 || !['proposed', 'approved'].includes(p.status)))
    || old.some((o) => o.id === p.id && ['declared', 'run'].includes(o.status) && !sameOld(p)))
    || old.some((p) => ['declared', 'run'].includes(p.status) && !plans.some((n) => n.id === p.id))) {
    return { ok: false, error: 'invalid_plan' };
  }
  const next = { ...state, seasonState: { ...state.seasonState,
    racePlans: { ...state.seasonState.racePlans, [horseId]: structuredClone(plans).sort((a, b) => compareDates(a.date, b.date)) } } };
  return { ok: true, state: next, events: [] };
}

export function approvePlan(state: GameState, horseId: HorseId, planId: string): PlanResult {
  const error = playerError(state, horseId);
  if (error !== null) return { ok: false, error };
  const plans = state.seasonState.racePlans?.[horseId] ?? [];
  const plan = plans.find((p) => p.id === planId);
  if (plan === undefined) return { ok: false, error: 'plan_not_found' };
  if (plan.status !== 'proposed') return { ok: false, error: 'invalid_status' };
  if (compareDates(plan.date, state.date) < 0) return { ok: false, error: 'invalid_plan' };
  return setRacePlan(state, horseId, plans.map((p) => p.id === planId ? { ...p, status: 'approved' } : p));
}

export function removePlan(state: GameState, horseId: HorseId, planId: string): PlanResult {
  const error = playerError(state, horseId);
  if (error !== null) return { ok: false, error };
  const plans = state.seasonState.racePlans?.[horseId] ?? [];
  const plan = plans.find((p) => p.id === planId);
  if (plan === undefined) return { ok: false, error: 'plan_not_found' };
  if (plan.status === 'declared' || plan.status === 'run') return { ok: false, error: 'invalid_status' };
  return setRacePlan(state, horseId, plans.filter((p) => p.id !== planId));
}

export function replanHorse(state: GameState, data: RaceCalendarData, horseId: HorseId): PlanResult {
  const error = playerError(state, horseId);
  if (error !== null) return { ok: false, error };
  if (state.horses[horseId]!.status !== 'in_training') return { ok: false, error: 'invalid_status' };
  // 새 제안은 다음 주부터라, 이번 주(또는 이전)에 승인한 계획은 남겨야 그 주 출주가 사라지지 않는다(M6-B2 재현 버그).
  const keep = (state.seasonState.racePlans?.[horseId] ?? []).filter((p) => p.status === 'declared' || p.status === 'run'
    || p.status === 'skipped' || (p.status === 'approved' && compareDates(p.date, state.date) <= 0));
  const declared = keep.filter((p) => p.status === 'declared').at(-1);
  const planningState = declared === undefined ? state : { ...state, seasonState: { ...state.seasonState,
    lastRun: { ...state.seasonState.lastRun, [horseId]: declared.date } } };
  const ids = new Set(keep.map((p) => p.id));
  return setRacePlan(state, horseId, [...keep, ...proposeRacePlan(planningState, data, horseId).filter((p) => !ids.has(p.id))]);
}

const DECLARE_REASON: Record<DeclareError, string> = {
  not_found: '말 또는 레이스를 찾을 수 없음', not_player_horse: '플레이어 소유 말이 아님', unnamed: '이름이 등록되지 않음',
  no_trainer: '조교사 미배정', not_eligible: '출주 자격 또는 출주 간격 조건 미충족', race_closed: '출주 접수 마감',
  already_declared: '이번 주 다른 레이스에 이미 신청함', field_full: '출주 정원이 가득 참',
};

function skip(plan: PlannedRace, horseId: HorseId, reason: string, date: GameDate, events: GameEvent[]): void {
  plan.status = 'skipped';
  plan.note = reason;
  events.push({ type: 'race_plan_skipped', horseId, planId: plan.id, reason, date: { ...date } });
}

/** settings.autoApproveRacePlans 가 명시적으로 false 일 때만 승인한 계획만 신청한다. */
function needsApproval(state: GameState): boolean {
  return state.settings.autoApproveRacePlans === false;
}

/** 검토하지 않은 제안이 지나감 — 알림 없이 기록만 남긴다(무시한 제안마다 이벤트가 쌓이지 않게). */
function expire(plan: PlannedRace): void {
  plan.status = 'skipped';
  plan.note = '검토하지 않아 지나감';
}

/** 시즌의 개최 실행 직후에도 호출하여, 결과가 생긴 같은 턴에 상태를 확정한다. 난수 미사용. */
export function settleRacePlans(draft: GameState, date: GameDate): GameEvent[] {
  const events: GameEvent[] = [];
  for (const [horseId, plans] of Object.entries(draft.seasonState.racePlans ?? {})) {
    if (draft.horses[horseId]?.ownerId !== draft.playerOwnerId) continue;
    for (const plan of plans) {
      if (plan.status === 'proposed' && needsApproval(draft) && compareDates(plan.date, date) <= 0
        && !draft.seasonState.meetings.some((m) => compareDates(m.date, plan.date) === 0)) {
        expire(plan);
        continue;
      }
      if (plan.status !== 'declared' || compareDates(plan.date, date) > 0) continue;
      // 조건 목표는 계획 주 뒤(유예 기간)에 신청될 수 있으므로 날짜가 아니라 레이스 id 로 확인한다.
      if (draft.raceResults.some((r) => r.raceId === plan.raceId
        && r.runners.some((runner) => runner.horseId === horseId))) plan.status = 'run';
      else if (!draft.seasonState.meetings.some((m) => m.races.some((sr) => sr.race.id === plan.raceId))) {
        skip(plan, horseId, '신청한 레이스가 취소되었거나 출주하지 못함', date, events);
      }
    }
  }
  return events;
}

/** season 앞에 등록: 현재 주의 open 개최에 신청한 뒤 season 이 마감·실행한다. */
export function createRacePlansSystem(data: RaceCalendarData): WeeklySystem {
  return { id: 'race_plans', run(draft, ctx) {
    const events = settleRacePlans(draft, ctx.date);
    // 조교사는 플레이어의 조교 중인 말 전부에 계획을 낸다. 소유·현역이 끝난 말의 계획은 지운다.
    const allPlans = draft.seasonState.racePlans ?? {};
    for (const horseId of Object.keys(allPlans)) {
      const horse = draft.horses[horseId];
      if (horse === undefined || horse.ownerId !== draft.playerOwnerId || horse.status !== 'in_training') delete allPlans[horseId];
    }
    let calendar: UpcomingRaceWeek[] | undefined;
    const manual = needsApproval(draft);
    const planned = Object.values(draft.horses)
      .filter((h) => h.ownerId === draft.playerOwnerId && h.status === 'in_training')
      .map((h) => h.id).sort(compareId);
    if (planned.length > 0 && draft.seasonState.racePlans === undefined) draft.seasonState.racePlans = allPlans;
    for (const horseId of planned) {
      const horse = draft.horses[horseId]!;
      const plans = (allPlans[horseId] ??= []);
      // 끝난 기록은 일정 기간만 남긴다(저장 크기).
      for (let i = plans.length - 1; i >= 0; i--) {
        const p = plans[i]!;
        if ((p.status === 'run' || p.status === 'skipped') && weeksBetween(p.date, ctx.date) > RACE_PLAN_HISTORY_WEEKS) plans.splice(i, 1);
      }
      for (const plan of plans) {
        const late = weeksBetween(plan.date, ctx.date);
        if (late > 0 && plan.status === 'proposed' && manual) {
          expire(plan);
          continue;
        }
        // 기본(사용자 결정 2026-10-16): 조교사 제안은 플레이어가 빼지 않는 한 그대로 진행한다.
        const executable = plan.status === 'approved' || (plan.status === 'proposed' && !manual);
        // 조건 목표(자동 생성 레이스)는 그 주에 맞는 레이스가 없을 수 있어 몇 주 늦게까지 찾는다.
        const slack = plan.target !== null ? RACE_PLAN_TARGET_SLACK_WEEKS : 0;
        if (late > slack && executable) {
          skip(plan, horseId, slack > 0 ? `계획 주부터 ${slack}주 안에 맞는 레이스 없음` : '계획한 출주일이 지나감', ctx.date, events);
          continue;
        }
        if (late < 0 || !executable) continue;
        let reason: string | null = horse.condition.injury !== null ? '부상으로 출주할 수 없음'
          : horse.condition.fitness < MIN_FITNESS_TO_RUN ? '체력 부족으로 출주할 수 없음'
            : horse.condition.fatigue > MAX_FATIGUE_TO_RUN ? '피로가 높아 출주할 수 없음' : null;
        const races = draft.seasonState.meetings.filter((m) => compareDates(m.date, ctx.date) === 0)
          .flatMap((meeting) => meeting.races.map((sr) => ({ meeting, sr })))
          .filter(({ sr }) => plan.templateId !== null ? sr.templateId === plan.templateId
            : sr.status === 'open' && plan.target !== null && matchesTarget(draft, data, horse, sr.race, plan.target)
              && raceFits(draft, horse, sr.race, ctx.date))
          .sort((a, b) => suitability(horse, a.sr.race) - suitability(horse, b.sr.race)
            || compareId(a.sr.race.id, b.sr.race.id));
        const candidate = races[0];
        if (candidate === undefined) reason ??= '조건과 자격에 맞는 레이스 없음';
        if (reason !== null && late < slack) continue; // 다음 주에 다시 찾는다(알림 없음)
        if (reason !== null) { skip(plan, horseId, reason, ctx.date, events); continue; }
        const chosen = candidate!;
        const result = declarePlayerHorseInPlace(draft, chosen.meeting.id, chosen.sr.race.id, horseId);
        if (!result.ok) { skip(plan, horseId, DECLARE_REASON[result.error], ctx.date, events); continue; }
        plan.status = 'declared';
        plan.raceId = chosen.sr.race.id;
        events.push({ type: 'race_plan_declared', horseId, raceId: chosen.sr.race.id, date: { ...ctx.date } });
      }
      // 유예 중인 조건 목표 계획도 아직 살아 있는 계획으로 본다(지난 계획은 위에서 이미 정리됨).
      const future = plans.filter((p) => p.status !== 'skipped' && p.status !== 'run');
      const last = future.at(-1);
      if (last === undefined || weeksBetween(ctx.date, last.date) <= RACE_PLAN_RENEW_WEEKS) {
        const state = last === undefined ? draft : { ...draft, seasonState: { ...draft.seasonState,
          lastRun: { ...draft.seasonState.lastRun, [horseId]: last.date } } };
        const ids = new Set(plans.map((p) => p.id));
        // 미리보기는 개최·날짜에만 달려 있어 이 주 안에서 한 번만 계산한다(M6-P)
        calendar ??= upcomingRaces(draft, data, ctx.date, RACE_PLAN_WEEKS);
        plans.push(...proposeRacePlan(state, data, horseId, RACE_PLAN_WEEKS, calendar).filter((p) => !ids.has(p.id)));
        plans.sort((a, b) => compareDates(a.date, b.date));
      }
    }
    return events;
  } };
}
