import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as dataSource from '../../src/engine/data/staticData';
import * as config from '../../src/engine/config/nh';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { applyStudRole, chooseStudRole, horseProfile, nhStoreQuote, sireNhValue } from '../../src/engine/stud/nh';
import { canSellToNhStore, createNhStoreSystem, sellToNhStore } from '../../src/engine/sales/nhStore';
import { buildStallionRecord } from '../../src/engine/stud/stand';
import { demandMultiplier } from '../../src/engine/stud/market';
import { retainerRenewalsDue, submitYearEnd, yearEndCandidates } from '../../src/engine/stud/yearEnd';
import { advanceWeek } from '../../src/engine/time/advance';
import { isEligible } from '../../src/engine/season/eligibility';
import { formatDateKo } from '../../src/engine/time/calendar';
import { defaultSubmission } from '../../src/ui/yearEnd/yearEndView';
import { nhStoreErrorKo, studRoleKo } from '../../src/ui/game/text';
import type { DistanceProfile, GameState, StudRole } from '../../src/engine/types';

const data = {
  stallionRecords: dataSource.getStallionRecords(), stallionNames: dataSource.getStallionNames(),
  naming: dataSource.getNamingData(), nicks: dataSource.getNicks(), ...dataSource.getPeopleData(),
  courses: dataSource.getRacecourses(), templates: dataSource.getRaceTemplates(),
  series: dataSource.getSeriesDefinitions(), sales: dataSource.getSalesData(),
};
function boot() {
  return bootstrapGame({ seed: 20261011, playerName: '테스트 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, data);
}
function playerFixture() {
  const state = boot();
  state.date.week = config.NH_STORE_WEEK;
  const horse = Object.values(state.horses).find(h => h.status === 'in_training' && h.sex === 'male')!;
  if (horse.ownerId !== null) state.owners[horse.ownerId]!.horseIds = state.owners[horse.ownerId]!.horseIds.filter(id => id !== horse.id);
  horse.ownerId = state.playerOwnerId;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  horse.birthYear = state.date.year - 3;
  horse.gelded = false;
  horse.aptitude.distanceOptimum = 3000;
  return { state, horse };
}

describe('NH 시장 단위 검증', () => {
  it('설계값·기존 프로필 경계와 실명/게임 종마 가치를 공유한다', () => {
    const { state, horse } = playerFixture();
    expect(config.FLAT_VALUE_BY_PROFILE).toEqual({ speed: 1, classic: 1, middle: 0.6, cup: 0.25 });
    expect(config.NH_VALUE_BY_PROFILE).toEqual({ speed: 0.15, classic: 0.4, middle: 0.8, cup: 1 });
    for (const [distance, profile] of [[1800, 'speed'], [1801, 'classic'], [2200, 'classic'], [2201, 'middle'], [2700, 'middle'], [2701, 'cup']] as const) {
      horse.aptitude.distanceOptimum = distance;
      expect(horseProfile(horse)).toBe(profile);
    }
    for (const record of data.stallionRecords.filter(r => r.studRole === 'nh')) {
      expect(sireNhValue(state, record.key)).toBe(config.NH_VALUE_BY_PROFILE[record.distanceProfile] * config.NH_ROLE_VALUE_MULT.nh);
      if (record.status === 'active') expect(state.stallions[record.key]?.studRole).toBe('nh');
    }
    state.stallions[horse.id] = applyStudRole(buildStallionRecord(state, horse.id, state.date.year, 'GB'), 'dual');
    expect(sireNhValue(state, horse.id)).toBe(config.NH_VALUE_BY_PROFILE.cup * config.NH_ROLE_VALUE_MULT.dual);
    expect(sireNhValue(state, 'missing')).toBe(config.NH_VALUE_BY_PROFILE.classic);
    const before = structuredClone(state);
    expect(chooseStudRole(state, horse)).toBe(chooseStudRole(state, horse));
    expect(nhStoreQuote(state, horse.id)).toBe(nhStoreQuote(state, horse.id));
    expect(state).toEqual(before);
    expect(nhStoreQuote(state, 'missing')).toBeNull();
    horse.aptitude.distanceOptimum = 1400;
    expect(chooseStudRole(state, horse)).toBe('flat');
    // 실제 판매 주가 기존 세일의 모든 북 주차와 겹치지 않는다.
    for (const sale of data.sales.events) for (const book of sale.books) {
      expect(config.NH_STORE_WEEK).not.toBe(sale.week + book.weekOffset);
    }
    expect(formatDateKo({ year: 2026, week: config.NH_STORE_WEEK })).toContain('8월');
  });

  it('플레이어 판매의 기간·소유·성별·나이·상태와 중복 출품을 검사한다', () => {
    const { state, horse } = playerFixture();
    const valid = structuredClone(horse);
    state.date.week = config.NH_STORE_WEEK - 2;
    expect(sellToNhStore(state, horse.id)).toEqual({ ok: false, error: 'not_store_week' });
    for (const week of [config.NH_STORE_WEEK - 1, config.NH_STORE_WEEK, config.NH_STORE_WEEK + 1]) {
      state.date.week = week;
      expect(canSellToNhStore(state, horse.id)).toBeNull();
    }
    expect(canSellToNhStore(state, 'missing')).toBe('not_found');
    const cases = [
      [{ ownerId: null }, 'not_player_horse'], [{ sex: 'female' }, 'not_male'],
      [{ birthYear: state.date.year - 2 }, 'wrong_age'], [{ birthYear: state.date.year - 5 }, 'wrong_age'],
      [{ status: 'stud' }, 'not_racing'], [{ status: 'broodmare' }, 'not_racing'],
      [{ status: 'retired' }, 'not_racing'],
    ] as const;
    for (const [change, error] of cases) {
      Object.assign(horse, valid, change);
      const before = structuredClone(state);
      expect(sellToNhStore(state, horse.id)).toEqual({ ok: false, error });
      expect(state).toEqual(before);
      expect(nhStoreErrorKo(error).length).toBeGreaterThan(0);
    }
    Object.assign(horse, valid, { gelded: true, birthYear: state.date.year - 4 });
    expect(sellToNhStore(state, horse.id).ok).toBe(true);
    state.sales.consignments.push({ horseId: horse.id } as GameState['sales']['consignments'][number]);
    expect(canSellToNhStore(state, horse.id)).toBe('consigned');
  });

  it('견적대로 입금·장부·이벤트를 반환하고 신청 제거·입력 불변·재판매 금지를 지킨다', () => {
    const { state, horse } = playerFixture();
    const race = state.seasonState.meetings.flatMap(m => m.races).find(r => r.status === 'open')!;
    race.declarations.push({ horseId: horse.id, ownerId: state.playerOwnerId, trainerId: horse.trainerId, isPlayer: true, jockeyId: null, weightLb: null });
    const before = structuredClone(state);
    const price = nhStoreQuote(state, horse.id)!;
    const result = sellToNhStore(state, horse.id);
    expect(state).toEqual(before);
    expect(result).toEqual(sellToNhStore(state, horse.id));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.owners[state.playerOwnerId]!.funds).toBe(state.owners[state.playerOwnerId]!.funds + price);
    expect(result.state.economy.playerLedger.at(-1)).toEqual({ date: state.date, category: 'nh_store_sale', amount: price, horseId: horse.id });
    expect(result.events).toEqual([{ type: 'nh_store_sold', horseId: horse.id, price, date: state.date }]);
    expect(result.state.eventLog).toEqual(state.eventLog);
    expect(result.state.rng).toEqual(state.rng);
    expect(result.state.horses[horse.id]).toMatchObject({ status: 'retired', trainerId: null, ownerId: null, nhSoldYear: state.date.year });
    expect(result.state.owners[state.playerOwnerId]!.horseIds).not.toContain(horse.id);
    expect(result.state.seasonState.meetings.flatMap(m => m.races).every(r => !r.declarations.some(d => d.horseId === horse.id))).toBe(true);
    expect(isEligible(result.state.horses[horse.id]!, race.race, state.date, result.state.seasonState)).toBe(false);
    expect(sellToNhStore(result.state, horse.id).ok).toBe(false);
  });

  it('연말 NH 역할의 종부료·북 배수와 속도형 거절, 역할별 수요 중립을 지킨다', () => {
    const { state, horse } = playerFixture();
    state.date = { year: state.date.year + 1, week: 1 };
    const input = defaultSubmission(state);
    input.horses.find(h => h.horseId === horse.id)!.choice = 'stud';
    input.horses.find(h => h.horseId === horse.id)!.studRole = 'nh';
    expect(yearEndCandidates(state).some(h => h.horseId === horse.id && h.allowed.includes('stud'))).toBe(true);
    expect(retainerRenewalsDue(state).length).toBe(input.retainers.length);
    const base = buildStallionRecord(state, horse.id, state.date.year, 'GB');
    const before = structuredClone(state);
    const result = submitYearEnd(state, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.stallions[horse.id]).toMatchObject({ studRole: 'nh', fee: Math.round(base.fee * config.NH_FEE_RATIO), bookLimit: Math.round(base.bookLimit * config.NH_BOOK_MULT), nhReputation: 50 });
    expect(state).toEqual(before);
    for (const role of ['flat', 'dual', 'nh'] as StudRole[]) {
      const neutral = applyStudRole(base, role);
      expect(neutral.fee).toBe(Math.round(base.fee * (role === 'nh' ? config.NH_FEE_RATIO : role === 'dual' ? config.DUAL_FEE_RATIO : 1)));
      expect(neutral.bookLimit).toBe(Math.round(base.bookLimit * (role === 'nh' ? config.NH_BOOK_MULT : role === 'dual' ? config.DUAL_BOOK_MULT : 1)));
      expect(demandMultiplier(neutral)).toBe(1);
      const high = demandMultiplier({ ...neutral, nhReputation: 100 });
      const low = demandMultiplier({ ...neutral, nhReputation: 0 });
      expect(high).toBeGreaterThanOrEqual(1);
      expect(low).toBeLessThanOrEqual(1);
      if (role !== 'flat') expect(high).toBeGreaterThan(low);
      expect(studRoleKo(role)).toBeTruthy();
    }
    horse.aptitude.distanceOptimum = 1400;
    expect(submitYearEnd(state, input)).toEqual({ ok: false, error: 'role_not_allowed', horseId: horse.id });
    input.horses.find(h => h.horseId === horse.id)!.choice = 'continue';
    expect(submitYearEnd(state, input)).toEqual({ ok: false, error: 'role_not_allowed', horseId: horse.id });
  });

  it('AI 판매는 공용 난수·장부를 보존하고 한 주 중복 실행으로 평판을 바꾸지 않는다', () => {
    const state = boot();
    state.date.week = config.NH_STORE_WEEK;
    const system = createNhStoreSystem();
    const rng = createRng(1);
    const beforeRng = rng.getState();
    const ledger = structuredClone(state.economy);
    const events = system.run(state, { date: state.date, rng });
    expect(events.length).toBeGreaterThan(0);
    expect(rng.getState()).toEqual(beforeRng);
    expect(state.economy).toEqual(ledger);
    const after = structuredClone(state);
    expect(system.run(state, { date: state.date, rng })).toEqual([]);
    expect(state).toEqual(after);
    expect(system.run(state, { date: { ...state.date, week: config.NH_STORE_WEEK + 1 }, rng })).toEqual([]);
  });
});

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
/** 자연 진행은 10년 컵형 편입 0두이므로, 진로 판정 검증용 우수 컵형 후보 40두를 명시한다.
 * 기존 AI 말의 ID·이름·소유를 보존하고 거리·나이·능력만 통제한다. 엔진 선발 규칙은 그대로다.
 */
function cupCandidateScenario(): GameState {
  const state = boot();
  const candidates = Object.values(state.horses).filter(h => h.ownerId !== null
    && h.ownerId !== state.playerOwnerId && h.status === 'in_training' && h.sex === 'male' && !h.gelded)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, 40);
  for (const horse of candidates) {
    horse.birthYear = state.date.year - 5;
    horse.aptitude.distanceOptimum = 3000;
    horse.officialRating = 140;
    for (const key of Object.keys(horse.potential) as (keyof typeof horse.potential)[]) {
      horse.potential[key] = 90;
      horse.ability[key] = 90;
    }
  }
  return state;
}

