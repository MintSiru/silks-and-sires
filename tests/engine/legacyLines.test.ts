import { describe, expect, it } from 'vitest';
import { emptyOffspringStats } from '../../src/engine/breeding/offspring';
import { START_YEAR } from '../../src/engine/config/game';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import { generateHorse } from '../../src/engine/horse/generate';
import {
  createLegacySystem, establishedLineOf, familyCandidates, familyOf, lineCandidates, lineLabel,
} from '../../src/engine/legacy/lines';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState, Horse, Stallion } from '../../src/engine/types';

const BASE_LINE = 'sl_phalaris';

function fresh(): GameState {
  const state = createNewGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
  state.date = { year: START_YEAR + 1, week: 1 };
  return state;
}

function horse(state: GameState, id: string, overrides: Partial<Horse> = {}): Horse {
  const added = generateHorse(createRng(id), { id, name: id, sex: 'male', birthYear: START_YEAR - 5,
    currentYear: START_YEAR, countryOfBirth: 'GB', status: 'in_training', level: 60, sireLineId: BASE_LINE });
  Object.assign(added, overrides);
  state.horses[id] = added;
  return added;
}

function stud(state: GameState, id: string, sireId: string | null = null): Stallion {
  horse(state, id, { sireId, status: 'stud' });
  const record: Stallion = { horseId: id, realKey: null, sireLineId: BASE_LINE,
    fee: 1000, bookLimit: 50, bookedThisSeason: 0, bookingSeason: START_YEAR,
    aiBooked: 0, aiDemand: 0, fertility: 0.8, popularity: 50, standsIn: 'GB', firstSeasonYear: START_YEAR };
  state.stallions[id] = record;
  return record;
}

function groupProduce(state: GameState, id: string, count: number): void {
  state.sireStats[id] = { ...emptyOffspringStats(), groupWinners: count };
}

function lineage(sons = 3, founder = 3, total = 8): GameState {
  const state = fresh();
  stud(state, 'founder');
  state.horses.founder!.breederId = state.playerOwnerId;
  groupProduce(state, 'founder', founder);
  for (let i = 0; i < sons; i++) stud(state, `son-${i}`, 'founder');
  groupProduce(state, 'son-0', total - founder);
  return state;
}

function mare(state: GameState, id: string, damId: string | null = null): Horse {
  const added = horse(state, id, { sex: 'female', status: 'broodmare', damId });
  state.mares[id] = { horseId: id, coveredBy: null, coveredWeek: null, pregnant: false,
    dueWeek: null, foals: [], blackTypeProduce: 999 };
  return added;
}

function win(state: GameState, id: string, damId: string, group = true): Horse {
  const added = horse(state, id, { damId });
  if (group) added.record.groupWins = 4;
  else state.seasonState.performances[id] = [{ raceId: `race-${id}`, templateId: null,
    date: { year: START_YEAR, week: 40 }, grade: 'L', distance: 1600, country: 'GB', position: 1, pr: 100 }];
  return added;
}

function run(state: GameState) {
  return advanceWeek(state, [createLegacySystem()]);
}

