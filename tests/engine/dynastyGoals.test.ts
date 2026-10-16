import { describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { DYNASTY_GOALS } from '../../src/engine/config/legacy';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import { appendChronicle } from '../../src/engine/legacy/chronicle';
import { dynastyGoals } from '../../src/engine/legacy/goals';
import { createNewGame } from '../../src/engine/state/newGame';
import type { ChronicleEntry, GameState, SeasonAwards } from '../../src/engine/types';

const data = { templates: getRaceTemplates() };
function stateOf(): GameState {
  return createNewGame({ seed: 7, playerName: '구름들 마주', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
}
function add(state: GameState, kind: ChronicleEntry['kind'], year: number, values: Partial<ChronicleEntry> = {}): void {
  appendChronicle(state, { kind, date: { year, week: 20 }, player: true, ...values });
}
function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}
function get(state: GameState, id: string) { return dynastyGoals(state, data).find((g) => g.id === id)!; }
function award(year: number, ownerId: string): SeasonAwards {
  return { year, laurel: { horse_of_the_year: null }, leading: { owner: [{ id: ownerId }], breeder: [{ id: ownerId }] } } as SeasonAwards;
}

describe('왕조 목표 순수 계산', () => {
  it('옛 저장본의 연대기·legacy가 없어도 12개 목표를 config 순서·목표치대로 반환한다', () => {
    const state = stateOf();
    const before = structuredClone(state);
    deepFreeze(state);
    const goals = dynastyGoals(state, data);
    expect(goals).toHaveLength(12);
    expect(goals.map(({ id, target }) => ({ id, target }))).toEqual(DYNASTY_GOALS);
    expect(goals.every((g) => g.progress === 0 && !g.done && g.doneYear === null)).toBe(true);
    expect(state).toEqual(before);
  });

  it('12개 목표의 완료·수치·최초 달성 연도가 기록·시상·legacy와 일치한다', () => {
    const state = stateOf();
    state.date.year = START_YEAR + 30;
    add(state, 'first_win', 2026); add(state, 'first_group_win', 2027);
    for (let i = 0; i < 11; i++) add(state, 'g1_win', 2028 + i, { raceId: `g1-${i}` });
    const types = ['2000_guineas', '1000_guineas', 'derby', 'oaks', 'st_leger'];
    for (const [i, type] of types.entries()) {
      const template = data.templates.find((t) => t.tags.includes('classic') && t.id.endsWith(`_${type}`))!;
      add(state, 'classic_win', 2029 + i, { templateId: template.id });
    }
    add(state, 'laurel_award', 2030, { label: 'horse_of_the_year' });
    state.awardsHistory = [award(2030, state.playerOwnerId)];
    add(state, 'leading_title', 2031, { label: 'europe:1', ownerId: state.playerOwnerId });
    state.legacy = {
      lines: [{ id: 'cloud', founderId: 'founder', parentLineId: 'old', establishedYear: 2032,
        sons: 3, groupWinners: 8, playerBred: true }],
      families: [{ founderMareId: 'mare', establishedYear: 2033, blackTypeWinners: 5, playerBred: true }],
    };
    add(state, 'sire_line_established', 2032); add(state, 'female_family_established', 2033);
    add(state, 'group_win', START_YEAR + 30);
    const before = structuredClone(state);
    deepFreeze(state); deepFreeze(data);
    const goals = dynastyGoals(state, data);
    expect(goals.every((g) => g.done)).toBe(true);
    expect(goals.map((g) => [g.id, g.progress, g.doneYear])).toEqual([
      ['first_win', 1, 2026], ['first_group_win', 1, 2027], ['first_g1_win', 1, 2028],
      ['first_classic_win', 1, 2029], ['five_classics', 5, 2033], ['horse_of_the_year', 1, 2030],
      ['leading_owner', 1, 2031], ['leading_breeder', 1, 2031], ['sire_line_established', 1, 2032],
      ['female_family_established', 1, 2033], ['ten_g1_wins', 11, 2037], ['thirty_year_dynasty', 30, 2056],
    ]);
    expect(dynastyGoals(state, data)).toEqual(goals);
    expect(state).toEqual(before);
    goals[0]!.progress = -1;
    expect(get(state, 'first_win').progress).toBe(1);
  });

  it('클래식 5종은 나라·반복 우승과 관계없이 유형마다 한 번만 센다', () => {
    const state = stateOf();
    for (const t of data.templates.filter((t) => t.tags.includes('classic') && t.id.endsWith('_derby'))) {
      add(state, 'classic_win', 2026, { templateId: t.id });
    }
    add(state, 'classic_win', 2027, { templateId: 'missing_derby' });
    add(state, 'world_classic', 2027, { player: false, templateId: 'ashcombe_oaks' });
    expect(get(state, 'five_classics')).toMatchObject({ progress: 1, done: false, doneYear: null });
    expect(get(state, 'first_classic_win').doneYear).toBe(2026);
  });

  it('AI 계통·모계·세계 우승은 플레이어 목표를 채우지 않는다', () => {
    const state = stateOf();
    state.legacy = {
      lines: [{ id: 'ai', founderId: 'founder', parentLineId: 'old', establishedYear: 2032,
        sons: 3, groupWinners: 8, playerBred: false }],
      families: [{ founderMareId: 'mare', establishedYear: 2033, blackTypeWinners: 5, playerBred: false }],
    };
    add(state, 'g1_win', 2026, { player: false });
    add(state, 'laurel_award', 2026, { player: false, label: 'horse_of_the_year' });
    expect(get(state, 'sire_line_established').progress).toBe(0);
    expect(get(state, 'female_family_established').progress).toBe(0);
    expect(get(state, 'ten_g1_wins').progress).toBe(0);
    expect(get(state, 'horse_of_the_year').progress).toBe(0);
  });

  it('유럽 리딩 1위와 나라 1위·유럽 2위를 혼동하지 않는다', () => {
    const state = stateOf();
    add(state, 'leading_title', 2027, { ownerId: state.playerOwnerId, label: 'GB:1' });
    add(state, 'leading_title', 2027, { ownerId: state.playerOwnerId, label: 'europe:2' });
    expect(get(state, 'leading_owner').progress).toBe(0);
    state.awardsHistory = [award(2028, state.playerOwnerId)];
    state.awardsHistory[0]!.leading.breeder = [];
    add(state, 'leading_title', 2029, { ownerId: state.playerOwnerId, label: 'europe:1' });
    expect(get(state, 'leading_owner')).toMatchObject({ progress: 1, done: true, doneYear: 2029 });
    expect(get(state, 'leading_breeder').progress).toBe(0);
  });

  it('기존 저장본의 시상 이력으로 목표를 복원하되 없는 연대기 달성 연도는 만들어내지 않는다', () => {
    const state = stateOf();
    state.awardsHistory = [award(2027, state.playerOwnerId)];
    expect(get(state, 'leading_owner')).toMatchObject({ done: true, doneYear: null });
    expect(get(state, 'leading_breeder')).toMatchObject({ done: true, doneYear: null });
    state.date.year = START_YEAR + 29;
    expect(get(state, 'thirty_year_dynasty')).toMatchObject({ progress: 29, done: false, doneYear: null });
    state.date.year++;
    expect(get(state, 'thirty_year_dynasty')).toMatchObject({ progress: 30, done: true, doneYear: null });
  });
});
