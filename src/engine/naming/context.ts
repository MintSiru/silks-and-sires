import { LANGUAGE_BY_COUNTRY, TRIBUTE_NAME_LIMIT } from '../config/naming';
import type { GameState, HorseId, OwnerId } from '../types';
import { pickOwnerStyle } from './generate';
import { normalizeName } from './validate';
import type { NameLanguage, NameRegistry, NamingContext, NamingData } from './types';

/** 마주가 없는 이름 짓기(세계 생성 기초 암말·조상 암말)에 쓰는 명명 스타일 id */
const WORLD_STYLE_KEY = 'world';

/** namingContextFor 에 넘기는 말 한 마리의 혈통·소유 정보 */
export interface NamingArgs {
  ownerId: OwnerId | null;
  sireId: HorseId | null;
  damId: HorseId | null;
}

/** 이름 생성에 필요한 정적 데이터(NamingData 와 실명 종마 이름표) */
export interface NamingStaticData {
  naming: NamingData;
  stallionNames: Record<string, string>;
}

/** 쓰기 가능한 이름 레지스트리: 이름을 정한 뒤 add 로 등록한다 */
export type MutableNameRegistry = NameRegistry & { add(name: string): void };

/** 부·모 한 마리의 이름. state.horses 에 있으면 그 이름, 없으면 실명 종마 이름표, 그래도 없으면 null. */
function parentName(state: GameState, id: HorseId | null, stallionNames: Record<string, string>): string | null {
  if (id === null) {
    return null;
  }
  const horse = state.horses[id];
  if (horse !== undefined) {
    return horse.name;
  }
  return stallionNames[id] ?? null;
}

/** 성(마지막 단어). 공백으로 나눈 마지막 조각이며, 한 단어 이름이면 그 이름이다. */
function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((w) => w !== '');
  return parts[parts.length - 1] ?? name;
}

/**
 * 인물 풀 레코드(기수·조교사)별 성 목록 캐시. 같은 레코드 객체면 다시 계산하지 않는다.
 * 말 한 마리마다 호출되므로 정렬 비용을 없애려고 둔다. 인물 레코드는 초기화 뒤 바뀌지 않는다.
 */
const tributeCache = new WeakMap<object, WeakMap<object, readonly string[]>>();

/** 게임 속 가상 인물(기수·조교사)의 성 목록. 정렬 후 앞 TRIBUTE_NAME_LIMIT 개. */
function tributeNamesOf(state: GameState): readonly string[] {
  const byTrainers = tributeCache.get(state.jockeys);
  const hit = byTrainers?.get(state.trainers);
  if (hit !== undefined) {
    return hit;
  }
  const people = [...Object.values(state.jockeys), ...Object.values(state.trainers)];
  const names = people
    .map((p) => surnameOf(p.name))
    .filter((s) => s !== '')
    .sort()
    .slice(0, TRIBUTE_NAME_LIMIT);
  const cache = byTrainers ?? new WeakMap<object, readonly string[]>();
  cache.set(state.trainers, names);
  tributeCache.set(state.jockeys, cache);
  return names;
}

/**
 * 말 한 마리의 이름 생성 문맥을 만든다. 원본 state 는 바꾸지 않는다.
 * - 부·모 이름: state.horses[id].name → 없으면 stallionNames[id] → 없으면 null
 * - 마주가 있으면 그 마주의 국적 언어(LANGUAGE_BY_COUNTRY)와 명명 스타일(id·namePrefix 기준)을 쓴다.
 * - 마주가 없으면(기초 암말 등) 언어 en, 스타일은 'world' 키로 고른다.
 * 마주 id 가 state.owners 에 없으면 Error.
 */
export function namingContextFor(state: GameState, args: NamingArgs, data: NamingStaticData): NamingContext {
  let styleKey = WORLD_STYLE_KEY;
  let prefix: string | null = null;
  let language: NameLanguage = 'en';
  if (args.ownerId !== null) {
    const owner = state.owners[args.ownerId];
    if (owner === undefined) {
      throw new Error(`namingContextFor: 마주가 없음: ${args.ownerId}`);
    }
    styleKey = owner.id;
    prefix = owner.namePrefix;
    language = LANGUAGE_BY_COUNTRY[owner.country];
  }
  return {
    sireName: parentName(state, args.sireId, data.stallionNames),
    damName: parentName(state, args.damId, data.stallionNames),
    style: pickOwnerStyle(styleKey, prefix, data.naming.styles),
    tributeNames: tributeNamesOf(state),
    language,
  };
}

/**
 * 현재 state 의 모든 말 이름(normalizeName 결과)으로 만든 레지스트리.
 * isTaken 은 원본 이름을 받아도 normalizeName 을 거쳐 조회한다. add 로 새 이름을 등록한다.
 */
export function makeNameRegistry(state: GameState): MutableNameRegistry {
  const taken = new Set<string>(Object.values(state.horses).map((h) => normalizeName(h.name)));
  return {
    isTaken: (name: string): boolean => taken.has(normalizeName(name)),
    add: (name: string): void => {
      taken.add(normalizeName(name));
    },
  };
}
