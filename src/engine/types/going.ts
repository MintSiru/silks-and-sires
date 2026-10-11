/** 잔디 마장 7단계 (빠름 → 무거움). 인덱스 0~6 이 마장 적성 계산의 축이다. */
export const TURF_GOING_ORDER = [
  'firm',
  'good_to_firm',
  'good',
  'good_to_soft',
  'soft',
  'soft_to_heavy',
  'heavy',
] as const;

/** 올웨더(AW) 마장 3단계 (빠름 → 느림). */
export const AW_GOING_ORDER = ['standard_to_fast', 'standard', 'standard_to_slow'] as const;

export type TurfGoing = (typeof TURF_GOING_ORDER)[number];
export type AwGoing = (typeof AW_GOING_ORDER)[number];
export type Going = TurfGoing | AwGoing;
