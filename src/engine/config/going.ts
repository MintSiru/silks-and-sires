import type { Going } from '../types';
/** 띠 뷰어·UI 표기 (영문 대문자) */
export const GOING_LABELS: Record<Going, string> = {
  firm: 'FIRM', good_to_firm: 'GOOD TO FIRM', good: 'GOOD', good_to_soft: 'GOOD TO SOFT',
  soft: 'SOFT', soft_to_heavy: 'SOFT TO HEAVY', heavy: 'HEAVY',
  standard_to_fast: 'STANDARD TO FAST', standard: 'STANDARD', standard_to_slow: 'STANDARD TO SLOW',
  dirt_fast: 'FAST', dirt_good: 'GOOD', dirt_muddy: 'MUDDY', dirt_sloppy: 'SLOPPY',
};
/** 기본 속도 배수 */
export const GOING_SPEED_FACTOR: Record<Going, number> = {
  firm: 1.015, good_to_firm: 1.008, good: 1.0, good_to_soft: 0.985, soft: 0.965, soft_to_heavy: 0.945, heavy: 0.925,
  standard_to_fast: 1.004, standard: 1.0, standard_to_slow: 0.994,
  dirt_fast: 1.0, dirt_good: 0.995, dirt_muddy: 0.985, dirt_sloppy: 0.98,
};
/** 스태미나 소모 배수 */
export const GOING_STAMINA_DRAIN: Record<Going, number> = {
  firm: 0.97, good_to_firm: 0.985, good: 1.0, good_to_soft: 1.03, soft: 1.07, soft_to_heavy: 1.11, heavy: 1.16,
  standard_to_fast: 0.99, standard: 1.0, standard_to_slow: 1.02,
  dirt_fast: 1.0, dirt_good: 1.02, dirt_muddy: 1.05, dirt_sloppy: 1.07,
};
/** 파워 능력치가 속도에 영향을 주는 정도 0~1 (무거울수록 큼) */
export const GOING_POWER_WEIGHT: Record<Going, number> = {
  firm: 0, good_to_firm: 0.1, good: 0.2, good_to_soft: 0.4, soft: 0.6, soft_to_heavy: 0.8, heavy: 1.0,
  standard_to_fast: 0.1, standard: 0.15, standard_to_slow: 0.25,
  dirt_fast: 0.3, dirt_good: 0.4, dirt_muddy: 0.6, dirt_sloppy: 0.7,
};
/** 착차 환산 (마신/초) */
export const LENGTHS_PER_SECOND: Record<Going, number> = {
  firm: 6, good_to_firm: 6, good: 5.5, good_to_soft: 5.5, soft: 5, soft_to_heavy: 5, heavy: 4.5,
  standard_to_fast: 6, standard: 6, standard_to_slow: 5.5,
  dirt_fast: 5.5, dirt_good: 5.5, dirt_muddy: 5, dirt_sloppy: 5,
};
/** 마장 적성: 최적일 때 보너스, 완전히 벗어났을 때 최대 감점 (속도 비율) */
export const GOING_FIT_BONUS = 0.005;
export const GOING_FIT_MAX_PENALTY = 0.03;
/** AW 적성 1.0 당 속도 효과 */
export const AW_APTITUDE_EFFECT = 0.02;
/** 더트 적성 1.0 당 속도 효과 (잔디마가 더트에서 고전하는 폭이 AW 보다 크다) */
export const DIRT_APTITUDE_EFFECT = 0.03;
/** 월별(1~12) 잔디 마장 기준 인덱스 (0=firm ~ 6=heavy) */
export const GOING_MONTH_BASE = [4.5, 4.5, 4.0, 3.0, 2.5, 2.0, 1.8, 2.0, 2.5, 3.2, 4.0, 4.5] as const;
/** 당일 변동 표준편차(인덱스) */
export const GOING_DAILY_SD = 1.0;
/** 배수(drainage) 효과: index += (0.5 - drainage) * 이 값 */
export const GOING_DRAINAGE_EFFECT = 1.0;
/** AW 마장 확률 [standard_to_fast, standard, standard_to_slow] */
export const AW_GOING_WEIGHTS = [0.15, 0.75, 0.1] as const;
/** 더트 마장 확률 [fast, good, muddy, sloppy] */
export const DIRT_GOING_WEIGHTS = [0.7, 0.15, 0.1, 0.05] as const;
