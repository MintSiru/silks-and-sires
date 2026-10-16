import type { HorseId, Money, OwnerId, RaceId, SireLineId } from './common';
import type { GameDate } from './time';

/**
 * M5 장기 목표·서사: 연대기, 부계 확립·명문 모계, 라이벌, 왕조 목표.
 * 설계: docs/m5-plan.md. 모든 필드는 GameState 의 선택 필드(옛 저장본 호환 — 없으면 빈 것으로 본다).
 * 화면 문구는 저장하지 않는다(kind + 값으로 UI 가 만든다). 이름 값은 가상 이름·종마 실명만(원칙 1).
 */

/** 연대기 항목 종류 */
export type ChronicleKind =
  /** 플레이어 마주의 첫 출주·첫 승리·첫 그룹 우승 */
  | 'first_runner'
  | 'first_win'
  | 'first_group_win'
  /** 플레이어 말(소유 또는 생산)의 그룹·G1·클래식 우승 */
  | 'group_win'
  | 'g1_win'
  | 'classic_win'
  /** 시리즈 달성·부문 수상(Laurel)·리딩 타이틀(마주·생산자·종마, 나라 또는 유럽) */
  | 'series_champion'
  | 'laurel_award'
  | 'leading_title'
  /** 부계 확립·명문 모계 인정 */
  | 'sire_line_established'
  | 'female_family_established'
  /** 내 생산마가 종마가 됨, 세일 최고가 기록 */
  | 'homebred_stallion'
  | 'record_sale'
  /** 라이벌 지정·대레이스 맞대결 */
  | 'rival_declared'
  | 'rival_clash'
  /** 세계 기록: 그해 클래식 우승마(플레이어와 무관한 역사) */
  | 'world_classic';

/** 연대기 한 줄. 플레이어 항목은 영구 보존, 세계 항목은 config 의 보존 연수만 */
export interface ChronicleEntry {
  /** `${year}-${순번}` — 같은 해 안에서 기록 순서 */
  id: string;
  kind: ChronicleKind;
  date: GameDate;
  /** 플레이어 관련(내 소유·내 생산·내 마주) 여부 */
  player: boolean;
  horseId?: HorseId;
  /** 레이스 결과가 있는 항목 */
  raceId?: RaceId;
  /** 고정 일정 레이스 템플릿 id(클래식·G1 기록 묶음용) */
  templateId?: RaceId;
  /** 표시용 값: 레이스 이름·부문 키·리딩 범위('europe' | 나라 코드) 등. 가상 이름만 */
  label?: string;
  ownerId?: OwnerId;
  /** 금액(상금·낙찰가) */
  amount?: Money;
  /** 부계 확립 항목의 계통 id */
  lineId?: SireLineId;
  /** 수치(통산 그룹 승수, 맞대결 누적 등) */
  count?: number;
}

/**
 * 게임 안에서 새로 확립된 부계(M5). 혈통 계산(니크 등)은 바꾸지 않는 '칭호·기록' 층이다
 * — 말의 sireLineId 는 그대로, 표시할 때 확립 계통을 덧붙인다.
 */
export interface EstablishedLine {
  /** 'line_' + founderId */
  id: SireLineId;
  /** 시조 종마(게임 안 Horse — 실명 종마는 이미 계통이 있어 대상이 아니다) */
  founderId: HorseId;
  /** 시조의 원래 계통(분지 표시: 'X 계통에서 분지') */
  parentLineId: SireLineId;
  establishedYear: number;
  /** 확립 시점 근거: 종마가 된 아들 수, 부계 자손 그룹 우승마 수 */
  sons: number;
  groupWinners: number;
  /** 시조가 플레이어 생산마 */
  playerBred: boolean;
}

/** 명문 모계(M5): 한 암말의 모계 자손이 블랙타입 우승마를 일정 수 이상 냄 */
export interface FemaleFamily {
  /** 기초 암말 */
  founderMareId: HorseId;
  establishedYear: number;
  /** 확립 시점 모계 3대 안 블랙타입(그룹·리스티드) 우승마 수 */
  blackTypeWinners: number;
  playerBred: boolean;
}

/** GameState.legacy */
export interface LegacyState {
  lines: EstablishedLine[];
  families: FemaleFamily[];
}

/** 라이벌이 된 이유 */
export type RivalReason =
  /** 비슷한 규모·명성의 마주 */
  | 'same_tier'
  /** 대레이스(G1·클래식)에서 내 말을 이긴 마주 */
  | 'big_race'
  /** 세일에서 내 입찰을 이긴 마주 */
  | 'sale_battle';

/** 라이벌 마주(AI) 한 명. GameState.rivals */
export interface Rival {
  ownerId: OwnerId;
  /** 라이벌이 된 해 */
  since: number;
  reason: RivalReason;
  /** 같은 그룹 레이스에서 플레이어 말이 앞선 횟수 / 라이벌 말이 앞선 횟수 */
  playerAhead: number;
  rivalAhead: number;
  /** 경쟁심 0~100. 세일 경합 입찰 상한·대레이스 출주 성향에 반영한다 */
  intensity: number;
  /** false 면 지난 라이벌(기록용) */
  active: boolean;
}

/** 왕조 목표 하나의 진행(순수 계산 — 저장하지 않는다) */
export interface DynastyGoalProgress {
  /** 목표 키(config 의 목표 목록) */
  id: string;
  done: boolean;
  /** 달성 연도(연대기에서 찾음) */
  doneYear: number | null;
  progress: number;
  target: number;
}
