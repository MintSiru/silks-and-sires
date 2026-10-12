import racecoursesJson from '../../../data/racecourses.json';
import racesJson from '../../../data/races.json';
import namesJson from '../../../data/names.json';
import stallionRecordsJson from '../../../data/stallions/stallions.json';
import stallionNamesJson from '../../../data/stallions/names.json';
import sireLinesJson from '../../../data/stallions/sire_lines.json';
import nicksJson from '../../../data/breeding/nicks.json';
import peoplePoolsJson from '../../../data/people/name_pools.json';
import peopleBlockedJson from '../../../data/people/blocked_names.json';
import peoplePlacesJson from '../../../data/people/places.json';
import namingLexiconJson from '../../../data/naming/lexicon.en.json';
import namingStylesJson from '../../../data/naming/owner-styles.json';
import namingProtectedJson from '../../../data/naming/protected.json';
import namingHistoricalJson from '../../../data/naming/historical.json';
import namingRealPlacesJson from '../../../data/naming/real_places.json';
import namingLandmarksJson from '../../../data/naming/landmarks.json';
import raceTemplatesJson from '../../../data/calendar/g1.json';
import patternGbIeJson from '../../../data/calendar/pattern_gb_ie.json';
import patternFrDeItJson from '../../../data/calendar/pattern_fr_de_it.json';
import g1ExtraJson from '../../../data/calendar/g1_extra.json';
import seriesJson from '../../../data/calendar/series.json';
import salesJson from '../../../data/sales/sales.json';
import { getRacecourse as findRacecourse, loadRacecourses } from '../course/load';
import { NAME_COUNTRIES, type CountryNamePool, type NameCountry, type NamePools } from '../people/names';
import type { PeopleStaticData, PlacesData } from '../people/generate';
import type { NamePool } from '../race/sampleField';
import { normalizePlaceToken, normalizeName } from '../naming/validate';
import { NAME_MAX_LENGTH } from '../config/naming';
import type {
  ForeignLanguage,
  HistoricalField,
  HistoricalPerson,
  NamingData,
  NamingLexicon,
  NameSource,
  NameTemplate,
  OwnerNamingStyle,
} from '../naming/types';
import type {
  NickEntry,
  Race,
  RaceTemplate,
  Racecourse,
  RealStallionRecord,
  SalesDataFile,
  SeriesDefinition,
  SireLine,
  StallionNameTable,
} from '../types';

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

/**
 * 고정 일정 레이스 템플릿: G1(data/calendar/g1.json, 추가 G1 g1_extra.json) + G2·G3·리스티드·헤리티지 핸디캡(pattern_*.json).
 * cardOrder 는 같은 개최일 안의 정렬 키(G1 은 10 단위, 그 사이에 하위 등급을 끼운다).
 */
const RACE_TEMPLATES: RaceTemplate[] = [
  ...(raceTemplatesJson as RaceTemplate[]),
  ...(patternGbIeJson as RaceTemplate[]),
  ...(patternFrDeItJson as RaceTemplate[]),
  ...(g1ExtraJson as RaceTemplate[]),
];

export function getRaceTemplates(): RaceTemplate[] {
  return RACE_TEMPLATES;
}

/** 시리즈 정의 (data/calendar/series.json). A4a 가 채운다. 현재는 빈 배열일 수 있다. */
export function getSeriesDefinitions(): SeriesDefinition[] {
  return seriesJson as SeriesDefinition[];
}

/** 가상 이름 풀 (data/names.json). */
export function getNamePool(): NamePool {
  return NAME_POOL;
}

/** 세일 캘린더 정적 데이터 (data/sales/sales.json: 가상 회사·세일·북). */
export function getSalesData(): SalesDataFile {
  return salesJson as SalesDataFile;
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

const NAME_SOURCES: readonly NameSource[] = [
  'pedigree',
  'tribute',
  'historical',
  'place',
  'culture',
  'foreign',
  'abstract',
  'ownerStyle',
];
const NAME_TEMPLATES: readonly NameTemplate[] = [
  'single',
  'modifierNoun',
  'possessive',
  'phrase',
  'verb',
  'prefix',
  'joined',
];
const FOREIGN_LANGUAGES: readonly ForeignLanguage[] = ['fr', 'it', 'de', 'ar'];
const HISTORICAL_FIELDS: readonly HistoricalField[] = ['artist', 'writer', 'composer', 'explorer', 'scientist'];

function namingFail(message: string): never {
  throw new Error(`명명 데이터 형식 오류: ${message}`);
}

function namingStrings(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v !== '')) {
    namingFail(`${where} 는 비어 있지 않은 문자열 배열이어야 한다`);
  }
  return value as string[];
}

function namingRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    namingFail(`${where} 는 객체여야 한다`);
  }
  return value as Record<string, unknown>;
}

