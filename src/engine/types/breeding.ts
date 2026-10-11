import type { HorseId, SireLineId } from './common';
import type { GrowthProfile } from './horse';

/**
 * M2 배합·단서 타입. 사용자 결정: 능력치·레이팅은 비공개, 단서(등급·코멘트)로만 어림잡는다.
 * 닉스는 일부만 시작 시 공개.
 */

/** 단서 등급 (높음 → 낮음) */
export const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D', 'E'] as const;
export type Grade = (typeof GRADE_ORDER)[number];

/** 평가 시점. 나이가 들수록 단서가 정확해진다 */
export type AssessmentStage = 'foal' | 'yearling' | 'two_year_old' | 'in_training';

/** 마체 평가 */
export interface ConformationReport {
  stage: AssessmentStage;
  /** 종합 */
  overall: Grade;
  /** 골격·체격 → 파워·스태미나 단서 */
  frame: Grade;
  /** 뒷다리·엉덩이 → 스피드·순발력 단서 */
  hindquarters: Grade;
  /** 다리 구조 → 건강도(soundness) 단서 */
  legs: Grade;
  /** 걸음걸이 → 스피드·스태미나 단서 */
  action: Grade;
  /** 기질 → 근성·정신 단서 */
  temperament: Grade;
}

/**
 * 조교사·평가자 코멘트 키. UI 는 data/text/comments.ko.json 에서 key → 한국어 문장을 찾는다.
 * 엔진은 문장을 만들지 않는다.
 */
export const COMMENT_KEYS = [
  'overall_star', 'overall_useful', 'overall_moderate', 'overall_limited',
  'speed_exceptional', 'speed_good', 'speed_ordinary', 'speed_lacking',
  'stamina_stays_well', 'stamina_middle', 'stamina_sprinter',
  'kick_sharp', 'kick_one_paced',
  'guts_battler', 'guts_soft',
  'power_strong', 'power_light',
  'temper_calm', 'temper_keen',
  'growth_early', 'growth_needs_time',
  'going_likes_fast', 'going_likes_soft',
  'legs_sound', 'legs_fragile',
] as const;
export type CommentKey = (typeof COMMENT_KEYS)[number];

export interface AssessmentComment {
  key: CommentKey;
  tone: 'positive' | 'neutral' | 'negative';
}

/** 한 시점의 평가 결과(플레이어에게 보이는 정보만) */
export interface Assessment {
  horseId: HorseId;
  year: number;
  week: number;
  conformation: ConformationReport;
  comments: AssessmentComment[];
  /** 거리 적성 추정 범위(m). 단계가 이를수록 넓다 */
  distanceHint: { min: number; max: number };
  /** 성장형 추정. 판단 못 하면 'unknown' */
  growthHint: GrowthProfile['type'] | 'unknown';
}

/** 닉스(부 계통 × 모부 계통 궁합). 정적 데이터 data/breeding/nicks.json */
export interface NickEntry {
  sireLineId: SireLineId;
  damsireLineId: SireLineId;
  /** -1(나쁨) ~ +1(좋음) */
  value: number;
  /** 게임 시작 시 공개 여부 (사용자 결정: 일부만 공개) */
  knownAtStart: boolean;
}

export type NickLabel = 'excellent' | 'good' | 'neutral' | 'poor' | 'unknown';

/** 혈통표 노드 */
export interface PedigreeNode {
  /** 미상이면 null */
  horseId: HorseId | null;
  /** 0 = 본인, 1 = 부모, 2 = 조부모 … */
  generation: number;
  sire: PedigreeNode | null;
  dam: PedigreeNode | null;
}

/** 인브리드: 같은 조상이 부측·모측 양쪽에 등장 */
export interface InbreedingCross {
  ancestorId: HorseId;
  /** 부측에서 등장한 대(1 = 부모 대 기준이 아니라, 본인 기준 대수. 부 = 1) 오름차순 */
  sireSide: number[];
  /** 모측에서 등장한 대 오름차순 */
  damSide: number[];
  /** 표기 "4×3" (부측 최소 대 × 모측 최소 대). 여러 번이면 "4×4×3" 처럼 부측 전부 × 모측 전부 */
  label: string;
  /** 혈량(%) = Σ (1/2)^대 × 100, 부측·모측 모두 합산. 예: 4×3 = 6.25 + 12.5 = 18.75 */
  bloodPercent: number;
}

/** 배합 미리보기 (UI 용. 숫자 능력치 없음) */
export interface MatingPreview {
  sireId: HorseId;
  damId: HorseId;
  nick: { label: NickLabel; known: boolean };
  inbreeding: InbreedingCross[];
  /** 기대 거리 범위(m) — 부모 적성의 넓은 추정 */
  distanceHint: { min: number; max: number };
  /** 조숙/만성 경향 */
  precocityHint: GrowthProfile['type'] | 'unknown';
  comments: AssessmentComment[];
  /** 역할 힌트(공개 정보만): 부마 = 부의 거리 프로필, 모계 = 외조부의 거리 프로필 기준 */
  roles: { sire: MatingRole; damSide: MatingRole | 'unknown' };
  /** 보완형(부 스피드 + 모계 스태미나) 가능성. 외조부를 모르면 'unknown' */
  complement: 'likely' | 'unlikely' | 'unknown';
}

/** 배합 역할: speed 프로필 → 'speed', classic → 'balanced', middle·cup → 'stamina' */
export type MatingRole = 'speed' | 'balanced' | 'stamina';
