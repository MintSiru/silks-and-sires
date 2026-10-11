import type { CountryCode, RacecourseId } from './common';

export type Surface = 'turf' | 'aw' | 'dirt';

/** 레이아웃 회전 방향. 직선 코스는 'straight'. */
export type Handedness = 'left' | 'right' | 'straight';

/**
 * 트랙 구간 하나. 길이는 내측 레일 기준(m).
 * - straight: radius/turn 없음
 * - bend: radius(m, > 0)와 turn 방향 필수
 */
export interface TrackSegment {
  kind: 'straight' | 'bend';
  length: number;
  radius?: number;
  turn?: 'left' | 'right';
  /** 구간 전체 고도 변화(m). + 오르막, - 내리막. 구간 안에서는 일정한 경사로 본다. */
  rise: number;
}

/**
 * 트랙 레이아웃. segments 는 진행 순서대로이며 **마지막 구간의 끝이 결승선**이다.
 * 거리 D 레이스의 출발점은 결승선에서 D 만큼 거꾸로 거슬러 올라간 지점이다.
 * closed=true 면 첫 구간과 마지막 구간이 이어진 고리(oval)이므로 거슬러 올라갈 때 감아 돈다.
 * closed=false 면 segments 총길이 >= 이 레이아웃의 최대 레이스 거리여야 한다.
 */
export interface TrackLayout {
  id: string;
  /** 표시명 (예: "Round Course", "Straight Course") */
  label: string;
  handedness: Handedness;
  closed: boolean;
  /** 주로 폭(m). 레인(lane) 값의 상한. */
  width: number;
  segments: TrackSegment[];
}

/** 이 경마장에서 열 수 있는 레이스 거리와 그 거리를 쓰는 레이아웃 */
export interface CourseDistance {
  /** m */
  distance: number;
  layoutId: string;
}

export interface Racecourse {
  id: RacecourseId;
  /** 가상 이름 */
  name: string;
  country: CountryCode;
  surface: Surface;
  /** 대표 회전 방향(표시용). 실제 계산은 layout.handedness 사용 */
  handedness: Handedness;
  /** 기복 정도 0(평탄)~1(매우 기복) — 표시·밸런스 참고용 */
  undulation: number;
  /** 배수 0(나쁨)~1(좋음) — 당일 마장 추첨에 사용 */
  drainage: number;
  layouts: TrackLayout[];
  distances: CourseDistance[];
}

/** 미니맵 좌표(m 단위, 임의 원점). 뷰어가 화면에 맞게 축소한다. */
export interface PathPoint {
  x: number;
  y: number;
}

/** 레이스 경로 위 한 지점의 정보 */
export interface RacePathSample {
  /** 출발점부터 내측 레일 기준 진행 거리(m) */
  s: number;
  /** 결승선까지 남은 거리(m) = distance - s (결승 후 음수) */
  toFinish: number;
  /** 경사(rise/run). + 오르막 */
  gradient: number;
  /** 곡률 1/R (직선 0, 항상 >= 0) */
  curvature: number;
  turn: 'left' | 'right' | null;
  /** 마지막 직선 구간 위인가 */
  isHomeStraight: boolean;
  /** 미니맵 좌표 */
  point: PathPoint;
}

/**
 * 특정 경마장·거리의 레이스 경로. 구현: src/engine/course/path.ts 의 buildRacePath().
 * sample(s) 는 s < 0 이면 0 으로, s > distance 이면 결승선 너머(마지막 구간 연장 직선)로 처리한다.
 */
export interface RacePath {
  racecourseId: RacecourseId;
  layoutId: string;
  handedness: Handedness;
  surface: Surface;
  distance: number;
  /** 마지막 직선 길이(m) */
  homeStraightLength: number;
  /** 주로 폭(m) */
  width: number;
  sample(s: number): RacePathSample;
  /** sample(s) 와 같은 값을 out 에 써서 반환(새 객체 할당 없음). out.point 객체도 재사용한다 */
  sampleInto(s: number, out: RacePathSample): RacePathSample;
  /** 레이아웃 전체 폴리라인(미니맵 배경) */
  layoutPolyline: PathPoint[];
  /** 출발점~결승선 폴리라인(미니맵 강조) */
  racePolyline: PathPoint[];
}