/** 키 목록에 맞는 0 이상 수 레코드. 합계가 0 이면 실패(가중치 전부 0 은 고를 수 없다). */
function namingWeights<K extends string>(value: unknown, keys: readonly K[], where: string): Record<K, number> {
  const obj = namingRecord(value, where);
  const out = {} as Record<K, number>;
  let total = 0;
  for (const key of keys) {
    const w = obj[key];
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
      namingFail(`${where}.${key} 는 0 이상의 수여야 한다`);
    }
    out[key] = w;
    total += w;
  }
  if (total <= 0) {
    namingFail(`${where} 의 가중치 합은 0 보다 커야 한다`);
  }
  return out;
}

/** lexicon.en.json 원본을 검증해 NamingLexicon 으로 바꾼다. */
export function parseNamingLexicon(raw: unknown): NamingLexicon {
  const o = namingRecord(raw, 'lexicon');
  if (o['version'] !== 1) {
    namingFail('lexicon.version 은 1 이어야 한다');
  }
  const foreignRaw = namingRecord(o['foreign'], 'lexicon.foreign');
  const foreign = {} as Record<ForeignLanguage, string[]>;
  for (const lang of FOREIGN_LANGUAGES) {
    foreign[lang] = namingStrings(foreignRaw[lang], `lexicon.foreign.${lang}`);
  }
  const assocRaw = namingRecord(o['associations'], 'lexicon.associations');
  const associations: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(assocRaw)) {
    associations[key] = namingStrings(list, `lexicon.associations.${key}`);
  }
  const syl = namingRecord(o['syllables'], 'lexicon.syllables');
  return {
    version: 1,
    modifiers: namingStrings(o['modifiers'], 'lexicon.modifiers'),
    nouns: namingStrings(o['nouns'], 'lexicon.nouns'),
    verbs: namingStrings(o['verbs'], 'lexicon.verbs'),
    abstract: namingStrings(o['abstract'], 'lexicon.abstract'),
    places: namingStrings(o['places'], 'lexicon.places'),
    foreign,
    culture: namingStrings(o['culture'], 'lexicon.culture'),
    phrases: namingStrings(o['phrases'], 'lexicon.phrases'),
    associations,
    syllables: {
      onsets: namingStrings(syl['onsets'], 'lexicon.syllables.onsets'),
      vowels: namingStrings(syl['vowels'], 'lexicon.syllables.vowels'),
      codas: namingStrings(syl['codas'], 'lexicon.syllables.codas'),
    },
    stopwords: namingStrings(o['stopwords'], 'lexicon.stopwords'),
  };
}

/** owner-styles.json 원본을 검증해 스타일 목록으로 바꾼다. */
export function parseOwnerStyles(raw: unknown): OwnerNamingStyle[] {
  const o = namingRecord(raw, 'owner-styles');
  if (o['version'] !== 1 || !Array.isArray(o['styles']) || o['styles'].length === 0) {
    namingFail('owner-styles 는 version 1 과 비어 있지 않은 styles 배열이어야 한다');
  }
  return (o['styles'] as unknown[]).map((item, i) => {
    const where = `owner-styles.styles[${i}]`;
    const s = namingRecord(item, where);
    if (typeof s['id'] !== 'string' || s['id'] === '' || typeof s['label'] !== 'string') {
      namingFail(`${where} 의 id·label 은 문자열이어야 한다`);
    }
    const style: OwnerNamingStyle = {
      id: s['id'] as string,
      label: s['label'] as string,
      sourceWeights: namingWeights(s['sourceWeights'], NAME_SOURCES, `${where}.sourceWeights`),
      templateWeights: namingWeights(s['templateWeights'], NAME_TEMPLATES, `${where}.templateWeights`),
    };
    if (s['prefix'] !== undefined) {
      if (typeof s['prefix'] !== 'string' || s['prefix'] === '') {
        namingFail(`${where}.prefix 는 빈 문자열이 아닌 문자열이어야 한다`);
      }
      style.prefix = s['prefix'];
    }
    return style;
  });
}

/** historical.json 원본을 검증해 역사 인물 목록으로 바꾼다. */
export function parseHistoricalPeople(raw: unknown): HistoricalPerson[] {
  const o = namingRecord(raw, 'historical');
  if (!Array.isArray(o['people']) || o['people'].length === 0) {
    namingFail('historical.people 은 비어 있지 않은 배열이어야 한다');
  }
  return (o['people'] as unknown[]).map((item, i) => {
    const where = `historical.people[${i}]`;
    const p = namingRecord(item, where);
    if (typeof p['name'] !== 'string' || p['name'] === '') {
      namingFail(`${where}.name 은 문자열이어야 한다`);
    }
    if (!HISTORICAL_FIELDS.includes(p['field'] as HistoricalField)) {
      namingFail(`${where}.field 가 허용 분야가 아니다`);
    }
    if (typeof p['deathYear'] !== 'number') {
      namingFail(`${where}.deathYear 는 숫자여야 한다`);
    }
    return { name: p['name'] as string, field: p['field'] as HistoricalField, deathYear: p['deathYear'] as number };
  });
}

