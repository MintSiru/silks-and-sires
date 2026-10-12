/** 개최일 구성·자동 생성 경주 밸런스 상수 (M3-A5). 코드 안에 수치를 직접 두지 않는다. */
import type { RaceClass, RaceKind } from '../types';

/** 자동 생성되는 경주 종류 */
export type GeneratedRaceKind = Extract<RaceKind, 'maiden' | 'novice' | 'handicap'>;
/** 핸디캡 클래스 (2~7). 클래스 1 은 그룹·리스티드 전용 */
export type HandicapClass = Exclude<RaceClass, 1>;
/** 일반 개최를 두는 나라 */
export type MinorCountry = 'GB' | 'IE' | 'FR' | 'DE' | 'IT';

/** 개최일 하나의 경주 수 목표. 고정 일정 레이스가 이미 이보다 많으면 그대로 둔다 */
export const MEETING_RACES_TARGET = 3;

/** 나라별 주당 일반 개최 수(잔디 시즌). 그 나라 잔디 경마장이 모자라면 있는 만큼 */
export const MINOR_MEETINGS_PER_WEEK: Readonly<Record<MinorCountry, number>> = {
  GB: 2,
  IE: 1,
  FR: 2,
  DE: 1,
  IT: 1,
};

/** 주당 올웨더 개최 수(올웨더 시즌). surface 'aw' 경마장만 쓴다 */
export const AW_MEETINGS_PER_WEEK = 2;

/** 자동 생성 경주 종류 가중치 (잔디 시즌) */
export const GENERATED_KIND_WEIGHTS: Readonly<Record<GeneratedRaceKind, number>> = {
  maiden: 0.1,
  novice: 0.1,
  handicap: 0.8,
};

/** 핸디캡 클래스 목록(오름차순) */
export const HANDICAP_CLASSES: readonly HandicapClass[] = [2, 3, 4, 5, 6, 7];

/** 핸디캡 OR 범위 (양끝 포함) */
export const HANDICAP_OR_RANGE: Readonly<Record<HandicapClass, { min: number; max: number }>> = {
  2: { min: 80, max: 105 },
  3: { min: 72, max: 95 },
  4: { min: 62, max: 85 },
  5: { min: 52, max: 75 },
  6: { min: 42, max: 65 },
  7: { min: 0, max: 58 },
};

/** 핸디캡 클래스 가중치 (잔디 시즌) */
export const HANDICAP_CLASS_WEIGHTS: Readonly<Record<HandicapClass, number>> = {
  2: 0.08,
  3: 0.17,
  4: 0.25,
  5: 0.25,
  6: 0.17,
  7: 0.08,
};

/** 올웨더 시즌 자동 생성 핸디캡의 최저 클래스 (클래스 3~7) */
export const AW_HANDICAP_MIN_CLASS: HandicapClass = 3;

/** 메이든·노비스 생성 경주의 클래스 (명세 미지정, 임의 선택) */
export const CONDITIONS_RACE_CLASS: RaceClass = 5;

/** 클래스별 총상금(€). 클래스 1 은 conditions 레이스용(자동 생성에는 쓰지 않음) */
export const CLASS_TOTAL_PRIZE: Readonly<Record<RaceClass, number>> = {
  1: 40000,
  2: 30000,
  3: 15000,
  4: 9000,
  5: 6500,
  6: 5000,
  7: 4000,
};

/** 메이든 총상금(€) */
export const MAIDEN_TOTAL_PRIZE = 9000;
/** 노비스 총상금(€) */
export const NOVICE_TOTAL_PRIZE = 10000;

/** 착순 상금 배분 비율 [1착, 2착, ...]. 합 1 */
export const PRIZE_SHARES: readonly number[] = [0.57, 0.22, 0.11, 0.055, 0.03, 0.015];

/** 2세 경주가 열리는 첫 주(잔디 시즌, 4월 중순) */
export const TWO_YO_FROM_WEEK = 15;
/** 2세 경주 시작 달(TWO_YO_FROM_WEEK 가 속한 달)에는 이 거리 범위만 연다 (m, 양끝 포함) */
export const TWO_YO_OPENING_DISTANCE_MIN = 1006;
export const TWO_YO_OPENING_DISTANCE_MAX = 1207;
/** 이 달(포함)부터 2세 거리 상한이 TWO_YO_CAP_LATE_M 로 올라간다 (9월) */
export const TWO_YO_CAP_START_MONTH = 9;
/** 9월 이전 2세 거리 상한(m) */
export const TWO_YO_CAP_EARLY_M = 1609;
/** 9월 이후 2세 거리 상한(m) */
export const TWO_YO_CAP_LATE_M = 2012;
/** 2세 허용 주에 메이든·노비스가 2세 경주가 될 확률. M3-F2b 튜닝(2세 출주 평균 2.5~5회 목표) */
export const TWO_YO_SHARE = 0.67;

/**
 * 거리 가중 구간. 거리 d 는 d <= maxM 인 첫 구간에 속한다.
 * 마지막 구간은 상한 없음(장거리). 후보 거리 하나의 가중은 구간 가중을 그 구간의 후보 수로 나눈 값이다.
 */
export const DISTANCE_BUCKETS: readonly { maxM: number; weight: number }[] = [
  { maxM: 1408, weight: 0.2 },
  { maxM: 1811, weight: 0.43 },
  { maxM: 2414, weight: 0.35 },
  { maxM: Number.POSITIVE_INFINITY, weight: 0.02 },
];

/** 연령별 정량 기준 부담중량(lb) */
export const BASE_WEIGHT_LB = 126;
/** 핸디캡 상한 중량(lb) */
export const HANDICAP_BASE_WEIGHT_LB = 133;

/** 메이든·노비스 최대 출주 두수 */
export const MAX_RUNNERS_CONDITIONS = 14;
/** 핸디캡 최대 출주 두수 */
export const MAX_RUNNERS_HANDICAP = 18;
/** 이 클래스 이하(숫자 이하) 핸디캡의 최대 출주 두수 */
export const MAX_RUNNERS_HANDICAP_TOP_CLASS = 3;
/** 상위 클래스 핸디캡의 최대 출주 두수 */
export const MAX_RUNNERS_HANDICAP_TOP = 20;
