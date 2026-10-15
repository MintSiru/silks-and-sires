import { describe, expect, it } from 'vitest';
import bookmakersJson from '../../data/betting/bookmakers.json';
import sponsorshipsJson from '../../data/calendar/sponsorships.json';
import salesJson from '../../data/sales/sales.json';
import racecoursesJson from '../../data/racecourses.json';
import realPlacesJson from '../../data/naming/real_places.json';
import g1Json from '../../data/calendar/g1.json';
import g1ExtraJson from '../../data/calendar/g1_extra.json';
import patternGbIeJson from '../../data/calendar/pattern_gb_ie.json';
import patternFrDeItJson from '../../data/calendar/pattern_fr_de_it.json';
import type {
  BookmakerDef,
  BookmakersDataFile,
  SponsorshipDef,
  SponsorshipsDataFile,
} from '../../src/engine/types/betting';

/** M4-BET1 가상 베팅 회사·스폰서 레이스 데이터 검증. 명세: docs/specs/M4-BET1-bookmakers-sponsorships-data.md */

interface TemplateLite {
  id: string;
  name: string;
  racecourseId: string;
  kind: string;
  grade: string | null;
}
interface CourseLite {
  id: string;
  country: string;
}
interface CompanyLite {
  id: string;
  name: string;
  country: string;
}

const bookmakersData = bookmakersJson as unknown as BookmakersDataFile;
const sponsorshipsData = sponsorshipsJson as unknown as SponsorshipsDataFile;
const BOOKMAKERS: BookmakerDef[] = bookmakersData.bookmakers;
const SPONSORSHIPS: SponsorshipDef[] = sponsorshipsData.sponsorships;
const COMPANIES = (salesJson as unknown as { companies: CompanyLite[] }).companies;
const COURSES = racecoursesJson as unknown as CourseLite[];

const TEMPLATES: TemplateLite[] = (
  [g1Json, g1ExtraJson, patternGbIeJson, patternFrDeItJson] as unknown as TemplateLite[][]
).flat();

const BOOKMAKER_KEYS = ['id', 'name', 'shortName'];
const SPONSORSHIP_KEYS = ['nameFormat', 'prizeMultiplier', 'sponsor', 'templateId'];
const SPONSOR_KEYS = ['id', 'kind'];
const SPONSOR_KINDS = ['bookmaker', 'sale_company'];
const NAME_MAX_LENGTH = 60;
const SPONSORSHIP_COUNT_MIN = 24;
const SPONSORSHIP_COUNT_MAX = 30;
const BOOKMAKER_COUNT = 4;
const BOOKMAKER_SPONSOR_MIN = 3;
const BOOKMAKER_SPONSOR_MAX = 5;
const SALE_SPONSOR_MIN = 2;
const SALE_SPONSOR_MAX = 3;
const G1_SPONSOR_MAX = 4;

/** 원칙 1: 실존 베팅 회사·브랜드·스폰서 단어(단어 단위 비교) */
const FORBIDDEN_BRANDS = [
  'bet365', 'William Hill', 'Ladbrokes', 'Coral', 'Paddy Power', 'Betfair', 'Sky Bet', 'Betfred',
  'BoyleSports', 'Unibet', 'Betway', 'PMU', 'Tote', 'Betvictor', 'Victor Chandler', '888', 'BetMGM',
  'DraftKings', 'FanDuel', 'Kindred', 'Entain', 'Flutter', 'Qipco', 'Longines', 'Betdaq', 'Matchbook',
  'Smarkets', 'Betano', 'Lottoland', 'Spreadex', 'Sporting Index', 'Done Brothers', 'Mecca', 'Stanley',
  'Hills', 'Gala',
];

/** 실존 레이스 전체 이름·실제 레이스명(클래식 유형명은 실제 경마장과 결합된 것만 허용) */
const REAL_RACE_NAMES = [
  'Epsom Derby', 'Irish Derby', 'Kentucky Derby', 'Irish Oaks', 'Epsom Oaks', 'Ascot Gold Cup',
  'Cheltenham Gold Cup', 'Irish Gold Cup', 'Tattersalls Gold Cup', 'King George', 'Eclipse Stakes',
  'Sussex Stakes', 'Coronation Cup', 'Prince of Wales', 'Champion Stakes', 'Irish Champion Stakes',
  'Breeders Cup', "Breeders' Cup", 'Arc de Triomphe', "Prix de l'Arc", 'Melbourne Cup',
  'Dubai World Cup', 'Goodwood Cup', 'Yorkshire Oaks', 'Juddmonte', 'Dewhurst Stakes', 'Phoenix Stakes',
  'Racing Post Trophy', 'Coral-Eclipse', 'Coral Eclipse', 'Derrinstown', 'Moyglare', 'Irish Field',
];

