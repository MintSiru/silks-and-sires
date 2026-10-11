import { describe, expect, it } from 'vitest';
import {
  PEOPLE_PER_COUNTRY,
  PEOPLE_COUNTRY_ORDER,
  TRAINER_AGE_MAX,
  TRAINER_AGE_MIN,
  WEEKLY_FEE_PER_FACILITY_GRADE,
} from '../../src/engine/config/people';
import { parsePeopleData, getPeopleData } from '../../src/engine/data/staticData';
import {
  createPeopleContext,
  generateJockey,
  type PeopleStaticData,
} from '../../src/engine/people/generate';
import { generatePersonName, normalizeFullName, type NamePools } from '../../src/engine/people/names';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import type { GameState, Owner } from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const HEX = /^#[0-9a-f]{6}$/;

function baseState(): GameState {
  return createNewGame({ seed: SEED, playerName: 'Test Player', silks: { ...SILKS } });
}

function bootstrap(seed = SEED): GameState {
  return bootstrapPeople(baseState(), getPeopleData(), createRng(seed));
}

function aiOwners(state: GameState): Owner[] {
  return Object.values(state.owners).filter((o) => !o.isPlayer);
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

describe('bootstrapPeople', () => {
  it('같은 시드면 결과가 깊은 비교로 같다(재현성)', () => {
    expect(bootstrap()).toEqual(bootstrap());
  });

  it('다른 시드면 결과가 달라진다', () => {
    expect(bootstrap(SEED)).not.toEqual(bootstrap(SEED + 1));
  });

  it('입력 state 는 바꾸지 않는다', () => {
    const before = baseState();
    const snapshot = structuredClone(before);
    bootstrapPeople(before, getPeopleData(), createRng(SEED));
    expect(before).toEqual(snapshot);
  });

  it('국가별 인원이 PEOPLE_PER_COUNTRY 와 정확히 같다', () => {
    const state = bootstrap();
    const jockeysByCountry = countBy(Object.values(state.jockeys), (j) => j.country);
    const trainersByCountry = countBy(Object.values(state.trainers), (t) => t.country);
    const ownersByCountry = countBy(aiOwners(state), (o) => o.country);
    for (const c of PEOPLE_COUNTRY_ORDER) {
      expect(jockeysByCountry[c] ?? 0, `기수 ${c}`).toBe(PEOPLE_PER_COUNTRY[c].jockeys);
      expect(trainersByCountry[c] ?? 0, `조교사 ${c}`).toBe(PEOPLE_PER_COUNTRY[c].trainers);
      expect(ownersByCountry[c] ?? 0, `마주 ${c}`).toBe(PEOPLE_PER_COUNTRY[c].owners);
    }
    expect(Object.keys(state.jockeys)).toHaveLength(
      PEOPLE_COUNTRY_ORDER.reduce((s, c) => s + PEOPLE_PER_COUNTRY[c].jockeys, 0),
    );
  });

  it('id 는 jk-000001 형식이고 중복되지 않는다', () => {
    const state = bootstrap();
    expect(Object.keys(state.jockeys)).toContain('jk-000001');
    expect(Object.keys(state.trainers)).toContain('tr-000001');
    expect(Object.keys(state.owners)).toContain('ow-000001');
    for (const j of Object.values(state.jockeys)) {
      expect(j.id).toMatch(/^jk-\d{6}$/);
    }
  });

  it('생성된 인물 이름은 차단 목록에 없고 같은 역할 안에서 중복이 없다', () => {
    const data = getPeopleData();
    const blocked = new Set(data.blockedNames.map(normalizeFullName));
    const state = bootstrap();
    const roles: [string, string[]][] = [
      ['jockey', Object.values(state.jockeys).map((j) => j.name)],
      ['trainer', Object.values(state.trainers).map((t) => t.name)],
      ['owner', aiOwners(state).map((o) => o.name)],
    ];
    for (const [role, names] of roles) {
      const keys = names.map(normalizeFullName);
      expect(keys.filter((k) => blocked.has(k)), role).toEqual([]);
      expect(new Set(keys).size, role).toBe(keys.length);
    }
  });

  it('마주 승부복 (primary, secondary, pattern) 조합이 전부 다르고 primary ≠ secondary 이다', () => {
    const owners = aiOwners(bootstrap());
    const keys = owners.map((o) => `${o.silks.primary}|${o.silks.secondary}|${o.silks.pattern}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const o of owners) {
      expect(o.silks.primary).not.toBe(o.silks.secondary);
      expect(o.silks.primary).toMatch(HEX);
      expect(o.silks.secondary).toMatch(HEX);
    }
  });

  it('기수 skill 은 abilities 네 값의 평균이고(±0.001), 능력 값은 0~100 이다', () => {
    for (const j of Object.values(bootstrap().jockeys)) {
      const a = j.abilities;
      const values = [a.start, a.pace, a.finish, a.strength];
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      expect(Math.abs(j.skill - mean)).toBeLessThanOrEqual(0.001);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('기수 나이·감량·최저 기승 중량이 설정 범위 안이다', () => {
    const state = bootstrap();
    for (const j of Object.values(state.jockeys)) {
      const age = state.date.year - j.birthYear;
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(45);
      expect([0, 3, 5, 7]).toContain(j.apprenticeAllowanceLb);
      if (j.apprenticeAllowanceLb > 0) {
        expect(age).toBeLessThan(22);
      }
      expect(j.minRidingWeightLb).toBeGreaterThanOrEqual(112);
      expect(j.minRidingWeightLb).toBeLessThanOrEqual(130);
      expect(j.retainedBy).toBeNull();
      expect(j.retired).toBe(false);
    }
  });

  it('조교사 나이·시설·수용 두수·주당 조교료·편향 값이 범위 안이다', () => {
    const state = bootstrap();
    for (const t of Object.values(state.trainers)) {
      const age = state.date.year - t.birthYear;
      expect(age).toBeGreaterThanOrEqual(TRAINER_AGE_MIN);
      expect(age).toBeLessThanOrEqual(TRAINER_AGE_MAX);
      expect(t.skill).toBeGreaterThanOrEqual(0);
      expect(t.skill).toBeLessThanOrEqual(100);
      expect(t.capacity).toBeGreaterThanOrEqual(20);
      expect(t.capacity).toBeLessThanOrEqual(180);
      expect(t.facilityGrade).toBeGreaterThanOrEqual(1);
      expect(t.facilityGrade).toBeLessThanOrEqual(5);
      expect(t.weeklyFee).toBe(t.facilityGrade * WEEKLY_FEE_PER_FACILITY_GRADE);
      expect(t.staminaBias).toBeGreaterThanOrEqual(-1);
      expect(t.staminaBias).toBeLessThanOrEqual(1);
      expect(t.juvenileFocus).toBeGreaterThanOrEqual(0);
      expect(t.juvenileFocus).toBeLessThanOrEqual(1);
      expect(t.yardName.startsWith(t.region + ' ')).toBe(true);
    }
  });

  it('마주 tier·funds·persona·namePrefix 가 규칙을 따른다', () => {
    for (const o of aiOwners(bootstrap())) {
      expect(['major', 'mid', 'small']).toContain(o.tier);
      expect(Number.isInteger(o.funds)).toBe(true);
      expect(o.funds).toBeGreaterThan(0);
      for (const v of [o.persona.commercial, o.persona.prestige, o.persona.patience]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
      if (o.namePrefix !== null) {
        expect(o.tier).toBe('major');
        expect(o.namePrefix.length).toBeGreaterThanOrEqual(2);
        expect(o.namePrefix.length).toBeLessThanOrEqual(8);
      }
      expect(o.horseIds).toEqual([]);
      expect(o.retainedJockeyId).toBeNull();
    }
  });

  it('이미 AI 인물이 있는 상태에 다시 호출하면 Error 이다', () => {
    const once = bootstrap();
    expect(() => bootstrapPeople(once, getPeopleData(), createRng(SEED + 7))).toThrow();
  });
});

describe('generatePersonName', () => {
  const pools: NamePools = {
    GB: { givenMale: ['Alan'], givenFemale: ['Alice'], surnames: ['Smith'] },
    IE: { givenMale: ['Sean'], givenFemale: ['Aoife'], surnames: ['Murphy'] },
    FR: { givenMale: ['Luc'], givenFemale: ['Marie'], surnames: ['Dubois'] },
    DE: { givenMale: ['Hans'], givenFemale: ['Anna'], surnames: ['Muller'] },
    IT: { givenMale: ['Marco'], givenFemale: ['Sara'], surnames: ['Rossi'] },
    US: { givenMale: ['Bob'], givenFemale: ['Ann'], surnames: ['Miller'] },
    AU: { givenMale: ['Jim'], givenFemale: ['Jo'], surnames: ['Brown'] },
    JP: { givenMale: ['Ken'], givenFemale: ['Yui'], surnames: ['Sato'] },
    BR: { givenMale: ['Joao'], givenFemale: ['Ana'], surnames: ['Silva'] },
    ZA: { givenMale: ['Pieter'], givenFemale: ['Liza'], surnames: ['Botha'] },
  };

  it('차단 조합만 남으면 Error(무한 재시도 금지)', () => {
    const rng = createRng(1);
    expect(() =>
      generatePersonName(rng, pools, 'GB', 'male', new Set(), new Set(['alan smith'])),
    ).toThrow();
  });

  it('used 집합에 있는 이름은 다시 뽑고, 성공한 이름은 used 에 추가된다', () => {
    const rng = createRng(2);
    const used = new Set<string>(['alan smith']);
    expect(() => generatePersonName(rng, pools, 'GB', 'male', used, new Set())).toThrow();
    const fresh = new Set<string>();
    const name = generatePersonName(createRng(3), pools, 'GB', 'male', fresh, new Set());
    expect(name).toBe('Alan Smith');
    expect(fresh.has('alan smith')).toBe(true);
  });
});

describe('generateJockey 문맥', () => {
  it('이름 풀이 없는 국가 코드는 RangeError', () => {
    const data = getPeopleData();
    const ctx = createPeopleContext(data, 2026);
    expect(() => generateJockey(createRng(4), ctx, 'jk-000001', 'HK')).toThrow(RangeError);
  });
});

describe('getPeopleData / parsePeopleData', () => {
  it('정적 데이터는 열 개 국가 풀과 차단 목록, 야드 단어를 가진다', () => {
    const data = getPeopleData();
    expect(Object.keys(data.pools).sort()).toEqual(
      ['AU', 'BR', 'DE', 'FR', 'GB', 'IE', 'IT', 'JP', 'US', 'ZA'].sort(),
    );
    expect(data.blockedNames.length).toBeGreaterThanOrEqual(150);
    expect(data.places.yardWords.length).toBeGreaterThanOrEqual(60);
    expect(data.places.regionNames.GB.length).toBeGreaterThan(0);
  });

  it('형식이 깨진 데이터는 Error 로 거절한다', () => {
    const rawPools = {
      GB: { given_male: ['A'], given_female: ['B'], surnames: ['C'] },
    };
    expect(() =>
      parsePeopleData(rawPools, { full_names: ['X Y'] }, {
        yard_words: ['Hollow'],
        stud_suffixes: {},
        region_names: {},
      }),
    ).toThrow();
    expect(() => parsePeopleData(rawPools, { full_names: [] }, {})).toThrow();
  });

  it('PeopleStaticData 를 직접 넘겨도 bootstrap 이 된다(인터페이스 확인)', () => {
    const data: PeopleStaticData = getPeopleData();
    const state = bootstrapPeople(baseState(), data, createRng(SEED));
    expect(Object.keys(state.trainers).length).toBeGreaterThan(0);
  });
});
