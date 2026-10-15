import type { BreederId, HorseId, JockeyId, Money, OwnerId, SireLineId, TrainerId } from './common';
import type { Horse, HorseStatus, InjuryKind, Mare, OffspringStats, Stallion } from './horse';
import type { CommercialBreeder, Jockey, Owner, Trainer } from './people';
import type { RaceResult } from './race';
import type { Rng, RngState } from './rng';
import type { SeasonAwards, SeasonState, SeriesId } from './season';
import type { CalendarPhaseId, GameDate, Season } from './time';
import type { EconomyState, RelationsState } from './economy';
import type { SaleEventId, SaleLotResult, SalesState } from './sales';
import type { BettingState } from './betting';
import type { StudState, YearEndState } from './stud';

/** 주 진행 중 발생한 사건. M3 이후 종류가 늘어난다(판별 유니온에 추가). */
export type GameEvent =
  | { type: 'week_started'; date: GameDate }
  | { type: 'new_year'; year: number }
  | { type: 'phase_started'; phase: CalendarPhaseId; date: GameDate }
  | { type: 'phase_ended'; phase: CalendarPhaseId; date: GameDate }
  | { type: 'horse_status_changed'; horseId: HorseId; from: HorseStatus; to: HorseStatus; date: GameDate }
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
