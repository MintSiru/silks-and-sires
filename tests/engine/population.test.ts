import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOREIGN_OWNER_SHARE } from '../../src/engine/config/people';
import {
  POPULATION_AGE_SHARES,
  POPULATION_COUNTRY_ORDER,
  POPULATION_IN_TRAINING,
} from '../../src/engine/config/population';
import { getNamingData, getNicks, getPeopleData, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { growthSystem } from '../../src/engine/horse/growth';
import { createRng } from '../../src/engine/rng';
import { serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { bootstrapRacingPopulation, type RacingPopulationStaticData } from '../../src/engine/world/population';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';
import { initialOfficialRating } from '../../src/engine/world/rating';
import type { GameState, Horse, RealStallionRecord } from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const START_YEAR = 2026;
const SIRE_AGE_MIN_YEARS = 5; // MIN_SIRE_AGE_AT_COVER(4) + SIRE_BIRTH_MARGIN_YEARS(1)
const TEN_YEARS = 10;
const TOLERANCE = 0.1;

function worldData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
  };
}

function populationData(): RacingPopulationStaticData {
  return { stallionRecords: getStallionRecords(), naming: getNamingData(), stallionNames: getStallionNames() };
}

/** 인물 → 세계(실명 종마·기초 암말) → 현역마 순서로 만든 새 게임 상태 */
function boot(seed = SEED): GameState {
  const base = createNewGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } });
  const withPeople = bootstrapPeople(base, getPeopleData(), createRng(seed));
  const withWorld = bootstrapWorld(withPeople, worldData(), createRng(seed + 1));
  return bootstrapRacingPopulation(withWorld, populationData(), createRng(seed + 2));
}

function racingHorses(state: GameState): Horse[] {
  return Object.values(state.horses).filter(
    (h) => h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId,
  );
}

function countByCountry(horses: readonly Horse[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of horses) {
    out[h.countryOfBirth] = (out[h.countryOfBirth] ?? 0) + 1;
  }
  return out;
}

/** 오름차순 정렬 기준 분위수(0~1). 값이 없으면 NaN */
function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx] as number;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function meanAbility(h: Horse): number {
  const a = h.ability;
  return (a.speed + a.stamina + a.acceleration + a.guts + a.power) / 5;
}

function recordByKey(records: readonly RealStallionRecord[]): Map<string, RealStallionRecord> {
  return new Map(records.map((r) => [r.key, r] as const));
}

