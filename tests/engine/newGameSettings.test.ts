import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS, emptyFarm, HOME_COUNTRIES, uniformFacilities } from '../../src/engine/config/farm';
import { STARTING_FUNDS } from '../../src/engine/config/game';
import * as data from '../../src/engine/data/staticData';
import { weeklyConditionInPlace } from '../../src/engine/horse/conditioning';
import { generateHorse } from '../../src/engine/horse/generate';
import { injuryWeights } from '../../src/engine/horse/injury';
import { createRng } from '../../src/engine/rng';
import { createSeasonSystem } from '../../src/engine/season/system';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import type { Difficulty, GameEvent, GameState, HomeCountry, Horse, InjuryKind, Rng, StartType } from '../../src/engine/types';

const OPTIONS = { seed: 20261011, playerName: 'Test Owner',
  silks: { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } } as const;
const BOOT_DATA: BootstrapData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
// 구현 전 HEAD 를 /tmp 에 별도로 풀어 같은 옵션·정적 데이터로 측정한 전체 JSON 해시. 2026-10-16 18~22회차 혈통·털색 정리로 재고정.
// M4-F1: 실명 NH 종마의 데이터 studRole 을 초기 Stallion 에 옮겨 전체 상태 해시만 갱신.
const LEGACY_HASH = '32dd6e346e9c09b61d2a0787bb48e7dfb03289470f79ebbc96a0300dc03518ea';
const PACKAGES = [
  { difficulty: 'easy', funds: 1_500_000, mares: 3, breeder: 2, owner: 3, level: 2, size: 'medium' },
  { difficulty: 'normal', funds: 600_000, mares: 2, breeder: 1, owner: 2, level: 1, size: 'medium' },
  { difficulty: 'hard', funds: 250_000, mares: 1, breeder: 0, owner: 1, level: 1, size: 'small' },
] as const;
const DATE = { year: 2026, week: 25 };
const RACE_ID = 'test-catastrophic-race';

function ownedHorses(state: GameState, status: Horse['status']): Horse[] {
  return Object.values(state.horses).filter((h) => h.ownerId === state.playerOwnerId && h.status === status);
}

function fixtureHorse(): Horse {
  return generateHorse(createRng('settings-fixture'), {
    id: 'settings-horse', name: 'Silver Fern', sex: 'female', birthYear: 2023,
    currentYear: DATE.year, countryOfBirth: 'GB', status: 'in_training', level: 70,
  });
}

/** 발생 여부만 고정한다. 종류·기간은 실제 시드 난수로 뽑고 공용 상태는 그대로 전진한다. */
function injuryCertainRng(seed: number): Rng {
  const rng = createRng(seed);
  return { ...rng, chance: (p) => { rng.chance(p); return true; } };
}

/** 시즌 통합에서 발생 종류를 고정한다. 예후불량 판정은 실제 독립 난수를 쓴다. */
function fractureRng(racing: boolean, kind: InjuryKind = 'fracture'): Rng {
  const rng = createRng(1);
  const weights = injuryWeights(3, { date: DATE, racing });
  const kinds = Object.keys(weights) as InjuryKind[];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const offset = kinds.slice(0, kinds.indexOf(kind)).reduce((sum, key) => sum + weights[key], 0);
  const controlled: Rng = { ...rng, fork: () => controlled, chance: () => true,
    next: () => (offset + weights[kind] / 2) / total, int: () => 40 };
  return controlled;
}

