import type { GameDate } from '../../engine/types';
import { canCompress, gunzipText, gzipText } from './compress';

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

/** 저장 실패 종류(M6-S S1). message 는 화면 토스트에 그대로 보여 주는 한국어 문구다. */
export type SaveStoreErrorCode = 'quota' | 'unavailable' | 'unknown';

export class SaveStoreError extends Error {
  readonly code: SaveStoreErrorCode;

  constructor(code: SaveStoreErrorCode, message: string) {
    super(message);
    this.name = 'SaveStoreError';
    this.code = code;
  }
}

const DEFAULT_DB_NAME = 'silks-and-sires';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DATA_STORE = 'data';

/**
 * 데이터 레코드. 압축 가능한 환경이면 gz 로, 아니면 json 으로 쓴다.
 * 옛 저장본은 json 만 가진다(비압축 레코드도 그대로 읽는다).
 */
interface DataRecord {
  id: string;
  json?: string;
  gz?: Uint8Array;
}

/** 쓰기 한 번에 저장할 데이터 부분. 둘 중 하나만 채운다. */
type EncodedPayload = { json: string } | { gz: Uint8Array };

interface EncodedRecord {
  payload: EncodedPayload;
  /** 실제 저장 바이트(gz 길이 또는 UTF-8 바이트) */
  bytes: number;
}

const QUOTA_MESSAGE = '저장 공간이 부족합니다. 다른 칸을 지우거나 파일로 내보내세요.';
const UNAVAILABLE_MESSAGE = '이 브라우저에서는 저장 공간을 열 수 없습니다.';
const WRITE_FAILED_MESSAGE = '저장에 실패했습니다. 기존 저장은 그대로 남아 있습니다.';
const READ_FAILED_MESSAGE = '저장 데이터를 불러오지 못했습니다.';
const REMOVE_FAILED_MESSAGE = '저장 칸을 지우지 못했습니다.';
const DECOMPRESS_UNSUPPORTED_MESSAGE = '이 브라우저는 압축된 저장본을 풀 수 없습니다.';

/** 브라우저마다 용량 초과 오류 이름이 다르다(Firefox 구버전 포함). */
const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  return typeof error.name === 'string' && QUOTA_ERROR_NAMES.has(error.name);
}

/** 임의 오류를 SaveStoreError 로 감싼다. 이미 감싼 오류는 그대로 둔다. */
function toSaveStoreError(error: unknown, fallbackMessage: string): SaveStoreError {
  if (error instanceof SaveStoreError) return error;
  if (isQuotaError(error)) return new SaveStoreError('quota', QUOTA_MESSAGE);
  return new SaveStoreError('unknown', fallbackMessage);
}

async function guard<T>(fallbackMessage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toSaveStoreError(error, fallbackMessage);
  }
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** 압축 가능하면 gzip, 아니면(또는 압축이 실패하면) JSON 원문. */
async function encodeJson(json: string): Promise<EncodedRecord> {
  if (canCompress()) {
    try {
      const gz = await gzipText(json);
      return { payload: { gz }, bytes: gz.byteLength };
    } catch {
      // 압축이 실패해도 저장은 막지 않고 원문으로 남긴다.
    }
  }
  return { payload: { json }, bytes: utf8ByteLength(json) };
}

/** 레코드를 JSON 문자열로 되돌린다. 옛 json 레코드는 그대로 돌려준다. */
async function decodeRecord(record: DataRecord): Promise<string | null> {
  if (record.gz) {
    if (!canCompress()) {
      throw new SaveStoreError('unavailable', DECOMPRESS_UNSUPPORTED_MESSAGE);
    }
    return gunzipText(record.gz);
  }
  return record.json ?? null;
}

function withBytes(meta: SaveSlotMeta, bytes: number): SaveSlotMeta {
  return copyMeta({ ...meta, bytes });
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

/** 메모리 구현. 테스트와 IndexedDB 를 쓸 수 없는 환경용. 압축 규칙은 IndexedDB 구현과 같다. */
export function createMemorySaveStore(): SaveStore {
  const slots = new Map<string, { meta: SaveSlotMeta; record: DataRecord }>();

  return {
    async list() {
      return sortMetas([...slots.values()].map((slot) => copyMeta(slot.meta)));
    },
    async save(meta, json) {
      const encoded = await encodeJson(json);
      slots.set(meta.id, {
        meta: withBytes(meta, encoded.bytes),
        record: { id: meta.id, ...encoded.payload },
      });
    },
    async load(id) {
      const slot = slots.get(id);
      return slot ? decodeRecord(slot.record) : null;
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
 * 쓰기는 meta·data 를 한 트랜잭션으로 넣어, 실패하면 이전 칸이 그대로 남는다.
 */
export function createIndexedDbSaveStore(factory?: IDBFactory, dbName: string = DEFAULT_DB_NAME): SaveStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    const idb = factory ?? globalThis.indexedDB;
    if (!idb) {
      return Promise.reject(new SaveStoreError('unavailable', UNAVAILABLE_MESSAGE));
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
      request.onerror = () => reject(new SaveStoreError('unavailable', UNAVAILABLE_MESSAGE));
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
      return guard(READ_FAILED_MESSAGE, async () => {
        const db = await openDb();
        const tx = db.transaction(META_STORE, 'readonly');
        const rows = await requestToPromise<SaveSlotMeta[]>(tx.objectStore(META_STORE).getAll());
        return sortMetas(rows.map(copyMeta));
      });
    },

    async save(meta, json) {
      await guard(WRITE_FAILED_MESSAGE, async () => {
        // 압축은 트랜잭션 밖에서 끝낸다. 트랜잭션 안에서 기다리면 자동 커밋될 수 있다.
        const encoded = await encodeJson(json);
        const db = await openDb();
        const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
        const done = transactionToPromise(tx);
        const record: DataRecord = { id: meta.id, ...encoded.payload };
        try {
          tx.objectStore(META_STORE).put(withBytes(meta, encoded.bytes));
          tx.objectStore(DATA_STORE).put(record);
        } catch (error) {
          // 요청을 넣다가 동기적으로 실패하면 트랜잭션을 되돌리고 원래 오류를 던진다.
          try {
            tx.abort();
          } catch {
            // 이미 끝난 트랜잭션이면 중단할 필요가 없다.
          }
          await done.catch(() => undefined);
          throw error;
        }
        await done;
      });
    },

    async load(id) {
      return guard(READ_FAILED_MESSAGE, async () => {
        const db = await openDb();
        const tx = db.transaction(DATA_STORE, 'readonly');
        const record = await requestToPromise<DataRecord | undefined>(tx.objectStore(DATA_STORE).get(id));
        return record ? decodeRecord(record) : null;
      });
    },

    async remove(id) {
      await guard(REMOVE_FAILED_MESSAGE, async () => {
        const db = await openDb();
        const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
        const done = transactionToPromise(tx);
        tx.objectStore(META_STORE).delete(id);
        tx.objectStore(DATA_STORE).delete(id);
        await done;
      });
    },
  };
}
