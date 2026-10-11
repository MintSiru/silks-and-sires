import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { suggestSaveFileName } from '../../src/ui/storage/fileTransfer';
import {
  createIndexedDbSaveStore,
  createMemorySaveStore,
  type SaveSlotMeta,
  type SaveStore,
} from '../../src/ui/storage/saveStore';

let dbCounter = 0;

/** 구현마다 새 DB 이름을 써서 테스트끼리 상태가 섞이지 않게 한다. */
const implementations: Array<[string, () => SaveStore]> = [
  ['메모리 구현', () => createMemorySaveStore()],
  ['IndexedDB 구현', () => createIndexedDbSaveStore(undefined, `silks-and-sires-test-${++dbCounter}`)],
];

const slotA: SaveSlotMeta = {
  id: 'slot-a',
  name: '1년차 봄',
  savedAt: '2026-03-01T10:00:00.000Z',
  date: { year: 2026, week: 9 },
  playerName: 'Siru',
};

const slotB: SaveSlotMeta = {
  id: 'slot-b',
  name: '1년차 여름',
  savedAt: '2026-06-01T10:00:00.000Z',
  date: { year: 2026, week: 23 },
  playerName: 'Siru',
};

for (const [label, make] of implementations) {
  describe(`SaveStore: ${label}`, () => {
    it('save 2개 → list 정렬 → load → 덮어쓰기 → remove → load null', async () => {
      const store = make();

      await store.save(slotA, '{"slot":"a"}');
      await store.save(slotB, '{"slot":"b"}');

      const listed = await store.list();
      expect(listed.map((m) => m.id)).toEqual(['slot-b', 'slot-a']);
      expect(listed[0]).toEqual(slotB);

      expect(await store.load('slot-a')).toBe('{"slot":"a"}');

      await store.save({ ...slotA, name: '덮어쓴 이름' }, '{"slot":"a2"}');
      const afterOverwrite = await store.list();
      expect(afterOverwrite).toHaveLength(2);
      expect(afterOverwrite.find((m) => m.id === 'slot-a')?.name).toBe('덮어쓴 이름');
      expect(await store.load('slot-a')).toBe('{"slot":"a2"}');

      await store.remove('slot-a');
      expect(await store.load('slot-a')).toBeNull();
      expect((await store.list()).map((m) => m.id)).toEqual(['slot-b']);
    });

    it('없는 id 는 load 가 null 이고 remove 는 실패하지 않는다', async () => {
      const store = make();
      expect(await store.load('missing')).toBeNull();
      await expect(store.remove('missing')).resolves.toBeUndefined();
      expect(await store.list()).toEqual([]);
    });
  });
}

describe('IndexedDB 구현: 같은 DB 이름이면 인스턴스를 바꿔도 데이터가 남는다', () => {
  it('두 번째 인스턴스에서 같은 슬롯을 읽을 수 있다', async () => {
    const dbName = `silks-and-sires-persist-${++dbCounter}`;
    const first = createIndexedDbSaveStore(undefined, dbName);
    await first.save(slotA, '{"persisted":true}');

    const second = createIndexedDbSaveStore(undefined, dbName);
    expect(await second.load('slot-a')).toBe('{"persisted":true}');
    expect((await second.list()).map((m) => m.id)).toEqual(['slot-a']);
  });
});

describe('suggestSaveFileName', () => {
  it("이름에서 영숫자만 남기고 주는 두 자리로 패딩한다", () => {
    expect(suggestSaveFileName("Siru O'Neil", { year: 2026, week: 7 })).toBe(
      'silks-and-sires_SiruONeil_2026-w07.json',
    );
  });

  it('주가 두 자리면 그대로 쓴다', () => {
    expect(suggestSaveFileName('Owner', { year: 2027, week: 45 })).toBe('silks-and-sires_Owner_2027-w45.json');
  });

  it('영숫자가 하나도 없으면 owner 로 대체한다', () => {
    expect(suggestSaveFileName('   ', { year: 2026, week: 1 })).toBe('silks-and-sires_owner_2026-w01.json');
  });
});
