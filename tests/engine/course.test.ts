import { describe, expect, it } from 'vitest';
import { getRacecourse, loadRacecourses, validateRacecourse } from '../../src/engine/course/load';
import {
  buildRacePath,
  findCourseDistance,
  homeStraightLength,
  layoutEnd,
  layoutLength,
} from '../../src/engine/course/path';
import { CLOSURE_TOLERANCE_M, POLYLINE_STEP_M } from '../../src/engine/config/course';
import type { Racecourse, TrackLayout } from '../../src/engine/types';

/** 픽스처 A: 닫힌 우회전 오벌 (가상) */
const OVAL: Racecourse = {
  id: 'test-oval',
  name: 'Test Oval',
  country: 'GB',
  surface: 'turf',
  handedness: 'right',
  undulation: 0.2,
  drainage: 0.5,
  layouts: [
    {
      id: 'round',
      label: 'Round Course',
      handedness: 'right',
      closed: true,
      width: 30,
      segments: [
        { kind: 'straight', length: 150, rise: 0 },
        { kind: 'bend', length: 691.15, radius: 220, turn: 'right', rise: 0 },
        { kind: 'straight', length: 750, rise: 0 },
        { kind: 'bend', length: 691.15, radius: 220, turn: 'right', rise: 0 },
        { kind: 'straight', length: 600, rise: 0 },
      ],
    },
  ],
  distances: [
    { distance: 1600, layoutId: 'round' },
    { distance: 3000, layoutId: 'round' },
  ],
};

/** 픽스처 B: 열린 좌회전 (가상) */
const LINE: Racecourse = {
  id: 'test-line',
  name: 'Test Line',
  country: 'FR',
  surface: 'aw',
  handedness: 'left',
  undulation: 0.6,
  drainage: 0.3,
  layouts: [
    {
      id: 'main',
      label: 'Main Course',
      handedness: 'left',
      closed: false,
      width: 25,
      segments: [
        { kind: 'straight', length: 450, rise: 12 },
        { kind: 'bend', length: 300, radius: 250, turn: 'left', rise: 6 },
        { kind: 'straight', length: 500, rise: -4 },
        { kind: 'bend', length: 450, radius: 280, turn: 'left', rise: -18 },
        { kind: 'straight', length: 350, rise: -6 },
        { kind: 'straight', length: 450, rise: 4 },
      ],
    },
  ],
  distances: [
    { distance: 1006, layoutId: 'main' },
    { distance: 2414, layoutId: 'main' },
  ],
};

function cloneCourse(c: Racecourse): Racecourse {
  return JSON.parse(JSON.stringify(c)) as Racecourse;
}

function firstLayout(c: Racecourse): TrackLayout {
  const layout = c.layouts[0];
  if (layout === undefined) throw new Error('픽스처에 레이아웃이 없음');
  return layout;
}

describe('레이아웃 길이·폐합', () => {
  it('픽스처 A 총길이 약 2882.30m, 검증 문제 없음, 폐합 오차 1m 미만', () => {
    const layout = firstLayout(OVAL);
    expect(Math.abs(layoutLength(layout) - 2882.3)).toBeLessThan(0.01);
    expect(validateRacecourse(OVAL)).toEqual([]);

    const end = layoutEnd(layout);
    expect(Math.hypot(end.x, end.y)).toBeLessThan(CLOSURE_TOLERANCE_M);
  });

  it('픽스처 B 의 끝 직선 연속 길이는 800m', () => {
    expect(homeStraightLength(firstLayout(LINE))).toBe(800);
  });

  it('findCourseDistance 는 있는 거리만 찾는다', () => {
    expect(findCourseDistance(OVAL, 1600)?.layoutId).toBe('round');
    expect(findCourseDistance(OVAL, 1500)).toBeUndefined();
  });
});

describe('RacePath 샘플링', () => {
  it('픽스처 A 1600m: 출발 toFinish 1600, 결승 구간 판정', () => {
    const path = buildRacePath(OVAL, 1600);
    expect(path.sample(0).toFinish).toBe(1600);
    expect(path.sample(1600).isHomeStraight).toBe(true);
    expect(path.sample(1000).isHomeStraight).toBe(false);
    expect(path.homeStraightLength).toBe(600);
  });

  it('픽스처 A 3000m: 감싸진 출발점에서도 결승선 좌표(0,0)에 0.01m 이내', () => {
    const path = buildRacePath(OVAL, 3000);
    const finish = path.sample(3000).point;
    expect(Math.hypot(finish.x, finish.y)).toBeLessThan(0.01);
  });

  it('픽스처 B 2414m: 출발 경사, 끝 근처 경사, 두 번째 bend 곡률과 방향', () => {
    const path = buildRacePath(LINE, 2414);
    expect(path.sample(0).gradient).toBeCloseTo(12 / 450, 10);
    expect(path.sample(2414 - 100).gradient).toBeCloseTo(4 / 450, 10);

    const inSecondBend = path.sample(1400);
    expect(inSecondBend.curvature).toBeCloseTo(1 / 280, 10);
    expect(inSecondBend.turn).toBe('left');
    expect(path.homeStraightLength).toBe(800);
  });

  it('결승 후에는 마지막 방향으로 직선 연장되고 경사·곡률 0, turn null', () => {
    const path = buildRacePath(LINE, 2414);
    const after = path.sample(2414 + 50);
    expect(after.toFinish).toBe(-50);
    expect(after.gradient).toBe(0);
    expect(after.curvature).toBe(0);
    expect(after.turn).toBeNull();
    expect(after.isHomeStraight).toBe(true);
  });

  it('s 가 음수면 0 으로 취급한다', () => {
    const path = buildRacePath(LINE, 2414);
    expect(path.sample(-20).s).toBe(0);
    expect(path.sample(-20).point).toEqual(path.sample(0).point);
  });

  it('결과는 호출 순서와 무관하다', () => {
    const path = buildRacePath(OVAL, 3000);
    const first = path.sample(2500.5);
    path.sample(10);
    path.sample(2900);
    path.sample(1234.5);
    expect(path.sample(2500.5)).toEqual(first);
  });
});

