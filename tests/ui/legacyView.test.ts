import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sireLines from '../../data/stallions/sire_lines.json';
import { START_YEAR } from '../../src/engine/config/game';
import {
  CEREMONY_REPUTATION,
  DYNASTY_GOALS,
  FAMILY_GENERATIONS,
  FAMILY_MIN_BLACK_TYPE_WINNERS,
  LINE_MIN_FOUNDER_GROUP_WINNERS,
  LINE_MIN_STUD_SONS,
  LINE_MIN_TOTAL_GROUP_WINNERS,
} from '../../src/engine/config/legacy';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import { appendChronicle } from '../../src/engine/legacy/chronicle';
import { formatDateKo } from '../../src/engine/time/calendar';
import { createNewGame } from '../../src/engine/state/newGame';
import type {
  ChronicleEntry,
  GameState,
  Horse,
  HorseId,
  LaurelCategory,
  LeadingEntry,
  Owner,
  OwnerId,
  Rival,
  SeasonAwards,
} from '../../src/engine/types';
import { chronicleKo, countryKo, laurelCategoryKo } from '../../src/ui/game/text';
import {
  ceremonyView,
  chronicleBodyKo,
  chronicleTagOf,
  chronicleYearGroups,
  establishedLineRows,
  familyConditionText,
  femaleFamilyRows,
  goalCards,
  hallOfFameRows,
  horseChronicleRows,
  horseLegacyBadges,
  lineConditionText,
  rivalRows,
} from '../../src/ui/legacy/legacyView';
import LegacyScreen, { ChronicleList } from '../../src/ui/legacy/LegacyScreen';
import { CeremonyContent } from '../../src/ui/legacy/AwardsCeremony';
import RivalCard from '../../src/ui/legacy/RivalCard';
import { HorseNavigation } from '../../src/ui/horse/HorseLink';

const OPTIONS = {
  seed: 20261016,
  playerName: '구름들 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const },
};
const data = { templates: getRaceTemplates() };

function base(): GameState {
  return createNewGame(OPTIONS);
}

function horse(state: GameState, id: HorseId, name: string, ownerId: OwnerId = state.playerOwnerId): void {
  state.horses[id] = { id, name, ownerId, breederId: null, sireId: null, damId: null } as Horse;
}

function owner(state: GameState, id: OwnerId, name: string, country: Owner['country'] = 'GB'): void {
  state.owners[id] = { ...state.owners[state.playerOwnerId]!, id, name, country, isPlayer: false };
}

function add(state: GameState, entry: Omit<ChronicleEntry, 'id'>): ChronicleEntry {
  return appendChronicle(state, entry);
}

function nameOfFor(state: GameState): (id: HorseId) => string {
  return (id) => state.horses[id]?.name ?? id;
}

function ownerNameFor(state: GameState): (id: OwnerId) => string {
  return (id) => state.owners[id]?.name ?? id;
}

function emptyLaurel(): Record<LaurelCategory, HorseId | null> {
  return {
    horse_of_the_year: null,
    older_horse: null,
    stayer: null,
    sprinter: null,
    two_year_old_colt: null,
    two_year_old_filly: null,
    three_year_old_colt: null,
    three_year_old_filly: null,
  };
}

function awardsOf(
  year: number,
  laurel: Partial<Record<LaurelCategory, HorseId | null>>,
  leading: { owner?: string[]; breeder?: string[]; sire?: string[] },
): SeasonAwards {
  const entries = (ids: string[] = []): LeadingEntry[] =>
    ids.map((id) => ({ id, runners: 1, wins: 1, places: 1, groupWins: 0, earnings: 1000 }));
  return {
    year,
    laurel: { ...emptyLaurel(), ...laurel },
    ledger: [],
    globalRankings: [],
    bestRace: null,
    leading: { sire: entries(leading.sire), damsire: [], jockey: [], trainer: [], owner: entries(leading.owner), breeder: entries(leading.breeder) },
    leadingByCountry: {},
    seriesChampions: {},
  };
}

