import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_BY_COUNTRY } from '../../src/engine/config/naming';
import { bookCovering, createBreedingSystem } from '../../src/engine/breeding/season';
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
import { makeNameRegistry, namingContextFor } from '../../src/engine/naming/context';
import { pickOwnerStyle } from '../../src/engine/naming/generate';
import { validateHorseName, normalizeName } from '../../src/engine/naming/validate';
import type { NameRegistry } from '../../src/engine/naming/types';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import type { GameState, HorseId, WeeklySystem } from '../../src/engine/types';
import { racingHorseIds } from '../../src/engine/world/population';

/** M3-C7e2: 이름 생성기 게임 연결 검증 */

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const HEAVY_TIMEOUT = 120_000;
const NONE: NameRegistry = { isTaken: () => false };
const ENGINE_DIR = resolve(process.cwd(), 'src/engine');

const NAMING = getNamingData();
const STALLION_NAMES = getStallionNames();

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: STALLION_NAMES,
  nicks: getNicks(),
  naming: NAMING,
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: NAMING,
  stallionNames: STALLION_NAMES,
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const BREEDING_SYSTEMS: readonly WeeklySystem[] = [
  calendarSystem,
  createBreedingSystem({ nicks: getNicks(), naming: NAMING, stallionNames: STALLION_NAMES }),
];

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 정적 데이터의 실명 종마 이름(정규화) 집합 */
function stallionNormalized(): Set<string> {
  return new Set(Object.values(STALLION_NAMES).map((n) => normalizeName(n)));
}

/** 말 이름 단어 비교용 형태: 앞의 "d'" 같은 조각과 소유격을 떼고 영문자만 남긴다 */
function wordKey(word: string): string {
  return word.toLowerCase().replace(/^[a-z]'/, '').replace(/'s$/, '').replace(/[^a-z]/g, '');
}

function tokensOf(name: string): string[] {
  return name
    .split(' ')
    .map(wordKey)
    .filter((w) => w !== '');
}

/** 실명 종마가 아닌 말(생성기가 지은 이름). 실명 종마 Horse 는 id 가 종마 key 와 같다. */
function generatedHorseNames(state: GameState): string[] {
  return Object.values(state.horses)
    .filter((h) => STALLION_NAMES[h.id] === undefined)
    .map((h) => h.name);
}

/** 어떤 나라 마주가 소유한 현역마 이름 */
function racingNamesOwnedBy(state: GameState, country: string): string[] {
  const names: string[] = [];
  for (const id of racingHorseIds(state)) {
    const horse = state.horses[id];
    if (horse === undefined || horse.ownerId === null) continue;
    const owner = state.owners[horse.ownerId];
    if (owner?.country === country) names.push(horse.name);
  }
  return names;
}

/** 외국어 단어 집합(정규화 형태). 연결어 포함 여부는 호출부가 정한다. */
function foreignSet(words: readonly string[], extra: readonly string[] = []): Set<string> {
  return new Set([...words, ...extra].map(wordKey).filter((w) => w !== ''));
}

/** 이름 목록의 단어 중 집합에 든 단어 비율 */
function wordRatio(names: readonly string[], set: ReadonlySet<string>): number {
  let total = 0;
  let hit = 0;
  for (const name of names) {
    for (const w of tokensOf(name)) {
      total += 1;
      if (set.has(w)) hit += 1;
    }
  }
  return total === 0 ? 0 : hit / total;
}

/** 실제 소스 파일 목록(src/engine 아래 .ts) */
function engineSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...engineSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('수용 기준 1: 생성된 말 이름의 등록 규칙·중복·실명 종마 이름', () => {
  it('bootstrapGame 후 생성된 모든 말 이름이 validateHorseName 을 통과한다', () => {
    const state = boot();
    const names = generatedHorseNames(state);
    expect(names.length).toBeGreaterThan(1000);
    for (const name of names) {
      const v = validateHorseName(name, NONE, NAMING.protectedNames, NAMING.blockedPlaceTokens);
      expect(v.ok, `${name}: ${v.ok ? '' : v.reason}`).toBe(true);
    }
  }, HEAVY_TIMEOUT);

  it('생성된 말 이름은 서로 중복되지 않는다(정규화 기준)', () => {
    const state = boot();
    const normalized = generatedHorseNames(state).map((n) => normalizeName(n));
    expect(new Set(normalized).size).toBe(normalized.length);
  }, HEAVY_TIMEOUT);

  it('생성된 말 이름 중 실명 종마 이름과 같은 것이 없다', () => {
    const state = boot();
    const real = stallionNormalized();
    for (const name of generatedHorseNames(state)) {
      expect(real.has(normalizeName(name)), name).toBe(false);
    }
  }, HEAVY_TIMEOUT);
});

