import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHRONICLE_WORLD_YEARS, CEREMONY_REPUTATION } from '../../src/engine/config/legacy';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { appendChronicle } from '../../src/engine/legacy/chronicle';
import { createChronicleSystem } from '../../src/engine/legacy/chronicleSystem';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type { ChronicleKind, GameState, Horse, RaceResult, SaleLot, SeasonAwards, Stallion } from '../../src/engine/types';
import { useGame, type GameApi } from '../../src/ui/game/useGame';
import { chronicleKo } from '../../src/ui/game/text';

const options = { seed: 20261016, playerName: '구름들 마주', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const templates = getRaceTemplates();
const classic = templates.find((t) => t.tags.includes('classic') && t.grade === 'G1')!;
const data = { templates };
function stateOf(): GameState { return createNewGame(options); }
function horse(state: GameState, id: string, ownerId = state.playerOwnerId, breederId: string | null = null): Horse {
  return state.horses[id] = { id, ownerId, breederId, record: { groupWins: 2 } } as Horse;
}
function result(state: GameState, ids: string[], raceId = classic.id): RaceResult {
  return { raceId, date: { ...state.date }, runners: ids.map((horseId, i) => ({ horseId, position: i + 1 })) } as RaceResult;
}
function awards(year: number): SeasonAwards {
  const leading = { owner: [], breeder: [], sire: [], damsire: [], jockey: [], trainer: [] };
  return { year, laurel: {}, leading, leadingByCountry: {}, seriesChampions: {} } as unknown as SeasonAwards;
}
function run(state: GameState, input = data): void {
  createChronicleSystem(input).run(state, { date: { ...state.date }, rng: createRng(7) });
}
function title(id: string) { return { id, runners: 1, wins: 1, places: 0, groupWins: 1, earnings: 1 }; }

describe('연대기 주간 기록', () => {
  it('첫 기록·모든 그룹/G1/클래식 승리와 동착을 기록하고 같은 주 재실행은 멱등이다', () => {
    const state = stateOf();
    horse(state, 'first'); horse(state, 'bred', 'ai', state.playerOwnerId); horse(state, 'world', 'ai');
    state.raceResults = [result(state, ['first', 'bred']), result(state, ['bred'], classic.id + '-other')];
    const second = { ...classic, id: classic.id + '-other' };
    run(state, { templates: [...templates, second] });
    const initial = structuredClone(state.chronicle);
    const rng = createRng(5);
    const rngBefore = rng.getState();
    createChronicleSystem({ templates: [...templates, second] }).run(state, { date: state.date, rng });
    expect(rng.getState()).toEqual(rngBefore);
    expect(state.chronicle).toEqual(initial);
    for (const kind of ['first_runner', 'first_win', 'first_group_win'] as const) {
      expect(state.chronicle!.filter((e) => e.kind === kind)).toHaveLength(1);
    }
    expect(state.chronicle!.filter((e) => e.kind === 'group_win').map((e) => e.count)).toEqual([2, 2]);
    expect(state.chronicle!.filter((e) => e.kind === 'g1_win')).toHaveLength(2);
    expect(state.chronicle!.some((e) => e.kind === 'world_classic')).toBe(false);
    state.date.year++;
    state.raceResults = [result(state, ['world'])];
    run(state);
    expect(state.chronicle!.filter((e) => e.kind === 'world_classic')).toHaveLength(1);
    state.date.year++;
    state.raceResults = [result(state, ['first'])];
    run(state);
    expect(state.chronicle!.filter((e) => e.kind === 'classic_win')).toHaveLength(3);
    // 두 1착 말 모두 기록한다.
    state.date.week++;
    const deadHeat = result(state, ['first', 'bred']);
    deadHeat.runners[1]!.position = 1;
    state.raceResults = [deadHeat];
    run(state);
    expect(state.chronicle!.filter((e) => e.kind === 'group_win')).toHaveLength(5);
  });

  it('생산마 첫 승은 첫 마주 승리로 세지 않으며 리스티드 승리는 그룹 승리가 아니다', () => {
    const state = stateOf();
    horse(state, 'bred', 'ai', state.playerOwnerId);
    state.raceResults = [result(state, ['bred'])];
    run(state);
    expect(state.chronicle!.some((e) => e.kind === 'first_win')).toBe(false);
    const listed = templates.find((t) => t.grade === 'L')!;
    horse(state, 'owned');
    state.raceResults = [result(state, ['owned'], listed.id)];
    run(state);
    expect(state.chronicle!.filter((e) => e.kind === 'group_win')).toHaveLength(1);
    expect(state.chronicle!.filter((e) => e.kind === 'first_win')).toHaveLength(1);
  });

  it('플레이어·AI 종마로 편입된 생산마를 한 번씩 기록한다', () => {
    const state = stateOf();
    horse(state, 'own', state.playerOwnerId, state.playerOwnerId);
    horse(state, 'ai', 'ai', state.playerOwnerId);
    horse(state, 'other', 'ai', 'ai');
    for (const id of ['own', 'ai', 'other']) state.stallions[id] = { horseId: id } as Stallion;
    run(state); run(state);
    expect(state.chronicle!.map((e) => e.horseId)).toEqual(['ai', 'own']);
  });

  it('전체 북 마감 뒤 공동 최고가 중 플레이어 구매·판매만 기록한다', () => {
    const state = stateOf();
    const lot = (id: string, price: number, buyerId: string, vendorId: string): SaleLot => ({
      lotNo: Number(id), horseId: id, vendor: { kind: 'owner', id: vendorId }, result: { kind: 'sold', price, buyerId },
    } as SaleLot);
    state.sales.catalogues = [{ saleId: 'cloud-sale', year: state.date.year, status: 'catalogued', lots: [
      lot('1', 200, state.playerOwnerId, 'ai'), lot('2', 200, 'ai', state.playerOwnerId),
      lot('3', 200, 'ai', 'ai'), lot('4', 100, state.playerOwnerId, 'ai'),
    ] }];
    run(state);
    expect(state.chronicle).toBeUndefined();
    state.sales.catalogues[0]!.status = 'closed';
    run(state); state.date.week++; run(state);
    expect(state.chronicle!.map((e) => [e.kind, e.horseId, e.amount])).toEqual([
      ['record_sale', '1', 200], ['record_sale', '2', 200],
    ]);
  });

  it('세계 항목만 보존 연수 밖에서 정리하고 플레이어 기록은 영구 보존한다', () => {
    const state = stateOf();
    appendChronicle(state, { kind: 'first_win', player: true, date: { year: 2026, week: 1 } });
    appendChronicle(state, { kind: 'world_classic', player: false, date: { year: 2026, week: 1 } });
    appendChronicle(state, { kind: 'world_classic', player: false, date: { year: 2027, week: 1 } });
    appendChronicle(state, { kind: 'world_classic', player: false, date: { year: 2027 + CHRONICLE_WORLD_YEARS, week: 1 } });
    expect(state.chronicle!.map((e) => [e.kind, e.date.year])).toEqual([
      ['first_win', 2026], ['world_classic', 2027], ['world_classic', 2057],
    ]);
  });
});

describe('시상식 명성', () => {
  it.each([
    ['horse_of_the_year', 8], ['sprinter', 4], ['series', 3],
    ['europe:1', 6], ['europe:2', 3], ['europe:3', 3], ['GB:1', 3],
  ])('%s 단독 수상과 명성 보상이 정확히 대응한다', (kind, reward) => {
    const state = stateOf(); state.date.year++;
    horse(state, 'bred', 'ai', state.playerOwnerId);
    const award = awards(state.date.year - 1);
    if (kind === 'series') award.seriesChampions.cloud_series = 'bred';
    else if (kind.startsWith('europe:')) {
      const rank = Number(kind.split(':')[1]);
      award.leading.owner = Array.from({ length: rank - 1 }, (_, i) => title(`ai${i}`)).concat(title(state.playerOwnerId));
    } else if (kind === 'GB:1') award.leadingByCountry.GB = { ...award.leading, breeder: [title(state.playerOwnerId)] };
    else award.laurel[kind as 'sprinter'] = 'bred';
    state.awardsHistory = [award];
    const before = state.relations.reputation;
    run(state);
    expect(state.relations.reputation - before).toBe(reward);
    expect(state.chronicle).toHaveLength(1);
    const after = structuredClone(state);
    run(state);
    expect(state).toEqual(after);
  });

  it('모든 수상을 기록하되 한 해 보상은 +15, 명성은 100으로 제한한다', () => {
    const state = stateOf(); state.date.year++;
    horse(state, 'own');
    const award = awards(state.date.year - 1);
    award.laurel.horse_of_the_year = 'own'; award.laurel.older_horse = 'own';
    award.leading.owner = [title(state.playerOwnerId)];
    award.leading.breeder = [title(state.playerOwnerId)];
    award.leading.sire = [title('own')];
    award.leadingByCountry.GB = structuredClone(award.leading);
    award.seriesChampions.cloud_series = 'own';
    state.awardsHistory = [award];
    const before = state.relations.reputation;
    run(state);
    expect(state.relations.reputation - before).toBe(CEREMONY_REPUTATION.annualCap);
    expect(state.chronicle).toHaveLength(9);
    const high = stateOf(); high.date.year++; high.horses = structuredClone(state.horses);
    high.awardsHistory = [award]; high.relations.reputation = 98;
    run(high);
    expect(high.relations.reputation).toBe(100);
  });

  it('AI 수상과 유럽 4위·나라 2위에는 보상과 기록이 없다', () => {
    const state = stateOf(); state.date.year++;
    horse(state, 'ai', 'ai');
    const award = awards(state.date.year - 1);
    award.laurel.horse_of_the_year = 'ai';
    award.leading.owner = ['a', 'b', 'c', state.playerOwnerId].map(title);
    award.leadingByCountry.GB = { ...award.leading, owner: ['a', state.playerOwnerId].map(title) };
    state.awardsHistory = [award];
    const before = state.relations.reputation;
    run(state);
    expect(state.relations.reputation).toBe(before);
    expect(state.chronicle).toBeUndefined();
  });
});

it('2시즌 고정 시드: 레이스·공용 RNG 동일, 전체 클래식·플레이어 그룹 승리 누락 없음 (파일 측정)', () => {
  const staticData = { templates, courses: getRacecourses(), series: getSeriesDefinitions(), nicks: getNicks(),
    naming: getNamingData(), stallionNames: getStallionNames(), stallionRecords: getStallionRecords() };
  let withChronicle = bootstrapGame({ ...options, economyMode: 'casual' }, { ...staticData, ...getPeopleData() });
  // 플레이어도 출주하도록 기존 자동 출주 계획을 활성화한다.
  withChronicle.settings.autoApproveRacePlans = true;
  let without = structuredClone(withChronicle);
  const systems = createGameSystems(staticData);
  const at = systems.findIndex((s) => s.id === 'sales') + 1;
  const registered = [...systems.slice(0, at), createChronicleSystem(staticData), ...systems.slice(at)];
  let classicWinners = 0;
  let playerGroupWins = 0;
  for (let week = 0; week < WEEKS_PER_YEAR * 2 + 1; week++) {
    const date = { ...withChronicle.date };
    const original = week === 0 ? structuredClone(withChronicle) : null;
    const current = advanceWeek(withChronicle, registered);
    const baseline = advanceWeek(without, systems);
    if (original !== null) expect(withChronicle).toEqual(original);
    withChronicle = current.state; without = baseline.state;
    expect(withChronicle.rng).toEqual(without.rng);
    expect(withChronicle.raceResults.filter((r) => r.date.year === date.year && r.date.week === date.week))
      .toEqual(without.raceResults.filter((r) => r.date.year === date.year && r.date.week === date.week));
    for (const r of withChronicle.raceResults.filter((r) => r.date.year === date.year && r.date.week === date.week)) {
      const template = templates.find((t) => t.id === r.raceId);
      for (const winner of r.runners.filter((r) => r.position === 1)) {
        const h = withChronicle.horses[winner.horseId]!;
        const related = h.ownerId === withChronicle.playerOwnerId || h.breederId === withChronicle.playerOwnerId;
        const e = withChronicle.chronicle ?? [];
        if (template?.tags.includes('classic')) {
          classicWinners++;
          expect(e.filter((e) => e.raceId === r.raceId && e.horseId === h.id && e.date.year === date.year
            && e.kind === (related ? 'classic_win' : 'world_classic'))).toHaveLength(1);
        }
        if (related && template?.kind === 'group') playerGroupWins++;
      }
    }
  }
  expect(withChronicle.raceResults).toEqual(without.raceResults);
  const entries = withChronicle.chronicle ?? [];
  const counts = Object.fromEntries([...new Set(entries.map((e) => e.kind))].sort()
    .map((kind) => [kind, entries.filter((e) => e.kind === kind).length])) as Partial<Record<ChronicleKind, number>>;
  // 측정 파일은 요청할 때만 쓴다: WRITE_REPORTS=1 npm test
  if (process.env.WRITE_REPORTS) {
    mkdirSync('docs/reports', { recursive: true });
    writeFileSync('docs/reports/m5-b-chronicle-measurement.json', JSON.stringify({ seed: options.seed, seasons: 2,
      startYear: START_YEAR, weeks: WEEKS_PER_YEAR * 2 + 1, total: entries.length, counts, classicWinners, playerGroupWins,
      sameRaceResults: true, sameSharedRng: true }, null, 2) + '\n');
  }
  expect(counts.first_runner).toBe(1);
  expect(counts.first_win).toBe(1);
  expect(counts.group_win ?? 0).toBe(playerGroupWins);
  expect((counts.world_classic ?? 0) + (counts.classic_win ?? 0)).toBe(classicWinners);
  expect(classicWinners).toBeGreaterThan(0);
}, 600_000);

it('useGame 조회는 복제본을 반환하고 모든 연대기 종류에 한국어 문구가 있다', () => {
  let api!: GameApi;
  function Capture() { api = useGame(); return null; }
  renderToStaticMarkup(createElement(Capture));
  api.newGame({ ...options, economyMode: 'casual', startType: 'owner_breeder', difficulty: 'normal',
    homeCountry: 'GB', catastrophicInjuries: false, grantRacehorses: true });
  api.advance(2);
  const entries = api.chronicle();
  entries.push({ id: 'external', kind: 'first_win', player: true, date: { year: 2026, week: 1 } });
  expect(api.chronicle().some((e) => e.id === 'external')).toBe(false);
  expect(api.dynastyGoals()).toHaveLength(12);
  const kinds: ChronicleKind[] = ['first_runner', 'first_win', 'first_group_win', 'group_win', 'g1_win', 'classic_win',
    'world_classic', 'series_champion', 'laurel_award', 'leading_title', 'sire_line_established', 'female_family_established',
    'homebred_stallion', 'record_sale', 'rival_declared', 'rival_clash'];
  for (const kind of kinds) expect(chronicleKo({ id: kind, kind, date: { year: 2026, week: 1 }, player: true,
    horseId: 'cloud', ownerId: 'cloud-owner', label: 'horse_of_the_year' }, () => '구름말', () => '구름들 마주')).toMatch(/[가-힣]/);
}, 120_000);
