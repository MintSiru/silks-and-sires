import {
  FEMALE_ALLOWANCE_LB,
  HANDICAP_MIN_WEIGHT_LB,
  WFA_ALLOWANCE_LB,
  WFA_DISTANCE_EDGES_M,
  WFA_FIRST_MONTH,
  WFA_LAST_MONTH,
  WFA_OFF_SEASON_MONTH,
  WFA_YOUNG_AGE,
} from '../config/entries';
import type { Horse, Race } from '../types';

/** 월 → WFA 표 행. 4~11월은 그대로, 12~3월은 4월 값 */
function wfaRowMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month 는 1~12 정수여야 한다: ${month}`);
  }
  if (month >= WFA_FIRST_MONTH && month <= WFA_LAST_MONTH) {
    return month;
  }
  return WFA_OFF_SEASON_MONTH;
}

/** 거리 → 구간 인덱스(0~WFA_DISTANCE_EDGES_M.length). 마지막 구간 = 그 이상 */
function wfaDistanceIndex(distance: number): number {
  const idx = WFA_DISTANCE_EDGES_M.findIndex((edge) => distance <= edge);
  return idx === -1 ? WFA_DISTANCE_EDGES_M.length : idx;
}

/**
 * WFA(3세가 4세 이상에게 받는 감량, lb).
 * age 가 WFA_YOUNG_AGE 가 아니면 0. 상대 나이 조건(4세 이상 상대가 있는 레이스인지)은 호출자가 판단한다.
 */
export function wfaAllowanceLb(age: number, month: number, distance: number): number {
  const row = wfaRowMonth(month);
  if (age !== WFA_YOUNG_AGE) {
    return 0;
  }
  const values = WFA_ALLOWANCE_LB[row];
  if (values === undefined) {
    throw new RangeError(`WFA 표에 ${row}월 행이 없다`);
  }
  const value = values[wfaDistanceIndex(distance)];
  if (value === undefined) {
    throw new RangeError(`WFA 표에 거리 구간 값이 없다(${distance}m)`);
  }
  return value;
}

/**
 * 성별 감량(lb). 암말이고 open 레이스이며 핸디캡이 아니면 FEMALE_ALLOWANCE_LB, 아니면 0.
 */
export function sexAllowanceLb(horse: Pick<Horse, 'sex'>, race: Race): number {
  if (horse.sex !== 'female') return 0;
  if (race.conditions.sex !== 'open') return 0;
  if (race.kind === 'handicap' || race.conditions.weightSystem === 'handicap') return 0;
  return FEMALE_ALLOWANCE_LB;
}

/**
 * 핸디캡 부담중량. 최고 OR 말이 top(상한), 나머지는 top − (최고 OR − OR).
 * 하한은 HANDICAP_MIN_WEIGHT_LB. 입력과 같은 순서로 돌려준다.
 */
export function handicapWeights(ors: readonly number[], top: number): number[] {
  if (ors.length === 0) return [];
  const maxOr = Math.max(...ors);
  return ors.map((or) => Math.max(HANDICAP_MIN_WEIGHT_LB, top - (maxOr - or)));
}
