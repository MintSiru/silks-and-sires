/** 내부거래(M4-C7a) 밸런스 상수. 초기값이며 Opus 가 조정한다. */
import type { OwnerTier } from '../types';

/** 새 제안을 만드는 주(해의 주 번호). 이 주에만 제안을 생성한다 */
export const PRIVATE_OFFER_WEEKS: readonly number[] = [3, 6, 9];
/** 제안 대상 마주 등급(AI 마주 중 이 등급만) */
export const PRIVATE_OFFER_TIERS: readonly OwnerTier[] = ['major', 'mid'];
/** 자격: 마주 관계 하한(이상이면 자격) */
export const PRIVATE_OFFER_MIN_RELATION = 20;
/** 자격: 플레이어 명성 하한(이상이면 자격. 관계 조건과 OR) */
export const PRIVATE_OFFER_MIN_REPUTATION = 35;
/** 후보 말 나이(올해 기준 나이 = 연도 − 출생연도) */
export const PRIVATE_OFFER_HORSE_AGE = 2;
/** 진행 중 제안 수 상한(이 수 미만일 때만 새 제안) */
export const PRIVATE_OFFER_MAX_ACTIVE = 3;
/** 한 주에 만들 수 있는 최대 제안 수 */
export const PRIVATE_OFFER_PER_RUN = 2;
/** 마주 추첨 가중치: 기본값 + max(0, 관계) + 명성 ÷ REPUTATION_WEIGHT_DIVISOR */
export const PRIVATE_OFFER_BASE_WEIGHT = 1;
export const PRIVATE_OFFER_REPUTATION_WEIGHT_DIVISOR = 2;
/** 제시 가격 = 평가값(breeze_up) × PREMIUM × (1 − min(max(관계,0), DISCOUNT_CAP) ÷ DISCOUNT_DIVISOR) */
export const PRIVATE_OFFER_PREMIUM = 1.25;
export const PRIVATE_OFFER_DISCOUNT_CAP = 60;
export const PRIVATE_OFFER_DISCOUNT_DIVISOR = 400;
/** 가격 반올림 단위(€) */
export const PRIVATE_OFFER_ROUND = 500;
/** 가격 하한(€) */
export const PRIVATE_OFFER_MIN_PRICE = 5_000;
/** 제안 유효 주 수(생성 주 + 이 값까지 수락 가능, 포함) */
export const PRIVATE_OFFER_VALID_WEEKS = 4;

/** 수락 시 판매 마주 관계 증가 */
export const OWNER_RELATION_PRIVATE_PURCHASE = 8;
/** 플레이어 말이 AI 마주 생산마로 1착: 그 생산 마주 관계 증가(일반 / G1) */
export const OWNER_RELATION_BRED_WIN = 2;
export const OWNER_RELATION_BRED_G1_WIN = 5;
