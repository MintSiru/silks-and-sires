import type { Rng } from '../types';
import { cyrb128 } from '../rng/hash';
import {
  AR_PREFIX_CONNECTOR_CHANCE,
  ASSOCIATION_CHANCE,
  JOINED_MAX_WORDS,
  JOINED_MIN_WORDS,
  KEYWORD_MIN_LENGTH,
  LANDMARK_SHARE,
  NAME_CANDIDATE_ATTEMPTS,
  NAME_FALLBACK_ATTEMPTS,
  NAME_MAX_LENGTH,
  NATIVE_CONNECTOR,
  NATIVE_SHARE,
  NATIVE_TEMPLATE_WEIGHTS,
  REAL_PLACE_SHARE,
  TITLE_JOINED_CHANCE,
  WORD_AS_NOUN_CHANCE,
  WORK_TITLE_SHARE,
  type NativeLanguage,
  type NativeTemplate,
} from '../config/naming';
import { makeSyllableWord } from './syllables';
import { hasBlockedPlaceToken, normalizeName, validateHorseName } from './validate';
import type {
  ForeignLanguage,
  HistoricalField,
  NameCandidate,
  NameRegistry,
  NameSource,
  NameTemplate,
  NamingContext,
  NamingData,
  NamingLexicon,
  OwnerNamingStyle,
} from './types';

/** 구절 틀의 자리 표시 종류 */
type PhraseSlot = 'N' | 'M' | 'P' | 'V';

const ALL_TEMPLATES: readonly NameTemplate[] = ['single', 'modifierNoun', 'possessive', 'phrase', 'verb', 'prefix', 'joined'];

/** 출처별로 쓸 수 있는 구조. 역사 인물·게임 속 인물의 성은 한 단어·소유격·붙여 쓰기에만 쓴다. */
const ALLOWED_TEMPLATES: Record<NameSource, readonly NameTemplate[]> = {
  pedigree: ALL_TEMPLATES,
  place: ALL_TEMPLATES,
  culture: ALL_TEMPLATES,
  foreign: ALL_TEMPLATES,
  abstract: ALL_TEMPLATES,
  ownerStyle: ALL_TEMPLATES,
  historical: ['single', 'possessive', 'joined'],
  tribute: ['single', 'possessive'],
};

/** 구절 틀에서 출처 단어를 넣을 자리의 우선순위 (역사 인물·게임 속 인물은 구절 틀을 쓰지 않는다) */
const PHRASE_SLOT_PRIORITY: Record<NameSource, readonly PhraseSlot[]> = {
  pedigree: ['N', 'M', 'P', 'V'],
  place: ['P', 'N'],
  culture: ['N', 'M'],
  foreign: ['N', 'M'],
  abstract: ['N', 'M', 'V'],
  ownerStyle: ['N', 'M', 'P'],
  historical: [],
  tribute: [],
};

/** 소유격 형식. 'ofPlace' 는 장소 출처 전용("{noun} of {place}"). */
type PossessiveForm = 'wordFirst' | 'wordSecond' | 'ofPlace';
const POSSESSIVE_FORMS: Record<NameSource, readonly PossessiveForm[]> = {
  pedigree: ['wordFirst', 'wordSecond'],
  place: ['ofPlace', 'wordFirst'],
  culture: ['wordFirst', 'wordSecond'],
  foreign: ['wordFirst', 'wordSecond'],
  abstract: ['wordFirst', 'wordSecond'],
  ownerStyle: ['wordFirst', 'wordSecond'],
  historical: ['wordFirst'],
  tribute: ['wordFirst'],
};

/** 영어 모드의 외국어 출처 언어. ar 은 모국어 모드(아랍 계열 마주)에서만 쓴다. */
const FOREIGN_LANGUAGES: readonly Exclude<ForeignLanguage, 'ar'>[] = ['fr', 'it', 'de'];
const FOREIGN_LABEL: Record<ForeignLanguage, string> = { fr: '프랑스어', it: '이탈리아어', de: '독일어', ar: '아랍어' };
/** 모국어 모드 구조 가중치를 고를 때의 순서 */
/**
 * 연결어 붙이기. 프랑스어 de·이탈리아어 di 는 모음(과 묵음 h)으로 시작하는 단어 앞에서
 * 축약한다(Givre de Aube → Givre d'Aube, Melodia di Aquila → Melodia d'Aquila).
 */
