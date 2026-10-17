import { beforeAll, describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { proposeRacePlan, setRacePlan } from '../../src/engine/season/racePlan';
import { addWeeks } from '../../src/engine/time/calendar';
import type { GameDate, GameState, Horse, PlannedRace, RaceTemplate, Racecourse } from '../../src/engine/types';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
let base: GameState;
let horseId: string;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261017, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
  horseId = Object.values(base.horses).find((h) => h.ownerId === base.playerOwnerId
    && base.date.year - h.birthYear === 3 && h.status === 'in_training')!.id;
}, 120_000);

/** 4월 1주 고정 일정이 제안 창(12주) 안에 들도록 기준 날짜를 2026년 13주로 고정한다. */
const TEST_DATE: GameDate = { year: 2026, week: 13 };

/** 기본 말을 복제해 조건을 바꾼다. 원본 base 는 건드리지 않는다. */
function prepare(patch: (horse: Horse) => void, date: GameDate = TEST_DATE): GameState {
  const state = structuredClone(base);
  state.date = { ...date };
  patch(state.horses[horseId]!);
  return state;
}

function homeCourse(state: GameState): Racecourse {
  const horse = state.horses[horseId]!;
  const country = state.trainers[horse.trainerId!]!.country;
  return staticData.courses.find((c) => c.country === country)!;
}

function foreignCourse(state: GameState): Racecourse {
  const horse = state.horses[horseId]!;
  const country = state.trainers[horse.trainerId!]!.country;
  return staticData.courses.find((c) => c.country !== country)!;
}

const SCHEDULE = { month: 4, weekOfMonth: 1 };

function makeTemplate(id: string, racecourseId: string, distance: number, patch: Partial<RaceTemplate> = {}): RaceTemplate {
  return { id, name: `가상 경주 ${id}`, racecourseId, distance, kind: 'conditions', grade: null, raceClass: 5,
    conditions: { minAge: 3, maxAge: null, sex: 'open', ratingMin: null, ratingMax: null, weightSystem: 'wfa', baseWeightLb: 126 },
    prizeMoney: [1000], maxRunners: 14, schedule: SCHEDULE, cardOrder: 1, tags: [], ...patch };
}

/** 미승리 말 제안이 허용하는 레이스: 미승리전·노비스전, 2세 조건 레이스 */
function winlessAllowed(kind: string, maxAge: number | null): boolean {
  return kind === 'maiden' || kind === 'novice' || (kind === 'conditions' && maxAge === 2);
}