/** real_places.json 원본을 검증해 지명 목록과 차단 지명 토큰 집합으로 바꾼다. */
export function parseRealPlaces(raw: unknown): Pick<NamingData, 'realPlaces' | 'blockedPlaceTokens'> {
  const o = namingRecord(raw, 'real_places');
  if (o['version'] !== 1) {
    namingFail('real_places.version 은 1 이어야 한다');
  }
  const blockedPlaceTokens = new Set<string>();
  for (const token of namingStrings(o['blockedTokens'], 'real_places.blockedTokens')) {
    const normalized = normalizePlaceToken(token);
    if (normalized !== '') {
      blockedPlaceTokens.add(normalized);
    }
  }
  return {
    realPlaces: {
      countries: namingStrings(o['countries'], 'real_places.countries'),
      regions: namingStrings(o['regions'], 'real_places.regions'),
      cities: namingStrings(o['cities'], 'real_places.cities'),
    },
    blockedPlaceTokens,
  };
}

/**
 * landmarks.json 원본을 검증해 명승고적 이름 목록과 작품 제목 목록으로 바꾼다.
 * 이름이 보호 명단(normalizeName 집합)에 있는 항목은 뺀다. 공백 포함 18자를 넘는 제목은 붙여 쓴 길이가 18자 이하일 때만 넣는다.
 * 빈 목록은 허용한다(생성기가 그 출처를 건너뛴다).
 */
export function parseLandmarks(raw: unknown, protectedNames: ReadonlySet<string>): Pick<NamingData, 'landmarks' | 'workTitles'> {
  const o = namingRecord(raw, 'landmarks');
  if (o['version'] !== 1 || !Array.isArray(o['landmarks']) || !Array.isArray(o['works'])) {
    namingFail('landmarks 는 version 1 과 landmarks·works 배열을 가져야 한다');
  }
  const pickNames = (list: unknown[], where: string): string[] =>
    list
      .map((item, i) => {
        const entry = namingRecord(item, `${where}[${i}]`);
        if (typeof entry['name'] !== 'string' || entry['name'] === '') {
          namingFail(`${where}[${i}].name 은 빈 문자열이 아닌 문자열이어야 한다`);
        }
        return entry['name'] as string;
      })
      .filter((name) => !protectedNames.has(normalizeName(name)))
      // 공백 포함 18자 넘는 제목은 붙여 쓴 길이가 18자 이하일 때만 넣는다(joinedOnly 필드 없이 길이로 판정)
      .filter((name) => name.length <= NAME_MAX_LENGTH || name.replace(/\s+/g, '').length <= NAME_MAX_LENGTH);
  return {
    landmarks: pickNames(o['landmarks'] as unknown[], 'landmarks.landmarks'),
    workTitles: pickNames(o['works'] as unknown[], 'landmarks.works'),
  };
}

/**
 * 명명 데이터 묶음을 검증해 만든다. 보호 명단은 protected.json 이름과 실명 종마 이름을
 * 합쳐 normalizeName 한 Set 이다. 테스트에서 직접 호출할 수 있게 export 한다.
 */
export function parseNamingData(
  lexicon: unknown,
  styles: unknown,
  protectedFile: unknown,
  historical: unknown,
  stallionNames: unknown,
  realPlaces: unknown,
  landmarks: unknown,
): NamingData {
  const protectedList = namingStrings(namingRecord(protectedFile, 'protected')['names'], 'protected.names');
  const stallionList = namingStrings(Object.values(namingRecord(stallionNames, 'stallions/names')), 'stallions/names');
  const protectedNames = new Set<string>();
  for (const name of [...protectedList, ...stallionList]) {
    const normalized = normalizeName(name);
    if (normalized !== '') {
      protectedNames.add(normalized);
    }
  }
  return {
    lexicon: parseNamingLexicon(lexicon),
    styles: parseOwnerStyles(styles),
    protectedNames,
    historical: parseHistoricalPeople(historical),
    ...parseRealPlaces(realPlaces),
    ...parseLandmarks(landmarks, protectedNames),
  };
}

/** 이름 생성 정적 데이터 (data/naming/*.json + data/stallions/names.json). 검증 후 한 번만 만든다. */
let cachedNamingData: NamingData | null = null;

export function getNamingData(): NamingData {
  if (cachedNamingData === null) {
    cachedNamingData = parseNamingData(
      namingLexiconJson,
      namingStylesJson,
      namingProtectedJson,
      namingHistoricalJson,
      stallionNamesJson,
      namingRealPlacesJson,
      namingLandmarksJson,
    );
  }
  return cachedNamingData;
}
