/**
 * 연말 정산·종마 사업(M4-D). 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지.
 * 사용자 결정(2026-10-15): 연말 정산 화면은 의무(새해 첫 주를 진행하기 전에 반드시 제출),
 * 대상은 플레이어 현역마 전부, 나이 상한은 AI 와 같음(수말·암말 8세, 거세마 10세),
 * 기본 종마사 1칸(E1 시설로 늘린다), G1 종마 연 종부 수입 ≈ 현역 상금 총액의 2~4배.
 * 설계: docs/m4-stud-design.md
 */

import type { StudRole } from './bloodline';
import type { BreederId, HorseId, Money } from './common';

/**
 * 현역마 한 두의 연말 진로.
 * continue: 현역 속행 / geld: 거세 후 현역 속행(장애물 전향은 M4-F1) /
 * stud: 내 목장 종마사에 계류(거세 안 한 수말, 빈 칸 필요) / broodmare: 내 번식 암말(암말) /
 * retire: 은퇴 — 목장을 떠난다(소유 해제, 유지비 없음) /
 * sell_domestic: 국내 스터드에 종마로 판매(M4-D4, 같은 나라 상업 생산자 소유 종마가 된다) /
 * sell_overseas: 해외 스터드에 종마로 판매(M4-D4, 세계에서 빠진다)
 */
export type YearEndChoice = 'continue' | 'geld' | 'stud' | 'broodmare' | 'retire'
  | 'sell_domestic' | 'sell_overseas';

export interface YearEndHorseDecision {
  horseId: HorseId;
  choice: YearEndChoice;
  /** stud 일 때만: 종마 역할(M4-F1, 없으면 'flat') */
  studRole?: StudRole;
  /** sell_domestic 일 때만: 매 시즌 남겨 둘 무료 교배권 수(0~2, 없으면 0) */
  nominations?: number;
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
  /** 판매한 종마에 남겨 둔 교배권(M4-D4) */
  nominations: NominationRight[];
  /** 진행 중인 임대(M4-D4). 끝나면 지운다 */
  leases: StudLease[];
  /** 종마 판매 기록(M4-D4, 최근 기록) */
  sales: StallionSaleRecord[];
  /** 교배 담당의 교배 제안(UX4). 현재·다음 예약 시즌 것만 남긴다. 없으면 키 생략(옛 저장본 호환) */
  matingProposals?: MatingProposal[];
}

/** 종마 판매 방식(M4-D4). domestic: 국내 스터드(세계에 남음) / overseas: 해외 스터드(세계에서 빠짐) */
export type StallionSaleMode = 'domestic' | 'overseas';

/**
 * 국내 판매 때 남겨 둔 무료 교배권(M4-D4). 종마가 살아 있고 계류 중인 동안 매 시즌 perSeason 개.
 * 내 암말을 그 종마에 예약할 때 남은 교배권이 있으면 종부료 없이 자동으로 쓴다.
 */
export interface NominationRight {
  stallionId: HorseId;
  /** 시즌당 교배권 수(1~2) */
  perSeason: number;
  /** used 를 센 시즌(예약 시즌). 다른 시즌이면 used 는 0 으로 본다 */
  season: number;
  /** 그 시즌에 쓴 수 */
  used: number;
}

/**
 * 종마 임대(M4-D4).
 * shuttle: 북반구 시즌 뒤 남반구로 보냈다가 다음 시즌 전에 돌아온다. 북반구 북에는 영향 없음, 돌아올 때 임대료 1회.
 * long: 여러 해 해외 임대. startSeason ~ returnSeason − 1 시즌은 북반구 북이 없고, 그 시즌마다 연 임대료.
 */
export interface StudLease {
  stallionId: HorseId;
  kind: 'shuttle' | 'long';
  /** 임대를 맺은 해 */
  year: number;
  /** 다시 북반구에서 교배하는 첫 시즌(shuttle 은 year + 1) */
  returnSeason: number;
  /** 한 번(shuttle) 또는 한 해(long)에 받는 임대료. 맺을 때의 종부료로 정한다 */
  rent: Money;
  /** 임대료를 이미 받은 시즌 수(long 진행 추적, shuttle 은 0 → 1) */
  paidSeasons: number;
}

/** 종마 판매 기록(M4-D4) */
export interface StallionSaleRecord {
  stallionId: HorseId;
  year: number;
  mode: StallionSaleMode;
  price: Money;
  /** 국내 판매의 사는 쪽 가상 상업 생산자(해외 판매는 null) */
  buyerId: BreederId | null;
  /** 남긴 시즌당 교배권 수 */
  nominations: number;
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

/** 교배 제안 상태(UX4). proposed: 검토 대기 / approved: 승인(예약 시도 전) / booked: 예약 완료 / skipped: 안 함·실패·지나감 */
export type MatingProposalStatus = 'proposed' | 'approved' | 'booked' | 'skipped';

/** 교배 담당(목장 매니저)이 플레이어 번식 암말 한 두에 낸 한 시즌 교배 제안(UX4) */
export interface MatingProposal {
  mareId: HorseId;
  /** 예약 시즌(bookingSeasonOf) */
  season: number;
  /** 1순위 종마 */
  stallionId: HorseId;
  /** 대안 종마(최대 2두). 1순위가 북 마감·자금 부족이면 차례로 시도한다 */
  alternatives: HorseId[];
  /** 제안 시점 1순위 예상 종부료(교배권·자기 종마는 0) */
  expectedFee: Money;
  /** 이유 한 줄(한국어) 또는 skipped 사유 */
  note: string;
  status: MatingProposalStatus;
  /** booked 일 때 실제 예약한 종마 */
  bookedStallionId?: HorseId;
}
