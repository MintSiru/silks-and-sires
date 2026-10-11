import { describe, expect, it } from 'vitest';
import poolsJson from '../../data/people/name_pools.json';
import blockedJson from '../../data/people/blocked_names.json';
import placesJson from '../../data/people/places.json';

type CountryKey = 'GB' | 'IE' | 'FR' | 'DE' | 'IT' | 'US' | 'AU' | 'JP' | 'BR' | 'ZA';

interface CountryPool {
  given_male: string[];
  given_female: string[];
  surnames: string[];
}

interface PlacesData {
  yard_words: string[];
  stud_suffixes: Record<string, string[]>;
  region_names: Record<string, string[]>;
}

const COUNTRIES: readonly CountryKey[] = ['GB', 'IE', 'FR', 'DE', 'IT', 'US', 'AU', 'JP', 'BR', 'ZA'];

const pools = poolsJson as unknown as Record<string, CountryPool>;
const blockedFullNames = (blockedJson as unknown as { full_names: string[] }).full_names;
const places = placesJson as unknown as PlacesData;

/** 인명 허용 문자: 영문자·아포스트로피·하이픈·공백(JP 는 로마자 표기). 첫 글자는 영문자. */
const NAME_PATTERN = /^[A-Za-z][A-Za-z'\- ]*$/;

/**
 * 실제 도시·마을 이름 대조용 소규모 목록(전체 단어 일치, 대소문자 무시).
 * 가상 지명은 이 목록과 같으면 안 된다. 완전한 대조는 아니다(_review.md 참고).
 */
const REAL_PLACE_DENYLIST = [
  'London', 'Paris', 'Berlin', 'Rome', 'Milan', 'Naples', 'Florence', 'Turin', 'Cologne', 'Hamburg',
  'Munich', 'Hanover', 'Lyon', 'Marseille', 'Bordeaux', 'Dublin', 'Cork', 'Galway', 'Kildare',
  'Tokyo', 'Osaka', 'Kyoto', 'Sapporo', 'Fukushima', 'Sydney', 'Melbourne', 'Johannesburg',
  'Cape Town', 'Durban', 'Sao Paulo', 'Rio de Janeiro', 'Louisville', 'Lexington', 'Saratoga',
  'Manchester', 'Liverpool', 'Birmingham', 'Glasgow', 'Edinburgh', 'Newmarket', 'Epsom', 'Ascot',
  'Newbury', 'York', 'Chantilly',
];

function isUniqueCaseInsensitive(list: string[]): boolean {
  const keys = list.map((s) => s.toLowerCase());
  return new Set(keys).size === keys.length;
}

function invalidNames(list: string[], pattern: RegExp): string[] {
  return list.filter((n) => !pattern.test(n) || n.length < 2 || n.length > 14);
}

describe('name_pools.json', () => {
  it('국가 키는 GB IE FR DE IT US AU JP BR ZA 열 개이다', () => {
    expect(Object.keys(pools).sort()).toEqual([...COUNTRIES].sort());
  });

  it.each(COUNTRIES)('%s: 남성 이름 ≥ 60, 여성 이름 ≥ 40, 성 ≥ 120', (c) => {
    const p = pools[c];
    expect(p).toBeDefined();
    expect(p!.given_male.length).toBeGreaterThanOrEqual(60);
    expect(p!.given_female.length).toBeGreaterThanOrEqual(40);
    expect(p!.surnames.length).toBeGreaterThanOrEqual(120);
  });

  it.each(COUNTRIES)('%s: 각 목록 안에서 중복이 없다(대소문자 무시)', (c) => {
    const p = pools[c]!;
    expect(isUniqueCaseInsensitive(p.given_male)).toBe(true);
    expect(isUniqueCaseInsensitive(p.given_female)).toBe(true);
    expect(isUniqueCaseInsensitive(p.surnames)).toBe(true);
  });

  it.each(COUNTRIES)('%s: 모든 이름은 2~14자이고 영문자·아포스트로피·하이픈·공백만 쓴다', (c) => {
    const p = pools[c]!;
    const bad = [
      ...invalidNames(p.given_male, NAME_PATTERN),
      ...invalidNames(p.given_female, NAME_PATTERN),
      ...invalidNames(p.surnames, NAME_PATTERN),
    ];
    expect(bad).toEqual([]);
  });

  it('차단 목록과 같은 조합(given × surname)이 생길 수 있다 — B2 생성기 필터가 필요한 이유', () => {
    const blocked = new Set(blockedFullNames);
    const collisions: string[] = [];
    for (const c of COUNTRIES) {
      const p = pools[c]!;
      const givens = [...p.given_male, ...p.given_female];
      for (const g of givens) {
        for (const s of p.surnames) {
          const full = `${g} ${s}`;
          if (blocked.has(full)) collisions.push(`${c}:${full}`);
        }
      }
    }
    // 생성 가능한 조합이 실제로 차단 목록과 겹친다는 사실을 고정한다.
    // 이 값이 0이 되면 풀이 바뀐 것이므로 차단 목록과 _review.md 를 다시 검토한다.
    expect(collisions.length).toBeGreaterThan(0);
  });
});

describe('blocked_names.json', () => {
  it('차단 목록은 비어 있지 않고 150개 이상이다', () => {
    expect(blockedFullNames.length).toBeGreaterThanOrEqual(150);
  });

  it('모든 항목은 성+이름 형태(공백 포함)이고 허용 문자만 쓴다', () => {
    const bad = blockedFullNames.filter((n) => !n.includes(' ') || !NAME_PATTERN.test(n));
    expect(bad).toEqual([]);
  });

  it('항목에 중복이 없다(대소문자 무시)', () => {
    expect(isUniqueCaseInsensitive(blockedFullNames)).toBe(true);
  });
});

describe('places.json', () => {
  it('yard_words 는 60개 이상이고 중복이 없으며 허용 문자만 쓴다', () => {
    expect(places.yard_words.length).toBeGreaterThanOrEqual(60);
    expect(isUniqueCaseInsensitive(places.yard_words)).toBe(true);
    expect(invalidNames(places.yard_words, NAME_PATTERN)).toEqual([]);
  });

  it('stud_suffixes 는 열 개 국가 키를 모두 가지고 각 목록이 비어 있지 않다', () => {
    for (const c of COUNTRIES) {
      const list = places.stud_suffixes[c];
      expect(list, c).toBeDefined();
      expect(list!.length, c).toBeGreaterThan(0);
      expect(isUniqueCaseInsensitive(list!), c).toBe(true);
    }
  });

  it.each(COUNTRIES)('%s: region_names 는 25개 이상이고 중복이 없으며 허용 문자만 쓴다', (c) => {
    const list = places.region_names[c];
    expect(list).toBeDefined();
    expect(list!.length).toBeGreaterThanOrEqual(25);
    expect(isUniqueCaseInsensitive(list!)).toBe(true);
    const bad = list!.filter((n) => !NAME_PATTERN.test(n));
    expect(bad).toEqual([]);
  });

  it('region_names 에 실제 도시·마을 이름(대조 목록)이 없다', () => {
    const denied = new Set(REAL_PLACE_DENYLIST.map((s) => s.toLowerCase()));
    const hits: string[] = [];
    for (const c of COUNTRIES) {
      for (const n of places.region_names[c] ?? []) {
        if (denied.has(n.toLowerCase())) hits.push(`${c}:${n}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
