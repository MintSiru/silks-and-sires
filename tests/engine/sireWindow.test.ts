import { describe, expect, it } from 'vitest';
import { MAX_STUD_AGE, MIN_SIRE_AGE_AT_COVER, SIRE_BIRTH_MARGIN_YEARS } from '../../src/engine/config/world';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameState, RealStallionRecord } from '../../src/engine/types';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';
import { canSireIn, filterSiresForCover, lastCoverYearOf } from '../../src/engine/world/sireWindow';

const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SEEDS = [20261011, 7] as const;

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

function rec(overrides: Partial<RealStallionRecord>): RealStallionRecord {
  return {
    key: 'stl_test',
    foaled: 2000,
    countryOfBirth: 'GB',
    sireKey: null,
    damsireKey: null,
    sireLineId: 'sl_test',
    status: 'active',
    standsIn: 'GB',
    distanceProfile: 'classic',
    surfaceProfile: 'turf',
    marketTier: 3,
    confidence: 'high',
    ...overrides,
  };
}

/**
 * 독립 검사(구현과 별개로 명세 규칙을 그대로 쓴다): 교배 연도 = 자마 출생 − 1,
 * 시작 = foaled + MIN_SIRE_AGE_AT_COVER, 끝 = lastCoverYear ?? (active 면 무제한, 그 밖은 foaled + MAX_STUD_AGE).
 */
function coverWindowViolation(record: RealStallionRecord, foalBirthYear: number): boolean {
  const coverYear = foalBirthYear - 1;
  const start = record.foaled + MIN_SIRE_AGE_AT_COVER;
  const end =
    record.lastCoverYear ?? (record.status === 'active' ? Number.POSITIVE_INFINITY : record.foaled + MAX_STUD_AGE);
  return coverYear < start || coverYear > end;
}

/** 실명 종마 Horse 레코드(state.stallions 에 있는 말)를 뺀 모든 말 중 실명 부가 있는 말의 위반 목록 */
function sireViolations(state: GameState): string[] {
  const records = new Map(getStallionRecords().map((r) => [r.key, r] as const));
  const out: string[] = [];
  for (const horse of Object.values(state.horses)) {
    if (state.stallions[horse.id] !== undefined) continue;
    const sire = records.get(horse.sireId ?? '');
    if (sire === undefined) continue;
    if (coverWindowViolation(sire, horse.birthYear)) {
      out.push(`${horse.id}(${horse.status}, ${horse.birthYear}) ← ${sire.key}(foaled ${sire.foaled})`);
    }
    // 현역 생성(부 후보) 규칙: availableFromYear 이전 교배 연도의 부는 쓰지 않는다
    if (
      sire.availableFromYear !== undefined &&
      (horse.status === 'in_training' || horse.status === 'resting') &&
      horse.ownerId !== null &&
      horse.birthYear - SIRE_BIRTH_MARGIN_YEARS < sire.availableFromYear
    ) {
      out.push(`${horse.id} 현역 ← ${sire.key} 임대 전 교배 연도`);
    }
  }
  return out;
}

function boot(seed: number): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

