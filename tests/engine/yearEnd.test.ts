import { emptyCareer } from '../../src/engine/people/generate';
import { describe, expect, it } from 'vitest';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapRacingPopulation } from '../../src/engine/world/population';
import { bootstrapWorld } from '../../src/engine/state/world';
import { createRng } from '../../src/engine/rng';
import { getPeopleData, getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createNewGame } from '../../src/engine/state/newGame';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import { createContractsSystem } from '../../src/engine/economy/contracts';
import { submitYearEnd, yearEndCandidates, yearEndPending, retainerRenewalsDue } from '../../src/engine/stud/yearEnd';
import type { GameState, YearEndSubmission, YearEndChoice } from '../../src/engine/types';
import { mareCapacity } from '../../src/engine/farm/purchase';

function fresh(): GameState {
  const state = bootstrapWorld(createNewGame({ seed: 20261011, playerName: '테스트',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }), { stallionRecords: getStallionRecords(), stallionNames: getStallionNames(),
      nicks: getNicks(), naming: getNamingData() }, createRng(20261011));
  state.date = { year: state.date.year + 1, week: 1 };
  return state;
}
function submission(state: GameState): YearEndSubmission {
  return { year: state.date.year,
    horses: yearEndCandidates(state).map((c) => ({ horseId: c.horseId, choice: c.recommended })),
    retainers: retainerRenewalsDue(state).map((c) => ({ kind: c.kind, personId: c.personId, renew: true })) };
}
function fixture() {
  const state = fresh();
  const template = Object.values(state.horses)[0]!;
  for (const horse of Object.values(state.horses)) {
    if (horse.ownerId === state.playerOwnerId) horse.status = 'retired';
  }
  const choices: YearEndChoice[] = ['continue', 'geld', 'stud', 'broodmare', 'retire'];
  for (const [i, choice] of choices.entries()) {
    const id = `test-${choice}`;
    // 종마·판매 선택지는 통산 1승 이상만 허용된다(M7-C1). 픽스처 말은 1승으로 둔다.
    state.horses[id] = { ...structuredClone(template), id, ownerId: state.playerOwnerId,
      status: i % 2 === 0 ? 'in_training' : 'resting', birthYear: state.date.year - 4,
      sex: choice === 'broodmare' ? 'female' : 'male', gelded: false,
      record: { ...structuredClone(template.record), wins: 1, starts: 1 } };
    state.owners[state.playerOwnerId]!.horseIds.push(id);
  }
  const input = submission(state);
  input.horses = choices.map((choice) => ({ horseId: `test-${choice}`, choice }));
  return { state, input };
}

