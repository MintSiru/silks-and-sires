/** 출주 결정(AI)·부담중량·기수 배정 밸런스 상수 (M3-A6a). 코드 안에 수치를 직접 두지 않는다. */
import type { CountryCode, RaceGrade } from '../types';

/** 같은 말이 두 레이스 사이에 필요한 최소 주 수 */
export const MIN_WEEKS_BETWEEN_RUNS = 2;
/** 그룹 레이스에 나가려면 마지막 출주 후 필요한 최소 주 수 */
export const MIN_WEEKS_BETWEEN_GROUP_RUNS = 3;
/** 출주 가능 최소 컨디션(fitness) */
export const MIN_FITNESS_TO_RUN = 55;
/** 거리 적합: |distanceOptimum − distance| ≤ distanceRange × DISTANCE_TOLERANCE */
export const DISTANCE_TOLERANCE = 1.3;
/** 출주 최소 두수. 이보다 적으면 레이스는 abandoned */
export const MIN_FIELD_SIZE = 2;

/** 그룹·리스티드 후보 OR 하한(3세 이상). 2세 그룹은 적용하지 않는다(잠재 평균 사용) */
export const GROUP_OR_FLOOR: Readonly<Record<RaceGrade, number>> = {
  G1: 100,
  G2: 95,
  G3: 90,
  L: 82,
};

/** 그룹·리스티드 등급 정렬 순서(앞이 우선). 선언 순서 결정에 쓴다 */
export const RACE_GRADE_ORDER: readonly RaceGrade[] = ['G1', 'G2', 'G3', 'L'];

/** 그룹 레이스에서 다른 유럽 나라 말이 후보가 되는 확률 */
export const TRAVEL_CHANCE_GROUP = 0.15;
/** 원정 후보가 될 수 있는 나라(유럽 5개국). 홈 나라를 뺀 나머지가 원정 후보 나라다 */
export const TRAVEL_COUNTRIES: readonly CountryCode[] = ['GB', 'IE', 'FR', 'DE', 'IT'];

/** 목표 출주 두수 범위(정수 균등, 양끝 포함). 실제 목표는 maxRunners 이하로 자른다 */
export interface FieldSizeRange {
  min: number;
  max: number;
}
export const FIELD_SIZE_GROUP: FieldSizeRange = { min: 8, max: 14 };
export const FIELD_SIZE_LISTED: FieldSizeRange = { min: 8, max: 12 };
export const FIELD_SIZE_HANDICAP: FieldSizeRange = { min: 10, max: 18 };
/** 메이든·노비스·조건 경주(conditions) 공통 */
export const FIELD_SIZE_CONDITIONS: FieldSizeRange = { min: 8, max: 14 };

/** 메이든 최대 누적 승수(0 = 무승) */
export const MAIDEN_MAX_WINS = 0;
/** 노비스 최대 누적 승수 */
export const NOVICE_MAX_WINS = 1;

/** 2세(사용 나이). 2세는 OR 이 없으므로 그룹 평가에 잠재 평균을 쓴다 */
export const JUVENILE_AGE = 2;
/** 그룹 후보 점수 잡음 표준편차(OR 단위) */
export const GROUP_SCORE_NOISE_SD = 2;
/** 2세 경주 선택 가중: 1 + JUVENILE_FOCUS_WEIGHT × 조교사 juvenileFocus */
export const JUVENILE_BASE_WEIGHT = 1;
export const JUVENILE_FOCUS_WEIGHT = 3;

/** 핸디캡 최저 부담중량(lb) */
export const HANDICAP_MIN_WEIGHT_LB = 112;
/** 모든 레이스의 배정 중량 하한(lb, WFA·성별 감량 후, 견습 감량 전). 기수 최저 기승 체중 하한과 같다 */
export const MIN_RACE_WEIGHT_LB = 112;

/** WFA: 3세가 4세 이상에게 받는 감량 나이 */
export const WFA_YOUNG_AGE = 3;
/** WFA: 이 나이 이상 상대가 있는 레이스에서만 3세 감량 */
export const WFA_OLDER_MIN_AGE = 4;
/** WFA 거리 구간 상한(m). 이 값 이하는 해당 인덱스, 마지막 이후는 그 이상 구간 */
export const WFA_DISTANCE_EDGES_M: readonly number[] = [1207, 1609, 2414];
/** WFA 표 키 범위(월). 이 밖(12~3월)은 WFA_OFF_SEASON_MONTH 값을 쓴다 */
export const WFA_FIRST_MONTH = 4;
export const WFA_LAST_MONTH = 11;
export const WFA_OFF_SEASON_MONTH = 4;

/**
 * WFA 감량(lb). 월(4~11) → [≤1,207m, ≤1,609m, ≤2,414m, 그 이상].
 * 12~3월은 WFA_OFF_SEASON_MONTH 행을 쓴다.
 */
export const WFA_ALLOWANCE_LB: Readonly<Record<number, readonly number[]>> = {
  4: [6, 8, 11, 13],
  5: [5, 7, 10, 12],
  6: [4, 6, 8, 10],
  7: [3, 5, 6, 8],
  8: [2, 3, 5, 6],
  9: [1, 2, 3, 5],
  10: [0, 1, 2, 3],
  11: [0, 0, 1, 2],
};

/** 성별 감량(lb). open 레이스의 암말에게만 적용(핸디캡 제외) */
export const FEMALE_ALLOWANCE_LB = 3;

/** 기수 선택 가중 = JOCKEY_PICK_BASE_WEIGHT + 기수 skill (skill 0 이어도 후보 유지) */
export const JOCKEY_PICK_BASE_WEIGHT = 1;
