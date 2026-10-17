import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestSaveFileName } from '../../src/ui/storage/fileTransfer';
import {
  createIndexedDbSaveStore,
  createMemorySaveStore,
  SaveStoreError,
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
      expect(listed[0]).toEqual({ ...slotB, bytes: expect.any(Number) });

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

/** 반복이 많은 긴 저장 문자열(압축 효과를 확인하기 위함). */
function longJson(): string {
  return JSON.stringify({
    items: Array.from({ length: 2000 }, (_, index) => ({ id: index, name: '구름들 컵', kind: 'g1_win', week: index % 52 })),
  });
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

for (const [label, make] of implementations) {
  describe(`압축 저장 왕복(M6-S S1): ${label}`, () => {
    it('긴 JSON 은 bytes 가 원본보다 훨씬 작고 load 는 원문을 그대로 돌려준다', async () => {
      const store = make();
      const json = longJson();

      await store.save(slotA, json);

      const [meta] = await store.list();
      expect(meta?.bytes).toBeGreaterThan(0);
      expect(meta?.bytes).toBeLessThan(utf8Length(json) / 4);
      expect(await store.load('slot-a')).toBe(json);
    });
  });
}

describe('IndexedDB 레코드 형식과 압축 대체(M6-S S1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('압축 가능한 환경에서는 gz 레코드로 저장되고 bytes 는 gz 길이와 같다', async () => {
    const dbName = `silks-and-sires-gz-${++dbCounter}`;
    const store = createIndexedDbSaveStore(undefined, dbName);
    const json = longJson();

    await store.save(slotA, json);

    const raw = await readRawRecord(dbName, 'slot-a');
    expect(raw?.json).toBeUndefined();
    expect(raw?.gz).toBeInstanceOf(Uint8Array);
    const gz = raw?.gz as Uint8Array;
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    const [meta] = await store.list();
    expect(meta?.bytes).toBe(gz.byteLength);
  });

  it('압축 스트림이 없는 환경에서는 json 레코드로 저장되고 bytes 는 UTF-8 길이와 같다', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    const dbName = `silks-and-sires-nogz-${++dbCounter}`;
    const store = createIndexedDbSaveStore(undefined, dbName);
    const json = '{"plain":"데이터"}';

    await store.save(slotA, json);

    const raw = await readRawRecord(dbName, 'slot-a');
    expect(raw?.gz).toBeUndefined();
    expect(raw?.json).toBe(json);
    const [meta] = await store.list();
    expect(meta?.bytes).toBe(utf8Length(json));
    expect(await store.load('slot-a')).toBe(json);
  });

  it('옛 비압축 json 레코드와 bytes 없는 메타도 그대로 불러온다', async () => {
    const dbName = `silks-and-sires-legacy-${++dbCounter}`;
    const db = await openRawDb(dbName);
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').put({ id: 'slot-a', name: '옛 저장', savedAt: slotA.savedAt, date: slotA.date, playerName: 'Siru' });
    tx.objectStore('data').put({ id: 'slot-a', json: '{"legacy":true}' });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();

    const store = createIndexedDbSaveStore(undefined, dbName);
    expect(await store.load('slot-a')).toBe('{"legacy":true}');
    const [meta] = await store.list();
    expect(meta?.bytes).toBeUndefined();
    expect(meta?.name).toBe('옛 저장');
  });

  it('쓰기 중 용량 초과가 나면 SaveStoreError(quota)로 감싸고 이전 메타·데이터를 그대로 둔다', async () => {
    const dbName = `silks-and-sires-quota-${++dbCounter}`;
    const store = createIndexedDbSaveStore(undefined, dbName);
    await store.save(slotA, '{"v":1}');
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'data') throw new DOMException('저장 공간이 없습니다.', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });

    const attempt = store.save({ ...slotA, name: '덮어쓰기 시도' }, '{"v":2}');

    await expect(attempt).rejects.toBeInstanceOf(SaveStoreError);
    await expect(attempt).rejects.toMatchObject({
      code: 'quota',
      message: '저장 공간이 부족합니다. 다른 칸을 지우거나 파일로 내보내세요.',
    });
    vi.restoreAllMocks();
    expect(await store.load('slot-a')).toBe('{"v":1}');
    const [meta] = await store.list();
    expect(meta?.name).toBe(slotA.name);
  });
});

describe('메모리 구현 bytes(M6-S S1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('압축 스트림이 없으면 bytes 는 UTF-8 길이와 같고 원문을 돌려준다', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    const store = createMemorySaveStore();
    const json = '{"plain":"메모리"}';

    await store.save(slotA, json);

    const [meta] = await store.list();
    expect(meta?.bytes).toBe(utf8Length(json));
    expect(await store.load('slot-a')).toBe(json);
  });
});

/** 원본 DB 를 직접 열어 레코드 원문을 본다(압축 여부 확인용). */
function readRawRecord(dbName: string, id: string): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('data', 'readonly').objectStore('data').get(id);
      get.onsuccess = () => {
        db.close();
        resolve(get.result as Record<string, unknown> | undefined);
      };
      get.onerror = () => {
        db.close();
        reject(get.error);
      };
    };
  });
}

/** 옛 저장본 상황을 만들기 위해 버전 1 스키마로 DB 를 연다. */
function openRawDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meta', { keyPath: 'id' });
      request.result.createObjectStore('data', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

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
