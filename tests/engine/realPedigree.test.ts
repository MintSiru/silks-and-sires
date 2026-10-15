import { describe, expect, it } from 'vitest';
import { buildMatingPedigree, buildPedigree, type PedigreeLookup } from '../../src/engine/breeding/pedigree';
import { dominantCrosses, findInbreeding } from '../../src/engine/breeding/inbreeding';
import {
  ANON_DAM_PREFIX,
  anonDamId,
  createPedigreeLookup,
  isAnonDamId,
} from '../../src/engine/breeding/realPedigree';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import type { GameState, Horse, HorseId, PedigreeNode, RealStallionRecord } from '../../src/engine/types';

const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;

/** 혈통 조회에 필요한 필드만 가진 가상 말(조회 테스트용) */
function horse(id: HorseId, sireId: HorseId | null, damId: HorseId | null): Horse {
  return { id, name: id, sireId, damId } as unknown as Horse;
}

/** 가상 실명 종마 레코드. 나머지 필드는 조회와 무관한 값이다 */
function record(key: string, overrides: Partial<RealStallionRecord> = {}): RealStallionRecord {
  return {
    key,
    foaled: 2000,
    countryOfBirth: 'GB',
    sireKey: null,
    damsireKey: null,
    sireLineId: 'sl_test' as RealStallionRecord['sireLineId'],
    status: 'historical',
    standsIn: null,
    distanceProfile: 'classic',
    surfaceProfile: 'turf',
    marketTier: 3,
    confidence: 'medium',
    ...overrides,
  } as RealStallionRecord;
}

/** 말 목록 → 상태의 horses 와 같은 모양 */
function horsesOf(list: readonly Horse[]): Record<HorseId, Horse> {
  return Object.fromEntries(list.map((h) => [h.id, h])) as Record<HorseId, Horse>;
}

describe('수용 기준 1: 모마 칸 생성과 연결', () => {
  const sireA = horse('stl_a', null, null);
  const sireC = horse('stl_c', null, null);
  const damsire = horse('stl_d', null, null);
  const plain = record('stl_plain', { sireKey: 'stl_a', damsireKey: 'stl_d' });
  const full = record('stl_full', { sireKey: 'stl_a', damsireKey: 'stl_d', femaleLineSireKeys: ['stl_a', null, 'stl_c'] });
  const noDamsire = record('stl_nodam', { sireKey: 'stl_a', damsireKey: null, femaleLineSireKeys: ['stl_a'] });
  const horses = horsesOf([
    horse('stl_plain', 'stl_a', null),
    horse('stl_full', 'stl_a', null),
    horse('stl_nodam', 'stl_a', null),
    sireA,
    sireC,
    damsire,
  ]);
  const records = [plain, full, noDamsire];
  const lookup = createPedigreeLookup(horses, records);

  it('damsireKey 만 있는 레코드는 1대 모마 칸을 만들고 그 부는 damsire 다', () => {
    expect(lookup('stl_plain')).toEqual({ id: 'stl_plain', sireId: 'stl_a', damId: anonDamId('stl_plain', 1) });
    expect(lookup(anonDamId('stl_plain', 1))).toEqual({
      id: '~dam:stl_plain:1',
      sireId: 'stl_d',
      damId: null,
    });
  });

  it('femaleLineSireKeys [A, null, C] 는 2대 모마(부 A)·3대 모마(부 null)·4대 모마(부 C) 로 이어진다', () => {
    expect(lookup(anonDamId('stl_full', 1))).toEqual({
      id: '~dam:stl_full:1',
      sireId: 'stl_d',
      damId: '~dam:stl_full:2',
    });
    expect(lookup(anonDamId('stl_full', 2))).toEqual({
      id: '~dam:stl_full:2',
      sireId: 'stl_a',
      damId: '~dam:stl_full:3',
    });
    expect(lookup(anonDamId('stl_full', 3))).toEqual({
      id: '~dam:stl_full:3',
      sireId: null,
      damId: '~dam:stl_full:4',
    });
    expect(lookup(anonDamId('stl_full', 4))).toEqual({
      id: '~dam:stl_full:4',
      sireId: 'stl_c',
      damId: null,
    });
  });

  it('damsireKey 가 null 이면 실명 종마의 damId 는 null 이다', () => {
    expect(lookup('stl_nodam')?.damId).toBeNull();
    expect(lookup(anonDamId('stl_nodam', 1))).toBeUndefined();
  });

  it('부 키가 horses 에 없으면 그 부는 null 이다', () => {
    const lonely = createPedigreeLookup(horsesOf([horse('stl_plain', 'stl_a', null)]), [plain]);
    expect(lonely(anonDamId('stl_plain', 1))).toEqual({
      id: '~dam:stl_plain:1',
      sireId: null,
      damId: null,
    });
  });

  it('형식이 맞지 않거나 대수 밖이거나 레코드가 없는 모마 칸 id 는 undefined 다', () => {
    expect(lookup('~dam:stl_full:0')).toBeUndefined();
    expect(lookup('~dam:stl_full:5')).toBeUndefined();
    expect(lookup('~dam:stl_full:x')).toBeUndefined();
    expect(lookup('~dam:stl_unknown:1')).toBeUndefined();
  });

  it('모마 칸 id 는 접두사와 대수 규칙을 따르고 대수 밖이면 던진다', () => {
    expect(anonDamId('stl_full', 3)).toBe(`${ANON_DAM_PREFIX}stl_full:3`);
    expect(isAnonDamId('~dam:stl_full:3')).toBe(true);
    expect(isAnonDamId('stl_full')).toBe(false);
    expect(() => anonDamId('stl_full', 0)).toThrow(RangeError);
    expect(() => anonDamId('stl_full', 5)).toThrow(RangeError);
  });

  it('실명 종마가 아닌 말은 horses 그대로 돌려준다', () => {
    const ordinary = horse('h-000001', 'stl_a', 'stl_d');
    const withOrdinary = createPedigreeLookup(horsesOf([ordinary, sireA]), records);
    expect(withOrdinary('h-000001')).toBe(ordinary);
    expect(withOrdinary('h-999999')).toBeUndefined();
  });
});