function tenYears() {
  let state = cupCandidateScenario();
  const systems = createGameSystems(data);
  // nh_store 는 createGameSystems 에 등록됨(season 앞)
  const yearly: { year: number; count: number; average: number }[] = [];
  const reputationSamples: number[] = [];
  const sold = new Set<string>();
  for (let i = 0; i < 520; i++) {
    const result = advanceWeek(state, systems);
    const sales = result.events.filter(e => e.type === 'nh_store_sold');
    if (state.date.week === config.NH_STORE_WEEK) {
      yearly.push({ year: state.date.year, count: sales.length,
        average: sales.reduce((sum, e) => sum + e.price, 0) / sales.length });
      reputationSamples.push(...Object.values(result.state.stallions).flatMap(s => s.nhReputation === undefined ? [] : [s.nhReputation]));
    }
    for (const event of sales) sold.add(event.horseId);
    for (const race of result.state.raceResults.filter(race => race.date.year === state.date.year && race.date.week === state.date.week)) {
      for (const runner of race.runners) expect(sold.has(runner.horseId)).toBe(false);
    }
    state = result.state;
  }
  const entrants = Object.values(state.stallions).filter(s => s.aiEntrant);
  const roleCounts = (profile: DistanceProfile) => {
    const matching = entrants.filter(s => horseProfile(state.horses[s.horseId]!) === profile);
    return { total: matching.length, nh: matching.filter(s => s.studRole === 'nh').length,
      nhOrDual: matching.filter(s => s.studRole === 'nh' || s.studRole === 'dual').length };
  };
  return { digest: hash(state), cup: roleCounts('cup'), speed: roleCounts('speed'), yearly,
    reputationMin: Math.min(...reputationSamples), reputationMax: Math.max(...reputationSamples) };
}

