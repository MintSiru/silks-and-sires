import { POLYLINE_STEP_M } from '../config/course';
import type {
  CourseDistance,
  PathPoint,
  Racecourse,
  RacePath,
  RacePathSample,
  TrackLayout,
  TrackSegment,
} from '../types';

/** 기하 계산 중간 상태: 위치와 진행 방향(수학 좌표, 0 = +x, 반시계 +) */
interface Pose {
  x: number;
  y: number;
  h: number;
}

/** 구간 하나의 사전 계산 결과 (시작 u, 시작 자세, 경사, 곡률) */
interface SegGeom {
  seg: TrackSegment;
  /** 레이아웃 시작부터의 누적 거리 u */
  start: number;
  length: number;
  pose: Pose;
  /** pose.h 의 cos·sin (구간 시작 자세에서 고정, 샘플마다 다시 계산하지 않는다) */
  cos0: number;
  sin0: number;
  gradient: number;
  curvature: number;
  turn: 'left' | 'right' | null;
  /** 구간 캠버 (seg.camber ?? 0) */
  camber: number;
}

interface LayoutGeom {
  segs: SegGeom[];
  total: number;
  end: Pose;
  /** end.h 의 cos·sin */
  endCos: number;
  endSin: number;
}

/**
 * 구간 안에서 t 만큼 진행한 자세를 out 에 쓴다 (해석적 계산, 적분 없음, 할당 없음).
 * 시작 자세는 (px, py, ph) 이고 cph = cos(ph), sph = sin(ph) 를 호출자가 넘긴다(같은 값을 다시 계산하지 않기 위해).
 * 연산 순서는 advance 원본과 같다(결과 비트 동일).
 */
function advanceInto(
  seg: TrackSegment,
  px: number,
  py: number,
  ph: number,
  cph: number,
  sph: number,
  t: number,
  out: Pose,
): void {
  if (seg.kind === 'straight') {
    out.x = px + t * cph;
    out.y = py + t * sph;
    out.h = ph;
    return;
  }
  const r = seg.radius ?? 0;
  const sigma = seg.turn === 'left' ? 1 : -1;
  const h = ph + sigma * (t / r);
  out.x = px + sigma * r * (Math.sin(h) - sph);
  out.y = py - sigma * r * (Math.cos(h) - cph);
  out.h = h;
}

/** 구간 안에서 t 만큼 진행한 자세 (해석적 계산, 적분 없음) */
function advance(seg: TrackSegment, p: Pose, t: number): Pose {
  const out: Pose = { x: 0, y: 0, h: 0 };
  advanceInto(seg, p.x, p.y, p.h, Math.cos(p.h), Math.sin(p.h), t, out);
  return out;
}

function buildGeometry(layout: TrackLayout): LayoutGeom {
  const segs: SegGeom[] = [];
  let pose: Pose = { x: 0, y: 0, h: 0 };
  let u = 0;
  for (const seg of layout.segments) {
    const isBend = seg.kind === 'bend';
    const radius = seg.radius ?? 0;
    segs.push({
      seg,
      start: u,
      length: seg.length,
      pose,
      cos0: Math.cos(pose.h),
      sin0: Math.sin(pose.h),
      gradient: seg.rise / seg.length,
      curvature: isBend ? 1 / radius : 0,
      turn: isBend ? (seg.turn ?? null) : null,
      camber: seg.camber ?? 0,
    });
    pose = advance(seg, pose, seg.length);
    u += seg.length;
  }
  return { segs, total: u, end: pose, endCos: Math.cos(pose.h), endSin: Math.sin(pose.h) };
}

/** u 가 속한 구간을 이분 탐색한다. 탐색 순서와 무관하게 같은 결과. */
function locate(segs: readonly SegGeom[], u: number): SegGeom {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const cand = segs[mid];
    if (cand !== undefined && cand.start <= u) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const found = segs[lo];
  if (found === undefined) throw new Error('구간이 없는 레이아웃');
  return found;
}

interface LocalState {
  x: number;
  y: number;
  gradient: number;
  curvature: number;
  turn: 'left' | 'right' | null;
  /** 구간 캠버(생략 = 0) */
  camber: number;
  /** 해당 지점의 진행 방향 */
  h: number;
}

/** 레이아웃 좌표 u (0 ~ total 로 가정, 범위 밖은 끝으로 자른다) 의 국소 상태를 out 에 쓴다 (할당 없음) */
function localInto(geom: LayoutGeom, u: number, out: LocalState): void {
  const g = locate(geom.segs, u);
  const t = Math.min(Math.max(u - g.start, 0), g.length);
  advanceInto(g.seg, g.pose.x, g.pose.y, g.pose.h, g.cos0, g.sin0, t, out);
  out.gradient = g.gradient;
  out.curvature = g.curvature;
  out.turn = g.turn;
  out.camber = g.camber;
}

/** 레이아웃 좌표 u 의 국소 상태 (새 객체) */
function localAt(geom: LayoutGeom, u: number): LocalState {
  const out: LocalState = { x: 0, y: 0, gradient: 0, curvature: 0, turn: null, camber: 0, h: 0 };
  localInto(geom, u, out);
  return out;
}

