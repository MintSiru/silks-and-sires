import { describe, expect, it } from 'vitest';
import salesJson from '../../data/sales/sales.json';
import realPlacesJson from '../../data/naming/real_places.json';
import type { SaleCompanyDef, SaleEventDef, SaleKind, SalesDataFile } from '../../src/engine/types/sales';

/** M4-C1 세일 캘린더 데이터 검증 (data/sales/sales.json). 명세: docs/specs/M4-C1-sale-calendar-data.md */

const data = salesJson as unknown as SalesDataFile;
const companies: SaleCompanyDef[] = data.companies;
const events: SaleEventDef[] = data.events;

const COMPANY_KEYS = ['country', 'id', 'name', 'prestige', 'venue'];
const EVENT_KEYS = ['books', 'buyerPremiumRate', 'companyId', 'id', 'kind', 'minimumBid', 'name', 'week'];
const BOOK_KEYS = ['book', 'lotsTarget', 'maxSireTier', 'weekOffset'];
const COUNTRIES = ['GB', 'IE', 'FR', 'DE', 'US'];
const KINDS: SaleKind[] = ['foal', 'yearling', 'breeze_up', 'horses_in_training', 'breeding_stock'];
const KIND_MIN: Record<SaleKind, number> = {
  yearling: 6,
  foal: 2,
  breeze_up: 2,
  horses_in_training: 2,
  breeding_stock: 3,
};

/** 게임 달력 주 → 월 (docs/specs/M4-C1-sale-calendar-data.md, 시작 주~끝 주) */
const MONTH_RANGES: Array<[string, number, number]> = [
  ['jan', 1, 5], ['feb', 6, 9], ['mar', 10, 13], ['apr', 14, 18],
  ['may', 19, 22], ['jun', 23, 26], ['jul', 27, 31], ['aug', 32, 35],
  ['sep', 36, 39], ['oct', 40, 44], ['nov', 45, 48], ['dec', 49, 52],
];
const MONTH_ABBRS = MONTH_RANGES.map(([m]) => m);

function monthOfWeek(week: number): string {
  const hit = MONTH_RANGES.find(([, from, to]) => week >= from && week <= to);
  if (!hit) throw new Error(`week out of range: ${week}`);
  return hit[0];
}

/** 실제 세일 회사명(원칙 1). 소문자 단어 단위 비교 */
const REAL_SALE_NAMES = [
  'Tattersalls', 'Tattersall', 'Tattersalls Ireland', 'Goffs', 'Arqana', 'Keeneland', 'Fasig-Tipton',
  'Fasig', 'BBAG', 'OBS', 'Inglis', 'Magic Millions', 'Book 1', 'Orby', 'Houghton', 'Arc Sale',
  'Weatherbys', 'Brightwells', 'Ocala', 'Ballsbridge',
];

/** 실제 경마장·소재 지명 차단 토큰 (data/naming/real_places.json blockedTokens) */
const BLOCKED_PLACE_TOKENS = (realPlacesJson as unknown as { blockedTokens: string[] }).blockedTokens;

/** 문자열을 소문자 단어열로 정규화하고 앞뒤에 공백을 붙인다(단어 경계 비교용). */
function wordPadded(text: string): string {
  const words = text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return ` ${words} `;
}

/** text 안에 phrase 가 단어 단위로 들어 있는지 */
function containsWordPhrase(text: string, phrase: string): boolean {
  return wordPadded(text).includes(wordPadded(phrase));
}

function findBlocked(text: string, tokens: string[]): string[] {
  return tokens.filter((t) => containsWordPhrase(text, t));
}

