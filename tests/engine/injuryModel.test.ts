import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INJURY_HISTORY_LIMIT, INJURY_KINDS, INJURY_RECUR_YEARS, INJURY_LATE_DIAGNOSIS_MULT,
} from '../../src/engine/config/injury';
import { generateHorse } from '../../src/engine/horse/generate';
import { weeklyConditionInPlace } from '../../src/engine/horse/conditioning';
import {
  chooseTreatment, finishInjuryInPlace, injuryWeights, orderVetExam, rollInjury,
  type InjuryContext, type InjuryRollContext,
} from '../../src/engine/horse/injury';
import { getNamePool, getRacecourses, getRaceTemplates } from '../../src/engine/data/staticData';
import { generateSampleField } from '../../src/engine/race/sampleField';
import { runRace } from '../../src/engine/race/runRace';
import { prepareRunner, type RaceContext } from '../../src/engine/race/runnerModel';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { addWeeks } from '../../src/engine/time/calendar';
import { createSeasonSystem } from '../../src/engine/season/system';
import type { GameEvent, GameState, Horse, InjuryKind, InjuryTreatment } from '../../src/engine/types';

const DATE = { year: 2026, week: 25 };
const KINDS = Object.keys(INJURY_KINDS) as InjuryKind[];
const SAMPLE = 100_000;
function horse(): Horse {
  return generateHorse(createRng('injury-fixture'), { id: 'injury-horse', name: 'Silver Fern', sex: 'male',
    birthYear: 2023, currentYear: 2026, countryOfBirth: 'GB', status: 'in_training', level: 65 });
}
function stateWith(kind: InjuryKind = 'tendon', diagnosed = false): GameState {
  const state = createNewGame({ seed: 20261011, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } });
  state.date = { ...DATE };
  const h = horse();
  h.ownerId = state.playerOwnerId;
  h.condition.injury = { kind, weeksOut: INJURY_KINDS[kind].maxWeeks, since: { ...DATE }, diagnosed };
  state.horses[h.id] = h;
  state.owners[state.playerOwnerId]!.horseIds = [h.id];
  return state;
}
function context(overrides: Partial<InjuryContext> = {}): InjuryContext {
  return { date: { ...DATE }, initialSeed: 20261011, isPlayer: true, ...overrides };
}
function sample(age: number, options: InjuryRollContext, seed = 'injury-100k') {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<InjuryKind, number>;
  const rng = createRng(seed);
  for (let i = 0; i < SAMPLE; i++) {
    const injury = rollInjury(age, rng, options);
    counts[injury.kind]++;
    const def = INJURY_KINDS[injury.kind];
    if (injury.weeksOut < def.minWeeks || injury.weeksOut > def.maxWeeks) throw new Error('기간 범위 위반');
  }
  return counts;
}