describe('조교사 제안 등급 규칙(M7-C2)', () => {
  it('0승 말은 OR 이 높아도 그룹·리스티드·핸디캡을 제안하지 않는다', () => {
    let total = 0;
    for (const offset of [0, 6, 20]) {
      const state = prepare((h) => { h.record.wins = 0; h.officialRating = 110; }, addWeeks(TEST_DATE, offset));
      const plans = proposeRacePlan(state, staticData, horseId);
      total += plans.length;
      for (const plan of plans) {
        if (plan.templateId !== null) {
          const fixed = staticData.templates.find((t) => t.id === plan.templateId)!;
          expect(winlessAllowed(fixed.kind, fixed.conditions.maxAge)).toBe(true);
        } else {
          expect(plan.target!.kinds.every((k) => k === 'maiden' || k === 'novice')).toBe(true);
        }
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('0승 3세 말에게 3세 조건 경주(고정 일정)는 제안하지 않는다', () => {
    const state = prepare((h) => { h.record.wins = 0; h.officialRating = null; });
    const template = makeTemplate('rules-winless-3yo-cond', homeCourse(state).id, state.horses[horseId]!.aptitude.distanceOptimum);
    expect(proposeRacePlan(state, { ...staticData, templates: [template] }, horseId).some((p) => p.templateId === template.id)).toBe(false);
  });

  it('1승 OR 98 말: G1·G2·G3 은 제안하지 않고, L(OR 95 이상)은 제안한다', () => {
    const state = prepare((h) => { h.record.wins = 1; h.officialRating = 98; });
    const course = homeCourse(state).id;
    const distance = state.horses[horseId]!.aptitude.distanceOptimum;
    const graded = (id: string, grade: 'G1' | 'G2' | 'G3') => makeTemplate(id, course, distance,
      { kind: 'group', grade, raceClass: 1, conditions: { minAge: 3, maxAge: null, sex: 'open', ratingMin: null, ratingMax: null, weightSystem: 'wfa', baseWeightLb: 126 } });
    const gradedIds = ['rules-g1', 'rules-g2', 'rules-g3'];
    const gradedInput = { ...staticData, templates: [graded('rules-g1', 'G1'), graded('rules-g2', 'G2'), graded('rules-g3', 'G3')] };
    expect(proposeRacePlan(state, gradedInput, horseId).some((p) => gradedIds.includes(p.templateId ?? ''))).toBe(false);

    const listed = makeTemplate('rules-listed', course, distance,
      { kind: 'listed', grade: 'L', raceClass: 1, conditions: { minAge: 3, maxAge: null, sex: 'open', ratingMin: null, ratingMax: null, weightSystem: 'wfa', baseWeightLb: 126 } });
    const listedInput = { ...staticData, templates: [listed] };
    expect(proposeRacePlan(state, listedInput, horseId).some((p) => p.templateId === listed.id)).toBe(true);
  });

  it('거리: 적성 범위 ± 100m 밖은 제안하지 않는다(범위 상한 근처 +100m 은 허용)', () => {
    const state = prepare((h) => { h.record.wins = 1; h.officialRating = null; h.aptitude.distanceRange = 400; });
    const optimum = state.horses[horseId]!.aptitude.distanceOptimum;
    const course = homeCourse(state).id;
    // 적성 폭 400m 이면 적성 상한은 +400m, 허용 상한은 +500m. 510m 밖은 적성 적합 판정은 통과해도 제안하지 않는다.
    const at = (id: string, offset: number) => makeTemplate(id, course, optimum + offset);
    const input = { ...staticData, templates: [at('rules-plus-500', 500), at('rules-minus-500', -500), at('rules-plus-510', 510), at('rules-minus-510', -510)] };
    const plans = proposeRacePlan(state, input, horseId);
    expect(plans.some((p) => p.templateId === 'rules-plus-510' || p.templateId === 'rules-minus-510')).toBe(false);
    expect(plans.some((p) => p.templateId === 'rules-plus-500' || p.templateId === 'rules-minus-500')).toBe(true);
  });

  it('적성 1,700~2,200m 말(중심 1,950m, 폭 250m): 1,600m 미만·2,300m 초과 조건 목표가 없다', () => {
    const state = prepare((h) => { h.record.wins = 1; h.officialRating = 90; h.aptitude.distanceOptimum = 1950; h.aptitude.distanceRange = 250; });
    let targets = 0;
    for (const offset of [0, 4, 8, 12]) {
      const plans = proposeRacePlan(addStateAt(state, offset), staticData, horseId);
      for (const plan of plans) {
        if (plan.target === null) continue;
        targets++;
        expect(plan.target.minDistance).toBeGreaterThanOrEqual(1600);
        expect(plan.target.maxDistance).toBeLessThanOrEqual(2300);
      }
    }
    expect(targets).toBeGreaterThan(0);
  });

  it('같은 주 같은 조건이면 국내 개최를 원정보다 먼저 고른다(입력 순서와 무관)', () => {
    const state = prepare((h) => { h.record.wins = 1; h.officialRating = null; }, { year: 2026, week: 13 });
    const distance = state.horses[horseId]!.aptitude.distanceOptimum;
    const domestic = makeTemplate('rules-domestic', homeCourse(state).id, distance);
    const foreign = makeTemplate('rules-foreign', foreignCourse(state).id, distance);
    const plans = proposeRacePlan(state, { ...staticData, templates: [foreign, domestic] }, horseId);
    expect(plans[0]!.templateId).toBe(domestic.id);
    expect(plans[0]!.note).not.toContain('원정 개최');
  });

  it('2세 미승리 말은 2세 조건 레이스를 제안할 수 있다', () => {
    const state = prepare((h) => { h.record.wins = 0; h.officialRating = null; h.birthYear = 2024; }, { year: 2026, week: 13 });
    const twoYo = makeTemplate('rules-two-yo', homeCourse(state).id, state.horses[horseId]!.aptitude.distanceOptimum,
      { conditions: { minAge: 2, maxAge: 2, sex: 'open', ratingMin: null, ratingMax: null, weightSystem: 'wfa', baseWeightLb: 126 } });
    expect(proposeRacePlan(state, { ...staticData, templates: [twoYo] }, horseId).some((p) => p.templateId === twoYo.id)).toBe(true);
  });

  it('수동 계획(setRacePlan)은 등급·거리 제한을 받지 않는다', () => {
    const state = prepare((h) => { h.record.wins = 0; h.officialRating = null; });
    const date = addWeeks(state.date, 2);
    const manual: PlannedRace = { id: `${horseId}:${date.year}-${date.week}`, date, templateId: null,
      target: { kinds: ['listed'], minDistance: 1000, maxDistance: 3000, minClass: 1, maxClass: 1 }, status: 'proposed', note: '수동 추가' };
    expect(setRacePlan(state, horseId, [manual]).ok).toBe(true);
  });
});

/** 상태 날짜만 offset 주 뒤로 옮긴 복사본 */
function addStateAt(state: GameState, offset: number): GameState {
  const next = structuredClone(state);
  next.date = addWeeks(state.date, offset);
  return next;
}
