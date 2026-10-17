import type { RaceGrade } from '../types';

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

/**
 * 승리마에게 그룹·리스티드를 제안하는 OR 하한(M7-C2). 출주 가능선(GROUP_OR_FLOOR 93/92/88/82)보다 높게 잡아,
 * 등급 격차가 큰 레이스에 조교사가 계획하지 않게 한다(플레이 테스트 B7: 6전 0승 말이 G1 에 계획됨).
 * 제안 전용 규칙이라 AI 선언과 수동 계획에는 쓰지 않는다.
 */
export const RACE_PLAN_MIN_OR: Readonly<Record<RaceGrade, number>> = { G1: 108, G2: 104, G3: 100, L: 95 };

/**
 * 조교사 제안의 거리 여유(m, M7-C2). 적성 범위(distanceOptimum ± distanceRange)에서 이만큼 밖까지만 제안한다.
 * 1,700~2,200m 적성 말은 1,600~2,300m 까지 제안 가능.
 */
export const RACE_PLAN_DISTANCE_SLACK_M = 100;
