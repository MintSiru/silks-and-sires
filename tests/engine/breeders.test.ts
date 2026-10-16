import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { BREEDER_COUNTRY_ORDER, BREEDER_COUNT_BY_COUNTRY, BREEDER_FUNDS_RANGE, BREEDER_SCALE_SHARE, OWNER_BREEDER_SHARE } from '../../src/engine/config/breeders';
import { POPULATION_COUNTRY_ORDER } from '../../src/engine/config/population';
import { STARTER_COUNTRY } from '../../src/engine/config/starter';
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
import { pickBreederFor } from '../../src/engine/people/breeders';
import { normalizeFullName } from '../../src/engine/people/names';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { racingHorseIds } from '../../src/engine/world/population';
import type { CommercialBreeder, GameState, Horse, Owner } from '../../src/engine/types';

const SEEDS = [20261011, 7] as const;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const SAVED_AT = '2026-10-12T00:00:00.000Z';

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

/**
 * 변경 전(M4-C0 이전, HEAD 97daaca) 같은 시드의 현역마·마주·조교사 투영 해시.
 * 투영은 breederId 를 뺀 말 전체 + 마주(id·이름·horseIds) + 조교사(id·이름·수용 두수)다.
 * 생산자 배정은 집단 rng 를 쓰지 않으므로 이 값이 바뀌면 기존 결과가 바뀐 것이다.
 * 2026-10-12 재고정: 유럽 밖·더트 종마 가중치 보정(SIRE_OVERSEAS_WEIGHT_MULT·SIRE_DIRT_WEIGHT_MULT)으로 부 선택이 바뀜.
 * 2026-10-15 재고정: 독일 계류 종마 4두 추가(M2-10 일부)로 부 후보가 바뀜.
 * 2026-10-15 재고정: 독일·이탈리아 종마 20두 추가와 어휘 'Destino' 삭제(같은 이름 실존 종마)로 바뀜.
 * 2026-10-15 재고정: 독일·이탈리아 종마 10두와 조상·외조부 추가, 어휘 'Helmet' 삭제로 바뀜.
 * 2026-10-15 재고정: Elegant Air·Super Concorde 의 부(Shirley Heights·Bold Reasoning) 연결로 바뀜.
 * 2026-10-15 재고정: Königsstuhl 부계(Bahram 계) 추가, Monsun 계 신설·Monsun 거리 classic 으로 바뀜.
 * 2026-10-15 재고정: Königsstuhl 거리 classic 으로 바뀜.
 * 2026-10-15 재고정: 5대 혈통 채우기 1회차(Dubawi·Frankel·Kingman·Lope de Vega 쪽 조상 추가)로 바뀜.
 * 2026-10-15 재고정: 1회차 42~44(Storm Cat·Vettori 쪽, Nijinsky 추가)로 바뀜.
 * 2026-10-15 재고정: 5대 혈통 2회차(조상 29두 추가, Blushing Groom 계 분리)로 바뀜.
 * 2026-10-15 재고정: 5대 혈통 3회차(조상 35두 추가, Waajib 생년 정정, 지명 'Persepolis' 삭제)로 바뀜.
 * 2026-10-15 재고정: 5대 혈통 4회차(조상 28두 추가)와 어휘 'Venture' 삭제·'Effort' 추가로 바뀜.
 * 2026-10-15 재고정: 유럽 1~2티어 마지막 정리 회차(조상 12두 추가)로 바뀜.
 * 2026-10-15 재고정: 5회차(유럽 밖 1~2티어 ①, 조상 27두 추가)와 Venture 털색 정정으로 바뀜.
 * 2026-10-15 재고정: 6회차(조상 34두)·독일 3두 티어 통일(Torquator Tasso 3→4, Japan·Fantastic Moon 4→5)로 바뀜.
 * 2026-10-15 재고정: 7회차·티어 통일 18두·새 현역 26두(+외조부 17두)로 바뀜.
 * 2026-10-15 재고정: 8회차(조상 23두, Turn-to IE·Deputy Minister brown)로 바뀜.
 * 2026-10-15 재고정: M4-ST1 지급마 능력 상향·성장형 고정(플레이어 지급마의 ability·potential·growth·officialRating 만 바뀜, AI 말 불변 확인).
 * 2026-10-15 재고정: 5대 혈통 15회차(조상 13두·Cadeaux Genereux 계통 정정·어휘 Cormorant 제거)로 바뀜.
 * 2026-10-16 재고정: M4-ST2 지급마 가상 모마 3두 추가(지급마 damId·familyId 연결)로 바뀜. 지급마 모마를 빼고 연결을 지우면 이전 값과 같다(확인 완료).
 * 2026-10-16 재고정: 5대 혈통 16회차(조상 16두·Surumu 계열 계통·Balidar 출생국 정정)로 바뀜.
 * 2026-10-16 재고정: 5대 혈통 17회차(조상 31두·Sea-Bird 계열 계통 정정·어휘 Realm 제거)로 바뀜.
 */
