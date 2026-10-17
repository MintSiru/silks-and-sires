import type { GameDate } from '../../engine/types';

export interface SaveSlotMeta {
  id: string;
  name: string;
  savedAt: string;
  date: GameDate;
  playerName: string;
  /** 저장된 데이터 바이트 수(압축했으면 압축 크기, M6-S). 옛 저장본은 없음 */
  bytes?: number;
}

/** 저장 칸 id(M6-S): 자동 저장 1칸 + 수동 3칸 */
export const AUTOSAVE_SLOT_ID = 'autosave';
export const MANUAL_SLOT_IDS = ['slot-1', 'slot-2', 'slot-3'] as const;
export type ManualSlotId = (typeof MANUAL_SLOT_IDS)[number];

export interface SaveStore {
  /** savedAt 내림차순 */
  list(): Promise<SaveSlotMeta[]>;
  /** 같은 id 는 덮어쓰기 */
  save(meta: SaveSlotMeta, json: string): Promise<void>;
  load(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

const DEFAULT_DB_NAME = 'silks-and-sires';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DATA_STORE = 'data';

interface DataRecord {
  id: string;
  json: string;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** savedAt 내림차순, 같으면 id 오름차순 */
function sortMetas(metas: SaveSlotMeta[]): SaveSlotMeta[] {
  return metas.sort((a, b) => compareStrings(b.savedAt, a.savedAt) || compareStrings(a.id, b.id));
}

function copyMeta(meta: SaveSlotMeta): SaveSlotMeta {
  return {
    id: meta.id,
    name: meta.name,
    savedAt: meta.savedAt,
    date: { year: meta.date.year, week: meta.date.week },
    playerName: meta.playerName,
    ...(meta.bytes === undefined ? {} : { bytes: meta.bytes }),
  };
}

/** 메모리 구현. 테스트와 IndexedDB 를 쓸 수 없는 환경용. */
export function createMemorySaveStore(): SaveStore {
  const slots = new Map<string, { meta: SaveSlotMeta; json: string }>();

  return {
    async list() {
      return sortMetas([...slots.values()].map((slot) => copyMeta(slot.meta)));
    },
    async save(meta, json) {
      slots.set(meta.id, { meta: copyMeta(meta), json });
    },
    async load(id) {
      return slots.get(id)?.json ?? null;
    },
    async remove(id) {
      slots.delete(id);
    },
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청이 실패했습니다.'));
  });
}

function transactionToPromise(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 트랜잭션이 실패했습니다.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
  });
}

/**
 * IndexedDB 구현. DB 버전 1, object store 2개(meta, data).
 * factory 기본값은 globalThis.indexedDB, dbName 기본값은 'silks-and-sires'.
 */
export function createIndexedDbSaveStore(factory?: IDBFactory, dbName: string = DEFAULT_DB_NAME): SaveStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    const idb = factory ?? globalThis.indexedDB;
    if (!idb) {
      return Promise.reject(new Error('이 환경은 IndexedDB 를 지원하지 않습니다.'));
    }

    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = idb.open(dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(DATA_STORE)) {
          db.createObjectStore(DATA_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 를 열지 못했습니다.'));
    });

    dbPromise = opening.catch((error: unknown) => {
      // 실패한 열기는 캐시하지 않아 다음 호출에서 재시도할 수 있게 한다.
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  return {
    async list() {
      const db = await openDb();
      const tx = db.transaction(META_STORE, 'readonly');
      const rows = await requestToPromise<SaveSlotMeta[]>(tx.objectStore(META_STORE).getAll());
      return sortMetas(rows.map(copyMeta));
    },

    async save(meta, json) {
      const db = await openDb();
      const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
      const done = transactionToPromise(tx);
      const record: DataRecord = { id: meta.id, json };
      tx.objectStore(META_STORE).put(copyMeta(meta));
      tx.objectStore(DATA_STORE).put(record);
      await done;
    },

    async load(id) {
      const db = await openDb();
      const tx = db.transaction(DATA_STORE, 'readonly');
      const record = await requestToPromise<DataRecord | undefined>(tx.objectStore(DATA_STORE).get(id));
      return record ? record.json : null;
    },

    async remove(id) {
      const db = await openDb();
      const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
      const done = transactionToPromise(tx);
      tx.objectStore(META_STORE).delete(id);
      tx.objectStore(DATA_STORE).delete(id);
      await done;
    },
  };
}
