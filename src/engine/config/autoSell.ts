/**
 * 판매 담당(자동 판매 제안·세일 위탁, M6-0b) 밸런스 상수. 초기값이며 30년 측정(M6-0b-30year)으로 Opus 가 조정한다.
 * 근거: docs/reports/M6-0-30year.md — 무입력 30년에서 생산마가 팔리지 않아 빚이 쌓이고 2045년 이후 현역이 0두가 되었다.
 * 판매 기준은 플레이어가 볼 수 있는 정보(평가 등급·OR·입상·종부료·나이·성별)만 쓴다.
 * 숨은 능력치는 가치 추정(valueLot, 유보가 계산)에서만 쓴다.
 */
import type { Grade } from '../types';

/** 현역 핵심 두수(목표). 현역이 이 두수 이하면 현역 판매 제안을 내지 않는다. 시작 현역 2~3두 규모에서 키울 수 있는 상한 근처 */
export const AUTO_SELL_KEEP_RACERS = 6;
/** 빚이 있을 때 현역 핵심 두수. 조교료·유지비 부담을 줄이려고 더 많이 내놓는다 */
export const AUTO_SELL_KEEP_RACERS_IN_DEBT = 4;
/** 유보가 = 가치 추정 × 이 값. 헐값 낙찰을 막는 하한(명세 범위 1) */
export const AUTO_SELL_RESERVE_RATIO = 0.7;
/** 제안을 내는 시점: 위탁 마감(세일 발표 주)까지 남은 주 수. 플레이어가 뺄 검토 기간을 준다 */
export const AUTO_SELL_PROPOSE_WEEKS_BEFORE = 4;
/** 한 해 최대 제안 두수. 판매 담당이 한 해에 과하게 내놓지 않도록 막는 상한(빼거나 실패한 제안도 센다) */
export const AUTO_SELL_MAX_PER_YEAR = 8;
/** 1세 판매 기준: 같은 세일 후보 중 평가 하위 비율(내림). 나머지는 남긴다 */
export const AUTO_SELL_YOUNG_BOTTOM_SHARE = 0.5;
/** 빚이 있을 때 1세·브리즈업(2세) 하위 비율. 판매 강도를 올린다 */
export const AUTO_SELL_YOUNG_BOTTOM_SHARE_IN_DEBT = 0.7;
/** 현역 판매 기준: 최소 나이(세). 세일 종류 판정(SALE_HIT_MIN_AGE)과 같은 값을 명시해 둔다 */
export const AUTO_SELL_RACE_MIN_AGE = 3;
/** 평가 상위 보존: 종합 평가가 이 등급이면 우수마로 남긴다 */
export const AUTO_SELL_PROTECT_GRADES: readonly Grade[] = ['S', 'A'];
/** 공식 레이팅 보존: OR 이 이 값 이상이면 우수마로 남긴다(OR 40~120 척도의 상위권) */
export const AUTO_SELL_PROTECT_OR = 90;
/** 혈통 가치 보존: 부(父) 종부료가 이 값(€) 이상이면 우수 혈통으로 남긴다 */
export const AUTO_SELL_PROTECT_SIRE_FEE = 100_000;
/** 성적 부진 기준: 출주 이 횟수 이상이고 무승이면 현역 하위 정렬에서 OR 을 아래 값만큼 낮게 친다 */
export const AUTO_SELL_POOR_MIN_STARTS = 5;
export const AUTO_SELL_POOR_FORM_PENALTY = 5;

/**
 * 2세 자동 조교 기준(M6-B4): 플레이어용 종합 등급(assessForPlayer)이 이 등급 이상인 2세만 자동으로 조교사에게 보낸다.
 * 근거: docs/reports/M6-B3-fixed-costs.md — 무입력 보통 난이도에서 수준 낮은 2세까지 모두 보내 조교료(연 13만~15만)가 상금보다 컸다.
 * 기준 미달 2세는 판매 담당(브리즈업 세일 판매 제안)이 맡는다.
 * 측정(M6-B4, 시드 20261011 무입력 보통 10년): C 는 2034년 빚 발생(끝 빚 231,010), B 는 빚 없음(끝 자금 324,002).
 * 단 B 만으로는 2031·2032년 연말 현역 0두라 아래 최소 현역 규칙을 함께 둔다(M6-B4 보고 참고).
 */
export const AUTO_TRAINING_MIN_GRADE: Grade = 'B';

/** 최소 현역(M6-B4): 현역(조교 중·휴양 중)이 이 두수보다 적으면 기준 미달 2세도 등급 높은 순으로 자동 조교에 보낸다(M6-0b 현역 1두 이상 기준) */
export const AUTO_TRAINING_MIN_RACERS = 1;
