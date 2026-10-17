import { beforeAll, describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { MIN_FITNESS_TO_RUN, MIN_WEEKS_BETWEEN_RUNS } from '../../src/engine/config/entries';
import { RACE_PLAN_TARGET_SLACK_WEEKS } from '../../src/engine/config/racePlan';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { isEligible } from '../../src/engine/season/eligibility';
import { approvePlan, createRacePlansSystem, proposeRacePlan, removePlan, replanHorse, setRacePlan } from '../../src/engine/season/racePlan';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { addWeeks, weeksBetween } from '../../src/engine/time/calendar';
import type { GameState, PlannedRace, RaceTemplate } from '../../src/engine/types';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
let base: GameState;
let horseId: string;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
  horseId = Object.values(base.horses).find((h) => h.ownerId === base.playerOwnerId
    && base.date.year - h.birthYear === 3 && h.status === 'in_training')!.id;
}, 120_000);

function systemRun(state: GameState) {
  const next = structuredClone(state);
  const before = JSON.stringify(next.rng);
  const rng = createRng('must-not-consume');
  const rngBefore = rng.getState();
  const events = createRacePlansSystem(staticData).run(next, { date: next.date, rng });
  expect(next.rng).toEqual(JSON.parse(before));
  expect(rng.getState()).toEqual(rngBefore);
  return { state: next, events };
}

/** 기존 개최의 AI 필드를 유지하면서 플레이어 말을 자격에 맞춘다. */
function dueFixture(): { state: GameState; plan: PlannedRace } {
  const state = structuredClone(base);
  state.date = { ...state.seasonState.meetings[0]!.date };
  const meeting = state.seasonState.meetings[0]!;
  const sr = meeting.races.find((r) => r.status === 'open')!;
  const horse = state.horses[horseId]!;
  horse.birthYear = state.date.year - 3;
  horse.status = 'in_training';
  horse.condition = { fitness: 90, fatigue: 0, injury: null, mental: 90 };
  horse.officialRating = sr.race.conditions.ratingMin ?? 80;
  horse.record.wins = 0;
  horse.aptitude.distanceOptimum = sr.race.distance;
  horse.aptitude.distanceRange = 400;
  // 원하는 레이스에 templateId 를 붙여 고정 일정 신청 경로를 독립적으로 검사한다.
  sr.templateId = sr.race.id;
  const plan: PlannedRace = { id: `${horseId}:${state.date.year}-${state.date.week}`, date: { ...state.date },
    templateId: sr.race.id, target: null, status: 'approved', note: '거리 적성에 맞는 출주' };
  state.seasonState.racePlans = { [horseId]: [plan] };
  return { state, plan };
}