describe('수용 기준 2: 마주 국적별 이름 언어', () => {
  it('FR 마주 소유 현역마 이름의 프랑스어 단어 비율 ≥ 0.5', () => {
    const state = boot();
    const names = racingNamesOwnedBy(state, 'FR');
    expect(names.length).toBeGreaterThan(0);
    const fr = foreignSet(NAMING.lexicon.foreign.fr, ['de', 'du', 'des', 'la', 'le', 'les', 'et']);
    expect(wordRatio(names, fr)).toBeGreaterThanOrEqual(0.5);
  }, HEAVY_TIMEOUT);

  it('AE 마주 소유 현역마 이름의 아랍어 단어 비율 ≥ 0.6', () => {
    const state = boot();
    const names = racingNamesOwnedBy(state, 'AE');
    expect(names.length).toBeGreaterThan(0);
    const ar = foreignSet(NAMING.lexicon.foreign.ar, ['al']);
    expect(wordRatio(names, ar)).toBeGreaterThanOrEqual(0.6);
  }, HEAVY_TIMEOUT);

  it('GB 마주는 이름 언어가 en 이라 모국어 모드가 없다', () => {
    const state = boot();
    const gbOwners = Object.values(state.owners).filter((o) => o.country === 'GB');
    expect(gbOwners.length).toBeGreaterThan(0);
    for (const owner of gbOwners) {
      const ctx = namingContextFor(state, { ownerId: owner.id, sireId: null, damId: null }, {
        naming: NAMING,
        stallionNames: STALLION_NAMES,
      });
      expect(ctx.language).toBe('en');
    }
  }, HEAVY_TIMEOUT);

  it('모든 마주의 이름 언어는 LANGUAGE_BY_COUNTRY 와 같다', () => {
    const state = boot();
    for (const owner of Object.values(state.owners)) {
      const ctx = namingContextFor(state, { ownerId: owner.id, sireId: null, damId: null }, {
        naming: NAMING,
        stallionNames: STALLION_NAMES,
      });
      expect(ctx.language).toBe(LANGUAGE_BY_COUNTRY[owner.country]);
    }
  }, HEAVY_TIMEOUT);
});

describe('수용 기준 3: 플레이어 망아지 출산 이름', () => {
  it('교배 → 수태 → 출산 후 망아지 이름은 등록 규칙을 통과하고 레지스트리에서 중복이 없다', () => {
    const base = boot();
    const next = structuredClone(base);
    next.date = { year: 2026, week: 10 };
    const owner = next.owners[next.playerOwnerId];
    if (owner === undefined) throw new Error('테스트 전제: 플레이어 마주');
    owner.funds = 1e12;

    const mareIds = owner.horseIds.filter((id) => next.mares[id] !== undefined);
    const stallionIds = Object.keys(next.stallions).sort();
    let booked: GameState | null = null;
    let bookedMare: HorseId | null = null;
    for (const stallionId of stallionIds) {
      const stallion = next.stallions[stallionId];
      if (stallion === undefined) continue;
      stallion.fertility = 1;
      for (const mareId of mareIds) {
        const result = bookCovering(next, next.playerOwnerId, mareId, stallionId);
        if (result.ok) {
          booked = result.state;
          bookedMare = mareId;
          break;
        }
      }
      if (booked !== null) break;
    }
    if (booked === null || bookedMare === null) throw new Error('테스트 전제: 플레이어 암말 교배 예약 성공');

    let state: GameState = booked;
    let foalId: HorseId | null = null;
    for (let step = 0; step < 200 && foalId === null; step++) {
      const out = advanceWeek(state, BREEDING_SYSTEMS);
      state = out.state;
      const born = out.events.find((e) => e.type === 'foal_born');
      if (born?.type === 'foal_born') foalId = born.foalId;
    }
    if (foalId === null) throw new Error('테스트 전제: 망아지 출생 이벤트가 없다');

    const foal = state.horses[foalId];
    if (foal === undefined) throw new Error('망아지 레코드가 없다');
    const v = validateHorseName(foal.name, NONE, NAMING.protectedNames, NAMING.blockedPlaceTokens);
    expect(v.ok, foal.name).toBe(true);

    const sameName = Object.values(state.horses).filter((h) => normalizeName(h.name) === normalizeName(foal.name));
    expect(sameName.length, foal.name).toBe(1);
  }, HEAVY_TIMEOUT);
});