describe('M5-C 부계 확립', () => {
  it.each([
    [2, 3, 8, false], [3, 2, 8, false], [3, 3, 7, false], [3, 3, 8, true], [4, 4, 10, true],
  ])('종마 아들 %i, 시조 우승 자마 %i, 합계 %i → %s', (sons, founder, total, eligible) => {
    const state = lineage(sons, founder, total);
    expect(lineCandidates(state).find((c) => c.founderId === 'founder')).toEqual({
      founderId: 'founder', sons, founderGroupWinners: founder, groupWinners: total, eligible });
    expect(run(state).state.legacy!.lines).toHaveLength(eligible ? 1 : 0);
  });

  it('실명 종마·혈통표 전용 말은 제외하고 은퇴·사망한 종마 아들은 센다', () => {
    const state = lineage();
    state.horses['son-0']!.status = 'dead';
    state.horses['son-1']!.status = 'retired';
    state.stallions['son-1']!.lastSeasonYear = START_YEAR;
    horse(state, 'untried-son', { sireId: 'founder', status: 'retired' });
    expect(lineCandidates(state).find((c) => c.founderId === 'founder')!.sons).toBe(3);
    expect(run(state).state.legacy!.lines).toHaveLength(1);
    state.stallions.founder!.realKey = 'real-key';
    expect(lineCandidates(state).some((c) => c.founderId === 'founder')).toBe(false);
    state.stallions.founder!.realKey = null;
    state.horses.founder!.status = 'historical';
    expect(lineCandidates(state).some((c) => c.founderId === 'founder')).toBe(false);
  });

  it('연도 전환에만 판정하며 반복 실행·다음 해에 같은 시조를 다시 확립하지 않는다', () => {
    const state = lineage();
    state.date.week = 52;
    expect(run(state).state.legacy).toBeUndefined();
    state.date = { year: START_YEAR, week: 1 };
    expect(run(state).state.legacy).toBeUndefined();
    state.date.year++;
    const first = run(state);
    expect(first.events).toEqual([{ type: 'sire_line_established', horseId: 'founder',
      lineId: 'line_founder', date: state.date }]);
    expect(first.state.chronicle).toEqual([{ id: `${state.date.year}-1`, kind: 'sire_line_established',
      horseId: 'founder', lineId: 'line_founder', count: 8, player: true, date: state.date }]);
    const again = structuredClone(first.state);
    again.date = { ...state.date };
    expect(run(again).events).toEqual([]);
    again.date.year++;
    expect(run(again).state.legacy).toEqual(first.state.legacy);
    expect(run(again).state.chronicle).toEqual(first.state.chronicle);
  });

  it.each([false, true])('아들 분지 확립(같은 해=%s)은 아버지의 확립 id 에 연결한다', (sameYear) => {
    const state = lineage();
    // 사전순으로 아들이 아버지보다 앞서도 결과가 같아야 한다.
    stud(state, 'a-branch', 'founder');
    groupProduce(state, 'a-branch', 3);
    let base = sameYear ? state : run(state).state;
    base = structuredClone(base);
    base.date = { year: START_YEAR + (sameYear ? 1 : 2), week: 1 };
    for (let i = 0; i < 3; i++) stud(base, `grandson-${i}`, 'a-branch');
    groupProduce(base, 'grandson-0', 5);
    const result = run(base).state;
    expect(result.legacy!.lines.find((line) => line.founderId === 'a-branch')!.parentLineId).toBe('line_founder');
    expect(establishedLineOf(result, 'grandson-0')!.founderId).toBe('a-branch');
    expect(establishedLineOf(result, 'son-0')!.founderId).toBe('founder');
  });

  it('표시는 시조 이름 또는 기존 label 을 쓰며 누락·순환 혈통 조회도 종료한다', () => {
    const state = run(lineage()).state;
    expect(lineLabel(state, state.legacy!.lines[0]!)).toBe('founder 계통');
    expect(lineLabel(state, 'line_founder')).toBe('founder 계통');
    expect(lineLabel(state, BASE_LINE)).toBe('Phalaris line');
    expect(lineLabel(state, { id: 'old', label: '기존 계통', parentLineId: null, founderKey: 'key' })).toBe('기존 계통');
    expect(lineLabel(state, 'unknown')).toBe('unknown');
    expect(establishedLineOf(state, 'founder')!.id).toBe('line_founder');
    expect(establishedLineOf(state, 'unknown')).toBeNull();
    horse(state, 'loop-a', { sireId: 'loop-b', damId: 'loop-b' });
    horse(state, 'loop-b', { sireId: 'loop-a', damId: 'loop-a' });
    expect(establishedLineOf(state, 'loop-a')).toBeNull();
    expect(familyOf(state, 'loop-a')).toBeNull();
  });
});