function raceState(catastrophicInjuries: boolean, isPlayer = true): GameState {
  const state = createNewGame({ ...OPTIONS, catastrophicInjuries });
  // 예후불량 판정을 고립한다. 기본 시설은 M4-E1부터 발생 확률·종류 가중치를 보정한다.
  state.farm.facilities = uniformFacilities(0);
  state.date = { ...DATE };
  const h = fixtureHorse();
  if (!isPlayer) state.owners.ai = { ...structuredClone(state.owners[state.playerOwnerId]!), id: 'ai', isPlayer: false };
  h.ownerId = isPlayer ? state.playerOwnerId : 'ai';
  h.trainerId = 'test-trainer';
  state.horses[h.id] = h;
  state.owners[h.ownerId]!.horseIds = [h.id];
  state.seasonState.lastRun[h.id] = { ...DATE };
  state.raceResults = [{ raceId: RACE_ID, racecourseId: 'test-course', date: { ...DATE }, going: 'good',
    distance: 2000, seed: 1, winningTime: 120, sectionalMarks: [], runners: [{
      horseId: h.id, runnerIndex: 0, saddleCloth: 1, draw: 1, jockeyId: 'test-jockey', weightLb: 126,
      position: 1, finishTime: 120, margin: null, beatenLengths: 0, sectionals: [], performanceFigure: 0, odds: null,
    }] }];
  const declaration = { horseId: h.id, ownerId: h.ownerId, trainerId: h.trainerId,
    jockeyId: null, weightLb: null, isPlayer };
  state.seasonState.meetings = [{ id: 'test-future', date: { year: DATE.year, week: DATE.week + 1 },
    racecourseId: 'test-course', going: null,
    races: ['open', 'run'].map((status) => ({ race: { ...BOOT_DATA.templates[0]!, id: `test-${status}` },
      templateId: null, status: status as 'open' | 'run', declarations: [{ ...declaration }], simulated: false })),
  }];
  return state;
}

