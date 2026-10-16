import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, it } from 'vitest';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { isRacingHorse, racingHorseIds } from '../../src/engine/world/population';
import type { GameState } from '../../src/engine/types';

/** G1의 음수 마주 증가와 레코드 누적을 분리해 옛 급매 검색·새 검색을 같은 입력으로 비교한다. */
it.skipIf(!process.env.G2_PROFILE_OUT)('M4-G2 급매 탐색·상태 복제 프로파일을 파일에 기록', () => {
  const state = createNewGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
  const template = generateHorse(createRng(3), { id: 'template', name: '가상 말', birthYear: 2020,
    currentYear: 2026, sex: 'male', countryOfBirth: 'GB', status: 'in_training', level: 50 });
  for (let i = 0; i < 304; i++) {
    const id = `owner-${i}`;
    state.owners[id] = { ...structuredClone(state.owners[state.playerOwnerId]!), id, isPlayer: false, horseIds: [] };
  }
  const rows: Record<string, number>[] = [];
  function search(draft: GameState, negative: number, indexed: boolean): string[] {
    const chosen: string[] = [];
    for (let i = 0; i < negative; i++) {
      const seller = draft.owners[`owner-${i}`]!;
      let lowest: string | null = null;
      let value = Infinity;
      const ids = indexed ? seller.horseIds.slice().sort() : racingHorseIds(draft);
      for (const id of ids) {
        const horse = draft.horses[id]!;
        if (horse.ownerId !== seller.id || !isRacingHorse(draft, horse)) continue;
        const current = horse.officialRating ?? 50;
        if (current < value) { lowest = id; value = current; }
      }
      if (lowest !== null) chosen.push(lowest);
    }
    return chosen;
  }
  for (const records of [4_000, 10_000, 17_000]) {
    state.horses = {};
    for (const owner of Object.values(state.owners)) owner.horseIds = [];
    for (let i = 0; i < records; i++) {
      const id = `horse-${String(i).padStart(5, '0')}`;
      const ownerId = `owner-${i % 304}`;
      state.horses[id] = { ...structuredClone(template), id, ownerId,
        status: i < 2500 ? 'in_training' : 'retired', officialRating: 40 + (i % 70) };
      state.owners[ownerId]!.horseIds.push(id);
    }
    for (const negative of [1, 50, 166]) {
      let started = performance.now();
      const old = search(state, negative, false);
      const oldMs = performance.now() - started;
      started = performance.now();
      const indexed = search(state, negative, true);
      const indexedMs = performance.now() - started;
      expect(indexed).toEqual(old);
      started = performance.now();
      structuredClone(state);
      rows.push({ records, negative, oldMs, indexedMs, cloneMs: performance.now() - started });
    }
  }
  const path = process.env.G2_PROFILE_OUT!;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ scenario: '현역 2500두 고정; 전체 기록·음수 마주 수만 변화; 동일 최저가 말 선택 검증', rows }, null, 2)}\n`);
}, 120_000);
