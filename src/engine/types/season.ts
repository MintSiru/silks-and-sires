import type { HorseId, JockeyId, Money, OwnerId, RaceId, RacecourseId, TrainerId } from './common';
import type { Going } from './going';
import type { Race } from './race';
import type { GameDate } from './time';

/**
 * 정적 데이터용 개최 시점: 월(1~12) + 그 달의 몇째 주(1~5).
 * 엔진이 Week(1~52)로 바꾼다(그 달 첫 주 + weekOfMonth − 1). docs/race-calendar-plan.md 의 "6/1" 표기와 같다.
 */
export interface ScheduleSlot {
  month: number;
  weekOfMonth: number;
}

/** 레이스 성격 태그. 칭호·시리즈·화면 필터·AI 출주 판단에 쓴다 */
export type RaceTag =
  | 'classic'
  | 'two_year_old'
  | 'fillies_mares'
  | 'national_flagship'
  | 'trial'
  | 'heritage_handicap'
  | 'stayers'
  | 'sprint'
  | 'champions_day';

/**
 * 고정 일정 레이스(G1~리스티드, 헤리티지 핸디캡). data/races.json.
 * 이름은 전부 가상(클래식 유형명만 가상 지명과 결합해 허용).
 */
export interface RaceTemplate extends Race {
  schedule: ScheduleSlot;
  /** 같은 개최일 안의 출주 순서(1부터) */
  cardOrder: number;
  tags: RaceTag[];
}

export type SeriesId = string;

/** 시리즈 정의(data/series.json) */
export interface SeriesDefinition {
  id: SeriesId;
  /** 화면 문구 키(한국어 문구는 UI 의 text 에서). 이름 자체도 가상 */
  nameKey: string;
  kind: 'crown' | 'points';
  /** 레그(순서대로) */
  legs: RaceId[];
  /** crown: 달성에 필요한 우승 수(기본 legs.length) */
  winsRequired?: number;
  /** crown: 우승 레그에 반드시 포함돼야 하는 레이스(예: 스테이어 시리즈의 4,000m G1) */
  requiredLegs?: RaceId[];
  /** points: 착순별 포인트 [1착, 2착, ...] */
  pointsByPosition?: number[];
  /** 달성(또는 포인트 1위) 보너스 */
  bonus: Money;
}

/** 출주 신청(발주 전). 부담중량·기수는 확정 단계에서 채운다 */
export interface Declaration {
  horseId: HorseId;
  ownerId: OwnerId;
  trainerId: TrainerId | null;
  jockeyId: JockeyId | null;
  /** 확정 전 null */
  weightLb: number | null;
  isPlayer: boolean;
}

export type ScheduledRaceStatus = 'open' | 'closed' | 'run' | 'abandoned';

/** 개최일의 레이스 한 개. 자동 생성 경주도 있으므로 Race 스냅샷을 그대로 담는다 */
export interface ScheduledRace {
  race: Race;
  /** 고정 일정 레이스면 템플릿 id, 자동 생성이면 null */
  templateId: RaceId | null;
  status: ScheduledRaceStatus;
  declarations: Declaration[];
  /** 시뮬레이션했으면 true, 요약 모드(결과만 추첨)면 false */
  simulated: boolean;
}

/** 한 경마장의 하루 개최 */
export interface Meeting {
  /** `${racecourseId}:${year}-${week}` */
  id: string;
  date: GameDate;
  racecourseId: RacecourseId;
  /** 개최 주 시작 시 확정(그 전에는 예보만) */
  going: Going | null;
  races: ScheduledRace[];
}

/** 공식 레이팅 변동 1건 */
export interface RatingChange {
  date: GameDate;
  raceId: RaceId;
  /** 변동 전(없으면 null = 첫 부여) */
  from: number | null;
  to: number;
}

export interface SeriesProgress {
  seriesId: SeriesId;
  year: number;
  /** 레그별 우승마 */
  legWinners: Record<RaceId, HorseId>;
  /** points 시리즈 누적 */
  points: Record<HorseId, number>;
  /** 달성마(crown) 또는 시즌 1위(points, 시즌 종료 후) */
  champion: HorseId | null;
}

/** 리딩 집계 한 줄(종마·외조부·기수·조교사·마주·생산자 공통) */
export interface LeadingEntry {
  /** 대상 id(종마=HorseId, 기수=JockeyId …) */
  id: string;
  runners: number;
  wins: number;
  places: number;
  groupWins: number;
  earnings: Money;
}

export type LeadingCategory = 'sire' | 'damsire' | 'jockey' | 'trainer' | 'owner' | 'breeder';

/** 올해 리딩 집계. key = 대상 id */
export type LeadingTables = Record<LeadingCategory, Record<string, LeadingEntry>>;

/** GameState.seasonState (A6 에서 GameState 에 붙인다) */
export interface SeasonState {
  year: number;
  /** 이번 주와 다음 주 개최만 보관(지난 개최는 결과로만 남긴다) */
  meetings: Meeting[];
  series: Record<SeriesId, SeriesProgress>;
  leading: LeadingTables;
  /** 말별 OR 변동 이력(최근 N건, config) */
  ratingHistory: Record<HorseId, RatingChange[]>;
  /** 자동 생성 레이스 id 일련번호 */
  nextGeneratedRace: number;
}
