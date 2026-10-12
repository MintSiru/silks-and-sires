/** 자마 성적 누적·실제 성적 기준 거리 적성·성적 닉스 공개 밸런스 상수 (M3-C4). 코드 안에 수치를 직접 두지 않는다. */
import type { RaceGrade } from '../types';

/** 실제 성적 기준 거리 적성을 내는 최소 우승 수. 이보다 적으면 실제 적성은 미정(null) */
export const OBSERVED_PROFILE_MIN_WINS = 5;

/** nicks.json 값이 이 이상이면 '좋은 닉스'로 보고 그룹 우승 시 공개 대상이 된다 */
export const NICK_REVEAL_MIN_VALUE = 0.3;

/** 닉스를 성적으로 공개하는 그룹 등급(리스티드·핸디캡은 제외) */
export const NICK_REVEAL_GRADES: readonly RaceGrade[] = ['G1', 'G2', 'G3'];