describe('세일 데이터 스키마 (sales.json)', () => {
  it('version 1, companies·events 배열이다', () => {
    expect(data.version).toBe(1);
    expect(Array.isArray(data.companies)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
  });

  it('회사 필드는 정확히 스키마 키만 가지고 형식이 맞다', () => {
    for (const c of companies) {
      expect(Object.keys(c).sort()).toEqual(COMPANY_KEYS);
      expect(c.id).toMatch(/^sco_[a-z]+(_[a-z]+)*$/);
      expect(typeof c.name).toBe('string');
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(typeof c.venue).toBe('string');
      expect(c.venue.trim().length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(c.prestige);
    }
  });

  it('세일 이벤트 필드는 정확히 스키마 키만 가지고 형식이 맞다', () => {
    for (const e of events) {
      expect(Object.keys(e).sort()).toEqual(EVENT_KEYS);
      expect(e.id).toMatch(/^sev_[a-z]+(_[a-z]+)*$/);
      expect(typeof e.name).toBe('string');
      expect(e.name.trim().length).toBeGreaterThan(0);
      expect(KINDS).toContain(e.kind);
      expect(Number.isInteger(e.week)).toBe(true);
      expect(Number.isInteger(e.minimumBid)).toBe(true);
      expect(Array.isArray(e.books)).toBe(true);
      expect(e.books.length).toBeGreaterThan(0);
    }
  });

  it('회사 id·세일 id 는 중복이 없다', () => {
    const companyIds = companies.map((c) => c.id);
    const eventIds = events.map((e) => e.id);
    expect(new Set(companyIds).size).toBe(companyIds.length);
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it('세일 event.companyId 는 모두 존재하는 회사를 가리킨다', () => {
    const companyIds = new Set(companies.map((c) => c.id));
    for (const e of events) {
      expect(companyIds.has(e.companyId), `${e.id} -> ${e.companyId}`).toBe(true);
    }
  });

  it('세일 id 는 회사 약칭(sco_ 뒤 부분)으로 시작하고 끝에 월 약칭이 붙으며 week 의 월과 일치한다', () => {
    for (const e of events) {
      const suffix = e.companyId.replace(/^sco_/, '');
      expect(e.id.startsWith(`sev_${suffix}_`), e.id).toBe(true);
      const last = e.id.split('_').pop() ?? '';
      expect(MONTH_ABBRS, e.id).toContain(last);
      expect(last, e.id).toBe(monthOfWeek(e.week));
    }
  });

  it('week 는 1~52 이고 모든 북의 week+weekOffset 은 52 를 넘지 않는다', () => {
    for (const e of events) {
      expect(e.week).toBeGreaterThanOrEqual(1);
      expect(e.week).toBeLessThanOrEqual(52);
      for (const b of e.books) {
        expect(e.week + b.weekOffset, e.id).toBeLessThanOrEqual(52);
      }
    }
  });

  it('북: 번호는 1부터 연속, 필드 형식, 첫 북 weekOffset 0, 북 사이 weekOffset 차이는 0 또는 1', () => {
    for (const e of events) {
      e.books.forEach((b, i) => {
        expect(Object.keys(b).sort(), e.id).toEqual(BOOK_KEYS);
        expect(b.book, e.id).toBe(i + 1);
        expect(Number.isInteger(b.weekOffset) && b.weekOffset >= 0, e.id).toBe(true);
        expect(Number.isInteger(b.lotsTarget) && b.lotsTarget > 0, e.id).toBe(true);
        expect([1, 2, 3, 4, 5]).toContain(b.maxSireTier);
      });
      expect(e.books[0]?.weekOffset, e.id).toBe(0);
      for (let i = 1; i < e.books.length; i++) {
        const diff = (e.books[i]?.weekOffset ?? 0) - (e.books[i - 1]?.weekOffset ?? 0);
        expect([0, 1], `${e.id} book ${i + 1}`).toContain(diff);
      }
    }
  });

  it('북의 maxSireTier 는 단조 비감소이고 lotsTarget 은 뒤로 갈수록 커진다(비감소)', () => {
    for (const e of events) {
      for (let i = 1; i < e.books.length; i++) {
        const prev = e.books[i - 1];
        const cur = e.books[i];
        expect(cur?.maxSireTier ?? 0, e.id).toBeGreaterThanOrEqual(prev?.maxSireTier ?? 0);
        expect(cur?.lotsTarget ?? 0, e.id).toBeGreaterThanOrEqual(prev?.lotsTarget ?? 0);
      }
    }
  });

  it('수치 범위: buyerPremiumRate 0.03~0.06, minimumBid 1,000~5,000', () => {
    for (const e of events) {
      expect(e.buyerPremiumRate, e.id).toBeGreaterThanOrEqual(0.03);
      expect(e.buyerPremiumRate, e.id).toBeLessThanOrEqual(0.06);
      expect(e.minimumBid, e.id).toBeGreaterThanOrEqual(1000);
      expect(e.minimumBid, e.id).toBeLessThanOrEqual(5000);
    }
  });
});

describe('세일 데이터 구성 (명세 내용)', () => {
  it('회사는 5곳이고 나라가 GB·IE·FR·DE·US 각 1곳씩이다', () => {
    expect(companies).toHaveLength(5);
    expect(companies.map((c) => c.country).sort()).toEqual([...COUNTRIES].sort());
  });

  it('세일은 14~18개다', () => {
    expect(events.length).toBeGreaterThanOrEqual(14);
    expect(events.length).toBeLessThanOrEqual(18);
  });

  it('종류별 최소 개수를 충족한다 (yearling 6, foal 2, breeze_up 2, horses_in_training 2, breeding_stock 3)', () => {
    for (const kind of KINDS) {
      const count = events.filter((e) => e.kind === kind).length;
      expect(count, kind).toBeGreaterThanOrEqual(KIND_MIN[kind]);
    }
  });

  it('미국 9월 초대형 1세마 세일은 북 5개 이상이다', () => {
    const us = companies.find((c) => c.country === 'US');
    expect(us).toBeDefined();
    const usYearling = events.filter((e) => e.companyId === us?.id && e.kind === 'yearling');
    const big = usYearling.find((e) => e.week >= 36 && e.week <= 39);
    expect(big, 'US 9월 1세마 세일').toBeDefined();
    expect(big?.books.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('대형 1세마 세일(북 3개 이상)은 북 1 lotsTarget 100~250, 나머지 250~600, 북 1 maxSireTier 1 이다', () => {
    const big = events.filter((e) => e.kind === 'yearling' && e.books.length >= 3);
    expect(big.length).toBeGreaterThan(0);
    for (const e of big) {
      expect(e.books[0]?.lotsTarget ?? 0, e.id).toBeGreaterThanOrEqual(100);
      expect(e.books[0]?.lotsTarget ?? 0, e.id).toBeLessThanOrEqual(250);
      expect(e.books[0]?.maxSireTier, e.id).toBe(1);
      expect(e.books.length, e.id).toBeLessThanOrEqual(6);
      for (const b of e.books.slice(1)) {
        expect(b.lotsTarget, e.id).toBeGreaterThanOrEqual(250);
        expect(b.lotsTarget, e.id).toBeLessThanOrEqual(600);
      }
    }
  });

  it('소형 세일(북 1개)의 북 maxSireTier 는 5 다', () => {
    for (const e of events.filter((ev) => ev.books.length === 1)) {
      expect(e.books[0]?.maxSireTier, e.id).toBe(5);
    }
  });
});

describe('세일 이름·장소 원칙 1 (실명 금지)', () => {
  it('회사 이름·장소에 실제 세일 회사명이 없다', () => {
    for (const c of companies) {
      expect(findBlocked(c.name, REAL_SALE_NAMES), c.name).toEqual([]);
      expect(findBlocked(c.venue, REAL_SALE_NAMES), c.venue).toEqual([]);
    }
  });

  it('세일 이름에 실제 세일 회사명이 없다', () => {
    for (const e of events) {
      expect(findBlocked(e.name, REAL_SALE_NAMES), e.name).toEqual([]);
    }
  });

  it('회사 이름·장소·세일 이름에 실제 경마장·소재 지명(blockedTokens)이 없다', () => {
    for (const c of companies) {
      expect(findBlocked(c.name, BLOCKED_PLACE_TOKENS), c.name).toEqual([]);
      expect(findBlocked(c.venue, BLOCKED_PLACE_TOKENS), c.venue).toEqual([]);
    }
    for (const e of events) {
      expect(findBlocked(e.name, BLOCKED_PLACE_TOKENS), e.name).toEqual([]);
    }
  });

  it('회사 이름과 세일 이름에 실제 레이스 전체 이름 조합(Epsom Derby 등)이 없다', () => {
    const REAL_RACE_PHRASES = ['Epsom Derby', 'Irish Derby', 'Kentucky Derby', 'Irish Oaks', 'King George', 'Prix de l\'Arc'];
    for (const text of [...companies.map((c) => c.name), ...events.map((e) => e.name)]) {
      expect(findBlocked(text, REAL_RACE_PHRASES), text).toEqual([]);
    }
  });
});
