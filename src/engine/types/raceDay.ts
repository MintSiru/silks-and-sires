// 레이스 당일(M7-RD, 사용자 결정 2026-10-17): 내 말 출주 주에 진행을 멈추고 출주표·패독·조교사·기수 코멘트·작전 지시를
// 보여 준 뒤 레이스를 재생한다. 아래는 엔진이 화면에 넘기는 읽기 전용 요약(상태에 저장하지 않음).
import type { HorseId, JockeyId, OwnerId, RaceId, Silks, TrainerId } from './common';
import type { Going } from './going';
import type { RunningStyle, Sex } from './horse';
import type { FractionalOdds, Race } from './race';
import type { GameDate } from './time';

/** 출주표 한 줄. 플레이어가 볼 수 있는 정보만 */
export interface RaceCardRunner {
  horseId: HorseId;
  name: string;
  /** 마번 1..N */
  saddleCloth: number;
  /** 게이트 1..N (1 = 내측) */
  draw: number;
  age: number;
  sex: Sex;
  /** 실제 부담중량(lb, 견습 감량 반영) */
  weightLb: number;
  jockeyId: JockeyId;
  jockeyName: string;
  trainerId: TrainerId | null;
  trainerName: string | null;
  ownerId: OwnerId;
  ownerName: string;
  silks: Silks;
  /** 공식 레이팅(없으면 null) */
  or: number | null;
  /** 최근 5전 착순, 최신이 앞(출주 없으면 빈 배열) */
  recentForm: number[];
  /** 말의 선호 작전(공개 정보 — 전적으로 드러난 성향) */
  preferredStyle: RunningStyle;
  /** 예상 오즈(아침 오즈). 실제 SP 와 다를 수 있다 */
  morningOdds: FractionalOdds;
  isPlayer: boolean;
}

/** 출주표 */
export interface RaceCard {
  meetingId: string;
  race: Race;
  date: GameDate;
  /** 발표 마장(개최 시드로 정해 실제와 같다) */
  going: Going;
  runners: RaceCardRunner[];
}

/** 패독 관찰 한 줄 */
export interface PaddockNote {
  horseId: HorseId;
  tone: 'good' | 'neutral' | 'bad';
  text: string;
}

/** 조교사·기수 코멘트 한 줄 */
export interface RaceDayComment {
  speaker: 'trainer' | 'jockey';
  personId: TrainerId | JockeyId;
  name: string;
  text: string;
}

/** 예상 페이스(선행형 두수 기준) */
export type PaceOutlook = 'fast' | 'even' | 'slow';

/** 내 말 한 두의 레이스 당일 요약 */
export interface RaceDayBrief {
  horseId: HorseId;
  raceId: RaceId;
  card: RaceCard;
  /** 출주마 전부(내 말 먼저) */
  paddock: PaddockNote[];
  comments: RaceDayComment[];
  paceOutlook: PaceOutlook;
  /** 조교사 추천 작전 */
  recommendedTactic: RunningStyle;
  /** 현재 지시(Declaration.tactic, 없으면 선호 작전) */
  tactic: RunningStyle;
}