/** 실제 세일 회사명(tests/data/sales.test.ts 와 동일) */
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

function findHits(text: string, tokens: string[]): string[] {
  return tokens.filter((t) => containsWordPhrase(text, t));
}

function templateById(id: string): TemplateLite {
  const hit = TEMPLATES.find((t) => t.id === id);
  if (!hit) throw new Error(`unknown templateId: ${id}`);
  return hit;
}

function courseCountry(courseId: string): string {
  const hit = COURSES.find((c) => c.id === courseId);
  if (!hit) throw new Error(`unknown racecourse: ${courseId}`);
  return hit.country;
}

/** 스폰서 표시 이름: 베팅 회사는 shortName(없으면 name), 세일 회사는 name */
function sponsorDisplayName(s: SponsorshipDef): string {
  if (s.sponsor.kind === 'bookmaker') {
    const bm = BOOKMAKERS.find((b) => b.id === s.sponsor.id);
    if (!bm) throw new Error(`unknown bookmaker: ${s.sponsor.id}`);
    return bm.shortName ?? bm.name;
  }
  const co = COMPANIES.find((c) => c.id === s.sponsor.id);
  if (!co) throw new Error(`unknown sale company: ${s.sponsor.id}`);
  return co.name;
}

/** 자리표시자를 치환한 최종 레이스 이름 */
function finalRaceName(s: SponsorshipDef): string {
  const tpl = templateById(s.templateId);
  return s.nameFormat.split('{sponsor}').join(sponsorDisplayName(s)).split('{race}').join(tpl.name);
}