describe('출주 계획 제안', () => {
  it('기본 3세 현역마에게 12주 내 2~4회, 최소 간격·결정성·원본 불변', () => {
    const before = JSON.stringify(base);
    const plans = proposeRacePlan(base, staticData, horseId);
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.length).toBeLessThanOrEqual(4);
    expect(proposeRacePlan(base, staticData, horseId)).toEqual(plans);
    expect(JSON.stringify(base)).toBe(before);
    for (const [i, plan] of plans.entries()) {
      expect(weeksBetween(base.date, plan.date)).toBeLessThan(12);
      expect(plan.status).toBe('proposed');
      if (i > 0) expect(weeksBetween(plans[i - 1]!.date, plan.date)).toBeGreaterThanOrEqual(MIN_WEEKS_BETWEEN_RUNS);
      if (plan.templateId !== null) {
        expect(isEligible(base.horses[horseId]!, staticData.templates.find((t) => t.id === plan.templateId)!, plan.date, base.seasonState)).toBe(true);
      }
    }
  });

  it('OR 없는 말은 핸디캡·성마 그룹을 피하고, 부상·체력·피로 회복 뒤부터 제안', () => {
    const state = structuredClone(base);
    const horse = state.horses[horseId]!;
    horse.officialRating = null;
    horse.record.wins = 0;
    horse.condition = { ...horse.condition, fitness: 35, fatigue: 95, injury: { kind: 'knock', weeksOut: 3 } };
    const plans = proposeRacePlan(state, staticData, horseId);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(weeksBetween(state.date, plan.date)).toBeGreaterThan(3);
      expect(plan.target?.kinds ?? []).not.toContain('handicap');
      const fixed = staticData.templates.find((t) => t.id === plan.templateId);
      if (fixed !== undefined) expect(['handicap', 'group', 'listed']).not.toContain(fixed.kind);
      expect(plan.note).toContain('회복 후');
    }
    horse.condition.injury!.weeksOut = 20;
    expect(proposeRacePlan(state, staticData, horseId)).toEqual([]);
  });

  it('승리 수·성별·나이 제한과 2세 개시 주를 지키고 autoApprove 를 반영한다', () => {
    const state = structuredClone(base);
    state.settings.autoApproveRacePlans = true;
    const horse = state.horses[horseId]!;
    horse.officialRating = null;
    horse.record.wins = 2;
    expect(proposeRacePlan(state, staticData, horseId)).toEqual([]);
    horse.birthYear = state.date.year - 2;
    horse.record.wins = 0;
    expect(proposeRacePlan(state, staticData, horseId)).toEqual([]);
    state.date = { year: 2026, week: 13 };
    const plans = proposeRacePlan(state, staticData, horseId);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.status === 'approved' && p.date.week >= 15)).toBe(true);
    expect(plans.every((p) => !(p.target?.kinds ?? []).includes('handicap'))).toBe(true);
  });

  it('맞는 고정 일정이 있으면 조건 목표보다 우선하고, 부적격 고정 일정은 고르지 않는다', () => {
    const state = structuredClone(base);
    state.date = { year: 2026, week: 13 };
    const horse = state.horses[horseId]!;
    horse.sex = 'male';
    const course = staticData.courses.find((c) => c.country === state.trainers[horse.trainerId!]!.country)!;
    const template: RaceTemplate = { id: 'test-plan-fixed', name: '구름들 조건 경주', racecourseId: course.id,
      distance: horse.aptitude.distanceOptimum, kind: 'conditions', grade: null, raceClass: 5,
      conditions: { minAge: 3, maxAge: 3, sex: 'open', ratingMin: null, ratingMax: null, weightSystem: 'wfa', baseWeightLb: 126 },
      prizeMoney: [1000], maxRunners: 14, schedule: { month: 4, weekOfMonth: 1 }, cardOrder: 1, tags: [] };
    const input = { ...staticData, templates: [template] };
    expect(proposeRacePlan(state, input, horseId)[0]!.templateId).toBe(template.id);
    template.conditions.sex = 'fillies_mares';
    expect(proposeRacePlan(state, input, horseId).some((p) => p.templateId === template.id)).toBe(false);
  });
});