describe('M5-C 명문 모계', () => {
  it('시즌 기록 정리 뒤에도 보존된 리스티드 결과를 읽고 동착·반복 우승마를 중복 집계하지 않는다', () => {
    const state = fresh();
    mare(state, 'root');
    const listed = getRaceTemplates().find((race) => race.grade === 'L')!;
    for (let i = 0; i < 5; i++) win(state, `winner-${i}`, 'root', i === 0);
    state.seasonState.performances = {};
    const runners = [1, 2, 3, 4].map((i) => ({ runnerIndex: i, horseId: `winner-${i}`, saddleCloth: i,
      draw: i, jockeyId: 'jockey', weightLb: 126, position: 1, finishTime: 100, margin: null,
      beatenLengths: 0, sectionals: [], performanceFigure: 0, odds: null }));
    const result = { raceId: listed.id, racecourseId: listed.racecourseId, date: { year: START_YEAR, week: 40 },
      going: 'good' as const, distance: 1600, seed: 1, winningTime: 100, sectionalMarks: [], runners };
    state.raceResults.push(result, structuredClone(result));
    expect(familyCandidates(state)[0]).toMatchObject({ blackTypeWinners: 5, groupWinners: 1, eligible: true });
    expect(run(state).state.legacy!.families).toHaveLength(1);
  });

  it.each([[4, 1, false], [5, 0, false], [5, 1, true]])(
    '블랙타입 우승마 %i두 중 그룹 %i두 → %s', (total, groups, eligible) => {
      const state = fresh();
      mare(state, 'mare');
      state.horses.mare!.breederId = state.playerOwnerId;
      for (let i = 0; i < total; i++) win(state, `winner-${i}`, 'mare', i < groups);
      // 입상·보통 경주 우승은 블랙타입 우승마 수를 늘리지 않는다.
      const placed = horse(state, 'placed', { damId: 'mare' });
      placed.record.blackTypePlacings = 12;
      placed.record.wins = 5;
      expect(familyCandidates(state)).toEqual([{ founderMareId: 'mare', blackTypeWinners: total,
        groupWinners: groups, eligible }]);
      const result = run(state);
      expect(result.state.legacy!.families).toHaveLength(eligible ? 1 : 0);
      if (eligible) {
        expect(result.state.chronicle![0]).toMatchObject({ kind: 'female_family_established', player: true, count: total });
        const again = structuredClone(result.state);
        again.date = { year: START_YEAR + 2, week: 1 };
        expect(run(again).events).toEqual([]);
      }
    },
  );

  it('모계 1~3대만 세며 아들을 통한 자손·4대 자손·기초 암말 자신을 세지 않는다', () => {
    const state = fresh();
    mare(state, 'root').record.groupWins = 1;
    mare(state, 'daughter', 'root');
    mare(state, 'granddaughter', 'daughter');
    mare(state, 'greatgranddaughter', 'granddaughter');
    win(state, 'generation-1', 'root');
    win(state, 'generation-2', 'daughter');
    win(state, 'generation-3', 'granddaughter');
    win(state, 'generation-4', 'greatgranddaughter');
    stud(state, 'son');
    state.horses.son!.damId = 'root';
    win(state, 'paternal', 'unrelated').sireId = 'son';
    state.horses.root!.status = 'dead';
    state.horses.daughter!.status = 'retired';
    expect(familyCandidates(state).find((c) => c.founderMareId === 'root')!.blackTypeWinners).toBe(3);
    expect(familyCandidates(state).find((c) => c.founderMareId === 'daughter')!.blackTypeWinners).toBe(3);
  });

  it('모계 조회는 가장 가까운 기초 암말을 돌려주고 수말도 어미 쪽으로만 찾는다', () => {
    const state = fresh();
    mare(state, 'root');
    mare(state, 'daughter', 'root');
    horse(state, 'son', { damId: 'daughter' });
    horse(state, 'paternal', { sireId: 'son' });
    state.legacy = { lines: [], families: ['root', 'daughter'].map((founderMareId) => ({
      founderMareId, establishedYear: START_YEAR + 1, blackTypeWinners: 5, playerBred: false })) };
    expect(familyOf(state, 'son')!.founderMareId).toBe('daughter');
    expect(familyOf(state, 'root')!.founderMareId).toBe('root');
    expect(familyOf(state, 'paternal')).toBeNull();
    expect(familyOf(fresh(), 'unknown')).toBeNull();
  });
});

describe('M5-C 결정성·저장 호환', () => {
  it('순수 조회·주간 실행은 입력·공용 RNG·혈통·니크를 보존하고 저장 왕복 후에도 재현된다', () => {
    const state = lineage();
    mare(state, 'mare');
    for (let i = 0; i < 5; i++) win(state, `winner-${i}`, 'mare');
    const before = structuredClone(state);
    expect(lineCandidates(state)).toEqual(lineCandidates(state));
    expect(familyCandidates(state)).toEqual(familyCandidates(state));
    const result = run(state);
    expect(result).toEqual(run(state));
    expect(state).toEqual(before);
    expect(result.state.rng).toEqual(state.rng);
    expect(result.state.horses).toEqual(state.horses);
    expect(result.state.breeding).toEqual(state.breeding);
    const loaded = deserializeGame(serializeGame(result.state, '2026-10-16T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(result.state);
    expect(run(loaded.state)).toEqual(run(result.state));
    expect(loaded.state.legacy!.lines).toHaveLength(1);
    expect(loaded.state.legacy!.families).toHaveLength(1);
  });

  it('미등록 시 기존 시스템에 영향이 없고 보통 주에는 legacy 상태도 만들지 않는다', () => {
    const state = lineage();
    state.date.week = 20;
    expect(advanceWeek(state, [])).toEqual(advanceWeek(state, [createLegacySystem()]));
    expect(createLegacySystem().id).toBe('legacy');
  });
});
