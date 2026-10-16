import { describe, expect, it, vi } from 'vitest';
import { FIELD_SIZE_GROUP, GROUP_SCORE_NOISE_SD } from '../../src/engine/config/entries';
import { RIVAL_BID_BOOST, RIVAL_BIG_RACE_ENTRY_WEIGHT } from '../../src/engine/config/rivals';
import { SALE_BUDGET_SHARE } from '../../src/engine/config/sales';
import { getRaceTemplates, getSalesData } from '../../src/engine/data/staticData';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { collectBidders, computeAiBids, resolveLot } from '../../src/engine/sales/auction';
import { liveAuctionSteps } from '../../src/engine/sales/bidding';
import { declareAiRunners, reconsiderRivalG1Entries } from '../../src/engine/season/declarations';
import { createSeasonSystem } from '../../src/engine/season/system';
import * as raceday from '../../src/engine/season/raceday';
import { createNewGame } from '../../src/engine/state/newGame';
import type { Declaration, GameState, Horse, Meeting, Owner, Rival, SaleLot } from '../../src/engine/types';

const OPTIONS = { seed: 20261011, playerName: '구름들 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const sale = getSalesData().events.find((e) => e.kind === 'yearling')!;

function rival(ownerId = 'rival', intensity = 40): Rival {
  return { ownerId, intensity, active: true, since: 2026, reason: 'same_tier', playerAhead: 0, rivalAhead: 0 };
}

function owner(state: GameState, id: string): Owner {
  const added: Owner = { ...structuredClone(state.owners[state.playerOwnerId]!), id, name: '가상 마주',
    isPlayer: false, funds: 2_000_000, tier: 'major', country: 'GB', horseIds: [] };
  state.owners[id] = added;
  return added;
}

function horse(state: GameState, id: string, ownerId: string | null, rating = 100): Horse {
  const h = generateHorse(createRng(id), { id, name: '구름빛', sex: 'male', birthYear: 2022,
    currentYear: 2026, countryOfBirth: 'GB', status: 'in_training', level: 70, ownerId });
  h.officialRating = rating;
  h.condition = { ...h.condition, injury: null, fitness: 100, fatigue: 0 };
  h.aptitude.distanceOptimum = 2000;
  h.aptitude.distanceRange = 500;
  state.horses[id] = h;
  if (ownerId !== null) state.owners[ownerId]!.horseIds.push(id);
  return h;
}

function auctionFixture() {
  const state = createNewGame(OPTIONS);
  state.owners[state.playerOwnerId]!.funds = 10_000_000;
  owner(state, 'rival');
  owner(state, 'other');
  horse(state, 'lot', null);
  const lot: SaleLot = { lotNo: 1, book: sale.books[0]!.book, horseId: 'lot', horseName: '구름빛',
    sireId: null, vendor: { kind: 'breeder', id: 'vendor' }, reserve: null, valuation: 100_000,
    aiBids: [{ ownerId: 'rival', max: 100_003 }, { ownerId: 'other', max: 90_000 }], result: null };
  return { state, lot };
}

function declaration(h: Horse, isPlayer = false): Declaration {
  return { horseId: h.id, ownerId: h.ownerId!, trainerId: h.trainerId, jockeyId: null, weightLb: null, isPlayer };
}

function entryFixture() {
  const state = createNewGame(OPTIONS);
  owner(state, 'rival');
  owner(state, 'other');
  const player = horse(state, 'player', state.playerOwnerId);
  horse(state, 'a-rival', 'rival', 94);
  horse(state, 'b-other', 'other', 100);
  const template = getRaceTemplates().find((t) => t.grade === 'G1')!;
  const race = { ...structuredClone(template), id: 'test-g1', distance: 2000, maxRunners: 2,
    conditions: { ...template.conditions, minAge: 3, maxAge: null, sex: 'open' as const } };
  const meetings: Meeting[] = [{ id: 'meeting', date: { year: 2026, week: 20 },
    racecourseId: race.racecourseId, going: 'good', races: [{ race, templateId: template.id,
      status: 'open', declarations: [declaration(player, true)], simulated: false }] }];
  return { state, meetings };
}

describe('라이벌 세일 입찰 효과', () => {
  it('플레이어가 유효 입찰한 로트의 저장된 라이벌 상한에 정확한 배율을 적용하고 입력을 보존한다', () => {
    const { state, lot } = auctionFixture();
    state.rivals = [rival()];
    const before = structuredClone({ state, lot });
    const bidders = collectBidders(state, lot, sale, 105_000);
    expect(bidders[0]!.max).toBe(Math.floor(100_003 * (1 + 40 / 100 * RIVAL_BID_BOOST)));
    expect(bidders[1]!.max).toBe(90_000);
    expect(resolveLot(state, lot, sale, 105_000).result).toMatchObject({ kind: 'sold', buyerId: 'rival' });
    expect({ state, lot }).toEqual(before);
    const without = structuredClone(state);
    delete without.rivals;
    expect(resolveLot(without, lot, sale, 105_000).buyerIsPlayer).toBe(true);
  });

  it('라이벌 없음·비활성·강도 0·플레이어 미입찰·무효 입찰이면 기존 경매 결과와 같다', () => {
    const { state, lot } = auctionFixture();
    const expected = collectBidders(state, lot, sale, 105_000);
    for (const rivals of [undefined, [], [rival('rival', 0)], [{ ...rival(), active: false }], [rival('absent')]]) {
      state.rivals = rivals;
      expect(collectBidders(state, lot, sale, 105_000)).toEqual(expected);
    }
    state.rivals = [rival()];
    for (const bid of [null, 0, 100_000_000]) {
      const plain = structuredClone(state);
      delete plain.rivals;
      expect(collectBidders(state, lot, sale, bid)).toEqual(collectBidders(plain, lot, sale, bid));
      expect(resolveLot(state, lot, sale, bid)).toEqual(resolveLot(plain, lot, sale, bid));
    }
  });

  it('기존 후보·예산·수수료 자금 조건을 지키고 저장 상한에는 가중을 누적하지 않는다', () => {
    const { state, lot } = auctionFixture();
    state.rivals = [rival('rival', 100), rival('absent')];
    state.owners['rival']!.funds = 420_000;
    const bids = collectBidders(state, lot, sale, 105_000);
    expect(bids[0]!.max).toBe(Math.floor(420_000 * SALE_BUDGET_SHARE.major));
    expect(bids.map((b) => b.ownerId)).not.toContain('absent');
    expect(collectBidders(state, lot, sale, 105_000)).toEqual(bids);
    expect(lot.aiBids[0]!.max).toBe(100_003);
    // 앞 로트 구매로 현재 규모별 예산이 줄어도 이미 유효한 저장 상한을 낮추지는 않는다.
    state.owners['rival']!.funds = 300_000;
    expect(collectBidders(state, lot, sale, 105_000)[0]!.max).toBe(100_003);
    state.owners['rival']!.funds = 100_003;
    expect(collectBidders(state, lot, sale, 105_000).some((b) => b.ownerId === 'rival')).toBe(false);
  });

  it('카탈로그 후보·저장 상한·난수 소비는 라이벌 유무와 무관하고 실시간 경매는 최종 결과와 같다', () => {
    const { state, lot } = auctionFixture();
    const a = createRng(7);
    const b = createRng(7);
    const before = computeAiBids(state, lot, sale, a, 'GB');
    state.rivals = [rival()];
    expect(computeAiBids(state, lot, sale, b, 'GB')).toEqual(before);
    expect(b.getState()).toEqual(a.getState());
    state.sales.catalogues = [{ saleId: sale.id, year: 2026, status: 'catalogued', lots: [lot] }];
    state.date = { year: 2026, week: sale.week };
    const outcome = resolveLot(state, lot, sale, 105_000);
    const steps = liveAuctionSteps(state, sale.id, 2026, lot.lotNo, 105_000, { sales: getSalesData() });
    expect(outcome.result.kind).toBe('sold');
    if (outcome.result.kind === 'sold') expect(steps.at(-1)).toMatchObject({ price: outcome.result.price, leader: 'ai' });
  });
});

describe('라이벌 G1 출주 효과', () => {
  it('기존 점수 × (1 + 강도/100 × 가중)의 경계 양쪽에서 선발이 바뀌고 공용 RNG 는 같다', () => {
    const { state, meetings } = entryFixture();
    const probe = createRng(17);
    probe.int(FIELD_SIZE_GROUP.min, FIELD_SIZE_GROUP.max);
    const rivalScore = 94 + probe.normal(0, GROUP_SCORE_NOISE_SD);
    const otherScore = 100 + probe.normal(0, GROUP_SCORE_NOISE_SD);
    const boundary = (otherScore / rivalScore - 1) * 100 / RIVAL_BIG_RACE_ENTRY_WEIGHT;
    expect(boundary).toBeGreaterThan(0);
    expect(boundary).toBeLessThan(100);
    const baselineRng = createRng(17);
    const baseline = declareAiRunners(state, meetings, baselineRng, () => 'GB');
    expect(baseline[0]!.races[0]!.declarations[1]!.horseId).toBe('b-other');
    for (const [intensity, expected] of [[boundary - 0.001, 'b-other'], [boundary + 0.001, 'a-rival']] as const) {
      state.rivals = [rival('rival', intensity)];
      const rng = createRng(17);
      const actual = declareAiRunners(state, meetings, rng, () => 'GB');
      expect(actual[0]!.races[0]!.declarations[1]!.horseId).toBe(expected);
      expect(rng.getState()).toEqual(baselineRng.getState());
    }
  });

  it('다음 레이스의 후보 수가 바뀌어도 공용 RNG 소비·재현성·한 주 한 레이스를 지킨다', () => {
    const { state, meetings } = entryFixture();
    horse(state, 'c-other', 'other', 99);
    const next = structuredClone(meetings[0]!.races[0]!);
    next.race.id = 'next';
    next.race.grade = 'G2';
    next.declarations = [];
    meetings[0]!.races.push(next);
    state.horses['b-other']!.countryOfBirth = 'FR';
    let changed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      delete state.rivals;
      const a = createRng(seed);
      const baseline = declareAiRunners(state, meetings, a, () => 'GB');
      state.rivals = [rival('rival', 100)];
      const b = createRng(seed);
      const actual = declareAiRunners(state, meetings, b, () => 'GB');
      if (JSON.stringify(actual) !== JSON.stringify(baseline)) changed++;
      expect(b.getState()).toEqual(a.getState());
      expect(declareAiRunners(state, meetings, createRng(seed), () => 'GB')).toEqual(actual);
      const ids = actual.flatMap((m) => m.races.flatMap((sr) => sr.declarations.map((d) => d.horseId)));
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('라이벌 아님·비활성·G1 아님·플레이어 미신청이면 결과·공용 RNG 모두 같다', () => {
    for (const scenario of ['absent', 'inactive', 'zero', 'G2', 'no-player'] as const) {
      const { state, meetings } = entryFixture();
      state.rivals = [rival(scenario === 'absent' ? 'other-owner' : 'rival', scenario === 'zero' ? 0 : 100)];
      if (scenario === 'inactive') state.rivals[0]!.active = false;
      if (scenario === 'G2') meetings[0]!.races[0]!.race.grade = 'G2';
      if (scenario === 'no-player') meetings[0]!.races[0]!.declarations = [];
      const plain = structuredClone(state);
      delete plain.rivals;
      const a = createRng(17);
      const b = createRng(17);
      expect(declareAiRunners(state, meetings, a, () => 'GB')).toEqual(declareAiRunners(plain, meetings, b, () => 'GB'));
      expect(a.getState()).toEqual(b.getState());
    }
  });

  it.each(['injury', 'distance', 'rating', 'country', 'already-used'] as const)('%s 로 제외된 라이벌은 새 후보로 끌어오지 않는다', (reason) => {
    const { state, meetings } = entryFixture();
    state.rivals = [rival('rival', 100)];
    const h = state.horses['a-rival']!;
    if (reason === 'injury') h.condition.fitness = 0;
    if (reason === 'distance') h.aptitude.distanceOptimum = 4000;
    if (reason === 'rating') h.officialRating = 92;
    if (reason === 'country') h.countryOfBirth = 'US';
    if (reason === 'already-used') {
      const other = structuredClone(meetings[0]!.races[0]!);
      other.race.id = 'already';
      other.status = 'closed';
      other.declarations = [declaration(h)];
      meetings[0]!.races.push(other);
    }
    const plain = structuredClone(state);
    delete plain.rivals;
    expect(declareAiRunners(state, meetings, createRng(17), () => 'GB'))
      .toEqual(declareAiRunners(plain, meetings, createRng(17), () => 'GB'));
  });

  it('전주 AI 접수 뒤 플레이어가 신청한 G1도 재검토하며 다른 레이스·출주 두수·입력은 유지한다', () => {
    const { state, meetings } = entryFixture();
    meetings[0]!.races[0]!.declarations.push(declaration(state.horses['b-other']!));
    const elsewhere = structuredClone(meetings[0]!.races[0]!);
    elsewhere.race.id = 'elsewhere';
    elsewhere.race.grade = 'G2';
    elsewhere.declarations = [declaration(horse(state, 'c-other', 'other'))];
    meetings[0]!.races.push(elsewhere);
    state.rivals = [rival('rival', 100)];
    const before = structuredClone({ state, meetings });
    const actual = reconsiderRivalG1Entries(state, meetings, () => 'GB');
    expect(actual[0]!.races[0]!.declarations.map((d) => d.horseId)).toEqual(['player', 'a-rival']);
    expect(actual[0]!.races[1]).toEqual(elsewhere);
    expect({ state, meetings }).toEqual(before);
    expect(reconsiderRivalG1Entries(state, meetings, () => 'GB')).toEqual(actual);
    state.horses['a-rival']!.officialRating = 92;
    expect(reconsiderRivalG1Entries(state, meetings, () => 'GB')).toEqual(meetings);
  });

  it('season 시스템의 개최 확정 경로가 사전 접수된 G1에 라이벌 효과를 적용한다', () => {
    const { state, meetings } = entryFixture();
    state.rivals = [rival('rival', 100)];
    meetings[0]!.races[0]!.declarations.push(declaration(state.horses['b-other']!));
    state.seasonState.meetings = meetings;
    const rng = createRng(11);
    const baselineRng = createRng(11);
    const plain = structuredClone(state);
    delete plain.rivals;
    const system = createSeasonSystem({ courses: [], templates: [], series: [], nicks: [] });
    const run = vi.spyOn(raceday, 'runMeetingInPlace').mockImplementation((_state, meeting) => ({ meeting, results: [], events: [] }));
    try {
      system.run(state, { date: meetings[0]!.date, rng });
      expect(run.mock.calls[0]![1].races[0]!.declarations.map((d) => d.horseId)).toEqual(['player', 'a-rival']);
      system.run(plain, { date: meetings[0]!.date, rng: baselineRng });
      expect(run.mock.calls[1]![1].races[0]!.declarations.map((d) => d.horseId)).toEqual(['player', 'b-other']);
      expect(rng.getState()).toEqual(baselineRng.getState());
    } finally {
      run.mockRestore();
    }
  });
});