describe('연대기 연도 묶음', () => {
  it('연도 내림차순, 같은 해는 순번 내림차순, 필터는 내 기록·세계 기록을 가른다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    owner(state, 'rival', '가상 라이벌');
    add(state, { kind: 'first_win', date: { year: 2028, week: 4 }, player: true, horseId: 'h1' });
    add(state, { kind: 'g1_win', date: { year: 2029, week: 10 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'world_classic', date: { year: 2029, week: 20 }, player: false, horseId: 'h1', label: '세계 클래식' });
    add(state, { kind: 'classic_win', date: { year: 2029, week: 22 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'rival_clash', date: { year: 2029, week: 30 }, player: true, ownerId: 'rival', count: 1 });
    const before = structuredClone(state);
    const nameOf = nameOfFor(state);
    const ownerName = ownerNameFor(state);

    const all = chronicleYearGroups(state, 'all', nameOf, ownerName);
    expect(all.map((g) => g.year)).toEqual([2029, 2028]);
    expect(all[0]!.rows.map((r) => r.id)).toEqual(['2029-4', '2029-3', '2029-2', '2029-1']);
    expect(all[1]!.rows.map((r) => r.id)).toEqual(['2028-1']);
    const g1Row = all[0]!.rows.find((r) => r.id === '2029-1')!;
    expect(g1Row.text).toBe('첫말, 가상 더비 G1 우승');
    expect(g1Row.dateLabel).toBe(formatDateKo({ year: 2029, week: 10 }));
    expect(g1Row.horseId).toBe('h1');
    expect(g1Row.player).toBe(true);
    const clashRow = all[0]!.rows.find((r) => r.id === '2029-4')!;
    const clashEntry = state.chronicle!.find((e) => e.id === '2029-4')!;
    expect(clashRow.text).toBe(chronicleKo(clashEntry, nameOf, ownerName));
    expect(clashRow.text).toBe('가상 라이벌와 대레이스 맞대결 · 통산 1회');
    expect(clashRow.horseId).toBeUndefined();

    const mine = chronicleYearGroups(state, 'mine', nameOf, ownerName);
    expect(mine.map((g) => g.rows.map((r) => r.id))).toEqual([['2029-4', '2029-3', '2029-1'], ['2028-1']]);

    const world = chronicleYearGroups(state, 'world', nameOf, ownerName);
    expect(world.map((g) => g.year)).toEqual([2029]);
    expect(world[0]!.rows.map((r) => [r.id, r.player])).toEqual([['2029-2', false]]);

    expect(state).toEqual(before);
  });

  it('기록이 없거나 필터에 맞는 항목이 없으면 빈 배열이다', () => {
    const state = base();
    delete state.chronicle;
    expect(chronicleYearGroups(state, 'all', nameOfFor(state), ownerNameFor(state))).toEqual([]);
    add(state, { kind: 'first_win', date: { year: 2028, week: 4 }, player: true, horseId: state.playerOwnerId });
    expect(chronicleYearGroups(state, 'world', nameOfFor(state), ownerNameFor(state))).toEqual([]);
  });
});

describe('왕조 목표 카드', () => {
  it('12개 카드를 목표 순서대로 만들고 달성 연도와 진행 막대 값을 계산한다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    add(state, { kind: 'first_win', date: { year: 2027, week: 3 }, player: true, horseId: 'h1' });
    for (const year of [2027, 2028, 2029]) {
      add(state, { kind: 'g1_win', date: { year, week: 5 }, player: true, horseId: 'h1', label: '가상 더비' });
    }
    const cards = goalCards(state, data);
    expect(cards.map((c) => c.id)).toEqual(DYNASTY_GOALS.map((g) => g.id));
    expect(new Set(cards.map((c) => c.title)).size).toBe(12);
    for (const card of cards) {
      expect(card.ratio).toBeGreaterThanOrEqual(0);
      expect(card.ratio).toBeLessThanOrEqual(1);
    }
    const card = (id: string) => cards.find((c) => c.id === id)!;

    expect(card('first_win')).toEqual({ id: 'first_win', title: '첫 승리', done: true, doneYear: 2027, progressLabel: '1 / 1', ratio: 1 });
    expect(card('first_g1_win')).toMatchObject({ done: true, doneYear: 2027, progressLabel: '1 / 1', ratio: 1 });
    expect(card('ten_g1_wins')).toEqual({ id: 'ten_g1_wins', title: '통산 G1 10승', done: false, doneYear: null, progressLabel: '3 / 10', ratio: 0.3 });
    expect(card('first_classic_win')).toMatchObject({ done: false, doneYear: null, progressLabel: '0 / 1', ratio: 0 });
    expect(card('first_group_win')).toMatchObject({ done: false, progressLabel: '0 / 1' });
    const dynastyYears = Math.min(Math.max(0, state.date.year - START_YEAR), 30);
    expect(card('thirty_year_dynasty').progressLabel).toBe(`${dynastyYears} / 30`);
  });

  it('연대기가 비어 있으면 모든 목표가 미달성이다', () => {
    const state = base();
    delete state.chronicle;
    const cards = goalCards(state, data);
    expect(cards).toHaveLength(12);
    expect(cards.every((c) => !c.done && c.doneYear === null && c.ratio === 0)).toBe(true);
  });
});