/** 구간 시작점과 방향을 기준으로 한 레이아웃 끝 자세 (폐합 검사 등에 사용) */
export function layoutEnd(layout: TrackLayout): { x: number; y: number; heading: number } {
  const end = buildGeometry(layout).end;
  return { x: end.x, y: end.y, heading: end.h };
}

export function layoutLength(layout: TrackLayout): number {
  let total = 0;
  for (const seg of layout.segments) total += seg.length;
  return total;
}

/** 끝에서부터 연속된 straight 구간 길이 합 */
export function homeStraightLength(layout: TrackLayout): number {
  let total = 0;
  for (let i = layout.segments.length - 1; i >= 0; i--) {
    const seg = layout.segments[i];
    if (seg === undefined || seg.kind !== 'straight') break;
    total += seg.length;
  }
  return total;
}

export function findCourseDistance(course: Racecourse, distance: number): CourseDistance | undefined {
  return course.distances.find((d) => d.distance === distance);
}

export function buildRacePath(course: Racecourse, distance: number): RacePath {
  const cd = findCourseDistance(course, distance);
  if (cd === undefined) {
    throw new Error(`경마장 ${course.id}: ${distance}m 는 열 수 있는 거리가 아님`);
  }
  const layout = course.layouts.find((l) => l.id === cd.layoutId);
  if (layout === undefined) {
    throw new Error(`경마장 ${course.id}: layoutId ${cd.layoutId} 를 찾을 수 없음`);
  }
  if (layout.segments.length === 0) {
    throw new Error(`경마장 ${course.id}: 레이아웃 ${layout.id} 에 구간이 없음`);
  }

  const geom = buildGeometry(layout);
  const total = geom.total;
  const closed = layout.closed;
  if (!closed && distance > total) {
    throw new Error(
      `경마장 ${course.id}: 레이아웃 ${layout.id} 총길이 ${total}m 보다 긴 ${distance}m 레이스`,
    );
  }

  const hs = homeStraightLength(layout);
  // 결승 후 연장 구간에 쓰는 캠버: 마지막 구간의 값 (생략 = 0)
  const lastCamber = geom.segs[geom.segs.length - 1]?.camber ?? 0;
  // 출발점 u0: closed 면 [0, L) 로 감싸고, open 이면 L - distance (>= 0 은 위에서 보장)
  const u0 = closed ? (((total - distance) % total) + total) % total : total - distance;

  /** 국소 상태 임시 버퍼 (sampleInto 전용, 호출 사이에 값을 남기지 않는다) */
  const localBuf: LocalState = { x: 0, y: 0, gradient: 0, curvature: 0, turn: null, camber: 0, h: 0 };

  /** sample(s) 와 같은 값을 out 에 쓴다. out.point 객체를 재사용하며 새 객체를 만들지 않는다. */
  const fillSample = (s: number, out: RacePathSample): RacePathSample => {
    const sc = s > 0 ? s : 0;
    const toFinish = distance - sc;
    const u = u0 + sc;

    const local = localBuf;
    if (closed) {
      localInto(geom, u % total, local);
    } else if (u <= total) {
      localInto(geom, u, local);
    } else {
      // 결승 후(open): 마지막 구간 끝에서 마지막 방향 그대로 직선 연장
      const d = u - total;
      local.x = geom.end.x + d * geom.endCos;
      local.y = geom.end.y + d * geom.endSin;
      local.h = geom.end.h;
      local.gradient = 0;
      local.curvature = 0;
      local.turn = null;
      // 결승 후 연장 구간은 마지막 구간의 캠버를 그대로 이어받는다
      local.camber = lastCamber;
    }

    out.s = sc;
    out.toFinish = toFinish;
    out.gradient = local.gradient;
    out.curvature = local.curvature;
    out.turn = local.turn;
    out.camber = local.camber;
    // 결승선 기준 마지막 직선 위인가. 직선 시작점(toFinish === hs)은 직선 밖으로 본다.
    out.isHomeStraight = toFinish < 0 || toFinish < hs;
    out.point.x = local.x;
    out.point.y = local.y;
    return out;
  };

  const sampleAt = (s: number): RacePathSample =>
    fillSample(s, {
      s: 0,
      toFinish: 0,
      gradient: 0,
      curvature: 0,
      turn: null,
      isHomeStraight: false,
      camber: 0,
      point: { x: 0, y: 0 },
    });

  const layoutPolyline: PathPoint[] = [];
  for (let k = 0; k * POLYLINE_STEP_M < total; k++) {
    const local = localAt(geom, k * POLYLINE_STEP_M);
    layoutPolyline.push({ x: local.x, y: local.y });
  }
  const layoutEndLocal = localAt(geom, total);
  layoutPolyline.push({ x: layoutEndLocal.x, y: layoutEndLocal.y });

  const racePolyline: PathPoint[] = [];
  for (let k = 0; k * POLYLINE_STEP_M < distance; k++) {
    racePolyline.push(sampleAt(k * POLYLINE_STEP_M).point);
  }
  racePolyline.push(sampleAt(distance).point);

  return {
    racecourseId: course.id,
    layoutId: layout.id,
    handedness: layout.handedness,
    surface: course.surface,
    distance,
    homeStraightLength: hs,
    width: layout.width,
    sample: sampleAt,
    sampleInto: fillSample,
    layoutPolyline,
    racePolyline,
  };
}
