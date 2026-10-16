import type { Horse, HorseId, RealStallionRecord } from '../types';
import type { PedigreeLookup, PedigreeSource } from './pedigree';
import { pedigreeDamId, virtualDamSource } from './pedigree';

/**
 * 실명 종마의 모계 연결: 이름 없는 모마 칸을 조회 시점에 만든다.
 *
 * 실명 종마 Horse 는 damId 가 null 이다(암말 이름 저장 금지, 원칙 1). 그래서 레코드의 damsireKey 와
 * femaleLineSireKeys 로 모계 칸(`~dam:K:n`)을 조회할 때만 만든다. 이 칸은 state.horses 에 저장하지 않는다.
 *
 * 모마 칸 대수(n): 1 = 종마의 모(damsire 를 부로 가진다), 2~4 = 모계 윗대. 부 키는
 * [1] = damsireKey, [n] (n≥2) = femaleLineSireKeys[n − 2].
 *
 * 알려진 한계: 모마 칸 id 는 레코드 key 로 정해지므로, 서로 다른 레코드가 같은 실제 암말을 가리켜도
 * 그 암말이 공통 조상으로 잡히지 않는다. 모마 칸의 부(실명 종마)는 정상적으로 겹침이 잡힌다.
 */

/** 이름 없는 모마 칸 id 접두사 */
export const ANON_DAM_PREFIX = '~dam:';
/** 모마 칸 최대 대수. femaleLineSireKeys 는 2~4대 부만 담는다 */
const ANON_DAM_MAX_LEVEL = 4;

/** 모마 칸 id 를 만든다. level 은 1~4 */
export function anonDamId(recordKey: string, level: number): string {
  if (!Number.isInteger(level) || level < 1 || level > ANON_DAM_MAX_LEVEL) {
    throw new RangeError(`anonDamId: 모마 칸 대수는 1~${ANON_DAM_MAX_LEVEL} 이어야 한다: ${level}`);
  }
  return `${ANON_DAM_PREFIX}${recordKey}:${level}`;
}

/** 이름 없는 모마 칸 id 인지 */
export function isAnonDamId(id: HorseId): boolean {
  return id.startsWith(ANON_DAM_PREFIX);
}

/** 모마 칸 id 를 레코드 key 와 대수로 되돌린다. 모마 칸 형식이 아니면 null */
function parseAnonDamId(id: HorseId): { key: string; level: number } | null {
  if (!isAnonDamId(id)) return null;
  const body = id.slice(ANON_DAM_PREFIX.length);
  const sep = body.lastIndexOf(':');
  if (sep <= 0) return null;
  const level = Number(body.slice(sep + 1));
  if (!Number.isInteger(level) || level < 1 || level > ANON_DAM_MAX_LEVEL) return null;
  return { key: body.slice(0, sep), level };
}

/** 레코드 배열 → key 표. 같은 배열 객체면 WeakMap 캐시를 재사용한다(중복 key 는 먼저 나온 것) */
const tableCache = new WeakMap<readonly RealStallionRecord[], ReadonlyMap<string, RealStallionRecord>>();

function recordTable(records: readonly RealStallionRecord[]): ReadonlyMap<string, RealStallionRecord> {
  const cached = tableCache.get(records);
  if (cached !== undefined) return cached;
  const table = new Map<string, RealStallionRecord>();
  for (const rec of records) {
    if (!table.has(rec.key)) table.set(rec.key, rec);
  }
  tableCache.set(records, table);
  return table;
}

/** 모마 칸 대수 level 의 부 키. level 1 은 damsireKey, level ≥2 는 femaleLineSireKeys[level − 2] */
function femaleLineSireAt(rec: RealStallionRecord, level: number): string | null {
  if (level === 1) return rec.damsireKey;
  return rec.femaleLineSireKeys?.[level - 2] ?? null;
}

/** level 부터 윗대(level..MAX)에 부 키가 하나라도 있는지. 전부 비면 그 칸 아래는 만들지 않는다 */
function hasFilledFrom(rec: RealStallionRecord, level: number): boolean {
  for (let n = level; n <= ANON_DAM_MAX_LEVEL; n++) {
    if (femaleLineSireAt(rec, n) !== null) return true;
  }
  return false;
}

/** level 대 모마 칸이 존재하는지. 1대는 damsireKey 가 있을 때만, 2~4대는 그 아래에 부 키가 있을 때 */
function anonDamExists(rec: RealStallionRecord, level: number): boolean {
  return level === 1 ? rec.damsireKey !== null : hasFilledFrom(rec, level);
}

/**
 * 모마 칸 노드. 부는 horses 에 있을 때만 연결하고(없으면 null), 모마는 다음 대 칸이 존재할 때만 잇는다.
 * 부 키가 null 이어도 칸 자체는 존재할 수 있다(그 아래에 부가 있을 때).
 */
function anonDamSource(
  horses: Readonly<Record<HorseId, Horse>>,
  rec: RealStallionRecord,
  level: number,
): PedigreeSource {
  const sireKey = femaleLineSireAt(rec, level);
  const sireId = sireKey !== null && horses[sireKey] !== undefined ? sireKey : null;
  const next = level < ANON_DAM_MAX_LEVEL && hasFilledFrom(rec, level + 1);
  return {
    id: anonDamId(rec.key, level),
    sireId,
    damId: next ? anonDamId(rec.key, level + 1) : null,
  };
}

/**
 * 혈통 조회 함수를 만든다. 실명 종마는 모계 칸을 damId 로 잇고, 모마 칸은 조회 시점에 만든다.
 * 그 밖의 말은 horses 그대로다. horses 는 바꾸지 않는다(모마 칸은 상태에 저장하지 않는다).
 * 같은 입력이면 같은 결과다.
 */
export function createPedigreeLookup(
  horses: Readonly<Record<HorseId, Horse>>,
  records: readonly RealStallionRecord[],
): PedigreeLookup {
  const table = recordTable(records);
  return (id: HorseId): PedigreeSource | undefined => {
    const virtual = virtualDamSource(key => horses[key], id);
    if (virtual !== undefined) return virtual;
    const anon = parseAnonDamId(id);
    if (anon !== null) {
      const rec = table.get(anon.key);
      if (rec === undefined || !anonDamExists(rec, anon.level)) return undefined;
      return anonDamSource(horses, rec, anon.level);
    }

    const horse = horses[id];
    if (horse === undefined) return undefined;
    const rec = table.get(id);
    if (rec === undefined) return horse.damId === null && horse.virtualDam !== undefined
      ? { id, sireId: horse.sireId, damId: pedigreeDamId(horse), name: horse.name, birthYear: horse.birthYear }
      : horse;
    return {
      id,
      sireId: horse.sireId,
      damId: rec.damsireKey !== null ? anonDamId(rec.key, 1) : null,
    };
  };
}