describe('M4-E0 새 게임 설정', () => {
  it('난이도 생략 시 전체 초기 상태가 구현 전과 바이트 단위로 같다', () => {
    const state = bootstrapGame(OPTIONS, BOOT_DATA);
    expect(createHash('sha256').update(JSON.stringify(state)).digest('hex')).toBe(LEGACY_HASH);
    expect(state.settings).toEqual(DEFAULT_GAME_SETTINGS);
    expect(state.owners[state.playerOwnerId]!.funds).toBe(STARTING_FUNDS);
    expect(ownedHorses(state, 'broodmare')).toHaveLength(3);
    expect(ownedHorses(state, 'in_training').map((h) => DATE.year - h.birthYear)).toEqual([2, 2, 3]);
    expect(state.farm).toEqual({ owned: true, country: 'GB', size: 'medium', name: null,
      facilities: uniformFacilities(1), acquiredYear: DATE.year });
  }, 120_000);

  for (const row of PACKAGES) {
    for (const startType of ['owner', 'owner_breeder'] as const) {
      it.each(HOME_COUNTRIES)(`${row.difficulty} / ${startType} / %s: 자금·두수·나이·목장·소재국`, (homeCountry) => {
        const state = bootstrapGame({ ...OPTIONS, difficulty: row.difficulty, startType,
          homeCountry, studName: 'Silver Fern Stud' }, BOOT_DATA);
        const owner = state.owners[state.playerOwnerId]!;
        expect(state.settings).toEqual({ startType, difficulty: row.difficulty, catastrophicInjuries: true });
        expect(owner).toMatchObject({ funds: row.funds, country: homeCountry,
          studName: startType === 'owner' ? null : 'Silver Fern Stud' });
        const mares = ownedHorses(state, 'broodmare');
        expect(mares).toHaveLength(startType === 'owner' ? 0 : row.mares);
        expect(mares.every((h) => h.countryOfBirth === homeCountry)).toBe(true);
        const racers = ownedHorses(state, 'in_training');
        const count = startType === 'owner' ? row.owner : row.breeder;
        expect(racers.map((h) => DATE.year - h.birthYear)).toEqual([3, 2, 2].slice(0, count));
        for (const h of racers) {
          expect(h.countryOfBirth).toBe(homeCountry);
          expect(state.trainers[h.trainerId!]!.country).toBe(homeCountry);
          const dam = state.horses[h.damId!]!;
          expect(dam).toMatchObject({ status: 'historical', ownerId: null, countryOfBirth: homeCountry });
          expect(h.familyId).toBe(dam.id);
          expect(dam.sireId).not.toBeNull();
        }
        expect(state.farm).toEqual(startType === 'owner' ? emptyFarm() : {
          owned: true, country: homeCountry, size: row.size, name: 'Silver Fern Stud',
          facilities: uniformFacilities(row.level), acquiredYear: DATE.year,
        });
      }, 120_000);
    }
  }

  it.each(['easy', 'normal', 'hard'] as Difficulty[])('오너브리더 %s: 지급 현역마를 거절할 수 있다', (difficulty) => {
    const state = bootstrapGame({ ...OPTIONS, difficulty, grantRacehorses: false }, BOOT_DATA);
    expect(ownedHorses(state, 'in_training')).toHaveLength(0);
    expect(ownedHorses(state, 'broodmare')).toHaveLength(PACKAGES.find((p) => p.difficulty === difficulty)!.mares);
  }, 120_000);

  it('마주는 grantRacehorses false 와 무관하게 현역마를 지급받고 목장 이름 기본값은 null 이다', () => {
    const state = bootstrapGame({ ...OPTIONS, difficulty: 'easy', startType: 'owner', grantRacehorses: false }, BOOT_DATA);
    expect(ownedHorses(state, 'in_training')).toHaveLength(3);
    expect(createNewGame({ ...OPTIONS, difficulty: 'normal' }).farm.name).toBeNull();
  }, 120_000);

  it('시드 1~20: IE 소재 기초 암말의 IE 계류 부 비율이 GB 소재보다 높다', () => {
    const counts: Record<HomeCountry, number> = { GB: 0, IE: 0, FR: 0, DE: 0, IT: 0 };
    const sires = new Map(BOOT_DATA.stallionRecords.map((s) => [s.key, s]));
    for (const homeCountry of ['GB', 'IE'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const state = bootstrapWorld(createNewGame({ ...OPTIONS, seed, difficulty: 'easy', homeCountry }),
          BOOT_DATA, createRng(seed).fork('world'), 'easy');
        for (const h of ownedHorses(state, 'broodmare')) {
          if (sires.get(h.sireId!)?.standsIn === 'IE') counts[homeCountry]++;
        }
      }
    }
    const measurement = { samplePerCountry: 60, ieSiresInIE: counts.IE, ieSiresInGB: counts.GB,
      rateIE: counts.IE / 60, rateGB: counts.GB / 60 };
    writeFileSync('/tmp/m4-e0-home-sires.json', JSON.stringify(measurement));
    expect(measurement.rateIE - measurement.rateGB).toBeGreaterThan(0.15);
  }, 120_000);

  it('같은 시드·새 설정이면 부트스트랩 전체가 같다', () => {
    const opts = { ...OPTIONS, difficulty: 'normal' as Difficulty, startType: 'owner_breeder' as StartType,
      homeCountry: 'IE' as HomeCountry, catastrophicInjuries: false };
    expect(bootstrapGame(opts, BOOT_DATA)).toEqual(bootstrapGame(opts, BOOT_DATA));
  }, 120_000);
});

