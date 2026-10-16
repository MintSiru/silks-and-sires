import { describe, expect, it } from 'vitest';
import { emptyOffspringStats } from '../../src/engine/breeding/offspring';
import { createCapitalSystem } from '../../src/engine/economy/capital';
import { weeklyCosts } from '../../src/engine/economy/costs';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { buildStallionRecord } from '../../src/engine/stud/stand';
import type { GameState, Horse, SeasonAwards } from '../../src/engine/types';
import { pruneAiHorseRecords, releaseAiRetirees } from '../../src/engine/world/retention';

function fixture(): GameState {
  const state = createNewGame({ seed: 73, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
  state.owners.ai = { ...structuredClone(state.owners[state.playerOwnerId]!), id: 'ai', isPlayer: false,
    funds: -100_000, horseIds: [] };
  state.breeders.b = { id: 'b', name: '가상 목장', country: 'GB', scale: 'small', funds: 2_000_000, horseIds: [] };
  return state;
}

function add(state: GameState, id: string, overrides: Partial<Horse> = {}): Horse {
  const horse = generateHorse(createRng(id), { id, name: id, birthYear: 2000, currentYear: 2040,
    sex: 'male', countryOfBirth: 'GB', status: 'retired', level: 50, ownerId: 'ai' });
  Object.assign(horse, overrides);
  state.horses[id] = horse;
  if (horse.ownerId !== null) state.owners[horse.ownerId]!.horseIds.push(id);
  return horse;
}

function awards(horseId: string): SeasonAwards {
  return { year: 2026, laurel: { horse_of_the_year: horseId, older_horse: null, stayer: null,
    sprinter: null, two_year_old_colt: null, two_year_old_filly: null, three_year_old_colt: null,
    three_year_old_filly: null }, ledger: [], globalRankings: [], bestRace: null,
    leading: { sire: [], damsire: [], jockey: [], trainer: [], owner: [], breeder: [] },
    leadingByCountry: {}, seriesChampions: {} };
}

describe('M4-G2 자금·은퇴·보존', () => {
  it('지속 적자·생산자 수입에도 유한한 평형, 플레이어 자금·공용 RNG 불변', () => {
    const state = fixture();
    const playerFunds = state.owners[state.playerOwnerId]!.funds;
    const rng = createRng(4);
    const beforeRng = rng.getState();
    const system = createCapitalSystem();
    const values: number[] = [];
    for (let year = 2026; year < 2056; year++) {
      state.owners.ai!.funds -= 200_000;
      state.breeders.b!.funds += 900_000;
      system.run(state, { date: { year, week: 52 }, rng });
      values.push(state.owners.ai!.funds);
    }
    expect(values.at(-1)).toBeCloseTo(650_000, -1);
    expect(state.breeders.b!.funds).toBeCloseTo(1_200_000, -1);
    expect(state.economy.currentYear.aiTotals.other).toBeGreaterThan(0);
    expect(state.owners[state.playerOwnerId]!.funds).toBe(playerFunds);
    expect(rng.getState()).toEqual(beforeRng);
  });

  it('AI 은퇴마는 소유·비용에서 빠지고 플레이어 은퇴마 유지비는 계속 낸다', () => {
    const state = fixture();
    add(state, 'ai-retired');
    add(state, 'player-retired', { ownerId: state.playerOwnerId });
    releaseAiRetirees(state);
    expect(state.horses['ai-retired']!.ownerId).toBeNull();
    expect(state.owners.ai!.horseIds).toEqual([]);
    const aiFunds = state.owners.ai!.funds;
    const playerFunds = state.owners[state.playerOwnerId]!.funds;
    weeklyCosts(state, { year: 2040, week: 1 });
    expect(state.owners.ai!.funds).toBe(aiFunds);
    expect(state.owners[state.playerOwnerId]!.funds).toBe(playerFunds - 40);
  });

  it('오래된 무참조 기록·계산 이력·소유 목록만 정리하고 최근 은퇴·사망·내 생산마는 보존', () => {
    const state = fixture();
    add(state, 'old');
    add(state, 'young', { birthYear: 2031 });
    add(state, 'recent-dead', { status: 'dead', diedYear: 2039 });
    add(state, 'player-bred', { breederId: state.playerOwnerId });
    add(state, 'player-owned', { ownerId: state.playerOwnerId });
    state.seasonState.lastRun.old = { year: 2007, week: 20 };
    state.seasonState.ratingHistory.old = [];
    state.seasonState.unratedFigures.old = [70];
    state.breeders.b!.horseIds.push('old');
    expect(pruneAiHorseRecords(state, 2040)).toEqual(['old']);
    expect(state.seasonState.lastRun.old).toBeUndefined();
    expect(state.seasonState.ratingHistory.old).toBeUndefined();
    expect(state.seasonState.unratedFigures.old).toBeUndefined();
    expect(state.owners.ai!.horseIds).not.toContain('old');
    expect(state.breeders.b!.horseIds).not.toContain('old');
  });

  it('살아 있는 말의 부·모·가상 모부 5대와 종마 자마 누계를 보존', () => {
    const state = fixture();
    const live = add(state, 'live', { birthYear: 2038, status: 'in_training', damId: 'dam',
      virtualDam: { name: '가상 모마', sireId: 'damsire', birthYear: 2020 } });
    add(state, 'dam'); add(state, 'damsire');
    let child = live;
    for (let i = 1; i <= 6; i++) { child.sireId = `ancestor-${i}`; child = add(state, `ancestor-${i}`); }
    add(state, 'stats-sire');
    state.sireStats['stats-sire'] = { ...emptyOffspringStats(), starters: 20, earnings: 100_000 };
    const stats = structuredClone(state.sireStats);
    expect(pruneAiHorseRecords(state, 2040)).toEqual(['ancestor-6']);
    expect(state.horses['ancestor-5']).toBeDefined();
    expect(state.horses.dam).toBeDefined();
    expect(state.horses.damsire).toBeDefined();
    expect(state.sireStats).toEqual(stats);
  });

  const references: Record<string, (state: GameState, id: string) => void> = {
    stallion: (s, id) => { s.stallions[id] = buildStallionRecord(s, id, 2020, 'GB'); },
    mare: (s, id) => { s.mares[id] = { horseId: id, coveredBy: null, coveredWeek: null, pregnant: false,
      dueWeek: null, foals: [], blackTypeProduce: 0 }; },
    awards: (s, id) => { s.awardsHistory.push(awards(id)); },
    chronicle: (s, id) => { s.chronicle = [{ id: '2026-1', kind: 'world_classic',
      date: { year: 2026, week: 20 }, player: false, horseId: id }]; },
    legacy: (s, id) => { s.legacy = { lines: [{ id: 'line', founderId: id, parentLineId: 'sl_phalaris',
      establishedYear: 2030, sons: 3, groupWinners: 10, playerBred: false }], families: [] }; },
    raceResult: (s, id) => { s.raceResults.push({ raceId: 'race', racecourseId: 'course',
      date: { year: 2039, week: 20 }, going: 'good', distance: 1600, seed: 1, winningTime: 100,
      sectionalMarks: [], runners: [{ runnerIndex: 0, horseId: id, saddleCloth: 1, draw: 1,
        jockeyId: 'jockey', weightLb: 126, position: 1, finishTime: 100, margin: null,
        beatenLengths: 0, sectionals: [], performanceFigure: 0, odds: null }] }); },
    catalogue: (s, id) => { s.sales.catalogues.push({ saleId: 'sale', year: 2040, status: 'closed',
      lots: [{ lotNo: 1, book: 1, horseId: id, horseName: '가상 말', sireId: null,
        vendor: { kind: 'breeder', id: 'b' }, reserve: null, valuation: 100_000, aiBids: [], result: null }] }); },
    sale: (s, id) => { s.sales.consignments.push({ saleId: 'sale', year: 2040, horseId: id, reserve: null }); },
    saleHistory: (s, id) => { s.sales.history.push({ saleId: 'sale', year: 2040, kind: 'yearling',
      offered: 2, sold: 1, turnover: 100_000, median: 100_000, top: { price: 100_000, horseName: '가상 말', sireId: id } }); },
    event: (s, id) => { s.eventLog.push({ type: 'horse_status_changed', horseId: id,
      from: 'in_training', to: 'retired', date: { year: 2039, week: 1 } }); },
  };
  it.each(Object.entries(references))('%s 참조가 사라진 다음에만 삭제', (_name, reference) => {
    const state = fixture();
    add(state, 'protected'); add(state, 'unreferenced');
    reference(state, 'protected');
    expect(pruneAiHorseRecords(state, 2040)).toEqual(['unreferenced']);
    expect(state.horses.protected).toBeDefined();
  });
});
