/** 레이스 실황 중계 판정 상수 (M3-D1a). 코드에 숫자를 직접 박지 않고 여기서만 조정한다. */
import type { MarginLabel } from '../types';

/** slow_start: 이 시각(s)의 최하위 말이 바로 앞 말과 SLOW_START_GAP_M 이상 뒤지면 사건 */
export const SLOW_START_CHECK_S = 2;
export const SLOW_START_GAP_M = 3;

/** early_leader: 진행 min(EARLY_LEADER_M, distance × EARLY_LEADER_MAX_FRACTION) 시점의 선두 */
export const EARLY_LEADER_M = 400;
export const EARLY_LEADER_MAX_FRACTION = 0.25;
/** lead_battle: 2위와의 간격이 이 값(m) 이내면 두 말 선두 다툼 */
export const LEAD_BATTLE_MAX_GAP_M = 0.5;

/** pace: 거리 PACE_CHECK_FRACTION 지점 도달 시각 / (승리 시간 × PACE_CHECK_FRACTION) */
export const PACE_CHECK_FRACTION = 0.5;
/** 비율 < PACE_FAST 이면 빠른 페이스, > PACE_SLOW 이면 느린 페이스 */
export const PACE_FAST = 0.985;
export const PACE_SLOW = 1.015;
export const PACE_FAST_VALUE = 1;
export const PACE_SLOW_VALUE = -1;

/** turn_in: 직선 입구 시점 상위 몇 두를 기록할지 */
export const TURN_IN_TOP_N = 3;

/** move: 결승 직선을 나누는 구간 길이(m)와 필요한 최소 상승 계단 */
export const MOVE_WINDOW_M = 200;
export const MOVE_MIN_PLACES = 3;

/** photo: 1·2착 착차 라벨이 이 중 하나이거나 동착이면 사진 판정 */
export const PHOTO_MARGIN_LABELS: readonly MarginLabel[] = ['nose', 'short_head', 'head', 'dead_heat'];

/** 한 줄 평: 1착 마신 기준(이상이면 winner_easy, 미만이면 winner_narrow) */
export const WINNER_EASY_MIN_LENGTHS = 2;
/** 한 줄 평: 직선·중위 판정 샘플 간격(틱). 틱 = tickSeconds */
export const VERDICT_SAMPLE_TICKS = 10;
/** 거리 50% 지점에서 rank > 출주두수 × CAME_FROM_BACK_RANK_FRACTION 이면 하위 1/3 */
export const CAME_FROM_BACK_RANK_FRACTION = 2 / 3;
/** rank ≤ 출주두수 × MIDDLE_RANK_FRACTION 이면 중위 이상 */
export const MIDDLE_RANK_FRACTION = 0.5;
/** 입상 기준 착순 (이 이하이면 입상) */
export const PLACED_MAX_POSITION = 3;
/** faded: 직선 입구 rank 가 이 이하이고 최종 착순이 FADED_FINISH_MIN_POSITION 이상 */
export const FADED_TURN_IN_MAX_RANK = 3;
export const FADED_FINISH_MIN_POSITION = 6;
/** stayed_on: 직선 입구 rank − 최종 착순 ≥ 이 값 */
export const STAYED_ON_MIN_PLACES = 3;

/** {n} 자리 표시 값 표기: 반올림 배수(10 = 소수 1자리) */
export const VALUE_ROUND_FACTOR = 10;
