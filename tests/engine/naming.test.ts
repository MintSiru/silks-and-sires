import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { getNamingData, getStallionNames, parseNamingData } from '../../src/engine/data/staticData';
import { extractKeywords, nameForHorse, pickOwnerStyle, suggestNames } from '../../src/engine/naming/generate';
import { countSyllables, makeSyllableWord } from '../../src/engine/naming/syllables';
import { hasBlockedPlaceToken, normalizeName, normalizePlaceToken, validateHorseName } from '../../src/engine/naming/validate';
import type { NameLanguage, NameRegistry, NamingContext, NamingData, OwnerNamingStyle } from '../../src/engine/naming/types';
import {
  LANGUAGE_BY_COUNTRY,
  NAME_MAX_LENGTH,
  NAME_MAX_SYLLABLES,
  NATIVE_CONNECTOR,
  NATIVE_SHARE,
} from '../../src/engine/config/naming';

const NONE: NameRegistry = { isTaken: () => false };

/** 테스트용 가상 인물 성 (실존 인물과 겹치지 않게 만든 이름) */
const TRIBUTE_SURNAMES_FEW = ['Harnwell', 'Tessmoor', 'Vellacourt'];
const TRIBUTE_SURNAMES_MANY = [
  'Harnwell', 'Tessmoor', 'Vellacourt', 'Askerby', 'Dunrowan', 'Ferrimere', 'Garrowby', 'Holmcastle',
  'Kerrington', 'Lindisk', 'Marrowgate', 'Netherby', 'Orsindell', 'Pellhaven', 'Quillon', 'Rookhurst',
  'Stanwell', 'Thornsby', 'Ulverscar', 'Varden', 'Wedderlow', 'Yellowtarn', 'Zennor', 'Ambleworth',
  'Brackenhall', 'Cressford', 'Dimmock', 'Eskdale', 'Fallowby', 'Gravelhythe',
];

function contextFor(style: OwnerNamingStyle, tributeNames: readonly string[] = TRIBUTE_SURNAMES_FEW): NamingContext {
  return { sireName: 'Sea The Stars', damName: 'Silver Tide', style, tributeNames, language: 'en' };
}

/** 마주 국적 언어를 바꾼 문맥 (기본 contextFor 와 같은 부모·스타일) */
function langContext(style: OwnerNamingStyle, language: NameLanguage): NamingContext {
  return { ...contextFor(style), language };
}

function styleById(data: NamingData, id: string): OwnerNamingStyle {
  const style = data.styles.find((s) => s.id === id);
  if (style === undefined) {
    throw new Error(`스타일 없음: ${id}`);
  }
  return style;
}

describe('countSyllables', () => {
  it('모음 묶음으로 세고 단어 끝 묵음 e 는 뺀다', () => {
    expect(countSyllables('Silver Tide')).toBe(3);
    expect(countSyllables('Mare')).toBe(1);
    expect(countSyllables('The')).toBe(1);
  });

  it('붙여 쓴 이름도 한 단어로 센다', () => {
    expect(countSyllables('Savethelastdance')).toBe(5);
  });

  it('아포스트로피는 단어 안에서 무시한다', () => {
    expect(countSyllables("Sadler's Wells")).toBe(3);
  });
});