describe('14종 발생·재발 모델', () => {
  it('고정 시드 10만 회: 빈도 순서·나이·출주·계절과 기간 범위', () => {
    const training = sample(3, { date: DATE });
    const racing = sample(3, { date: DATE, racing: true });
    const winter = sample(3, { date: { year: 2026, week: 1 }, racing: true });
    const adult = sample(4, { date: DATE, racing: true });
    const common = ['sore_shins', 'foot', 'respiratory'] as const;
    const normal = ['stress_fracture', 'chip_fracture', 'joint', 'tendon', 'suspensory', 'bleeding', 'tying_up'] as const;
    const rare = ['fracture', 'laryngeal', 'colic'] as const;
    expect(racing.knock).toBeGreaterThan(Math.max(...common.map((k) => racing[k])));
    expect(Math.min(...common.map((k) => racing[k]))).toBeGreaterThan(Math.max(...normal.map((k) => racing[k])));
    expect(Math.min(...normal.map((k) => racing[k]))).toBeGreaterThan(Math.max(...rare.map((k) => racing[k])));
    expect(adult.sore_shins).toBe(0);
    expect(training.bleeding).toBe(0);
    expect(racing.bleeding).toBeGreaterThan(0);
    expect(winter.respiratory).toBeGreaterThan(racing.respiratory);
    writeFileSync('/tmp/m4-h12-frequency.json', JSON.stringify({ sample: SAMPLE, training, racing, winter, adult }, null, 2));
  }, 30_000);

  it('같은 부위 병력의 재발 배수와 치료·병력 기한·마장 보정', () => {
    const h = horse();
    h.injuryHistory = [{ kind: 'suspensory', since: { year: 2025, week: 25 }, weeks: 20, treatment: 'rest' }];
    const baseOptions = { date: DATE, racing: true };
    const before = sample(3, baseOptions);
    const after = sample(3, { ...baseOptions, horse: h });
    const baseWeights = injuryWeights(3, baseOptions);
    const recurWeights = injuryWeights(3, { ...baseOptions, horse: h });
    const sum = (weights: Record<InjuryKind, number>) => Object.values(weights).reduce((a, b) => a + b, 0);
    const ratio = after.tendon / before.tendon;
    const expected = INJURY_KINDS.tendon.recurMult * sum(baseWeights) / sum(recurWeights);
    expect(ratio).toBeGreaterThan(expected * 0.95);
    expect(ratio).toBeLessThan(expected * 1.05);
    expect(recurWeights.tendon / baseWeights.tendon).toBe(INJURY_KINDS.tendon.recurMult);
    h.injuryHistory[0]!.treatment = 'medical';
    expect(injuryWeights(3, { ...baseOptions, horse: h }).tendon).toBeLessThan(recurWeights.tendon);
    h.injuryHistory[0]!.since.year = DATE.year - INJURY_RECUR_YEARS - 1;
    expect(injuryWeights(3, { ...baseOptions, horse: h })).toEqual(baseWeights);
    h.injuryHistory[0]!.since.year = DATE.year + 1;
    expect(injuryWeights(3, { ...baseOptions, horse: h })).toEqual(baseWeights);
    for (const going of ['firm', 'good_to_firm'] as const) {
      const weights = injuryWeights(3, { ...baseOptions, going });
      for (const k of ['stress_fracture', 'joint', 'foot'] as const) expect(weights[k]).toBeGreaterThan(baseWeights[k]);
    }
    for (const going of ['soft', 'heavy'] as const) {
      const weights = injuryWeights(3, { ...baseOptions, going });
      for (const k of ['tendon', 'tying_up'] as const) expect(weights[k]).toBeGreaterThan(baseWeights[k]);
    }
    writeFileSync('/tmp/m4-h12-recurrence.json', JSON.stringify({ before: before.tendon, after: after.tendon,
      ratio, expected, recurMult: INJURY_KINDS.tendon.recurMult }));
  }, 30_000);

  it('종류·기간은 공용 난수 정확히 2회, 플레이어 숨김 부상만 미확진', () => {
    let hidden = 0;
    const rng = createRng(17);
    const control = createRng(17);
    for (let i = 0; i < 1000; i++) {
      const injury = rollInjury(3, rng, { isPlayer: true, date: DATE });
      expect(injury.since).toEqual(DATE);
      expect(injury.diagnosed).toBe(!INJURY_KINDS[injury.kind].subtle);
      if (injury.diagnosed === false) hidden++;
      control.next(); control.next();
    }
    expect(hidden).toBeGreaterThan(0);
    expect(rng.getState()).toEqual(control.getState());
    expect(rollInjury(3, createRng(1), { isPlayer: false }).diagnosed).toBe(true);
  });
});