describe('수용 기준 3: 인브리드 공통 외조부', () => {
  it('부 쪽 모계와 모 쪽 부가 같은 외조부면 그 종마가 공통 조상으로 잡힌다', () => {
    const grandDam = record('stl_sire', { damsireKey: 'stl_x' });
    const sire = record('stl_s', { sireKey: 'stl_sire', damsireKey: 'stl_x' });
    const mare = horse('h-000001', 'stl_x', null);
    const horses = horsesOf([
      horse('stl_s', 'stl_sire', null),
      horse('stl_sire', null, null),
      horse('stl_x', null, null),
      mare,
    ]);

    const plainLookup: PedigreeLookup = (id) => horses[id];
    const plainRoot = buildMatingPedigree(plainLookup, 'stl_s', 'h-000001');
    expect(findInbreeding(plainRoot).map((c) => c.ancestorId)).not.toContain('stl_x');

    const realLookup = createPedigreeLookup(horses, [sire, grandDam]);
    const root = buildMatingPedigree(realLookup, 'stl_s', 'h-000001');
    const crosses = findInbreeding(root);
    expect(crosses.map((c) => c.ancestorId)).toContain('stl_x');
    expect(dominantCrosses(root, crosses).map((c) => c.ancestorId)).toContain('stl_x');
  });
});

describe('수용 기준 4: 결정성과 상태 불변', () => {
  it('같은 입력은 같은 결과를 내고 horses 를 바꾸지 않는다', () => {
    const records = [record('stl_full', { sireKey: 'stl_a', damsireKey: 'stl_d', femaleLineSireKeys: ['stl_a', null, 'stl_c'] })];
    const horses = horsesOf([
      horse('stl_full', 'stl_a', null),
      horse('stl_a', null, null),
      horse('stl_c', null, null),
      horse('stl_d', null, null),
      horse('h-000001', 'stl_a', null),
    ]);
    const before = structuredClone(horses);

    const first = buildPedigree(createPedigreeLookup(horses, records), 'stl_full', 5);
    const second = buildPedigree(createPedigreeLookup(horses, records), 'stl_full', 5);
    expect(second).toEqual(first);
    expect(horses).toEqual(before);
    expect(Object.keys(horses).some(isAnonDamId)).toBe(false);
  });
});

describe('Frankel 5대 혈통표(시드 20261011)', () => {
  it('모계 칸을 넣으면 실존 노드가 늘고 상태는 그대로다', () => {
    const records = getStallionRecords();
    const state: GameState = bootstrapWorld(
      createNewGame({ seed: 20261011, playerName: 'Test Owner', silks: SILKS }),
      {
        stallionRecords: records,
        stallionNames: getStallionNames(),
        nicks: getNicks(),
        naming: getNamingData(),
      },
      createRng(20261011),
    );
    const snapshot = structuredClone(state.horses);
    const countNodes = (root: PedigreeNode): number => {
      let total = 0;
      const walk = (node: PedigreeNode | null): void => {
        if (node === null) return;
        if (node.horseId !== null) total += 1;
        walk(node.sire);
        walk(node.dam);
      };
      walk(root);
      return total;
    };

    const plain = countNodes(buildPedigree((id) => state.horses[id], 'stl_frankel', 5));
    const withDam = countNodes(
      buildPedigree(createPedigreeLookup(state.horses, records), 'stl_frankel', 5),
    );
    expect(withDam).toBeGreaterThan(plain);
    expect(state.horses).toEqual(snapshot);
  });
});
