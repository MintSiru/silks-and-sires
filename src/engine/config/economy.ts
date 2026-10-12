/** 경제·관계 밸런스 상수 (M4). 초기값이며 Opus 가 조정한다. */
import type { CountryCode, EconomyMode, HorseStatus, Money } from '../types';

/** 새 게임 기본 경제 모드 */
export const DEFAULT_ECONOMY_MODE: EconomyMode = 'casual';
/** 새 게임 플레이어 명성(0~100) */
export const STARTING_REPUTATION = 10;
/** 플레이어 장부 보존 기간(주). 이보다 오래된 항목은 prunePlayerLedger 가 지운다 */
export const PLAYER_LEDGER_KEEP_WEEKS = 104;

/** 캐주얼 모드: 빚 이자(주당, 빚 잔액에 곱해 반올림). 빚이 있는 주마다 붙는다 */
export const DEBT_INTEREST_WEEKLY = 0.001;
/** 캐주얼 모드: 자금이 이 액수를 넘으면 넘는 만큼 빚을 자동 상환한다(이 액수는 남긴다) */
export const DEBT_REPAY_BUFFER = 50_000;
/** 레거시 모드: 자금 마이너스가 이 주 연속이면 파산한다 */
export const LEGACY_BANKRUPT_WEEKS = 12;
/** 레거시 모드: 자금 마이너스 첫 주 경고 뒤, 이 간격(주)마다 경고를 다시 낸다 */
export const LEGACY_WARNING_INTERVAL_WEEKS = 4;

/** AI 급매 최저가(€) */
export const DISTRESS_PRICE_MIN = 10_000;
/** AI 급매 가격 기준 평가값(OR): 이 값 이하의 말은 최저가 */
export const DISTRESS_PRICE_BASE_OR = 40;
/** AI 급매 가격: 기준 평가값을 넘는 1점당 가격(€) */
export const DISTRESS_PRICE_PER_OR = 1_500;

/** 목장 유지비: 상태별 두당 주간 비용(€). 여기 없는 상태(현역·dead·historical 등)는 목장 유지비가 없다 */
export const FARM_UPKEEP: Readonly<Partial<Record<HorseStatus, Money>>> = {
  broodmare: 200,
  foal: 60,
  weanling: 100,
  yearling: 120,
  stud: 350,
  retired: 40,
};
/** 목장 두수 체증: 이 두수까지는 가산이 없다 */
export const FARM_SCALE_FREE_HEADS = 12;
/** 목장 두수 체증: 넘는 두수 1두마다 목장 유지비 전체에 더하는 비율 */
export const FARM_SCALE_STEP = 0.01;
/** 목장 두수 체증 상한(가산 비율) */
export const FARM_SCALE_MAX = 0.5;

/** 등록료: 레이스 총상금 × 이 비율 (출주마마다) */
export const ENTRY_FEE_SHARE = 0.01;
/** 등록료 최소액(€) */
export const ENTRY_FEE_MIN = 40;

/** 운송비(€, 출주마마다): 경마장 나라 ≠ 조교사 나라일 때 */
export const TRANSPORT_FEE = { near: 1500, far: 3500 } as const;
/** 근거리 운송 쌍(순서 무관). 이 밖의 다른 나라 쌍은 far */
export const TRANSPORT_NEAR_PAIRS: readonly (readonly [CountryCode, CountryCode])[] = [['GB', 'IE']];