describe('플레이어 진단·치료 API', () => {
  it('검사 비용·확진·장부·이벤트·원본 불변·공용 RNG 보존', () => {
    const state = stateWith();
    const before = structuredClone(state);
    const examCost = 225; // 기본 검사 설비 1단계: €300 × 0.75(M4-E1).
    const out = orderVetExam(state, 'injury-horse');
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error(out.error);
    expect(state).toEqual(before);
    expect(out.state.horses['injury-horse']!.condition.injury!.diagnosed).toBe(true);
    expect(out.state.owners[state.playerOwnerId]!.funds).toBe(state.owners[state.playerOwnerId]!.funds - examCost);
    expect(out.state.economy.playerLedger.at(-1)).toMatchObject({ category: 'vet_fee', amount: -examCost });
    expect(out.events[0]).toMatchObject({ type: 'injury_diagnosed', kind: 'tendon' });
    expect(out.state.eventLog).toEqual(state.eventLog); // 기록은 호출자 몫
    expect(out.state.rng).toEqual(state.rng);
    expect(orderVetExam(out.state, 'injury-horse')).toEqual({ ok: false, error: 'already_diagnosed' });
    expect(orderVetExam(state, 'missing')).toEqual({ ok: false, error: 'not_found' });
    const ai = structuredClone(state); ai.horses['injury-horse']!.ownerId = 'ai';
    expect(orderVetExam(ai, 'injury-horse')).toEqual({ ok: false, error: 'not_player_horse' });
    const healthy = structuredClone(state); healthy.horses['injury-horse']!.condition.injury = null;
    expect(orderVetExam(healthy, 'injury-horse')).toEqual({ ok: false, error: 'no_injury' });
    for (const debt of [false, true]) {
      const poor = structuredClone(state);
      if (debt) { poor.economy.mode = 'casual'; poor.economy.debt = 1; }
      else poor.owners[state.playerOwnerId]!.funds = examCost - 1;
      expect(orderVetExam(poor, 'injury-horse')).toEqual({ ok: false, error: 'insufficient_funds' });
    }
  });

  it('치료 허용·중복·자금·확진 조건과 원본 불변', () => {
    const state = stateWith('tendon', true);
    const before = structuredClone(state);
    const out = chooseTreatment(state, 'injury-horse', 'medical');
    if (!out.ok) throw new Error(out.error);
    expect(state).toEqual(before);
    expect(out.state.rng).toEqual(state.rng);
    expect(out.state.horses['injury-horse']!.condition.injury).toMatchObject({ treatment: 'medical', weeksOut: 47 });
    expect(out.state.economy.playerLedger.at(-1)).toMatchObject({ category: 'vet_fee', amount: -9000 });
    expect(out.events[0]).toMatchObject({ type: 'injury_treated', treatment: 'medical', cost: 9000, weeksOut: 47 });
    for (const treatment of ['rest', 'medical', 'surgery'] as const) {
      expect(chooseTreatment(out.state, 'injury-horse', treatment)).toEqual({ ok: false, error: 'already_treated' });
    }
    expect(chooseTreatment(stateWith(), 'injury-horse', 'medical')).toEqual({ ok: false, error: 'not_diagnosed' });
    expect(chooseTreatment(state, 'missing', 'medical')).toEqual({ ok: false, error: 'not_found' });
    const ai = structuredClone(state); ai.horses['injury-horse']!.ownerId = 'ai';
    expect(chooseTreatment(ai, 'injury-horse', 'medical')).toEqual({ ok: false, error: 'not_player_horse' });
    const healthy = structuredClone(state); healthy.horses['injury-horse']!.condition.injury = null;
    expect(chooseTreatment(healthy, 'injury-horse', 'medical')).toEqual({ ok: false, error: 'no_injury' });
    expect(chooseTreatment(state, 'injury-horse', 'surgery')).toEqual({ ok: false, error: 'not_allowed' });
    const poor = structuredClone(state); poor.owners[state.playerOwnerId]!.funds = 0;
    expect(chooseTreatment(poor, 'injury-horse', 'medical')).toEqual({ ok: false, error: 'insufficient_funds' });
    poor.owners[state.playerOwnerId]!.funds = 100000; poor.economy.mode = 'casual'; poor.economy.debt = 1;
    expect(chooseTreatment(poor, 'injury-horse', 'medical')).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(chooseTreatment(poor, 'injury-horse', 'rest').ok).toBe(true);
  });

  it('14종 치료 허용 목록과 정수 기간 하한, 휴양 뒤 유료 치료 가능', () => {
    for (const kind of KINDS) {
      for (const treatment of ['rest', 'medical', 'surgery'] as const) {
        const state = stateWith(kind, true);
        state.horses['injury-horse']!.condition.injury!.weeksOut = 1;
        const out = chooseTreatment(state, 'injury-horse', treatment);
        expect(out.ok).toBe(INJURY_KINDS[kind].treatments[treatment] !== undefined);
        if (out.ok) {
          const weeks = out.state.horses['injury-horse']!.condition.injury!.weeksOut;
          expect(Number.isInteger(weeks)).toBe(true); expect(weeks).toBeGreaterThanOrEqual(1);
          if (kind === 'laryngeal' && treatment === 'surgery') {
            expect(weeks).toBeGreaterThanOrEqual(8); expect(weeks).toBeLessThanOrEqual(12);
          }
        }
      }
    }
    const resting = chooseTreatment(stateWith('foot', true), 'injury-horse', 'rest');
    if (!resting.ok) throw new Error(resting.error);
    expect(chooseTreatment(resting.state, 'injury-horse', 'medical').ok).toBe(true);
  });

  it('3주 후 자동 확진·남은 기간 1.25배와 단기 숨김 부상 확진', () => {
    for (const kind of ['tendon', 'laryngeal'] as const) {
      const h = stateWith(kind).horses['injury-horse']!;
      const events: GameEvent[] = [];
      const initial = h.condition.injury!.weeksOut;
      for (let week = 1; week <= 3; week++) {
        weeklyConditionInPlace(h, undefined, 3, false, createRng(week), context({ date: addWeeks(DATE, week), events }));
        expect(h.condition.injury!.diagnosed).toBe(week === 3);
      }
      if (kind === 'tendon') expect(h.condition.injury!.weeksOut).toBe(Math.ceil((initial - 3) * INJURY_LATE_DIAGNOSIS_MULT));
      else expect(h.condition.injury!.weeksOut).toBeGreaterThanOrEqual(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'injury_diagnosed', kind });
    }
  });
});

