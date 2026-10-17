import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { approveAllMatings, approveMating, changeMating, createMatingPlansSystem, mareQuality, matingAutoBookWeek, matingExpectedFee, matingFeeBudget, matingInbreeding, matingNeedsApproval, matingStallionAvailable, proposeAllMatings, proposeMating, removeMating, replanMatings, setMatingFeeCap, type MatingPlanResult } from '../../src/engine/breeding/matingPlan';
import { nickKey } from '../../src/engine/breeding/nicks';
import { bookCovering } from '../../src/engine/breeding/season';
import { createPedigreeLookup } from '../../src/engine/breeding/realPedigree';
import { MATING_AUTO_BOOK_MAX_INBREEDING, MATING_AUTO_BOOK_WEEK, MATING_FIRST_SEASON_AUTO_BOOK_WEEK, MATING_MAX_BLOOD_PERCENT, MATING_MAX_PER_STALLION } from '../../src/engine/config/mating';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameEvent, GameState, MatingProposal } from '../../src/engine/types';

const staticData = { ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), sales: data.getSalesData(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords() };
let base: GameState;
let mareId: string;
beforeAll(() => {
  base = bootstrapGame({ seed: 20261011, playerName: '가상 마주', startType: 'owner_breeder',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
  mareId = Object.keys(base.mares).sort().find((id) => base.horses[id]?.ownerId === base.playerOwnerId)!;
}, 120_000);
function success(result: MatingPlanResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
function planned(): GameState { return success(replanMatings(structuredClone(base), staticData)); }
function systemRun(state: GameState) {
  const next = structuredClone(state);
  const rng = createRng('사용하면 안 되는 공용 스트림');
  const before = rng.getState();
  const events = createMatingPlansSystem(staticData).run(next, { date: next.date, rng });
  expect(rng.getState()).toEqual(before);
  expect(next.rng).toEqual(state.rng);
  return { state: next, events };
}
function playerMares(state: GameState) {
  return Object.keys(state.mares).filter((id) => state.horses[id]?.ownerId === state.playerOwnerId && state.horses[id]?.status === 'broodmare').sort();
}
/** 검토 대기 제안 가운데 근친 승인 필요(상한 이상) 암말 id */
/**
 * M7-C3 보완 뒤 교배 담당은 근친 상한 아래 종마를 먼저 제안하므로, 승인 대기 규칙을 보려면 제안 종마를 근친 높은 종마로 바꿔 둔다.
 * 암말마다 18.75% 이상 종마가 있으면 그것을, 없으면 12.5% 이상 종마를 고른다(id 순 첫 번째). 상태를 직접 바꾼다.
 */
function forceHeavyProposals(state: GameState): GameState {
  const lookup = createPedigreeLookup(state.horses, staticData.stallionRecords);
  for (const p of state.stud.matingProposals ?? []) {
    if (p.status !== 'proposed') continue;
    const ids = Object.keys(state.stallions).sort();
    const pick = ids.find((id) => matingInbreeding(lookup, id, p.mareId).bloodPercent >= 18.75)
      ?? ids.find((id) => matingNeedsApproval(lookup, id, p.mareId));
    if (pick !== undefined) p.stallionId = pick;
  }
  return state;
}

function riskyIds(state: GameState): string[] {
  const lookup = createPedigreeLookup(state.horses, staticData.stallionRecords);
  return (state.stud.matingProposals ?? []).filter((p) => p.status === 'proposed' && matingNeedsApproval(lookup, p.stallionId, p.mareId))
    .map((p) => p.mareId).sort();
}

describe('교배 제안', () => {
  it('결정성·원본 및 rng 불변, 기본 암말 전부에 예산·근친·쏠림 제한을 지킨다', () => {
    const before = JSON.stringify(base);
    const proposals = proposeAllMatings(base, staticData);
    expect(proposals).toEqual(proposeAllMatings(base, staticData));
    expect(proposals.map((p) => p.mareId)).toEqual(playerMares(base));
    const lookup = createPedigreeLookup(base.horses, staticData.stallionRecords);
    const uses = new Map<string, number>();
    for (const p of proposals) {
      expect(p.alternatives).toHaveLength(2);
      expect(mareQuality(base, p.mareId)).toBeGreaterThanOrEqual(0);
      expect(mareQuality(base, p.mareId)).toBeLessThanOrEqual(100);
      for (const id of [p.stallionId, ...p.alternatives]) {
        expect(matingStallionAvailable(base, id, p.season)).toBe(true);
        const cross = matingInbreeding(lookup, id, p.mareId);
        expect(cross.close).toBe(false);
        expect(cross.bloodPercent).toBeLessThanOrEqual(MATING_MAX_BLOOD_PERCENT);
        expect(matingExpectedFee(base, id, p.season, p.mareId)).toBeLessThanOrEqual(matingFeeBudget(base, p.mareId));
      }
      uses.set(p.stallionId, (uses.get(p.stallionId) ?? 0) + 1);
    }
    expect(Math.max(...uses.values())).toBeLessThanOrEqual(MATING_MAX_PER_STALLION);
    expect(JSON.stringify(base)).toBe(before);
    systemRun(base);
  });

  it('알려지지 않은 니크 표 값과 숨은 능력이 추천을 바꾸지 않는다', () => {
    const state = structuredClone(base);
    state.breeding.revealedNicks = [];
    const unknown = proposeAllMatings(state, staticData);
    const reversed = { ...staticData, nicks: staticData.nicks.map((n) => ({ ...n, value: n.value > 0 ? -1 : 1 })) };
    expect(proposeAllMatings(state, reversed)).toEqual(unknown);
    expect(unknown.every((p) => p.note.includes('니크 미공개'))).toBe(true);
    state.horses[mareId]!.potential.speed = 0;
    expect(proposeAllMatings(state, staticData)).toEqual(unknown);
  });

  it('공개된 니크만 동률 후보의 순위를 바꾼다', () => {
    const state = structuredClone(base);
    const initial = proposeMating(state, staticData, mareId)!;
    const ids = [initial.stallionId, initial.alternatives[0]!].sort();
    state.stallions = Object.fromEntries(ids.map((id) => [id, { ...state.stallions[id]!, fee: 6_000, fertility: 0.9, fertilityHistory: [] }]));
    state.sireStats = {};
    const first = state.horses[ids[0]!]!;
    const second = state.horses[ids[1]!]!;
    second.aptitude = { ...first.aptitude };
    first.sireLineId = '가상 부계 가';
    second.sireLineId = '가상 부계 나';
    const damLine = state.horses[state.horses[mareId]!.sireId!]!.sireLineId!;
    const key = nickKey(second.sireLineId, damLine);
    const nicks = [{ sireLineId: second.sireLineId, damsireLineId: damLine, value: 1, knownAtStart: false }];
    state.breeding.revealedNicks = [];
    expect(proposeMating(state, { ...staticData, nicks }, mareId)?.stallionId).toBe(ids[0]);
    state.breeding.revealedNicks = [key];
    expect(proposeMating(state, { ...staticData, nicks }, mareId)?.stallionId).toBe(ids[1]);
  });

  it('미래 시즌·은퇴·임대·비공개·북 마감·근친을 제외하고 예산 상한 0도 지킨다', () => {
    const state = structuredClone(base);
    const proposal = proposeMating(state, staticData, mareId)!;
    for (const reason of ['future', 'retired', 'leased', 'private', 'full', 'close'] as const) {
      const changed = structuredClone(state);
      const id = proposal.stallionId;
      if (reason === 'future') changed.stallions[id]!.firstSeasonYear = 2099;
      if (reason === 'retired') changed.horses[id]!.status = 'retired';
      if (reason === 'leased') changed.stallions[id]!.leasedAwayUntil = 2099;
      if (reason === 'private') changed.stallions[id]!.privateTo = '존재하지 않는 가상 마주';
      if (reason === 'full') changed.stallions[id]!.bookedThisSeason = changed.stallions[id]!.bookLimit;
      if (reason === 'close') changed.horses[mareId]!.sireId = id;
      const p = proposeMating(changed, staticData, mareId);
      expect([p?.stallionId, ...p?.alternatives ?? []]).not.toContain(id);
    }
    state.settings.matingFeeCap = 0;
    expect(proposeMating(state, staticData, mareId)).toBeNull();
    const ownId = proposal.stallionId;
    state.horses[ownId]!.ownerId = state.playerOwnerId;
    expect(proposeMating(state, staticData, mareId)).toMatchObject({ stallionId: ownId, expectedFee: 0 });
    state.stud.matingProposals = Array.from({ length: 3 }, (_, i) => ({ ...proposal, mareId: `가상 암말 ${i}`, expectedFee: 0 }));
    expect(proposeMating(state, staticData, mareId)?.stallionId).toBe(ownId);
  });

  it('유료 종마 쏠림·잔여 북·무료 교배권 중복을 막는다', () => {
    const state = planned();
    const p = state.stud.matingProposals![0]!;
    state.stud.matingProposals = [0, 1].map((i) => ({ ...p, mareId: `가상 암말 ${i}` }));
    const next = proposeMating(state, staticData, mareId)!;
    expect([next.stallionId, ...next.alternatives]).not.toContain(p.stallionId);
    state.stud.nominations = [{ stallionId: p.stallionId, perSeason: 1, used: 0, season: p.season }];
    state.stud.matingProposals = [];
    state.settings.matingFeeCap = 0;
    const free = proposeMating(state, staticData, mareId)!;
    expect(free.expectedFee).toBe(0);
    state.stud.matingProposals = [{ ...free, mareId: '다른 가상 암말' }];
    expect(proposeMating(state, staticData, mareId)).toBeNull();
  });

  it('이미 예약·교배·만삭, 너무 어린 말과 타인 암말은 제안하지 않는다', () => {
    for (const reason of ['booked', 'covered', 'pregnant', 'young', 'other'] as const) {
      const state = structuredClone(base);
      const mare = state.mares[mareId]!;
      if (reason === 'booked') mare.bookedFor = { stallionId: '가상 종마', season: base.date.year };
      if (reason === 'covered') mare.coveredBy = '가상 종마';
      if (reason === 'pregnant') { mare.pregnant = true; mare.dueWeek = base.date.year * 100 + 27; }
      if (reason === 'young') state.horses[mareId]!.birthYear = base.date.year - 2;
      if (reason === 'other') state.horses[mareId]!.ownerId = null;
      expect(proposeMating(state, staticData, mareId)).toBeNull();
    }
  });
});

describe('승인·변경·제외', () => {
  it('일괄 승인 예약·장부·북 집계가 bookCovering 순차 호출과 같다', () => {
    const state = planned();
    const before = JSON.stringify(state);
    let expected = state;
    const events: GameEvent[] = [];
    for (const p of state.stud.matingProposals!) {
      const booked = bookCovering(expected, state.playerOwnerId, p.mareId, p.stallionId);
      if (!booked.ok) throw new Error(booked.error);
      expected = booked.state;
      events.push(...booked.events);
    }
    const result = approveAllMatings(state);
    const actual = success(result);
    expect(actual.mares).toEqual(expected.mares);
    expect(actual.owners).toEqual(expected.owners);
    expect(actual.stallions).toEqual(expected.stallions);
    expect(actual.economy).toEqual(expected.economy);
    expect(result.ok && result.events).toEqual(events);
    expect(actual.stud.matingProposals!.every((p) => p.status === 'booked')).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(approveMating(actual, mareId)).toEqual({ ok: false, error: 'invalid_status' });
  });

  it('1순위 북 마감이면 대안, 전부 북 마감·자금 부족이면 사유와 이벤트', () => {
    const state = planned();
    const p = state.stud.matingProposals!.find((p) => p.mareId === mareId)!;
    state.stallions[p.stallionId]!.bookedThisSeason = state.stallions[p.stallionId]!.bookLimit;
    const booked = success(approveMating(state, mareId));
    expect(booked.stud.matingProposals!.find((p) => p.mareId === mareId)).toMatchObject({ status: 'booked', bookedStallionId: p.alternatives[0] });
    for (const id of p.alternatives) state.stallions[id]!.bookedThisSeason = state.stallions[id]!.bookLimit;
    const failed = approveMating(state, mareId);
    expect(success(failed).stud.matingProposals!.find((p) => p.mareId === mareId)).toMatchObject({ status: 'skipped', note: '북 마감' });
    expect(failed.ok && failed.events[0]).toMatchObject({ type: 'mating_proposal_skipped', reason: '북 마감' });
    const poor = planned();
    poor.owners[poor.playerOwnerId]!.funds = 0;
    expect(success(approveMating(poor, mareId)).stud.matingProposals!.find((p) => p.mareId === mareId)?.note).toContain('자금 부족');
  });

  it('검토 뒤 종부료·상한·교배권이 달라져도 예산을 넘겨 결제하지 않는다', () => {
    const state = planned();
    const p = state.stud.matingProposals!.find((p) => p.mareId === mareId)!;
    state.settings.matingFeeCap = 0;
    const result = approveMating(state, mareId);
    const skipped = success(result);
    expect(skipped.stud.matingProposals!.find((p) => p.mareId === mareId)).toMatchObject({ status: 'skipped', note: '종부료 예산 초과' });
    expect(skipped.owners).toEqual(state.owners);
    state.stud.nominations = [{ stallionId: p.stallionId, perSeason: 1, used: 0, season: p.season }];
    const booked = success(approveMating(state, mareId));
    expect(booked.mares[mareId]!.bookedFor?.feePaid).toBe(0);
    expect(booked.stud.nominations[0]!.used).toBe(1);
    expect(booked.owners).toEqual(state.owners);
    state.stud.nominations[0]!.used = 1;
    expect(success(approveMating(state, mareId)).stud.matingProposals!.find((p) => p.mareId === mareId)?.status).toBe('skipped');
  });

  it('자동 승인 설정으로 다시 짜면 새 제안을 바로 예약하고, 교배 담당은 근친 상한 아래 종마를 먼저 고른다', () => {
    const state = structuredClone(base);
    state.settings.autoApproveMatings = true;
    const result = replanMatings(state, staticData);
    const booked = success(result);
    expect(riskyIds(booked)).toEqual([]);
    expect(booked.stud.matingProposals!.every((p) => p.status === 'booked')).toBe(true);
    expect(result.ok && result.events.filter((e) => e.type === 'covering_booked')).toHaveLength(playerMares(state).length);
    expect(replanMatings(booked, staticData)).toMatchObject({ ok: true, events: [] });
  });

  it('변경은 검토 대기, 빼기는 조용한 skipped이며 다시 짜기도 제외·예약 기록을 보존한다', () => {
    const state = planned();
    const p = state.stud.matingProposals!.find((p) => p.mareId === mareId)!;
    const changed = success(changeMating(state, mareId, p.alternatives[0]!));
    expect(changed.stud.matingProposals!.find((p) => p.mareId === mareId)).toMatchObject({ status: 'proposed', stallionId: p.alternatives[0] });
    const removed = removeMating(changed, mareId);
    expect(removed.ok && removed.events).toEqual([]);
    const replanned = success(replanMatings(success(removed), staticData));
    expect(replanned.stud.matingProposals!.filter((p) => p.mareId === mareId)).toHaveLength(1);
    expect(replanned.stud.matingProposals!.find((p) => p.mareId === mareId)?.status).toBe('skipped');
    expect(changeMating(state, mareId, '없는 종마')).toEqual({ ok: false, error: 'stallion_not_available' });
    expect(approveMating(state, '없는 암말')).toEqual({ ok: false, error: 'not_found' });
    const other = structuredClone(state);
    other.horses[mareId]!.ownerId = null;
    for (const result of [approveMating(other, mareId), changeMating(other, mareId, p.stallionId), removeMating(other, mareId)]) {
      expect(result).toEqual({ ok: false, error: 'not_player_mare' });
    }
    other.date.week = 30;
    expect(approveAllMatings(other)).toEqual({ ok: false, error: 'not_booking_window' });
    expect(setMatingFeeCap(state, -1)).toEqual({ ok: false, error: 'invalid_fee_cap' });
    expect(setMatingFeeCap(state, NaN)).toEqual({ ok: false, error: 'invalid_fee_cap' });
    expect(success(setMatingFeeCap(state, 0)).settings.matingFeeCap).toBe(0);
    expect(success(setMatingFeeCap(state, null)).settings.matingFeeCap).toBeNull();
  });
});

describe('주간 자동 교배', () => {
  it('44주에 한 번 알림, 추가 암말은 조용히 제안, 미검토 만료·다음 창 정리', () => {
    const state = structuredClone(base);
    state.date.week = 44;
    const first = systemRun(state);
    expect(first.events).toEqual([{ type: 'mating_proposals_ready', season: 2027, count: playerMares(state).length, date: state.date }]);
    expect(systemRun(first.state).events).toEqual([]);
    expect(first.state.mares).toEqual(state.mares);
    const next = first.state;
    next.date.week = 45;
    const id = Object.values(next.horses).find((h) => h.ownerId === next.playerOwnerId && h.sex === 'female' && h.status === 'in_training')!.id;
    next.horses[id]!.status = 'broodmare';
    next.mares[id] = { ...next.mares[mareId]!, horseId: id, foals: [] };
    const extra = systemRun(next);
    expect(extra.state.stud.matingProposals!.some((p) => p.mareId === id)).toBe(true);
    expect(extra.events).toEqual([]);
    extra.state.date = { year: 2027, week: 27 };
    const expired = systemRun(extra.state);
    expect(expired.events).toEqual([]);
    expect(expired.state.stud.matingProposals!.every((p) => p.status === 'skipped' && p.note === '검토하지 않아 지나감')).toBe(true);
    expired.state.date.week = 44;
    const renewed = systemRun(expired.state);
    expect(renewed.state.stud.matingProposals!.every((p) => p.season === 2028)).toBe(true);
  });

  it('기본 진행 방식(설정 없음): 자동 예약 주에 빼지 않은 제안을 예약하고 근친 승인 필요 제안은 남기며, false 면 그대로 둔다', () => {
    const state = planned();
    const season = state.stud.matingProposals![0]!.season;
    state.date = { year: season, week: matingAutoBookWeek(state) };
    delete state.settings.autoApproveMatings;
    const risky = riskyIds(state);
    const auto = systemRun(state);
    const statuses = auto.state.stud.matingProposals!.filter((p) => p.season === season);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.filter((p) => risky.includes(p.mareId)).every((p) => p.status === 'proposed')).toBe(true);
    expect(statuses.filter((p) => !risky.includes(p.mareId)).every((p) => p.status === 'booked' || p.status === 'skipped')).toBe(true);
    expect(auto.events.some((e) => e.type === 'covering_booked')).toBe(true);
    const manual = structuredClone(state);
    manual.settings.autoApproveMatings = false;
    const kept = systemRun(manual);
    expect(kept.state.stud.matingProposals!.filter((p) => p.season === season).every((p) => p.status === 'proposed')).toBe(true);
  });

  it('첫 시즌은 6주, 다음 해는 2주에 자동 예약하고 1월 2주에는 예약 기록이 생기지 않는다', () => {
    const start = base.date.year;
    const state = planned();
    delete state.settings.autoApproveMatings;
    expect(matingAutoBookWeek(state)).toBe(MATING_FIRST_SEASON_AUTO_BOOK_WEEK);
    const week2 = structuredClone(state);
    week2.date = { year: start, week: 2 };
    const early = systemRun(week2);
    expect(early.events.some((e) => e.type === 'covering_booked')).toBe(false);
    expect(early.state.stud.matingProposals!.every((p) => p.status === 'proposed')).toBe(true);
    const week6 = structuredClone(state);
    week6.date = { year: start, week: MATING_FIRST_SEASON_AUTO_BOOK_WEEK };
    expect(systemRun(week6).events.some((e) => e.type === 'covering_booked')).toBe(true);
    const nextYear = structuredClone(state);
    nextYear.date = { year: start + 1, week: MATING_AUTO_BOOK_WEEK };
    expect(matingAutoBookWeek(nextYear)).toBe(MATING_AUTO_BOOK_WEEK);
    expect(systemRun(nextYear).state.stud.matingProposals!.some((p) => p.season === start + 1 && p.status === 'booked')).toBe(true);
  });

  it('근친 계수 상한 이상(정확히 12.5%, 18.75%) 제안은 자동 예약 주가 지나도 검토 대기로 남고, 승인하면 예약된다', () => {
    const state = forceHeavyProposals(planned());
    delete state.settings.autoApproveMatings;
    const lookup = createPedigreeLookup(state.horses, staticData.stallionRecords);
    const risky = riskyIds(state);
    expect(risky.length).toBeGreaterThan(0);
    for (const p of state.stud.matingProposals!) {
      const percent = matingInbreeding(lookup, p.stallionId, p.mareId).bloodPercent;
      expect(percent >= MATING_AUTO_BOOK_MAX_INBREEDING * 100).toBe(risky.includes(p.mareId));
    }
    const week6 = structuredClone(state);
    week6.date = { year: base.date.year, week: MATING_FIRST_SEASON_AUTO_BOOK_WEEK };
    const after = systemRun(week6).state;
    for (const id of risky) expect(after.stud.matingProposals!.find((p) => p.mareId === id)?.status).toBe('proposed');
    const high = after.stud.matingProposals!.find((p) => risky.includes(p.mareId)
      && matingInbreeding(lookup, p.stallionId, p.mareId).bloodPercent >= 18.75);
    expect(high).toBeDefined();
    const approved = success(approveMating(after, high!.mareId));
    expect(approved.stud.matingProposals!.find((p) => p.mareId === high!.mareId)?.status).toBe('booked');
  });

  it('즉시 예약 설정의 주간 시스템도 근친 승인 필요 제안은 예약하지 않는다', () => {
    const state = forceHeavyProposals(planned());
    state.settings.autoApproveMatings = true;
    const risky = riskyIds(state);
    const result = systemRun(state);
    expect(risky.length).toBeGreaterThan(0);
    expect(result.state.stud.matingProposals!.every((p) => p.status === (risky.includes(p.mareId) ? 'proposed' : 'booked'))).toBe(true);
  });

  it('창 밖·플레이어 암말 없음에는 레거시 상태를 불필요하게 바꾸지 않는다', () => {
    const closed = structuredClone(base);
    closed.date.week = 30;
    expect(systemRun(closed).state).toEqual(closed);
    const empty = structuredClone(base);
    for (const id of playerMares(empty)) empty.horses[id]!.ownerId = null;
    expect(systemRun(empty).state).toEqual(empty);
  });

  it('시드 20261011 2시즌 전체 시스템에서 자동 예약·교배·다음 해 출산 및 파일 측정', () => {
    let state = bootstrapGame({ seed: 20261011, playerName: '가상 마주', startType: 'owner_breeder', difficulty: 'normal',
      homeCountry: 'GB', economyMode: 'casual', grantRacehorses: true, catastrophicInjuries: true,
      silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
    state.settings.autoApproveMatings = true;
    const startFunds = state.owners[state.playerOwnerId]!.funds;
    const ids = playerMares(state);
    const allEvents: GameEvent[] = [];
    const records = new Map<string, MatingProposal>();
    // 명세상 production 등록은 Opus 담당. 실제 시스템 목록에 테스트에서만 삽입한다.
    const systems = createGameSystems(staticData);
    systems.splice(systems.findIndex((s) => s.id === 'stud_books') + 1, 0, createMatingPlansSystem(staticData));
    const fees: Record<number, number[]> = {};
    for (let week = 0; week < 104; week++) {
      const date = state.date;
      const result = advanceWeek(state, systems);
      state = result.state;
      allEvents.push(...result.events);
      for (const p of state.stud.matingProposals ?? []) records.set(`${p.season}:${p.mareId}`, { ...p });
      for (const e of result.events) if (e.type === 'covering_booked') {
        const season = date.week >= 44 ? date.year + 1 : date.year;
        (fees[season] ??= []).push(e.fee);
      }
    }
    const rows = [2026, 2027, 2028].map((season) => {
      const proposals = [...records.values()].filter((p) => p.season === season);
      const covers = allEvents.filter((e) => e.type === 'conception' && e.date.year === season && ids.includes(e.mareId));
      const born = allEvents.filter((e) => e.type === 'foal_born' && e.date.year === season && ids.includes(e.mareId));
      const fee = fees[season] ?? [];
      return { season, proposals: proposals.length, booked: proposals.filter((p) => p.status === 'booked').length,
        skipped: proposals.filter((p) => p.status === 'skipped').map((p) => ({ mareId: p.mareId, reason: p.note })),
        covers: covers.length, foals: born.length, totalFee: fee.reduce((a, b) => a + b, 0),
        averageFee: fee.length === 0 ? 0 : fee.reduce((a, b) => a + b, 0) / fee.length };
    });
    const measurement = { seed: 20261011, difficulty: 'normal', economyMode: 'casual', weeks: 104,
      startDate: base.date, endDate: state.date, playerMares: ids.length,
      startFunds, endFunds: state.owners[state.playerOwnerId]!.funds, fundsChange: state.owners[state.playerOwnerId]!.funds - startFunds,
      seasons: rows, note: '2028은 2027년 44주 이후 선지급 예약만 포함. 자금 변화는 전체 게임 수입·비용 포함. 실제 교배는 conception 판정 건수.' };
    // 측정 파일은 요청할 때만 쓴다(평소 테스트가 작업 트리를 바꾸지 않게): WRITE_REPORTS=1 npm test
    if (process.env.WRITE_REPORTS) {
      mkdirSync(new URL('../../docs/reports/', import.meta.url), { recursive: true });
      writeFileSync(new URL('../../docs/reports/UX4-auto-mating-measurement.json', import.meta.url), JSON.stringify(measurement, null, 2) + '\n');
    }
    expect(state.date).toEqual({ year: 2028, week: 1 });
    for (const season of [2026, 2027]) {
      for (const id of ids) expect(records.get(`${season}:${id}`)?.status).toMatch(/booked|skipped/);
      expect(rows.find((r) => r.season === season)!.covers).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.season === 2027)!.foals).toBeGreaterThan(0);
    expect([...records.values()].filter((p) => p.status === 'skipped').every((p) => p.note.length > 0)).toBe(true);
    const manual = systemRun(base);
    expect(manual.events.some((e) => e.type === 'covering_booked')).toBe(false);
    expect(manual.state.mares).toEqual(base.mares);
  }, 240_000);
});
