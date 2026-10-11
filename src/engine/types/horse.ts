import type { CountryCode, HorseId, Money, OwnerId, SireLineId, TrainerId } from './common';

export type Sex = 'male' | 'female';

/**
 * 생애 단계. 표시용 호칭(colt/filly/horse/mare/gelding)은 나이·성별·거세 여부로 파생한다.
 * - historical: 혈통표에만 존재하는 과거 말(시뮬레이션 대상 아님)
 */
export type HorseStatus =
  | 'foal'
  | 'weanling'
  | 'yearling'
  | 'in_training'
  | 'resting'
  | 'retired'
  | 'stud'
  | 'broodmare'
  | 'dead'
  | 'historical';

/** 레이스 능력치. 모두 0~100 실수(숨김 값). */
export interface Abilities {
  /** 스피드: 순항·최고 속도 */
  speed: number;
  /** 스태미나: 에너지 총량 */
  stamina: number;
  /** 순발력: 가속도, 스퍼트 반응 */
  acceleration: number;
  /** 근성: 지쳤을 때 감속 억제, 경합 시 버팀 */
  guts: number;
  /** 파워: 무거운 마장·오르막·부담중량 대응 */
  power: number;
}

/** -1(매우 약함) ~ 0(보통) ~ +1(매우 강함) */
export type AptitudeScore = number;

export interface Aptitudes {
  /** 최적 거리(m) */
  distanceOptimum: number;
  /** 적성 폭(m). 최적에서 이만큼 벗어나면 적성 효과가 약 절반 손실. */
  distanceRange: number;
  /** 선호 잔디 마장 인덱스 (TURF_GOING_ORDER 기준 0~6, 실수 허용) */
  goingPreference: number;
  /** 마장 허용 폭 (인덱스 단위, > 0) */
  goingTolerance: number;
  /** 올웨더 적성 */
  allWeather: AptitudeScore;
  /** 더트 적성 */
  dirt: AptitudeScore;
  /** 좌회전 코스 적성 */
  leftHanded: AptitudeScore;
  /** 우회전 코스 적성 */
  rightHanded: AptitudeScore;
  /** 기복(경사) 코스 대응 */
  undulation: AptitudeScore;
}

/** 성장형. M2 에서 사용. */
export interface GrowthProfile {
  type: 'precocious' | 'normal' | 'late';
  /** 능력 정점 나이(만) */
  peakAge: number;
  /** 정점 이후 쇠퇴 속도 0~1 */
  declineRate: number;
}

export interface Injury {
  kind: string;
  /** 복귀까지 남은 주 */
  weeksOut: number;
}

export interface Condition {
  /** 레이스 준비도 0~100 (100 = 최상) */
  fitness: number;
  /** 피로 0~100 (0 = 없음) */
  fatigue: number;
  /** 정신 상태 0~100 (100 = 최상) */
  mental: number;
  injury: Injury | null;
}

/** 작전: 선행 / 선단 / 중단 / 후방 */
export type RunningStyle = 'front' | 'prominent' | 'midfield' | 'held_up';

export interface CareerRecord {
  starts: number;
  wins: number;
  seconds: number;
  thirds: number;
  earnings: Money;
  /** 리스티드 이상 입상 횟수(블랙타입) */
  blackTypePlacings: number;
  /** 그룹 레이스 우승 횟수 */
  groupWins: number;
}

export interface Horse {
  id: HorseId;
  /** 18자 이내, 전역 중복 금지 */
  name: string;
  sex: Sex;
  gelded: boolean;
  /** 나이 = 현재 연도 - birthYear (1월 1일 일괄 가령) */
  birthYear: number;
  countryOfBirth: CountryCode;
  status: HorseStatus;
  sireId: HorseId | null;
  damId: HorseId | null;
  ownerId: OwnerId | null;
  breederId: OwnerId | null;
  trainerId: TrainerId | null;
  /** 현재 능력(숨김) */
  ability: Abilities;
  /** 잠재 상한(숨김) */
  potential: Abilities;
  growth: GrowthProfile;
  aptitude: Aptitudes;
  preferredStyle: RunningStyle;
  condition: Condition;
  /** 공식 레이팅(OR). 미부여 시 null. 플레이어에게 숫자로 노출하지 않는다(단서로만) */
  officialRating: number | null;
  /** 부계 계통. 보통 부(父)의 계통을 물려받는다(새 계통 확립은 M5). 미상이면 null */
  sireLineId: SireLineId | null;
  /** 모계(female family) 식별자. 시조 암말의 HorseId. 실명 종마 등 미상이면 null */
  familyId: HorseId | null;
  /** 다리·체질 건강도 0~100 (숨김). 부상 위험·마체 평가 'legs' 의 근거 */
  soundness: number;
  record: CareerRecord;
}

/** 종마(씨수말) 프로필. Horse 레코드(horseId)에 붙는 확장 레코드. */
export interface Stallion {
  horseId: HorseId;
  /**
   * 실명 종마 데이터 키. 표시 이름은 data/ 의 ID→이름 표에서 찾는다
   * (이름 표만 바꾸면 가상화할 수 있도록 분리). 게임 내 생산 종마는 null.
   */
  realKey: string | null;
  sireLineId: SireLineId;
  /** 종부료(nomination fee) */
  fee: Money;
  /** 시즌당 최대 교배 두수 */
  bookLimit: number;
  /** 이번 시즌 예약 두수 */
  bookedThisSeason: number;
  /** 수태율 0~1 */
  fertility: number;
  /** 인기 0~100 (시장 수요) */
  popularity: number;
  standsIn: CountryCode;
  firstSeasonYear: number;
}

/** 번식 암말 프로필. Horse 레코드(horseId)에 붙는 확장 레코드. */
export interface Mare {
  horseId: HorseId;
  /** 이번 시즌 교배 종마 */
  coveredBy: HorseId | null;
  pregnant: boolean;
  /** 출산 예정: 연도 × 100 + 주 (예: 202707) — 임신 중일 때만 */
  dueWeek: number | null;
  foals: HorseId[];
  /** 자손의 블랙타입 입상 누계 (명문 모계 판정용) */
  blackTypeProduce: number;
}
