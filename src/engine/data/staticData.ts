import racecoursesJson from '../../../data/racecourses.json';
import racesJson from '../../../data/races.json';
import namesJson from '../../../data/names.json';
import { getRacecourse as findRacecourse, loadRacecourses } from '../course/load';
import type { NamePool } from '../race/sampleField';
import type { Race, Racecourse } from '../types';

/** 경마장 목록은 모듈 안에서 처음 요청될 때 한 번만 검증·캐시한다. */
let cachedRacecourses: Racecourse[] | null = null;

/** 레이스 정의(data/races.json). 모듈 로드 시 한 번 타입을 붙인다. */
const RACES: Race[] = racesJson as Race[];

/** 이름 풀(data/names.json). */
const NAME_POOL: NamePool = namesJson as NamePool;

/** 경마장 전체 목록 (data/racecourses.json, 검증 후 캐시). */
export function getRacecourses(): Racecourse[] {
  if (cachedRacecourses === null) {
    cachedRacecourses = loadRacecourses(racecoursesJson);
  }
  return cachedRacecourses;
}

/** id 로 경마장 하나를 찾는다. 없으면 Error. */
export function getRacecourse(id: string): Racecourse {
  return findRacecourse(getRacecourses(), id);
}

/** 레이스 전체 목록 (data/races.json). */
export function getRaces(): Race[] {
  return RACES;
}

/** id 로 레이스 하나를 찾는다. 없으면 Error. */
export function getRace(id: string): Race {
  const found = RACES.find((r) => r.id === id);
  if (found === undefined) {
    throw new Error(`레이스를 찾을 수 없음: ${id}`);
  }
  return found;
}

/** 가상 이름 풀 (data/names.json). */
export function getNamePool(): NamePool {
  return NAME_POOL;
}
