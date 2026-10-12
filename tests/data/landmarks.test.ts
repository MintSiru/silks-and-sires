import { describe, expect, it } from 'vitest';
import landmarksJson from '../../data/naming/landmarks.json';
import protectedJson from '../../data/naming/protected.json';
import realPlacesJson from '../../data/naming/real_places.json';
import stallionNamesJson from '../../data/stallions/names.json';

/** M3-C7f1 명승고적·유명 작품 이름 데이터 검증 (data/naming/landmarks.json). 스키마는 docs/specs/M3-C7f1-landmarks-works-data.md 를 따른다. */

type LandmarkKind = 'natural' | 'built';
type WorkKind = 'book' | 'poem' | 'play' | 'painting' | 'sculpture' | 'music' | 'opera' | 'ballet' | 'song' | 'film';

interface Landmark {
  name: string;
  kind: LandmarkKind;
  country: string;
}

interface Work {
  name: string;
  kind: WorkKind;
  year: number;
  titleType: 'phrase' | 'proper';
  creatorDeathYear?: number;
}

interface LandmarksFile {
  version: 1;
  landmarks: Landmark[];
  works: Work[];
}

interface RealPlacesFile {
  version: 1;
  countries: string[];
  regions: string[];
  cities: string[];
  blockedTokens: string[];
}

const data = landmarksJson as unknown as LandmarksFile;
const protectedNames = (protectedJson as unknown as { version: 1; names: string[] }).names;
const stallionNames = Object.values(stallionNamesJson as Record<string, string>);
const realPlaces = realPlacesJson as unknown as RealPlacesFile;

const NAME_CHAR_RE = /^[A-Za-z' .-]+$/;
const ISO2_RE = /^[A-Z]{2}$/;
const LANDMARK_KINDS: LandmarkKind[] = ['natural', 'built'];
const WORK_KINDS: WorkKind[] = ['book', 'poem', 'play', 'painting', 'sculpture', 'music', 'opera', 'ballet', 'song', 'film'];
/** 유럽 국가 코드(ISO 3166-1 alpha-2). 이 밖의 코드는 '유럽 외'로 센다. */
const EUROPE_CODES = new Set([
  'GB', 'IE', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'LU', 'CH', 'AT', 'DK', 'NO', 'SE', 'FI', 'IS',
  'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'RS', 'BA', 'ME', 'MK', 'AL', 'UA', 'BY', 'MD',
  'LT', 'LV', 'EE', 'MT', 'RU',
]);
/** 금지어(명세 목록). 대소문자 무시. */
const BANNED_RE = /mecca|medina|vatican|sistine|temple mount|auschwitz|chernobyl|ground zero|hiroshima|nagasaki|disney|marvel|pixar|potter|mickey|superman|batman|coca|lego|nike/i;

/** src/engine/naming/validate.ts 의 normalizeName 과 같은 규칙(소문자, 영문자 이외 제거). 엔진 파일 의존을 피하려고 복제한다. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/** 단어 비교용 형태: 소문자, 끝 's 제거, 영문자만 (validate.ts normalizeWord 와 같은 규칙). */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/'s$/, '').replace(/[^a-z]/g, '');
}

function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w !== '');
}

