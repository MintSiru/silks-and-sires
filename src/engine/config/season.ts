/** 개최일 실행·결과 반영 밸런스 상수 (M3-A6b). 코드 안에 수치를 직접 두지 않는다. */
import type { RaceGrade } from '../types';

/** 시뮬레이션(0.1초 틱)으로 돌리는 등급. 플레이어 말이 나오면 등급과 무관하게 시뮬레이션한다 */
export const SIMULATE_GRADES: readonly RaceGrade[] = ['G1', 'G2', 'G3', 'L'];

/** 요약 모드 예상 시간 노이즈(예상 시간 대비 표준편차 비율) */
export const SUMMARY_NOISE_SD = 0.006;

/** 출주 후 피로 증가량. 거리(m)가 maxDistance 이하이면 gain. 어느 구간에도 안 들면 FATIGUE_GAIN_LONG */
export const FATIGUE_GAIN_BY_DISTANCE: readonly { maxDistance: number; gain: number }[] = [
  { maxDistance: 1207, gain: 18 },
  { maxDistance: 1609, gain: 22 },
  { maxDistance: 2414, gain: 28 },
];
/** 가장 긴 거리대의 피로 증가량 */
export const FATIGUE_GAIN_LONG = 35;
/** 출주 후 준비도 감소량 */
export const FITNESS_LOSS_PER_RUN = 8;
/** 준비도·피로 clamp 범위 */
export const CONDITION_MIN = 0;
export const CONDITION_MAX = 100;

/** 다시 볼 수 있는 레이스 최대 보관 수 */
export const REPLAYABLE_MAX = 30;
/** 결과 보존 시즌 수. 이보다 오래된 raceResults 는 시즌이 바뀔 때 A6c 가 정리한다 */
export const RESULTS_KEEP_SEASONS = 2;

/** 입상 기준 착순(이하) */
export const PLACED_MAX_POSITION = 3;

/** 레이스 시드 상한(정수, 포함) */
export const RACE_SEED_MAX = 0x7fffffff;

/**
 * 휴식 회복 (M3-A6c 임시 규칙, C1 이 대체). in_training·resting 말에 주마다 적용.
 * fitness 는 REST_FITNESS_CAP 미만일 때만 올린다(이미 상한 이상이면 낮추지 않는다).
 */
export const REST_FATIGUE_RECOVERY = 10;
export const REST_FITNESS_GAIN = 4;
export const REST_FITNESS_CAP = 85;

/** 플레이어 말이 이 나이(연도 차) 이상이고 yearling 이면 조교사 배정과 함께 in_training 으로 바뀐다 */
export const PLAYER_TRAINING_START_AGE = 2;
