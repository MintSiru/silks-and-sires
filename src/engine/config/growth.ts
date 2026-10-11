import type { HorseStatus } from '../types';

/** 이 주(週)부터 출생 연도의 망아지는 이유마가 된다 (9월 초) */
export const WEANING_WEEK = 36;
/** 성장 계산 대상 상태 */
export const GROWING_STATUSES: readonly HorseStatus[] = ['foal', 'weanling', 'yearling', 'in_training', 'resting', 'retired', 'stud', 'broodmare'];