/** 단어열 seq 가 words 안에 연속으로 나타나는지 본다. */
function containsSequence(words: string[], seq: string[]): boolean {
  for (let i = 0; i + seq.length <= words.length; i++) {
    if (seq.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

function allNames(): Array<{ label: string; name: string }> {
  return [
    ...data.landmarks.map((l) => ({ label: `landmark ${l.name}`, name: l.name })),
    ...data.works.map((w) => ({ label: `work ${w.name}`, name: w.name })),
  ];
}

const protectedSet = new Set(protectedNames.map(normalizeName));
const stallionSet = new Set(stallionNames.map(normalizeName));
const realPlaceSeqs = [...realPlaces.countries, ...realPlaces.regions, ...realPlaces.cities].map(wordsOf);
const blockedSeqs = realPlaces.blockedTokens.map(wordsOf);

describe('스키마: 최상위 키와 항목 키 집합', () => {
  it('최상위 키는 version, landmarks, works 만 있다', () => {
    expect(Object.keys(landmarksJson).sort()).toEqual(['landmarks', 'version', 'works']);
    expect(data.version).toBe(1);
  });

  it('landmark 항목 키는 name, kind, country 만 있다', () => {
    for (const l of data.landmarks) {
      expect(Object.keys(l).sort(), l.name).toEqual(['country', 'kind', 'name']);
    }
  });

  it('work 항목 키는 name, kind, year, titleType 과 (proper 일 때만) creatorDeathYear 이다', () => {
    for (const w of data.works) {
      const keys = Object.keys(w).sort();
      const expected = w.titleType === 'proper'
        ? ['creatorDeathYear', 'kind', 'name', 'titleType', 'year']
        : ['kind', 'name', 'titleType', 'year'];
      expect(keys, w.name).toEqual(expected);
    }
  });
});

describe('개수 (명세 개수 기준)', () => {
  it('명승고적: 150 이상, 자연 60 이상, 건축·유적 60 이상, 유럽 외 40 이상', () => {
    expect(data.landmarks.length).toBeGreaterThanOrEqual(150);
    expect(data.landmarks.filter((l) => l.kind === 'natural').length).toBeGreaterThanOrEqual(60);
    expect(data.landmarks.filter((l) => l.kind === 'built').length).toBeGreaterThanOrEqual(60);
    expect(data.landmarks.filter((l) => !EUROPE_CODES.has(l.country)).length).toBeGreaterThanOrEqual(40);
  });

  it('작품: 150 이상, 일반 어구(phrase) 90 이상, 고유명(proper) 30 이상', () => {
    expect(data.works.length).toBeGreaterThanOrEqual(150);
    expect(data.works.filter((w) => w.titleType === 'phrase').length).toBeGreaterThanOrEqual(90);
    expect(data.works.filter((w) => w.titleType === 'proper').length).toBeGreaterThanOrEqual(30);
  });

  it('작품 장르 6가지 이상이 각각 8개 이상', () => {
    const counts = WORK_KINDS.map((k) => data.works.filter((w) => w.kind === k).length);
    expect(counts.filter((c) => c >= 8).length).toBeGreaterThanOrEqual(6);
  });
});

describe('형식: 이름 18자·문자 집합', () => {
  it('landmark 이름: 공백 포함 18자 이하, 영문자·공백·아포스트로피·하이픈·마침표만, 단어 빈칸 없음', () => {
    for (const l of data.landmarks) {
      expect(l.name.length, l.name).toBeLessThanOrEqual(18);
      expect(NAME_CHAR_RE.test(l.name), l.name).toBe(true);
      expect(/[A-Za-z]/.test(l.name), l.name).toBe(true);
      expect(l.name, l.name).toBe(l.name.trim());
      expect(/ {2}/.test(l.name), l.name).toBe(false);
    }
  });

  it('work 이름: 공백 포함 18자 이하, 영문자·공백·아포스트로피·하이픈·마침표만, 단어 빈칸 없음', () => {
    for (const w of data.works) {
      expect(w.name.length, w.name).toBeLessThanOrEqual(18);
      expect(NAME_CHAR_RE.test(w.name), w.name).toBe(true);
      expect(/[A-Za-z]/.test(w.name), w.name).toBe(true);
      expect(w.name, w.name).toBe(w.name.trim());
      expect(/ {2}/.test(w.name), w.name).toBe(false);
    }
  });

  it('landmark: kind 는 natural|built, country 는 ISO 3166-1 alpha-2 대문자 두 글자', () => {
    for (const l of data.landmarks) {
      expect(LANDMARK_KINDS.includes(l.kind), l.name).toBe(true);
      expect(ISO2_RE.test(l.country), `${l.name}: ${l.country}`).toBe(true);
    }
  });

  it('work: kind 는 명세의 10개 중 하나, year 는 정수, titleType 은 phrase|proper', () => {
    for (const w of data.works) {
      expect(WORK_KINDS.includes(w.kind), w.name).toBe(true);
      expect(Number.isInteger(w.year), w.name).toBe(true);
      expect(['phrase', 'proper'].includes(w.titleType), w.name).toBe(true);
    }
  });

  it('proper 작품은 creatorDeathYear 가 정수이고 1956 이하다(사망 후 70년 이상)', () => {
    for (const w of data.works) {
      if (w.titleType !== 'proper') continue;
      expect(Number.isInteger(w.creatorDeathYear), w.name).toBe(true);
      expect(w.creatorDeathYear as number, w.name).toBeLessThanOrEqual(1956);
    }
  });
});

describe('중복 0', () => {
  it('정규화(소문자, 영문자만) 후 landmarks·works 전체에서 같은 이름이 없다', () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const { label, name } of allNames()) {
      const key = normalizeName(name);
      const prev = seen.get(key);
      if (prev !== undefined) dups.push(`${prev} / ${label}`);
      else seen.set(key, label);
    }
    expect(dups).toEqual([]);
  });
});

describe('겹침 0: 보호 명단·종마 이름·실제 지명', () => {
  it('protected.json 의 이름과 겹치지 않는다', () => {
    const hits = allNames().filter(({ name }) => protectedSet.has(normalizeName(name))).map((x) => x.label);
    expect(hits).toEqual([]);
  });

  it('data/stallions/names.json 의 종마 이름과 겹치지 않는다', () => {
    const hits = allNames().filter(({ name }) => stallionSet.has(normalizeName(name))).map((x) => x.label);
    expect(hits).toEqual([]);
  });

  it('real_places 의 국가·주·도시 이름을 단어 단위로 포함하지 않는다(중복 출처 방지)', () => {
    const hits = allNames()
      .filter(({ name }) => {
        const nw = wordsOf(name);
        return realPlaceSeqs.some((seq) => containsSequence(nw, seq));
      })
      .map((x) => x.label);
    expect(hits).toEqual([]);
  });
});

describe('차단 지명 토큰(blockedTokens) 0건 (원칙 1)', () => {
  it('이름의 연속 단어열이 차단 토큰과 같은 것이 없다', () => {
    const hits = allNames()
      .filter(({ name }) => {
        const nw = wordsOf(name);
        return blockedSeqs.some((seq) => containsSequence(nw, seq));
      })
      .map((x) => x.label);
    expect(hits).toEqual([]);
  });
});

describe('금지어 정규식 0건', () => {
  it('landmark·work 이름에 금지어가 없다', () => {
    const hits = allNames().filter(({ name }) => BANNED_RE.test(name)).map((x) => x.label);
    expect(hits).toEqual([]);
  });
});