describe('확립 부계·명문 모계', () => {
  it('확립 부계는 최근 확립 순이고 원래 계통·내 생산 여부를 담는다', () => {
    const state = base();
    horse(state, 'sire_a', '시조 에이');
    horse(state, 'sire_b', '시조 비');
    horse(state, 'mare_a', '기초 암말 에이');
    const parent = sireLines[0]!;
    state.legacy = {
      lines: [
        { id: 'line_sire_a', founderId: 'sire_a', parentLineId: parent.id, establishedYear: 2029, sons: 3, groupWinners: 8, playerBred: true },
        { id: 'line_sire_b', founderId: 'sire_b', parentLineId: parent.id, establishedYear: 2031, sons: 4, groupWinners: 9, playerBred: false },
      ],
      families: [{ founderMareId: 'mare_a', establishedYear: 2030, blackTypeWinners: 5, playerBred: true }],
    };
    const rows = establishedLineRows(state);
    expect(rows.map((r) => r.id)).toEqual(['line_sire_b', 'line_sire_a']);
    expect(rows[1]).toEqual({
      id: 'line_sire_a',
      founderName: '시조 에이',
      label: '시조 에이 계통',
      parentLabel: parent.label,
      establishedYear: 2029,
      sons: 3,
      groupWinners: 8,
      playerBred: true,
    });
    expect(rows[0]!.playerBred).toBe(false);
    expect(femaleFamilyRows(state)).toEqual([
      { founderMareId: 'mare_a', name: '기초 암말 에이', establishedYear: 2030, blackTypeWinners: 5, playerBred: true },
    ]);
  });

  it('확립 목록이 없으면 빈 배열이고 조건 안내 문장은 config 값을 쓴다', () => {
    const state = base();
    delete state.legacy;
    expect(establishedLineRows(state)).toEqual([]);
    expect(femaleFamilyRows(state)).toEqual([]);
    const lineText = lineConditionText();
    expect(lineText).toContain(`${LINE_MIN_STUD_SONS}마리`);
    expect(lineText).toContain(`${LINE_MIN_FOUNDER_GROUP_WINNERS}두`);
    expect(lineText).toContain(`${LINE_MIN_TOTAL_GROUP_WINNERS}두`);
    const familyText = familyConditionText();
    expect(familyText).toContain('내 번식 암말의 모계');
    expect(familyText).toContain(`${FAMILY_GENERATIONS}대`);
    expect(familyText).toContain(`${FAMILY_MIN_BLACK_TYPE_WINNERS}두`);
  });
});

describe('명예의 전당', () => {
  it('플레이어의 G1·클래식·Laurel 말만 추리고 승수 순으로 정렬한다', () => {
    const state = base();
    horse(state, 'a', '가상 A');
    horse(state, 'b', '가상 B');
    horse(state, 'c', '가상 C');
    horse(state, 'w', '세계 말', 'rival');
    add(state, { kind: 'classic_win', date: { year: 2029, week: 20 }, player: true, horseId: 'a', label: '가상 더비' });
    add(state, { kind: 'g1_win', date: { year: 2030, week: 10 }, player: true, horseId: 'a', label: '가상 더비' });
    add(state, { kind: 'g1_win', date: { year: 2031, week: 10 }, player: true, horseId: 'a', label: '가상 오크스' });
    add(state, { kind: 'laurel_award', date: { year: 2031, week: 1 }, player: true, horseId: 'a', label: 'stayer' });
    add(state, { kind: 'laurel_award', date: { year: 2030, week: 1 }, player: true, horseId: 'b', label: 'horse_of_the_year' });
    add(state, { kind: 'group_win', date: { year: 2030, week: 5 }, player: true, horseId: 'c', count: 1, label: '가상 그룹 컵' });
    add(state, { kind: 'g1_win', date: { year: 2030, week: 9 }, player: false, horseId: 'w', label: '가상 세계 대레이스' });
    const rows = hallOfFameRows(state, nameOfFor(state));
    expect(rows.map((r) => r.horseId)).toEqual(['a', 'b']);
    expect(rows[0]).toEqual({
      horseId: 'a',
      name: '가상 A',
      g1Wins: 2,
      classicWins: 1,
      awards: [`${laurelCategoryKo('stayer')} (2031)`],
      firstYear: 2029,
    });
    expect(rows[1]).toEqual({
      horseId: 'b',
      name: '가상 B',
      g1Wins: 0,
      classicWins: 0,
      awards: [`${laurelCategoryKo('horse_of_the_year')} (2030)`],
      firstYear: 2030,
    });
  });

  it('연대기가 없으면 빈 배열이다', () => {
    const state = base();
    delete state.chronicle;
    expect(hallOfFameRows(state, nameOfFor(state))).toEqual([]);
  });
});

describe('라이벌 행', () => {
  it('활성 라이벌을 먼저 두고 전적·경쟁심 비율·최근 맞대결 문구를 만든다', () => {
    const state = base();
    owner(state, 'rival_a', '가상 라이벌 A', 'FR');
    owner(state, 'rival_b', '가상 라이벌 B', 'IE');
    state.rivals = [
      { ownerId: 'rival_b', since: 2028, reason: 'sale_battle', playerAhead: 0, rivalAhead: 1, intensity: 0, active: false },
      { ownerId: 'rival_a', since: 2030, reason: 'big_race', playerAhead: 3, rivalAhead: 2, intensity: 60, active: true },
    ] satisfies Rival[];
    add(state, { kind: 'rival_clash', date: { year: 2030, week: 10 }, player: true, ownerId: 'rival_a', count: 1 });
    add(state, { kind: 'rival_clash', date: { year: 2031, week: 12 }, player: true, ownerId: 'rival_a', count: 2 });

    const rows = rivalRows(state);
    expect(rows.map((r) => r.ownerId)).toEqual(['rival_a', 'rival_b']);
    expect(rows[0]).toEqual({
      ownerId: 'rival_a',
      name: '가상 라이벌 A',
      countryLabel: countryKo('FR'),
      reasonLabel: '대레이스에서 내 말을 꺾음',
      since: 2030,
      active: true,
      intensity: 60,
      intensityRatio: 0.6,
      record: '3승 2패',
      recentClash: '가상 라이벌 A와 대레이스 맞대결 · 통산 2회',
    });
    expect(rows[1]).toEqual({
      ownerId: 'rival_b',
      name: '가상 라이벌 B',
      countryLabel: countryKo('IE'),
      reasonLabel: '세일에서 내 입찰을 꺾음',
      since: 2028,
      active: false,
      intensity: 0,
      intensityRatio: 0,
      record: '0승 1패',
      recentClash: null,
    });
  });

  it('라이벌이 없으면 빈 배열이다', () => {
    const state = base();
    delete state.rivals;
    expect(rivalRows(state)).toEqual([]);
  });
});

