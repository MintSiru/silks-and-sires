import type { BreederId, HorseId, JockeyId, Money, OwnerId, RaceId, SireLineId, TrainerId } from './common';
import type { Horse, HorseStatus, InjuryKind, InjuryRegion, InjuryTreatment, Mare, OffspringStats, Stallion } from './horse';
import type { CommercialBreeder, Jockey, Owner, Trainer } from './people';
import type { RaceResult } from './race';
import type { Rng, RngState } from './rng';
import type { SeasonAwards, SeasonState, SeriesId } from './season';
import type { CalendarPhaseId, GameDate, Season } from './time';
import type { EconomyState, RelationsState } from './economy';
import type { SaleEventId, SaleLotResult, SalesState } from './sales';
import type { BettingState } from './betting';
import type { StallionSaleMode, StudState, YearEndState } from './stud';
import type { FacilityKind, FarmListing, FarmSize, FarmState, GameSettings, HomeCountry } from './farm';
import type { ChronicleEntry, LegacyState, Rival, RivalReason } from './legacy';

/** 주 진행 중 발생한 사건. M3 이후 종류가 늘어난다(판별 유니온에 추가). */
export type GameEvent =
  | { type: 'week_started'; date: GameDate }
  | { type: 'new_year'; year: number }
  | { type: 'phase_started'; phase: CalendarPhaseId; date: GameDate }
  | { type: 'phase_ended'; phase: CalendarPhaseId; date: GameDate }
  | { type: 'horse_status_changed'; horseId: HorseId; from: HorseStatus; to: HorseStatus; date: GameDate }
  /** 종마·번식 암말 사망(M4-D9). 플레이어 말과 현역 실명 종마만 이벤트로 남긴다 */
  | { type: 'horse_died'; horseId: HorseId; cause: 'age' | 'accident' | 'illness'; date: GameDate }
  /** M4-D5: 첫 시즌에 저수태가 판명됨(플레이어 종마·실명 종마만 기록) */
  | { type: 'stallion_subfertile'; stallionId: HorseId; fertility: number; date: GameDate }
  /** M4-D5: 관측 수태율이 기준 미달로 연속됨 — 내 종마는 경고(은퇴는 플레이어 선택) */
  | { type: 'stallion_fertility_warning'; stallionId: HorseId; rate: number; date: GameDate }
  /** M4-D5: 저수태로 종마 은퇴(AI·실명·국내 판매 종마는 자동, 플레이어 종마는 직접 선택) */
  | { type: 'stallion_pensioned'; stallionId: HorseId; reason: 'fertility' | 'player' | 'age'; date: GameDate }
  /** 종부료 연간 재산정(M4-D8). 플레이어 종마만 이벤트로 남긴다 */
  | { type: 'stud_fee_set'; stallionId: HorseId; season: number; fee: Money; prevFee: Money; date: GameDate }
  /** M4-E0b: 목장 구매(마주 → 오너브리더 전환 또는 이전) */
  | { type: 'farm_purchased'; country: HomeCountry; size: FarmSize; price: Money; date: GameDate }
  /** 출주 계획 처리(UX1): 계획대로 신청함 / 조건이 안 맞아 건너뜀(부상·체력·맞는 레이스 없음 등) */
  | { type: 'race_plan_declared'; horseId: HorseId; raceId: RaceId; date: GameDate }
  | { type: 'race_plan_skipped'; horseId: HorseId; planId: string; reason: string; date: GameDate }
  /** M6-0b: 판매 담당이 판매 제안을 냄(count 두) */
  | { type: 'sell_proposals_ready'; count: number; date: GameDate }
  /** M5: 라이벌 지정 */
  | { type: 'rival_declared'; ownerId: OwnerId; reason: RivalReason; date: GameDate }
  /** M5: 그룹 레이스 맞대결 결과. playerAhead = 플레이어 말이 앞섬 */
  | { type: 'rival_clash'; ownerId: OwnerId; raceId: RaceId; playerAhead: boolean; date: GameDate }
  /** M5: 부계 확립(시조 종마) · 명문 모계(기초 암말) */
  | { type: 'sire_line_established'; horseId: HorseId; lineId: SireLineId; date: GameDate }
  | { type: 'female_family_established'; horseId: HorseId; date: GameDate }
  /** 예약 창이 열려 교배 담당이 번식 암말 count 두에 season 시즌 교배를 제안함(UX4) */
  | { type: 'mating_proposals_ready'; season: number; count: number; date: GameDate }
  /** 승인한 교배 제안을 예약하지 못함(UX4). reason 은 한국어 */
  | { type: 'mating_proposal_skipped'; mareId: HorseId; reason: string; date: GameDate }
  /** 플레이어 말을 NH 스토어 세일에 팔았다(M4-F1) */
  | { type: 'nh_store_sold'; horseId: HorseId; price: Money; date: GameDate }
  /** 플레이어 말 이름 등록(M4-E3). auto = 2세 조교 전까지 안 지어 자동 등록됨 */
  | { type: 'horse_named'; horseId: HorseId; name: string; auto: boolean; date: GameDate }
  /** M4-E1: 시설 업그레이드 */
  | { type: 'facility_upgraded'; facility: FacilityKind; level: number; cost: Money; date: GameDate }
  /** M4-E0: 예후불량(경주 중 치명적 부상) — 설정이 켜져 있을 때만 */
  | { type: 'horse_fatally_injured'; horseId: HorseId; raceId: string; date: GameDate }
  /** M4-D4: 플레이어 종마(또는 종마로 은퇴하는 수말) 판매 */
  | { type: 'stallion_sold'; horseId: HorseId; mode: StallionSaleMode; price: Money; nominations: number; date: GameDate }
  /** M4-D4: 임대 시작 */
  | { type: 'stallion_leased'; horseId: HorseId; kind: 'shuttle' | 'long'; returnSeason: number; rent: Money; date: GameDate }
  /** M4-D4: 임대료 수령(shuttle 은 복귀 때, long 은 시즌마다). returned = 임대가 이번으로 끝남 */
  | { type: 'stud_lease_paid'; horseId: HorseId; kind: 'shuttle' | 'long'; rent: Money; returned: boolean; date: GameDate }
  | { type: 'covering_booked'; mareId: HorseId; stallionId: HorseId; fee: Money; date: GameDate }
  | { type: 'conception'; mareId: HorseId; stallionId: HorseId; success: boolean; date: GameDate }
  | { type: 'foal_born'; foalId: HorseId; mareId: HorseId; stallionId: HorseId; date: GameDate }
  /** 레이스 종료. 그룹·리스티드 또는 플레이어 말이 나온 레이스만 이벤트로 남긴다 */
  | {
      type: 'race_run';
      raceId: string;
      meetingId: string;
      date: GameDate;
      winnerId: HorseId;
      playerHorseIds: HorseId[];
    }
  | { type: 'series_completed'; seriesId: SeriesId; horseId: HorseId; date: GameDate }
  /** 플레이어 말 부상(M3-C1). AI 말 부상은 이벤트로 남기지 않는다 */
  | { type: 'horse_injured'; horseId: HorseId; kind: InjuryKind; weeksOut: number; date: GameDate }
  /** M4-H2: 플레이어 말이 확진 전 이상 증세를 보임(종류·기간은 숨김, 부위 단서만) */
  | { type: 'injury_suspected'; horseId: HorseId; region: InjuryRegion; date: GameDate }
  /** M4-H2: 검사 또는 시간 경과로 확진 */
  | { type: 'injury_diagnosed'; horseId: HorseId; kind: InjuryKind; weeksOut: number; date: GameDate }
  /** M4-H3: 번식 암말 유산(임신 해제) */
  | { type: 'mare_lost_foal'; mareId: HorseId; date: GameDate }
  /** M4-H3: 종마·번식 암말 질환(제엽염·산통)과 결과 */
  | { type: 'stud_ailment'; horseId: HorseId; ailment: 'laminitis' | 'colic'; outcome: 'recovered' | 'retired' | 'died'; date: GameDate }
  /** M4-H2: 치료 선택(비용은 장부 vet_fee) */
  | { type: 'injury_treated'; horseId: HorseId; treatment: InjuryTreatment; cost: Money; weeksOut: number; date: GameDate }
  /** 성적으로 닉스가 확인됨(그 배합의 말이 그룹 레이스 우승, M3-C4) */
  | { type: 'nick_revealed'; sireLineId: SireLineId; damsireLineId: SireLineId; horseId: HorseId; date: GameDate }
  /** 지난 시즌 시상·순위 확정(연도 전환 때, M3-E1). 내용은 awardsHistory 의 마지막 항목 */
  | { type: 'awards_announced'; year: number; date: GameDate }
  /** 플레이어 자금 경고(M4-A3). debt_started: 캐주얼 모드에서 빚이 생김 / negative_funds: 레거시 모드 자금 마이너스(weeksLeft 주 뒤 파산) */
  | { type: 'economy_warning'; kind: 'debt_started' | 'negative_funds'; weeksLeft: number | null; date: GameDate }
  /** 레거시 모드 파산(M4-A3). 이후 진행 불가 */
  | { type: 'bankrupt'; date: GameDate }
  /** 말 소유 이전(M4-A3 AI 급매, M4-C 세일·개인 거래). price 는 유로 정수 */
  | { type: 'horse_sold'; horseId: HorseId; fromOwnerId: OwnerId; toOwnerId: OwnerId; price: Money; date: GameDate }
  /**
   * 플레이어 전속 계약 변화(M4-B3). signed: 새 계약 / renewed: 연초 갱신 / declined: 연초 갱신 거절(관계 부족)
   * / lapsed: 연초 갱신 실패(자금 부족·은퇴) / terminated: 플레이어 해지
   * / released: 연말 정산에서 플레이어가 갱신하지 않기로 함(M4-D1, 위약금·관계 변화 없음)
   */
  | {
      type: 'retainer_changed';
      kind: 'trainer' | 'jockey';
      personId: string;
      change: 'signed' | 'renewed' | 'declined' | 'lapsed' | 'terminated' | 'released';
      fee: Money;
      date: GameDate;
    }
  /** 내부거래 제안 도착(M4-C7) / 수락·만료는 change 로 구분 */
  | {
      type: 'private_offer';
      offerId: string;
      ownerId: OwnerId;
      horseId: HorseId;
      price: Money;
      change: 'offered' | 'accepted' | 'declined' | 'expired';
      date: GameDate;
    }
  /** 베팅 정산(M4-BET). outlay = 건 총액, returned = 돌려받은 총액(원금 포함) */
  | { type: 'bet_settled'; betId: string; horseId: HorseId; outlay: Money; returned: Money; date: GameDate }
  /**
   * 플레이어 종마 한 시즌 정산(M4-D3). outsideCovers = AI(가상) 교배 수, conceptions = 그중 수태 수,
   * income = 받은 종부료 합. 내용은 StudState.seasons 의 같은 기록
   */
  | {
      type: 'stud_season_settled';
      stallionId: HorseId;
      year: number;
      outsideCovers: number;
      conceptions: number;
      income: Money;
      date: GameDate;
    }
  /** 세일 카탈로그 발표(M4-C2b). lots = 로트 수 */
  | { type: 'sale_catalogue_published'; saleId: SaleEventId; year: number; lots: number; date: GameDate }
  /**
   * 플레이어가 관련된 로트 결과(M4-C4). role: buyer = 플레이어가 낙찰 / vendor = 플레이어 위탁 로트
   * / underbidder = 플레이어가 입찰했으나 낙찰 못 함
   */
  | {
      type: 'sale_lot_result';
      saleId: SaleEventId;
      year: number;
      lotNo: number;
      horseId: HorseId;
      role: 'buyer' | 'vendor' | 'underbidder';
      result: SaleLotResult;
      date: GameDate;
    };

