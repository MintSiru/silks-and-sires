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

/**
 * 지급 말의 잠재 능력 평균, 나이별(M4-ST1). 부 등급과 무관하게 이 값을 쓴다(POPULATION_TIER_LEVEL 대체).
 * 측정(시드 1~40, 성장형 고정 STARTER_GROWTH_TYPE 적용 후, 2026-10-15 Opus):
 * - 2세 70(보통형): 잠재 레이팅 최소 93·중앙 104·최대 115 — 3세에 리스티드~G3 수준.
 * - 3세 70(조숙형, 3세 정점): 시작 OR 최소 94·중앙 104·최대 116.
 */
export const STARTER_ABILITY_LEVEL: Readonly<Record<number, number>> = {
  2: 70,
  3: 70,
};

/**
 * 지급 말의 성장형, 나이별(M4-ST1, 2026-10-15 Opus). 성장형이 무작위면 3세 시작 OR 이 62~140 으로 갈린다.
 * 2세는 보통형(4세 정점, 3세에 크게 성장), 3세는 조숙형(3세 정점 — 시작부터 리스티드~G3 수준, 이후 완만히 하락).
 */
export const STARTER_GROWTH_TYPE: Readonly<Record<number, 'precocious' | 'normal' | 'late'>> = {
  2: 'normal',
  3: 'precocious',
};

/**
 * 지급 말의 잠재 능력 표준편차(M4-ST1). POPULATION_ABILITY_SPREAD(9)의 절반(4.5)이면 2세 잠재 레이팅 최솟값이 89로
 * 기준(92) 미달이라 3으로 줄였다.
 */
export const STARTER_ABILITY_SPREAD = 3;
