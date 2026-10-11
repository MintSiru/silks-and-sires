import type { HorseId, JockeyId, Money, OwnerId, TrainerId } from './common';
import type { Horse, HorseStatus, Mare, Stallion } from './horse';
import type { Jockey, Owner, Trainer } from './people';
import type { RaceResult } from './race';
import type { Rng, RngState } from './rng';
import type { SeasonState, SeriesId } from './season';
import type { CalendarPhaseId, GameDate, Season } from './time';

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
  | { type: 'series_completed'; seriesId: SeriesId; horseId: HorseId; date: GameDate };

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
  trainers: Record<TrainerId, Trainer>;
  jockeys: Record<JockeyId, Jockey>;
  breeding: BreedingState;
  /** 가상 말 ID 발급용 일련번호 (1부터) */
  nextHorseNumber: number;
  /** 완료된 레이스 결과. 보존 정책(M3): 그룹·리스티드와 플레이어 말 출주 레이스만, 최근 N 시즌(config) */
  raceResults: RaceResult[];
  /** 시즌 진행 상태(개최·시리즈·리딩·OR 이력) */
  seasonState: SeasonState;
  /** 최근 이벤트 로그 (최대 길이는 config 에서) */
  eventLog: GameEvent[];
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
