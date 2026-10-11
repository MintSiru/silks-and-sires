import { ANGLE_TOLERANCE_RATIO, CLOSURE_TOLERANCE_M, RISE_TOLERANCE_M } from '../config/course';
import type { CourseDistance, Handedness, Racecourse, TrackLayout } from '../types';
import { layoutEnd } from './path';

const HANDEDNESS_VALUES: readonly Handedness[] = ['left', 'right', 'straight'];

function isObj(v: unknown): boolean {
  return typeof v === 'object' && v !== null;
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 레이아웃 하나의 문제 목록. 구조 오류가 있으면 기하 검사(폐합·각도)는 건너뛴다. */
function validateLayout(layout: TrackLayout, index: number, distances: readonly CourseDistance[]): string[] {
  const problems: string[] = [];
  const where = `layouts[${index}]`;
  if (!isObj(layout)) return [`${where} 가 객체가 아님`];

  if (!isNonEmptyString(layout.id)) problems.push(`${where} id 가 비어 있음`);
  const label = `${where}(${String(layout.id)})`;
  if (!HANDEDNESS_VALUES.includes(layout.handedness)) {
    problems.push(`${label} handedness 값이 올바르지 않음 (${String(layout.handedness)})`);
  }
  if (typeof layout.closed !== 'boolean') problems.push(`${label} closed 는 boolean 이어야 함`);

  if (!Array.isArray(layout.segments) || layout.segments.length === 0) {
    problems.push(`${label} segments 가 비어 있음`);
    return problems;
  }

  let structOk = true;
  let openTotal = 0;
  let riseSum = 0;
  let bendAngle = 0;

  layout.segments.forEach((seg, i) => {
    const at = `${label} 구간 ${i}`;
    if (!isObj(seg)) {
      problems.push(`${at} 가 객체가 아님`);
      structOk = false;
      return;
    }
    if (seg.kind !== 'straight' && seg.kind !== 'bend') {
      problems.push(`${at} kind 값이 올바르지 않음 (${String(seg.kind)})`);
      structOk = false;
      return;
    }
    if (!isFiniteNumber(seg.length) || seg.length <= 0) {
      problems.push(`${at} length 는 0보다 커야 함`);
      structOk = false;
      return;
    }
    if (!isFiniteNumber(seg.rise)) {
      problems.push(`${at} rise 가 숫자가 아님`);
      structOk = false;
      return;
    }
    openTotal += seg.length;
    riseSum += seg.rise;

    if (seg.kind === 'straight') {
      if (seg.radius !== undefined || seg.turn !== undefined) {
        problems.push(`${at} straight 에는 radius/turn 이 없어야 함`);
        structOk = false;
      }
      return;
    }

    if (!isFiniteNumber(seg.radius) || seg.radius <= 0) {
      problems.push(`${at} bend 에 radius(0보다 큰 값)가 없음`);
      structOk = false;
      return;
    }
    if (layout.handedness === 'straight') {
      problems.push(`${at}: handedness 'straight' 레이아웃에는 bend 가 있을 수 없음`);
      structOk = false;
    } else if (seg.turn !== layout.handedness) {
      problems.push(`${at} turn(${String(seg.turn)})이 레이아웃 handedness(${layout.handedness})와 다름`);
      structOk = false;
    }
    bendAngle += seg.length / seg.radius;
  });

  if (!structOk) return problems;

  if (!layout.closed) {
    let maxDistance: number | undefined;
    for (const d of distances) {
      if (!isObj(d) || d.layoutId !== layout.id) continue;
      if (maxDistance === undefined || d.distance > maxDistance) maxDistance = d.distance;
    }
    if (maxDistance !== undefined && openTotal < maxDistance) {
      problems.push(`${label} 열린 레이아웃 총길이(${openTotal}m)가 최대 거리(${maxDistance}m)보다 짧음`);
    }
    return problems;
  }

  if (Math.abs(riseSum) > RISE_TOLERANCE_M) {
    problems.push(`${label} 닫힌 레이아웃 고도 변화 합(${riseSum}m)이 0이 아님`);
  }
  const fullTurn = 2 * Math.PI;
  if (Math.abs(bendAngle - fullTurn) > ANGLE_TOLERANCE_RATIO * fullTurn) {
    problems.push(`${label} bend 각도 합(${bendAngle} rad)이 2π 와 다름`);
  }
  const end = layoutEnd(layout);
  if (!(Math.hypot(end.x, end.y) <= CLOSURE_TOLERANCE_M)) {
    problems.push(`${label} 닫힌 레이아웃이 폐합되지 않음 (끝점 거리 ${Math.hypot(end.x, end.y)}m)`);
  }
  return problems;
}

/** 경마장 데이터 검증. 문제가 없으면 빈 배열. */
export function validateRacecourse(c: Racecourse): string[] {
  if (!isObj(c)) return ['경마장 데이터가 객체가 아님'];
  const problems: string[] = [];

  if (!isNonEmptyString(c.id)) problems.push('id 가 비어 있음');
  if (!isNonEmptyString(c.name)) problems.push('name 이 비어 있음');
  if (c.surface !== 'turf' && c.surface !== 'aw') {
    problems.push(`surface 는 turf 또는 aw 여야 함 (${String(c.surface)})`);
  }

  if (!Array.isArray(c.layouts) || c.layouts.length === 0) {
    problems.push('layouts 는 1개 이상이어야 함');
  }
  if (!Array.isArray(c.distances)) problems.push('distances 는 배열이어야 함');

  const layouts: readonly TrackLayout[] = Array.isArray(c.layouts) ? c.layouts : [];
  const distances: readonly CourseDistance[] = Array.isArray(c.distances) ? c.distances : [];

  const layoutIds = new Set<string>();
  layouts.forEach((layout, i) => {
    if (isObj(layout) && isNonEmptyString(layout.id)) {
      if (layoutIds.has(layout.id)) problems.push(`layout id 중복: ${layout.id}`);
      layoutIds.add(layout.id);
    }
    problems.push(...validateLayout(layout, i, distances));
  });

  for (const d of distances) {
    if (!isObj(d)) {
      problems.push('distances 항목이 객체가 아님');
      continue;
    }
    if (!isFiniteNumber(d.distance) || d.distance <= 0) {
      problems.push(`distance 값이 올바르지 않음 (${String(d.distance)})`);
    }
    if (!layoutIds.has(d.layoutId)) {
      problems.push(`distances 의 layoutId 를 찾을 수 없음: ${String(d.layoutId)} (${String(d.distance)}m)`);
    }
  }

  return problems;
}

/** 경마장 목록 로드. 배열이 아니거나 검증 실패가 있으면 Error (메시지에 경마장 id 와 문제 포함). */
export function loadRacecourses(raw: unknown): Racecourse[] {
  if (!Array.isArray(raw)) throw new Error('경마장 데이터는 배열이어야 함');
  const items: unknown[] = raw;
  const result: Racecourse[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  items.forEach((item, i) => {
    const label = isObj(item) && typeof (item as { id?: unknown }).id === 'string'
      ? String((item as { id: string }).id)
      : `#${i}`;
    const c = item as Racecourse;
    const problems = validateRacecourse(c);
    if (isObj(item) && isNonEmptyString(c.id)) {
      if (seen.has(c.id)) problems.push(`경마장 id 중복: ${c.id}`);
      seen.add(c.id);
    }
    if (problems.length > 0) {
      errors.push(`[${label}] ${problems.join('; ')}`);
    } else {
      result.push(c);
    }
  });

  if (errors.length > 0) {
    throw new Error(`경마장 데이터 검증 실패: ${errors.join(' | ')}`);
  }
  return result;
}

export function getRacecourse(list: readonly Racecourse[], id: string): Racecourse {
  const found = list.find((c) => c.id === id);
  if (found === undefined) throw new Error(`경마장을 찾을 수 없음: ${id}`);
  return found;
}