describe('연말 시상식 창 데이터', () => {
  function ceremonyState(): GameState {
    const state = base();
    horse(state, 'mine', '내 말 이름');
    horse(state, 'other', '남의 말 이름', 'rival_a');
    horse(state, 'sire_x', '종마 엑스', 'rival_a');
    owner(state, 'rival_a', '라이벌 A');
    state.awardsHistory = [
      awardsOf(
        2030,
        { horse_of_the_year: 'mine', older_horse: 'other' },
        { owner: [state.playerOwnerId, 'rival_a', 'x', 'extra'], breeder: ['rival_a', state.playerOwnerId], sire: ['sire_x', 'mine', 'other'] },
      ),
    ];
    // 시상 항목은 시상이 확정된 다음 해 첫 주(2031, 1주)에 기록된다
    add(state, { kind: 'laurel_award', date: { year: 2031, week: 1 }, player: true, horseId: 'mine', label: 'horse_of_the_year' });
    add(state, { kind: 'leading_title', date: { year: 2031, week: 1 }, player: true, ownerId: state.playerOwnerId, label: 'europe:1' });
    add(state, { kind: 'series_champion', date: { year: 2031, week: 1 }, player: true, horseId: 'mine', label: 'gb_triple_crown' });
    // 2030 시즌 연대기 하이라이트 후보
    add(state, { kind: 'first_win', date: { year: 2030, week: 1 }, player: true, horseId: 'mine' });
    add(state, { kind: 'group_win', date: { year: 2030, week: 3 }, player: true, horseId: 'mine', count: 1, label: '가상 그룹 컵' });
    add(state, { kind: 'classic_win', date: { year: 2030, week: 20 }, player: true, horseId: 'mine', label: '가상 더비' });
    add(state, { kind: 'g1_win', date: { year: 2030, week: 30 }, player: true, horseId: 'mine', label: '가상 더비' });
    add(state, { kind: 'record_sale', date: { year: 2030, week: 8 }, player: true, horseId: 'mine', label: '가상 세일', amount: 300000 });
    return state;
  }

  it('부문별 수상마(내 말 표시), 리딩 상위 3, 하이라이트 3줄, 명성 합계를 계산한다', () => {
    const state = ceremonyState();
    const nameOf = nameOfFor(state);
    const view = ceremonyView(state, 2030, nameOf)!;
    const playerName = state.owners[state.playerOwnerId]!.name;
    expect(view.year).toBe(2030);

    expect(view.laurel).toHaveLength(8);
    expect(view.laurel[0]).toEqual({
      category: 'horse_of_the_year',
      label: laurelCategoryKo('horse_of_the_year'),
      horseId: 'mine',
      horseName: '내 말 이름',
      mine: true,
    });
    expect(view.laurel[1]).toEqual({
      category: 'older_horse',
      label: laurelCategoryKo('older_horse'),
      horseId: 'other',
      horseName: '남의 말 이름',
      mine: false,
    });
    expect(view.laurel[2]).toEqual({ category: 'stayer', label: laurelCategoryKo('stayer'), horseId: null, horseName: null, mine: false });

    expect(view.leading.map((s) => s.category)).toEqual(['owner', 'breeder', 'sire']);
    const [ownerSection, breederSection, sireSection] = view.leading;
    expect(ownerSection!.rows).toHaveLength(3);
    expect(ownerSection!.rows).toEqual([
      { rank: 1, id: state.playerOwnerId, name: playerName, mine: true },
      { rank: 2, id: 'rival_a', name: '라이벌 A', mine: false },
      { rank: 3, id: 'x', name: 'x', mine: false },
    ]);
    expect(breederSection!.rows[0]).toEqual({ rank: 1, id: 'rival_a', name: '라이벌 A', mine: false });
    expect(breederSection!.rows[1]).toEqual({ rank: 2, id: state.playerOwnerId, name: playerName, mine: true });
    expect(sireSection!.rows).toEqual([
      { rank: 1, id: 'sire_x', name: '종마 엑스', mine: false },
      { rank: 2, id: 'mine', name: '내 말 이름', mine: true },
      { rank: 3, id: 'other', name: '남의 말 이름', mine: false },
    ]);

    // 하이라이트: 우선순위 상위 3(G1·클래식·그룹)을 날짜순으로
    const chronicle = state.chronicle!;
    const pick = (kind: string, week: number) => chronicle.find((e) => e.kind === kind && e.date.year === 2030 && e.date.week === week)!;
    expect(view.highlights).toEqual([
      chronicleKo(pick('group_win', 3), nameOf, ownerNameFor(state)),
      chronicleKo(pick('classic_win', 20), nameOf, ownerNameFor(state)),
      '내 말 이름, 가상 더비 G1 우승',
    ]);

    // 보상 = 연도 상한 전: 시상 명성 8(HOY) + 리딩 1위 6 + 시리즈 3 = 17 → 연간 상한 15
    expect(view.reputation).toBe(Math.min(
      CEREMONY_REPUTATION.horseOfTheYear + CEREMONY_REPUTATION.europeFirst + CEREMONY_REPUTATION.series,
      CEREMONY_REPUTATION.annualCap,
    ));
    expect(view.reputation).toBe(15);
    expect(view.honors).toEqual(state.chronicle!
      .filter((entry) => entry.date.year === 2031)
      .map((entry) => chronicleKo(entry, nameOf, ownerNameFor(state))));
    const html = renderToStaticMarkup(createElement(HorseNavigation.Provider,
      { value: { state, openHorse: () => {} } }, createElement(CeremonyContent, { view })));
    expect(html).toContain('명성 보상 합계 +15');
    expect(html).toContain('ceremony-mine');
    expect(html).toContain('내 말 이름');
    expect(html).toContain('라이벌 A');
    expect(html).toContain('내 수상 내역');
  });

  it('상한 안에서는 명성 보상을 그대로 합산하고, 시상이 없는 해는 null 이다', () => {
    const state = base();
    horse(state, 'mine', '내 말 이름');
    state.awardsHistory = [awardsOf(2030, { horse_of_the_year: 'mine' }, {})];
    add(state, { kind: 'laurel_award', date: { year: 2031, week: 1 }, player: true, horseId: 'mine', label: 'horse_of_the_year' });
    expect(ceremonyView(state, 2030, nameOfFor(state))!.reputation).toBe(CEREMONY_REPUTATION.horseOfTheYear);
    expect(ceremonyView(state, 2029, nameOfFor(state))).toBeNull();
  });

  it('시즌 기록과 시상 기록이 없으면 하이라이트는 빈 배열, 명성 보상은 0이다', () => {
    const state = base();
    delete state.chronicle;
    state.awardsHistory = [awardsOf(2030, {}, {})];
    const view = ceremonyView(state, 2030, nameOfFor(state))!;
    expect(view.highlights).toEqual([]);
    expect(view.honors).toEqual([]);
    expect(view.reputation).toBe(0);
    expect(view.laurel.every((row) => row.horseId === null && !row.mine)).toBe(true);
  });
});

