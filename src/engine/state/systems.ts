import { createBreedingSystem, type BreedingStaticData } from '../breeding/season';
import { growthSystem } from '../horse/growth';
import { calendarSystem } from '../time/advance';
import type { WeeklySystem } from '../types';

/**
 * 게임 주 시스템 목록. 실행 순서: 달력(calendar) → 성장(growth) → 교배(breeding).
 * 시스템 객체는 내부 상태가 없으므로 매번 새 배열을 만들어도 결과는 같다.
 */
export function createGameSystems(data: BreedingStaticData): WeeklySystem[] {
  return [calendarSystem, growthSystem, createBreedingSystem(data)];
}
