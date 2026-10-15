import type { BreederId, CountryCode, HorseId, Money, OwnerId, SireLineId, TrainerId } from './common';

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

/** 부상 종류(M3-C1). 가벼운 순: 타박 → 정강이 통증 → 건 손상 → 골절 */
export type InjuryKind = 'knock' | 'sore_shins' | 'tendon' | 'fracture';

export interface Injury {
  kind: InjuryKind;
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
  /** 생산자: 마주(오너브리더·플레이어) OwnerId 또는 상업 생산자 BreederId(M4-C0). 모르면 null */
  breederId: OwnerId | BreederId | null;
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
  /** 성격 5축(숨김). M3-C5 */
  personality: Personality;
  /** 털색 유전자와 흰 반점. 표시 털색은 유전자와 나이에서 파생한다. M3-C6 */
  coat: Coat;
  record: CareerRecord;
  /** 사망 연도(M4-D9). status 'dead' 일 때만. 이 해 뒤의 교배 연도에는 부가 될 수 없다. 옛 저장본은 키 없음 */
  diedYear?: number;
}

/**
 * 성격 5축 (숨김, 0~100, 50 = 보통). 레이스 보정은 50 에서 벗어난 만큼만 준다(50 이면 효과 없음).
 * 유전력은 낮다(부모 평균 + 큰 잡음). 플레이어에게는 조교사·기수 코멘트로만 드러난다. M3-C5
 */
export interface Personality {
  /** 기세: 앞으로 나가려는 성향. 높으면 선행 쪽 각질·초반 과열 */
  drive: number;
  /** 침착: 흥분·과열 억제. 낮으면 초반 스태미나 손실 */
  composure: number;
  /** 투쟁심: 경합에서 버팀(근성 보정) */
  fight: number;
  /** 겁: 무리 속·게이트를 두려워함. 높으면 출발 늦음·바깥 선호 */
  timidity: number;
  /** 고집: 기수 작전 지시를 무시할 확률 */
  stubbornness: number;
}

/** 털색 유전자 좌위 대립유전자 (단순화한 모델). M3-C6 */
export type ExtensionAllele = 'E' | 'e';
/** Agouti: 'A'(갈색 bay) > 'At'(흑갈색 brown) > 'a'(흑색 black) */
export type AgoutiAllele = 'A' | 'At' | 'a';
export type GreyAllele = 'G' | 'g';
export type RoanAllele = 'Rn' | 'rn';

export interface CoatGenes {
  /** ee = 밤색(chestnut). E 가 하나라도 있으면 검은 색소 */
  extension: [ExtensionAllele, ExtensionAllele];
  agouti: [AgoutiAllele, AgoutiAllele];
  /** G 가 하나라도 있으면 회색(나이 들수록 밝아짐) */
  grey: [GreyAllele, GreyAllele];
  /** Rn 이 하나라도 있으면 조모(roan). RnRn 은 만들지 않는다 */
  roan: [RoanAllele, RoanAllele];
}

/** 표시 털색. coatColour(genes, age) 로 파생 */
export type CoatColour = 'bay' | 'brown' | 'black' | 'chestnut' | 'grey' | 'roan';

export type FaceMarking = 'none' | 'star' | 'snip' | 'stripe' | 'blaze';

export interface Coat {
  genes: CoatGenes;
  face: FaceMarking;
  /** 흰 양말이 있는 다리 수 0~4 */
  whiteLegs: number;
}

/**
 * 종마의 자마(자식) 성적 누적(경력 전체, M3-C4). GameState.sireStats[아비 HorseId].
 * 실제 성적 기준 거리 적성(observedProfile)과 화면의 '산구 성적'에 쓴다.
 */
