/** 경제·관계 밸런스 상수 (M4). 초기값이며 Opus 가 조정한다. */
import type { EconomyMode } from '../types';

/** 새 게임 기본 경제 모드 */
export const DEFAULT_ECONOMY_MODE: EconomyMode = 'casual';
/** 새 게임 플레이어 명성(0~100) */
export const STARTING_REPUTATION = 10;
/** 플레이어 장부 보존 기간(주). 이보다 오래된 항목은 prunePlayerLedger 가 지운다 */
export const PLAYER_LEDGER_KEEP_WEEKS = 104;
