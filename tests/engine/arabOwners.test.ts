import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOREIGN_OWNER_SHARE,
  OWNER_TIER_WEIGHTS_BY_COUNTRY,
  PEOPLE_COUNTRY_ORDER,
  PEOPLE_PER_COUNTRY,
} from '../../src/engine/config/people';
import { POPULATION_COUNTRY_ORDER } from '../../src/engine/config/population';
import {
  getHorseWords,
  getPeopleData,
  getStallionRecords,
  getStallionNames,
  getNicks,
} from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapPeople } from '../../src/engine/state/people';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { bootstrapRacingPopulation, type RacingPopulationStaticData } from '../../src/engine/world/population';
import { normalizeFullName } from '../../src/engine/people/names';
import type { GameState, Horse, Owner } from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
/** 앞 6개 나라(GB·IE·FR·DE·IT·US) 인물의 해시. AE 추가 전(HEAD) 같은 시드 결과로 고정했다. */
const SIX_COUNTRY_PEOPLE_HASH = 'b3cd98bcfd22eaceb188b12543a3b05046e0120ba23207f327334721ea44947c';
const SIX_COUNTRY_OWNER_COUNT = 274;

/** 현역마 집단 비율 범위(명세 수용 기준 3) */
const AE_SHARE_RANGE: Readonly<Record<string, { min: number; max: number }>> = {
  GB: { min: 0.08, max: 0.16 },
  IE: { min: 0.04, max: 0.12 },
  FR: { min: 0.06, max: 0.14 },
};

function baseState(): GameState {
  return createNewGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } });
}

function peopleState(seed = SEED): GameState {
  return bootstrapPeople(baseState(), getPeopleData(), createRng(seed));
}

function worldData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    words: getHorseWords(),
  };
}

function populationData(): RacingPopulationStaticData {
  return { stallionRecords: getStallionRecords(), words: getHorseWords() };
}

/** 인물 → 세계 → 현역마 순서의 새 게임 상태 */
function bootedState(seed = SEED): GameState {
  const withPeople = peopleState(seed);
  const withWorld = bootstrapWorld(withPeople, worldData(), createRng(seed + 1));
  return bootstrapRacingPopulation(withWorld, populationData(), createRng(seed + 2));
}

function aiOwners(state: GameState): Owner[] {
  return Object.values(state.owners).filter((o) => !o.isPlayer);
}

function racingHorses(state: GameState): Horse[] {
  return Object.values(state.horses).filter(
    (h) => h.status === 'in_training' && h.ownerId !== null && h.ownerId !== state.playerOwnerId,
  );
}

let cachedBooted: GameState | null = null;
function booted(): GameState {
  if (cachedBooted === null) cachedBooted = bootedState();
  return cachedBooted;
}