describe('M5-E2 말 상세와 기록 화면 연결', () => {
  it('소유권과 무관하게 해당 말의 영구 연대기만 최신순으로 표시한다', () => {
    const state = base();
    horse(state, 'sold', '먼들', 'other');
    add(state, { kind: 'first_win', date: { year: 2028, week: 4 }, player: true, horseId: 'sold' });
    add(state, { kind: 'first_win', date: { year: 2029, week: 4 }, player: true, horseId: 'different' });
    add(state, { kind: 'world_classic', date: { year: 2029, week: 20 }, player: false, horseId: 'sold', label: '구름들 Derby' });
    const before = structuredClone(state);
    const rows = horseChronicleRows(state, 'sold', nameOfFor(state));
    expect(rows.map((row) => row.id)).toEqual(['2029-2', '2028-1']);
    expect(rows.every((row) => row.horseId === 'sold')).toBe(true);
    expect(rows[0]!.text).toContain('먼들');
    expect(horseChronicleRows(state, 'missing', nameOfFor(state))).toEqual([]);
    expect(state).toEqual(before);
  });

  it('확립 부계·모계 칭호를 자손 혈통 배지로 표시하고 옛 저장본은 빈 배지다', () => {
    const state = base();
    horse(state, 'sire', '구름들');
    horse(state, 'dam', '푸른들');
    horse(state, 'child', '새들');
    state.horses.child!.sireId = 'sire';
    state.horses.child!.damId = 'dam';
    state.legacy = {
      lines: [{ id: 'line_sire', founderId: 'sire', parentLineId: 'original', establishedYear: 2030, sons: 3, groupWinners: 8, playerBred: true }],
      families: [{ founderMareId: 'dam', establishedYear: 2029, blackTypeWinners: 5, playerBred: true }],
    };
    const before = structuredClone(state);
    expect(horseLegacyBadges(state, 'child')).toEqual(['확립 부계 · 구름들 계통 · 2030년', '명문 모계 · 푸른들 · 2029년']);
    expect(horseLegacyBadges(state, 'sire')).toEqual(['확립 부계 · 구름들 계통 · 2030년']);
    expect(horseLegacyBadges(state, 'missing')).toEqual([]);
    expect(state).toEqual(before);
    delete state.legacy;
    expect(horseLegacyBadges(state, 'child')).toEqual([]);
  });

  it('기록 메뉴의 연대기와 12개 목표·부계·모계·명예의 전당·라이벌을 렌더링한다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    owner(state, 'rival', '구름들 라이벌');
    add(state, { kind: 'g1_win', date: { year: 2030, week: 4 }, player: true, horseId: 'h1', label: '구름들 컵' });
    state.rivals = [{ ownerId: 'rival', since: 2030, reason: 'big_race', active: true, intensity: 40, playerAhead: 2, rivalAhead: 1 }];
    const renderTab = (initialTab: 'chronicle' | 'goals' | 'lines' | 'hall' | 'rivals') => renderToStaticMarkup(createElement(
      HorseNavigation.Provider, { value: { state, openHorse: () => {} } }, createElement(LegacyScreen, { state, initialTab }),
    ));
    expect(renderTab('chronicle')).toContain('>첫말, 구름들 컵<');
    expect(renderTab('chronicle')).toContain('G1 우승</span>');
    expect(renderTab('chronicle')).toContain('horse-link');
    expect(renderTab('goals').match(/<h3>/g)).toHaveLength(12);
    expect(renderTab('lines')).toContain(lineConditionText());
    expect(renderTab('lines')).toContain(familyConditionText());
    expect(renderTab('hall')).toContain('첫말');
    expect(renderTab('rivals')).toContain('2승 1패');
    expect(renderTab('rivals')).toContain('승부복 앞모습');
    expect(renderTab('rivals')).toContain('지난 라이벌');
  });

  it('연대기 항목의 종류 태그를 같은 화면 목록 HTML 에 담는다(M6-U3)', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    add(state, { kind: 'g1_win', date: { year: 2030, week: 4 }, player: true, horseId: 'h1', label: '구름들 컵' });
    const html = renderToStaticMarkup(createElement(LegacyScreen, { state, initialTab: 'chronicle' }));
    expect(html).toContain('legacy-tag legacy-tag--major');
    expect(html).toContain('>G1 우승<');
  });

  it('홈 카드는 활성 라이벌만 최대 두 명 표시한다', () => {
    const state = base();
    for (const id of ['a', 'b', 'old']) owner(state, id, `구름들 ${id}`);
    state.rivals = ['a', 'b', 'old'].map((id) => ({ ownerId: id, since: 2030, reason: 'same_tier', active: id !== 'old', intensity: 30, playerAhead: 1, rivalAhead: 2 }));
    const html = renderToStaticMarkup(createElement(RivalCard, { state, onOpen: () => {} }));
    expect(html).toContain('구름들 a');
    expect(html).toContain('구름들 b');
    expect(html).not.toContain('구름들 old');
    expect(html).toContain('아직 맞대결이 없습니다.');
  });
});

