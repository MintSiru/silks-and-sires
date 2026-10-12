import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '../../src/engine/config/horse';
import {
  MIN_SIRE_AGE_AT_COVER,
  PLAYER_START_MARES,
  SIRE_BIRTH_MARGIN_YEARS,
} from '../../src/engine/config/world';
import { buildPedigree } from '../../src/engine/breeding/pedigree';
import { initialRevealedNicks } from '../../src/engine/breeding/nicks';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { createRealStallionHorses } from '../../src/engine/state/stallionHorses';
import { allocateHorseId, bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import type { GameState, Horse, HorseId, PedigreeNode, RealStallionRecord } from '../../src/engine/types';

const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;
const START_SEED = 20260101;
const SEED_SWEEP = Array.from({ length: 10 }, (_, i) => START_SEED + i);

function staticData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
  };
}

function newGame(seed = START_SEED): GameState {
  return createNewGame({ seed, playerName: 'Test Owner', silks: SILKS });
}

function boot(seed = START_SEED): GameState {
  return bootstrapWorld(newGame(seed), staticData(), createRng(seed));
}

function lookup(state: GameState) {
  return (id: HorseId) => state.horses[id];
}

/** 부(父) 사슬 한 줄을 대 단위로 센다 (generation 2~5 에 있는 실존 노드 수, 부측만) */
function sireSideRealCount(state: GameState, mareId: HorseId): number {
  const root = buildPedigree(lookup(state), mareId, 5);
  // 부측 서브트리(root.sire)에서 generation 2~5 의 실존 노드 수
  let total = 0;
  const walk = (node: PedigreeNode | null): void => {
    if (node === null) return;
    if (node.generation >= 2 && node.generation <= 5 && node.horseId !== null) {
      total += 1;
    }
    walk(node.sire);
    walk(node.dam);
  };
  walk(root.sire);
  return total;
}

