import type { CountryCode, HorseId, JockeyId, Money, OwnerId, RaceId, RacecourseId, TrainerId } from './common';
import type { SampleField } from '../race/sampleField';
import type { Going } from './going';
import type { Race, RaceClass, RaceGrade, RaceKind } from './race';
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

/**
 * 다시 볼 수 있는 레이스(플레이어 말 출주 또는 G1). 리플레이 프레임은 저장하지 않고,
 * 같은 입력으로 runRace 를 다시 돌려 재생한다(같은 시드 = 같은 결과).
 */
export interface ReplayableRace {
  meetingId: string;
  race: Race;
  going: Going;
  date: GameDate;
  seed: number;
  field: SampleField;
}

/** 말 한 두의 한 레이스 퍼포먼스 레이팅 기록(올해분, M3-E1 시상 입력) */
export interface PerformanceEntry {
  raceId: RaceId;
  /** 고정 일정 레이스면 템플릿 id */
  templateId: RaceId | null;
  date: GameDate;
  grade: RaceGrade | null;
  distance: number;
  /** 레이스가 열린 나라 */
  country: CountryCode;
  position: number;
  /** 퍼포먼스 레이팅(OR 척도, 핸디캐퍼 PR) */
  pr: number;
}

/** 레이스 한 개의 레이팅(상위 4두 PR 평균, 론진형 '최우수 레이스' 입력). 그룹 레이스만 */
export interface RaceRatingEntry {
  raceId: RaceId;
  templateId: RaceId | null;
  name: string;
  date: GameDate;
  grade: RaceGrade;
  country: CountryCode;
  rating: number;
}

/** GameState.seasonState */
export interface SeasonState {
  year: number;
  /** 이번 주와 다음 주 개최만 보관(지난 개최는 결과로만 남긴다) */
  meetings: Meeting[];
  series: Record<SeriesId, SeriesProgress>;
  leading: LeadingTables;
  /** 말별 OR 변동 이력(최근 N건, config) */
  ratingHistory: Record<HorseId, RatingChange[]>;
  /** OR 이 아직 없는 말의 출주별 퍼포먼스 레이팅(OR 척도). 첫 OR 을 매기면 지운다 (M3-C3) */
  unratedFigures: Record<HorseId, number[]>;
  /** 자동 생성 레이스 id 일련번호 */
  nextGeneratedRace: number;
  /** 말별 마지막 출주일(연속 출주 제한·컨디션 계산용) */
  lastRun: Record<HorseId, GameDate>;
  /** 현역마 연간 교체를 마지막으로 한 연도(중복 실행 방지). 아직 없으면 null */
  lastPopulationYear: number | null;
  /** 최근 다시 볼 수 있는 레이스(최대 개수는 config) */
  replayable: ReplayableRace[];
  /** 나라별 올해 리딩(레이스가 열린 나라 기준). 유럽 합산은 leading (M3-E2) */
  leadingByCountry: Partial<Record<CountryCode, LeadingTables>>;
  /** 말별 올해 퍼포먼스 기록. 연도 전환 때 시상 계산 후 비운다 (M3-E1) */
  performances: Record<HorseId, PerformanceEntry[]>;
  /** 올해 그룹 레이스 레이팅. 연도 전환 때 비운다 (M3-E1) */
  raceRatings: RaceRatingEntry[];
  /** 플레이어 말별 출주 계획(UX1, 사용자 요청 2026-10-16). 없으면 계획 없음 — 저장 마이그레이션 불필요 */
  racePlans?: Record<HorseId, PlannedRace[]>;
}

/**
 * 조교사 출주 계획의 조건 목표(UX1). 자동 생성 레이스는 미리 알 수 없으므로 '그 주에 이런 레이스'로 잡고,
 * 개최가 정해지면 조교사가 가장 맞는 실제 레이스로 바꿔 신청한다.
 */
export interface RacePlanTarget {
  kinds: RaceKind[];
  minDistance: number;
  maxDistance: number;
  /** 이 나라 개최만(없으면 말의 현역 나라) */
  country?: CountryCode;
  /** 클래스 범위(1 = 상위). 그룹·리스티드는 클래스 1 */
  minClass?: RaceClass;
  maxClass?: RaceClass;
}

/** 출주 계획 한 칸(UX1). 고정 일정 레이스(templateId) 또는 조건 목표(target) 중 하나만 */
export interface PlannedRace {
  /** `${horseId}:${year}-${week}` */
  id: string;
  date: GameDate;
  templateId: RaceId | null;
  target: RacePlanTarget | null;
  /**
   * proposed = 조교사 제안(플레이어 검토 전) / approved = 승인(그 주 출주 접수 때 자동 신청) /
   * declared = 신청됨 / run = 출주 완료 / skipped = 취소·불가(사유는 note)
   */
  status: 'proposed' | 'approved' | 'declared' | 'run' | 'skipped';
  /** 조교사 한 줄 메모(예: '10f 핸디캡 — 지난 경주 뒤 5주 간격') */
  note: string;
  /** declared 이후 실제 레이스 id */
  raceId?: RaceId;
}

/** 시상식형(카르티에 모델) 부문 */
export type LaurelCategory =
  | 'horse_of_the_year'
  | 'older_horse'
  | 'stayer'
  | 'sprinter'
  | 'two_year_old_colt'
  | 'two_year_old_filly'
  | 'three_year_old_colt'
  | 'three_year_old_filly';

/** 평가지·랭킹 한 줄 */
export interface RatedHorse {
  horseId: HorseId;
  rating: number;
}

/** 리딩 최종 순위 상위 N(카테고리별) */
export type LeadingTop = Record<LeadingCategory, LeadingEntry[]>;

/** 한 해의 시상·순위 결과 (연도 전환 때 확정, GameState.awardsHistory) */
export interface SeasonAwards {
  year: number;
  /** Laurel Racing Awards — 부문별 수상마(해당 없으면 null) */
  laurel: Record<LaurelCategory, HorseId | null>;
  /** The Racing Ledger — 연간 레이팅 상위(150 척도) */
  ledger: RatedHorse[];
  /** Global Turf Rankings — 시즌 최고 퍼포먼스 상위(OR 척도) */
  globalRankings: RatedHorse[];
  /** Global Turf Rankings — 최우수 레이스 */
  bestRace: RaceRatingEntry | null;
  /** 유럽 합산 리딩 상위 */
  leading: LeadingTop;
  /** 나라별 리딩 상위 */
  leadingByCountry: Partial<Record<CountryCode, LeadingTop>>;
  /** 시리즈 달성(crown) 또는 1위(points) */
  seriesChampions: Record<SeriesId, HorseId>;
}
