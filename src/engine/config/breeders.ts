/** 상업 생산자(M4-C0) 생성·생산자 배정 밸런스 상수. 초기값이며 Opus 가 조정한다. */
import type { BreederScale, OwnerTier } from '../types';
import type { PopulationCountry } from './population';

/** 나라별 상업 생산자 수(설정값). 나라 처리 순서는 POPULATION_COUNTRY_ORDER 를 쓴다 */
export const BREEDER_COUNT_BY_COUNTRY: Readonly<Record<PopulationCountry, number>> = {
  GB: 12,
  IE: 16,
  FR: 12,
  DE: 5,
  IT: 5,
};

/** 규모 순서(배분·출력 순서를 고정한다) */
export const BREEDER_SCALE_ORDER: readonly BreederScale[] = ['large', 'medium', 'small'];

/** 나라별 규모 비율(합 1). 나라별 수를 최대 나머지법으로 나눈다(결정적) */
export const BREEDER_SCALE_SHARE: Readonly<Record<BreederScale, number>> = {
  large: 0.2,
  medium: 0.4,
  small: 0.4,
};

/** 생산자 자금 범위(유로 정수, 양끝 포함) */
export const BREEDER_FUNDS_RANGE: Readonly<Record<BreederScale, { min: number; max: number }>> = {
  large: { min: 2_000_000, max: 5_000_000 },
  medium: { min: 500_000, max: 2_000_000 },
  small: { min: 100_000, max: 500_000 },
};

/** ID 형식: 접두어 + 0 패딩 일련번호(예: brd_000001) */
export const BREEDER_ID_PREFIX = 'brd_';
export const BREEDER_ID_DIGITS = 6;

/** 목장 이름 뽑기 최대 시도 횟수(마주 studName·다른 생산자 이름과 겹치면 다시 뽑는다) */
export const BREEDER_NAME_MAX_ATTEMPTS = 50;

/**
 * 오너브리더 생산 확률(목장 보유 마주 기준 조건부). 마주가 studName 을 가진 경우에만 적용하고,
 * 못 뽑히면 상업 생산자 배정으로 넘어간다. 순서 major > mid > small = 0 을 유지한다.
 */
export const OWNER_BREEDER_SHARE: Readonly<Record<OwnerTier, number>> = {
  major: 1,
  mid: 0.95,
  small: 0,
};

/** 상업 생산자 배정 가중치(규모별). 말의 나라와 같은 나라 생산자 중에서 추첨한다 */
export const BREEDER_PICK_WEIGHT: Readonly<Record<BreederScale, number>> = {
  large: 5,
  medium: 2,
  small: 1,
};
