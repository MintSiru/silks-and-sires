import type { RunningStyle } from '../types';

/** 개최당 정수 하나. 결과 시드와 같은 31비트 범위로 저장 정밀도를 보장한다. */
export const MEETING_SEED_MAX = 0x7fffffff;
/** 최근 5전과 선행형 두수 기준은 M7-RD1 명세 그대로다. */
export const RECENT_FORM_RUNS = 5;
export const FAST_PACE_FRONT_MIN = 3;
export const SLOW_PACE_FRONT_MAX = 1;
export const TACTIC_ORDER: readonly RunningStyle[] = ['front', 'prominent', 'midfield', 'held_up'];
/** 패독: 준비도 85/60, 피로 20/60을 좋은 상태/우려의 경계로 삼는다. 경미한 관찰 오차만 더한다. */
export const PADDOCK_FITNESS_GOOD = 85;
export const PADDOCK_FITNESS_LOW = 60;
export const PADDOCK_FATIGUE_GOOD = 20;
export const PADDOCK_FATIGUE_HIGH = 60;
export const PADDOCK_NOISE = 3;
/** 12주 이상 공백은 장기 휴양, 2세는 어린 말로 관찰한다. */
export const PADDOCK_LONG_BREAK_WEEKS = 12;
export const PADDOCK_YOUNG_AGE = 2;
/** 성격은 기존 단서 체계와 같은 30/70 경계. 숨은 수치 대신 행동만 묘사한다. */
export const PADDOCK_COMPOSURE_LOW = 30;
export const PADDOCK_TIMIDITY_HIGH = 70;
/** 안쪽 1/3, 바깥쪽 1/3 게이트를 코멘트·추천에 반영한다. */
export const INNER_DRAW_SHARE = 1 / 3;
export const OUTER_DRAW_SHARE = 2 / 3;
/** 경기 성적이 없는 말의 아침 시장은 중립 OR 70으로 시작한다(숨은 능력 미사용). */
export const MORNING_UNRATED_OR = 70;
/** OR 약 5lb 차이를 시장 전력 1점으로 환산해 기존 오즈 온도와 척도를 맞춘다. */
export const MORNING_OR_PER_STRENGTH = 5;
