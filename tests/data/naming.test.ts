import { describe, expect, it } from 'vitest';
import lexiconJson from '../../data/naming/lexicon.en.json';
import ownerJson from '../../data/naming/owner-styles.json';
import protectedJson from '../../data/naming/protected.json';
import historicalJson from '../../data/naming/historical.json';
import stallionNamesJson from '../../data/stallions/names.json';
import racecoursesJson from '../../data/racecourses.json';

/** M3-C7a 이름 생성 어휘 데이터 검증 (data/naming/*.json). 스키마는 docs/specs/M3-C7a-naming-data.md 를 따른다. */

interface NamingLexicon {
  version: 1;
  modifiers: string[];
  nouns: string[];
  verbs: string[];
  abstract: string[];
  places: string[];
  foreign: { fr: string[]; it: string[]; de: string[] };
  culture: string[];
  phrases: string[];
  associations: Record<string, string[]>;
  syllables: { onsets: string[]; vowels: string[]; codas: string[] };
  stopwords: string[];
}

type SourceKey = 'pedigree' | 'tribute' | 'historical' | 'place' | 'culture' | 'foreign' | 'abstract' | 'ownerStyle';
type TemplateKey = 'single' | 'modifierNoun' | 'possessive' | 'phrase' | 'verb' | 'prefix' | 'joined';

interface OwnerStyle {
  id: string;
  label: string;
  sourceWeights: Record<SourceKey, number>;
  templateWeights: Record<TemplateKey, number>;
  prefix?: string;
}

interface OwnerNamingStyleFile {
  version: 1;
  styles: OwnerStyle[];
}

interface HistoricalPerson {
  name: string;
  field: 'artist' | 'writer' | 'composer' | 'explorer' | 'scientist';
  deathYear: number;
}

const lex = lexiconJson as unknown as NamingLexicon;
const owner = ownerJson as unknown as OwnerNamingStyleFile;
const protectedNames = (protectedJson as unknown as { version: 1; names: string[] }).names;
const historical = (historicalJson as unknown as { version: 1; people: HistoricalPerson[] }).people;
const stallionNames = Object.values(stallionNamesJson as Record<string, string>);
const racecourseNames = (racecoursesJson as unknown as Array<{ name: string }>).map((r) => r.name);

