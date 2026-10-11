import type { HorseId, JockeyId, Money, RaceId, RacecourseId, Silks } from './common';
import type { Racecourse } from './course';
import type { Going } from './going';
import type { Horse, RunningStyle } from './horse';
import type { Jockey } from './people';
import type { GameDate } from './time';

/** 블랙타입 등급. 'L' = 리스티드 */
export type RaceGrade = 'G1' | 'G2' | 'G3' | 'L';

export type RaceKind = 'maiden' | 'novice' | 'handicap' | 'conditions' | 'listed' | 'group';

/** 클래스 1~7. 그룹·리스티드는 클래스 1. */
export type RaceClass = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RaceConditions {
  minAge: number;
  /** null = 상한 없음 (예: 3세 이상) */
  maxAge: number | null;
  sex: 'open' | 'fillies_mares' | 'colts_geldings';
  /** 핸디캡 OR 범위 (핸디캡이 아니면 null) */
  ratingMin: number | null;
  ratingMax: number | null;
  /** wfa = 연령별 정량, handicap = OR 기반, level = 동일 중량 */
  weightSystem: 'wfa' | 'handicap' | 'level';
  /** 기준 부담중량(lb) */
  baseWeightLb: number;
}

/** 레이스 정의(정적 데이터, data/races.json). 이름은 전부 가상. */
export interface Race {
  id: RaceId;
  name: string;
  racecourseId: RacecourseId;
  /** m. 해당 경마장 distances 목록에 있어야 한다 */
  distance: number;
  /**
   * 같은 거리를 여러 레이아웃에서 열 수 있는 경마장(직선 마일 / 라운드 마일 등)에서 레이아웃을 고른다.
   * 생략 시 distances 목록에서 그 거리의 첫 항목.
   */
  layoutId?: string;
  kind: RaceKind;
  grade: RaceGrade | null;
  raceClass: RaceClass;
  conditions: RaceConditions;
  /** 착순별 상금 [1착, 2착, ...] */
  prizeMoney: Money[];
  maxRunners: number;
}

/** 유럽식 분수 오즈. 5/2 → { num: 5, den: 2 }, evens → { num: 1, den: 1 } */
export interface FractionalOdds {
  num: number;
  den: number;
}

/** 한 레이스의 출주 정보(게이트 추첨 후) */
export interface RaceEntry {
  horseId: HorseId;
  /** 마번(새들클로스) 1..N */
  saddleCloth: number;
  /** 게이트 번호 1..N (1 = 내측). 마번과 독립적으로 추첨 */
  draw: number;
  jockeyId: JockeyId;
  /** 실제 부담중량(lb, 견습 감량 반영 후) */
  weightLb: number;
  tactic: RunningStyle;
  silks: Silks;
  isPlayer: boolean;
  /** 발주 직전 오즈(SP). 계산 전이면 null */
  odds: FractionalOdds | null;
}

/** 시뮬레이터에 넘기는 주자 스냅샷 (GameState 없이 계산 가능하도록) */
export interface RunnerInput {
  entry: RaceEntry;
  horse: Pick<
    Horse,
    'id' | 'name' | 'sex' | 'birthYear' | 'ability' | 'aptitude' | 'condition' | 'preferredStyle'
  >;
  jockey: Pick<Jockey, 'id' | 'name' | 'skill'>;
}

export interface RaceSimOptions {
  /** true 면 RaceReplay 를 기록한다 (기본 true). 밸런스 대량 실행 시 false */
  recordReplay?: boolean;
}

export interface RaceSimInput {
  race: Race;
  course: Racecourse;
  going: Going;
  date: GameDate;
  /** runners[i] 의 i 가 이 레이스 안의 runner index */
  runners: RunnerInput[];
  /** 시뮬레이션 시드. 내부에서 createRng(seed).fork('sim') 사용 */
  seed: number;
  options?: RaceSimOptions;
}

/**
 * 레이스 시작 시 한 번 계산하는 주자별 정적 파라미터.
 * 구현: src/engine/race/runnerModel.ts 의 prepareRunner().
 */
export interface PreparedRunner {
  index: number;
  horseId: HorseId;
  style: RunningStyle;
  /** 순항 속도(m/s). 거리·마장·코스 적성, 부담중량, 컨디션, 당일 폼 반영 */
  cruiseSpeed: number;
  /** 스퍼트 최고 속도(m/s) */
  topSpeed: number;
  /** 가속도(m/s²) */
  accel: number;
  /** 스태미나 총량(에너지 단위, 시작 시 잔량 = 이 값) */
  staminaPool: number;
  /** 근성 0~1 */
  guts: number;
  /** 파워 0~1 */
  power: number;
  /** 게이트 반응 지연(s) */
  startDelay: number;
  /** 기수 능력 0~1 */
  jockeySkill: number;
  /** 출발 레인(m, 내측 레일에서) */
  startLane: number;
}

/** 시뮬레이터가 결승 통과 시 남기는 원시 기록 */
export interface FinishRecord {
  runnerIndex: number;
  /** 출발부터 결승선 통과까지(s), 틱 사이 선형 보간 */
  finishTime: number;
  /** RaceResult.sectionalMarks 각 지점 통과 누적 시각(s) */
  markTimes: number[];
}

/** 앞 말과의 착차 표기 */
export type MarginLabel = 'dead_heat' | 'nose' | 'short_head' | 'head' | 'neck' | 'lengths' | 'distance';

export interface Margin {
  label: MarginLabel;
  /** label === 'lengths' 일 때 반올림된 마신 수 (0.5, 0.75, 1, 1.25 ...). 그 외 0 */
  lengths: number;
}

export interface RunnerResult {
  runnerIndex: number;
  horseId: HorseId;
  saddleCloth: number;
  draw: number;
  jockeyId: JockeyId;
  weightLb: number;
  /** 1부터. 동착이면 같은 값 */
  position: number;
  finishTime: number;
  /** 바로 앞 말과의 착차. 1착(및 1착 동착)은 null */
  margin: Margin | null;
  /** 승자와의 누적 착차(마신, 반올림 전 실수) */
  beatenLengths: number;
  /** 구간 타임(s). sectionalMarks 로 나뉜 구간별 소요 시간, 마지막 원소 = 마지막 표지~결승 */
  sectionals: number[];
  /** 성적 지수(lb). 승자 = 0 기준, 패배 마신과 부담중량 보정. M3 레이팅의 입력 */
  performanceFigure: number;
  odds: FractionalOdds | null;
}

export interface RaceResult {
  raceId: RaceId;
  racecourseId: RacecourseId;
  date: GameDate;
  going: Going;
  distance: number;
  seed: number;
  winningTime: number;
  /** 구간 표지 위치(출발점부터 m). 결승선에서 1펄롱(201.168m)씩 거꾸로 잡은 지점 중 MIN_FIRST_SECTION_M(50m) 이상인 것, 오름차순 */
  sectionalMarks: number[];
  /** 착순 오름차순 (동착은 마번 오름차순) */
  runners: RunnerResult[];
}

/** 0.1초 틱 하나의 스냅샷. 배열 인덱스 = runner index */
export interface ReplayFrame {
  t: number;
  progress: number[];
  lane: number[];
  speed: number[];
}

export interface RaceReplay {
  tickSeconds: number;
  /** runner index → horseId */
  horseIds: HorseId[];
  frames: ReplayFrame[];
}

export interface RaceSimOutput {
  result: RaceResult;
  replay: RaceReplay | null;
}