describe('AE 마주 인물 생성 (bootstrapPeople)', () => {
  it('AE 마주 30명, AE 기수·조교사 0명이다', () => {
    const state = peopleState();
    const ae = aiOwners(state).filter((o) => o.country === 'AE');
    expect(ae).toHaveLength(PEOPLE_PER_COUNTRY.AE.owners);
    expect(ae).toHaveLength(30);
    expect(Object.values(state.jockeys).filter((j) => j.country === 'AE')).toHaveLength(0);
    expect(Object.values(state.trainers).filter((t) => t.country === 'AE')).toHaveLength(0);
  });

  it('AE 는 PEOPLE_COUNTRY_ORDER 의 맨 끝이다', () => {
    expect(PEOPLE_COUNTRY_ORDER[PEOPLE_COUNTRY_ORDER.length - 1]).toBe('AE');
  });

  it('AE 마주 이름은 AE 인명 풀(이름+성)에서 나오고 차단 목록에 없으며 중복이 없다', () => {
    const data = getPeopleData();
    const pool = data.pools.AE;
    const blocked = new Set(data.blockedNames.map(normalizeFullName));
    const fullNames = new Set<string>();
    for (const given of [...pool.givenMale, ...pool.givenFemale]) {
      for (const surname of pool.surnames) fullNames.add(`${given} ${surname}`);
    }
    const names = aiOwners(peopleState())
      .filter((o) => o.country === 'AE')
      .map((o) => o.name);
    for (const name of names) {
      expect(fullNames.has(name), `AE 풀 밖 이름 ${name}`).toBe(true);
      expect(blocked.has(normalizeFullName(name)), `차단 이름 ${name}`).toBe(false);
    }
    expect(new Set(names.map(normalizeFullName)).size).toBe(names.length);
  });

  it('앞 6개 나라 인물은 AE 추가 전과 같다(같은 시드 해시 비교)', () => {
    const state = peopleState();
    const sortedById = (rec: Record<string, unknown>): unknown[] =>
      Object.keys(rec)
        .sort()
        .map((k) => rec[k]);
    const sixOwners = sortedById(state.owners).filter(
      (o) => (o as Owner).isPlayer === false && (o as Owner).country !== 'AE',
    );
    expect(sixOwners).toHaveLength(SIX_COUNTRY_OWNER_COUNT);
    const payload = JSON.stringify({
      j: sortedById(state.jockeys),
      t: sortedById(state.trainers),
      o: sixOwners,
    });
    expect(createHash('sha256').update(payload).digest('hex')).toBe(SIX_COUNTRY_PEOPLE_HASH);
  });

  it('AE 마주 규모 분포가 가중치와 맞는다(30명이라 느슨하게: major ≥ 5)', () => {
    const ae = aiOwners(peopleState()).filter((o) => o.country === 'AE');
    const majors = ae.filter((o) => o.tier === 'major').length;
    expect(majors).toBeGreaterThanOrEqual(5);
    const weights = OWNER_TIER_WEIGHTS_BY_COUNTRY.AE;
    expect(weights).toEqual({ major: 0.3, mid: 0.5, small: 0.2 });
  });

  it('같은 시드면 인물 상태가 깊은 비교로 같다(재현성)', () => {
    expect(peopleState()).toEqual(peopleState());
  });

  it('인물 상태가 저장 왕복을 통과한다', () => {
    const state = peopleState();
    const result = deserializeGame(serializeGame(state, '2026-10-12T00:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(state);
  });
});

describe('AE 마주의 현역마 배정 (bootstrapRacingPopulation)', () => {
  it('GB·IE·FR 현역마 중 AE 소유 비율이 범위 안이고, DE·IT 는 0 이다', () => {
    const state = booted();
    const horses = racingHorses(state);
    for (const country of POPULATION_COUNTRY_ORDER) {
      const own = horses.filter((h) => h.countryOfBirth === country);
      const ae = own.filter((h) => state.owners[h.ownerId as string]?.country === 'AE').length;
      const share = ae / own.length;
      const range = AE_SHARE_RANGE[country];
      if (range) {
        expect(share, `${country} AE 소유 비율 ${share.toFixed(3)}`).toBeGreaterThanOrEqual(range.min);
        expect(share, `${country} AE 소유 비율 ${share.toFixed(3)}`).toBeLessThanOrEqual(range.max);
      } else {
        expect(ae, `${country} AE 소유 두수`).toBe(0);
      }
    }
  });

  it('AE 소유 말은 조교사가 그 말이 뛰는 나라 조교사이고, 마주는 AE·조교사는 AE 가 아니다', () => {
    const state = booted();
    const aeHorses = racingHorses(state).filter(
      (h) => state.owners[h.ownerId as string]?.country === 'AE',
    );
    expect(aeHorses.length).toBeGreaterThan(0);
    for (const h of aeHorses) {
      const trainer = state.trainers[h.trainerId as string];
      expect(trainer, `조교사 없음 ${h.id}`).toBeDefined();
      expect(trainer?.country).toBe(h.countryOfBirth);
      expect(trainer?.country).not.toBe('AE');
      const foreignByHome: Partial<Record<string, { country: string }>> = FOREIGN_OWNER_SHARE;
      expect(foreignByHome[h.countryOfBirth]?.country).toBe('AE');
    }
  });

  it('AE 마주 소유 목록(horseIds)과 말의 ownerId 가 일치한다', () => {
    const state = booted();
    for (const owner of aiOwners(state).filter((o) => o.country === 'AE')) {
      for (const id of owner.horseIds) {
        expect(state.horses[id]?.ownerId).toBe(owner.id);
      }
    }
  });

  it('같은 시드면 현역마 집단 상태가 같고, 저장 왕복을 통과한다', () => {
    const state = booted();
    expect(bootedState()).toEqual(state);
    const result = deserializeGame(serializeGame(state, '2026-10-12T00:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(state);
  });
});

describe('엔진 순수성(AE 마주 추가 파일)', () => {
  it('config·people·world 파일에 Math.random · Date.now 가 없다', () => {
    const files = [
      'src/engine/config/people.ts',
      'src/engine/people/generate.ts',
      'src/engine/world/population.ts',
    ];
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(text, f).not.toMatch(/Math\.random|Date\.now/);
    }
  });
});