function joinConnector(first: string, conn: string, second: string): string {
  const elides = (conn === 'de' || conn === 'di') && /^[aeiouyh]/i.test(second);
  return elides ? `${first} d'${second}` : `${first} ${conn} ${second}`;
}

const NATIVE_TEMPLATE_ORDER: readonly NativeTemplate[] = ['single', 'pair', 'connector'];
const FIELD_LABEL: Record<HistoricalField, string> = {
  artist: '화가·조각가',
  writer: '작가',
  composer: '작곡가',
  explorer: '탐험가',
  scientist: '과학자',
};
const PLACEHOLDER = /\{([NMPV])\}/g;

/** 혈통 키워드 한 개와 어느 부모에서 왔는지 */
interface Keyword {
  word: string;
  role: string;
  parent: string;
}

/** 명승고적·작품 제목 한 개. joined 는 공백을 뺀 붙여 쓰기 형태(NAME_MAX_LENGTH 를 넘으면 null). */
interface TitleEntry {
  text: string;
  joined: string | null;
}

/** 명승고적 목록과 작품 제목 목록 (보호 명단·차단 지명 토큰과 겹치는 항목은 뺀 뒤) */
interface TitlePools {
  place: readonly TitleEntry[];
  culture: readonly TitleEntry[];
}

/** suggestNames 한 번 동안 쓰는 준비물 */
interface Env {
  ctx: NamingContext;
  data: NamingData;
  lex: NamingLexicon;
  keywords: readonly Keyword[];
  /** 소문자 키워드 → 연상어 */
  associations: ReadonlyMap<string, readonly string[]>;
  /** 실제 지명 전체(국가·지역·도시) */
  realPlaces: readonly string[];
  /** 명승고적·작품 제목 풀 */
  titles: TitlePools;
}

/**
 * 출처 단어 한 개와 이유 문장. title 이 있으면 명승고적·작품 제목을 고른 것이다:
 * 템플릿을 무시하고 title 로 이름을 만든다(word 는 원문 제목).
 */
interface SourcePick {
  word: string;
  note: string;
  title?: TitleEntry;
}

/** 가중치 항목 목록에서 하나를 고른다. 가중치 0 이하는 제외. 전부 0 이면 null. */
function pickWeighted<K extends string>(rng: Rng, entries: ReadonlyArray<readonly [K, number]>): K | null {
  let total = 0;
  for (const [, w] of entries) {
    if (w > 0) {
      total += w;
    }
  }
  if (total <= 0) {
    return null;
  }
  let r = rng.next() * total;
  let last: K | null = null;
  for (const [key, w] of entries) {
    if (w <= 0) {
      continue;
    }
    last = key;
    if (r < w) {
      return key;
    }
    r -= w;
  }
  return last;
}

/** 이름에서 혈통 키워드를 뽑는다. 불용어·짧은 조각·중복 제외, 소유격 's 는 뗀다. */
/** 혈통 키워드로 쓸 수 있는 일반 단어(어휘 사전·연상어 사전에 있는 단어). 소문자. */
const generalWordCache = new WeakMap<NamingLexicon, Set<string>>();
function generalWords(lex: NamingLexicon): Set<string> {
  const cached = generalWordCache.get(lex);
  if (cached !== undefined) return cached;
  const words = [
    ...lex.modifiers, ...lex.nouns, ...lex.verbs, ...lex.abstract, ...lex.places, ...lex.culture,
    ...lex.foreign.fr, ...lex.foreign.it, ...lex.foreign.de,
    ...Object.keys(lex.associations), ...Object.values(lex.associations).flat(),
  ];
  const set = new Set(words.map((w) => w.toLowerCase()));
  generalWordCache.set(lex, set);
  return set;
}