describe('베팅 회사 데이터 (bookmakers.json)', () => {
  it('version 1, 가상 베팅 회사 4곳이다', () => {
    expect(bookmakersData.version).toBe(1);
    expect(Array.isArray(BOOKMAKERS)).toBe(true);
    expect(BOOKMAKERS).toHaveLength(BOOKMAKER_COUNT);
  });

  it('각 회사는 스키마 키만 가지고 형식이 맞다', () => {
    for (const bm of BOOKMAKERS) {
      expect(Object.keys(bm).sort()).toEqual(BOOKMAKER_KEYS);
      expect(bm.id).toMatch(/^bm_[a-z]+(_[a-z]+)*$/);
      expect(bm.name).toBe(bm.name.trim());
      expect(bm.name.length).toBeGreaterThan(0);
      if (bm.shortName !== null) {
        expect(typeof bm.shortName).toBe('string');
        expect(bm.shortName).toBe(bm.shortName.trim());
        expect(bm.shortName.length).toBeGreaterThan(0);
      }
    }
  });

  it('id 와 name 이 중복되지 않는다', () => {
    const ids = BOOKMAKERS.map((b) => b.id);
    const names = BOOKMAKERS.map((b) => b.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('회사명·짧은 이름에 실존 베팅 회사·브랜드 단어가 없다', () => {
    for (const bm of BOOKMAKERS) {
      const texts = [bm.name, bm.shortName ?? ''];
      for (const text of texts) {
        expect(findHits(text, FORBIDDEN_BRANDS)).toEqual([]);
        expect(findHits(text, BLOCKED_PLACE_TOKENS)).toEqual([]);
        expect(findHits(text, REAL_SALE_NAMES)).toEqual([]);
      }
    }
  });
});

describe('스폰서 레이스 데이터 (sponsorships.json)', () => {
  it('version 1, sponsorships 배열이 24~30건이다', () => {
    expect(sponsorshipsData.version).toBe(1);
    expect(Array.isArray(SPONSORSHIPS)).toBe(true);
    expect(SPONSORSHIPS.length).toBeGreaterThanOrEqual(SPONSORSHIP_COUNT_MIN);
    expect(SPONSORSHIPS.length).toBeLessThanOrEqual(SPONSORSHIP_COUNT_MAX);
  });

  it('각 항목은 스키마 키만 가지고 형식이 맞다', () => {
    for (const s of SPONSORSHIPS) {
      expect(Object.keys(s).sort()).toEqual(SPONSORSHIP_KEYS);
      expect(Object.keys(s.sponsor).sort()).toEqual(SPONSOR_KEYS);
      expect(SPONSOR_KINDS).toContain(s.sponsor.kind);
      expect(typeof s.sponsor.id).toBe('string');
      expect(typeof s.nameFormat).toBe('string');
      expect(s.nameFormat).toContain('{sponsor}');
      expect(s.nameFormat.replace(/\{sponsor\}|\{race\}/g, '')).not.toMatch(/[{}]/);
      expect(typeof s.prizeMultiplier).toBe('number');
      expect(s.prizeMultiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it('templateId 는 실제 템플릿 id 이고 템플릿당 스폰서는 최대 1건이다', () => {
    const ids = SPONSORSHIPS.map((s) => s.templateId);
    for (const id of ids) {
      expect(TEMPLATES.some((t) => t.id === id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('스폰서 id 가 베팅 회사 id 또는 세일 회사 id 를 가리킨다', () => {
    const bmIds = new Set(BOOKMAKERS.map((b) => b.id));
    const coIds = new Set(COMPANIES.map((c) => c.id));
    for (const s of SPONSORSHIPS) {
      if (s.sponsor.kind === 'bookmaker') {
        expect(bmIds.has(s.sponsor.id)).toBe(true);
      } else {
        expect(coIds.has(s.sponsor.id)).toBe(true);
      }
    }
  });

  it('상금 배수는 등급별 범위를 지킨다 (G1 1.1 · G2/G3 1.2~1.3 · 리스티드/핸디캡 1.3~1.5)', () => {
    for (const s of SPONSORSHIPS) {
      const tpl = templateById(s.templateId);
      const m = s.prizeMultiplier;
      if (tpl.kind === 'group' && tpl.grade === 'G1') {
        expect(m).toBe(1.1);
      } else if (tpl.kind === 'group' && (tpl.grade === 'G2' || tpl.grade === 'G3')) {
        expect(m).toBeGreaterThanOrEqual(1.2);
        expect(m).toBeLessThanOrEqual(1.3);
      } else {
        expect(['listed', 'handicap']).toContain(tpl.kind);
        expect(m).toBeGreaterThanOrEqual(1.3);
        expect(m).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('G1 스폰서는 최대 4건이다', () => {
    const g1 = SPONSORSHIPS.filter((s) => templateById(s.templateId).grade === 'G1');
    expect(g1.length).toBeLessThanOrEqual(G1_SPONSOR_MAX);
  });

  it('베팅 회사 각각이 3~5건을 스폰서한다', () => {
    for (const bm of BOOKMAKERS) {
      const count = SPONSORSHIPS.filter((s) => s.sponsor.kind === 'bookmaker' && s.sponsor.id === bm.id).length;
      expect(count).toBeGreaterThanOrEqual(BOOKMAKER_SPONSOR_MIN);
      expect(count).toBeLessThanOrEqual(BOOKMAKER_SPONSOR_MAX);
    }
  });

  it('세일 회사는 자기 나라 경마장 레이스에만 붙는다', () => {
    for (const s of SPONSORSHIPS) {
      if (s.sponsor.kind !== 'sale_company') continue;
      const co = COMPANIES.find((c) => c.id === s.sponsor.id);
      if (!co) throw new Error(`unknown sale company: ${s.sponsor.id}`);
      expect(courseCountry(templateById(s.templateId).racecourseId)).toBe(co.country);
    }
  });

  it('세일 회사는 자기 나라 경마장이 있으면 2~3건, 없으면 0건이다', () => {
    for (const co of COMPANIES) {
      const count = SPONSORSHIPS.filter((s) => s.sponsor.kind === 'sale_company' && s.sponsor.id === co.id).length;
      const hasCourse = COURSES.some((c) => c.country === co.country);
      if (hasCourse) {
        expect(count).toBeGreaterThanOrEqual(SALE_SPONSOR_MIN);
        expect(count).toBeLessThanOrEqual(SALE_SPONSOR_MAX);
      } else {
        expect(count).toBe(0);
      }
    }
  });
});

describe('스폰서 레이스 이름 (최종 이름 치환 결과)', () => {
  it('최종 이름은 비어 있지 않고 60자 이하다', () => {
    for (const s of SPONSORSHIPS) {
      const name = finalRaceName(s);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
      expect(name).not.toMatch(/[{}]/);
    }
  });

  it('최종 이름이 서로 중복되지 않는다', () => {
    const names = SPONSORSHIPS.map((s) => finalRaceName(s));
    expect(new Set(names).size).toBe(names.length);
  });

  it('최종 이름과 nameFormat 에 실존 베팅 회사·세일 회사·차단 지명·실제 레이스명이 없다', () => {
    for (const s of SPONSORSHIPS) {
      const texts = [finalRaceName(s), s.nameFormat];
      for (const text of texts) {
        expect(findHits(text, FORBIDDEN_BRANDS)).toEqual([]);
        expect(findHits(text, REAL_SALE_NAMES)).toEqual([]);
        expect(findHits(text, BLOCKED_PLACE_TOKENS)).toEqual([]);
        expect(findHits(text, REAL_RACE_NAMES)).toEqual([]);
      }
    }
  });
});
