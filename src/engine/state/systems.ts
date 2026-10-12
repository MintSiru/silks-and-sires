import { createBreedingSystem, type BreedingStaticData } from '../breeding/season';
import { createCostsSystem } from '../economy/costs';
import { createRelationsSystem } from '../economy/relations';
import { createSolvencySystem } from '../economy/solvency';
import { growthSystem } from '../horse/growth';
import { createSeasonSystem, type SeasonStaticData } from '../season/system';
import { calendarSystem } from '../time/advance';
import type { WeeklySystem } from '../types';
import type { RacingPopulationStaticData } from '../world/population';
import { createPopulationSystem } from '../world/populationSystem';

/** 게임 주 시스템 전체가 쓰는 정적 데이터 */
export type GameStaticData = BreedingStaticData & SeasonStaticData & RacingPopulationStaticData;

/**
 * 게임 주 시스템 목록. 실행 순서: 달력 → 성장 → 교배 → 연간 교체(population) → 시즌(season) → 정기 비용(costs) → 자금 판정(solvency) → 관계·명성(relations).
 * 시스템 객체는 내부 상태가 없으므로 매번 새 배열을 만들어도 결과는 같다.
 */
export function createGameSystems(data: GameStaticData): WeeklySystem[] {
  return [
    calendarSystem,
    growthSystem,
    createBreedingSystem(data),
    createPopulationSystem(data),
    createSeasonSystem(data),
    createCostsSystem(),
    createSolvencySystem(),
    createRelationsSystem(),
  ];
}