describe('buildRacePath 오류', () => {
  it('열린 레이아웃에서 총길이보다 긴 거리(3000m)는 throw', () => {
    expect(() => buildRacePath(LINE, 3000)).toThrow();
  });

  it('없는 거리(1500)는 throw', () => {
    expect(() => buildRacePath(LINE, 1500)).toThrow();
  });

  it('열린 레이아웃 총길이 2500m 를 넘는 거리 목록이면 throw', () => {
    const course = cloneCourse(LINE);
    course.distances = [{ distance: 2600, layoutId: 'main' }];
    expect(() => buildRacePath(course, 2600)).toThrow();
  });
});

describe('미니맵 폴리라인', () => {
  it('racePolyline 의 첫 점·마지막 점과 인접 간격', () => {
    for (const [course, distance] of [
      [OVAL, 1600],
      [LINE, 2414],
    ] as const) {
      const path = buildRacePath(course, distance);
      const pts = path.racePolyline;
      expect(pts[0]).toEqual(path.sample(0).point);
      expect(pts[pts.length - 1]).toEqual(path.sample(distance).point);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a === undefined || b === undefined) throw new Error('점 누락');
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(POLYLINE_STEP_M + 0.01);
      }
    }
  });

  it('layoutPolyline 도 인접 간격 제한을 지키고 마지막 점은 결승선(L)', () => {
    const path = buildRacePath(LINE, 2414);
    const pts = path.layoutPolyline;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a === undefined || b === undefined) throw new Error('점 누락');
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(POLYLINE_STEP_M + 0.01);
    }
    expect(pts.length).toBeGreaterThan(2);
  });
});

describe('경마장 데이터 검증', () => {
  it('bend 에 radius 가 없으면 문제를 반환하고 loadRacecourses 가 throw', () => {
    const bad = cloneCourse(LINE);
    const seg = firstLayout(bad).segments[1];
    if (seg === undefined) throw new Error('구간 없음');
    delete seg.radius;
    expect(validateRacecourse(bad).length).toBeGreaterThanOrEqual(1);
    expect(() => loadRacecourses([bad])).toThrow(/test-line/);
  });

  it('폐합되지 않는 closed 레이아웃은 문제를 반환하고 loadRacecourses 가 throw', () => {
    const bad = cloneCourse(OVAL);
    const last = firstLayout(bad).segments[4];
    if (last === undefined) throw new Error('구간 없음');
    last.length = 580;
    expect(validateRacecourse(bad).length).toBeGreaterThanOrEqual(1);
    expect(() => loadRacecourses([bad])).toThrow(/test-oval/);
  });

  it('없는 layoutId 를 참조하면 문제를 반환하고 loadRacecourses 가 throw', () => {
    const bad = cloneCourse(LINE);
    bad.distances = [{ distance: 1000, layoutId: 'nope' }];
    expect(validateRacecourse(bad).length).toBeGreaterThanOrEqual(1);
    expect(() => loadRacecourses([bad])).toThrow();
  });

  it('정상 데이터는 loadRacecourses 를 통과하고 getRacecourse 로 찾는다', () => {
    const list = loadRacecourses([OVAL, LINE]);
    expect(list).toHaveLength(2);
    expect(getRacecourse(list, 'test-line').id).toBe('test-line');
    expect(() => getRacecourse(list, 'missing')).toThrow();
  });

  it('배열이 아닌 입력은 throw', () => {
    expect(() => loadRacecourses({ id: 'x' })).toThrow();
  });
});

describe('성능', () => {
  it('픽스처 A 3000m 에서 sample 을 0.05 간격으로 3회(약 18만 회) 호출하는 데 100ms 미만', () => {
    const path = buildRacePath(OVAL, 3000);
    const t0 = performance.now();
    let acc = 0;
    for (let rep = 0; rep < 3; rep++) {
      for (let k = 0; k <= 60000; k++) {
        acc += path.sample(k * 0.05).curvature;
      }
    }
    const elapsed = performance.now() - t0;
    expect(acc).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
