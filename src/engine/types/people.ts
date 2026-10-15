import type { BreederId, CountryCode, HorseId, JockeyId, Money, OwnerId, Silks, TrainerId } from './common';
import type { RunningStyle } from './horse';

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
  birthYear: number;
  /** 조교 성향 −1(스피드 위주) ~ +1(스태미나 위주). 망아지 거리 적성 발현·컨디션 조정에 쓴다(M3-C1) */
  staminaBias: number;
  /** 2세 조기 출주 성향 0~1 */
  juvenileFocus: number;
  /** 상마안(말 보는 눈) 0~100 (숨김, M4-B2). 세일 동행 코멘트·조교사 소견의 정확도 */
  eye: number;
  /** 통산 성적(올해 제외, 연말에 더한다, M4-P1) */
  career: PersonCareer;
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
  /** 세부 능력 0~100 (숨김). skill 은 이들의 종합값으로 유지한다 */
  abilities: JockeyAbilities;
  /** 잘 맞는 작전. 없으면 null */
  preferredStyle: RunningStyle | null;
  retired: boolean;
  /** 통산 성적(올해 제외, 연말에 더한다, M4-P1) */
  career: PersonCareer;
}

/** 기수 세부 능력 (0~100, 숨김) */
export interface JockeyAbilities {
  /** 게이트 출발 */
  start: number;
  /** 페이스 판단(초반 과열 억제, 자리 잡기) */
  pace: number;
  /** 마지막 스퍼트 타이밍·몰아치기 */
  finish: number;
  /** 무거운 마장·접전에서 말을 밀어붙이는 힘 */
  strength: number;
}

/** AI 마주 성향 (0~1) */
export interface OwnerPersona {
  /** 상업성: 세일·종마 가치 중시 */
  commercial: number;
  /** 명예: 그룹 레이스·클래식 중시 */
  prestige: number;
  /** 인내: 늦게 크는 말·장거리마를 기다림 */
  patience: number;
}

/** 마주 규모 */
export type OwnerTier = 'major' | 'mid' | 'small';

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
  tier: OwnerTier;
  /** 플레이어는 중립값(0.5) */
  persona: OwnerPersona;
  /** 관명 접두어(이름 짓기 'prefix' 템플릿). 없으면 null */
  namePrefix: string | null;
}

/** 상업 생산자 규모(M4-C0). 생산 두수 가중치와 세일 출품 규모(C2)를 정한다 */
export type BreederScale = 'large' | 'medium' | 'small';

/**
 * 상업 생산자(M4-C0): 경주에 말을 내지 않고 생산·판매만 하는 가상 목장(나라별).
 * AI 현역마 중 오너브리더(목장 있는 마주가 직접 생산)가 아닌 말의 생산자가 되고, 세일 출품자가 된다(C2).
 * 이름은 가상 목장명(원칙 1).
 */
export interface CommercialBreeder {
  id: BreederId;
  /** 가상 목장명 */
  name: string;
  country: CountryCode;
  scale: BreederScale;
  /** 자금(유로 정수). C2 세일 판매 대금이 들어온다. C0 에서는 생성값만 */
  funds: Money;
  /** 보유 번식 암말·미판매 생산마(C2 에서 사용). C0 에서는 빈 배열 */
  horseIds: HorseId[];
}

/** 기수·조교사 통산 성적(M4-P1). 올해 성적은 seasonState.leading 에서 읽는다 */
export interface PersonCareer {
  runners: number;
  wins: number;
  places: number;
  groupWins: number;
  g1Wins: number;
  earnings: Money;
}
