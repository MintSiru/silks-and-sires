import racecoursesJson from '../../../data/racecourses.json';
import racesJson from '../../../data/races.json';
import namesJson from '../../../data/names.json';
import stallionRecordsJson from '../../../data/stallions/stallions.json';
import stallionNamesJson from '../../../data/stallions/names.json';
import sireLinesJson from '../../../data/stallions/sire_lines.json';
import nicksJson from '../../../data/breeding/nicks.json';
import horseWordsJson from '../../../data/names/horse_words.json';
import peoplePoolsJson from '../../../data/people/name_pools.json';
import peopleBlockedJson from '../../../data/people/blocked_names.json';
import peoplePlacesJson from '../../../data/people/places.json';
import { getRacecourse as findRacecourse, loadRacecourses } from '../course/load';
import { NAME_COUNTRIES, type CountryNamePool, type NameCountry, type NamePools } from '../people/names';
import type { PeopleStaticData, PlacesData } from '../people/generate';
import type { NamePool } from '../race/sampleField';
import type { HorseWords } from '../horse/generate';
import type { NickEntry, Race, Racecourse, RealStallionRecord, SireLine, StallionNameTable } from '../types';

/** 경마장 목록은 모듈 안에서 처음 요청될 때 한 번만 검증·캐시한다. */
let cachedRacecourses: Racecourse[] | null = null;

/** 레이스 정의(data/races.json). 모듈 로드 시 한 번 타입을 붙인다. */
const RACES: Race[] = racesJson as Race[];

/** 이름 풀(data/names.json). */
const NAME_POOL: NamePool = namesJson as NamePool;

/** 경마장 전체 목록 (data/racecourses.json, 검증 후 캐시). */
export function getRacecourses(): Racecourse[] {
  if (cachedRacecourses === null) {
    cachedRacecourses = loadRacecourses(racecoursesJson);
  }
  return cachedRacecourses;
}

/** id 로 경마장 하나를 찾는다. 없으면 Error. */
export function getRacecourse(id: string): Racecourse {
  return findRacecourse(getRacecourses(), id);
}

/** 레이스 전체 목록 (data/races.json). */
export function getRaces(): Race[] {
  return RACES;
}

/** id 로 레이스 하나를 찾는다. 없으면 Error. */
export function getRace(id: string): Race {
  const found = RACES.find((r) => r.id === id);
  if (found === undefined) {
    throw new Error(`레이스를 찾을 수 없음: ${id}`);
  }
  return found;
}

/** 가상 이름 풀 (data/names.json). */
export function getNamePool(): NamePool {
  return NAME_POOL;
}

/** 실명 종마 레코드 (data/stallions/stallions.json). */
export function getStallionRecords(): RealStallionRecord[] {
  return stallionRecordsJson as RealStallionRecord[];
}

/** 종마 key → 표시 이름 (data/stallions/names.json). */
export function getStallionNames(): StallionNameTable {
  return stallionNamesJson as StallionNameTable;
}

/** 부계 계통 목록 (data/stallions/sire_lines.json). */
export function getSireLines(): SireLine[] {
  return sireLinesJson as SireLine[];
}

/** 닉스 표 (data/breeding/nicks.json). */
export function getNicks(): NickEntry[] {
  return nicksJson as NickEntry[];
}

/** 가상 말 이름 단어장 (data/names/horse_words.json). */
export function getHorseWords(): HorseWords {
  return horseWordsJson as HorseWords;
}

/** 인물 생성용 정적 데이터 캐시(검증 후 한 번만 만든다). */
let cachedPeopleData: PeopleStaticData | null = null;

function fail(message: string): never {
  throw new Error(`인물 데이터 형식 오류: ${message}`);
}

function requireStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v !== '')) {
    fail(`${where} 는 비어 있지 않은 문자열 배열이어야 한다`);
  }
  return value as string[];
}

function requireRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${where} 는 객체여야 한다`);
  }
  return value as Record<string, unknown>;
}

/** 열 개 국가 키 레코드를 검증하고 값에 변환 함수를 적용한다. */
function perNameCountry<T>(raw: unknown, where: string, convert: (country: NameCountry) => T): Record<NameCountry, T> {
  const obj = requireRecord(raw, where);
  const out = {} as Record<NameCountry, T>;
  for (const c of NAME_COUNTRIES) {
    out[c] = convert(c);
  }
  for (const key of Object.keys(obj)) {
    if (!(NAME_COUNTRIES as readonly string[]).includes(key)) {
      fail(`${where} 에 알 수 없는 국가 키 ${key}`);
    }
  }
  return out;
}

/**
 * name_pools / blocked_names / places 원본을 검증해 PeopleStaticData 로 바꾼다.
 * 형식이 맞지 않으면 Error. 테스트에서 직접 호출할 수 있게 export 한다.
 */
export function parsePeopleData(pools: unknown, blocked: unknown, places: unknown): PeopleStaticData {
  const poolsRaw = requireRecord(pools, 'name_pools');
  const namePools = perNameCountry<CountryNamePool>(poolsRaw, 'name_pools', (c) => {
    const p = requireRecord(poolsRaw[c], `name_pools.${c}`);
    return {
      givenMale: requireStringArray(p['given_male'], `name_pools.${c}.given_male`),
      givenFemale: requireStringArray(p['given_female'], `name_pools.${c}.given_female`),
      surnames: requireStringArray(p['surnames'], `name_pools.${c}.surnames`),
    };
  });

  const blockedRaw = requireRecord(blocked, 'blocked_names');
  const blockedNames = requireStringArray(blockedRaw['full_names'], 'blocked_names.full_names');

  const placesRaw = requireRecord(places, 'places');
  const studRaw = requireRecord(placesRaw['stud_suffixes'], 'places.stud_suffixes');
  const regionRaw = requireRecord(placesRaw['region_names'], 'places.region_names');
  const placesData: PlacesData = {
    yardWords: requireStringArray(placesRaw['yard_words'], 'places.yard_words'),
    studSuffixes: perNameCountry(studRaw, 'places.stud_suffixes', (c) =>
      requireStringArray(studRaw[c], `places.stud_suffixes.${c}`),
    ),
    regionNames: perNameCountry(regionRaw, 'places.region_names', (c) =>
      requireStringArray(regionRaw[c], `places.region_names.${c}`),
    ),
  };

  return { pools: namePools as NamePools, blockedNames, places: placesData };
}

/** 인물 생성 정적 데이터 (data/people/name_pools.json, blocked_names.json, places.json). */
export function getPeopleData(): PeopleStaticData {
  if (cachedPeopleData === null) {
    cachedPeopleData = parsePeopleData(peoplePoolsJson, peopleBlockedJson, peoplePlacesJson);
  }
  return cachedPeopleData;
}