it('시드 20261011·우수 컵형 후보 40두의 10년 NH 시장·후속 출주 제외·두 번 동일 결과를 측정한다', () => {
  const first = tenYears();
  writeFileSync('/tmp/wt-f1-nh-measurement.json', JSON.stringify(first, null, 2));
  process.stdout.write(`NH 컵형 후보 시나리오 10년 측정 ${JSON.stringify(first)}\n`);
  expect(first.cup.total).toBeGreaterThan(0);
  expect(first.cup.nhOrDual / first.cup.total).toBeGreaterThanOrEqual(0.7);
  expect(first.speed.total).toBeGreaterThan(0);
  expect(first.speed.nh / first.speed.total).toBeLessThanOrEqual(0.1);
  expect(first.yearly).toHaveLength(10);
  for (const year of first.yearly) {
    expect(year.count).toBeGreaterThan(0);
    expect(year.average).toBeGreaterThanOrEqual(5000);
    expect(year.average).toBeLessThanOrEqual(30000);
  }
  expect(first.reputationMin).toBeGreaterThanOrEqual(0);
  expect(first.reputationMax).toBeLessThanOrEqual(100);
  expect(first.reputationMax).toBeGreaterThan(50);
  expect(tenYears()).toEqual(first);
}, 3_600_000);