describe('현역마 집단 초기화 (bootstrapRacingPopulation)', () => {
  it('1. 같은 시드면 결과가 같고, 나라별 현역마 수가 설정값과 같다', () => {
    const a = boot();
    const b = boot();
    expect(a).toEqual(b);

    const counts = countByCountry(racingHorses(a));
    for (const country of POPULATION_COUNTRY_ORDER) {
      expect(counts[country]).toBe(POPULATION_IN_TRAINING[country]);
    }
  });

  it('2. 마주·조교사는 같은 나라 인물이고, 마주 소유 목록과 ownerId 가 일치하며, 조교사 수용 두수를 넘지 않는다', () => {
    const state = boot();
    const horses = racingHorses(state);
    const load = new Map<string, number>();

    for (const h of horses) {
      const owner = state.owners[h.ownerId as string];
      const trainer = state.trainers[h.trainerId as string];
      expect(owner, `마주 없음 ${h.id}`).toBeDefined();
      expect(trainer, `조교사 없음 ${h.id}`).toBeDefined();
      expect(owner?.isPlayer).toBe(false);
      // 마주는 말이 뛰는 나라 마주, 또는 FOREIGN_OWNER_SHARE 의 외국 마주(M3-C7e1)
      const foreignByHome: Partial<Record<string, { country: string }>> = FOREIGN_OWNER_SHARE;
      const allowedOwnerCountries = [h.countryOfBirth, foreignByHome[h.countryOfBirth]?.country];
      expect(allowedOwnerCountries).toContain(owner?.country);
      expect(trainer?.country).toBe(h.countryOfBirth);
      expect(owner?.horseIds).toContain(h.id);
      expect(h.breederId).toBe(h.ownerId);
      load.set(h.trainerId as string, (load.get(h.trainerId as string) ?? 0) + 1);
    }

    for (const [trainerId, n] of load) {
      expect(n, `조교사 ${trainerId} 수용 초과`).toBeLessThanOrEqual(state.trainers[trainerId]?.capacity ?? 0);
    }

    for (const owner of Object.values(state.owners)) {
      for (const id of owner.horseIds) {
        expect(state.horses[id]?.ownerId).toBe(owner.id);
      }
    }
  });

  it('3. 부(父)는 모두 존재하는 실명 종마이고 교배 가능 연도 조건을 만족하며, 계통·거리 편향이 맞다', () => {
    const state = boot();
    const records = recordByKey(getStallionRecords());
    const distanceByProfile: Record<string, number[]> = {};

    for (const h of racingHorses(state)) {
      const sire = records.get(h.sireId ?? '');
      expect(sire, `실명 종마 아님 ${String(h.sireId)}`).toBeDefined();
      expect(state.horses[h.sireId ?? '']).toBeDefined();
      expect(sire?.status === 'active' || sire?.status === 'pensioned').toBe(true);
      expect(sire?.foaled ?? Infinity).toBeLessThanOrEqual(h.birthYear - SIRE_AGE_MIN_YEARS);
      expect(h.sireLineId).toBe(sire?.sireLineId);
      expect(h.damId).toBeNull();
      if (h.sex === 'female') expect(h.gelded).toBe(false);
      if (sire) {
        (distanceByProfile[sire.distanceProfile] ??= []).push(h.aptitude.distanceOptimum);
      }
    }

    // 부의 거리 성향이 길수록 자식의 최적 거리도 길다(distanceBias 가 반영됨)
    expect(mean(distanceByProfile['speed'] ?? [])).toBeLessThan(mean(distanceByProfile['middle'] ?? []));
  });

  it('나이 분포와 성별·거세 규칙이 설정값과 맞고, 2세는 OR 이 없다', () => {
    const state = boot();
    const horses = racingHorses(state);

    for (const country of POPULATION_COUNTRY_ORDER) {
      const own = horses.filter((h) => h.countryOfBirth === country);
      expect(own.length).toBe(POPULATION_IN_TRAINING[country]);
      for (const entry of POPULATION_AGE_SHARES) {
        const n = own.filter((h) => START_YEAR - h.birthYear === entry.age).length;
        expect(Math.abs(n - own.length * entry.share)).toBeLessThanOrEqual(1);
      }
    }

    for (const h of horses) {
      const age = START_YEAR - h.birthYear;
      if (age < 3) expect(h.officialRating).toBeNull();
      else expect(h.officialRating).toBe(initialOfficialRating(h));
      if (age < 4) expect(h.gelded).toBe(false);
    }

    const femaleShare = horses.filter((h) => h.sex === 'female').length / horses.length;
    expect(Math.abs(femaleShare - 0.42)).toBeLessThan(0.05);

    const males4 = horses.filter((h) => h.sex === 'male' && START_YEAR - h.birthYear >= 4);
    const geldingShare = males4.filter((h) => h.gelded).length / males4.length;
    expect(Math.abs(geldingShare - 0.35)).toBeLessThan(0.07);
  });

  it('4. 3세 이상 OR 분포: 평균 65~80, 상위 1% 105~125 (수치를 출력한다)', () => {
    const state = boot();
    const ors = racingHorses(state)
      .filter((h) => h.officialRating !== null)
      .map((h) => h.officialRating as number);
    const avgPotential = racingHorses(state).map((h) => mean([h.potential.speed, h.potential.stamina, h.potential.acceleration, h.potential.guts, h.potential.power]));
    const avgAbility = racingHorses(state).filter((h) => h.officialRating !== null).map(meanAbility);

    const summary = {
      n: ors.length,
      mean: Number(mean(ors).toFixed(1)),
      p50: quantile(ors, 0.5),
      p99: quantile(ors, 0.99),
      max: Math.max(...ors),
      min: Math.min(...ors),
      abilityMean: Number(mean(avgAbility).toFixed(1)),
      potentialP99: Number(quantile(avgPotential, 0.99).toFixed(1)),
    };
    console.log('[population] OR(3세 이상)', JSON.stringify(summary));

    expect(summary.mean).toBeGreaterThanOrEqual(65);
    expect(summary.mean).toBeLessThanOrEqual(80);
    expect(summary.p99).toBeGreaterThanOrEqual(105);
    expect(summary.p99).toBeLessThanOrEqual(125);
  });

  it('6. bootstrap 후 serializeGame 결과 길이가 8,000,000 미만이다', () => {
    const state = boot();
    const json = serializeGame(state, '2026-01-01T00:00:00.000Z');
    console.log(`[population] serializeGame 길이 ${json.length} 자`);
    expect(json.length).toBeLessThan(8_000_000);
  });

  it('이미 AI 현역마가 있으면 Error 를 던진다', () => {
    const state = boot();
    expect(() => bootstrapRacingPopulation(state, populationData(), createRng(SEED + 9))).toThrow();
  });
});

