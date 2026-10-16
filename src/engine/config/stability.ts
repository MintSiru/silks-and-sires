import { BREEDER_FUNDS_RANGE } from './breeders';
import { OWNER_FUNDS_RANGE } from './people';

/**
 * M4-G2: G1에서 AI 세일 지출 약 101M€/년이 생산자에 쌓였다.
 * 경마 밖 자산의 출자·배당과 생산·운영비를 연말 평균 회귀로 추상화한다.
 * 초기 등급별 자금 범위의 중간값이 목표. 매년 격차의 절반을 정산하면
 * 지속 수입·지출에도 유한한 평형에 수렴한다(공용 난수 미사용).
 */
export const CAPITAL_REVERSION_RATE = 0.5;
export const OWNER_CAPITAL_RANGE = OWNER_FUNDS_RANGE;
export const BREEDER_CAPITAL_RANGE = BREEDER_FUNDS_RANGE;

/** AI 은퇴·사망 기록은 최소 3년 보존. 참조되는 말은 기간과 무관하게 보존한다. */
export const AI_TERMINAL_KEEP_YEARS = 3;
/** 혈통표·배합에서 사용하는 5대 조상까지 보호한다. */
export const PEDIGREE_KEEP_GENERATIONS = 5;