describe('M6-U3 기록 화면: 정렬·종류 태그·주요 순간·탭 문구', () => {
  it('같은 해 안은 주 내림차순이고, 같은 주는 순번 내림차순이다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    add(state, { kind: 'g1_win', date: { year: 2029, week: 30 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'first_win', date: { year: 2029, week: 5 }, player: true, horseId: 'h1' });
    add(state, { kind: 'first_runner', date: { year: 2029, week: 12 }, player: true, horseId: 'h1' });
    add(state, { kind: 'first_runner', date: { year: 2029, week: 12 }, player: true, horseId: 'h1' });
    const groups = chronicleYearGroups(state, 'all', nameOfFor(state), ownerNameFor(state));
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(['2029-1', '2029-4', '2029-3', '2029-2']);
  });

  it('모든 연대기 종류에 짧은 태그 라벨과 톤을 준다', () => {
    const kinds: ChronicleEntry['kind'][] = [
      'first_runner', 'first_win', 'first_group_win', 'group_win', 'g1_win', 'classic_win', 'series_champion',
      'laurel_award', 'leading_title', 'sire_line_established', 'female_family_established', 'homebred_stallion',
      'record_sale', 'rival_declared', 'rival_clash', 'world_classic',
    ];
    for (const kind of kinds) {
      const tag = chronicleTagOf(kind);
      expect(tag.label.length).toBeGreaterThan(0);
      expect(tag.label.length).toBeLessThanOrEqual(8);
      expect(['major', 'group', 'debut', 'family', 'rival', 'plain']).toContain(tag.tone);
    }
    expect(chronicleTagOf('g1_win')).toEqual({ label: 'G1 우승', tone: 'major' });
    expect(chronicleTagOf('first_win')).toEqual({ label: '첫 승', tone: 'debut' });
    expect(chronicleTagOf('sire_line_established')).toEqual({ label: '부계', tone: 'family' });
    expect(chronicleTagOf('rival_clash').tone).toBe('rival');
  });

  it('연도 묶음은 주요 순간 최대 5건(등급 높은 종류 우선)을 최신순으로 보이고 전체 행도 가진다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    for (let week = 1; week <= 5; week++) {
      add(state, { kind: 'first_runner', date: { year: 2029, week }, player: true, horseId: 'h1' });
    }
    add(state, { kind: 'g1_win', date: { year: 2029, week: 6 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'world_classic', date: { year: 2029, week: 7 }, player: false, horseId: 'h1', label: '세계 클래식' });
    const [group] = chronicleYearGroups(state, 'all', nameOfFor(state), ownerNameFor(state));
    expect(group!.rows).toHaveLength(7);
    // G1(6주) 먼저, 나머지 4자리는 첫 출주 중 가장 최신 4건(5·4·3·2주). 세계 클래식은 밀려난다.
    expect(group!.majorRows.map((r) => r.id)).toEqual(['2029-6', '2029-5', '2029-4', '2029-3', '2029-2']);
    expect(group!.rows.map((r) => r.id)).toEqual(['2029-7', '2029-6', '2029-5', '2029-4', '2029-3', '2029-2', '2029-1']);
  });

  it('출처 배지는 전체 범위에서만 보이고, 단일 범위 목록에서는 숨긴다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    add(state, { kind: 'g1_win', date: { year: 2029, week: 6 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'world_classic', date: { year: 2029, week: 7 }, player: false, horseId: 'h1', label: '세계 클래식' });
    const all = chronicleYearGroups(state, 'all', nameOfFor(state), ownerNameFor(state));
    const withSource = renderToStaticMarkup(createElement(ChronicleList, { rows: all[0]!.rows }));
    expect(withSource).toContain('hint legacy-source">내 기록<');
    expect(withSource).toContain('hint legacy-source">세계<');
    const mine = chronicleYearGroups(state, 'mine', nameOfFor(state), ownerNameFor(state));
    const noSource = renderToStaticMarkup(createElement(ChronicleList, { rows: mine[0]!.rows, showSource: false }));
    expect(noSource).not.toContain('legacy-source');
    expect(noSource).toContain('legacy-tag legacy-tag--major');
  });

  it('본문은 종류 태그와 겹치는 단어를 뺀다(M6-V 20항): 태그 단어는 화면에 한 번만 보인다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    owner(state, 'rival', '가상 마주');
    add(state, { kind: 'first_runner', date: { year: 2029, week: 1 }, player: true, horseId: 'h1' });
    add(state, { kind: 'first_win', date: { year: 2029, week: 2 }, player: true, horseId: 'h1' });
    add(state, { kind: 'first_group_win', date: { year: 2029, week: 3 }, player: true, horseId: 'h1' });
    add(state, { kind: 'g1_win', date: { year: 2029, week: 4 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'classic_win', date: { year: 2029, week: 5 }, player: true, horseId: 'h1', label: '가상 더비' });
    add(state, { kind: 'laurel_award', date: { year: 2029, week: 6 }, player: true, horseId: 'h1', label: 'horse_of_the_year' });
    add(state, { kind: 'sire_line_established', date: { year: 2029, week: 7 }, player: true, horseId: 'h1' });
    add(state, { kind: 'female_family_established', date: { year: 2029, week: 8 }, player: true, horseId: 'h1' });
    add(state, { kind: 'homebred_stallion', date: { year: 2029, week: 9 }, player: true, horseId: 'h1' });
    add(state, { kind: 'rival_declared', date: { year: 2029, week: 10 }, player: true, ownerId: 'rival' });
    add(state, { kind: 'record_sale', date: { year: 2029, week: 11 }, player: true, horseId: 'h1', label: '가상 세일', amount: 10_000 });
    const rows = chronicleYearGroups(state, 'all', nameOfFor(state), ownerNameFor(state))[0]!.rows;
    const bodyOf = (kind: ChronicleEntry['kind']) => rows.find((r) => r.kind === kind)!.body;
    expect(bodyOf('first_runner')).toBe('첫말');
    expect(bodyOf('first_win')).toBe('첫말');
    expect(bodyOf('first_group_win')).toBe('첫말, 우승');
    expect(bodyOf('g1_win')).toBe('첫말, 가상 더비');
    expect(bodyOf('classic_win')).toBe('첫말, 가상 더비 우승');
    expect(bodyOf('laurel_award')).toBe('첫말, 올해의 말 수상');
    expect(bodyOf('sire_line_established')).toBe('첫말, 계통 확립');
    expect(bodyOf('female_family_established')).toBe('첫말, 명문 가문 인정');
    expect(bodyOf('homebred_stallion')).toBe('첫말, 생산마 전환');
    expect(bodyOf('rival_declared')).toContain('새로 지정');
    expect(bodyOf('record_sale')).toContain('낙찰');
    expect(rows.find((r) => r.kind === 'g1_win')!.text).toBe('첫말, 가상 더비 G1 우승');
    expect(chronicleBodyKo('world_classic', '가상 더비 우승마 첫말')).toBe('가상 더비 우승마 첫말');
    const html = renderToStaticMarkup(createElement(ChronicleList, { rows: rows.filter((r) => r.kind === 'first_runner') }));
    expect(html.split('첫 출주').length - 1).toBe(1);
    const g1Html = renderToStaticMarkup(createElement(ChronicleList, { rows: rows.filter((r) => r.kind === 'g1_win') }));
    expect(g1Html).toContain('>첫말, 가상 더비<');
    expect(g1Html.split('G1 우승').length - 1).toBe(1);
  });

  it('모든 종류의 본문에는 그 종류 배지 문구가 다시 나오지 않는다(M6-W 16번)', () => {
    const state = base();
    horse(state, 'h1', '가온');
    owner(state, 'rival', '가상 마주');
    const samples: Omit<ChronicleEntry, 'id'>[] = [
      { kind: 'first_runner', date: { year: 2029, week: 1 }, player: true, horseId: 'h1' },
      { kind: 'first_win', date: { year: 2029, week: 2 }, player: true, horseId: 'h1' },
      { kind: 'first_group_win', date: { year: 2029, week: 3 }, player: true, horseId: 'h1' },
      { kind: 'group_win', date: { year: 2029, week: 4 }, player: true, horseId: 'h1', label: '가상 더비', count: 2 },
      { kind: 'g1_win', date: { year: 2029, week: 5 }, player: true, horseId: 'h1', label: '가상 더비' },
      { kind: 'classic_win', date: { year: 2029, week: 6 }, player: true, horseId: 'h1', label: '가상 더비' },
      { kind: 'series_champion', date: { year: 2029, week: 7 }, player: true, horseId: 'h1', label: 'european_stayers_series' },
      { kind: 'series_champion', date: { year: 2029, week: 8 }, player: true, horseId: 'h1', label: 'european_sprint_series' },
      { kind: 'laurel_award', date: { year: 2029, week: 9 }, player: true, horseId: 'h1', label: 'horse_of_the_year' },
      { kind: 'leading_title', date: { year: 2029, week: 10 }, player: true, horseId: 'h1', label: 'europe:1' },
      { kind: 'sire_line_established', date: { year: 2029, week: 11 }, player: true, horseId: 'h1' },
      { kind: 'female_family_established', date: { year: 2029, week: 12 }, player: true, horseId: 'h1' },
      { kind: 'homebred_stallion', date: { year: 2029, week: 13 }, player: true, horseId: 'h1' },
      { kind: 'record_sale', date: { year: 2029, week: 14 }, player: true, horseId: 'h1', label: '가상 세일', amount: 10_000 },
      { kind: 'rival_declared', date: { year: 2029, week: 15 }, player: true, ownerId: 'rival' },
      { kind: 'rival_clash', date: { year: 2029, week: 16 }, player: true, ownerId: 'rival', count: 2 },
      { kind: 'world_classic', date: { year: 2029, week: 17 }, player: false, horseId: 'h1', label: '가상 더비' },
    ];
    for (const entry of samples) add(state, entry);
    const rows = chronicleYearGroups(state, 'all', nameOfFor(state), ownerNameFor(state))[0]!.rows;
    expect(rows).toHaveLength(samples.length);
    for (const row of rows) {
      expect(row.body.length).toBeGreaterThan(0);
      expect(row.body).not.toContain(row.tag.label);
    }
    const seriesBodies = rows.filter((r) => r.kind === 'series_champion').map((r) => r.body);
    expect(seriesBodies.every((body) => !body.includes('시리즈'))).toBe(true);
    expect(rows.find((r) => r.kind === 'leading_title')!.body).toBe('가온, 유럽 1위');
  });

  it('탭마다 목적 한 줄을 보이고, 빈 상태 안내와 최신순 표시를 준다', () => {
    const state = base();
    delete state.chronicle;
    const renderTab = (initialTab: 'chronicle' | 'goals' | 'lines' | 'hall' | 'rivals') => renderToStaticMarkup(createElement(
      HorseNavigation.Provider, { value: { state, openHorse: () => {} } }, createElement(LegacyScreen, { state, initialTab }),
    ));
    const chronicle = renderTab('chronicle');
    expect(chronicle).toContain('가문의 주요 순간을 연도별로 모아 봅니다.');
    expect(chronicle).toContain('최신순');
    expect(chronicle).toContain('아직 내 기록이 없습니다.');
    expect(renderTab('goals')).toContain('12개 왕조 목표의 달성 여부와 진행률을 봅니다.');
    expect(renderTab('goals')).toContain('아직 달성한 목표가 없습니다.');
    expect(renderTab('lines')).toContain('이어지는 혈통과 후계마를 봅니다.');
    expect(renderTab('hall')).toContain('내 소유·생산마의 G1 우승과 Laurel 수상을 모은 곳입니다.');
    expect(renderTab('rivals')).toContain('나와 맞붙는 마주와 맞대결 기록을 봅니다.');
  });

  it('전체 펼치기 버튼은 주요 순간 5건을 넘는 해에만 보인다', () => {
    const state = base();
    horse(state, 'h1', '첫말');
    const render = () => renderToStaticMarkup(createElement(LegacyScreen, { state, initialTab: 'chronicle' }));
    for (let week = 1; week <= 5; week++) {
      add(state, { kind: 'first_runner', date: { year: 2029, week }, player: true, horseId: 'h1' });
    }
    expect(render()).not.toContain('전체 5건 보기');
    add(state, { kind: 'first_win', date: { year: 2029, week: 6 }, player: true, horseId: 'h1' });
    expect(render()).toContain('전체 6건 보기');
    // 펼치기 전에는 머리줄의 '주요 5건만 보기' 버튼이 없다(펼친 뒤에만 나온다)
    expect(render()).not.toContain('주요 5건만 보기');
    expect(render()).not.toContain('legacy-collapse');
  });
});
