import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { getNamingData, getStallionNames, parseLandmarks } from '../../src/engine/data/staticData';
import { nameForHorse, pickOwnerStyle, suggestNames } from '../../src/engine/naming/generate';
import { normalizeName, validateHorseName } from '../../src/engine/naming/validate';
import type { NameCandidate, NameRegistry, NamingContext, NamingData } from '../../src/engine/naming/types';

/** M3-C7f2: 명승고적·작품 제목을 이름 생성기에 연결 */

const NONE: NameRegistry = { isTaken: () => false };
const TRIBUTE = ['Harnwell', 'Tessmoor', 'Vellacourt', 'Askerby', 'Dunrowan', 'Ferrimere', 'Garrowby', 'Holmcastle'];
/**
 * 빈 landmarks·workTitles 일 때 생성 결과의 SHA-256(회귀 고정값).
 * C7f2 승인 때 c900c58(M3-C7e2) 덤프와 같음을 확인했다(당시 값 4d467cf3…, 부모 이름 = 종마 이름 전체).
 * M2-02 에서 종마가 늘어 표본이 바뀌지 않게 부모 이름을 고정 목록(FINGERPRINT_PARENTS)으로 바꾸고 다시 고정했다.
 * 어휘 사전(lexicon)·보호 명단을 바꾸면 이 값도 다시 덤프해 맞춘다.
 * 2026-10-15 재고정: 어휘 'Destino' 삭제(같은 이름 실존 종마 추가).
 */
const HEAD_FINGERPRINT = '9687d72673ca9d40ddc4a28928a542c5b07f536c2b6b2f1f1673918e0e6934f0';
/** 지문 표본의 부·모 이름(종마 데이터 추가에 영향받지 않게 고정) */
const FINGERPRINT_PARENTS = [
  'Dubawi', 'Frankel', 'Galileo', 'Kingman', 'Lope de Vega', 'Night of Thunder', 'Siyouni', 'Sea The Stars',
  'Into Mischief', 'Tapit', 'Curlin', 'Justify', 'Camelot', 'Kodiac', 'Dark Angel', 'Oasis Dream',
  'Teofilo', 'Wootton Bassett', 'No Nay Never', 'Showcasing', 'Nathaniel', 'Golden Horn', 'Too Darn Hot', 'Blue Point',
].sort();

const DATA = getNamingData();
const PARENT_NAMES = Object.values(getStallionNames()).sort();

function withTitles(landmarks: string[], workTitles: string[]): NamingData {
  return { ...DATA, landmarks, workTitles };
}

/** 명승고적·작품 제목 출처 후보인지 */
function isTitled(c: NameCandidate): boolean {
  return c.note.startsWith('명승고적 ') || c.note.startsWith('작품 제목 ');
}

/**
 * 영어 모드 표본: 서로 다른 시드 n 개마다 마주 스타일을 해시로 고른 이름 한 개씩.
 * (owner-styles.json 에 'world' 스타일이 없어서, 게임의 마주 분포처럼 모든 스타일을 섞는다.)
 */
function worldSample(data: NamingData, n: number): NameCandidate[] {
  const out: NameCandidate[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const ctx: NamingContext = {
      sireName: 'Sea The Stars',
      damName: 'Silver Tide',
      style: pickOwnerStyle(`owner-${seed}`, null, data.styles),
      tributeNames: TRIBUTE,
      language: 'en',
    };
    const [c] = suggestNames(ctx, data, createRng(seed), 1, NONE);
    if (c !== undefined) {
      out.push(c);
    }
  }
  return out;
}

/**
 * HEAD 덤프와 같은 표본의 지문. 언어별 8개×400 시드(후보 객체 전체), 단일 2000 시드(suggestNames 결과 배열 그대로),
 * nameForHorse 300 시드 순서로 JSON 을 이어 SHA-256 을 낸다.
 */
