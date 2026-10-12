/** 경주마 이름 검증·생성 상수. 등록 규칙 한도와 생성 시도 횟수·확률. 초기값이며 Opus 가 조정한다. */

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
