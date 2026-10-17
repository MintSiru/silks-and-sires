// 메뉴·설정 모달의 데이터 함수(M6-U2 A1). 순수 함수: DOM·저장소 접근 없음.
// 설정 값의 의미는 엔진과 같다: autoApproveRacePlans 가 false 면 승인제, 없거나 true 면 자동 신청.
import {
  AUTO_SELL_KEEP_RACERS, AUTO_SELL_KEEP_RACERS_IN_DEBT, AUTO_TRAINING_MIN_GRADE, AUTO_TRAINING_MIN_RACERS,
} from '../../engine/config/autoSell';
import { MATING_AUTO_BOOK_MAX_INBREEDING, MATING_AUTO_BOOK_WEEK, MATING_FIRST_SEASON_AUTO_BOOK_WEEK } from '../../engine/config/mating';
import type { GameSettings } from '../../engine/types';

/** 출주 계획 진행 방식. 라디오 두 개로만 고른다(명시적 단일 선택). */
export type RacePlanMode = 'auto' | 'approved_only';

export interface RacePlanModeOption {
  mode: RacePlanMode;
  label: string;
  hint: string;
}

export const RACE_PLAN_MODE_OPTIONS: readonly RacePlanModeOption[] = [
  {
    mode: 'auto',
    label: '조교사 제안 자동 신청',
    hint: '조교사가 제안한 출주 계획을 그 주에 자동으로 신청합니다. 빼고 싶은 계획만 말 상세에서 제외하세요.',
  },
  {
    mode: 'approved_only',
    label: '내가 승인한 계획만',
    hint: '말 상세에서 승인한 계획만 신청합니다. 검토하지 않은 제안은 그 주에 지나갑니다.',
  },
];

/** 저장된 설정 → 라디오 선택. 값이 없으면 기본(자동 신청). */
export function racePlanMode(settings: GameSettings): RacePlanMode {
  return settings.autoApproveRacePlans === false ? 'approved_only' : 'auto';
}

/** 라디오 선택 → GameSettings.autoApproveRacePlans 에 넣을 값. 'auto' 는 true 다. */
export function autoApproveFromMode(mode: RacePlanMode): boolean {
  return mode === 'auto';
}

/** 2세 자동 조교 보내기 체크 상태. 값이 없으면 켜짐(기본). */
export function autoSendToTrainingOn(settings: GameSettings): boolean {
  return settings.autoSendToTraining !== false;
}

/**
 * 2세 자동 조교 기준 한 줄(M6-B4). 상수에서 만든다. 기준이 B 면 'B 등급 이상 2세만, 현역 6두까지(빚이면 4두) …'.
 * 최소 현역 예외와 기준 미달 2세는 판매 제안으로 올라간다는 문장을 덧붙인다.
 */
export function autoTrainingGuide(): string {
  return `${AUTO_TRAINING_MIN_GRADE} 등급 이상 2세만, 현역 ${AUTO_SELL_KEEP_RACERS}두까지(빚이면 ${AUTO_SELL_KEEP_RACERS_IN_DEBT}두) 조교사에게 보냅니다. 현역이 ${AUTO_TRAINING_MIN_RACERS}두 미만이면 가장 나은 2세를 등급과 관계없이 채우고, 나머지는 판매 제안으로 올라갑니다.`;
}

/** 판매 제안 자동 위탁 체크 상태. 값이 없으면 켜짐(기본). */
export function autoSellOn(settings: GameSettings): boolean {
  return settings.autoSell !== false;
}

/** 세일 발표·거래 주 정지 체크 상태(M7-E). 값이 없으면 켜짐(기본). */
export function stopAtSalesOn(settings: GameSettings): boolean {
  return settings.stopAtSales !== false;
}

/** 교배 진행 방식 안내(조작 없음). 엔진 settings.autoApproveMatings 의 세 상태(true·false·없음)에 맞춘다. */
export function matingProgressGuide(settings: GameSettings): string {
  if (settings.autoApproveMatings === true)
    return '교배 제안은 만들자마자 예약되고 종부료가 미리 나갑니다.';
  if (settings.autoApproveMatings === false)
    return '교배 제안은 승인한 것만 예약됩니다. 번식 화면에서 승인하세요.';
  return `빼지 않은 교배 제안은 시즌 초(${MATING_AUTO_BOOK_WEEK}주차, 첫 해는 ${MATING_FIRST_SEASON_AUTO_BOOK_WEEK}주차)에 자동으로 예약됩니다. 근친 ${MATING_AUTO_BOOK_MAX_INBREEDING * 100}% 이상 배합은 승인해야 예약됩니다. 번식 화면에서 빼거나 승인할 수 있습니다.`;
}

/** 새 게임 확인 단계의 경고 문구. */
export const NEW_GAME_WARNING_KO =
  '지금 진행을 두고 새 게임을 시작합니다. 저장하지 않은 진행은 되돌릴 수 없습니다.';

/** 레이스 당일 진행 방식 선택지(M7-RD). 없으면 'brief'(기본). */
export type RaceDayModeChoice = 'brief' | 'skip';
export const RACE_DAY_MODE_OPTIONS: readonly { mode: RaceDayModeChoice; label: string; hint: string }[] = [
  {
    mode: 'brief',
    label: '출주표·작전 뒤 레이스 보기(기본)',
    hint: '내 말이 출주하는 주에 멈춰 출주표·패독·코멘트를 보고 작전을 정한 뒤 레이스를 봅니다.',
  },
  {
    mode: 'skip',
    label: '멈추지 않음(결과만 기록)',
    hint: '출주 주에도 멈추지 않고 레이스 결과만 기록합니다. 작전은 말의 선호 작전으로 나갑니다.',
  },
];

/** 레이스 당일 진행 방식. 값이 없으면 'brief'. */
export function raceDayModeOf(settings: GameSettings): RaceDayModeChoice {
  return settings.raceDayMode === 'skip' ? 'skip' : 'brief';
}