describe('createRealStallionHorses', () => {
  const records = getStallionRecords();
  const names = getStallionNames();
  const { horses, stallions } = createRealStallionHorses(createRng(START_SEED), records, names, 2026);

  it('종마 Horse 수는 데이터 종마 수와 같다', () => {
    expect(horses.length).toBe(records.length);
  });

  it('Stallion 수는 active 종마 수와 같다', () => {
    const activeCount = records.filter((r) => r.status === 'active').length;
    expect(stallions.length).toBe(activeCount);
  });

  it('모든 이름은 NAME_MAX_LENGTH 이하이고 중복이 없다', () => {
    for (const h of horses) {
      expect(h.name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    }
    const unique = new Set(horses.map((h) => h.name));
    expect(unique.size).toBe(horses.length);
  });

  it('sire 사슬 id 는 전부 horses 안에 존재한다', () => {
    const ids = new Set(horses.map((h) => h.id));
    for (const h of horses) {
      if (h.sireId !== null) {
        expect(ids.has(h.sireId), `${h.id} 의 부 ${h.sireId}`).toBe(true);
      }
    }
  });

  it('상태 매핑: active→stud, pensioned→retired, historical→historical', () => {
    const byId = new Map(horses.map((h) => [h.id, h] as const));
    for (const rec of records) {
      const horse = byId.get(rec.key);
      expect(horse).toBeDefined();
      const expected = rec.status === 'active' ? 'stud' : rec.status === 'pensioned' ? 'retired' : 'historical';
      expect(horse?.status).toBe(expected);
      expect(horse?.sex).toBe('male');
    }
  });

  it('같은 시드 → 같은 결과', () => {
    const again = createRealStallionHorses(createRng(START_SEED), records, names, 2026);
    expect(JSON.stringify(again)).toBe(JSON.stringify({ horses, stallions }));
  });

  it('이름이 없는 종마가 있으면 Error', () => {
    const missingKey = records[0]?.key ?? '';
    const partial = { ...names };
    delete partial[missingKey];
    expect(() => createRealStallionHorses(createRng(1), records, partial, 2026)).toThrow(Error);
  });
});

describe('bootstrapWorld', () => {
  it('이미 초기화된 세계에 다시 호출하면 Error', () => {
    const once = boot(START_SEED);
    expect(() => bootstrapWorld(once, staticData(), createRng(START_SEED))).toThrow();
  });

  it('같은 시드 → JSON 동일 상태', () => {
    expect(JSON.stringify(boot(START_SEED))).toBe(JSON.stringify(boot(START_SEED)));
  });

  it('원본 state 는 바뀌지 않는다', () => {
    const original = newGame(START_SEED);
    const snapshot = structuredClone(original);
    bootstrapWorld(original, staticData(), createRng(START_SEED));
    expect(original).toEqual(snapshot);
  });

  it('플레이어 암말 3두: broodmare, 소유주 = 플레이어, Mare 레코드 존재', () => {
    const state = boot();
    const player = state.playerOwnerId;
    const owner = state.owners[player];
    expect(owner).toBeDefined();
    expect(owner?.horseIds.length).toBe(PLAYER_START_MARES);

    for (const mareId of owner?.horseIds ?? []) {
      const mare = state.horses[mareId];
      expect(mare?.status).toBe('broodmare');
      expect(mare?.ownerId).toBe(player);
      expect(mare?.breederId).toBe(player);
      expect(mare?.sex).toBe('female');
      expect(state.mares[mareId]).toEqual({
        horseId: mareId,
        coveredBy: null,
        coveredWeek: null,
        pregnant: false,
        dueWeek: null,
        foals: [],
        blackTypeProduce: 0,
      });
    }
    expect(Object.keys(state.mares).length).toBe(PLAYER_START_MARES);
  });

  it('각 암말의 부·어미·어미의 부가 horses 에 있고 부의 나이 조건을 충족한다', () => {
    const state = boot();
    const mareIds = state.owners[state.playerOwnerId]?.horseIds ?? [];
    for (const mareId of mareIds) {
      const mare = state.horses[mareId] as Horse;
      const sire = state.horses[mare.sireId as HorseId];
      const dam = state.horses[mare.damId as HorseId];
      expect(sire).toBeDefined();
      expect(dam).toBeDefined();
      expect(sire?.birthYear ?? Infinity).toBeLessThanOrEqual(
        mare.birthYear - SIRE_BIRTH_MARGIN_YEARS - MIN_SIRE_AGE_AT_COVER,
      );
      expect(['stud', 'retired']).toContain(sire?.status);

      const damSire = state.horses[dam?.sireId as HorseId];
      expect(damSire).toBeDefined();
      expect(damSire?.birthYear ?? Infinity).toBeLessThanOrEqual(
        (dam?.birthYear ?? -Infinity) - SIRE_BIRTH_MARGIN_YEARS - MIN_SIRE_AGE_AT_COVER,
      );
      expect(dam?.status).toBe('historical');
      expect(mare.familyId).toBe(dam?.id);
    }
  });

  it('nextHorseNumber 는 어미 + 암말 두수 + 1 이다', () => {
    const state = boot();
    expect(state.nextHorseNumber).toBe(1 + PLAYER_START_MARES * 2);
  });

  it('allocateHorseId 는 h-000001 형식으로 발급하고 번호를 올린다', () => {
    const state = newGame();
    expect(allocateHorseId(state)).toBe('h-000001');
    expect(allocateHorseId(state)).toBe('h-000002');
    expect(state.nextHorseNumber).toBe(3);
  });

  it('revealedNicks 는 knownAtStart 키와 같다', () => {
    const nicks = getNicks();
    const state = boot();
    const expected = [
      ...new Set(nicks.filter((n) => n.knownAtStart).map((n) => `${n.sireLineId}|${n.damsireLineId}`)),
    ].sort();
    expect(state.breeding.revealedNicks).toEqual(expected);
    expect(state.breeding.revealedNicks).toEqual(initialRevealedNicks(nicks));
  });

  it('이름 전역 중복이 없다', () => {
    const state = boot();
    const names = Object.values(state.horses).map((h) => h.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('저장 왕복(serialize → deserialize) 후 상태가 같다', () => {
    const state = boot();
    const result = deserializeGame(serializeGame(state, '2026-01-01T00:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(state);
    }
  });
});

describe('플레이어 암말 혈통', () => {
  it('5대 혈통표의 부측은 종마 데이터 사슬로 채워진다 (대 2~5 실존 노드 ≥ 4)', () => {
    for (const seed of SEED_SWEEP) {
      const state = boot(seed);
      const mareIds = state.owners[state.playerOwnerId]?.horseIds ?? [];
      for (const mareId of mareIds) {
        expect(sireSideRealCount(state, mareId), `seed ${seed} mare ${mareId}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('세계 초기화 데이터 검증', () => {
  it('모든 종마 key 는 중복되지 않는다', () => {
    const keys = getStallionRecords().map((r: RealStallionRecord) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
