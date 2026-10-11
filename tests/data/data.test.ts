import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import racesJson from '../../data/races.json';
import namesJson from '../../data/names.json';
import { buildRacePath, layoutEnd } from '../../src/engine/course/path';
import type { Racecourse, TrackLayout } from '../../src/engine/types/course';
import type { Race } from '../../src/engine/types/race';

interface Names {
  horses: string[];
  jockeys: string[];
  owners: string[];
}

const racecourses = racecoursesJson as Racecourse[];
const races = racesJson as Race[];
const names = namesJson as Names;

/** 실명 금지 목록 (CLAUDE.md 원칙 1, M1-02 명세 2). 대소문자 무시, 부분 문자열 검사. */
const FORBIDDEN_WORDS = [
  // 클래식 유형명(Derby, Oaks, Guineas, St Leger)은 일반어로 허용(2026-10-11 사용자 결정).
  // 실제 레이스 전체 이름이 되는 조합만 금지한다.
  'Epsom Derby',
  'Irish Derby',
  'Kentucky Derby',
  'French Derby',
  'German Derby',
  'Deutsches Derby',
  'Derby Italiano',
  'Epsom Oaks',
  'Irish Oaks',
  'Kentucky Oaks',
  "Oaks d'Italia",
  'Irish 1000 Guineas',
  'Irish 2000 Guineas',
  'Irish St Leger',
  'Arc',
  'Triomphe',
  'Jockey Club',
  'Diane',
  'Eclipse',
  'Sussex',
  'Coronation',
  'King George',
  'Queen Elizabeth',
  'Queen Anne',
  'St James',
  'Ascot',
  'Epsom',
  'Newmarket',
  'Goodwood',
  'York',
  'Doncaster',
  'Longchamp',
  'Chantilly',
  'Deauville',
  'Curragh',
  'Leopardstown',
  'Irish Champion',
  'Nunthorpe',
  'July Cup',
  'Ebor',
  'Cesarewitch',
  'Cambridgeshire',
  'Lincoln',
  'Gold Cup',
  'Breeders',
  'Juddmonte',
  'Coolmore',
  'Godolphin',
  'Darley',
  'Tattersalls',
  'Goffs',
  'Arqana',
  'Qipco',
  // 아일랜드 실제 경마장 (명세 1-(4))
  'Dundalk',
  'Fairyhouse',
  'Punchestown',
  'Galway',
  'Navan',
  'Naas',
  'Cork',
  'Limerick',
  'Tipperary',
  'Gowran',
  'Killarney',
  'Listowel',
  'Tramore',
  'Wexford',
  'Down Royal',
  'Downpatrick',
  'Sligo',
  'Roscommon',
  'Ballinrobe',
  'Bellewstown',
  'Clonmel',
  'Kilbeggan',
  'Laytown',
  'Thurles',
  // 기타 실제 경마장·토공 상표
  'Cheltenham',
  'Newbury',
  'Haydock',
  'Kempton',
  'Sandown',
  'Lingfield',
  'Wolverhampton',
  'Musselburgh',
  'Ripon',
  'Saint-Cloud',
  'Tapeta',
];

const EXPECTED_DISTANCE_SLOTS = 3;

function sumLengths(layout: TrackLayout): number {
  return layout.segments.reduce((acc, seg) => acc + seg.length, 0);
}

/** 미니맵 다양성 (2차 반려 C 개정): 주 레이아웃 실루엣 거리 하한. 근거는 _courses_review.md 3장 */
const SHAPE_MIN_DISTANCE = 0.01;
const SHAPE_SAMPLES = 64;
/** 둘레 제한(실제 경마장 규모). 닫힌 고리 1,800~3,300m, 열린 말굽 총길이 ≤ 4,200m */
const PERIMETER_MIN_M = 1800;
const PERIMETER_MAX_M = 3300;
const OPEN_MAX_M = 4200;
/** 둘레 상한 예외: 2차 반려에서 "바꾸지 않는다"로 지정된 기존 고리 (Kingsmere 4,374m, Ravensbridge 4,022m) */
const PERIMETER_EXEMPT = ['kingsmere_triangle', 'ravensbridge_oval'];

