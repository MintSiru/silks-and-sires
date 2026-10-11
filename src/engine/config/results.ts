/** 구간 표지 간격(m) = 1펄롱 */
export const SECTIONAL_STEP_M = 201.168;
/** 첫 구간이 이보다 짧으면 그 표지는 생략 */
export const MIN_FIRST_SECTION_M = 50;
/** 이 시간차(s) 이하이면 동착 */
export const DEAD_HEAT_SECONDS = 0.002;
/** 마신 기준 라벨 상한(미만) */
export const NOSE_MAX_L = 0.1;
export const SHORT_HEAD_MAX_L = 0.2;
export const HEAD_MAX_L = 0.3;
export const NECK_MAX_L = 0.45;
/** 3마신 미만은 ¼ 단위, 5마신 미만은 ½ 단위, 그 이상 1 단위 */
export const QUARTER_LENGTH_LIMIT_L = 3;
export const HALF_LENGTH_LIMIT_L = 5;
/** 이 이상이면 'distance' */
export const DISTANCE_MARGIN_L = 30;
export const MIN_LENGTH_MARGIN_L = 0.5;
/** 거리별 1마신당 lb [거리(m), lb], 선형 보간, 양끝 밖은 끝값 */
export const LB_PER_LENGTH_TABLE: readonly (readonly [number, number])[] = [
  [1006, 3], [1207, 2.5], [1408, 2.25], [1609, 2], [2012, 1.75], [2414, 1.5], [3219, 1.25],
];
/** 성적 지수 소수 자릿수 */
export const FIGURE_DECIMALS = 1;
