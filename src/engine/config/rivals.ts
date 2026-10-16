/**
 * M5-D 라이벌 마주 밸런스 상수. 설계: docs/m5-plan.md 결정 4·5. 초기값이며 Opus 가 조정한다.
 * 경쟁심(intensity)은 0~100 척도. 근거는 각 상수 옆 주석.
 */

/** 동시에 활성인 라이벌 최대 수. 근거: 라이벌 긴장감은 주고, 세일·출주 가중이 한두 마주에 몰리지 않게 한다 */
export const RIVAL_MAX_ACTIVE = 2;

/** 세일에서 플레이어 입찰 상한이 이 금액(€) 이상이었다가 진 로트의 낙찰 마주가 'sale_battle' 후보.
 * 근거: 중급 이상 세일 로트에서만 마주 간 경합이 의미 있다(소형 1세마 가격대 제외) */
export const RIVAL_SALE_BATTLE_MIN = 50_000;

/** 지정 직후 경쟁심. 근거: 중간 정도에서 시작해 맞대결 몇 번으로 활성 유지 여부가 갈리게 한다 */
export const RIVAL_INTENSITY_START = 40;

/** 경쟁심 상한 */
export const RIVAL_INTENSITY_MAX = 100;

/** 맞대결(그룹 레이스 착순 비교)·세일 경합 재확인마다 오르는 경쟁심. 근거: 여섯 번 안팎 맞대결이면 상한 근처 */
export const RIVAL_INTENSITY_CLASH = 8;

/** 해마다 연초에 줄어드는 경쟁심. 근거: 맞대결이 없으면 대략 3년 안에 지난 라이벌이 된다(40 → 25 → 10 → 0) */
export const RIVAL_INTENSITY_DECAY = 15;

/** 연초 감소·선정 판정을 하는 주(게임 달력 1주). 연초 1주에만 선정과 연간 감소를 한다 */
export const RIVAL_YEARLY_WEEK = 1;

/** D2 사용: 세일에서 플레이어가 최대 입찰을 건 로트의 라이벌 AI 입찰 상한 가중.
 * 상한 × (1 + intensity / 100 × 이 값). 근거: 최대 +25% 정도로 작게 */
export const RIVAL_BID_BOOST = 0.25;

/** D2 사용: 대레이스(G1)에서 라이벌의 상위 말이 플레이어 말이 신청한 레이스로 출주할 확률 가중.
 * 기존 출주 판단 확률 × (1 + intensity / 100 × 이 값). 근거: 작게(최대 +30%) */
export const RIVAL_BIG_RACE_ENTRY_WEIGHT = 0.3;

/** 선정 가중: 플레이어와 같은 나라 마주의 배율(다른 나라 = 1). 같은 나라를 우선하되 배타적이지는 않다 */
export const RIVAL_SAME_COUNTRY_WEIGHT = 3;

/** 선정 가중: 마주 등급 순위. 차이 1당 가중이 나뉜다(1 + 차이) */
export const RIVAL_TIER_RANK = { small: 0, mid: 1, major: 2 } as const;

/** 선정 가중: 보유 현역마 수와 누적 상금 차이를 로그 척도로 비교할 때의 상금 단위(€). 근거: 10만 € 차이 = 로그 1 */
export const RIVAL_PRIZE_UNIT = 100_000;