describe('회복·영구 영향·은퇴·사망', () => {
  it('병력 1줄, 능력·잠재력 감소 및 기복 가산이 기록과 일치하며 상한 20건', () => {
    const template = horse();
    let abilityLoss = 0; let varianceGain = 0;
    for (const kind of ['fracture', 'joint', 'bleeding', 'tendon', 'suspensory', 'chip_fracture'] as const) {
      for (let seed = 0; seed < 100; seed++) {
        const h = structuredClone(template);
        h.condition.injury = { kind, weeksOut: 0, since: DATE };
        const ctx = context({ initialSeed: seed, date: addWeeks(DATE, 10) });
        finishInjuryInPlace(h, ctx);
        expect(h.condition.injury).toBeNull();
        expect(h.injuryHistory).toHaveLength(1);
        const record = h.injuryHistory![0]!;
        expect(record).toMatchObject({ kind, since: DATE, weeks: 10, treatment: 'rest' });
        for (const key of ['speed', 'stamina'] as const) {
          const loss = record.permanent?.[key] ?? 0;
          expect(template.ability[key] - h.ability[key]).toBeCloseTo(loss);
          expect(template.potential[key] - h.potential[key]).toBeCloseTo(loss);
          if (loss > 0) abilityLoss++;
        }
        expect(h.formVariance ?? 0).toBe(record.permanent?.formVariance ?? 0);
        if (h.formVariance) varianceGain++;
        finishInjuryInPlace(h, ctx);
        expect(h.injuryHistory).toHaveLength(1);
        expect(h.status).toBe('in_training');
      }
    }
    expect(abilityLoss).toBeGreaterThan(0); expect(varianceGain).toBeGreaterThan(0);
    const h = horse();
    for (let i = 0; i < INJURY_HISTORY_LIMIT + 5; i++) {
      h.condition.injury = { kind: 'knock', weeksOut: 0, since: addWeeks(DATE, i) };
      finishInjuryInPlace(h, context({ date: addWeeks(DATE, i + 1) }));
    }
    expect(h.injuryHistory).toHaveLength(INJURY_HISTORY_LIMIT);
    expect(h.injuryHistory![0]!.since).toEqual(addWeeks(DATE, 5));
  });

  it('후두 수술 성공 시 손실 없음, 실패·휴양 시 스태미나 감소', () => {
    let successes = 0; let failures = 0;
    for (let seed = 0; seed < 100; seed++) {
      const state = stateWith('laryngeal', true); state.initialSeed = seed;
      const before = state.horses['injury-horse']!.ability.stamina;
      const out = chooseTreatment(state, 'injury-horse', 'surgery');
      if (!out.ok) throw new Error(out.error);
      const h = out.state.horses['injury-horse']!;
      finishInjuryInPlace(h, context({ initialSeed: seed, date: addWeeks(DATE, 12) }));
      if (h.ability.stamina === before) successes++;
      else { failures++; expect(before - h.ability.stamina).toBeCloseTo(INJURY_KINDS.laryngeal.permanent.stamina!); }
      const rest = state.horses['injury-horse']!;
      finishInjuryInPlace(rest, context({ initialSeed: seed, date: addWeeks(DATE, 2) }));
      expect(before - rest.ability.stamina).toBeCloseTo(INJURY_KINDS.laryngeal.permanent.stamina!);
    }
    expect(successes).toBeGreaterThan(60); expect(failures).toBeGreaterThan(0);
  });

  it('AI 골절만 자동 은퇴, 산통 사망은 치료별 감소하고 주요 말만 이벤트', () => {
    let retired = 0;
    const deaths: Record<InjuryTreatment, number> = { rest: 0, medical: 0, surgery: 0 };
    const template = horse();
    for (let seed = 0; seed < 2000; seed++) {
      const h = structuredClone(template);
      h.condition.injury = { kind: 'fracture', since: DATE, weeksOut: 0 };
      finishInjuryInPlace(h, context({ initialSeed: seed, isPlayer: false }));
      if (h.status === 'retired') retired++;
      for (const treatment of ['rest', 'medical', 'surgery'] as const) {
        const c = structuredClone(template);
        c.condition.injury = { kind: 'colic', since: DATE, weeksOut: 0, treatment };
        const events: GameEvent[] = [];
        finishInjuryInPlace(c, context({ initialSeed: seed, events }));
        if (c.status === 'dead') {
          deaths[treatment]++;
          expect(c.diedYear).toBe(DATE.year);
          expect(events).toEqual([{ type: 'horse_died', horseId: c.id, cause: 'illness', date: DATE }]);
          for (const notable of [false, true]) {
            const ai = structuredClone(template);
            ai.condition.injury = { kind: 'colic', since: DATE, weeksOut: 0, treatment };
            const aiEvents: GameEvent[] = [];
            finishInjuryInPlace(ai, context({ initialSeed: seed, isPlayer: false, notable, events: aiEvents }));
            expect(aiEvents).toHaveLength(notable ? 1 : 0);
          }
        }
      }
    }
    expect(retired).toBeGreaterThan(700);
    expect(deaths.rest).toBeGreaterThan(deaths.medical);
    expect(deaths.medical).toBeGreaterThan(deaths.surgery);
  });
});