const WORD_RE = /^[A-Za-z']+$/;
const PHRASE_CHAR_RE = /^[A-Za-z' ]+$/;
const PLACEHOLDER_RE = /\{[NMPV]\}/g;
const NAME_RE = /^[A-Za-z' ]+$/;
const SOURCE_KEYS: SourceKey[] = ['pedigree', 'tribute', 'historical', 'place', 'culture', 'foreign', 'abstract', 'ownerStyle'];
const TEMPLATE_KEYS: TemplateKey[] = ['single', 'modifierNoun', 'possessive', 'phrase', 'verb', 'prefix', 'joined'];
const FIELDS: HistoricalPerson['field'][] = ['artist', 'writer', 'composer', 'explorer', 'scientist'];

/** 실존 경마 기구·경마장·레이스·후원사 단어(단어 단위 일치, 대소문자 무시). */
const BANNED_TOKENS = new Set(
  [
    'derby', 'oaks', 'guineas', 'leger', 'arc', 'ascot', 'epsom', 'coral', 'goffs', 'tattersalls',
    'coolmore', 'godolphin', 'newmarket', 'cup', 'stakes', 'handicap', 'trophy', 'prix', 'champion',
    'eclipse', 'tote', 'emirates', 'kentucky', 'belmont', 'saratoga', 'keeneland', 'chester',
    'curragh', 'longchamp', 'chantilly', 'deauville', 'goodwood', 'cheltenham', 'aintree', 'juddmonte',
    'darley', 'shadwell', 'ladbrokes', 'betfred', 'qatar', 'dewhurst', 'sussex', 'ebor', 'coventry',
    'mustang', 'jaguar', 'harrier', 'mercury', 'orion', 'valkyrie', 'lynx', 'merlin', 'insignia',
    'corsair', 'bronco', 'pinto', 'cougar',
  ],
);

function allLexiconWords(): string[] {
  return [
    ...lex.modifiers,
    ...lex.nouns,
    ...lex.verbs,
    ...lex.abstract,
    ...lex.places,
    ...lex.culture,
    ...lex.foreign.fr,
    ...lex.foreign.it,
    ...lex.foreign.de,
  ];
}

function noCaseDuplicates(arr: string[]): boolean {
  const seen = new Set(arr.map((w) => w.toLowerCase()));
  return seen.size === arr.length;
}

describe('스키마: 키 집합이 명세와 정확히 일치', () => {
  it('lexicon.en.json', () => {
    expect(Object.keys(lexiconJson).sort()).toEqual(
      [
        'version', 'modifiers', 'nouns', 'verbs', 'abstract', 'places', 'foreign', 'culture',
        'phrases', 'associations', 'syllables', 'stopwords',
      ].sort(),
    );
    expect(Object.keys(lex.foreign).sort()).toEqual(['de', 'fr', 'it']);
    expect(Object.keys(lex.syllables).sort()).toEqual(['codas', 'onsets', 'vowels']);
    expect(lex.version).toBe(1);
  });

  it('owner-styles.json: 스타일 필드', () => {
    expect(Object.keys(ownerJson).sort()).toEqual(['styles', 'version']);
    for (const s of owner.styles) {
      const keys = Object.keys(s).sort();
      const allowed = ['id', 'label', 'sourceWeights', 'templateWeights', 'prefix'];
      expect(keys.every((k) => allowed.includes(k)), s.id).toBe(true);
      expect(keys.includes('id') && keys.includes('label') && keys.includes('sourceWeights') && keys.includes('templateWeights'), s.id).toBe(true);
    }
  });

  it('protected.json / historical.json', () => {
    expect(Object.keys(protectedJson).sort()).toEqual(['names', 'version']);
    expect(Object.keys(historicalJson).sort()).toEqual(['people', 'version']);
    for (const p of historical) {
      expect(Object.keys(p).sort()).toEqual(['deathYear', 'field', 'name']);
    }
  });
});

describe('어휘 수량 (수용 기준 2)', () => {
  it('최소 수량', () => {
    expect(lex.modifiers.length).toBeGreaterThanOrEqual(300);
    expect(lex.nouns.length).toBeGreaterThanOrEqual(500);
    expect(lex.verbs.length).toBeGreaterThanOrEqual(120);
    expect(lex.abstract.length).toBeGreaterThanOrEqual(200);
    expect(lex.places.length).toBeGreaterThanOrEqual(120);
    expect(lex.foreign.fr.length).toBeGreaterThanOrEqual(100);
    expect(lex.foreign.it.length).toBeGreaterThanOrEqual(100);
    expect(lex.foreign.de.length).toBeGreaterThanOrEqual(100);
    expect(lex.culture.length).toBeGreaterThanOrEqual(80);
    expect(lex.phrases.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(lex.associations).length).toBeGreaterThanOrEqual(150);
    for (const [k, v] of Object.entries(lex.associations)) {
      expect(v.length, `연상어 ${k}`).toBeGreaterThanOrEqual(3);
    }
    expect(lex.syllables.onsets.length).toBeGreaterThanOrEqual(12);
    expect(lex.syllables.vowels.length).toBeGreaterThanOrEqual(12);
    expect(lex.syllables.codas.length).toBeGreaterThanOrEqual(12);
  });

  it('가상 지명 40개 이상은 places 에 일반 지형어와 함께 들어 있다(개수 하한 120으로 간접 검사)', () => {
    expect(lex.places.includes('Ashcombe')).toBe(true);
    expect(lex.places.length).toBeGreaterThanOrEqual(120);
  });

  it('stopwords 에 The Of A An To And In 포함', () => {
    for (const w of ['The', 'Of', 'A', 'An', 'To', 'And', 'In']) {
      expect(lex.stopwords).toContain(w);
    }
  });
});

describe('어휘 형식 (수용 기준 3)', () => {
  it('단어는 영문자·아포스트로피만, 12자 이하, 배열 안 중복 없음', () => {
    const arrays: Record<string, string[]> = {
      modifiers: lex.modifiers,
      nouns: lex.nouns,
      verbs: lex.verbs,
      abstract: lex.abstract,
      places: lex.places,
      culture: lex.culture,
      'foreign.fr': lex.foreign.fr,
      'foreign.it': lex.foreign.it,
      'foreign.de': lex.foreign.de,
    };
    for (const [name, arr] of Object.entries(arrays)) {
      for (const w of arr) {
        expect(WORD_RE.test(w), `${name}: ${w}`).toBe(true);
        expect(w.length, `${name}: ${w}`).toBeLessThanOrEqual(12);
      }
      expect(noCaseDuplicates(arr), `${name} 중복`).toBe(true);
    }
  });

  it('phrases: 한 줄 30자 이하, 자리 표시 외 문자는 영문자·공백·아포스트로피, 중복 없음', () => {
    for (const p of lex.phrases) {
      expect(p.length, p).toBeLessThanOrEqual(30);
      expect(PHRASE_CHAR_RE.test(p.replace(PLACEHOLDER_RE, 'X')), p).toBe(true);
    }
    expect(noCaseDuplicates(lex.phrases)).toBe(true);
  });

  it('phrases: 붙여 쓰기용 3~4단어 구절 틀이 20개 이상', () => {
    const multi = lex.phrases.filter((p) => {
      const n = p.split(' ').length;
      return n >= 3 && n <= 4;
    });
    expect(multi.length).toBeGreaterThanOrEqual(20);
  });

  it('associations: 키는 영문자, 값은 영문자·아포스트로피 12자 이하, 키 중복 없음', () => {
    const keys = Object.keys(lex.associations);
    expect(new Set(keys.map((k) => k.toLowerCase())).size).toBe(keys.length);
    for (const k of keys) {
      expect(WORD_RE.test(k), k).toBe(true);
      const vals = lex.associations[k] ?? [];
      for (const v of vals) {
        expect(WORD_RE.test(v) && v.length <= 12, `${k}: ${v}`).toBe(true);
      }
      expect(noCaseDuplicates(vals), `${k} 연상어 중복`).toBe(true);
    }
  });

  it('syllables 배열은 영문자·아포스트로피만', () => {
    for (const arr of [lex.syllables.onsets, lex.syllables.vowels, lex.syllables.codas]) {
      for (const s of arr) expect(WORD_RE.test(s), s).toBe(true);
    }
  });
});

describe('소유자 스타일 (수용 기준 4, 붙여 쓰기 보충)', () => {
  it('12개 이상, id 중복 없음, 키 구성 정확', () => {
    expect(owner.styles.length).toBeGreaterThanOrEqual(12);
    expect(new Set(owner.styles.map((s) => s.id)).size).toBe(owner.styles.length);
    for (const s of owner.styles) {
      expect(Object.keys(s.sourceWeights).sort()).toEqual([...SOURCE_KEYS].sort());
      expect(Object.keys(s.templateWeights).sort()).toEqual([...TEMPLATE_KEYS].sort());
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('가중치는 0 이상의 유한수, 합 > 0', () => {
    for (const s of owner.styles) {
      const all = [...Object.values(s.sourceWeights), ...Object.values(s.templateWeights)];
      for (const w of all) {
        expect(Number.isFinite(w) && w >= 0, s.id).toBe(true);
      }
      expect(Object.values(s.sourceWeights).reduce((a, b) => a + b, 0), s.id).toBeGreaterThan(0);
      expect(Object.values(s.templateWeights).reduce((a, b) => a + b, 0), s.id).toBeGreaterThan(0);
    }
  });

  it('joined: 모든 스타일에 값이 있고 0.05~0.35 범위, 0.3 이상인 스타일 2개 이상', () => {
    for (const s of owner.styles) {
      const j = s.templateWeights.joined;
      expect(typeof j, s.id).toBe('number');
      expect(j >= 0.05 && j <= 0.35, `${s.id} joined=${j}`).toBe(true);
    }
    const high = owner.styles.filter((s) => s.templateWeights.joined >= 0.3);
    expect(high.length).toBeGreaterThanOrEqual(2);
  });

  it('prefix: 3개 이상 스타일이 가짐, 8자 이하 영문자 가상어', () => {
    const withPrefix = owner.styles.filter((s) => s.prefix !== undefined);
    expect(withPrefix.length).toBeGreaterThanOrEqual(3);
    for (const s of withPrefix) {
      expect(s.prefix as string, s.id).toMatch(/^[A-Za-z]{1,8}$/);
    }
  });

  it('historical 가중치가 높은 고전 예술 애호가형 2개 이상, ownerStyle 가중치가 높은 스타일 2개 이상', () => {
    const classic = owner.styles.filter((s) => s.sourceWeights.historical >= 8 && s.label.includes('예술'));
    expect(classic.length).toBeGreaterThanOrEqual(2);
    const syl = owner.styles.filter((s) => s.sourceWeights.ownerStyle >= 8);
    expect(syl.length).toBeGreaterThanOrEqual(2);
  });
});

describe('보호 명단 protected.json (수용 기준 5)', () => {
  it('300개 이상, 중복 없음(대소문자 무시), 문자 규칙', () => {
    expect(protectedNames.length).toBeGreaterThanOrEqual(300);
    expect(noCaseDuplicates(protectedNames)).toBe(true);
    for (const n of protectedNames) {
      expect(NAME_RE.test(n), n).toBe(true);
    }
  });
});

describe('역사 인물 historical.json (수용 기준 6)', () => {
  it('200명 이상, 모두 사망 연도 1956 이하 정수', () => {
    expect(historical.length).toBeGreaterThanOrEqual(200);
    for (const p of historical) {
      expect(Number.isInteger(p.deathYear), p.name).toBe(true);
      expect(p.deathYear, p.name).toBeLessThanOrEqual(1956);
    }
  });

  it('분야는 5개뿐, 분야마다 25명 이상', () => {
    for (const p of historical) {
      expect(FIELDS.includes(p.field), p.name).toBe(true);
    }
    for (const f of FIELDS) {
      expect(historical.filter((p) => p.field === f).length, f).toBeGreaterThanOrEqual(25);
    }
  });

  it('이름: 영문자·공백·아포스트로피, 18자 이하, 중복 없음', () => {
    for (const p of historical) {
      expect(NAME_RE.test(p.name), p.name).toBe(true);
      expect(p.name.length, p.name).toBeLessThanOrEqual(18);
    }
    expect(noCaseDuplicates(historical.map((p) => p.name))).toBe(true);
  });

  it('종마 이름과 같은 사람이 없다', () => {
    const stallionLower = new Set(stallionNames.map((n) => n.toLowerCase()));
    for (const p of historical) {
      expect(stallionLower.has(p.name.toLowerCase()), p.name).toBe(false);
    }
  });
});

describe('실명 차단 (수용 기준 7)', () => {
  it('어휘 단어가 보호 명단·종마 이름과 같지 않다', () => {
    const blocked = new Set(
      [...protectedNames, ...stallionNames].map((n) => n.toLowerCase()),
    );
    for (const w of allLexiconWords()) {
      expect(blocked.has(w.toLowerCase()), w).toBe(false);
    }
    for (const w of [...lex.foreign.fr, ...lex.foreign.it, ...lex.foreign.de]) {
      expect(blocked.has(w.toLowerCase()), w).toBe(false);
    }
  });

  it('금지 실명 토큰(경마장·레이스·후원사·기구)이 어휘와 접두어에 없다', () => {
    const tokens: string[] = [];
    for (const w of allLexiconWords()) tokens.push(w);
    for (const p of lex.phrases) tokens.push(...p.replace(PLACEHOLDER_RE, ' ').split(/\s+/));
    for (const s of owner.styles) if (s.prefix) tokens.push(s.prefix);
    for (const t of tokens) {
      if (!t) continue;
      expect(BANNED_TOKENS.has(t.toLowerCase()), t).toBe(false);
    }
  });

  it('places 는 실제 경마장 이름과 같지 않다(Ashcombe 은 명세 지정)', () => {
    const rcTokens = new Set<string>();
    const GENERIC = new Set(['downs', 'heath', 'park', 'moor', 'le', 'bois', 'port', 'saint']);
    for (const name of racecourseNames) {
      for (const t of name.split(/[\s-]+/)) {
        if (!GENERIC.has(t.toLowerCase())) rcTokens.add(t.toLowerCase());
      }
    }
    for (const p of lex.places) {
      if (p === 'Ashcombe') continue;
      expect(rcTokens.has(p.toLowerCase()), p).toBe(false);
    }
  });
});
