import type { CountryCode, HorseId, JockeyId, Money, OwnerId, Silks, TrainerId } from './common';

/** 조교사 성향 */
export type TrainerStyle = 'early_juveniles' | 'patient' | 'sprinters' | 'stayers' | 'all_round';

export interface Trainer {
  id: TrainerId;
  /** 가상 인명 */
  name: string;
  country: CountryCode;
  /** 가상 야드 이름 */
  yardName: string;
  /** 가상 지역명 */
  region: string;
  /** 시설 등급 1~5 */
  facilityGrade: number;
  style: TrainerStyle;
  /** 조교 능력 0~100 (숨김) */
  skill: number;
  /** 주당 조교료 */
  weeklyFee: Money;
  /** 수용 두수 */
  capacity: number;
}

export interface Jockey {
  id: JockeyId;
  /** 가상 인명 */
  name: string;
  country: CountryCode;
  birthYear: number;
  /** 기승 능력 0~100: 페이스 판단, 스퍼트 타이밍, 트래픽 처리 */
  skill: number;
  /** 최저 기승 가능 중량(lb) */
  minRidingWeightLb: number;
  /** 견습 감량(lb). 0 = 정식 기수 */
  apprenticeAllowanceLb: number;
  /** 전속(retained) 계약 마주 */
  retainedBy: OwnerId | null;
}

export interface Owner {
  id: OwnerId;
  /** 가상 인명 또는 가상 법인명 */
  name: string;
  country: CountryCode;
  isPlayer: boolean;
  silks: Silks;
  funds: Money;
  /** 가상 생산목장 이름(없으면 null) */
  studName: string | null;
  retainedJockeyId: JockeyId | null;
  /** 보유 말 (Horse.ownerId 와 일관성 유지) */
  horseIds: HorseId[];
}