describe('makeSyllableWord', () => {
  it('2~3음절, 첫 글자만 대문자, 18자 이하', () => {
    const data = getNamingData();
    for (let seed = 1; seed <= 300; seed++) {
      const word = makeSyllableWord(data.lexicon, createRng(seed));
      const count = countSyllables(word);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
      expect(word.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
      expect(word).toMatch(/^[A-Z][a-z']*$/);
    }
  });
});

describe('validateHorseName (등록 규칙)', () => {
  const data = getNamingData();
  const check = (name: string, registry: NameRegistry = NONE) =>
    validateHorseName(name, registry, data.protectedNames);

  it('19자 이름은 tooLong', () => {
    const name = 'Abcdefghijklmnopqrs';
    expect(name.length).toBe(19);
    expect(check(name)).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('8음절 이름은 tooManySyllables', () => {
    const name = 'Abababababababa';
    expect(countSyllables(name)).toBe(8);
    expect(name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    expect(check(name)).toEqual({ ok: false, reason: 'tooManySyllables' });
  });

  it('숫자·하이픈·마침표는 invalidChars', () => {
    expect(check('Storm-Rider')).toEqual({ ok: false, reason: 'invalidChars' });
    expect(check('Sea.Breeze')).toEqual({ ok: false, reason: 'invalidChars' });
    expect(check('Rock 9 Hill')).toEqual({ ok: false, reason: 'invalidChars' });
  });

  it('이니셜만 있으면 initialsOnly', () => {
    expect(check('J P R')).toEqual({ ok: false, reason: 'initialsOnly' });
  });

  it('끝 숫자는 endsWithNumber', () => {
    expect(check('Storm 2')).toEqual({ ok: false, reason: 'endsWithNumber' });
  });

  it('보호 명단 이름은 대소문자·공백과 무관하게 protected', () => {
    expect(check('Mill Reef')).toEqual({ ok: false, reason: 'protected' });
    expect(check('MILL REEF')).toEqual({ ok: false, reason: 'protected' });
    expect(check('millreef')).toEqual({ ok: false, reason: 'protected' });
    expect(check('Nijinsky')).toEqual({ ok: false, reason: 'protected' });
  });

  it('실명 종마 이름은 protected (Sea The Stars)', () => {
    expect(check('Sea The Stars')).toEqual({ ok: false, reason: 'protected' });
    expect(check('sea the stars')).toEqual({ ok: false, reason: 'protected' });
    expect(check('Mr Prospector')).toEqual({ ok: false, reason: 'protected' });
  });

  it('등록된 이름은 taken', () => {
    const registry: NameRegistry = { isTaken: (n) => n === 'silvertide' };
    expect(check('Silver Tide', registry)).toEqual({ ok: false, reason: 'taken' });
    expect(check('Silver Tide')).toEqual({ ok: true, normalized: 'silvertide' });
  });

  it('정상 이름은 통과하고 정규화 값을 돌려준다', () => {
    expect(check("Sadler's Crown")).toEqual({ ok: true, normalized: 'sadlerscrown' });
    expect(normalizeName('Savethelastdance')).toBe('savethelastdance');
  });
});

describe('extractKeywords', () => {
  it('불용어를 빼고 일반 단어만 남긴다(복수형 허용)', () => {
    const data = getNamingData();
    expect(extractKeywords('Sea The Stars', data.lexicon)).toEqual(['Sea', 'Stars']);
  });

  it('고유명사·축약 조각은 키워드가 되지 않는다(원칙 1: 실존 인물·종마 이름이 새 이름에 그대로 들어가지 않게)', () => {
    const data = getNamingData();
    for (const name of ['Churchill', 'Kingman', 'Dalakhani', "Bolt d'Oro", "Sadler's Wells", 'Mr. Prospector']) {
      for (const w of extractKeywords(name, data.lexicon)) {
        expect(['churchill', 'kingman', 'dalakhani', 'oro', 'doro', 'sadler', 'mr'], `${name}: ${w}`).not.toContain(w.toLowerCase());
      }
    }
    expect(extractKeywords('Silver Tide', data.lexicon)).toEqual(['Silver', 'Tide']);
  });
});

describe('suggestNames', () => {
  const data = getNamingData();

  it('같은 시드·같은 입력이면 결과가 완전히 같다', () => {
    const style = pickOwnerStyle('owner-determinism', null, data.styles);
    const a = suggestNames(contextFor(style), data, createRng(42), 8, NONE);
    const b = suggestNames(contextFor(style), data, createRng(42), 8, NONE);
    expect(a).toEqual(b);
    expect(a.length).toBe(8);
  });

  it('시드 1~1000, 8개씩: 모든 후보가 검증을 통과하고 평균 길이가 7.5 이상', () => {
    let totalLength = 0;
    let totalCount = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const style = pickOwnerStyle(`owner-${seed}`, null, data.styles);
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      expect(out.length).toBe(8);
      for (const c of out) {
        expect(validateHorseName(c.name, NONE, data.protectedNames).ok).toBe(true);
        totalLength += c.name.length;
        totalCount++;
      }
    }
    expect(totalLength / totalCount).toBeGreaterThanOrEqual(7.5);
  });

  it('혈통 연상: pedigree 가중치 > 0 인 모든 스타일에서 1,000번 중 95% 이상 pedigree 후보가 나온다', () => {
    const pedigreeStyles = data.styles.filter((s) => s.sourceWeights.pedigree > 0);
    expect(pedigreeStyles.length).toBeGreaterThan(0);
    for (const style of pedigreeStyles) {
      let hits = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
        if (out.some((c) => c.source === 'pedigree')) {
          hits++;
        }
      }
      expect(hits / 1000, style.id).toBeGreaterThanOrEqual(0.95);
    }
  }, 60_000);

  it('혈통 보충: 부모 키워드가 있으면 count 8 결과에 pedigree 후보가 항상 하나 이상 있다 (count 1 은 보충하지 않음)', () => {
    const style = styleById(data, 'terse-single');
    for (let seed = 1; seed <= 200; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      expect(out.some((c) => c.source === 'pedigree')).toBe(true);
    }
    const one = suggestNames(contextFor(style), data, createRng(1), 1, NONE);
    expect(one.length).toBe(1);
  });

  it('pedigree 후보의 이유 문장은 부모와 키워드를 밝힌다', () => {
    const style = styleById(data, 'pedigree-breeder');
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      const hit = out.find((c) => c.source === 'pedigree' && c.note.includes('어미 Silver Tide'));
      if (hit !== undefined) {
        found = true;
        expect(hit.note).toMatch(/^어미 Silver Tide 의 '(Tide|[A-Za-z]+)'/);
      }
    }
    expect(found).toBe(true);
  });

  it('붙여 쓰기: joined 0.35 스타일에서 joined 후보가 나오고 형식이 맞다', () => {
    const style = styleById(data, 'joined-lover');
    expect(style.templateWeights.joined).toBeCloseTo(0.35);
    let joinedCount = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      for (const c of out) {
        if (c.template !== 'joined') {
          continue;
        }
        joinedCount++;
        expect(c.name).not.toMatch(/\s/);
        expect(c.name).toMatch(/^[A-Z][a-z']*$/);
        expect(c.name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
        expect(countSyllables(c.name)).toBeLessThanOrEqual(NAME_MAX_SYLLABLES);
      }
    }
    expect(joinedCount).toBeGreaterThan(0);
  });

  it('접두어 스타일: prefix 후보는 접두어로 시작하고 18자 이하', () => {
    const style = styleById(data, 'prefix-classic');
    expect(style.prefix).toBe('Hanaori');
    let prefixCount = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      for (const c of out) {
        if (c.template !== 'prefix') {
          continue;
        }
        prefixCount++;
        expect(c.name.startsWith('Hanaori ')).toBe(true);
        expect(c.name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
      }
    }
    expect(prefixCount).toBeGreaterThan(0);
  });

  it('접두어를 주면 접두어 스타일의 후보도 그 접두어로 시작한다', () => {
    const owner = pickOwnerStyle('owner-custom-prefix', 'Velmora', data.styles);
    expect(owner.prefix).toBe('Velmora');
    const out = suggestNames(contextFor(owner), data, createRng(7), 8, NONE);
    for (const c of out) {
      if (c.template === 'prefix') {
        expect(c.name.startsWith('Velmora ')).toBe(true);
      }
    }
  });

  it('역사 인물 출처 이름은 historical.json 의 성에서만 온다', () => {
    const surnames = data.historical.map((p) => p.name.split(' ').pop() ?? '');
    const lowered = surnames.map((s) => s.toLowerCase());
    const style = styleById(data, 'classic-patron');
    let historicalCount = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      for (const c of out) {
        if (c.source !== 'historical') {
          continue;
        }
        historicalCount++;
        const low = c.name.toLowerCase();
        expect(lowered.some((s) => low.includes(s))).toBe(true);
      }
    }
    expect(historicalCount).toBeGreaterThan(0);
  });

  it('한 번의 호출 안에서 후보끼리 중복되지 않는다', () => {
    const style = styleById(data, 'terse-single');
    for (let seed = 1; seed <= 200; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      const keys = out.map((c) => normalizeName(c.name));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('등록된 이름과 같은 후보는 나오지 않는다', () => {
    const style = styleById(data, 'terse-single');
    const registry: NameRegistry = { isTaken: (n) => n === 'resolve' || n === 'endeavour' };
    for (let seed = 1; seed <= 100; seed++) {
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, registry);
      for (const c of out) {
        expect(['resolve', 'endeavour']).not.toContain(normalizeName(c.name));
      }
    }
  });
});

describe('nameForHorse', () => {
  const data = getNamingData();

  it('항상 검증을 통과하는 이름을 돌려주고 같은 시드면 같다', () => {
    const style = pickOwnerStyle('owner-horse', null, data.styles);
    for (let seed = 1; seed <= 300; seed++) {
      const name = nameForHorse(contextFor(style), data, createRng(seed), NONE);
      expect(validateHorseName(name, NONE, data.protectedNames).ok).toBe(true);
      expect(nameForHorse(contextFor(style), data, createRng(seed), NONE)).toBe(name);
    }
  });
});

describe('pickOwnerStyle', () => {
  const data = getNamingData();

  it('같은 마주는 항상 같은 스타일', () => {
    for (let i = 0; i < 100; i++) {
      const id = `ow-${i}`;
      const a = pickOwnerStyle(id, null, data.styles);
      const b = pickOwnerStyle(id, null, data.styles);
      expect(a.id).toBe(b.id);
    }
  });

  it('접두어를 주면 접두어 스타일 중에서 고르고 접두어를 바꾼 복사본을 돌려준다', () => {
    const original = data.styles.map((s) => ({ ...s }));
    const picked = pickOwnerStyle('ow-prefix', 'Sorrowan', data.styles);
    expect(picked.prefix).toBe('Sorrowan');
    expect(picked.sourceWeights).toEqual(data.styles.find((s) => s.id === picked.id)?.sourceWeights);
    expect(data.styles.map((s) => s.prefix)).toEqual(original.map((s) => s.prefix));
  });
});

describe('uniqueness and sources (10만 개)', () => {
  const data = getNamingData();

  // 실제 게임 조건: 망아지마다 부모가 다르다. 부모 이름은 실명 종마 이름에서 아비·어미 자리를 엇갈려 뽑는다
  const parentNames = Object.values(getStallionNames()).sort();
  function sweep(varyParents: boolean): { ratio: number; blockedHits: number } {
    const seen = new Set<string>();
    let produced = 0;
    let blockedHits = 0;
    for (let seed = 1; produced < 100_000; seed++) {
      const style = pickOwnerStyle(`owner-${seed % 500}`, null, data.styles);
      const base = contextFor(style, TRIBUTE_SURNAMES_MANY);
      const ctx = varyParents
        ? {
            ...base,
            sireName: parentNames[seed % parentNames.length] ?? null,
            damName: parentNames[(seed * 7 + 3) % parentNames.length] ?? null,
          }
        : base;
      for (const c of suggestNames(ctx, data, createRng(seed), 8, NONE)) {
        produced++;
        seen.add(normalizeName(c.name));
        if (hasBlockedPlaceToken(c.name, data.blockedPlaceTokens)) {
          blockedHits++;
        }
      }
    }
    return { ratio: seen.size / produced, blockedHits };
  }

  it('10만 개, 부모가 바뀌는 실제 조건: 고유 비율 0.78 이상, 차단 지명 토큰 포함 이름 0', () => {
    const result = sweep(true);
    expect(result.ratio).toBeGreaterThanOrEqual(0.78);
    expect(result.blockedHits).toBe(0);
  }, 120_000);

  it('10만 개, 부모 고정(최악 조건): 고유 비율 0.7 이상', () => {
    expect(sweep(false).ratio).toBeGreaterThanOrEqual(0.7);
  }, 120_000);
});

describe('마주 국적별 언어와 실제 지명 (M3-C7d)', () => {
  const data = getNamingData();
  const NATIVE_LANGS = ['fr', 'de', 'it', 'ar'] as const;
  /** 언어별 외국어 단어 비율 범위 (명세 수용 기준 2) */
  const RATIO_RANGE: Record<(typeof NATIVE_LANGS)[number], [number, number]> = {
    fr: [0.55, 0.85],
    de: [0.5, 0.8],
    it: [0.55, 0.85],
    ar: [0.7, 0.95],
  };
  const lower = (words: readonly string[]): Set<string> => new Set(words.map((w) => w.toLowerCase()));
  const realPlaceList = [...data.realPlaces.countries, ...data.realPlaces.regions, ...data.realPlaces.cities];
  const realPlaceExact = new Set(realPlaceList);
  const realPlaceNorm = realPlaceList.map((p) => normalizePlaceToken(p));

  it('국적 → 언어 매핑과 모국어 확률 (en 은 0)', () => {
    expect(LANGUAGE_BY_COUNTRY.FR).toBe('fr');
    expect(LANGUAGE_BY_COUNTRY.DE).toBe('de');
    expect(LANGUAGE_BY_COUNTRY.IT).toBe('it');
    expect(LANGUAGE_BY_COUNTRY.AE).toBe('ar');
    for (const c of ['GB', 'IE', 'US', 'AU', 'CA', 'NZ', 'JP', 'HK', 'AR'] as const) {
      expect(LANGUAGE_BY_COUNTRY[c], c).toBe('en');
    }
    expect(NATIVE_SHARE.en).toBe(0);
  });

  it('같은 시드·같은 언어면 결과가 완전히 같다', () => {
    for (const lang of NATIVE_LANGS) {
      const style = pickOwnerStyle(`owner-det-${lang}`, null, data.styles);
      const a = suggestNames(langContext(style, lang), data, createRng(9), 8, NONE);
      const b = suggestNames(langContext(style, lang), data, createRng(9), 8, NONE);
      expect(a, lang).toEqual(b);
    }
  });

  for (const lang of NATIVE_LANGS) {
    it(`${lang} 마주: 외국어 단어(연결어 포함)만으로 된 후보 비율이 범위 안에 있고 모두 검증을 통과한다 (1,000번×8)`, () => {
      const allowed = lower([...data.lexicon.foreign[lang], NATIVE_CONNECTOR[lang]]);
      let total = 0;
      let native = 0;
      let connectorHits = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const style = pickOwnerStyle(`owner-${seed}`, null, data.styles);
        const out = suggestNames(langContext(style, lang), data, createRng(seed), 8, NONE);
        for (const c of out) {
          total++;
          expect(validateHorseName(c.name, NONE, data.protectedNames, data.blockedPlaceTokens).ok, c.name).toBe(true);
          const words = c.name.split(' ');
          if (words.every((w) => allowed.has(w.toLowerCase()))) {
            native++;
          }
          if (words.some((w) => w.toLowerCase() === NATIVE_CONNECTOR[lang].toLowerCase())) {
            connectorHits++;
          }
        }
      }
      const [lo, hi] = RATIO_RANGE[lang];
      const ratio = native / total;
      expect(ratio, `${lang} ratio ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(lo);
      expect(ratio, `${lang} ratio ${ratio.toFixed(3)}`).toBeLessThanOrEqual(hi);
      expect(connectorHits, `${lang} connector`).toBeGreaterThan(0);
    }, 60_000);
  }

  it('모국어 후보는 외국어 단어 이유 문장을 단다', () => {
    const style = pickOwnerStyle('owner-note-fr', null, data.styles);
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      for (const c of suggestNames(langContext(style, 'fr'), data, createRng(seed), 8, NONE)) {
        if (c.source === 'foreign' && c.name.split(' ').length === 1) {
          expect(c.note).toMatch(/^프랑스어 단어 '[A-Za-z']+'$/);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('en 마주는 모국어 모드를 쓰지 않는다: 외국어 단어만으로 되고 영어 사전 단어가 없는 2단어 이상 후보 0 (1,000번×8)', () => {
    // 모국어 모드 후보는 외국어 사전 단어와 연결어만 쓴다. 영어 모드 후보는 영어 사전 단어를 반드시 하나 이상 쓴다
    // (외국어 사전과 겹치는 영어 수식어·명사, 예: Ardent, Wolf, 는 영어 모드 후보에 나올 수 있으므로 영어 사전 단어 유무로 가른다).
    const foreign = lower([
      ...data.lexicon.foreign.fr,
      ...data.lexicon.foreign.it,
      ...data.lexicon.foreign.de,
      ...data.lexicon.foreign.ar,
      'de',
      'di',
      'von',
      'Al',
    ]);
    const english = lower([
      ...data.lexicon.modifiers,
      ...data.lexicon.nouns,
      ...data.lexicon.verbs,
      ...data.lexicon.abstract,
      ...data.lexicon.places,
      ...data.lexicon.culture,
    ]);
    let nativeLike = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const style = pickOwnerStyle(`owner-${seed}`, null, data.styles);
      for (const c of suggestNames(contextFor(style), data, createRng(seed), 8, NONE)) {
        const words = c.name.split(' ').map((w) => w.toLowerCase());
        if (words.length >= 2 && words.every((w) => foreign.has(w) && !english.has(w))) {
          nativeLike++;
        }
      }
    }
    expect(nativeLike).toBe(0);
  }, 60_000);

  it('en 마주: 1,000번 중 실제 지명을 포함한 후보가 나온 비율 0.3 이상, 지명 단독 이름(예: Illinois)이 나온다', () => {
    let runsWithReal = 0;
    let exactHits = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const style = pickOwnerStyle(`owner-${seed}`, null, data.styles);
      const out = suggestNames(contextFor(style), data, createRng(seed), 8, NONE);
      let hit = false;
      for (const c of out) {
        if (realPlaceExact.has(c.name)) {
          exactHits++;
        }
        const padded = ` ${normalizePlaceToken(c.name)} `;
        if (realPlaceNorm.some((p) => padded.includes(` ${p} `))) {
          hit = true;
        }
      }
      if (hit) {
        runsWithReal++;
      }
    }
    expect(runsWithReal / 1000).toBeGreaterThanOrEqual(0.3);
    expect(exactHits).toBeGreaterThan(0);
  }, 120_000);

  it('차단 지명 토큰: 경마장 이름이 든 이름은 protected, 일반 지명은 통과', () => {
    const blocked = data.blockedPlaceTokens;
    for (const name of ['Ascot Lady', 'Lady Of Longchamp', 'Santa Anita Dream', "Ascot's Crown", 'Chester Star']) {
      expect(validateHorseName(name, NONE, data.protectedNames, blocked), name).toEqual({ ok: false, reason: 'protected' });
    }
    expect(hasBlockedPlaceToken('Silver Ascot Gold', blocked)).toBe(true);
    expect(validateHorseName('Illinois', NONE, data.protectedNames, blocked).ok).toBe(true);
    expect(validateHorseName('Japan Star', NONE, data.protectedNames, blocked).ok).toBe(true);
    expect(normalizePlaceToken("Cote d'Azur")).toBe('cote dazur');
    expect(normalizePlaceToken('Hamilton   Park')).toBe('hamilton park');
  });

  it('차단 토큰을 주지 않으면 차단 검사를 하지 않는다 (기존 3인자 호출)', () => {
    expect(validateHorseName('Ascot Lady', NONE, data.protectedNames).ok).toBe(true);
  });
});

describe('engine purity (naming)', () => {
  it('naming 폴더와 config 에 Math.random·Date.now·DOM 이 없다', () => {
    const dir = join(process.cwd(), 'src/engine/naming');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f));
    files.push(join(process.cwd(), 'src/engine/config/naming.ts'));
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/Math\.random|Date\.now|document\.|window\./);
    }
  });
});

describe('parseNamingData (보호 명단 조립)', () => {
  it('보호 명단은 protected.json 과 실명 종마 이름을 normalizeName 한 집합', () => {
    const data = getNamingData();
    expect(data.protectedNames.has('nijinsky')).toBe(true);
    expect(data.protectedNames.has('seathestars')).toBe(true);
    expect(data.protectedNames.has('mrprospector')).toBe(true);
  });

  it('실제 지명 목록과 차단 토큰 집합을 읽는다', () => {
    const data = getNamingData();
    expect(data.realPlaces.countries).toContain('Japan');
    expect(data.realPlaces.regions).toContain('Illinois');
    expect(data.realPlaces.cities).toContain('Los Angeles');
    expect(data.blockedPlaceTokens.has('ascot')).toBe(true);
    expect(data.blockedPlaceTokens.has('santa anita')).toBe(true);
  });

  it('형식이 틀리면 Error', () => {
    expect(() => parseNamingData({ version: 2 }, {}, {}, {}, {}, {})).toThrow();
  });
});
