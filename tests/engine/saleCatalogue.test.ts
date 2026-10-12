import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { BREEDER_COUNT_BY_COUNTRY } from '../../src/engine/config/breeders';
import { SALE_LOT_SCALE, SALE_MARE_AGE_MAX, SALE_MARE_AGE_MIN, SALE_VALUE_FLOOR } from '../../src/engine/config/sales';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { bookForSire, bookSireTierRange, buildCatalogue, type CatalogueStaticData } from '../../src/engine/sales/catalogue';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { allocateHorseId } from '../../src/engine/state/world';
import { racingHorseIds } from '../../src/engine/world/population';
import { coverYearForFoal } from '../../src/engine/world/sireWindow';
import type { GameState, Horse, SaleCatalogue, SaleEventDef, SaleLot } from '../../src/engine/types';

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const SALES = getSalesData();
const CATALOGUE_DATA: CatalogueStaticData = {
  sales: SALES,
  stallionRecords: getStallionRecords(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
};

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

function eventOf(id: string): SaleEventDef {
  const event = SALES.events.find((e) => e.id === id);
  if (event === undefined) throw new Error(`세일 없음: ${id}`);
  return event;
}

function companyCountry(event: SaleEventDef): string {
  const company = SALES.companies.find((c) => c.id === event.companyId);
  if (company === undefined) throw new Error(`회사 없음: ${event.companyId}`);
  return company.country;
}

/** 북 로트 수 합계(설계 규칙: max(1, round(lotsTarget × SALE_LOT_SCALE))) */
function expectedLotCount(event: SaleEventDef): number {
  return event.books.reduce((sum, b) => sum + Math.max(1, Math.round(b.lotsTarget * SALE_LOT_SCALE)), 0);
}

function build(draft: GameState, event: SaleEventDef, seedLabel = 'cat'): SaleCatalogue {
  return buildCatalogue(draft, event, YEAR, CATALOGUE_DATA, createRng(`${seedLabel}:${event.id}`));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const GENERATED_KINDS = ['foal', 'yearling', 'breeze_up', 'breeding_stock'] as const;

describe('세일 북·부 등급 규칙 (순수 함수)', () => {
  it('bookSireTierRange: 북 1 은 [1, max], 그 밖은 (앞 북 max, 이 북 max], 같으면 그 등급만', () => {
    const ashcombe = eventOf('sev_ashcombe_yearling_oct'); // 북 max: 1, 2, 3, 5
    expect(bookSireTierRange(ashcombe, 1)).toEqual({ min: 1, max: 1 });
    expect(bookSireTierRange(ashcombe, 2)).toEqual({ min: 2, max: 2 });
    expect(bookSireTierRange(ashcombe, 3)).toEqual({ min: 3, max: 3 });
    expect(bookSireTierRange(ashcombe, 4)).toEqual({ min: 4, max: 5 });
    const summer = eventOf('sev_ashcombe_yearling_aug'); // 북 1 max: 5
    expect(bookSireTierRange(summer, 1)).toEqual({ min: 1, max: 5 });
    const wolfsrode = eventOf('sev_wolfsrode_yearling_sep'); // 북 max: 2, 5
    expect(bookSireTierRange(wolfsrode, 2)).toEqual({ min: 3, max: 5 });
  });

  it('bookForSire: 부 등급 ≤ maxSireTier 인 첫 북, 없으면 마지막 북', () => {
    const ashcombe = eventOf('sev_ashcombe_yearling_oct'); // 1, 2, 3, 5
    expect(bookForSire(ashcombe, 1)).toBe(1);
    expect(bookForSire(ashcombe, 2)).toBe(2);
    expect(bookForSire(ashcombe, 3)).toBe(3);
    expect(bookForSire(ashcombe, 4)).toBe(4);
    expect(bookForSire(ashcombe, 5)).toBe(4);
    const ardcarrig = eventOf('sev_ardcarrig_yearling_sep'); // 1, 2, 5
    expect(bookForSire(ardcarrig, 4)).toBe(3);
    const quenmoorBreeding = eventOf('sev_quenmoor_breeding_stock_nov'); // 3, 5
    expect(bookForSire(quenmoorBreeding, 5)).toBe(2);
  });
});

describe('세일 카탈로그 생성 (buildCatalogue)', () => {
  it('수용 1: 15개 세일 모두 성공하고, 로트 수는 Σ round(lotsTarget × 0.1) 이다(현역마 판매는 후보 부족 시 ≤)', () => {
    expect(SALES.events).toHaveLength(15);
    for (const event of SALES.events) {
      const draft = fresh();
      const catalogue = build(draft, event);
      expect(catalogue.saleId).toBe(event.id);
      expect(catalogue.year).toBe(YEAR);
      expect(catalogue.status).toBe('catalogued');
      const expected = expectedLotCount(event);
      if (event.kind === 'horses_in_training') {
        expect(catalogue.lots.length, event.id).toBeLessThanOrEqual(expected);
      } else {
        expect(catalogue.lots.length, event.id).toBe(expected);
      }
      catalogue.lots.forEach((lot, i) => expect(lot.lotNo).toBe(i + 1));
      const books = catalogue.lots.map((l) => l.book);
      expect([...books].sort((a, b) => a - b)).toEqual(books);
    }
  }, BOOT_TIMEOUT);

  it('수용 2: 생성 로트는 나이·상태·성별·ownerId null·생산자 나라·교배 가능 기간이 맞다', () => {
    for (const event of SALES.events) {
      if (!(GENERATED_KINDS as readonly string[]).includes(event.kind)) continue;
      const draft = fresh();
      const catalogue = build(draft, event);
      const country = companyCountry(event);
      for (const lot of catalogue.lots) {
        expect(lot.vendor.kind).toBe('breeder');
        const horse = draft.horses[lot.horseId] as Horse;
        expect(horse.ownerId).toBeNull();
        expect(horse.breederId).toBe(lot.vendor.id);
        const breeder = draft.breeders[lot.vendor.id];
        expect(breeder?.country).toBe(country);
        expect(breeder?.horseIds).toContain(lot.horseId);
        expect(horse.countryOfBirth).toBe(country);

        const age = YEAR - horse.birthYear;
        if (event.kind === 'yearling') expect({ age, status: horse.status }).toEqual({ age: 1, status: 'yearling' });
        if (event.kind === 'foal') expect({ age, status: horse.status }).toEqual({ age: 0, status: 'weanling' });
        if (event.kind === 'breeze_up') expect({ age, status: horse.status }).toEqual({ age: 2, status: 'yearling' });
        if (event.kind === 'breeding_stock') {
          expect(horse.sex).toBe('female');
          expect(horse.status).toBe('broodmare');
          expect(age).toBeGreaterThanOrEqual(SALE_MARE_AGE_MIN);
          expect(age).toBeLessThanOrEqual(SALE_MARE_AGE_MAX);
          expect(horse.officialRating).not.toBeNull();
        }

        expect(lot.sireId).not.toBeNull();
        const sireId = lot.sireId as string;
        const coverYear = coverYearForFoal(horse.birthYear);
        const record = getStallionRecords().find((r) => r.key === sireId);
        const stallion = draft.stallions[sireId];
        expect(record?.status).toBe('active');
        expect(record !== undefined && coverYear >= record.foaled + 4).toBe(true);
        expect(stallion !== undefined && stallion.firstSeasonYear <= coverYear).toBe(true);
      }
    }
  }, BOOT_TIMEOUT);

  it('수용 2(부 등급): 1세마 북 1 의 부는 북 max 이하이고, 완화된 로트는 보고용으로 센다', () => {
    const relaxed: string[] = [];
    for (const event of SALES.events) {
      if (event.kind !== 'yearling' && event.kind !== 'breeze_up' && event.kind !== 'foal' && event.kind !== 'breeding_stock') continue;
      const draft = fresh();
      const catalogue = build(draft, event);
      const country = companyCountry(event);
      for (const lot of catalogue.lots) {
        const range = bookSireTierRange(event, lot.book);
        const stallion = draft.stallions[lot.sireId as string];
        const record = getStallionRecords().find((r) => r.key === lot.sireId);
        const within = stallion?.standsIn === country && record !== undefined && record.marketTier >= range.min && record.marketTier <= range.max;
        if (!within) relaxed.push(`${event.id}#${lot.lotNo}(book ${lot.book})`);
        if (event.kind === 'yearling' && lot.book === 1) {
          expect(record?.marketTier ?? 99, `${event.id} 북 1 부 등급`).toBeLessThanOrEqual(range.max);
        }
      }
    }
    console.log(`[측정] 부 선택 완화(나라/등급 기준 밖) 로트 ${relaxed.length}개`);
    const byEvent = new Map<string, number>();
    for (const item of relaxed) {
      const id = item.split('#')[0] ?? item;
      byEvent.set(id, (byEvent.get(id) ?? 0) + 1);
    }
    console.log(`[측정] 완화 발생 세일: ${JSON.stringify([...byEvent.entries()])}`);
  }, BOOT_TIMEOUT);

  it('수용 3: 미국 세일 판매자는 미국 생산자, 유럽 세일은 그 나라 생산자다', () => {
    expect(BREEDER_COUNT_BY_COUNTRY.US).toBe(12);
    const base = BASE;
    const usBreeders = Object.values(base.breeders).filter((b) => b.country === 'US');
    expect(usBreeders).toHaveLength(12);
    for (const event of SALES.events) {
      if (!(GENERATED_KINDS as readonly string[]).includes(event.kind)) continue;
      const catalogue = build(fresh(), event);
      const country = companyCountry(event);
      for (const lot of catalogue.lots) {
        if (lot.vendor.kind !== 'breeder') throw new Error('생성 로트 판매자는 생산자여야 한다');
        expect(base.breeders[lot.vendor.id]?.country, `${event.id} 판매자 나라`).toBe(country);
      }
    }
  }, BOOT_TIMEOUT);

  it('수용 4: 플레이어 위탁 1두는 로트에 들어가고 vendor owner·reserve 가 위탁 값이다', () => {
    const event = eventOf('sev_ashcombe_yearling_oct');
    const draft = fresh();
    const sire = getStallionRecords().find((r) => r.status === 'active' && r.standsIn === 'GB' && r.marketTier === 3);
    if (sire === undefined) throw new Error('테스트용 GB 3등급 종마가 없다');
    const template = draft.horses[racingHorseIds(draft)[0] as string] as Horse;
    const id = allocateHorseId(draft);
    const consigned: Horse = {
      ...structuredClone(template),
      id,
      name: 'Consigned Test',
      birthYear: YEAR - 1,
      status: 'yearling',
      ownerId: draft.playerOwnerId,
      trainerId: null,
      breederId: null,
      officialRating: null,
      sireId: sire.key,
      damId: null,
      familyId: null,
    };
    draft.horses[id] = consigned;
    draft.sales.consignments.push({ saleId: event.id, year: YEAR, horseId: id, reserve: 12_300 });

    const catalogue = build(draft, event);
    const lot = catalogue.lots.find((l) => l.horseId === id);
    expect(lot).toBeDefined();
    expect(lot?.vendor).toEqual({ kind: 'owner', id: draft.playerOwnerId });
    expect(lot?.reserve).toBe(12_300);
    expect(lot?.book).toBe(bookForSire(event, 3));
    expect(lot?.sireId).toBe(sire.key);
  }, BOOT_TIMEOUT);

  it('수용 4(검사): 종류에 맞지 않는 위탁(2세 말을 1세 세일에)은 건너뛴다', () => {
    const event = eventOf('sev_ashcombe_yearling_oct');
    const draft = fresh();
    const template = draft.horses[racingHorseIds(draft)[0] as string] as Horse;
    const id = allocateHorseId(draft);
    draft.horses[id] = {
      ...structuredClone(template),
      id,
      name: 'Wrong Age Test',
      birthYear: YEAR - 2,
      status: 'yearling',
      ownerId: draft.playerOwnerId,
      officialRating: null,
    };
    draft.sales.consignments.push({ saleId: event.id, year: YEAR, horseId: id, reserve: null });
    const catalogue = build(draft, event);
    expect(catalogue.lots.some((l) => l.horseId === id)).toBe(false);
  }, BOOT_TIMEOUT);

  it('수용 5: 같은 시드·같은 입력 → 카탈로그 JSON 과 말 레코드가 같고, 모든 로트 평가값은 하한 이상이다', () => {
    for (const event of SALES.events) {
      const a = fresh();
      const b = fresh();
      const catA = build(a, event);
      const catB = build(b, event);
      expect(JSON.stringify(catA), event.id).toBe(JSON.stringify(catB));
      expect(JSON.stringify(a.horses)).toBe(JSON.stringify(b.horses));
      for (const lot of catA.lots) {
        expect(lot.valuation).toBeGreaterThanOrEqual(SALE_VALUE_FLOOR);
        expect(lot.aiBids).toEqual([]);
        expect(lot.result).toBeNull();
      }
    }
  }, BOOT_TIMEOUT);

  it('측정(수용 6): 세일별 로트 수, 1세마 북별 평가값 중앙값, 카탈로그 1개 생성 시간', () => {
    const rows: string[] = [];
    let maxMs = 0;
    for (const event of SALES.events) {
      const draft = fresh();
      const started = performance.now();
      const catalogue = build(draft, event);
      const ms = performance.now() - started;
      maxMs = Math.max(maxMs, ms);
      const perBook = event.books.map((b) => {
        const lots = catalogue.lots.filter((l: SaleLot) => l.book === b.book);
        return `북${b.book} ${lots.length}두 중앙값 ${median(lots.map((l) => l.valuation))}`;
      });
      rows.push(`${event.id} [${event.kind}] 로트 ${catalogue.lots.length} | ${perBook.join(' / ')} | ${ms.toFixed(1)}ms`);
    }
    console.log(`[측정 6] 세일별:\n${rows.join('\n')}`);
    console.log(`[측정 6] 카탈로그 1개 최대 생성 시간: ${maxMs.toFixed(1)}ms`);
    const yearlingMedians = SALES.events
      .filter((e) => e.kind === 'yearling')
      .map((e) => {
        const cat = build(fresh(), e);
        return `${e.id}: 1세마 북별 중앙값 ${e.books
          .map((b) => median(cat.lots.filter((l) => l.book === b.book).map((l) => l.valuation)))
          .join(', ')}`;
      });
    console.log(`[측정 6] 1세마 북별 valuation 중앙값:\n${yearlingMedians.join('\n')}`);
    expect(rows.length).toBe(15);
  }, BOOT_TIMEOUT);
});