describe('수용 기준 4: 같은 시드 재현성·저장 왕복', () => {
  it('같은 시드 2회 bootstrapGame 결과가 toEqual', () => {
    expect(boot(SEED)).toEqual(boot(SEED));
  }, HEAVY_TIMEOUT);

  it('같은 시드 2회 advance(4주) 결과가 toEqual', () => {
    const systems = createGameSystems(STATIC_GAME);
    const run = (): GameState => {
      let s = boot(SEED);
      for (let i = 0; i < 4; i++) s = advanceWeek(s, systems).state;
      return s;
    };
    expect(run()).toEqual(run());
  }, HEAVY_TIMEOUT);

  it('bootstrapGame 결과를 저장 후 불러오면 그대로다', () => {
    const state = boot(SEED);
    const loaded = deserializeGame(serializeGame(state, '2026-10-12T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state).toEqual(state);
    }
  }, HEAVY_TIMEOUT);
});

describe('namingContextFor·makeNameRegistry 단위', () => {
  const data = { naming: NAMING, stallionNames: STALLION_NAMES };

  it('마주가 없으면 language en, 스타일은 pickOwnerStyle("world", null)', () => {
    const state = boot();
    const ctx = namingContextFor(state, { ownerId: null, sireId: null, damId: null }, data);
    expect(ctx.language).toBe('en');
    expect(ctx.style).toEqual(pickOwnerStyle('world', null, NAMING.styles));
  }, HEAVY_TIMEOUT);

  it('부 이름은 state.horses 를 먼저 보고, 없으면 실명 종마 이름표를 쓴다', () => {
    const state = boot();
    const sireKey = Object.keys(STALLION_NAMES)[0];
    if (sireKey === undefined) throw new Error('테스트 전제: 실명 종마');
    const withHorse = namingContextFor(state, { ownerId: null, sireId: sireKey, damId: null }, data);
    expect(withHorse.sireName).toBe(state.horses[sireKey]?.name ?? null);

    const stripped = structuredClone(state);
    delete stripped.horses[sireKey];
    const fallback = namingContextFor(stripped, { ownerId: null, sireId: sireKey, damId: null }, data);
    expect(fallback.sireName).toBe(STALLION_NAMES[sireKey]);

    const none = namingContextFor(stripped, { ownerId: null, sireId: 'no-such-horse', damId: null }, data);
    expect(none.sireName).toBeNull();
    expect(none.damName).toBeNull();
  }, HEAVY_TIMEOUT);

  it('tributeNames 는 정렬되고 40개 이하이며 성(한 단어)만 담는다', () => {
    const state = boot();
    const ctx = namingContextFor(state, { ownerId: null, sireId: null, damId: null }, data);
    expect(ctx.tributeNames.length).toBeGreaterThan(0);
    expect(ctx.tributeNames.length).toBeLessThanOrEqual(40);
    const sorted = [...ctx.tributeNames].sort();
    expect([...ctx.tributeNames]).toEqual(sorted);
    for (const s of ctx.tributeNames) {
      expect(s).not.toMatch(/\s/);
      expect(s).not.toBe('');
    }
  }, HEAVY_TIMEOUT);

  it('makeNameRegistry 는 기존 말 이름을 정규화해 막고, add 로 등록한 이름도 막는다', () => {
    const state = boot();
    const registry = makeNameRegistry(state);
    const existing = generatedHorseNames(state)[0];
    if (existing === undefined) throw new Error('테스트 전제: 생성 말 이름');
    expect(registry.isTaken(normalizeName(existing))).toBe(true);
    expect(registry.isTaken(existing.toUpperCase())).toBe(true);
    expect(registry.isTaken('Zzqxv Plorbaq')).toBe(false);
    registry.add('Zzqxv Plorbaq');
    expect(registry.isTaken(normalizeName('zzqxv plorbaq'))).toBe(true);
  }, HEAVY_TIMEOUT);

  it('존재하지 않는 마주 id 는 Error', () => {
    const state = boot();
    expect(() => namingContextFor(state, { ownerId: 'o-none', sireId: null, damId: null }, data)).toThrow();
  }, HEAVY_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('src/engine 의 어떤 파일에도 Math.random·Date.now·DOM 접근이 없다', () => {
    const forbidden = [/Math\.random\(/, /Date\.now\(/, /\bdocument\./, /\bwindow\./];
    for (const file of engineSourceFiles(ENGINE_DIR)) {
      const text = readFileSync(file, 'utf-8');
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file}: ${pattern}`).toBe(false);
      }
    }
  });
});
