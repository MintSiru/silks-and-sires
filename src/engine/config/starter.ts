/** 새 게임 시작 현역마 지급 상수(M3-D3a2). 플레이어가 첫 시즌부터 출주할 수 있게 주는 말의 조건이다. */
import type { PopulationCountry } from './population';

/** 지급 말 나이별 두수(2세 2두·3세 1두). 나이 = 현재 연도 - birthYear */
export const STARTER_HORSES: { age: number; count: number }[] = [
  { age: 2, count: 2 },
  { age: 3, count: 1 },
];

/** 지급 말의 부 시장 등급(보통 수준). 종마 marketTier 로 부 후보를 한정한다(후보가 없으면 제한 없음) */
export const STARTER_SIRE_TIER: 1 | 2 | 3 | 4 | 5 = 3;

/** 지급 말의 나라(플레이어 기본 나라와 같게) */
export const STARTER_COUNTRY: PopulationCountry = 'GB';

/** 지급 말의 초기 컨디션(fitness). MIN_FITNESS_TO_RUN(55)보다 높아 바로 출주할 수 있다 */
export const STARTER_FITNESS = 70;
