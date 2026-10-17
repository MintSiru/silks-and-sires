import { describe, expect, it } from 'vitest';
import { REPUTATION_BASE, REPUTATION_DECAY_WEEKLY, REPUTATION_FLOOR_MAX } from '../../src/engine/config/economy';
import { regressReputation, reputationFloor } from '../../src/engine/economy/relations';
import { appendChronicle } from '../../src/engine/legacy/chronicle';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import type { ChronicleEntry } from '../../src/engine/types';

function fixture() {
  return createNewGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
}

describe('명성 누적 바닥', () => {
  it.each([
    ['g1_win', undefined, 1], ['classic_win', undefined, 2], ['laurel_award', 'top_miler', 2],
    ['laurel_award', 'horse_of_the_year', 4], ['leading_title', 'europe:1', 3],
    ['sire_line_established', undefined, 4], ['female_family_established', undefined, 3],
    ['leading_title', 'europe:2', 0], ['leading_title', 'GB:1', 0], ['group_win', undefined, 0],
  ] as const)('%s (%s) 플레이어 항목은 +%i, 세계 항목은 제외한다', (kind, label, points) => {
    const state = fixture();
    appendChronicle(state, { kind, label, date: state.date, player: true });
    appendChronicle(state, { kind, label, date: state.date, player: false });
    const before = structuredClone(state);
    expect(reputationFloor(state)).toBe(REPUTATION_BASE + points);
    expect(state).toEqual(before);
  });

  it('업적을 누적하고 바닥을 40으로 제한한다', () => {
    const state = fixture();
    const entries: Omit<ChronicleEntry, 'id'>[] = [
      { kind: 'g1_win', date: state.date, player: true },
      { kind: 'classic_win', date: state.date, player: true },
      { kind: 'laurel_award', label: 'horse_of_the_year', date: state.date, player: true },
    ];
    for (const entry of entries) appendChronicle(state, entry);
    expect(reputationFloor(state)).toBe(17);
    for (let i = 0; i < 40; i++) appendChronicle(state, entries[0]!);
    expect(reputationFloor(state)).toBe(REPUTATION_FLOOR_MAX);
  });

  it('위·아래에서 기존 속도로 회귀하며 새 업적·저장 복원도 반영한다', () => {
    const state = fixture();
    appendChronicle(state, { kind: 'g1_win', date: state.date, player: true });
    state.relations.reputation = 12;
    regressReputation(state);
    expect(state.relations.reputation).toBe(12 - REPUTATION_DECAY_WEEKLY);
    for (let i = 0; i < 100; i++) regressReputation(state);
    expect(state.relations.reputation).toBe(11);
    appendChronicle(state, { kind: 'classic_win', date: state.date, player: true });
    regressReputation(state);
    expect(state.relations.reputation).toBe(11 + REPUTATION_DECAY_WEEKLY);
    const loaded = deserializeGame(serializeGame(state, '2026-01-01T00:00:00Z'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(reputationFloor(loaded.state)).toBe(13);
    expect(loaded.state.rng).toEqual(state.rng);
  });

  it('연대기가 없는 옛 저장본은 기준값 10으로 회귀한다', () => {
    const state = fixture();
    delete state.chronicle;
    state.relations.reputation = 10.01;
    expect(reputationFloor(state)).toBe(REPUTATION_BASE);
    regressReputation(state);
    expect(state.relations.reputation).toBe(REPUTATION_BASE);
  });
});