describe('연간 교체 (createPopulationSystem)', () => {
  it('1월 1주가 아니면 아무것도 바꾸지 않는다', () => {
    const state = boot();
    const draft = structuredClone(state);
    const events = createPopulationSystem(populationData()).run(draft, {
      date: { year: START_YEAR + 1, week: 2 },
      rng: createRng(SEED + 3),
    });
    expect(events).toEqual([]);
    expect(draft).toEqual(state);
  });

  it('같은 연도 1월 1주를 두 번 돌려도 신규 2세가 중복 투입되지 않는다(초기화 직후 2026년 1주 포함)', () => {
    const state = boot();
    const system = createPopulationSystem(populationData());
    const draft = structuredClone(state);
    const events = system.run(draft, { date: { year: START_YEAR, week: 1 }, rng: createRng(SEED + 4) });
    expect(events).toEqual([]);
    expect(draft).toEqual(state);
  });

  it('은퇴 나이·은퇴 상태·이벤트가 맞고, 은퇴마도 현역 집계에서 빠진다', () => {
    const state = boot();
    const system = createPopulationSystem(populationData());
    const draft = structuredClone(state);
    const rng = createRng(SEED + 5);
    const before = racingHorses(draft);
    const events = system.run(draft, { date: { year: START_YEAR + 1, week: 1 }, rng });

    const oldRetired = before.filter((h) => START_YEAR + 1 - h.birthYear >= 8);
    for (const h of oldRetired) {
      expect(draft.horses[h.id]?.status).toBe('retired');
    }
    const retiredEvents = events.filter((e) => e.type === 'horse_status_changed');
    expect(retiredEvents.length).toBeGreaterThanOrEqual(oldRetired.length);
    for (const e of retiredEvents) {
      if (e.type === 'horse_status_changed') {
        expect(e.to).toBe('retired');
        // AI 종마 편입은 기존 은퇴 이벤트를 보존하고 최종 상태만 stud 로 올린다(M4-D7b).
        const aiEntrant = draft.stallions[e.horseId]?.aiEntrant === true;
        expect(draft.horses[e.horseId]?.status).toBe(aiEntrant ? 'stud' : 'retired');
        if (aiEntrant) expect(draft.horses[e.horseId]?.ownerId).toBeNull();
      }
    }
    expect(racingHorses(draft).some((h) => START_YEAR + 1 - h.birthYear >= 8)).toBe(false);
  });

  it('5. 연간 교체 10년 반복: 나라별 현역마 수가 설정값 ±10% 안, 이름 중복 없음(생성 실패 없음)', () => {
    let state = boot();
    const system = createPopulationSystem(populationData());
    const rng = createRng(SEED + 6);

    for (let y = START_YEAR + 1; y <= START_YEAR + TEN_YEARS; y++) {
      const draft = structuredClone(state);
      system.run(draft, { date: { year: y, week: 1 }, rng });
      for (let week = 1; week <= 52; week++) {
        growthSystem.run(draft, { date: { year: y, week }, rng });
      }
      state = draft;
    }

    const counts = countByCountry(racingHorses(state));
    const report: Record<string, number> = {};
    for (const country of POPULATION_COUNTRY_ORDER) {
      report[country] = counts[country] ?? 0;
    }
    console.log('[population] 10년 후 나라별 현역마', JSON.stringify(report));
    const ageDist: Record<number, number> = {};
    for (const h of racingHorses(state)) {
      const age = START_YEAR + TEN_YEARS - h.birthYear;
      ageDist[age] = (ageDist[age] ?? 0) + 1;
    }
    const total = racingHorses(state).length;
    const ageShare = Object.fromEntries(
      Object.entries(ageDist).map(([age, n]) => [age, Number((n / total).toFixed(3))]),
    );
    console.log('[population] 10년 후 나이 분포(현역마 비율)', JSON.stringify(ageShare));
    for (const country of POPULATION_COUNTRY_ORDER) {
      const target = POPULATION_IN_TRAINING[country];
      expect(Math.abs((counts[country] ?? 0) - target) / target, `${country} 편차`).toBeLessThanOrEqual(TOLERANCE);
    }

    const names = Object.values(state.horses).map((h) => h.name);
    expect(new Set(names).size).toBe(names.length);
  }, 60_000);

  it('같은 시드·같은 상태면 연간 교체 결과가 같다', () => {
    const state = boot();
    const runOnce = (): GameState => {
      const draft = structuredClone(state);
      createPopulationSystem(populationData()).run(draft, {
        date: { year: START_YEAR + 1, week: 1 },
        rng: createRng(SEED + 7),
      });
      return draft;
    };
    expect(runOnce()).toEqual(runOnce());
  });
});

describe('엔진 순수성', () => {
  it('현역마 집단 엔진 파일에 Math.random · Date.now 가 없다', () => {
    const files = [
      'src/engine/config/population.ts',
      'src/engine/world/population.ts',
      'src/engine/world/populationSystem.ts',
      'src/engine/world/rating.ts',
    ];
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(text, f).not.toMatch(/Math\.random|Date\.now/);
    }
  });
});
