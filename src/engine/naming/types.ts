/**
 * 경주마 이름 생성·검증 타입. 데이터 스키마: docs/specs/M3-C7a-naming-data.md.
 * 공용 타입(src/engine/types)과 분리되어 있다.
 */

/** 출처 키 (sourceWeights 키 8개) */
export type NameSource =
  | 'pedigree'
  | 'tribute'
  | 'historical'
  | 'place'
  | 'culture'
  | 'foreign'
  | 'abstract'
  | 'ownerStyle';

/** 구조 키 (templateWeights 키 7개) */
export type NameTemplate =
  | 'single'
  | 'modifierNoun'
  | 'possessive'
  | 'phrase'
  | 'verb'
  | 'prefix'
  | 'joined';

/** 외국어 사전 언어 */
export type ForeignLanguage = 'fr' | 'it' | 'de';

/** 어휘 사전 (data/naming/lexicon.en.json) */
export interface NamingLexicon {
  version: 1;
  /** 형용사·수식어 */
  modifiers: string[];
  /** 명사 */
  nouns: string[];
  /** 동사 원형 */
  verbs: string[];
  /** 추상어·한 단어 이름 */
  abstract: string[];
  /** 일반 지형어 + 가상 지명 */
  places: string[];
  /** 프·이·독 단어 */
  foreign: Record<ForeignLanguage, string[]>;
  /** 일반 음악·문학 용어 */
  culture: string[];
  /** 합성·구절 틀. {N}=명사, {M}=수식어, {P}=장소, {V}=동사 자리 */
  phrases: string[];
  /** 키워드 → 연상어 */
  associations: Record<string, string[]>;
  /** 음절 조합 재료 */
  syllables: { onsets: string[]; vowels: string[]; codas: string[] };
  /** 불용어 (The, Of, A …) */
  stopwords: string[];
}

/** 마주 명명 스타일 (data/naming/owner-styles.json 의 원소) */
export interface OwnerNamingStyle {
  id: string;
  /** 한국어 설명 */
  label: string;
  sourceWeights: Record<NameSource, number>;
  templateWeights: Record<NameTemplate, number>;
  /** 접두어(관명). 없으면 prefix 템플릿 가중치는 0 으로 취급한다. */
  prefix?: string;
}

/** 역사 인물 분야 */
export type HistoricalField = 'artist' | 'writer' | 'composer' | 'explorer' | 'scientist';

/** 역사 인물 한 명 (data/naming/historical.json) */
export interface HistoricalPerson {
  name: string;
  field: HistoricalField;
  deathYear: number;
}

/** 이름 생성기가 쓰는 데이터 묶음 (src/engine/data/staticData.ts 의 getNamingData 가 만든다) */
export interface NamingData {
  lexicon: NamingLexicon;
  styles: OwnerNamingStyle[];
  /** normalizeName 을 거친 보호 이름 집합 (protected.json + 실명 종마 이름) */
  protectedNames: ReadonlySet<string>;
  historical: HistoricalPerson[];
}

/** 생성 문맥 */
export interface NamingContext {
  /** 아비 이름. 없으면 null */
  sireName: string | null;
  /** 어미 이름. 없으면 null */
  damName: string | null;
  /** 마주 명명 스타일 (pickOwnerStyle 결과) */
  style: OwnerNamingStyle;
  /** 게임 속 가상 인물의 성 (엔진이 넘긴다) */
  tributeNames: readonly string[];
}

/** 이름 후보 한 개 */
export interface NameCandidate {
  name: string;
  template: NameTemplate;
  source: NameSource;
  /** 한국어 한 줄 이유. 예: "어미 Silver Tide 의 'Tide' 에서" */
  note: string;
}

/** 거절 사유 */
export type NameRejectReason =
  | 'tooLong'
  | 'tooManySyllables'
  | 'invalidChars'
  | 'initialsOnly'
  | 'endsWithNumber'
  | 'protected'
  | 'taken';

/** 등록된 이름 조회. 입력은 normalizeName 을 거친 문자열. */
export interface NameRegistry {
  isTaken(normalizedName: string): boolean;
}

/** 검증 결과 */
export type NameValidation =
  | { ok: true; normalized: string }
  | { ok: false; reason: NameRejectReason };
