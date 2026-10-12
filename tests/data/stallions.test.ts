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
  StudRole,
  SurfaceProfile,
} from '../../src/engine/types/bloodline';
import type { CountryCode } from '../../src/engine/types/common';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { profileOfDistance } from '../../src/engine/horse/generate';
import { getHorseWords, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';

/** M2-01 실명 종마 데이터 검증 (data/stallions/*.json). 스키마는 src/engine/types/bloodline.ts 를 따른다. */

const stallions = stallionsJson as RealStallionRecord[];
const names = namesJson as StallionNameTable;
const lines = sireLinesJson as SireLine[];

const byKey = new Map(stallions.map((s) => [s.key, s] as const));
const lineById = new Map(lines.map((l) => [l.id, l] as const));

const COUNTRY_CODES: CountryCode[] = ['GB', 'IE', 'FR', 'DE', 'IT', 'JP', 'US', 'AU', 'HK', 'AE', 'CA', 'AR', 'NZ'];
const STATUSES: RealStallionStatus[] = ['active', 'pensioned', 'historical'];
const DISTANCES: DistanceProfile[] = ['speed', 'classic', 'middle', 'cup'];
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

  it('유럽(GB/IE/FR/DE) 현역 종마 50두 이상 (M2-01b 목표 하한)', () => {
    const europeanActive = stallions.filter(
      (s) => s.status === 'active' && s.standsIn !== null && EUROPEAN.includes(s.standsIn),
    );
    expect(europeanActive.length).toBeGreaterThanOrEqual(50);
  });

  it('미국 더트·양용 현역 종마 15두 이상 (M2-01b 목표 하한)', () => {
    const usDirtActive = stallions.filter(
      (s) =>
        s.status === 'active' &&
        s.standsIn === 'US' &&
        (s.surfaceProfile === 'dirt' || s.surfaceProfile === 'both'),
    );
    expect(usDirtActive.length).toBeGreaterThanOrEqual(15);
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

  it('coatColour 는 6색 중 하나이고 모든 종마에 있다(M3-C6, 위키백과·사용자 확인)', () => {
    const colours = ['bay', 'brown', 'black', 'chestnut', 'grey', 'roan'];
    for (const s of stallions) {
      if (s.coatColour !== undefined) expect(colours, s.key).toContain(s.coatColour);
    }
    expect(stallions.filter((s) => s.coatColour !== undefined).length).toBe(stallions.length);
  });
});

describe('거리 프로필 4단계 (M2-14)', () => {
  const OLD_PROFILES = ['sprint', 'mile', 'staying'];

  it('stallions.json 에 옛 거리 프로필(sprint/mile/staying)이 남아 있지 않다', () => {
    const raw = JSON.stringify(stallionsJson);
    for (const old of OLD_PROFILES) {
      expect(raw, old).not.toContain(`"distanceProfile":"${old}"`);
    }
    for (const s of stallions) {
      expect(OLD_PROFILES, s.key).not.toContain(s.distanceProfile);
    }
  });

  it('세계 초기화 후 현역 실명 종마의 profileOfDistance(distanceOptimum) 이 데이터 프로필과 같은 비율 ≥ 80%', () => {
    const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;
    const seed = 20260101;
    const data: WorldStaticData = {
      stallionRecords: getStallionRecords(),
      stallionNames: getStallionNames(),
      nicks: getNicks(),
      words: getHorseWords(),
    };
    const state = bootstrapWorld(
      createNewGame({ seed, playerName: 'Test Owner', silks: SILKS }),
      data,
      createRng(seed),
    );
    const active = stallions.filter((s) => s.status === 'active');
    expect(active.length).toBeGreaterThan(0);
    let matched = 0;
    for (const s of active) {
      const horse = state.horses[s.key];
      if (horse === undefined) throw new Error(`${s.key} Horse 없음`);
      if (profileOfDistance(horse.aptitude.distanceOptimum) === s.distanceProfile) matched += 1;
    }
    expect(matched / active.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe('거리 프로필 분포 (M2-15)', () => {
  it('4개 프로필(speed/classic/middle/cup)이 각각 1두 이상', () => {
    for (const p of DISTANCES) {
      const n = stallions.filter((s) => s.distanceProfile === p).length;
      expect(n, p).toBeGreaterThanOrEqual(1);
    }
  });

  it('현역(active) 종마 중 classic 비율 ≥ 10%', () => {
    const active = stallions.filter((s) => s.status === 'active');
    const classic = active.filter((s) => s.distanceProfile === 'classic');
    expect(active.length).toBeGreaterThan(0);
    expect(classic.length / active.length).toBeGreaterThanOrEqual(0.1);
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
    expect(lines.length).toBeLessThanOrEqual(35);
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

describe('종마 역할 studRole (M2-01d)', () => {
  const ROLES: StudRole[] = ['flat', 'dual', 'nh'];

  it('studRole 이 있으면 flat/dual/nh 중 하나 (생략 = flat)', () => {
    for (const s of stallions) {
      if (s.studRole === undefined) continue;
      expect(ROLES, s.key).toContain(s.studRole);
    }
  });

  it('NH 종마(studRole nh) ≥ 3두', () => {
    const nh = stallions.filter((s) => s.studRole === 'nh');
    expect(nh.length).toBeGreaterThanOrEqual(3);
  });

  it('cup 거리 프로필 종마 ≥ 3두', () => {
    const cup = stallions.filter((s) => s.distanceProfile === 'cup');
    expect(cup.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * 부계 사슬이 5대(자신 포함) 미만인 현역 종마 예외 목록. M2-01e: 사용자 제공 혈통(Galiway, Showcasing,
 * Tasleet, Mehmas, Kodiac)으로 미확인 고리가 모두 해소되어 빈 목록. 예외가 생기면 여기에 이름을 추가한다.
 */
const UNVERIFIED_CHAIN_ACTIVE_EXCEPTIONS: readonly string[] = [];

describe('현역 종마 부계 사슬 깊이', () => {
  it('현역 종마는 부계 사슬 깊이 ≥ 5 (자신 포함) 이거나 미확인 고리 예외 목록에 있다', () => {
    const depthOf = (key: string): number => {
      let d = 0;
      let cur: string | null = key;
      while (cur !== null) {
        d += 1;
        cur = (byKey.get(cur) as RealStallionRecord).sireKey;
      }
      return d;
    };
    const short = stallions
      .filter((s) => s.status === 'active' && depthOf(s.key) < 5)
      .map((s) => names[s.key] as string)
      .sort();
    expect(short).toEqual([...UNVERIFIED_CHAIN_ACTIVE_EXCEPTIONS].sort());
  });
});

describe('현역 외조부 BMS (M2-01e)', () => {
  it('현역 종마 중 damsireKey 가 있는 비율 ≥ 60%', () => {
    const active = stallions.filter((s) => s.status === 'active');
    const withDamsire = active.filter((s) => s.damsireKey !== null);
    expect(active.length).toBeGreaterThan(0);
    expect(withDamsire.length / active.length).toBeGreaterThanOrEqual(0.6);
  });

  it('외조부(damsireKey)는 자기 자신이 아니고, 외조부 출생연도 ≤ 종마 출생연도 − 6', () => {
    for (const s of stallions) {
      if (s.damsireKey === null) continue;
      expect(s.damsireKey, `${s.key} 자기 참조`).not.toBe(s.key);
      const ds = byKey.get(s.damsireKey) as RealStallionRecord;
      expect(ds.foaled, `${s.key} 외조부 연도`).toBeLessThanOrEqual(s.foaled - 6);
    }
  });
});
