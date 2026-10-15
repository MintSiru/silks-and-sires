import { START_YEAR } from '../config/game';
import type { PeopleStaticData } from '../people/generate';
import { createRng } from '../rng';
import { buildWeekMeetings } from '../season/meetings';
import { declareUpcomingMeetings, type SeasonStaticData } from '../season/system';
import { nextDate } from '../time/calendar';
import type { GameState } from '../types';
import { generateBreeders } from '../people/breeders';
import { bootstrapRacingPopulation, grantStarterHorses, type RacingPopulationStaticData } from '../world/population';
import { bootstrapPeople } from './people';
import { createNewGame, type NewGameOptions } from './newGame';
import { bootstrapWorld, type WorldStaticData } from './world';

/** 새 게임 옵션(createNewGame 과 같다) */
export type BootstrapOptions = NewGameOptions;

/** 새 게임 초기화에 필요한 정적 데이터 전체 */
export type BootstrapData = WorldStaticData & RacingPopulationStaticData & PeopleStaticData & SeasonStaticData;

/**
 * 새 게임을 인물·세계·현역마까지 한 번에 만든다. 같은 시드·같은 데이터면 결과가 같다.
 * 순서: createNewGame → bootstrapWorld(fork 'world') → bootstrapPeople(fork 'people')
 *      → generateBreeders(fork 'breeders') → bootstrapRacingPopulation(fork 'population')
 *      → grantStarterHorses(fork 'starter') → lastPopulationYear 채움 → 다음 주 개최 생성.
 * 다음 주 개최는 seasonState.meetings 에 넣어 두어 첫 주 진행 전에 플레이어가 출주를 접수할 수 있게 한다.
 */
export function bootstrapGame(opts: BootstrapOptions, data: BootstrapData): GameState {
  const seed = opts.seed;
  const base = createNewGame(opts);
  const world = bootstrapWorld(base, data, createRng(seed).fork('world'));
  const people = bootstrapPeople(world, data, createRng(seed).fork('people'));
  const withBreeders = generateBreeders(people, data, createRng(seed).fork('breeders'));
  const population = bootstrapRacingPopulation(withBreeders, data, createRng(seed).fork('population'));
  grantStarterHorses(population, data, createRng(seed).fork('starter'));

  population.seasonState.lastPopulationYear = START_YEAR;

  const built = buildWeekMeetings({
    date: nextDate(population.date),
    templates: data.templates,
    courses: data.courses,
    rng: createRng(seed).fork('season').fork('meetings'),
    nextGeneratedRace: population.seasonState.nextGeneratedRace,
  });
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  population.seasonState.meetings = declareUpcomingMeetings(
    population, built.meetings, createRng(seed).fork('season').fork('declare-first'),
    (id) => courseById.get(id)?.country,
  );
  population.seasonState.nextGeneratedRace = built.nextGeneratedRace;
  return population;
}