interface ShapeEntry { ctx: string; shape: { pts: [number, number][]; closed: boolean } }

/** 폴리라인을 둘레(호 길이) 기준 n점으로 리샘플 */
function resampleByArc(points: { x: number; y: number }[], closed: boolean, n: number): [number, number][] {
  const P = closed ? [...points, points[0] as { x: number; y: number }] : points;
  const cum: number[] = [0];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1] as { x: number; y: number };
    const b = P[i] as { x: number; y: number };
    cum.push((cum[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const L = cum[cum.length - 1] as number;
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const target = closed ? (k * L) / n : (k * L) / (n - 1);
    let j = 0;
    while (j < cum.length - 2 && (cum[j + 1] as number) < target) j++;
    const seg = (cum[j + 1] as number) - (cum[j] as number);
    const f = seg > 0 ? (target - (cum[j] as number)) / seg : 0;
    const a = P[j] as { x: number; y: number };
    const b = P[j + 1] as { x: number; y: number };
    out.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]);
  }
  return out;
}

/** 중심을 원점, 둘레를 1로 정규화한 실루엣 */
function normalizedShape(points: { x: number; y: number }[], closed: boolean): { pts: [number, number][]; closed: boolean } {
  const raw = resampleByArc(points, closed, SHAPE_SAMPLES);
  const cx = raw.reduce((acc, p) => acc + p[0], 0) / raw.length;
  const cy = raw.reduce((acc, p) => acc + p[1], 0) / raw.length;
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (closed) {
    const a = points[points.length - 1] as { x: number; y: number };
    const b = points[0] as { x: number; y: number };
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { pts: raw.map(([x, y]) => [(x - cx) / L, (y - cy) / L]), closed };
}

/** 두 실루엣의 거리: 방향(정·역)·좌우 반전·(고리는) 시작점 이동 중 최소 평균 점 거리 */
function shapeDistance(a: { pts: [number, number][]; closed: boolean }, b: { pts: [number, number][]; closed: boolean }): number {
  const n = a.pts.length;
  let best = Infinity;
  for (const mirror of [false, true]) {
    for (const reverse of [false, true]) {
      let q = b.pts.map(([x, y]): [number, number] => [mirror ? -x : x, y]);
      if (reverse) q = [...q].reverse();
      const shifts = a.closed && b.closed ? n : 1;
      for (let k = 0; k < shifts; k++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const p = a.pts[i] as [number, number];
          const r = q[(i + k) % n] as [number, number];
          sum += Math.hypot(p[0] - r[0], p[1] - r[1]);
        }
        best = Math.min(best, sum / n);
      }
    }
  }
  return best;
}

/** 주 레이아웃(커브 2개 이상) 실루엣 목록: GB·IE·DE·IT, AW 제외 */
function mainRoundLayouts(): ShapeEntry[] {
  const out: ShapeEntry[] = [];
  for (const course of racecourses.filter((c) => ['GB', 'IE', 'DE', 'IT'].includes(c.country) && c.surface !== 'aw')) {
    for (const layout of course.layouts) {
      if (layout.segments.filter((s) => s.kind === 'bend').length < 2) continue;
      const cd = course.distances.find((d) => d.layoutId === layout.id);
      if (cd === undefined) throw new Error(`${course.id}/${layout.id} 거리 없음`);
      const pts = buildRacePath(course, cd.distance, layout.id).layoutPolyline;
      out.push({ ctx: `${course.id}/${layout.id}`, shape: normalizedShape(pts, layout.closed) });
    }
  }
  return out;
}