/** 배합 관련 진행 상태 */
export interface BreedingState {
  /** 공개된 닉스 키 (breeding/nicks.ts 의 nickKey 형식) */
  revealedNicks: string[];
}

/**
 * 게임 전체 상태. JSON 직렬화 가능한 순수 데이터만 담는다(클래스·함수·Map·undefined 값 금지).
 * 정적 데이터(경마장·레이스 정의)는 ID 로만 참조한다.
 */
export interface GameState {
  /** 저장 스키마 버전 (save/ 의 CURRENT_SCHEMA_VERSION 과 같아야 함) */
  schemaVersion: number;
  /** 새 게임 생성 시드 (기록용) */
  initialSeed: number;
  /** 메인 RNG 상태. advanceWeek 가 갱신한다 */
  rng: RngState;
  /** 현재 날짜: 이번 주(아직 진행 전) */
  date: GameDate;
  season: Season;
  playerOwnerId: OwnerId;
  horses: Record<HorseId, Horse>;
  /** key = horseId */
  stallions: Record<HorseId, Stallion>;
  /** key = horseId */
  mares: Record<HorseId, Mare>;
  owners: Record<OwnerId, Owner>;
  /** 상업 생산자(M4-C0). 마주와 따로 둔다(경주에 출주하지 않음) */
  breeders: Record<BreederId, CommercialBreeder>;
  trainers: Record<TrainerId, Trainer>;
  jockeys: Record<JockeyId, Jockey>;
  breeding: BreedingState;
  /** 가상 말 ID 발급용 일련번호 (1부터) */
  nextHorseNumber: number;
  /** 완료된 레이스 결과. 보존 정책(M3): 그룹·리스티드와 플레이어 말 출주 레이스만, 최근 N 시즌(config) */
  raceResults: RaceResult[];
  /** 시즌 진행 상태(개최·시리즈·리딩·OR 이력) */
  seasonState: SeasonState;
  /** 지난 시즌들의 시상·순위 (M3-E1·E2). 오래된 순 */
  awardsHistory: SeasonAwards[];
  /** 아비 HorseId → 자마 성적 누적 (M3-C4) */
  sireStats: Record<HorseId, OffspringStats>;
  /** 최근 이벤트 로그 (최대 길이는 config 에서) */
  eventLog: GameEvent[];
  /** 경제: 모드·빚·장부·연간 요약 (M4-A) */
  economy: EconomyState;
  /** 관계·명성 (M4-B) */
  relations: RelationsState;
  /** 세일 카탈로그·위탁·입찰·결과 (M4-C) */
  sales: SalesState;
  /** 베팅(M4-BET) */
  betting: BettingState;
  /** 연말 정산(M4-D1). 새해 첫 주는 제출 전에 진행되지 않는다 */
  yearEnd: YearEndState;
  /** 플레이어 종마 사업(M4-D2·D3) */
  stud: StudState;
  /** 새 게임 설정(M4-E0). 옛 저장본은 마이그레이션 기본값 */
  settings: GameSettings;
  /** 플레이어 목장(M4-E0·E1) */
  farm: FarmState;
  /** 올해 목장 매물(M4-E0b, 마주 시작·이전용). 없으면 빈 배열 */
  farmListings: FarmListing[];
  /** 연대기(M5). 플레이어 항목 영구, 세계 항목은 최근 N 년. 없으면 빈 배열 */
  chronicle?: ChronicleEntry[];
  /** 확립 부계·명문 모계(M5). 없으면 빈 것 */
  legacy?: LegacyState;
  /** 라이벌 마주(M5). 없으면 없음 */
  rivals?: Rival[];
}

/** advanceWeek 가 각 시스템에 넘기는 문맥 */
export interface WeekContext {
  /** 진행 중인 주(아직 다음 주로 넘어가기 전) */
  date: GameDate;
  rng: Rng;
}

/**
 * 주 단위 시스템. run 은 draft(복제본)를 직접 수정해도 된다.
 * 같은 입력 + 같은 rng 상태 → 같은 결과여야 한다.
 */
export interface WeeklySystem {
  id: string;
  run(draft: GameState, ctx: WeekContext): GameEvent[];
}

export interface AdvanceResult {
  state: GameState;
  events: GameEvent[];
}

export const SAVE_FORMAT = 'silks-and-sires-save' as const;

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  /** ISO 8601. 엔진은 시계를 읽지 않으므로 호출자가 넘긴다 */
  savedAt: string;
  state: GameState;
}

export type SaveErrorCode = 'invalid_json' | 'wrong_format' | 'unsupported_version' | 'invalid_state';

export interface SaveError {
  code: SaveErrorCode;
  message: string;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: SaveError };