/**
 * 부모 이름에서 혈통 키워드를 뽑는다. 불용어를 빼고, **일반 단어만** 남긴다:
 * 고유명사(실존 인물·지명일 수 있는 종마 이름 전체, 예: Churchill, Kingman)나 축약 조각(d'Oro → dOro)이
 * 새 이름에 그대로 들어가지 않게 하기 위해서다(CLAUDE.md 원칙 1).
 */
export function extractKeywords(name: string, lex: NamingLexicon): string[] {
  const stop = new Set(lex.stopwords.map((w) => w.toLowerCase()));
  const general = generalWords(lex);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of name.split(/\s+/)) {
    if (/[^A-Za-z']/.test(raw) || /'(?!s$)/i.test(raw)) {
      continue;
    }
    const word = raw.replace(/'s$/i, '');
    if (word.length < KEYWORD_MIN_LENGTH) {
      continue;
    }
    const key = word.toLowerCase();
    const isGeneral = general.has(key) || (key.endsWith('s') && general.has(key.slice(0, -1)));
    if (stop.has(key) || seen.has(key) || !isGeneral) {
      continue;
    }
    seen.add(key);
    out.push(word);
  }
  return out;
}

/** NamingData 에서만 파생되는 값: 연상 맵(소문자 키), 실제 지명 전체 목록, 명승고적·작품 제목 풀 */
interface DerivedNaming {
  associations: ReadonlyMap<string, readonly string[]>;
  realPlaces: readonly string[];
  titles: TitlePools;
}

/** 데이터 객체별 파생 값 캐시. 같은 NamingData 면 한 번만 만든다(말 한 마리마다 다시 만들지 않도록). */
const derivedCache = new WeakMap<NamingData, DerivedNaming>();

function derivedOf(data: NamingData): DerivedNaming {
  const hit = derivedCache.get(data);
  if (hit !== undefined) {
    return hit;
  }
  const associations = new Map<string, string[]>();
  for (const [key, list] of Object.entries(data.lexicon.associations)) {
    const k = key.toLowerCase();
    associations.set(k, [...(associations.get(k) ?? []), ...list]);
  }
  // 차단 지명 토큰이 든 제목은 풀에서 뺀다. 붙여 쓴 형태는 여기서 한 번만 만든다(이름마다 다시 만들지 않는다).
  const toTitleEntries = (names: readonly string[]): TitleEntry[] =>
    names
      .filter((text) => !hasBlockedPlaceToken(text, data.blockedPlaceTokens))
      .map((text) => {
        const joined = joinWords(text);
        return { text, joined: joined.length <= NAME_MAX_LENGTH ? joined : null };
      });
  const derived: DerivedNaming = {
    associations,
    realPlaces: [...data.realPlaces.countries, ...data.realPlaces.regions, ...data.realPlaces.cities],
    titles: { place: toTitleEntries(data.landmarks), culture: toTitleEntries(data.workTitles) },
  };
  derivedCache.set(data, derived);
  return derived;
}

function buildEnv(ctx: NamingContext, data: NamingData): Env {
  const keywords: Keyword[] = [];
  const addParent = (parentName: string | null, role: string): void => {
    if (parentName === null) {
      return;
    }
    for (const word of extractKeywords(parentName, data.lexicon)) {
      keywords.push({ word, role, parent: parentName });
    }
  };
  addParent(ctx.sireName, '아비');
  addParent(ctx.damName, '어미');

  const { associations, realPlaces, titles } = derivedOf(data);
  return { ctx, data, lex: data.lexicon, keywords, associations, realPlaces, titles };
}

/** 소유격 표기: s 로 끝나면 's 대신 ' 만 붙인다. */
function possessive(word: string): string {
  return /s$/i.test(word) ? `${word}'` : `${word}'s`;
}

/** 역사 인물 이름의 성(마지막 단어). */
function surnameOf(name: string): string {
  const parts = name.split(' ');
  return parts[parts.length - 1] ?? name;
}

function pedigreeWord(env: Env, rng: Rng): SourcePick {
  const kw = rng.pick(env.keywords);
  const alternatives = env.associations.get(kw.word.toLowerCase()) ?? [];
  if (alternatives.length > 0 && rng.chance(ASSOCIATION_CHANCE)) {
    const w = rng.pick(alternatives);
    return { word: w, note: `${kw.role} ${kw.parent} 의 '${kw.word}' 연상어 '${w}'` };
  }
  return { word: kw.word, note: `${kw.role} ${kw.parent} 의 '${kw.word}' 에서` };
}

/**
 * 제목 풀에서 확률 share 로 하나를 고른다. 풀이 비어 있으면 난수를 쓰지 않는다(빈 풀이면 기존 결과와 같다).
 */
function pickTitleEntry(pool: readonly TitleEntry[], share: number, rng: Rng): TitleEntry | null {
  return pool.length > 0 && rng.chance(share) ? rng.pick(pool) : null;
}

/** 명승고적·작품 제목을 고른 출처 단어. 이유 문장은 kind 에 따라 'Swan Lake' 형태로 단다. */
function titlePick(entry: TitleEntry, kind: '명승고적' | '작품 제목'): SourcePick {
  return { word: entry.text, note: `${kind} '${entry.text}' 에서`, title: entry };
}

/** 출처에 맞는 단어 하나와 이유 문장을 고른다. */
function sourceWord(source: NameSource, env: Env, rng: Rng): SourcePick {
  const lex = env.lex;
  switch (source) {
    case 'pedigree':
      return pedigreeWord(env, rng);
    case 'tribute': {
      const w = rng.pick(env.ctx.tributeNames);
      return { word: w, note: `게임 속 가상 인물 '${w}' 의 성` };
    }
    case 'historical': {
      const person = rng.pick(env.data.historical);
      const w = surnameOf(person.name);
      return { word: w, note: `${FIELD_LABEL[person.field]} 역사 인물의 성 '${w}'` };
    }
    case 'place': {
      // 실제 지명을 먼저 추첨한다. 실제 지명이 아닌 경우에만 명승고적을 추첨하고, 나머지는 기존 어휘 장소.
      if (rng.chance(REAL_PLACE_SHARE)) {
        const real = rng.pick(env.realPlaces);
        return { word: real, note: `실제 지명 '${real}'` };
      }
      const landmark = pickTitleEntry(env.titles.place, LANDMARK_SHARE, rng);
      if (landmark !== null) {
        return titlePick(landmark, '명승고적');
      }
      const w = rng.pick(lex.places);
      return { word: w, note: `지형·지명 어휘 '${w}'` };
    }
    case 'culture': {
      const work = pickTitleEntry(env.titles.culture, WORK_TITLE_SHARE, rng);
      if (work !== null) {
        return titlePick(work, '작품 제목');
      }
      const w = rng.pick(lex.culture);
      return { word: w, note: `음악·문학 용어 '${w}'` };
    }
    case 'foreign': {
      const lang = rng.pick(FOREIGN_LANGUAGES);
      const w = rng.pick(lex.foreign[lang]);
      return { word: w, note: `${FOREIGN_LABEL[lang]} 단어 '${w}'` };
    }
    case 'abstract': {
      const w = rng.pick(lex.abstract);
      return { word: w, note: `추상어 '${w}'` };
    }
    case 'ownerStyle': {
      const w = makeSyllableWord(lex, rng);
      return { word: w, note: `마주 고유 음절 조합 '${w}'` };
    }
  }
}

function randomWord(code: PhraseSlot, lex: NamingLexicon, rng: Rng): string {
  switch (code) {
    case 'N':
      return rng.pick(lex.nouns);
    case 'M':
      return rng.pick(lex.modifiers);
    case 'P':
      return rng.pick(lex.places);
    case 'V':
      return rng.pick(lex.verbs);
  }
}

/**
 * 구절 틀의 자리 표시를 채운다. 우선순위 순서에서 처음 나오는 자리 종류의 첫 자리에 출처 단어를 넣고,
 * 나머지 자리는 어휘에서 고른다. 맞는 자리가 없으면 null.
 */
function fillPhrase(phrase: string, priority: readonly PhraseSlot[], word: string, lex: NamingLexicon, rng: Rng): string | null {
  const slot = priority.find((code) => phrase.includes(`{${code}}`));
  if (slot === undefined) {
    return null;
  }
  let placed = false;
  return phrase.replace(PLACEHOLDER, (_match: string, code: string) => {
    const kind = code as PhraseSlot;
    if (!placed && kind === slot) {
      placed = true;
      return word;
    }
    return randomWord(kind, lex, rng);
  });
}

/** 붙여 쓰기: 공백 제거, 첫 글자만 대문자, 나머지 소문자. */
function joinWords(text: string): string {
  const joined = text.replace(/\s+/g, '').toLowerCase();
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** 출처 단어를 구조 틀에 넣어 이름 문자열을 만든다. 맞지 않으면 null. */
function buildName(template: NameTemplate, source: NameSource, word: string, env: Env, rng: Rng): string | null {
  const lex = env.lex;
  switch (template) {
    case 'single':
      return word;
    case 'modifierNoun':
      return rng.chance(WORD_AS_NOUN_CHANCE)
        ? `${rng.pick(lex.modifiers)} ${word}`
        : `${word} ${rng.pick(lex.nouns)}`;
    case 'possessive': {
      const form = rng.pick(POSSESSIVE_FORMS[source]);
      if (form === 'ofPlace') {
        return `${rng.pick(lex.nouns)} of ${word}`;
      }
      if (form === 'wordFirst') {
        return `${possessive(word)} ${rng.pick(lex.nouns)}`;
      }
      return `${possessive(rng.pick(lex.nouns))} ${word}`;
    }
    case 'phrase':
      return fillPhrase(rng.pick(lex.phrases), PHRASE_SLOT_PRIORITY[source], word, lex, rng);
    case 'verb':
      return `${rng.pick(lex.verbs)} ${word}`;
    case 'prefix':
      return `${env.ctx.style.prefix ?? ''} ${word}`;
    case 'joined': {
      let text: string | null;
      if (source === 'historical' || source === 'tribute') {
        text = `${word} The ${rng.pick(lex.nouns)}`;
      } else {
        text = fillPhrase(rng.pick(lex.phrases), PHRASE_SLOT_PRIORITY[source], word, lex, rng);
      }
      if (text === null) {
        return null;
      }
      // 붙이기 전에 검사한다: "Ascot Lady" 는 "AscotLady" 가 되면 단어 검사를 피하므로
      if (hasBlockedPlaceToken(text, env.data.blockedPlaceTokens)) {
        return null;
      }
      const wordCount = text.split(' ').length;
      if (wordCount < JOINED_MIN_WORDS || wordCount > JOINED_MAX_WORDS) {
        return null;
      }
      return joinWords(text);
    }
  }
}

/** 단어 목록에서 first 와 다른 단어를 하나 고른다. 목록이 한 단어뿐이면 그 단어를 쓴다. */
function pickOther(words: readonly string[], first: string, rng: Rng): string {
  const rest = words.filter((w) => w !== first);
  return rng.pick(rest.length > 0 ? rest : words);
}

/**
 * 모국어 모드 후보 한 장. 마주 언어의 외국어 단어만으로 이름을 만든다(출처 foreign).
 * single = 단어 하나, pair = 단어 둘, connector = 연결어가 든 구조. 가중치는 NATIVE_TEMPLATE_WEIGHTS.
 * 구조 종류는 NameTemplate 으로 옮긴다: single → single, pair → modifierNoun, connector → possessive.
 * ar 연결 구조는 "Al {word}" 또는 "{word} Al {word}" 중 하나다.
 */
function nativeCandidate(lang: NativeLanguage, env: Env, rng: Rng): NameCandidate | null {
  const weights = NATIVE_TEMPLATE_WEIGHTS[lang];
  const kind = pickWeighted(
    rng,
    NATIVE_TEMPLATE_ORDER.map((t) => [t, weights[t]] as const),
  );
  if (kind === null) {
    return null;
  }
  const words = env.lex.foreign[lang];
  const label = FOREIGN_LABEL[lang];
  const first = rng.pick(words);
  switch (kind) {
    case 'single':
      return { name: first, template: 'single', source: 'foreign', note: `${label} 단어 '${first}'` };
    case 'pair': {
      const second = pickOther(words, first, rng);
      return {
        name: `${first} ${second}`,
        template: 'modifierNoun',
        source: 'foreign',
        note: `${label} 단어 '${first}', '${second}'`,
      };
    }
    case 'connector': {
      const conn = NATIVE_CONNECTOR[lang];
      if (lang === 'ar' && rng.chance(AR_PREFIX_CONNECTOR_CHANCE)) {
        return {
          name: `${conn} ${first}`,
          template: 'possessive',
          source: 'foreign',
          note: `${label} 단어 '${first}' 앞에 연결어 '${conn}'`,
        };
      }
      const second = pickOther(words, first, rng);
      return {
        name: joinConnector(first, conn, second),
        template: 'possessive',
        source: 'foreign',
        note: `${label} 단어 '${first}', '${second}' 사이 연결어 '${conn}'`,
      };
    }
  }
}

function isSourceAvailable(source: NameSource, env: Env): boolean {
  switch (source) {
    case 'pedigree':
      return env.keywords.length > 0;
    case 'tribute':
      return env.ctx.tributeNames.length > 0;
    case 'historical':
      return env.data.historical.length > 0;
    default:
      return true;
  }
}

/**
 * 후보 한 장의 초안(검증 전). 출처·구조를 가중치로 고르고 이름을 만든다.
 * forcedSource 가 있으면 출처 가중치 추첨을 건너뛰고 그 출처로 만든다(혈통 보충용).
 */
function sampleCandidate(env: Env, rng: Rng, forcedSource?: NameSource): NameCandidate | null {
  const style = env.ctx.style;
  let source: NameSource | null;
  if (forcedSource !== undefined) {
    source = forcedSource;
  } else {
    // 모국어 모드 추첨. en 은 NATIVE_SHARE 가 0 이라 난수를 쓰지 않는다(영어 모드 결과 유지).
    const lang = env.ctx.language;
    if (lang !== 'en' && NATIVE_SHARE[lang] > 0 && rng.chance(NATIVE_SHARE[lang])) {
      return nativeCandidate(lang, env, rng);
    }
    const sources = (Object.keys(ALLOWED_TEMPLATES) as NameSource[]).filter((s) => isSourceAvailable(s, env));
    source = pickWeighted(
      rng,
      sources.map((s) => [s, style.sourceWeights[s]] as const),
    );
  }
  if (source === null) {
    return null;
  }
  const hasPrefix = style.prefix !== undefined && style.prefix !== '';
  const templates = ALLOWED_TEMPLATES[source].filter((t) => t !== 'prefix' || hasPrefix);
  const template = pickWeighted(
    rng,
    templates.map((t) => [t, style.templateWeights[t]] as const),
  );
  if (template === null) {
    return null;
  }
  const pick = sourceWord(source, env, rng);
  if (pick.title !== undefined) {
    return titleCandidate(source, pick.title, pick.note, rng);
  }
  const name = buildName(template, source, pick.word, env, rng);
  if (name === null) {
    return null;
  }
  return { name, template, source, note: pick.note };
}

/**
 * 명승고적·작품 제목 후보. 골라 둔 템플릿은 무시한다. 공백 포함 NAME_MAX_LENGTH 를 넘는 제목은 항상 붙여 쓴다.
 * 그 밖의 제목은 TITLE_JOINED_CHANCE 에 걸리고 붙여 쓴 길이가 NAME_MAX_LENGTH 이하면 붙여 쓴 형태('joined'),
 * 아니면 제목 그대로('single').
 */
function titleCandidate(source: NameSource, entry: TitleEntry, note: string, rng: Rng): NameCandidate | null {
  if (entry.text.length > NAME_MAX_LENGTH) {
    // 띄어 쓰면 등록 길이를 넘는 제목은 항상 붙여 쓴다(이때 rng.chance 를 부르지 않는다). 붙여도 길면 후보 없음.
    return entry.joined === null ? null : { name: entry.joined, template: 'joined', source, note };
  }
  if (rng.chance(TITLE_JOINED_CHANCE) && entry.joined !== null) {
    return { name: entry.joined, template: 'joined', source, note };
  }
  return { name: entry.text, template: 'single', source, note };
}

/**
 * 이름 후보를 count 개 만든다. 같은 시드·같은 입력이면 결과가 같다.
 * 후보 한 장마다 최대 NAME_CANDIDATE_ATTEMPTS 번 시도하며, 못 찾으면 거기서 멈춘다.
 * 모든 후보는 validateHorseName 을 통과하고 서로 중복되지 않는다.
 * 부모 키워드가 있고 count ≥ 2 인데 pedigree 후보가 하나도 없으면, 마지막 슬롯을 pedigree 출처로 다시 만든다.
 * 그 시도가 실패하면 원래 후보를 그대로 둔다. count 1(nameForHorse)에는 적용하지 않는다.
 */
export function suggestNames(
  ctx: NamingContext,
  data: NamingData,
  rng: Rng,
  count: number,
  registry: NameRegistry,
): NameCandidate[] {
  const env = buildEnv(ctx, data);
  const seen = new Set<string>();
  const out: NameCandidate[] = [];
  for (let slot = 0; slot < count; slot++) {
    let found: NameCandidate | null = null;
    for (let attempt = 0; attempt < NAME_CANDIDATE_ATTEMPTS && found === null; attempt++) {
      const cand = sampleCandidate(env, rng);
      if (cand === null) {
        continue;
      }
      const v = validateHorseName(cand.name, registry, data.protectedNames, data.blockedPlaceTokens);
      if (!v.ok || seen.has(v.normalized)) {
        continue;
      }
      seen.add(v.normalized);
      found = cand;
    }
    if (found === null) {
      break;
    }
    out.push(found);
  }

  if (count >= 2 && out.length === count && env.keywords.length > 0 && !out.some((c) => c.source === 'pedigree')) {
    const others = new Set(out.slice(0, -1).map((c) => normalizeName(c.name)));
    for (let attempt = 0; attempt < NAME_CANDIDATE_ATTEMPTS; attempt++) {
      const cand = sampleCandidate(env, rng, 'pedigree');
      if (cand === null) {
        continue;
      }
      const v = validateHorseName(cand.name, registry, data.protectedNames, data.blockedPlaceTokens);
      if (!v.ok || others.has(v.normalized)) {
        continue;
      }
      out[out.length - 1] = cand;
      break;
    }
  }
  return out;
}

/**
 * 말 한 마리의 이름. suggestNames(count 1) 의 첫 후보를 쓰고, 실패하면 음절 조합 단어를
 * 검증될 때까지 최대 NAME_FALLBACK_ATTEMPTS 번 뽑는다. 그래도 실패하면 throw.
 */
export function nameForHorse(ctx: NamingContext, data: NamingData, rng: Rng, registry: NameRegistry): string {
  const [first] = suggestNames(ctx, data, rng, 1, registry);
  if (first !== undefined) {
    return first.name;
  }
  for (let i = 0; i < NAME_FALLBACK_ATTEMPTS; i++) {
    const name = makeSyllableWord(data.lexicon, rng);
    if (validateHorseName(name, registry, data.protectedNames, data.blockedPlaceTokens).ok) {
      return name;
    }
  }
  throw new Error('이름을 만들 수 없다: 후보와 음절 조합이 모두 검증에 실패했다');
}

/**
 * 마주 id 해시로 명명 스타일을 고른다. 같은 마주는 항상 같은 스타일.
 * prefix 가 있으면 접두어를 가진 스타일 중에서 고르고, 그 스타일의 접두어를 주어진 값으로 바꾼 복사본을 돌려준다.
 */
export function pickOwnerStyle(ownerId: string, prefix: string | null, styles: readonly OwnerNamingStyle[]): OwnerNamingStyle {
  const hasPrefix = prefix !== null && prefix !== '';
  const pool = hasPrefix ? styles.filter((s) => s.prefix !== undefined) : styles;
  if (pool.length === 0) {
    throw new Error('명명 스타일이 없다');
  }
  const [h] = cyrb128(ownerId);
  const style = pool[h % pool.length];
  if (style === undefined) {
    throw new Error('명명 스타일을 고를 수 없다');
  }
  return hasPrefix ? { ...style, prefix } : style;
}