describe('편집 API', () => {
  it('설정·승인·삭제·재계획은 원본·전달한 배열·RNG 를 바꾸지 않는다', () => {
    const before = JSON.stringify(base);
    const plans = proposeRacePlan(base, staticData, horseId);
    const saved = setRacePlan(base, horseId, plans);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error);
    const originalNote = plans[0]!.note;
    plans[0]!.note = '외부 변경';
    expect(saved.state.seasonState.racePlans![horseId]![0]!.note).toBe(originalNote);
    const id = plans[0]!.id;
    const approved = approvePlan(saved.state, horseId, id);
    if (!approved.ok) throw new Error(approved.error);
    expect(approved.state.seasonState.racePlans![horseId]![0]!.status).toBe('approved');
    expect(saved.state.seasonState.racePlans![horseId]![0]!.status).toBe('proposed');
    const removed = removePlan(approved.state, horseId, id);
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.state.seasonState.racePlans![horseId]!.some((p) => p.id === id)).toBe(false);
    expect(replanHorse(removed.state, staticData, horseId).ok).toBe(true);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('그 주에 승인한 계획은 같은 주 다시 짜기에도 남는다(M6-B2)', () => {
    const saved = setRacePlan(base, horseId, proposeRacePlan(base, staticData, horseId));
    if (!saved.ok) throw new Error(saved.error);
    const first = saved.state.seasonState.racePlans![horseId]![0]!;
    const approved = approvePlan(saved.state, horseId, first.id);
    if (!approved.ok) throw new Error(approved.error);
    const thatWeek = structuredClone(approved.state);
    thatWeek.date = { ...first.date };
    const replanned = replanHorse(thatWeek, staticData, horseId);
    if (!replanned.ok) throw new Error(replanned.error);
    expect(replanned.state.seasonState.racePlans![horseId]!.find((p) => p.id === first.id)?.status).toBe('approved');
  });

  it('플레이어 말만 허용하고 잘못된 계획·상태·id 는 오류 유니언을 돌려준다', () => {
    const ai = Object.values(base.horses).find((h) => h.ownerId !== base.playerOwnerId)!;
    expect(setRacePlan(base, ai.id, [])).toEqual({ ok: false, error: 'not_player_horse' });
    expect(setRacePlan(base, 'missing', [])).toEqual({ ok: false, error: 'not_found' });
    expect(approvePlan(base, horseId, 'missing')).toEqual({ ok: false, error: 'plan_not_found' });
    expect(removePlan(base, horseId, 'missing')).toEqual({ ok: false, error: 'plan_not_found' });
    expect(proposeRacePlan(base, staticData, ai.id)).toEqual([]);
    const plan = proposeRacePlan(base, staticData, horseId)[0]!;
    expect(setRacePlan(base, horseId, [plan, plan])).toEqual({ ok: false, error: 'invalid_plan' });
    expect(setRacePlan(base, horseId, [{ ...plan, templateId: null, target: null }])).toEqual({ ok: false, error: 'invalid_plan' });
    expect(setRacePlan(base, horseId, [{ ...plan, status: 'run' }])).toEqual({ ok: false, error: 'invalid_plan' });
    const { state, plan: declared } = dueFixture();
    declared.status = 'declared';
    expect(removePlan(state, horseId, declared.id)).toEqual({ ok: false, error: 'invalid_status' });
    expect(setRacePlan(state, horseId, [])).toEqual({ ok: false, error: 'invalid_plan' });
  });
});