describe('시즌 통합 진단 이벤트', () => {
  const system = createSeasonSystem({ courses: [], templates: [], series: [], nicks: [] });
  it('숨김 단서만 발행하고 자동 확진 이벤트는 한 번만 발행한다', () => {
    const state = stateWith('tendon');
    const h = state.horses['injury-horse']!;
    h.condition.injury = null;
    // 발생 종류를 고정하되 실제 주간 발생 호출 경로를 통과시킨다.
    const rng = createRng(1);
    const weights = injuryWeights(3, { date: DATE });
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const offset = KINDS.slice(0, KINDS.indexOf('tendon')).reduce((sum, kind) => sum + weights[kind], 0);
    const controlled = { ...rng, fork: () => controlled, chance: () => true,
      next: () => (offset + weights.tendon / 2) / total, int: () => 30 };
    const events = system.run(state, { date: DATE, rng: controlled });
    expect(h.condition.injury).toMatchObject({ kind: 'tendon', diagnosed: false, since: DATE });
    expect(events.filter((e) => e.type === 'horse_injured')).toHaveLength(0);
    expect(events).toContainEqual({ type: 'injury_suspected', horseId: h.id, region: 'tendon', date: DATE });
    const subsequent: GameEvent[] = [];
    for (let w = 1; w <= 4; w++) subsequent.push(...system.run(state, { date: addWeeks(DATE, w), rng: createRng(w) }));
    expect(subsequent.filter((e) => e.type === 'injury_diagnosed')).toHaveLength(1);
  });

  it('명백한 부상은 기존 horse_injured 이벤트를 유지한다', () => {
    const state = stateWith(); state.horses['injury-horse']!.condition.injury = null;
    const rng = createRng(1);
    const controlled = { ...rng, fork: () => controlled, chance: () => true, next: () => 0, int: () => 2 };
    const events = system.run(state, { date: DATE, rng: controlled });
    expect(events).toContainEqual({ type: 'horse_injured', horseId: 'injury-horse', kind: 'knock', weeksOut: 2, date: DATE });
  });
});


describe('레이스 컨디션 기복', () => {
  it('기복 0과 생략은 실제 레이스 결과·리플레이가 같고, 양수면 폼 난수 폭만 증가한다', () => {
    const course = getRacecourses()[0]!;
    const race = getRaceTemplates().find((r) => r.racecourseId === course.id)!;
    const field = generateSampleField(createRng(31), { size: 3, distance: race.distance,
      surface: 'turf', year: DATE.year, namePool: getNamePool() });
    const zero = structuredClone(field);
    for (const r of zero.runners) Object.assign(r.horse, { formVariance: 0 });
    const input = { course, race, going: 'good' as const, date: DATE, seed: 20261011 };
    const absentResult = runRace({ ...input, field });
    const zeroResult = runRace({ ...input, field: zero });
    expect(zeroResult.sim).toEqual(absentResult.sim);
    expect(zeroResult.entries).toEqual(absentResult.entries);
    expect(zeroResult.strengths).toEqual(absentResult.strengths);
    const runner = { ...field.runners[0]!, entry: absentResult.entries[0]! };
    const ctx: RaceContext = { distance: race.distance, going: 'good', surface: 'turf',
      handedness: 'left', undulation: 0, trackWidth: 20 };
    const normalRng = createRng(42); const variableRng = createRng(42);
    const normal = prepareRunner(runner, 0, ctx, normalRng);
    const variable = prepareRunner({ ...runner, horse: { ...runner.horse, formVariance: 0.02 } }, 0, ctx, variableRng);
    expect(normal.cruiseSpeed).not.toBe(variable.cruiseSpeed);
    expect(normal.startDelay).toBe(variable.startDelay);
    expect(normalRng.getState()).toEqual(variableRng.getState());
  });
});