function fingerprint(data: NamingData): string {
  const result: Record<string, unknown> = {};
  for (const lang of ['en', 'fr', 'de', 'it', 'ar'] as const) {
    const rows: NameCandidate[][] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const ctx: NamingContext = {
        sireName: seed % 2 ? 'Sea The Stars' : (FINGERPRINT_PARENTS[seed % FINGERPRINT_PARENTS.length] ?? null),
        damName: seed % 3 ? 'Silver Tide' : (FINGERPRINT_PARENTS[(seed * 7 + 3) % FINGERPRINT_PARENTS.length] ?? null),
        style: pickOwnerStyle(`owner-${seed}`, null, data.styles),
        tributeNames: TRIBUTE,
        language: lang,
      };
      rows.push(suggestNames(ctx, data, createRng(seed), 8, NONE));
    }
    result[lang] = rows;
  }
  const single: NameCandidate[][] = [];
  for (let seed = 1; seed <= 2000; seed++) {
    const ctx: NamingContext = {
      sireName: 'Sea The Stars',
      damName: 'Silver Tide',
      style: pickOwnerStyle(`owner-${seed}`, null, data.styles),
      tributeNames: TRIBUTE,
      language: 'en',
    };
    single.push(suggestNames(ctx, data, createRng(seed), 1, NONE));
  }
  result['single2000'] = single;
  const horse: string[] = [];
  for (let seed = 1; seed <= 300; seed++) {
    const ctx: NamingContext = {
      sireName: 'Sea The Stars',
      damName: 'Silver Tide',
      style: pickOwnerStyle('owner-horse', null, data.styles),
      tributeNames: TRIBUTE,
      language: 'en',
    };
    horse.push(nameForHorse(ctx, data, createRng(seed), NONE));
  }
  result['horse300'] = horse;
  return createHash('sha256').update(JSON.stringify(result)).digest('hex');
}

describe('landmarks.json 데이터와 파싱 (M3-C7f2)', () => {
  it('명승고적·작품 제목 목록을 읽고, 보호 명단과 겹치는 이름은 두 목록 어디에도 없다', () => {
    expect(DATA.landmarks.length).toBeGreaterThan(0);
    expect(DATA.workTitles.length).toBeGreaterThan(0);
    for (const name of [...DATA.landmarks, ...DATA.workTitles]) {
      expect(DATA.protectedNames.has(normalizeName(name)), name).toBe(false);
    }
  });

  it('parseLandmarks 는 보호 명단과 겹치는 항목을 뺀다', () => {
    const raw = {
      version: 1,
      landmarks: [
        { name: 'Nijinsky', kind: 'natural', country: 'GB' },
        { name: 'Snowdon', kind: 'natural', country: 'GB' },
      ],
      works: [{ name: 'Mill Reef', kind: 'book', year: 1900, titleType: 'proper' }, { name: 'Swan Lake', kind: 'ballet', year: 1877, titleType: 'phrase' }],
    };
    const parsed = parseLandmarks(raw, new Set(['nijinsky', 'millreef']));
    expect(parsed.landmarks).toEqual(['Snowdon']);
    expect(parsed.workTitles).toEqual(['Swan Lake']);
  });

  it('형식이 틀리면 Error', () => {
    expect(() => parseLandmarks({ version: 2, landmarks: [], works: [] }, new Set())).toThrow();
    expect(() => parseLandmarks({ version: 1, landmarks: [{ name: '' }], works: [] }, new Set())).toThrow();
  });
});