const PRE_CHANGE_PROJECTION_SHA: Record<number, string> = {
  20261011: 'bf756936d92b884ae199b9b2e0acd0dd88504af744306f082eecfddbc0c71a1d',
  7: '40e8959a24d204327d0519b7fe741c8130e35dbc7fb50cdb6725e8d5d234fd3b',
};

function boot(seed: number): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** breederId 를 제외한 결과 투영 */
function projection(state: GameState) {
  const horses = Object.keys(state.horses)
    .sort()
    .map((id) => {
      const h = { ...(state.horses[id] as object) } as Record<string, unknown>;
      delete h.breederId;
      return h;
    });
  const owners = Object.keys(state.owners)
    .sort()
    .map((id) => ({ id, name: state.owners[id]?.name, horseIds: state.owners[id]?.horseIds }));
  const trainers = Object.keys(state.trainers)
    .sort()
    .map((id) => ({ id, name: state.trainers[id]?.name, capacity: state.trainers[id]?.capacity }));
  return { horses, owners, trainers };
}

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** AI 현역마 중 첫 번째(ID 오름차순) */
function firstAiHorse(state: GameState): Horse {
  const id = racingHorseIds(state)[0];
  const horse = id === undefined ? undefined : state.horses[id];
  if (horse === undefined) throw new Error('AI 현역마가 없다');
  return horse;
}

function breederOf(state: GameState, horse: Horse): CommercialBreeder | undefined {
  return horse.breederId === null ? undefined : state.breeders[horse.breederId];
}

const STATES = new Map<number, GameState>();

beforeAll(() => {
  for (const seed of SEEDS) {
    STATES.set(seed, boot(seed));
  }
}, 600_000);

function stateOf(seed: number): GameState {
  const state = STATES.get(seed);
  if (state === undefined) throw new Error(`시드 ${seed} 상태가 없다`);
  return state;
}

describe('상업 생산자 생성 (generateBreeders)', () => {
  for (const seed of SEEDS) {
    describe(`시드 ${seed}`, () => {
      it('나라별 생산자 수가 설정과 같고, ID 는 brd_ + 6자리 일련번호이며 나라 순서 → 번호 순이다', () => {
        const breeders = Object.values(stateOf(seed).breeders);
        for (const country of POPULATION_COUNTRY_ORDER) {
          const n = breeders.filter((b) => b.country === country).length;
          expect(n, `${country} 생산자 수`).toBe(BREEDER_COUNT_BY_COUNTRY[country]);
        }
        const total = Object.values(BREEDER_COUNT_BY_COUNTRY).reduce((a, b) => a + b, 0);
        expect(breeders).toHaveLength(total);

        const ids = Object.keys(stateOf(seed).breeders).sort();
        ids.forEach((id, i) => {
          expect(id).toMatch(/^brd_\d{6}$/);
          expect(id).toBe(`brd_${String(i + 1).padStart(6, '0')}`);
        });
        const countries = BREEDER_COUNTRY_ORDER.flatMap((c) => Array(BREEDER_COUNT_BY_COUNTRY[c]).fill(c));
        const orderedByNumber = Object.keys(stateOf(seed).breeders)
          .sort()
          .map((id) => stateOf(seed).breeders[id]?.country);
        expect(orderedByNumber).toEqual(countries);
      });

      it('이름은 마주 studName·다른 생산자와 겹치지 않고(정규화 기준), 가상 지역명과 목장 접미어로만 이루어진다', () => {
        const state = stateOf(seed);
        const places = getPeopleData().places;
        const used = new Set<string>();
        for (const owner of Object.values(state.owners)) {
          if (owner.studName !== null) used.add(normalizeFullName(owner.studName));
        }
        for (const breeder of Object.values(state.breeders)) {
          const key = normalizeFullName(breeder.name);
          expect(used.has(key), `이름 중복 ${breeder.name}`).toBe(false);
          used.add(key);

          const regions = places.regionNames[breeder.country as keyof typeof places.regionNames];
          const suffixes = places.studSuffixes[breeder.country as keyof typeof places.studSuffixes];
          const matches = regions.some((r) => suffixes.some((s) => breeder.name === `${r} ${s}` || breeder.name === `${s} ${r}`));
          expect(matches, `가상 목장명 규칙 위반 ${breeder.name}`).toBe(true);
        }
      });

      it('규모 두수는 나라별 비율(최대 나머지법)과 맞고, 자금은 규모 범위의 정수이며, horseIds 는 빈 배열이다', () => {
        const state = stateOf(seed);
        for (const country of POPULATION_COUNTRY_ORDER) {
          const list = Object.values(state.breeders).filter((b) => b.country === country);
          const total = BREEDER_COUNT_BY_COUNTRY[country];
          for (const scale of ['large', 'medium', 'small'] as const) {
            const n = list.filter((b) => b.scale === scale).length;
            const expected = total * BREEDER_SCALE_SHARE[scale];
            expect(Math.abs(n - expected), `${country} ${scale} 두수 ${n}`).toBeLessThan(1);
          }
        }
        for (const breeder of Object.values(state.breeders)) {
          const range = BREEDER_FUNDS_RANGE[breeder.scale];
          expect(Number.isInteger(breeder.funds)).toBe(true);
          expect(breeder.funds).toBeGreaterThanOrEqual(range.min);
          expect(breeder.funds).toBeLessThanOrEqual(range.max);
          expect(breeder.horseIds).toEqual([]);
        }
      });
    });
  }

  it('같은 시드로 두 번 만들면 생산자 레코드가 같다', () => {
    const again = boot(SEEDS[0]);
    expect(again.breeders).toEqual(stateOf(SEEDS[0]).breeders);
  }, 600_000);

  it('저장 후 복원하면 breeders 가 그대로다', () => {
    const state = stateOf(SEEDS[0]);
    const result = deserializeGame(serializeGame(state, SAVED_AT));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.breeders).toEqual(state.breeders);
    }
  });
});

