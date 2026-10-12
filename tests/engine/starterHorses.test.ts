import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import { TWO_YO_FROM_WEEK } from '../../src/engine/config/meetings';
import { STARTER_COUNTRY, STARTER_FITNESS, STARTER_HORSES, STARTER_SIRE_TIER } from '../../src/engine/config/starter';
import { POPULATION_RATING_MIN_AGE } from '../../src/engine/config/population';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { isEligible } from '../../src/engine/season/eligibility';
import { buildWeekMeetings } from '../../src/engine/season/meetings';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { initialOfficialRating } from '../../src/engine/world/rating';
import type { GameState, Horse, RealStallionRecord } from '../../src/engine/types';

const SEED = 20261011;
const OTHER_SEED = 20261012;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const APRIL_FIRST_WEEK = weekOfSlot({ month: 4, weekOfMonth: 1 });
const MID_TIMEOUT = 180_000;

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

function boot(seed: number): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 플레이어 소유 지급 말(in_training, 조교사 있음 등은 테스트에서 확인) */
function starters(state: GameState): Horse[] {
  return Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId && h.status === 'in_training')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function sireOf(state: GameState, horse: Horse): RealStallionRecord | undefined {
  return getStallionRecords().find((r) => r.key === horse.sireId);
}

let BASE: GameState;
let OTHER: GameState;

beforeAll(() => {
  BASE = boot(SEED);
  OTHER = boot(OTHER_SEED);
}, MID_TIMEOUT);

describe('시작 현역마 지급 (grantStarterHorses / bootstrapGame)', () => {
  it('1. bootstrapGame 직후 플레이어 in_training 말은 2세 2두·3세 1두이고, 조교사가 있으며, 플레이어 마주 목록에 있고, 3세마만 OR 이 있다', () => {
    const horses = starters(BASE);
    const expectedAges = STARTER_HORSES.flatMap((g) => Array.from({ length: g.count }, () => g.age)).sort((a, b) => a - b);
    const ages = horses.map((h) => START_YEAR - h.birthYear).sort((a, b) => a - b);
    expect(ages).toEqual(expectedAges);
    expect(horses.filter((h) => START_YEAR - h.birthYear === 2)).toHaveLength(2);
    expect(horses.filter((h) => START_YEAR - h.birthYear === 3)).toHaveLength(1);

    const owner = BASE.owners[BASE.playerOwnerId];
    expect(owner?.isPlayer).toBe(true);
    for (const h of horses) {
      expect(h.trainerId, `${h.id} 조교사`).not.toBeNull();
      expect(BASE.trainers[h.trainerId ?? '']).toBeDefined();
      expect(owner?.horseIds).toContain(h.id);
      expect(h.ownerId).toBe(BASE.playerOwnerId);
      // M4-C0: 지급마의 생산자는 같은 나라 상업 생산자
      expect(BASE.breeders[h.breederId ?? '']?.country, `${h.id} 생산자`).toBe(STARTER_COUNTRY);
      expect(h.countryOfBirth).toBe(STARTER_COUNTRY);
      expect(h.condition.fitness).toBe(STARTER_FITNESS);
      if (START_YEAR - h.birthYear >= POPULATION_RATING_MIN_AGE) {
        expect(h.officialRating).not.toBeNull();
        expect(h.officialRating).toBe(initialOfficialRating(h));
      } else {
        expect(h.officialRating).toBeNull();
      }
    }
  }, MID_TIMEOUT);

  it('2. 같은 시드면 말 이름·능력이 같고, 다른 시드면 이름·능력이 다르다', () => {
    const a = starters(BASE);
    const again = starters(boot(SEED));
    expect(again.map((h) => h.name)).toEqual(a.map((h) => h.name));
    expect(again.map((h) => h.ability)).toEqual(a.map((h) => h.ability));

    const b = starters(OTHER);
    expect(b.map((h) => h.name)).not.toEqual(a.map((h) => h.name));
    expect(b.map((h) => h.ability)).not.toEqual(a.map((h) => h.ability));
  }, MID_TIMEOUT);

  it('3. 지급 말의 부는 marketTier 3 종마다(후보가 있으므로)', () => {
    for (const h of starters(BASE)) {
      const sire = sireOf(BASE, h);
      expect(sire, `${h.id} 부`).toBeDefined();
      expect(sire?.marketTier).toBe(STARTER_SIRE_TIER);
    }
  });

  it('4. 3세마는 4월 1주의 3세 이상 핸디캡·조건 레이스에, 2세마는 2세 경주가 처음 열리는 주(TWO_YO_FROM_WEEK)의 2세 메이든에 출주 가능하다', () => {
    const horses = starters(BASE);
    const twoYo = horses.filter((h) => START_YEAR - h.birthYear === 2);
    const threeYo = horses.filter((h) => START_YEAR - h.birthYear === 3);
    expect(twoYo.length).toBeGreaterThan(0);
    expect(threeYo.length).toBeGreaterThan(0);

    const meetingsAt = (week: number) =>
      buildWeekMeetings({
        date: { year: START_YEAR, week },
        templates: getRaceTemplates(),
        courses: getRacecourses(),
        rng: createRng(SEED).fork('eligibility'),
        nextGeneratedRace: BASE.seasonState.nextGeneratedRace,
      }).meetings;
    const toRaces = (week: number) =>
      meetingsAt(week).flatMap((m) => m.races.map((sr) => ({ race: sr.race, date: m.date })));
    const state = BASE.seasonState;

    const aprilRaces = toRaces(APRIL_FIRST_WEEK);
    console.log(
      `[starter] 4월 1주(${APRIL_FIRST_WEEK}주) 레이스 종류별 개수`,
      JSON.stringify(
        aprilRaces.reduce<Record<string, number>>((acc, r) => {
          const key = `${r.race.kind}/minAge${r.race.conditions.minAge}`;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      ),
    );
    for (const h of threeYo) {
      const ok = aprilRaces.some(
        (r) =>
          r.race.conditions.minAge <= 3 &&
          (r.race.kind === 'handicap' || r.race.kind === 'conditions') &&
          isEligible(h, r.race, r.date, state),
      );
      expect(ok, `${h.id} 4월 1주 3세 출주 가능 레이스`).toBe(true);
    }

    const twoYoRaces = toRaces(TWO_YO_FROM_WEEK);
    console.log(
      `[starter] 2세 경주 첫 주(${TWO_YO_FROM_WEEK}주) 2세 레이스 개수`,
      JSON.stringify(twoYoRaces.filter((r) => r.race.conditions.minAge === 2).map((r) => r.race.kind)),
    );
    for (const h of twoYo) {
      const ok = twoYoRaces.some(
        (r) => r.race.kind === 'maiden' && r.race.conditions.minAge === 2 && isEligible(h, r.race, r.date, state),
      );
      expect(ok, `${h.id} 2세 주 2세 메이든 출주 가능`).toBe(true);
    }
  }, MID_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('시작 말 설정·지급 파일에 Math.random · Date.now 가 없다', () => {
    const files = ['src/engine/config/starter.ts', 'src/engine/world/population.ts', 'src/engine/state/bootstrap.ts'];
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(text, f).not.toMatch(/Math\.random|Date\.now/);
    }
  });
});
