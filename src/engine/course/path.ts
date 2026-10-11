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
  gradient: number;
  curvature: number;
  turn: 'left' | 'right' | null;
}

interface LayoutGeom {
  segs: SegGeom[];
  total: number;
  end: Pose;
}

/** 구간 안에서 t 만큼 진행한 자세 (해석적 계산, 적분 없음) */
function advance(seg: TrackSegment, p: Pose, t: number): Pose {
  if (seg.kind === 'straight') {
    return { x: p.x + t * Math.cos(p.h), y: p.y + t * Math.sin(p.h), h: p.h };
  }
  const r = seg.radius ?? 0;
  const sigma = seg.turn === 'left' ? 1 : -1;
  const h = p.h + sigma * (t / r);
  return {
    x: p.x + sigma * r * (Math.sin(h) - Math.sin(p.h)),
    y: p.y - sigma * r * (Math.cos(h) - Math.cos(p.h)),
    h,
  };
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
      gradient: seg.rise / seg.length,
      curvature: isBend ? 1 / radius : 0,
      turn: isBend ? (seg.turn ?? null) : null,
    });
    pose = advance(seg, pose, seg.length);
    u += seg.length;
  }
  return { segs, total: u, end: pose };
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
  /** 해당 지점의 진행 방향 */
  h: number;
}

/** 레이아웃 좌표 u (0 ~ total 로 가정, 범위 밖은 끝으로 자른다) 의 국소 상태 */
function localAt(geom: LayoutGeom, u: number): LocalState {
  const g = locate(geom.segs, u);
  const t = Math.min(Math.max(u - g.start, 0), g.length);
  const p = advance(g.seg, g.pose, t);
  return {
    x: p.x,
    y: p.y,
    h: p.h,
    gradient: g.gradient,
    curvature: g.curvature,
    turn: g.turn,
  };
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
  // 출발점 u0: closed 면 [0, L) 로 감싸고, open 이면 L - distance (>= 0 은 위에서 보장)
  const u0 = closed ? (((total - distance) % total) + total) % total : total - distance;

  const sampleAt = (s: number): RacePathSample => {
    const sc = s > 0 ? s : 0;
    const toFinish = distance - sc;
    const u = u0 + sc;

    let local: LocalState;
    if (closed) {
      local = localAt(geom, u % total);
    } else if (u <= total) {
      local = localAt(geom, u);
    } else {
      // 결승 후(open): 마지막 구간 끝에서 마지막 방향 그대로 직선 연장
      const d = u - total;
      local = {
        x: geom.end.x + d * Math.cos(geom.end.h),
        y: geom.end.y + d * Math.sin(geom.end.h),
        h: geom.end.h,
        gradient: 0,
        curvature: 0,
        turn: null,
      };
    }

    const point: PathPoint = { x: local.x, y: local.y };
    return {
      s: sc,
      toFinish,
      gradient: local.gradient,
      curvature: local.curvature,
      turn: local.turn,
      // 결승선 기준 마지막 직선 위인가. 직선 시작점(toFinish === hs)은 직선 밖으로 본다.
      isHomeStraight: toFinish < 0 || toFinish < hs,
      point,
    };
  };

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
    layoutPolyline,
    racePolyline,
  };
}
