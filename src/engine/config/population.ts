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

/**
 * 초기 나이 분포(합 1). 나이 = 현재 연도 - birthYear.
 * 연간 교체 규칙(M3-F2d)의 정상 상태 분포(시드 20261011, 2033~2037 시즌 종료 평균)에 맞춘다.
 * 이전 값(30/30/18/11/7/4)은 정상 상태까지 약 6년의 과도기가 있었다.
 */
export const POPULATION_AGE_SHARES: readonly { age: number; share: number }[] = [
  { age: 2, share: 0.26 },
  { age: 3, share: 0.24 },
  { age: 4, share: 0.207 },
  { age: 5, share: 0.157 },
  { age: 6, share: 0.091 },
  { age: 7, share: 0.045 },
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
 * 연간 교체: 신규 2세 투입 두수 = 그 해 그 나라에서 은퇴한 두수(조기 은퇴 + 나이별 하위 정리 + 8세 이상 전원).
 * 그래서 나라별 두수가 설정값으로 유지된다.
 */
/** 연간 교체: 이 나이 이상은 전부 은퇴 */
export const POPULATION_RETIRE_AGE = 8;

/** 종마 밴드로 조기 은퇴한 비거세 수말의 연간 종마 편입 상한 */
export const POPULATION_AI_STALLION_ENTRY_PER_YEAR = 10;
/** AI 종마 편입 최소 선발 기준값(OR 척도) */
export const POPULATION_AI_STALLION_MIN_VALUE = 100;
/** NH 종마 편입(M4-F1b): 은퇴한 중장거리·컵 프로필 수말의 연간 편입 상한과 최소 선발 기준값(OR 척도, 평지 기준보다 낮다) */
export const POPULATION_AI_NH_STALLION_ENTRY_PER_YEAR = 4;
export const POPULATION_AI_NH_STALLION_MIN_VALUE = 85;

/**
 * 연간 교체: 나라·나이별 하위 정리 비율(선발 기준값 하위, 나라·나이 그룹마다 적용). 8세 이상은 전원 은퇴이므로 없다.
 * 나이 = 연초 교체 후의 새 나이(나이 오름차순).
 */
export const POPULATION_CUT_SHARE_BY_AGE: readonly { age: number; share: number }[] = [
  { age: 3, share: 0.08 },
  { age: 4, share: 0.12 },
  { age: 5, share: 0.15 },
  { age: 6, share: 0.25 },
  { age: 7, share: 0.4 },
];

/**
 * 조기 은퇴 밴드. 나이·평가값으로 밴드를 고르며 첫 번째로 맞는 밴드의 확률을 쓴다(목록 순서가 우선순위).
 * 맞는 밴드가 없으면 은퇴하지 않는다. 평가값은 선발 기준값(OR, 없으면 능력 환산).
 * minValue 는 이 값 이상이라는 뜻이다. 나이 상한이 없으면 Infinity.
 */
export interface EarlyRetireBand {
  minAge: number;
  maxAge: number;
  minValue: number;
  chance: number;
}

/** 조기 은퇴: 수말(거세 안 함). 새 나이 3·4·5·6 이상. 거세마는 이 표를 쓰지 않는다. */
export const POPULATION_STUD_RETIRE_BANDS: readonly EarlyRetireBand[] = [
  { minAge: 3, maxAge: 3, minValue: 110, chance: 0.25 },
  { minAge: 4, maxAge: 4, minValue: 110, chance: 0.75 },
  { minAge: 4, maxAge: 4, minValue: 100, chance: 0.4 },
  { minAge: 5, maxAge: 5, minValue: 105, chance: 0.7 },
  { minAge: 5, maxAge: 5, minValue: 95, chance: 0.35 },
  { minAge: 6, maxAge: Number.POSITIVE_INFINITY, minValue: 100, chance: 0.8 },
];

/** 조기 은퇴: 암말(번식). 새 나이 4·5·6·7 이상. */
export const POPULATION_BROODMARE_RETIRE_BANDS: readonly EarlyRetireBand[] = [
  { minAge: 4, maxAge: 4, minValue: 100, chance: 0.35 },
  { minAge: 4, maxAge: 4, minValue: 90, chance: 0.2 },
  { minAge: 5, maxAge: 5, minValue: 95, chance: 0.6 },
  { minAge: 5, maxAge: 5, minValue: 85, chance: 0.35 },
  { minAge: 5, maxAge: 5, minValue: Number.NEGATIVE_INFINITY, chance: 0.15 },
  { minAge: 6, maxAge: 6, minValue: 90, chance: 0.8 },
  { minAge: 6, maxAge: 6, minValue: Number.NEGATIVE_INFINITY, chance: 0.5 },
  { minAge: 7, maxAge: Number.POSITIVE_INFINITY, minValue: Number.NEGATIVE_INFINITY, chance: 0.8 },
];


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