describe('교배 가능 기간 판정 (sireWindow)', () => {
  it('active 종마는 lastCoverYear 가 없으면 시작 이후 제한이 없다', () => {
    const r = rec({ status: 'active', foaled: 2000 });
    expect(lastCoverYearOf(r)).toBeNull();
    expect(canSireIn(r, 2000 + MIN_SIRE_AGE_AT_COVER)).toBe(true);
    expect(canSireIn(r, 2100)).toBe(true);
    expect(canSireIn(r, 2000 + MIN_SIRE_AGE_AT_COVER - 1)).toBe(false);
  });

  it('pensioned·historical 은 lastCoverYear 가 없으면 foaled + MAX_STUD_AGE 가 끝이다', () => {
    const r = rec({ status: 'pensioned', foaled: 1990 });
    expect(lastCoverYearOf(r)).toBe(1990 + MAX_STUD_AGE);
    expect(canSireIn(r, 1990 + MAX_STUD_AGE)).toBe(true);
    expect(canSireIn(r, 1990 + MAX_STUD_AGE + 1)).toBe(false);
    const h = rec({ status: 'historical', foaled: 1969 });
    expect(canSireIn(h, 2001)).toBe(false);
    expect(canSireIn(h, 1969 + MAX_STUD_AGE)).toBe(true);
  });

  it('lastCoverYear 가 있으면 그 값을 끝으로 쓴다(기간 양끝 포함)', () => {
    const r = rec({ status: 'historical', foaled: 1990, lastCoverYear: 2005 });
    expect(lastCoverYearOf(r)).toBe(2005);
    expect(canSireIn(r, 2005)).toBe(true);
    expect(canSireIn(r, 2006)).toBe(false);
    expect(canSireIn(r, 1990 + MIN_SIRE_AGE_AT_COVER - 1)).toBe(false);
  });

  it('filterSiresForCover 는 기간 안 후보만 입력 순서대로 고른다', () => {
    const a = rec({ key: 'stl_a', status: 'active', foaled: 1990 });
    const b = rec({ key: 'stl_b', status: 'historical', foaled: 1950, lastCoverYear: 1960 });
    const c = rec({ key: 'stl_c', status: 'pensioned', foaled: 2010 });
    // a: 1994~무제한 → 기간 안, b: 1954~1960 → 밖, c: 2014~2032 → 기간 안
    expect(filterSiresForCover([a, b, c], 2015).map((r) => r.key)).toEqual(['stl_a', 'stl_c']);
    expect(filterSiresForCover([b, a], 2015).map((r) => r.key)).toEqual(['stl_a']);
  });

  it('기간 안 후보가 없으면 교배 연도와 가장 가까운 기간의 종마로 완화한다(거리 최솟값 동률 전부, 순서 유지)', () => {
    const far = rec({ key: 'stl_far', status: 'historical', foaled: 1900, lastCoverYear: 1950 }); // 거리 2000−1950 = 50
    const near1 = rec({ key: 'stl_near1', status: 'historical', foaled: 1960, lastCoverYear: 1990 }); // 거리 10
    const near2 = rec({ key: 'stl_near2', status: 'historical', foaled: 1960, lastCoverYear: 1990 }); // 거리 10
    expect(filterSiresForCover([far, near1, near2], 2000).map((r) => r.key)).toEqual(['stl_near1', 'stl_near2']);
    expect(filterSiresForCover([], 2000)).toEqual([]);
  });

  it('같은 입력이면 같은 결과를 낸다(난수 없음)', () => {
    const records = getStallionRecords();
    const first = filterSiresForCover(records, 2020).map((r) => r.key);
    const second = filterSiresForCover(records, 2020).map((r) => r.key);
    expect(second).toEqual(first);
  });
});

describe.each(SEEDS)('bootstrapGame 후 교배 기간 (seed %i)', (seed) => {
  it('모든 말(현역마·기초 암말·어미·지급마)의 실명 부가 교배 가능 기간 안이고, 현역 생성은 임대 전 부를 쓰지 않는다', () => {
    const state = boot(seed);
    expect(sireViolations(state)).toEqual([]);
  });

  it('연간 교체 2시즌(2027·2028 1월 1주) 뒤 새 2세도 같은 검사를 통과한다', () => {
    const state = boot(seed);
    const draft = structuredClone(state);
    const system = createPopulationSystem({
      stallionRecords: getStallionRecords(),
      naming: getNamingData(),
      stallionNames: getStallionNames(),
    });
    for (const year of [2027, 2028]) {
      system.run(draft, { date: { year, week: 1 }, rng: createRng(seed).fork(`sirewindow-${year}`) });
    }
    const newYoung = Object.values(draft.horses).filter((h) => h.birthYear >= 2025 && h.sireId !== null);
    expect(newYoung.length).toBeGreaterThan(0);
    expect(sireViolations(draft)).toEqual([]);
  });
});

describe('기존 재현성 보존', () => {
  it('같은 시드 2회 bootstrapGame 결과가 같다', () => {
    expect(boot(SEEDS[0])).toEqual(boot(SEEDS[0]));
  });
});
