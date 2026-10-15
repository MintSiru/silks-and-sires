/**
 * 연말 정산·종마 사업(M4-D). 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지.
 * 사용자 결정(2026-10-15): 연말 정산 화면은 의무(새해 첫 주를 진행하기 전에 반드시 제출),
 * 대상은 플레이어 현역마 전부, 나이 상한은 AI 와 같음(수말·암말 8세, 거세마 10세),
 * 기본 종마사 1칸(E1 시설로 늘린다), G1 종마 연 종부 수입 ≈ 현역 상금 총액의 2~4배.
 * 설계: docs/m4-stud-design.md
 */
import type { HorseId, Money } from './common';

/**
 * 현역마 한 두의 연말 진로.
 * continue: 현역 속행 / geld: 거세 후 현역 속행(장애물 전향은 M4-F1) /
 * stud: 내 목장 종마사에 계류(거세 안 한 수말, 빈 칸 필요) / broodmare: 내 번식 암말(암말) /
 * retire: 은퇴 — 목장을 떠난다(소유 해제, 유지비 없음)
 */
export type YearEndChoice = 'continue' | 'geld' | 'stud' | 'broodmare' | 'retire';

export interface YearEndHorseDecision {
  horseId: HorseId;
  choice: YearEndChoice;
}

/** 이번 연초에 갱신 판정할 전속 계약에 대한 플레이어 선택. renew=false 면 갱신하지 않고 끝낸다 */
export interface YearEndRetainerDecision {
  kind: 'trainer' | 'jockey';
  personId: string;
  renew: boolean;
}

/** 연말 정산 제출 내용. year = 맞이하는 새해(state.date.year) */
export interface YearEndSubmission {
  year: number;
  horses: YearEndHorseDecision[];
  retainers: YearEndRetainerDecision[];
}

/** GameState.yearEnd */
export interface YearEndState {
  /** 마지막으로 연말 정산을 제출한 해(맞이한 새해). 새 게임·옛 저장본은 시작 연도 */
  lastSubmittedYear: number;
  /** 이번 연초 갱신에서 플레이어가 끝내기로 한 계약('kind:personId'). 계약 시스템이 갱신 판정 때 읽고 비운다 */
  declinedRenewals: string[];
}

/** GameState.stud — 플레이어 종마 사업 */
export interface StudState {
  /** 종마사 칸 수(기본 1, E1 시설로 늘어난다). 플레이어 소유 계류 종마 수 ≤ slots */
  slots: number;
  /** 시즌별 플레이어 종마 장부(최근 기록). D3 에서 채운다 */
  seasons: StudSeasonRecord[];
}

/** 플레이어 종마 한 두의 한 시즌 기록(D3) */
export interface StudSeasonRecord {
  stallionId: HorseId;
  year: number;
  fee: Money;
  /** AI 암말 교배 수(플레이어 암말 제외) */
  outsideCovers: number;
  /** 플레이어 암말 교배 수 */
  ownCovers: number;
  /** 수태 수(외부 + 자기) */
  conceptions: number;
  /** 받은 종부료 합(외부 암말 수태분) */
  income: Money;
}
