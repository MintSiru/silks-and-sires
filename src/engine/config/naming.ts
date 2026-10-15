/** 경주마 이름 검증·생성 상수. 등록 규칙 한도와 생성 시도 횟수·확률. 초기값이며 Opus 가 조정한다. */

import type { CountryCode } from '../types/common';
import type { NameLanguage } from '../naming/types';

/** 등록 규칙: 공백 포함 최대 글자 수 */
export const NAME_MAX_LENGTH = 18;
/** 등록 규칙: 최대 음절 수 (모음 묶음 기준 근사) */
export const NAME_MAX_SYLLABLES = 7;
/** 음절 셈: 단어당 최소 음절 수 */
export const MIN_SYLLABLES_PER_WORD = 1;
/** 음절 셈: 이 글자 수 이상인 단어만 끝 묵음 e 를 뺀다 */
export const SILENT_E_MIN_WORD_LENGTH = 3;
/** 이니셜 판정: 글자 수가 이 값 이하인 단어만 이니셜로 본다 */
export const INITIAL_MAX_LETTERS = 1;

/** 후보 한 장당 최대 시도 횟수 */
export const NAME_CANDIDATE_ATTEMPTS = 50;
/** nameForHorse 의 음절 단어 대체 생성 최대 횟수 */
export const NAME_FALLBACK_ATTEMPTS = 200;

/** tributeNames 에 넣는 게임 속 인물(기수·조교사) 성의 최대 개수(정렬 후 앞쪽) */
export const TRIBUTE_NAME_LIMIT = 40;

/** makeSyllableWord 목표 음절 수 (양끝 포함) */
export const SYLLABLE_WORD_MIN = 2;
export const SYLLABLE_WORD_MAX = 3;
/** makeSyllableWord 가 목표 음절 수를 맞추려고 다시 뽑는 최대 횟수 */
export const SYLLABLE_WORD_ATTEMPTS = 60;
/** 음절 단위(onset+vowel[+coda]) 개수 범위 (양끝 포함) */
export const SYLLABLE_UNIT_MIN = 1;
export const SYLLABLE_UNIT_MAX = 2;
/** 음절 단위에 coda 를 붙일 확률 */
export const SYLLABLE_CODA_CHANCE = 0.6;

/** 혈통 키워드로 인정하는 최소 글자 수 (Mr 같은 짧은 조각 제외) */
export const KEYWORD_MIN_LENGTH = 3;
/** 혈통 키워드 대신 연상어 사전에서 고를 확률 (연상어가 있을 때만 적용) */
export const ASSOCIATION_CHANCE = 0.5;

/** modifierNoun 에서 출처 단어를 명사 자리에 넣을 확률 (나머지는 수식어 자리) */
export const WORD_AS_NOUN_CHANCE = 0.5;

/** joined(붙여 쓰기) 구절의 단어 수 범위 (양끝 포함) */
export const JOINED_MIN_WORDS = 3;
export const JOINED_MAX_WORDS = 4;

/* ---- M3-C7d: 마주 국적별 언어 · 실제 지명 ---- */

/** 모국어 모드 구조 종류. single=단어 하나, pair=단어 둘, connector=연결어가 든 구조 */
export type NativeTemplate = 'single' | 'pair' | 'connector';

/** 모국어 모드를 쓰는 언어(영어 제외) */
export type NativeLanguage = Exclude<NameLanguage, 'en'>;

/** 마주 국적 → 이름 언어. 여기 없는 국가는 영어. */
export const LANGUAGE_BY_COUNTRY: Record<CountryCode, NameLanguage> = {
  GB: 'en',
  IE: 'en',
  US: 'en',
  AU: 'en',
  CA: 'en',
  NZ: 'en',
  JP: 'en',
  HK: 'en',
  AR: 'en',
  ZA: 'en',
  CL: 'en',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  AE: 'ar',
};

/** 후보 하나를 모국어 모드로 만들 확률. en 은 0 (영어 모드만). */
export const NATIVE_SHARE: Record<NameLanguage, number> = {
  en: 0,
  fr: 0.7,
  de: 0.65,
  it: 0.7,
  ar: 0.85,
};

/** 모국어 모드 구조 가중치 */
export const NATIVE_TEMPLATE_WEIGHTS: Record<NativeLanguage, Record<NativeTemplate, number>> = {
  fr: { single: 0.45, pair: 0.25, connector: 0.3 },
  de: { single: 0.5, pair: 0.3, connector: 0.2 },
  it: { single: 0.45, pair: 0.25, connector: 0.3 },
  ar: { single: 0.75, pair: 0.1, connector: 0.15 },
};

/** 모국어 모드 연결어. ar 은 "Al {word}" 또는 "{word} Al {word}" 형태다. */
export const NATIVE_CONNECTOR: Record<NativeLanguage, string> = {
  fr: 'de',
  it: 'di',
  de: 'von',
  ar: 'Al',
};

/** ar 연결 구조에서 "Al {word}"(앞 연결) 형태를 고를 확률. 나머지는 "{word} Al {word}". */
export const AR_PREFIX_CONNECTOR_CHANCE = 0.5;

/** 장소 출처 후보에서 실제 지명(국가·지역·도시)을 쓸 확률. 나머지는 가상 지형어. */
export const REAL_PLACE_SHARE = 0.5;

/** 차단 지명 토큰의 최대 단어 수 (이름의 연속 단어 묶음 길이) */
export const BLOCKED_PLACE_MAX_WORDS = 3;

/* ---- M3-C7f2: 명승고적·작품 제목 출처 ---- */

/** 장소 출처에서 실제 지명이 뽑히지 않았을 때 명승고적 이름을 쓸 확률. 나머지는 어휘 장소(지형어·가상 지명). */
export const LANDMARK_SHARE = 0.2;
/** 문화 출처 후보에서 작품 제목을 쓸 확률. 나머지는 기존 음악·문학 용어. */
export const WORK_TITLE_SHARE = 0.15;
/** 명승고적·작품 제목을 고른 후보를 붙여 쓰기로 만들 확률 (붙여 쓴 길이가 NAME_MAX_LENGTH 이하일 때만) */
export const TITLE_JOINED_CHANCE = 0.3;
