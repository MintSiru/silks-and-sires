/** 연간 시상·순위 밸런스 상수 (M3-E1b). 코드 안에 수치를 직접 두지 않는다. */
import type { RaceGrade } from '../types';

// ── The Racing Ledger (150 척도) ─────────────────────────────────────
/** 출주 한 번뿐인 말의 기준 PR 감점(base = PR − 감점) */
export const LEDGER_SINGLE_RUN_PENALTY = 2;
/** 기준 PR 평균에 쓰는 상위 출주 수 */
export const LEDGER_TOP_RUNS = 2;
/** 보너스 시작선: base 가 이 값을 넘는 만큼 보너스가 붙는다 */
export const LEDGER_PIVOT = 100;
/** 보너스 비율(base − PIVOT 에 곱함) */
export const LEDGER_TOP_BONUS_RATE = 0.35;
/** 보너스 상한 */
export const LEDGER_TOP_BONUS_MAX = 10;
/** Ledger 레이팅 상한 */
export const LEDGER_MAX = 150;
/** Ledger 목록 크기 */
export const LEDGER_LIST_SIZE = 50;

// ── Global Turf Rankings (OR 척도 시즌 최고 퍼포먼스) ──────────────────
/** Global 목록 크기 */
export const GLOBAL_LIST_SIZE = 50;

// ── Laurel Racing Awards (시상식형 부문) ────────────────────────────
/** 심사위원 점수에서 Ledger 레이팅이 차지하는 가중치 */
export const LAUREL_JURY_WEIGHT = 0.6;
/** 심사위원 표 잡음 표준편차(점수 단위) */
export const LAUREL_JURY_SD = 3;

/** 경주 점수표: 그룹·리스티드 착순별 점수. 여기 없는 착순은 0점 */
export const LAUREL_RUN_SCORES: readonly { readonly grade: RaceGrade; readonly position: number; readonly score: number }[] = [
  { grade: 'G1', position: 1, score: 30 },
  { grade: 'G1', position: 2, score: 12 },
  { grade: 'G1', position: 3, score: 8 },
  { grade: 'G2', position: 1, score: 15 },
  { grade: 'G2', position: 2, score: 6 },
  { grade: 'G3', position: 1, score: 10 },
  { grade: 'L', position: 1, score: 5 },
];

/** '그룹' 등급(리스티드 'L' 제외). 그룹 1승·그룹 입상 판정에 쓴다 */
export const LAUREL_GROUP_GRADES: readonly RaceGrade[] = ['G1', 'G2', 'G3'];

/** 올해의 말 자격: 그룹 1승 이상 */
export const LAUREL_HOY_MIN_GROUP_WINS = 1;
/** 고령마 부문 최소 나이(연도 차) */
export const LAUREL_OLDER_MIN_AGE = 4;
/** 2세 부문 나이 */
export const LAUREL_TWO_YO_AGE = 2;
/** 3세 부문 나이 */
export const LAUREL_THREE_YO_AGE = 3;

/** 스테이어: 이 거리(m) 이상 */
export const STAYER_MIN_DISTANCE = 2800;
/** 스프린터: 이 거리(m) 이하 */
export const SPRINTER_MAX_DISTANCE = 1300;
/** 거리 부문 자격: 그룹·리스티드 출주 중 해당 거리 비율의 하한(절반 이상) */
export const DISTANCE_CATEGORY_MIN_SHARE = 0.5;

// ── 리딩 ────────────────────────────────────────────────────────────
/** 리딩 상위 목록 크기(카테고리별) */
export const LEADING_TOP_N = 20;
