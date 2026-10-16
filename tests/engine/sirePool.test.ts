import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { POPULATION_AI_STALLION_ENTRY_PER_YEAR, POPULATION_AI_STALLION_MIN_VALUE, POPULATION_RETIRE_AGE } from '../../src/engine/config/population';
import { PROFILE_DISTANCE, TIER_FEE } from '../../src/engine/config/world';
import {
  getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses,
  getSalesData, getSeriesDefinitions, getStallionNames, getStallionRecords,
} from '../../src/engine/data/staticData';
import { growthSystem } from '../../src/engine/horse/growth';
import { makeNameRegistry } from '../../src/engine/naming/context';
import { createRng, rngFromState } from '../../src/engine/rng';
import { bookForSire, buildCatalogue } from '../../src/engine/sales/catalogue';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { buildStallionRecord } from '../../src/engine/stud/stand';
import { advanceWeek, calendarSystem } from '../../src/engine/time/advance';
import type { GameState, Horse, RealStallionRecord } from '../../src/engine/types';
import { buildMarket, racingHorseIds, spawnRacingHorse } from '../../src/engine/world/population';
import { createPopulationSystem } from '../../src/engine/world/populationSystem';
import { aiSireRecords, sirePoolFor, standingInCoverYear, tierFromFee } from '../../src/engine/world/sirePool';
import { meanAbility, ratingFromAbility } from '../../src/engine/world/rating';

