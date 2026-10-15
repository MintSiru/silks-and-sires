/**
 * 베팅·스폰서(M4-BET). 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지.
 * 사용자 결정(2026-10-15): 단승(win)·연승(each-way)만, 유럽식 분수 오즈, 누구 말에든 걸 수 있고 레이스당 상한.
 * 원칙 1: 베팅 회사·스폰서 이름은 전부 가상.
 */
import type { HorseId, Money, RaceId } from './common';
import type { FractionalOdds } from './race';
import type { GameDate } from './time';

export type BookmakerId = string;
export type SponsorId = string;

/** 가상 베팅 회사(data/betting/bookmakers.json) */
export interface BookmakerDef {
  id: BookmakerId;
  /** 가상 회사명. 스폰서 레이스명에도 쓴다 */
  name: string;
  /** 스폰서 레이스명에 붙는 짧은 이름(없으면 name) */
  shortName: string | null;
}

/**
 * 스폰서 레이스(data/calendar/sponsorships.json). 기존 레이스 템플릿 이름 앞에 스폰서 이름을 붙이고 상금을 올린다.
 * 스폰서는 베팅 회사 또는 세일 회사(SaleCompanyDef.id)다.
 */
export interface SponsorshipDef {
  templateId: RaceId;
  sponsor: { kind: 'bookmaker'; id: BookmakerId } | { kind: 'sale_company'; id: string };
  /** 표시 이름 형식. '{sponsor}' 와 '{race}' 자리표시자(예: '{sponsor} {race}', '{sponsor} Gold Cup') */
  nameFormat: string;
  /** 상금 배수(예 1.2). 1 이상 */
  prizeMultiplier: number;
}

export interface SponsorshipsDataFile {
  version: number;
  sponsorships: SponsorshipDef[];
}

export interface BookmakersDataFile {
  version: number;
  bookmakers: BookmakerDef[];
}

/** win: 단승 / each_way: 단승 반 + 연승 반(스테이크 = 한쪽 금액, 총액은 2배) */
export type BetKind = 'win' | 'each_way';

/** 걸어 둔 베팅(개최 전·경주 전). 정산은 경주 확정 오즈(SP)로 한다 */
export interface Bet {
  /** `bet_${연도}_${일련}` */
  id: string;
  bookmakerId: BookmakerId;
  meetingId: string;
  raceId: RaceId;
  horseId: HorseId;
  kind: BetKind;
  /** 한쪽 금액(€, 정수). each_way 면 총 지출 = stake × 2 */
  stake: Money;
  placed: GameDate;
}

/** 정산된 베팅(최근 기록) */
export interface SettledBet extends Bet {
  /** 확정 오즈(SP). 말이 빠졌으면 null(환불) */
  startingPrice: FractionalOdds | null;
  /** 착순(빠졌으면 null) */
  position: number | null;
  /** 연승 조건: 입상 자리 수·배당 분수(each_way 만) */
  placeTerms: { places: number; fraction: number } | null;
  /** 돌려받은 총액(€, 원금 포함). 0 = 전액 손실 */
  returned: Money;
  settled: GameDate;
}

/** GameState.betting */
export interface BettingState {
  open: Bet[];
  /** 최근 정산 기록(보존 BET_HISTORY_LIMIT 건) */
  history: SettledBet[];
  nextBetNo: number;
}
