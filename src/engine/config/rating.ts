/** 공식 레이팅(OR) 핸디캐퍼 밸런스 상수 (M3-C3). 코드 안에 수치를 직접 두지 않는다. */
import { HANDICAP_OR_RANGE } from './meetings';

/** 기준마로 쓰는 말의 최대 패배 마신. 이보다 크게 진 말은 승자 레벨 계산에서 뺀다 */
export const ANCHOR_MAX_BEATEN_L = 10;
/** 기준마가 이 수 이상이면 기준마 승자 레벨의 중앙값을 쓴다 */
export const MIN_ANCHORS = 2;
/** 기준마가 부족할 때 레이스 표준을 섞는 가중치(표준 1 : 기준마 1두 당) */
export const STANDARD_PRIOR_WEIGHT = 1;

/**
 * 레이스 표준 승자 레벨(OR 척도).
 * 2세 레이스(conditions.maxAge === 2)는 그룹 표준을 따로 쓴다. 메이든·노비스는 종류별 값을 쓴다.
 * 핸디캡은 그 클래스 HANDICAP_OR_RANGE 의 max − 3 (클래스 7 은 50).
 */
export const RACE_STANDARD = {
  /** 3세 이상 그룹 레이스 */
  group: { G1: 115, G2: 108, G3: 104 },
  /** 2세 그룹 레이스 */
  twoYoGroup: { G1: 105, G2: 98, G3: 94 },
  /** 리스티드 */
  listed: 98,
  /** 조건 레이스(클래스 1 이 아닌 그룹 외 조건 경주) */
  conditions: 90,
  /** 핸디캡 클래스별 */
  handicap: {
    2: HANDICAP_OR_RANGE[2].max - 3,
    3: HANDICAP_OR_RANGE[3].max - 3,
    4: HANDICAP_OR_RANGE[4].max - 3,
    5: HANDICAP_OR_RANGE[5].max - 3,
    6: HANDICAP_OR_RANGE[6].max - 3,
    7: 50,
  },
  /** 메이든 2세 (M3-F2c: 70 → 80. 2세 연말 OR 이 능력 환산보다 약 15~17 낮아 올림) */
  maidenTwoYo: 80,
  /** 메이든 3세 이상 */
  maidenOlder: 66,
  /** 노비스 */
  novice: 74,
} as const;

/** 승자 레벨 기준 상승률(1착, 기대 대비 d 에 곱함) */
export const UP_RATE_WIN = 0.7;
/** 1착이 아닌 말의 상승률(d > 0) */
export const UP_RATE = 0.5;
/**
 * 하락률(d < 0). M3-F2c: 0.25 → 0.13. M3-F2c2: 0.13 → 0.18 (성장 보정 도입 후 3세 갭 확보와 5세 과대평가를 맞바꾼 재조정).
 * F2c 시점: 0.25 에서는 4세 이상 평균 OR 이 연간 −2.9 ~ −4.5 내려갔다(PR 이 OR 보다 낮은 구조적 편향). 0.13 에서 연간 +0.6 ~ +1.2.
 * F2c2 시점: 0.18 에서 4세 연말 gap 이 −2.3 ~ −6.1, 5세 gap 이 +4.9 ~ +7.7. 근거는 docs/reports/2026-10-12-m3-f2c-rating.md F2c2 절.
 */
export const DOWN_RATE = 0.18;

/** 한 번에 오를 수 있는 최대 폭 */
export const MAX_RISE = 12;
/** 한 번에 내려갈 수 있는 최대 폭 */
export const MAX_DROP = 5;
/** 핸디캡 우승마의 최소 상승 폭(d ≤ 0 이어도 적용) */
export const HANDICAP_WIN_MIN_RISE = 2;

/** 이보다 크게 진 말은 OR 을 내리지 않는다(사고·불운으로 본다) */
export const NO_DROP_BEATEN_L = 20;

/** 첫 OR 에 필요한 출주 수(우승하면 그 즉시 붙는다) */
export const FIRST_OR_RUNS = 3;
/** 첫 OR = 최고 PR N 개 평균(반올림) */
export const FIRST_OR_TOP_N = 2;

/** 말별 OR 변동 이력 최대 보관 건수 */
export const RATING_HISTORY_MAX = 12;

/**
 * 성장 보정 대상 최대 나이(그해 나이 기준, M3-F2c2). 이 나이 이하의 말만 레이스 전 OR 에 성장분을 더한다.
 * 4세 이상은 바뀌지 않는다.
 */
export const PROGRESSION_MAX_AGE = 3;
/**
 * 나이별 주당 OR 성장 보정(lb, M3-F2c2). 키는 그해 나이. 여기 없는 나이는 보정 없음.
 * 보정량 = round(주당 값 × min(지난 OR 변경 이후 주 수, PROGRESSION_MAX_WEEKS)).
 */
export const PROGRESSION_LB_PER_WEEK: Readonly<Record<number, number>> = { 2: 0.27, 3: 0.55 };
/** 성장 보정에 쓰는 지난 OR 변경 이후 최대 주 수(M3-F2c2) */
export const PROGRESSION_MAX_WEEKS = 13;
