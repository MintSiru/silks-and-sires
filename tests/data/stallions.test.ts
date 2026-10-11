import { describe, expect, it } from 'vitest';
import stallionsJson from '../../data/stallions/stallions.json';
import namesJson from '../../data/stallions/names.json';
import sireLinesJson from '../../data/stallions/sire_lines.json';
import type {
  DistanceProfile,
  RealStallionRecord,
  RealStallionStatus,
  SireLine,
  StallionNameTable,
  SurfaceProfile,
} from '../../src/engine/types/bloodline';
import type { CountryCode } from '../../src/engine/types/common';

/** M2-01 실명 종마 데이터 검증 (data/stallions/*.json). 스키마는 src/engine/types/bloodline.ts 를 따른다. */

const stallions = stallionsJson as RealStallionRecord[];
const names = namesJson as StallionNameTable;
const lines = sireLinesJson as SireLine[];

const byKey = new Map(stallions.map((s) => [s.key, s] as const));
const lineById = new Map(lines.map((l) => [l.id, l] as const));

const COUNTRY_CODES: CountryCode[] = ['GB', 'IE', 'FR', 'DE', 'IT', 'JP', 'US', 'AU', 'HK', 'AE', 'CA'];
const STATUSES: RealStallionStatus[] = ['active', 'pensioned', 'historical'];
const DISTANCES: DistanceProfile[] = ['sprint', 'mile', 'middle', 'staying'];
const SURFACES: SurfaceProfile[] = ['turf', 'dirt', 'both'];
const CONFIDENCES = ['high', 'medium', 'low'] as const;
const EUROPEAN = ['GB', 'IE', 'FR', 'DE'];