describe('M4-E0 출주 중 예후불량', () => {
  const system = createSeasonSystem({ courses: [], templates: [], series: [], nicks: [] });

  it('실제 부상 종류 추첨 10만 회: 골절 중 35~45% 사망, 설정 끔은 0%, 공용 난수 상태 동일', () => {
    const base = fixtureHorse();
    const onRng = injuryCertainRng(20261016);
    const offRng = injuryCertainRng(20261016);
    let fractures = 0;
    let deaths = 0;
    let offDeaths = 0;
    let injuriesDiffer = false;
    for (let i = 0; i < 100_000; i++) {
      const on = { ...base, id: `sample-${i}`, condition: { ...base.condition } };
      const off = { ...base, id: on.id, condition: { ...base.condition } };
      const ctx = { date: DATE, initialSeed: OPTIONS.seed, isPlayer: true, raceId: RACE_ID };
      const a = weeklyConditionInPlace(on, undefined, 3, true, onRng, { ...ctx, catastrophicInjuries: true });
      const b = weeklyConditionInPlace(off, undefined, 3, true, offRng, { ...ctx, catastrophicInjuries: false });
      if (a?.kind !== b?.kind || a?.weeksOut !== b?.weeksOut) injuriesDiffer = true;
      if (a?.kind === 'fracture') fractures++;
      if (on.status === 'dead') deaths++;
      if (off.status === 'dead') offDeaths++;
    }
    const rate = deaths / fractures;
    writeFileSync('/tmp/m4-e0-catastrophic.json', JSON.stringify({ injuries: 100_000, fractures, deaths, offDeaths, rate }));
    expect(fractures).toBeGreaterThan(700);
    expect(rate).toBeGreaterThanOrEqual(0.35);
    expect(rate).toBeLessThanOrEqual(0.45);
    expect(offDeaths).toBe(0);
    expect(injuriesDiffer).toBe(false);
    expect(onRng.getState()).toEqual(offRng.getState());
  }, 120_000);

  it('플레이어·AI 모두 즉사·소유/열린 신청 제거, 플레이어 이벤트 한 건, 동일 시드 재현', () => {
    let fatalSeeds = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const isPlayer of [true, false]) {
        const state = raceState(true, isPlayer);
        state.initialSeed = seed;
        const repeat = structuredClone(state);
        const events = system.run(state, { date: DATE, rng: fractureRng(true) });
        expect(system.run(repeat, { date: DATE, rng: fractureRng(true) })).toEqual(events);
        expect(repeat).toEqual(state);
        const h = state.horses['settings-horse']!;
        const shouldDie = createRng(`${seed}:catastrophic:${h.id}:${RACE_ID}`).chance(0.4);
        expect(h.status).toBe(shouldDie ? 'dead' : 'in_training');
        if (shouldDie) {
          fatalSeeds++;
          expect(h).toMatchObject({ diedYear: DATE.year, trainerId: null });
          expect(state.owners[h.ownerId!]!.horseIds).not.toContain(h.id);
          expect(state.seasonState.meetings[0]!.races[0]!.declarations).toHaveLength(0);
          expect(state.seasonState.meetings[0]!.races[1]!.declarations).toHaveLength(1);
          expect(events).toEqual(isPlayer ? [{ type: 'horse_fatally_injured', horseId: h.id, raceId: RACE_ID, date: DATE }] : []);
          const laterEvents: GameEvent[] = system.run(state, { date: { ...DATE, week: DATE.week + 2 }, rng: createRng(2) });
          expect(laterEvents.some((e) => e.type === 'horse_fatally_injured')).toBe(false);
        } else {
          expect(state.owners[h.ownerId!]!.horseIds).toContain(h.id);
          expect(events.filter((e) => e.type === 'horse_injured')).toHaveLength(isPlayer ? 1 : 0);
        }
      }
    }
    expect(fatalSeeds).toBeGreaterThan(0);
  });

  it('설정 끔·조교 중 골절·경미 골절·기존 골절은 즉사하지 않는다', () => {
    for (const scenario of ['off', 'training', 'stress_fracture', 'existing'] as const) {
      const state = raceState(scenario !== 'off');
      const h = state.horses['settings-horse']!;
      if (scenario === 'training') { state.seasonState.lastRun = {}; state.raceResults = []; }
      if (scenario === 'existing') h.condition.injury = { kind: 'fracture', weeksOut: 40, since: DATE };
      const events = system.run(state, { date: DATE,
        rng: fractureRng(scenario !== 'training', scenario === 'stress_fracture' ? 'stress_fracture' : 'fracture') });
      expect(h.status).toBe('in_training');
      expect(h.condition.injury).not.toBeNull();
      expect(state.owners[h.ownerId!]!.horseIds).toContain(h.id);
      expect(events.some((e) => e.type === 'horse_fatally_injured')).toBe(false);
    }
  });
});
