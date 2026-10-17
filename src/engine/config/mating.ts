/** 보통 암말도 저가 종마를 고를 수 있고, 최상급 암말은 상위 시장까지 닿도록 로그 보간한다. */
export const MATING_FEE_MIN = 2_000;
export const MATING_FEE_MAX = 150_000;
export const MATING_QUALITY_MAX = 100;
/** 최고 OR 40~120을 정규화. 미출주 암말은 혈통·산자·나이만으로도 예산을 갖는다. */
export const MATING_OR_MIN = 40;
export const MATING_OR_MAX = 120;
/** 초기 미출주 암말도 기존 최저 종부료 €6,000 시장에 접근하도록 보수적인 OR 65를 기준으로 둔다. */
export const MATING_UNRATED_OR = 65;
export const MATING_QUALITY_WEIGHTS = { rating: 0.55, produce: 0.25, family: 0.1, fertility: 0.1 } as const;
export const MATING_PRODUCE_TARGET = 3;
/** 외부 종마 편중을 막되 자기 종마 활용은 제한하지 않는다. */
export const MATING_MAX_PER_STALLION = 2;
export const MATING_ALTERNATIVES = 2;
/** 3×3 이하 근친 또는 지배 교차 혈량 합 18.75% 초과는 자동 추천하지 않는다. */
export const MATING_MAX_BLOOD_PERCENT = 18.75;
export const MATING_CLOSE_GENERATION = 3;
/** 공개 종부료·산자 성적을 중심으로, 니크와 모계 거리 보완을 보조 근거로 쓴다. */
export const MATING_SCORE_WEIGHTS = { level: 40, nick: 15, distance: 15, fertility: 10, efficiency: 10, own: 3 } as const;
export const MATING_SIRE_FEE_WEIGHT = 0.7;
export const MATING_SIRE_PRODUCE_WEIGHT = 0.3;
/** 거리 보완 가점 1, 양쪽 cup 감점 -1, 같은 역할은 0. */
export const MATING_DISTANCE_COMPLEMENT = 1;
export const MATING_DISTANCE_CUP_PENALTY = -1;
/** 기본 진행 방식에서 검토하지 않은 제안을 예약하는 주(시즌 해). 연말 정산으로 새로 번식 암말이 된 말도 1주에 제안이 생겨 한 주 검토할 수 있다 */
export const MATING_AUTO_BOOK_WEEK = 2;
/**
 * 게임을 시작한 해(첫 시즌)의 자동 예약 주. 플레이 테스트 B9: 1월 2주는 제안을 보기 전에 예약돼 버렸다.
 * 시작 뒤 4주 이상 검토할 시간을 준다(M7-C3).
 */
export const MATING_FIRST_SEASON_AUTO_BOOK_WEEK = 6;
/**
 * 예상 자마 근친 계수(혈량 비율, 12.5% = 0.125)가 이 값 이상인 제안은 자동 예약하지 않고 플레이어 승인을 기다린다.
 * 즉시 예약(autoApproveMatings: true) 설정에서도 같은 규칙이다(M7-C3).
 */
export const MATING_AUTO_BOOK_MAX_INBREEDING = 0.125;
