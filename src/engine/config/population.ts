/** 유럽 현역마 집단(AI 마주·조교사 소속 경주마) 생성·연간 교체 밸런스 상수. 초기값이며 Opus 가 조정한다. */
import type { OwnerTier } from '../types';
import { DIST_OPT_MAX, DIST_OPT_MIN } from './horse';

/** 현역마 집단을 두는 국가 */
export type PopulationCountry = 'GB' | 'IE' | 'FR' | 'DE' | 'IT';

/** 국가 처리 순서(결정적 생성을 위해 고정) */
export const POPULATION_COUNTRY_ORDER: readonly PopulationCountry[] = ['GB', 'IE', 'FR', 'DE', 'IT'];

/** 나라별 현역마 두수(설정값). 연간 교체 후에도 이 값 근처를 유지해야 한다. */
export const POPULATION_IN_TRAINING: Readonly<Record<PopulationCountry, number>> = {
  GB: 900,
  IE: 450,
  FR: 650,
  DE: 200,
  IT: 200,
};

/** 초기 나이 분포(합 1). 나이 = 현재 연도 - birthYear */
export const POPULATION_AGE_SHARES: readonly { age: number; share: number }[] = [
  { age: 2, share: 0.3 },
  { age: 3, share: 0.3 },
  { age: 4, share: 0.18 },
  { age: 5, share: 0.11 },
  { age: 6, share: 0.07 },
  { age: 7, share: 0.04 },
];
/** 신규 진입 나이(연간 교체에서 새로 넣는 말의 나이) */
export const POPULATION_ENTRY_AGE = 2;
/** 암말 비율 */
export const POPULATION_FEMALE_SHARE = 0.42;
/** 4세 이상 수말 중 거세마 비율 */
export const POPULATION_GELDING_SHARE = 0.35;
/** 거세 판정을 받는 최소 나이(이 나이부터 수말은 거세 여부가 정해진다) */
export const POPULATION_GELDING_MIN_AGE = 4;

/**
 * 연간 교체: 신규 2세 투입 두수 = 그 해 그 나라에서 은퇴한 두수(8세 이상 전부 + 4세 이상 하위 CUT_SHARE).
 * 그래서 나라별 두수가 설정값으로 유지된다.
 */
/** 연간 교체: 이 나이 이상은 전부 은퇴 */
export const POPULATION_RETIRE_AGE = 8;
/** 연간 교체: 이 나이 이상 중 하위 비율을 은퇴(나라별 적용) */
export const POPULATION_CUT_MIN_AGE = 4;
export const POPULATION_CUT_SHARE = 0.15;
/** 공식 레이팅을 부여하는 최소 나이(그 미만은 null) */
export const POPULATION_RATING_MIN_AGE = 3;

/**
 * 부(父) 종마 marketTier → 잠재 능력 평균(명세 값, 고정).
 * 플레이어 생산마 잠재가 60대이므로 AI 현역마 능력 표는 올리지 않고 OR 환산식으로 맞춘다.
 */
export const POPULATION_TIER_LEVEL: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 66,
  2: 63,
  3: 60,
  4: 57,
  5: 54,
};
/** 잠재 능력 표준편차(개별 능력치) */
export const POPULATION_ABILITY_SPREAD = 9;

/** 부 선택 가중치(종마 marketTier 별, 종마 1두당) */
export const POPULATION_SIRE_TIER_WEIGHT: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 10,
  2: 6,
  3: 4,
  4: 2.5,
  5: 1.5,
};
/** 계류국이 같은 나라인 종마의 가중 배수 */
export const POPULATION_SIRE_SAME_COUNTRY_MULT = 2;

/** 마주 배정 가중치(tier 별, 같은 나라 마주 중) */
export const POPULATION_OWNER_TIER_WEIGHT: Readonly<Record<OwnerTier, number>> = {
  major: 6,
  mid: 2,
  small: 1,
};
/** 조교사 배정 가중치 = max(skill, 이 값). skill 0 인 조교사도 뽑힐 수 있게 한다 */
export const POPULATION_TRAINER_SKILL_FLOOR = 1;

/** 거리 편향: distanceBias = W × 부 프로필 거리 + (1 − W) × 기본 생성 중간값 */
export const POPULATION_DISTANCE_SIRE_WEIGHT = 0.5;
export const POPULATION_DISTANCE_DEFAULT_MEDIAN = (DIST_OPT_MIN + DIST_OPT_MAX) / 2;

/**
 * 공식 레이팅 환산: OR = clamp(round(OR_ANCHOR + (a − OR_ANCHOR_ABILITY) × OR_PER_ABILITY), RATING_MIN, RATING_MAX)
 * a = 현재 능력 5종 평균. 앵커 능력(56)에서 OR 72 가 되도록 한다.
 */
export const OR_ANCHOR = 72;
export const OR_ANCHOR_ABILITY = 56;
export const OR_PER_ABILITY = 2.05;
export const RATING_MIN = 20;
export const RATING_MAX = 140;
/**
 * 고점 꼬리 보정(사용자 결정 2026-10-11: 그해 최강마 OR 125~130, 역대급 135+):
 * 능력 평균이 OR_TAIL_FROM_ABILITY 를 넘으면 넘은 만큼 더하되 최대 OR_TAIL_MAX_BONUS.
 */
export const OR_TAIL_FROM_ABILITY = 65;
export const OR_TAIL_MAX_BONUS = 7;