describe('현역마 생산자 배정 (pickBreederFor)', () => {
  for (const seed of SEEDS) {
    describe(`시드 ${seed}`, () => {
      // 구조상 약 25~32% 이고 시드·종마 데이터에 따라 흔들린다(2026-10-15 시드 20261011 에서 24.7%). 하한 23%
      it('AI 현역마 중 오너브리더 생산 비율이 23~35% 다', () => {
        const state = stateOf(seed);
        const ai = racingHorseIds(state).map((id) => state.horses[id] as Horse);
        const ownerBred = ai.filter((h) => h.breederId === h.ownerId).length;
        const share = ownerBred / ai.length;
        expect(share).toBeGreaterThanOrEqual(0.23);
        expect(share).toBeLessThanOrEqual(0.35);
      });

      it('오너브리더가 아닌 AI 현역마는 같은 나라 상업 생산자가 생산했다', () => {
        const state = stateOf(seed);
        const ai = racingHorseIds(state).map((id) => state.horses[id] as Horse);
        for (const horse of ai) {
          if (horse.breederId === horse.ownerId) continue;
          const breeder = breederOf(state, horse);
          expect(breeder, `${horse.id} 생산자`).toBeDefined();
          expect(breeder?.country, `${horse.id} 생산자 국가`).toBe(horse.countryOfBirth);
        }
      });

      it('오너브리더는 studName 이 있는 마주만 가능하고, small 마주는 오너브리더가 없다', () => {
        const state = stateOf(seed);
        const ai = racingHorseIds(state).map((id) => state.horses[id] as Horse);
        for (const horse of ai) {
          const owner = state.owners[horse.ownerId ?? ''] as Owner;
          if (horse.breederId === horse.ownerId) {
            expect(owner.studName).not.toBeNull();
            expect(owner.tier).not.toBe('small');
          }
        }
      });

      it('시작 현역마(플레이어 소유)는 같은 나라 상업 생산자가 생산했다', () => {
        const state = stateOf(seed);
        const starters = Object.values(state.horses).filter(
          (h) => h.ownerId === state.playerOwnerId && h.status === 'in_training',
        );
        expect(starters.length).toBeGreaterThan(0);
        for (const horse of starters) {
          const breeder = breederOf(state, horse);
          expect(breeder?.country).toBe(STARTER_COUNTRY);
        }
      });

      it('같은 말·같은 상태에 대해 생산자 배정은 항상 같다(독립 스트림)', () => {
        const state = stateOf(seed);
        const horse = firstAiHorse(state);
        const owner = state.owners[horse.ownerId ?? ''] ?? null;
        const first = pickBreederFor(state, horse, owner);
        const second = pickBreederFor(state, horse, owner);
        expect(first).toBe(second);
      });
    });
  }

  it('생산자가 하나도 없으면(옛 저장본) 마주가 있으면 owner.id, 없으면 null 이다', () => {
    const state = structuredClone(stateOf(SEEDS[0]));
    state.breeders = {};
    const horse = firstAiHorse(state);
    const owner = state.owners[horse.ownerId ?? ''] as Owner;
    expect(pickBreederFor(state, horse, owner)).toBe(owner.id);
    expect(pickBreederFor(state, horse, null)).toBeNull();
  });

  it('오너브리더 확률 설정의 순서는 major > mid > small = 0 이다', () => {
    expect(OWNER_BREEDER_SHARE.major).toBeGreaterThan(OWNER_BREEDER_SHARE.mid);
    expect(OWNER_BREEDER_SHARE.mid).toBeGreaterThan(OWNER_BREEDER_SHARE.small);
    expect(OWNER_BREEDER_SHARE.small).toBe(0);
  });
});

describe('기존 결과 불변', () => {
  for (const seed of SEEDS) {
    it(`시드 ${seed}: breederId 를 뺀 말·마주·조교사 투영이 변경 전과 같다`, () => {
      expect(sha(projection(stateOf(seed)))).toBe(PRE_CHANGE_PROJECTION_SHA[seed]);
    });
  }
});