describe('종마 키·혈통 사슬', () => {
  it('key 중복 없음, 형식 stl_[a-z0-9_]+', () => {
    const keys = stallions.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(k).toMatch(/^stl_[a-z0-9_]+$/);
    }
  });

  it('sireKey·damsireKey(null 제외)는 모두 파일 안에 존재', () => {
    for (const s of stallions) {
      if (s.sireKey !== null) expect(byKey.has(s.sireKey), `${s.key} sireKey`).toBe(true);
      if (s.damsireKey !== null) expect(byKey.has(s.damsireKey), `${s.key} damsireKey`).toBe(true);
    }
  });

  it('sireKey 사슬에 순환이 없고 모든 사슬이 sireKey null 인 루트에서 끝남', () => {
    for (const s of stallions) {
      const seen = new Set<string>();
      let cur: RealStallionRecord | undefined = s;
      while (cur && cur.sireKey !== null) {
        expect(seen.has(cur.key), `순환: ${s.key}`).toBe(false);
        seen.add(cur.key);
        cur = byKey.get(cur.sireKey);
        expect(cur, `끊김: ${s.key}`).toBeDefined();
      }
    }
  });

  it('foaled: 부보다 3년 이상 늦음', () => {
    for (const s of stallions) {
      if (s.sireKey === null) continue;
      const sire = byKey.get(s.sireKey);
      expect(sire, `${s.key} 부`).toBeDefined();
      expect(s.foaled - (sire as RealStallionRecord).foaled, `${s.key}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('foaled 는 정수 연도', () => {
    for (const s of stallions) {
      expect(Number.isInteger(s.foaled), s.key).toBe(true);
      expect(s.foaled).toBeGreaterThan(1800);
      expect(s.foaled).toBeLessThanOrEqual(2026);
    }
  });
});

describe('현역 상태', () => {
  it('active 이면 standsIn 이 CountryCode, 그 외 상태는 standsIn null', () => {
    for (const s of stallions) {
      if (s.status === 'active') {
        expect(s.standsIn, `${s.key} active 인데 standsIn 없음`).not.toBeNull();
        expect(COUNTRY_CODES).toContain(s.standsIn);
      } else {
        expect(s.standsIn, `${s.key} 비현역인데 standsIn 있음`).toBeNull();
      }
    }
  });

  it('유럽(GB/IE/FR/DE) 현역 종마 20두 이상 (M2-01 1차분 하한 — 확장은 M2 후속)', () => {
    const europeanActive = stallions.filter(
      (s) => s.status === 'active' && s.standsIn !== null && EUROPEAN.includes(s.standsIn),
    );
    expect(europeanActive.length).toBeGreaterThanOrEqual(20);
  });

  it('미국 더트·양용 현역 종마 10두 이상 (M2-01 1차분 하한 — 확장은 M2 후속)', () => {
    const usDirtActive = stallions.filter(
      (s) =>
        s.status === 'active' &&
        s.standsIn === 'US' &&
        (s.surfaceProfile === 'dirt' || s.surfaceProfile === 'both'),
    );
    expect(usDirtActive.length).toBeGreaterThanOrEqual(10);
  });
});

describe('값 범위', () => {
  it('countryOfBirth, status, profile, marketTier, confidence 값 범위', () => {
    for (const s of stallions) {
      expect(COUNTRY_CODES, s.key).toContain(s.countryOfBirth);
      expect(STATUSES, s.key).toContain(s.status);
      expect(DISTANCES, s.key).toContain(s.distanceProfile);
      expect(SURFACES, s.key).toContain(s.surfaceProfile);
      expect([1, 2, 3, 4, 5], s.key).toContain(s.marketTier);
      expect(CONFIDENCES, s.key).toContain(s.confidence);
    }
  });
});

describe('계통표 sire_lines', () => {
  it('id 중복 없음, parentLineId·founderKey 존재, 계통 트리에 순환 없음', () => {
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    for (const l of lines) {
      if (l.parentLineId !== null) expect(lineById.has(l.parentLineId), `${l.id} parent`).toBe(true);
      expect(byKey.has(l.founderKey), `${l.id} founder`).toBe(true);
      const seen = new Set<string>();
      let cur: SireLine | undefined = l;
      while (cur && cur.parentLineId !== null) {
        expect(seen.has(cur.id), `계통 순환: ${l.id}`).toBe(false);
        seen.add(cur.id);
        cur = lineById.get(cur.parentLineId);
      }
    }
  });

  it('하위 계통 수 15~30개', () => {
    expect(lines.length).toBeGreaterThanOrEqual(15);
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  it('계통 시조(founder)는 자기 계통에 속함', () => {
    for (const l of lines) {
      const founder = byKey.get(l.founderKey) as RealStallionRecord;
      expect(founder.sireLineId, `${l.id} 시조 계통`).toBe(l.id);
    }
  });

  it('모든 종마의 sireLineId 는 계통표에 존재', () => {
    for (const s of stallions) {
      expect(lineById.has(s.sireLineId), `${s.key} sireLineId`).toBe(true);
    }
  });

  it('부와의 계통 규칙: 같은 계통이거나 자기 계통의 parentLineId 가 부의 계통', () => {
    for (const s of stallions) {
      if (s.sireKey === null) continue;
      const sire = byKey.get(s.sireKey) as RealStallionRecord;
      const own = lineById.get(s.sireLineId) as SireLine;
      const ok = s.sireLineId === sire.sireLineId || own.parentLineId === sire.sireLineId;
      expect(ok, `${s.key} (${s.sireLineId}) ↔ 부 ${sire.key} (${sire.sireLineId})`).toBe(true);
    }
  });
});

describe('이름 표 names.json', () => {
  it('키 집합 = stallions.json 키 집합, 이름 중복 없음', () => {
    const stallionKeys = stallions.map((s) => s.key).sort();
    const nameKeys = Object.keys(names).sort();
    expect(nameKeys).toEqual(stallionKeys);
    const values = Object.values(names);
    expect(new Set(values).size).toBe(values.length);
  });

  it('이름에 국가 접미사 "(IRE)" 등 괄호 표기 없음', () => {
    for (const [k, v] of Object.entries(names)) {
      expect(v, k).not.toMatch(/\(|\)/);
      expect(v.trim(), k).toBe(v);
    }
  });

  it('계통 라벨(label)은 영문 "<종마명> line" 형식', () => {
    for (const l of lines) {
      expect(l.label, l.id).toMatch(/ line$/);
    }
  });
});