describe('명승고적·작품 제목 출처 (영어 모드)', () => {
  it('빈 landmarks·workTitles 는 HEAD(c900c58)와 같은 생성 결과를 낸다 (SHA-256 대조, 난수를 더 쓰지 않는다)', () => {
    expect(fingerprint(withTitles([], []))).toBe(HEAD_FINGERPRINT);
  }, 120_000);

  it('2,000개 표본: 명승고적·작품 제목 출처가 2% 이상 20% 이하, 붙여 쓰기가 1개 이상', () => {
    const sample = worldSample(DATA, 2000);
    expect(sample.length).toBeGreaterThanOrEqual(1990);
    const titled = sample.filter(isTitled);
    const ratio = titled.length / sample.length;
    expect(ratio, `ratio ${ratio.toFixed(4)}`).toBeGreaterThanOrEqual(0.02);
    expect(ratio, `ratio ${ratio.toFixed(4)}`).toBeLessThanOrEqual(0.2);
    expect(titled.filter((c) => c.template === 'joined').length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('제목 후보의 이유 문장은 명승고적·작품 제목 형식이고 출처가 맞다', () => {
    for (const c of worldSample(DATA, 2000)) {
      if (c.note.startsWith('명승고적 ')) {
        expect(c.source).toBe('place');
        expect(c.note).toMatch(/^명승고적 '.+' 에서$/);
      } else if (c.note.startsWith('작품 제목 ')) {
        expect(c.source).toBe('culture');
        expect(c.note).toMatch(/^작품 제목 '.+' 에서$/);
      }
    }
  }, 120_000);

  it('생성된 이름은 전부 검증을 통과하고 보호 명단·실명 종마 이름과 같지 않다', () => {
    const stallionNormalized = new Set(PARENT_NAMES.map((n) => normalizeName(n)));
    for (const c of worldSample(DATA, 2000)) {
      const v = validateHorseName(c.name, NONE, DATA.protectedNames, DATA.blockedPlaceTokens);
      expect(v.ok, c.name).toBe(true);
      expect(stallionNormalized.has(normalizeName(c.name)), c.name).toBe(false);
      expect(c.name.length).toBeLessThanOrEqual(18);
    }
  }, 120_000);

  it('붙여 쓰기: 제목을 고른 후보는 joined 면 공백 없는 형태, single 이면 제목 그대로다 (템플릿 무시)', () => {
    const data = withTitles(['Ponte Vecchio'], ['Swan Lake']);
    const titled = worldSample(data, 2000).filter(isTitled);
    expect(titled.length).toBeGreaterThan(0);
    for (const c of titled) {
      if (c.note.startsWith('명승고적 ')) {
        expect(c.name, c.note).toBe(c.template === 'joined' ? 'Pontevecchio' : 'Ponte Vecchio');
      } else {
        expect(c.name, c.note).toBe(c.template === 'joined' ? 'Swanlake' : 'Swan Lake');
      }
    }
    expect(titled.some((c) => c.template === 'joined')).toBe(true);
    expect(titled.some((c) => c.template === 'single')).toBe(true);
  }, 120_000);

  it('길이 제한: 띄어 쓰면 19자 이상이어도 붙여 쓰면 18자 이하인 제목은 붙여 쓴 형태로만 나온다', () => {
    // "Ponte Vecchio Bridge" 는 띄어 쓰면 20자(등록 불가)다. 붙이면 "Pontevecchiobridge" 18자.
    const data = withTitles(['Ponte Vecchio Bridge'], []);
    const titled = worldSample(data, 2000).filter(isTitled);
    expect(titled.length).toBeGreaterThan(0);
    for (const c of titled) {
      expect(c.template).toBe('joined');
      expect(c.name).toBe('Pontevecchiobridge');
    }
  }, 120_000);

  it('차단 지명 토큰이 든 명승고적은 풀에서 빠진다: 그 목록만 준 결과가 빈 목록 결과와 같다', () => {
    expect(DATA.blockedPlaceTokens.has('ascot')).toBe(true);
    const blockedOnly = worldSample(withTitles(['Ascot Park Gate'], []), 1000);
    const empty = worldSample(withTitles([], []), 1000);
    expect(blockedOnly).toEqual(empty);
  }, 120_000);

  it('같은 시드·같은 데이터면 결과가 완전히 같다', () => {
    expect(worldSample(DATA, 300)).toEqual(worldSample(DATA, 300));
  }, 120_000);
});

describe('18자 초과 제목 (사용자 결정 2026-10-12)', () => {
  it('parseLandmarks: 공백 포함 18자 넘는 제목은 붙여 쓴 길이가 18자 이하일 때만 넣는다', () => {
    const raw = {
      version: 1,
      landmarks: [{ name: 'Save the Last Dance', kind: 'film', country: 'US' }],
      works: [
        { name: 'Save the Last Dance', kind: 'film', year: 2001, titleType: 'phrase' },
        { name: 'Abcdefg Hijklmnopqrstu', kind: 'book', year: 1900, titleType: 'proper' },
        { name: 'Swan Lake', kind: 'ballet', year: 1877, titleType: 'phrase' },
      ],
    };
    const parsed = parseLandmarks(raw, new Set());
    expect(parsed.landmarks).toEqual(['Save the Last Dance']);
    expect(parsed.workTitles).toEqual(['Save the Last Dance', 'Swan Lake']);
  });

  it('생성기: 긴 제목만 넣은 NamingData 는 붙여 쓴 "Savethelastdance" 를 낸다 (띄어 쓴 형태는 나오지 않는다)', () => {
    const data = withTitles(['Save the Last Dance'], []);
    const titled = worldSample(data, 2000).filter(isTitled);
    expect(titled.length).toBeGreaterThan(0);
    for (const c of titled) {
      expect(c.name).toBe('Savethelastdance');
      expect(c.template).toBe('joined');
      expect(c.note).toBe("명승고적 'Save the Last Dance' 에서");
    }
  }, 120_000);

  it('생성기: 긴 제목은 붙여 쓰기 확률과 상관없이 항상 붙여 쓴다 (작품 제목 출처도 같다)', () => {
    const data = withTitles([], ['Save the Last Dance']);
    const titled = worldSample(data, 2000).filter(isTitled);
    expect(titled.length).toBeGreaterThan(0);
    for (const c of titled) {
      expect(c.name).toBe('Savethelastdance');
      expect(c.template).toBe('joined');
    }
  }, 120_000);

  it('생성기: 띄어 쓰기도 붙여 쓰기도 18자를 넘는 제목(직접 넣은 경우)은 후보를 만들지 않는다', () => {
    const data = withTitles(['Abcdefg Hijklmnopqrstuvwxyz'], []);
    const titled = worldSample(data, 2000).filter(isTitled);
    expect(titled.length).toBe(0);
    for (const c of worldSample(data, 300)) {
      expect(c.name.length).toBeLessThanOrEqual(18);
    }
  }, 120_000);
});

describe('출처 표기: 명승고적 풀은 명승고적, 작품 풀은 작품 제목 (M3-C7f2 보정)', () => {
  /** note 의 작은따옴표 안 제목 */
  function quotedTitle(note: string): string {
    const m = /'(.+)' 에서$/.exec(note);
    if (m === null) {
      throw new Error(`표기 형식 아님: ${note}`);
    }
    return m[1] ?? '';
  }

  it('명승고적 풀에서 나온 제목은 명승고적으로, 작품 풀에서 나온 제목은 작품 제목으로 표기된다 (실제 데이터)', () => {
    const landmarks = new Set(DATA.landmarks);
    const works = new Set(DATA.workTitles);
    const titled = worldSample(DATA, 2000).filter(isTitled);
    expect(titled.length).toBeGreaterThan(0);
    for (const c of titled) {
      const text = quotedTitle(c.note);
      if (c.note.startsWith('명승고적 ')) {
        expect(c.source, c.note).toBe('place');
        expect(landmarks.has(text), c.note).toBe(true);
      } else {
        expect(c.source, c.note).toBe('culture');
        expect(works.has(text), c.note).toBe(true);
      }
    }
  }, 120_000);

  it('긴 제목 "Save the Last Dance" 를 작품 풀에 넣으면 작품 제목, 명승고적 풀에 넣으면 명승고적으로 표기된다', () => {
    const asWork = worldSample(withTitles([], ['Save the Last Dance']), 2000).filter(isTitled);
    const asLandmark = worldSample(withTitles(['Save the Last Dance'], []), 2000).filter(isTitled);
    expect(asWork.length).toBeGreaterThan(0);
    expect(asLandmark.length).toBeGreaterThan(0);
    for (const c of asWork) {
      expect(c.note).toBe("작품 제목 'Save the Last Dance' 에서");
      expect(c.name).toBe('Savethelastdance');
    }
    for (const c of asLandmark) {
      expect(c.note).toBe("명승고적 'Save the Last Dance' 에서");
      expect(c.name).toBe('Savethelastdance');
    }
  }, 120_000);
});