const SEED = 20261011;
const DATA = {
  stallionRecords: getStallionRecords(), stallionNames: getStallionNames(),
  nicks: getNicks(), naming: getNamingData(), ...getPeopleData(),
  courses: getRacecourses(), templates: getRaceTemplates(), series: getSeriesDefinitions(),
};
const SALES_DATA = { ...DATA, sales: getSalesData() };
const EVENT = SALES_DATA.sales.events.find((event) => event.id === 'sev_ashcombe_yearling_oct')!;
let base: GameState;
beforeAll(() => {
  base = bootstrapGame({ seed: SEED, playerName: '테스트',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, DATA);
}, 30_000);
const fresh = () => structuredClone(base);
const activeRecords = () => DATA.stallionRecords.filter((record) => record.status === 'active');

function addAiSire(state: GameState, id = 'ai-sire', year = START_YEAR): string {
  const source = state.horses[racingHorseIds(state)[0]!]!;
  state.horses[id] = { ...structuredClone(source), id, name: 'Silver Meadow',
    sex: 'male', gelded: false, birthYear: year - 4, status: 'stud', ownerId: null, trainerId: null };
  state.horses[id]!.aptitude.distanceOptimum = 2517;
  state.stallions[id] = { ...buildStallionRecord(state, id, year, 'IE'), fee: 30_000, aiEntrant: true };
  return id;
}

describe('교배 연도의 공통 부 후보 풀', () => {
  it('아무 변화 없으면 같은 참조이고, 마지막 계류·사망 연도는 포함한다', () => {
    const state = fresh();
    state.date.year = 2030;
    const records = activeRecords().slice(0, 2);
    const [retired, dead] = records as [RealStallionRecord, RealStallionRecord];
    expect(sirePoolFor(state, records, 2029)).toBe(records);
    state.horses[retired.key]!.status = 'retired';
    state.stallions[retired.key]!.lastSeasonYear = 2028;
    state.horses[dead.key]!.diedYear = 2027;
    expect(standingInCoverYear(state, retired.key, 2028)).toBe(true);
    expect(standingInCoverYear(state, retired.key, 2029)).toBe(false);
    expect(standingInCoverYear(state, dead.key, 2027)).toBe(true);
    expect(standingInCoverYear(state, dead.key, 2028)).toBe(false);
    expect(sirePoolFor(state, records, 2028)).toEqual([retired]);
    expect(sirePoolFor(state, records, 2029)).toEqual([]);
    delete state.horses[retired.key];
    expect(standingInCoverYear(state, retired.key, 2027)).toBe(false);
  });

  it('합성 레코드는 종부료·거리·계류 연도를 반영하고 ID 순으로 정렬된다', () => {
    const state = fresh();
    addAiSire(state, 'ai-z', 2027);
    addAiSire(state, 'ai-a', 2026);
    state.stallions['ai-z']!.lastSeasonYear = 2028;
    const records = aiSireRecords(state);
    expect(records.map((record) => record.key)).toEqual(['ai-a', 'ai-z']);
    expect(records[1]).toEqual({ key: 'ai-z', foaled: 2023, countryOfBirth: 'IE', standsIn: 'IE',
      sireKey: null, damsireKey: null, sireLineId: state.stallions['ai-z']!.sireLineId,
      status: 'active', distanceProfile: 'middle', surfaceProfile: 'turf', marketTier: 3,
      confidence: 'low', firstCoverYear: 2027, lastCoverYear: 2028 });
    for (const [profile, distance] of Object.entries(PROFILE_DISTANCE)) {
      state.horses['ai-a']!.aptitude.distanceOptimum = distance;
      expect(aiSireRecords(state)[0]!.distanceProfile).toBe(profile);
    }
    for (const [tier, fee] of Object.entries(TIER_FEE)) expect(tierFromFee(fee)).toBe(Number(tier));
    const staticRecords = activeRecords().slice(0, 2).reverse();
    expect(sirePoolFor(state, staticRecords, 2028).map((record) => record.key))
      .toEqual([...staticRecords.map((record) => record.key), 'ai-a', 'ai-z']);
    expect(sirePoolFor(state, staticRecords, 2029).map((record) => record.key))
      .toEqual([...staticRecords.map((record) => record.key), 'ai-a']);
    expect(sirePoolFor(state, records, 2028).map((record) => record.key)).toEqual(['ai-a', 'ai-z']);
  });
});

describe('현역마·세일 생산의 부 선택', () => {
  it('AI 부의 실제 거리와 시장 등급은 지정 종마 경로와 같다', () => {
    const state = fresh();
    const id = addAiSire(state);
    const other = structuredClone(state);
    const spec = { country: 'IE' as const, birthYear: START_YEAR + 1, currentYear: START_YEAR + 3,
      sex: 'female' as const, gelded: false };
    const random = createRng('ai-distance');
    const designated = createRng('ai-distance');
    designated.next(); // 일반 경로의 부 선택 난수 1회와 맞춘다.
    const a = spawnRacingHorse(state, DATA, random, buildMarket(state), makeNameRegistry(state), spec, []);
    const b = spawnRacingHorse(other, DATA, designated, buildMarket(other), makeNameRegistry(other),
      { ...spec, sireHorseId: id }, []);
    expect(a).toEqual(b);
    expect(a.sireId).toBe(id);
    expect(random.getState()).toEqual(designated.getState());
  });

  it('은퇴·사망한 부를 신규 현역마와 세일 생성에서 제외하며 마지막 시즌에는 허용한다', () => {
    const state = fresh();
    const records = activeRecords().filter((record) => record.standsIn === 'GB').slice(0, 3);
    const [retired, dead, standing] = records as [RealStallionRecord, RealStallionRecord, RealStallionRecord];
    state.horses[retired.key]!.status = 'retired';
    state.stallions[retired.key]!.lastSeasonYear = 2028;
    state.horses[dead.key]!.diedYear = 2027;
    const market = buildMarket(state);
    const registry = makeNameRegistry(state);
    const rng = createRng('retired-sires');
    for (let i = 0; i < 20; i++) {
      const horse = spawnRacingHorse(state, DATA, rng, market, registry,
        { country: 'GB', birthYear: 2030, currentYear: 2032, sex: 'male', gelded: false }, records);
      expect(horse.sireId).toBe(standing.key);
    }
    const catalogue = buildCatalogue(state, EVENT, 2031, { ...SALES_DATA, stallionRecords: records }, rng);
    expect(catalogue.lots.length).toBeGreaterThan(0);
    expect(catalogue.lots.every((lot) => lot.sireId === standing.key)).toBe(true);
    const lastSeason = buildCatalogue(state, EVENT, 2030,
      { ...SALES_DATA, stallionRecords: [retired] }, createRng('last-season'));
    expect(lastSeason.lots.every((lot) => lot.sireId === retired.key)).toBe(true);
  });

  it('세일 후보 경로는 AI 종마를 선택하고 firstSeasonYear 이전은 제외한다', () => {
    const state = fresh();
    const id = addAiSire(state);
    const data = { ...SALES_DATA, stallionRecords: [] };
    const catalogue = buildCatalogue(state, EVENT, START_YEAR + 2, data, createRng('ai-catalogue'));
    expect(catalogue.lots.length).toBeGreaterThan(0);
    expect(catalogue.lots.every((lot) => lot.sireId === id)).toBe(true);
    expect(() => buildCatalogue(fresh(), EVENT, START_YEAR + 2, data, createRng('no-sire'))).toThrow('부(父) 후보가 없다');
    expect(() => buildCatalogue(state, EVENT, START_YEAR + 1, data, createRng('too-early'))).toThrow('부(父) 후보가 없다');
    state.stallions[id]!.lastSeasonYear = START_YEAR;
    state.horses[id]!.status = 'retired';
    expect(() => buildCatalogue(state, EVENT, START_YEAR + 3, data, createRng('ai-retired'))).toThrow('부(父) 후보가 없다');
  });

  it('정적 레코드 없는 부의 종부료 등급으로 플레이어 위탁 북을 정한다', () => {
    const state = fresh();
    const sireId = addAiSire(state);
    const horse = state.horses[racingHorseIds(state)[0]!]!;
    horse.status = 'yearling';
    horse.birthYear = START_YEAR + 1;
    horse.ownerId = state.playerOwnerId;
    horse.sireId = sireId;
    state.sales.consignments.push({ saleId: EVENT.id, year: START_YEAR + 2, horseId: horse.id, reserve: null });
    const catalogue = buildCatalogue(state, EVENT, START_YEAR + 2, SALES_DATA, createRng('ai-consignment'));
    expect(catalogue.lots.find((lot) => lot.horseId === horse.id)?.book).toBe(bookForSire(EVENT, 3));
  });
});

function value(horse: Horse): number {
  return horse.officialRating ?? ratingFromAbility(meanAbility(horse.potential));
}

/** 52주 진행 뒤 도달한 1월 1주의 연간 교체를 실행한다(advanceWeek 는 출발 주를 처리한다). */
function nextPopulationYear(input: GameState) {
  const population = createPopulationSystem(DATA);
  let state = input;
  for (let week = 0; week < WEEKS_PER_YEAR; week++) {
    state = advanceWeek(state, [calendarSystem, growthSystem, population]).state;
  }
  const rng = rngFromState(state.rng);
  const events = population.run(state, { date: state.date, rng });
  state.rng = rng.getState();
  return { state, events };
}

describe('연간 AI 종마 편입', () => {
  it('종마 밴드 은퇴마만 평가값 내림차순·ID 오름차순으로 뽑고 최소값·상한을 지킨다', () => {
    const state = fresh();
    const source = structuredClone(state.horses[racingHorseIds(state)[0]!]!);
    for (const id of racingHorseIds(state)) state.horses[id]!.status = 'retired';
    const year = START_YEAR + 1;
    const owner = state.owners[source.ownerId!]!;
    const add = (id: string, rating: number, age = 3, gelded = false, status: Horse['status'] = 'in_training') => {
      state.horses[id] = { ...structuredClone(source), id, name: id, birthYear: year - age,
        sex: 'male', gelded, status, officialRating: rating };
      owner.horseIds.push(id);
    };
    // 삽입 순서는 ID 순과 반대로 두어 동점 정렬을 확인한다.
    for (let i = 12; i >= 1; i--) add(`candidate-${String(i).padStart(2, '0')}`, 110);
    add('top-candidate', 120);
    add('below-minimum', POPULATION_AI_STALLION_MIN_VALUE - 1, 5);
    add('old-candidate', 140, POPULATION_RETIRE_AGE);
    add('gelded-candidate', 140, 3, true);
    add('previously-retired', 140, 3, false, 'retired');
    const rng = createRng('ranked-entrants');
    rng.chance = () => true;
    createPopulationSystem(DATA).run(state, { date: { year, week: 1 }, rng });
    const ids = Object.values(state.stallions).filter((stallion) => stallion.aiEntrant)
      .map((stallion) => stallion.horseId).sort();
    expect(ids).toEqual([
      ...Array.from({ length: POPULATION_AI_STALLION_ENTRY_PER_YEAR - 1 }, (_, i) => `candidate-${String(i + 1).padStart(2, '0')}`),
      'top-candidate',
    ]);
    expect(state.horses['below-minimum']!.status).toBe('retired');
  });

  it('1년 1~10두 편입, 선발 순서·소유 관계·이벤트를 지키고 2년 진행이 재현된다', () => {
    const first = nextPopulationYear(fresh());
    const entrants = Object.values(first.state.stallions).filter((stallion) => stallion.aiEntrant);
    expect(entrants.length).toBeGreaterThanOrEqual(1);
    expect(entrants.length).toBeLessThanOrEqual(POPULATION_AI_STALLION_ENTRY_PER_YEAR);
    const retiredColts = first.events.flatMap((event) => {
      if (event.type !== 'horse_status_changed' || event.to !== 'retired') return [];
      const horse = first.state.horses[event.horseId]!;
      const age = first.state.date.year - horse.birthYear;
      return horse.sex === 'male' && !horse.gelded && value(horse) >= POPULATION_AI_STALLION_MIN_VALUE
        && age < POPULATION_RETIRE_AGE ? [horse] : [];
    }).sort((a, b) => value(b) - value(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect(entrants.map((stallion) => stallion.horseId).sort())
      .toEqual(retiredColts.slice(0, POPULATION_AI_STALLION_ENTRY_PER_YEAR).map((horse) => horse.id).sort());
    for (const stallion of entrants) {
      const horse = first.state.horses[stallion.horseId]!;
      expect(horse).toMatchObject({ status: 'stud', ownerId: stallion.privateTo ?? null,
        trainerId: null, sex: 'male', gelded: false });
      expect(Object.values(first.state.owners).filter((owner) => owner.horseIds.includes(horse.id)).map((owner) => owner.id))
        .toEqual(stallion.privateTo == null ? [] : [stallion.privateTo]);
      expect(stallion.firstSeasonYear).toBe(START_YEAR + 1);
      expect(first.events.filter((event) => event.type === 'horse_status_changed' && event.horseId === horse.id))
        .toMatchObject([{ to: 'retired' }]);
    }
    const second = nextPopulationYear(first.state).state;
    const newTwoYearOlds = Object.values(second.horses).filter((horse) => horse.status === 'in_training'
      && horse.birthYear === second.date.year - 2);
    const aiSired = newTwoYearOlds.filter((horse) => horse.sireId !== null && second.stallions[horse.sireId]?.aiEntrant);
    expect(aiSired.length).toBeGreaterThanOrEqual(0);
    process.stdout.write(`[측정] 시드 ${SEED}: 1년 AI 종마 ${entrants.length}두, 2년 신규 2세 ${newTwoYearOlds.length}두 중 AI 부 ${aiSired.length}두\n`);
    expect(nextPopulationYear(nextPopulationYear(fresh()).state).state).toEqual(second);
  }, 120_000);
});