describe('연말 정산 제출', () => {
  it.each([4, 5, 8])('암말 새 나이 %i: 5세부터 번식을 추천하고 플레이어 선택은 보존한다', (age) => {
    const { state } = fixture();
    const horse = state.horses['test-broodmare']!;
    horse.birthYear = state.date.year - age;
    const before = structuredClone(state);
    expect(yearEndCandidates(state).find((c) => c.horseId === horse.id)!.recommended)
      .toBe(age >= 5 ? 'broodmare' : 'continue');
    expect(state).toEqual(before);
    if (age < 8) {
      const input = submission(state);
      input.horses.find((h) => h.horseId === horse.id)!.choice = 'continue';
      const result = submitYearEnd(state, input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.state.horses[horse.id]!.status).toBe(horse.status);
    }
  });

  it('번식 칸이 하나면 id 순으로 한 두만 추천해 기본 제출이 수용 한도를 지킨다', () => {
    const { state } = fixture();
    for (let i = 0; i < mareCapacity(state) - 1; i++) {
      const id = `existing-mare-${i}`;
      state.horses[id] = { ...structuredClone(state.horses['test-broodmare']!), id, status: 'broodmare' };
    }
    for (const id of ['test-broodmare', 'test-continue', 'test-retire']) {
      state.horses[id]!.sex = 'female';
      state.horses[id]!.birthYear = state.date.year - 5;
    }
    expect(yearEndCandidates(state).filter((c) => c.recommended === 'broodmare').map((c) => c.horseId))
      .toEqual(['test-broodmare']);
    const result = submitYearEnd(state, submission(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.state.date.year++;
    expect(yearEndCandidates(result.state).find((c) => c.horseId === 'test-continue')!.recommended).toBe('continue');
    result.state.horses['test-continue']!.birthYear = result.state.date.year - 8;
    expect(yearEndCandidates(result.state).find((c) => c.horseId === 'test-continue')!.recommended).toBe('retire');
  });

  it('목장이 없거나 위탁 중이면 5세 암말에도 번식을 추천하지 않는다', () => {
    const { state } = fixture();
    const horse = state.horses['test-broodmare']!;
    horse.birthYear = state.date.year - 5;
    state.farm.owned = false;
    expect(yearEndCandidates(state).find((c) => c.horseId === horse.id)!.recommended).toBe('continue');
    state.farm.owned = true;
    state.sales.consignments.push({ horseId: horse.id, saleId: 'test-sale', year: state.date.year, reserve: null });
    expect(yearEndCandidates(state).find((c) => c.horseId === horse.id)!.recommended).toBe('continue');
  });

  it('시드 20261011에서 다음 해 1주까지 진행하면 현역마 전부가 정렬된 후보가 된다', () => {
    let state = bootstrapRacingPopulation(bootstrapPeople(fresh(), getPeopleData(), createRng(20261011)), {
      stallionRecords: getStallionRecords(), naming: getNamingData(), stallionNames: getStallionNames(),
    }, createRng(20261011));
    const horse = Object.values(state.horses).find((h) => h.status === 'in_training')!;
    if (horse.ownerId !== null) {
      const owner = state.owners[horse.ownerId]!;
      owner.horseIds = owner.horseIds.filter((id) => id !== horse.id);
    }
    horse.ownerId = state.playerOwnerId;
    state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
    state.date.year--;
    while (state.date.year === state.yearEnd.lastSubmittedYear) {
      state = advanceWeek(state, [calendarSystem]).state;
    }
    expect(yearEndPending(state)).toBe(true);
    const ids = yearEndCandidates(state).map((c) => c.horseId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(Object.values(state.horses).filter((h) => h.ownerId === state.playerOwnerId
      && ['in_training', 'resting'].includes(h.status)).map((h) => h.id).sort());
  }, 30_000);

  it('모든 진로를 적용하며 입력·난수·로그를 보존하고 같은 결과를 낸다', () => {
    const { state, input } = fixture();
    const before = structuredClone(state);
    const result = submitYearEnd(state, input);
    expect(result).toEqual(submitYearEnd(state, input));
    expect(state).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.state;
    expect(next.horses['test-continue']).toEqual(state.horses['test-continue']);
    expect(next.horses['test-geld']!.gelded).toBe(true);
    expect(next.horses['test-stud']!.status).toBe('stud');
    expect(next.stallions['test-stud']).toBeDefined();
    expect(next.horses['test-broodmare']!.status).toBe('broodmare');
    expect(next.mares['test-broodmare']).toEqual({ horseId: 'test-broodmare', coveredBy: null,
      coveredWeek: null, pregnant: false, dueWeek: null, foals: [], blackTypeProduce: 0 });
    expect(next.horses['test-retire']!.ownerId).toBeNull();
    expect(next.horses['test-retire']!.status).toBe('retired');
    expect(next.owners[next.playerOwnerId]!.horseIds).not.toContain('test-retire');
    for (const id of ['test-stud', 'test-broodmare', 'test-retire']) {
      expect(next.horses[id]!.trainerId).toBeNull();
    }
    expect(result.events).toHaveLength(3);
    expect(result.events.every((e) => 'date' in e && e.date.year === state.date.year && e.date.week === 1)).toBe(true);
    expect(next.rng).toEqual(state.rng);
    expect(next.eventLog).toEqual(state.eventLog);
    expect(next.yearEnd.lastSubmittedYear).toBe(state.date.year);
    expect(yearEndPending(next)).toBe(false);
  });

  it('열린 경주의 해당 플레이어 선언만 제거한다', () => {
    const { state, input } = fixture();
    const declarations = input.horses.map(({ horseId }) => ({ horseId, ownerId: state.playerOwnerId,
      trainerId: null, jockeyId: null, weightLb: null, isPlayer: true }));
    declarations.push({ ...declarations[2]!, isPlayer: false });
    const race = { id: 'test-race', name: '가상 경주', racecourseId: 'test-course', distance: 1600,
      kind: 'maiden' as const, grade: null, raceClass: 5 as const, maxRunners: 10, prizeMoney: [100],
      conditions: { minAge: 3, maxAge: null, sex: 'open' as const, ratingMin: null, ratingMax: null,
        weightSystem: 'level' as const, baseWeightLb: 120 } };
    state.seasonState.meetings = [{ id: 'test-meeting', date: { ...state.date },
      racecourseId: 'test-course', going: null, races: ['open', 'closed', 'run', 'abandoned'].map(
        (status) => ({ race, status: status as 'open' | 'closed' | 'run' | 'abandoned',
          templateId: null, simulated: false, declarations: structuredClone(declarations) })) }];
    const result = submitYearEnd(state, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const races = result.state.seasonState.meetings[0]!.races;
    expect(races[0]!.declarations.map((d) => [d.horseId, d.isPlayer])).toEqual([
      ['test-continue', true], ['test-geld', true], ['test-stud', false],
    ]);
    for (const closed of races.slice(1)) expect(closed.declarations).toEqual(declarations);
  });

  it.each([[8, false, false], [8, true, true], [10, true, false]] as const)(
    '나이 %i 거세 %s의 속행 허용은 %s', (age, gelded, allowed) => {
      const { state } = fixture();
      const horse = state.horses['test-continue']!;
      horse.birthYear = state.date.year - age;
      horse.gelded = gelded;
      expect(yearEndCandidates(state).find((c) => c.horseId === horse.id)!.allowed.includes('continue')).toBe(allowed);
      const input = submission(state);
      input.horses.find((d) => d.horseId === horse.id)!.choice = 'continue';
      const result = submitYearEnd(state, input);
      expect(result.ok).toBe(allowed);
      if (!allowed) expect(result).toEqual({ ok: false, error: 'choice_not_allowed', horseId: horse.id });
    });

  it('위탁 중이면 나이와 관계없이 continue만 허용한다', () => {
    const { state } = fixture();
    state.horses['test-stud']!.birthYear = state.date.year - 12;
    state.sales.consignments.push({ horseId: 'test-stud', year: state.date.year, saleId: 'test-sale', reserve: null });
    expect(yearEndCandidates(state).find((c) => c.horseId === 'test-stud')).toMatchObject({
      allowed: ['continue'], recommended: 'continue', studFeeEstimate: null });
  });

  it.each(['not_pending', 'wrong_year', 'unknown_horse', 'duplicate_horse', 'missing_horse',
    'choice_not_allowed', 'no_free_slot', 'retainer_mismatch'] as const)('%s 실패는 입력을 보존한다', (error) => {
    const { state, input } = fixture();
    if (error === 'not_pending') state.date.week = 2;
    if (error === 'wrong_year') input.year--;
    if (error === 'unknown_horse') input.horses.push({ horseId: 'unknown', choice: 'retire' });
    if (error === 'duplicate_horse') input.horses.push({ ...input.horses[0]! });
    if (error === 'missing_horse') input.horses.pop();
    if (error === 'choice_not_allowed') input.horses.find((d) => d.choice === 'broodmare')!.choice = 'stud';
    if (error === 'no_free_slot') input.horses.find((d) => d.choice === 'geld')!.choice = 'stud';
    if (error === 'retainer_mismatch') input.retainers.push({ kind: 'trainer', personId: 'unknown', renew: true });
    const before = structuredClone(state);
    expect(submitYearEnd(state, input)).toMatchObject({ ok: false, error });
    expect(state).toEqual(before);
  });

  it.each([false, true])('갱신 선택 %s를 계약 시스템에서 처리한다', (renew) => {
    const { state } = fixture();
    const personId = 'test-trainer';
    state.trainers[personId] = { id: personId, name: '가상 조교사', country: 'GB',
      yardName: '가상 야드', region: '가상 지역', facilityGrade: 3, style: 'all_round',
      skill: 50, weeklyFee: 200, capacity: 20, birthYear: 1980, staminaBias: 0,
      juvenileFocus: 0.5, eye: 50, career: emptyCareer() };
    state.relations.contracts = [{ kind: 'trainer', personId, startYear: state.date.year - 1,
      endYear: state.date.year - 1, annualFee: 100 }];
    state.relations.values[`trainer:${personId}`] = 100;
    state.owners[state.playerOwnerId]!.funds = 1_000_000;
    const input = submission(state);
    input.retainers[0]!.renew = renew;
    const submitted = submitYearEnd(state, input);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const next = advanceWeek(submitted.state, [createContractsSystem()]);
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'retainer_changed',
      change: renew ? 'renewed' : 'released', ...(renew ? {} : { fee: 0 }) }));
    expect(next.state.yearEnd.declinedRenewals).toEqual([]);
    expect(next.state.relations.values).toEqual(submitted.state.relations.values);
    if (!renew) {
      expect(next.state.owners).toEqual(submitted.state.owners);
      expect(next.state.relations.contracts).toEqual([]);
      expect(next.state.economy).toEqual(submitted.state.economy);
    }
  });
});
