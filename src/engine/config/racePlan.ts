/** 조교사 출주 계획. 난수 없이 일정·적성·현재 컨디션으로 판단한다. */
export const RACE_PLAN_WEEKS = 12;
export const RACE_PLAN_MAX_RUNS = 4;
export const RACE_PLAN_INTERVAL = 4;
export const RACE_PLAN_RENEW_WEEKS = 4;
/** 끝난(run·skipped) 계획을 남겨 두는 기간(주). 말 상세 '출주 계획' 탭의 최근 기록용 */
export const RACE_PLAN_HISTORY_WEEKS = 26;
/** 거리 오차와 클래스 차이를 같은 점수 척도로 비교한다. */
export const RACE_PLAN_DISTANCE_SCORE = 10;
export const RACE_PLAN_CLASS_SCORE = 2;
/** 조건 목표 계획은 계획 주에 맞는 레이스가 없으면 이 주 수만큼 늦게까지 찾는다(겨울 올웨더는 주 1개최·3레이스뿐) */
export const RACE_PLAN_TARGET_SLACK_WEEKS = 2;