export interface OffspringStats {
  /** 출주한 자마 수(한 번이라도 출주) */
  starters: number;
  /** 1승 이상 자마 수 */
  winners: number;
  /** 출주 수 합 */
  runs: number;
  /** 우승 수 합 */
  wins: number;
  /** 그룹 레이스 우승 수 합 */
  groupWins: number;
  /** 그룹 레이스 우승 자마 수 */
  groupWinners: number;
  /** 자마 상금 합 */
  earnings: Money;
  /** 우승 거리 합(m). 평균 우승 거리 = winDistanceSum / wins */
  winDistanceSum: number;
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
  /** 이번 시즌 예약 두수(AI 가상 예약 + 플레이어 예약 합). bookingSeason 시즌 기준 */
  bookedThisSeason: number;
  /**
   * 예약 집계가 가리키는 번식 시즌 연도(M4-D3). 예약 창(전년 11월)이 열리면 다음 해로 바뀌고
   * bookedThisSeason·aiBooked·aiDemand 를 새로 센다
   */
  bookingSeason: number;
  /** bookingSeason 의 AI(가상) 예약 수. 세계 표본이 아니라 실제 규모 두수 */
  aiBooked: number;
  /** bookingSeason 의 AI 수요 목표(가상 두수). 북 상한을 넘을 수 있고, 넘친 만큼이 대기 수요(D8 종부료 산정) */
  aiDemand: number;
  /** 수태율 0~1 */
  fertility: number;
  /** 인기 0~100 (시장 수요) */
  popularity: number;
  standsIn: CountryCode;
  firstSeasonYear: number;
  /** 직전 시즌 종부료(M4-D8 연간 재산정 전 값). 화면의 오름·내림 표시용. 재산정 전에는 키 없음 */
  prevFee?: Money;
  /**
   * 시장 기준 가치(M4-D8). 종부료가 돌아가는 기준점으로, 자마 성적(다른 종마 대비)으로만 서서히 움직인다.
   * 첫 재산정 때 그 시점 종부료로 정한다. 재산정 전에는 키 없음
   */
  marketBaseFee?: Money;
  /**
   * 장기 해외 임대 중이면 다시 북반구에서 교배하는 첫 시즌(M4-D4). 그 전 시즌에는 예약·AI 수요·종부료 재산정이 없다.
   * 없거나 null 이면 임대 중 아님
   */
  leasedAwayUntil?: number | null;
  /**
   * 시즌별 관측 수태 기록(M4-D5, 최근 기록이 끝, 최대 config 개수). 공개 수태율·저수태 은퇴 판정에 쓴다.
   * 없으면 기록 없음(옛 저장본·첫 시즌 전)
   */
  fertilityHistory?: StallionFertilitySeason[];
  /**
   * 북반구에서 마지막으로 교배한 시즌(M4-D7). 은퇴·저수태 은퇴·해외 판매 때 그해 −1 또는 그해로 정한다.
   * 이 시즌 뒤로는 자마의 부(父) 후보가 아니다. 없으면 아직 계류 중(사망은 Horse.diedYear 로 따로 본다)
   */
  lastSeasonYear?: number;
  /** AI 현역마에서 종마로 편입된 종마(M4-D7). 세계 자마의 부 후보에 들어간다 */
  aiEntrant?: boolean;
}

/** 종마 한 시즌의 관측 수태 기록(M4-D5) */
export interface StallionFertilitySeason {
  year: number;
  /** 그 시즌 교배 수(북에 오른 암말) */
  covers: number;
  /** 그중 수태 수 */
  conceptions: number;
}

/** 번식 암말 프로필. Horse 레코드(horseId)에 붙는 확장 레코드. */
export interface Mare {
  horseId: HorseId;
  /** 이번 시즌 교배 종마 */
  coveredBy: HorseId | null;
  /** 교배 예약 시점: 연도 × 100 + 주 (예: 202610). 예약이 없으면 null. 수태 판정은 이 주가 지난 뒤에 한다 */
  coveredWeek: number | null;
  pregnant: boolean;
  /** 출산 예정: 연도 × 100 + 주 (예: 202707) — 임신 중일 때만 */
  dueWeek: number | null;
  foals: HorseId[];
  /** 자손의 블랙타입 입상 누계 (명문 모계 판정용) */
  blackTypeProduce: number;
  /**
   * 다음(또는 이번) 번식 시즌 사전 예약(M4-D3). 종부료는 예약 때 이미 냈다.
   * 그 시즌 번식 주에 임신 중이 아니고 coveredBy 가 비면 coveredBy·coveredWeek 로 바뀐다.
   * 시즌이 끝날 때까지 바뀌지 못하면 환불하고 지운다. 없으면 키 생략(옛 저장본 호환).
   */
  bookedFor?: { stallionId: HorseId; season: number; feePaid?: Money } | null;
  /**
   * 현재 coveredBy 교배에 실제로 낸 종부료(M4-D4: 교배권·자기 종마는 0). 환불은 이 값으로 한다.
   * 없으면(옛 저장본·AI) 종마의 현재 종부료로 본다. bookedFor.feePaid 도 같은 규칙
   */
  coveredFee?: Money | null;
}