describe('racecourses.json', () => {
  it('경마장 19곳(영국 9·프랑스 1·아일랜드 4(AW 1)·독일 3·이탈리아 2), 잔디 18·AW 1, id 중복 없음', () => {
    expect(racecourses.length).toBe(19);
    const ids = racecourses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(racecourses.filter((c) => c.surface === 'turf').length).toBe(18);
    expect(racecourses.filter((c) => c.surface === 'aw').length).toBe(1);
  });

  it('영국 9곳(M3-A3a)은 명세의 필수 거리를 갖고, 필수 특징 태그를 포함한다', () => {
    const required: Record<string, { distances: number[]; features: string[] }> = {
      ashcombe: { distances: [1006, 1408, 1710, 2414], features: ['uphill_finish', 'downhill_run', 'camber', 'tight_turns', 'undulating'] },
      marlow_downs: { distances: [1006, 1207, 1408, 1609, 1811, 2012, 2414, 2816, 3620], features: ['straight_course', 'dip', 'uphill_finish', 'galloping'] },
      kingsmere_heath: { distances: [1006, 1207, 1609, 2012, 2414, 3218, 4023], features: ['uphill_finish', 'downhill_run', 'straight_course', 'undulating'] },
      easterholm: { distances: [1006, 1207, 1408, 1609, 2072, 2414, 2816, 3319], features: ['galloping', 'long_straight'] },
      selsworth_downs: { distances: [1006, 1207, 1408, 1609, 2012, 2414, 3218], features: ['undulating', 'downhill_run', 'tight_turns', 'straight_course'] },
      dunholme_moor: { distances: [1006, 1207, 1408, 1609, 2012, 2414, 2921, 3620], features: ['galloping', 'long_straight', 'straight_course'] },
      ravensbridge_park: { distances: [1006, 1609, 2012, 2414], features: ['uphill_finish', 'short_straight'] },
      aldermoor_park: { distances: [1006, 1207, 1609, 2012, 2816], features: ['galloping', 'straight_course'] },
      wexborough: { distances: [1006, 1207, 1408, 1609, 2012, 2414], features: ['galloping', 'straight_course', 'long_straight'] },
      kilcarrow_heath: { distances: [1006, 1207, 1408, 1609, 2012, 2414, 2816, 3218], features: ['galloping', 'long_straight', 'straight_course', 'undulating'] },
      ballinvar: { distances: [1207, 1408, 1609, 2012, 2414, 2816], features: ['short_straight', 'tight_turns'] },
      tullamere: { distances: [1006, 1207, 1609, 2012, 2414], features: ['uphill_finish'] },
      ardvarrow_park: { distances: [1006, 1207, 1408, 1609, 2012, 2816], features: ['tight_turns'] },
      hohenmoor: { distances: [1207, 1609, 2012, 2414], features: ['uphill_finish'] },
      wesselfeld: { distances: [1207, 1609, 2012, 2213, 2414], features: ['undulating'] },
      lichtenau: { distances: [1207, 1408, 1609, 2012, 2414, 2816], features: ['undulating', 'downhill_run'] },
      torreverde: { distances: [1207, 1609, 2012, 2213, 2414], features: ['galloping'] },
      valmerano: { distances: [1207, 1609, 2012, 2213, 2414, 2816], features: ['long_straight', 'galloping'] },
    };
    for (const [id, spec] of Object.entries(required)) {
      const course = racecourses.find((c) => c.id === id);
      expect(course, id).toBeDefined();
      if (course === undefined) continue;
      const have = course.distances.map((d) => d.distance);
      for (const d of spec.distances) expect(have, `${id} ${d}`).toContain(d);
      for (const f of spec.features) expect(course.features ?? [], `${id} ${f}`).toContain(f);
    }
  });

  it('모든 distances 의 layoutId 는 그 경마장 layouts 에 존재하고, (distance, layoutId) 쌍은 경마장 안에서 중복되지 않는다', () => {
    for (const course of racecourses) {
      const layoutIds = new Set(course.layouts.map((l) => l.id));
      const pairs = course.distances.map((d) => `${d.distance}|${d.layoutId}`);
      expect(new Set(pairs).size, course.id).toBe(pairs.length);
      for (const d of course.distances) {
        expect(layoutIds.has(d.layoutId), `${course.id}: ${d.layoutId}`).toBe(true);
      }
    }
  });

  it('같은 거리를 두 레이아웃이 나눠 쓰면 첫 항목이 기본(주) 레이아웃이다 (Rowley 직선 먼저)', () => {
    const marlow = racecourses.find((c) => c.id === 'marlow_downs');
    expect(marlow?.distances.find((d) => d.distance === 1609)?.layoutId).toBe('marlow_straight');
    const dunholme = racecourses.find((c) => c.id === 'dunholme_moor');
    expect(dunholme?.distances.find((d) => d.distance === 1609)?.layoutId).toBe('dunholme_straight');
    const kingsmere = racecourses.find((c) => c.id === 'kingsmere_heath');
    expect(kingsmere?.distances.find((d) => d.distance === 1609)?.layoutId).toBe('kingsmere_straight');
  });

  it('커브 시퀀스(회전각을 10° 단위 반올림)는 GB·IE·DE·IT 라운드 레이아웃 전체에서 서로 다르다 (영국 9곳 포함)', () => {
    const DEG = 180 / Math.PI;
    const signature = (layout: { segments: { kind: string; length: number; radius?: number }[] }): string =>
      layout.segments
        .filter((s) => s.kind === 'bend')
        // 0.01° 단위로 먼저 정리해 부동소수 오차로 .5 경계가 흔들리지 않게 한 뒤 10° 단위로 반올림(반올림 .5 는 올림)
        .map((s) => Math.round(Math.round(((s.length / (s.radius as number)) * DEG) * 100) / 1000) * 10)
        .join(',');
    const sigs = racecourses
      .filter((c) => ['GB', 'IE', 'DE', 'IT'].includes(c.country) && c.surface !== 'aw')
      .flatMap((c) =>
        c.layouts
          .filter((l) => l.segments.filter((s) => s.kind === 'bend').length >= 2)
          .map((l) => ({ ctx: `${c.id}/${l.id}`, sig: signature(l) })),
      );
    expect(sigs.length).toBeGreaterThanOrEqual(17);
    const bySig = new Map<string, string[]>();
    for (const s of sigs) bySig.set(s.sig, [...(bySig.get(s.sig) ?? []), s.ctx]);
    const dupes = [...bySig.entries()].filter(([, ctxs]) => ctxs.length > 1);
    expect(dupes, '같은 커브 시퀀스').toEqual([]);
  });

  it('미니맵 다양성: 주 레이아웃의 정규화 실루엣 거리 d ≥ SHAPE_MIN_DISTANCE (모든 쌍, 2차 반려 C 개정)', () => {
    const shapes = mainRoundLayouts();
    expect(shapes.length).toBeGreaterThanOrEqual(17);
    const clashes: string[] = [];
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i] as ShapeEntry;
        const b = shapes[j] as ShapeEntry;
        const d = shapeDistance(a.shape, b.shape);
        if (d < SHAPE_MIN_DISTANCE) clashes.push(`${a.ctx} ~ ${b.ctx} (d=${d.toFixed(4)})`);
      }
    }
    expect(clashes, `d < ${SHAPE_MIN_DISTANCE} 인 쌍`).toEqual([]);
  });

  it('둘레·크기 제한: 닫힌 고리 둘레 1,800~3,300m (예외: 기존 Kingsmere·Ravensbridge), 열린 말굽 총길이 ≤ 4,200m', () => {
    for (const course of racecourses.filter((c) => ['GB', 'IE', 'DE', 'IT'].includes(c.country) && c.surface !== 'aw')) {
      for (const layout of course.layouts) {
        if (layout.segments.filter((s) => s.kind === 'bend').length < 2) continue;
        const total = layout.segments.reduce((acc, s) => acc + s.length, 0);
        if (layout.closed) {
          if (PERIMETER_EXEMPT.includes(layout.id)) continue;
          expect(total, `${course.id}/${layout.id} 둘레`).toBeGreaterThanOrEqual(PERIMETER_MIN_M);
          expect(total, `${course.id}/${layout.id} 둘레`).toBeLessThanOrEqual(PERIMETER_MAX_M);
        } else {
          expect(total, `${course.id}/${layout.id} 총길이`).toBeLessThanOrEqual(OPEN_MAX_M);
        }
      }
    }
  });

  it('닫힌 레이아웃(GB·IE·DE·IT)은 끝점이 시작점에서 0.5m 이내로 폐합된다', () => {
    for (const course of racecourses.filter((c) => ['GB', 'IE', 'DE', 'IT'].includes(c.country) && c.surface !== 'aw')) {
      for (const layout of course.layouts) {
        if (!layout.closed) continue;
        const end = layoutEnd(layout);
        expect(Math.hypot(end.x, end.y), `${course.id}/${layout.id} 폐합 오차`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('영국 9곳·M3-A3b 라운드 레이아웃(커브 2개 이상) 형상 규칙 (AW 제외, 2차 검수 반려 1번 확장)', () => {
    const DEG = 180 / Math.PI;
    /** 회전각(도)이 90의 배수에서 10도 이상 떨어져 있는가 */
    const offMultiple90 = (deg: number): boolean => {
      const r = ((deg % 90) + 90) % 90;
      return Math.min(r, 90 - r) > 10;
    };
    for (const course of racecourses.filter((c) => ['GB', 'IE', 'DE', 'IT'].includes(c.country) && c.surface !== 'aw')) {
      for (const layout of course.layouts) {
        const bends = layout.segments.filter((s) => s.kind === 'bend');
        if (bends.length < 2) continue;
        const ctx = `${course.id}/${layout.id}`;
        const curves = bends.map((s) => ({
          radius: s.radius as number,
          deg: (s.length / (s.radius as number)) * DEG,
        }));
        // 규칙 1: 반경 종류 2개 이상, 최대/최소 >= 1.3
        const radii = [...new Set(curves.map((c) => c.radius))];
        expect(radii.length, `${ctx} 반경 종류`).toBeGreaterThanOrEqual(2);
        expect(Math.max(...radii) / Math.min(...radii), `${ctx} 반경 비율`).toBeGreaterThanOrEqual(1.3);
        // 규칙 2: 90·180 의 정수배(±10°)가 아닌 커브 최소 1개
        expect(curves.some((c) => offMultiple90(c.deg)), `${ctx} 비정수배 커브`).toBe(true);
        // 규칙 3: 직선 사이 15~35° 엘보(반경 400~700)
        expect(
          curves.some((c) => c.radius >= 400 && c.radius <= 700 && c.deg >= 15 && c.deg <= 35),
          `${ctx} 엘보`,
        ).toBe(true);
        // 규칙 4: 좌우 대칭 스타디움 금지 (같은 반경 두 커브 + 같은 길이 두 직선)
        const straights = layout.segments.filter((s) => s.kind === 'straight');
        const stadium =
          bends.length === 2 &&
          bends[0]?.radius === bends[1]?.radius &&
          straights.length === 2 &&
          straights[0]?.length === straights[1]?.length;
        expect(stadium, `${ctx} 스타디움`).toBe(false);
      }
    }
  });

  it('closed=false 레이아웃은 구간 길이 합 >= 그 레이아웃을 쓰는 최대 거리', () => {
    for (const course of racecourses) {
      for (const layout of course.layouts) {
        if (layout.closed) continue;
        const used = course.distances.filter((d) => d.layoutId === layout.id).map((d) => d.distance);
        if (used.length === 0) continue;
        const maxDistance = Math.max(...used);
        expect(sumLengths(layout), `${course.id}/${layout.id}`).toBeGreaterThanOrEqual(maxDistance);
      }
    }
  });

  it('bend 는 radius>0 이고 turn 이 레이아웃 handedness 와 같다. straight 에는 radius/turn 이 없다. straight 레이아웃에는 bend 가 없다', () => {
    for (const course of racecourses) {
      for (const layout of course.layouts) {
        for (const seg of layout.segments) {
          if (seg.kind === 'bend') {
            expect(layout.handedness, `${layout.id}`).not.toBe('straight');
            expect(seg.radius, `${layout.id} bend radius`).toBeGreaterThan(0);
            expect(seg.turn, `${layout.id} bend turn`).toBe(layout.handedness);
          } else {
            expect(seg, `${layout.id} straight keys`).not.toHaveProperty('radius');
            expect(seg, `${layout.id} straight keys`).not.toHaveProperty('turn');
          }
        }
      }
    }
  });

  it('closed=true 레이아웃: rise 합 = 0(±0.01), bend 각도 합(length/radius) = 2π(±1%)', () => {
    let closedCount = 0;
    for (const course of racecourses) {
      for (const layout of course.layouts) {
        if (!layout.closed) continue;
        closedCount += 1;
        const riseSum = layout.segments.reduce((acc, seg) => acc + seg.rise, 0);
        expect(Math.abs(riseSum), `${layout.id} rise 합`).toBeLessThanOrEqual(0.01);
        const angle = layout.segments
          .filter((seg) => seg.kind === 'bend')
          .reduce((acc, seg) => acc + seg.length / (seg.radius as number), 0);
        expect(Math.abs(angle - 2 * Math.PI) / (2 * Math.PI), `${layout.id} 각도`).toBeLessThanOrEqual(0.01);
      }
    }
    expect(closedCount).toBeGreaterThan(0);
  });
});

describe('races.json', () => {
  it('레이스 12개, id 중복 없음, 레이스가 정의된 경마장마다 3개 (나머지 경마장의 레이스는 M3-A4 에서 추가)', () => {
    expect(races.length).toBe(12);
    const ids = races.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const course of racecourses) {
      const count = races.filter((r) => r.racecourseId === course.id).length;
      if (count === 0) continue;
      expect(count, course.id).toBe(EXPECTED_DISTANCE_SLOTS);
    }
  });

  it('racecourseId 는 존재하고 distance 는 그 경마장 distances 에 있다', () => {
    for (const race of races) {
      const course = racecourses.find((c) => c.id === race.racecourseId);
      expect(course, race.id).toBeDefined();
      expect(course!.distances.map((d) => d.distance), race.id).toContain(race.distance);
    }
  });

  it('경마장별 슬롯: 잔디는 그룹 1 + 핸디캡 1 + 메이든 1, AW 는 리스티드 1 + 핸디캡 1 + 메이든 1', () => {
    for (const course of racecourses) {
      const mine = races.filter((r) => r.racecourseId === course.id);
      if (mine.length === 0) continue;
      const kinds = mine.map((r) => r.kind).sort();
      const expected = course.surface === 'aw'
        ? ['handicap', 'listed', 'maiden']
        : ['group', 'handicap', 'maiden'];
      expect(kinds, course.id).toEqual(expected);
    }
  });

  it('kind 와 grade 가 일치한다 (group→G1~G3, listed→L, 그 외 null)', () => {
    for (const race of races) {
      if (race.kind === 'group') {
        expect(['G1', 'G2', 'G3'], race.id).toContain(race.grade);
      } else if (race.kind === 'listed') {
        expect(race.grade, race.id).toBe('L');
      } else {
        expect(race.grade, race.id).toBeNull();
      }
    }
  });

  it('group/listed 는 raceClass 1, handicap 은 2~3, maiden 은 4~5', () => {
    for (const race of races) {
      if (race.kind === 'group' || race.kind === 'listed') {
        expect(race.raceClass, race.id).toBe(1);
      } else if (race.kind === 'handicap') {
        expect([2, 3], race.id).toContain(race.raceClass);
      } else if (race.kind === 'maiden') {
        expect([4, 5], race.id).toContain(race.raceClass);
      }
    }
  });

  it('핸디캡은 ratingMin/Max 가 있고 weightSystem handicap, 그 외는 ratingMin/Max null 이고 weightSystem wfa', () => {
    for (const race of races) {
      const c = race.conditions;
      if (race.kind === 'handicap') {
        expect(typeof c.ratingMin, race.id).toBe('number');
        expect(typeof c.ratingMax, race.id).toBe('number');
        expect(c.ratingMin as number, race.id).toBeLessThan(c.ratingMax as number);
        expect(c.weightSystem, race.id).toBe('handicap');
      } else {
        expect(c.ratingMin, race.id).toBeNull();
        expect(c.ratingMax, race.id).toBeNull();
        expect(c.weightSystem, race.id).toBe('wfa');
      }
    }
  });

  it('연령·성별·기준 부담중량 규칙', () => {
    for (const race of races) {
      const c = race.conditions;
      expect([2, 3, 4], race.id).toContain(c.minAge);
      expect(c.maxAge === null || c.maxAge === c.minAge, race.id).toBe(true);
      expect(['open', 'fillies_mares', 'colts_geldings'], race.id).toContain(c.sex);
      expect([126, 129], race.id).toContain(c.baseWeightLb);
    }
    const fillies = races.filter((r) => r.conditions.sex === 'fillies_mares');
    expect(fillies.length).toBeGreaterThanOrEqual(2);
  });

  it('prizeMoney 는 길이 4~6, 정수, 양수, 내림차순(엄격)', () => {
    for (const race of races) {
      const p = race.prizeMoney;
      expect(p.length, race.id).toBeGreaterThanOrEqual(4);
      expect(p.length, race.id).toBeLessThanOrEqual(6);
      for (let i = 0; i < p.length; i += 1) {
        expect(Number.isInteger(p[i]), `${race.id}[${i}]`).toBe(true);
        expect(p[i], `${race.id}[${i}]`).toBeGreaterThan(0);
        if (i > 0) expect(p[i], `${race.id}[${i}]`).toBeLessThan(p[i - 1] as number);
      }
    }
  });

  it('maxRunners 는 10~20, AW 코스 레이스는 14 이하', () => {
    for (const race of races) {
      expect(race.maxRunners, race.id).toBeGreaterThanOrEqual(10);
      expect(race.maxRunners, race.id).toBeLessThanOrEqual(20);
      const course = racecourses.find((c) => c.id === race.racecourseId);
      if (course?.surface === 'aw') {
        expect(race.maxRunners, race.id).toBeLessThanOrEqual(14);
      }
    }
  });

  it('id 는 <racecourseId>_<snake> 형태', () => {
    for (const race of races) {
      expect(race.id.startsWith(`${race.racecourseId}_`), race.id).toBe(true);
    }
  });
});

describe('names.json', () => {
  it('horses 80, jockeys 30, owners 30 개', () => {
    expect(names.horses.length).toBe(80);
    expect(names.jockeys.length).toBe(30);
    expect(names.owners.length).toBe(30);
  });

  it('각 목록은 중복이 없고, horses 는 18자 이하', () => {
    for (const key of ['horses', 'jockeys', 'owners'] as const) {
      const list = names[key];
      expect(new Set(list).size, key).toBe(list.length);
    }
    for (const horse of names.horses) {
      expect(horse.length, horse).toBeLessThanOrEqual(18);
    }
  });
});

describe('실명 금지 (원칙 1)', () => {
  it('races·racecourses·names JSON 전체 문자열에 금지 단어가 없다 (대소문자 무시)', () => {
    const blob = JSON.stringify([racesJson, racecoursesJson, namesJson]).toLowerCase();
    const hits = FORBIDDEN_WORDS.filter((word) => blob.includes(word.toLowerCase()));
    expect(hits).toEqual([]);
  });
});