describe('주간 자동 신청', () => {
  it('고정 일정 승인 계획은 신청·이벤트를 만들고 같은 턴에 출주 완료된다', () => {
    const { state, plan } = dueFixture();
    const declared = systemRun(state);
    expect(declared.events).toContainEqual({ type: 'race_plan_declared', horseId, raceId: plan.templateId, date: state.date });
    expect(declared.state.seasonState.racePlans![horseId]![0]).toMatchObject({ status: 'declared', raceId: plan.templateId });
    const systems = createGameSystems(staticData);
    systems.splice(systems.findIndex((s) => s.id === 'season'), 0, createRacePlansSystem(staticData));
    const result = advanceWeek(state, systems);
    expect(result.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id)!.status).toBe('run');
    expect(result.state.raceResults.some((r) => r.raceId === plan.templateId && r.runners.some((runner) => runner.horseId === horseId))).toBe(true);
    expect(state.seasonState.racePlans![horseId]![0]!.status).toBe('approved');
  });

  it('조건 목표에 맞는 레이스가 없으면 유예 기간 동안 승인 상태로 기다리고, 지나면 skipped', () => {
    const { state, plan } = dueFixture();
    plan.templateId = null;
    plan.target = { kinds: ['listed'], minDistance: 100, maxDistance: 200 };
    const first = systemRun(state);
    const waiting = first.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id)!;
    expect(waiting.status).toBe('approved');
    expect(first.events.filter((e) => e.type === 'race_plan_skipped')).toEqual([]);
    const late = structuredClone(first.state);
    late.date = addWeeks(state.date, RACE_PLAN_TARGET_SLACK_WEEKS + 1);
    const after = systemRun(late);
    expect(after.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id)!.status).toBe('skipped');
  });

  it.each(['injury', 'fitness', 'fatigue', 'unnamed', 'no_trainer', 'no_race', 'not_eligible'] as const)('실패 %s 는 skipped 와 한글 사유를 남긴다', (failure) => {
    const { state, plan } = dueFixture();
    const horse = state.horses[horseId]!;
    if (failure === 'injury') horse.condition.injury = { kind: 'knock', weeksOut: 2 };
    if (failure === 'fitness') horse.condition.fitness = MIN_FITNESS_TO_RUN - 1;
    if (failure === 'fatigue') horse.condition.fatigue = 100;
    if (failure === 'unnamed') horse.nameRegistered = false;
    if (failure === 'no_trainer') horse.trainerId = null;
    if (failure === 'no_race') plan.templateId = 'not-scheduled';
    if (failure === 'not_eligible') horse.birthYear = state.date.year;
    const result = systemRun(state);
    const changed = result.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id)!;
    expect(changed.status).toBe('skipped');
    expect(changed.note).toMatch(/[가-힣]/);
    expect(result.events).toContainEqual({ type: 'race_plan_skipped', horseId, planId: plan.id, reason: changed.note, date: state.date });
  });

  it('조건 목표는 open 레이스 중 적성·클래스에 가장 맞는 것을 선택한다', () => {
    const { state, plan } = dueFixture();
    const horse = state.horses[horseId]!;
    const meeting = state.seasonState.meetings[0]!;
    const sr = meeting.races.find((r) => r.race.id === plan.templateId)!;
    const country = staticData.courses.find((c) => c.id === meeting.racecourseId)!.country;
    plan.templateId = null;
    plan.target = { kinds: [sr.race.kind], minDistance: sr.race.distance - 200, maxDistance: sr.race.distance + 200,
      country, minClass: sr.race.raceClass, maxClass: sr.race.raceClass };
    const worse = structuredClone(sr);
    worse.race.id = 'aaa-less-suitable';
    worse.race.distance += 100;
    meeting.races.unshift(worse);
    const result = systemRun(state);
    expect(result.state.seasonState.racePlans![horseId]![0]!.raceId).toBe(sr.race.id);
    expect(result.state.seasonState.meetings.flatMap((m) => m.races).filter((r) => r.declarations.some((d) => d.horseId === horse.id))).toHaveLength(1);
  });

  it('미검토 계획은 지나가면 skipped, 빈 계획은 설정에 맞춰 이벤트 없이 보충한다', () => {
    const state = structuredClone(base);
    const plan = proposeRacePlan(state, staticData, horseId)[0]!;
    state.date = addWeeks(plan.date, 1);
    state.seasonState.racePlans = { [horseId]: [{ ...plan, status: 'proposed' }] };
    state.settings.autoApproveRacePlans = false;
    const skipped = systemRun(state);
    expect(skipped.state.seasonState.racePlans![horseId]![0]).toMatchObject({ status: 'skipped', note: '검토하지 않아 지나감' });
    for (const auto of [false, true]) {
      const empty = structuredClone(base);
      empty.seasonState.racePlans = { [horseId]: [] };
      empty.settings.autoApproveRacePlans = auto;
      const result = systemRun(empty);
      expect(result.events).toEqual([]);
      expect(result.state.seasonState.racePlans![horseId]!.length).toBeGreaterThan(0);
      expect(result.state.seasonState.racePlans![horseId]!.every((p) => p.status === (auto ? 'approved' : 'proposed'))).toBe(true);
    }
  });

  it('개최한 턴의 미승인 계획과 취소된 신청은 즉시 skipped 로 확정한다', () => {
    const { state, plan } = dueFixture();
    plan.status = 'proposed';
    state.settings.autoApproveRacePlans = false;
    const systems = createGameSystems(staticData);
    systems.splice(systems.findIndex((s) => s.id === 'season'), 0, createRacePlansSystem(staticData));
    const expired = advanceWeek(state, systems);
    expect(expired.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id))
      .toMatchObject({ status: 'skipped', note: '검토하지 않아 지나감' });
    plan.status = 'declared';
    plan.raceId = plan.templateId!;
    const sr = state.seasonState.meetings[0]!.races.find((r) => r.race.id === plan.templateId)!;
    sr.status = 'abandoned';
    const cancelled = advanceWeek(state, systems);
    expect(cancelled.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id)!.status).toBe('skipped');
    expect(cancelled.events.some((e) => e.type === 'race_plan_skipped' && e.planId === plan.id)).toBe(true);
  });

  it('시드 20261011: 승인 계획으로 26주 실제 출주, 저장 왕복 유지', () => {
    let state = structuredClone(base);
    state.settings.autoApproveRacePlans = true;
    for (const horse of Object.values(state.horses).filter((h) => h.ownerId === state.playerOwnerId && h.status === 'in_training')) {
      const planned = replanHorse(state, staticData, horse.id);
      if (!planned.ok) throw new Error(planned.error);
      state = planned.state;
    }
    const systems = createGameSystems(staticData);
    systems.splice(systems.findIndex((s) => s.id === 'season'), 0, createRacePlansSystem(staticData));
    let declarations = 0;
    for (let i = 0; i < 26; i++) {
      const result = advanceWeek(state, systems);
      declarations += result.events.filter((e) => e.type === 'race_plan_declared').length;
      state = result.state;
    }
    const starts = state.raceResults.reduce((sum, r) => sum + r.runners.filter((runner) => state.horses[runner.horseId]?.ownerId === state.playerOwnerId).length, 0);
    console.info(`[racePlan] seed=20261011 weeks=26 declarations=${declarations} playerStarts=${starts}`);
    expect(starts).toBeGreaterThan(0);
    expect(Object.values(state.seasonState.racePlans!).flat().some((p) => p.status === 'run')).toBe(true);
    const restored = deserializeGame(serializeGame(state, '2026-10-16T00:00:00.000Z'));
    if (!restored.ok) throw new Error('저장 복원 실패');
    expect(restored.state.seasonState.racePlans).toEqual(state.seasonState.racePlans);
  }, 180_000);

  it('승인제에서 승인 전 제안만 있으면 레이스 결과와 공용 RNG 가 시스템 없을 때와 같다', () => {
    const withPlans = createGameSystems(staticData);
    const without = withPlans.filter((s) => s.id !== 'race_plans');
    const manual: GameState = { ...base, settings: { ...base.settings, autoApproveRacePlans: false } };
    let a = manual;
    let b = manual;
    for (let i = 0; i < 4; i++) {
      a = advanceWeek(a, without).state;
      b = advanceWeek(b, withPlans).state;
    }
    expect(b.rng).toEqual(a.rng);
    expect(b.raceResults).toEqual(a.raceResults);
    const plans = Object.values(b.seasonState.racePlans ?? {}).flat();
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.status === 'proposed' || p.status === 'skipped')).toBe(true);
    expect(a.seasonState).not.toHaveProperty('racePlans');
  }, 120_000);
});

describe('기본 진행 방식(사용자 결정 2026-10-16: 그대로 진행)', () => {
  it('설정이 없으면 검토하지 않은 제안도 그 주에 신청한다', () => {
    const { state, plan } = dueFixture();
    plan.status = 'proposed';
    delete state.settings.autoApproveRacePlans;
    const result = systemRun(state);
    expect(result.state.seasonState.racePlans![horseId]!.find((p) => p.id === plan.id)!.status).toBe('declared');
    expect(result.events.some((e) => e.type === 'race_plan_declared')).toBe(true);
  });
});
