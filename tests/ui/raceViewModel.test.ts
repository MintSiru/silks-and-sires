import { describe, expect, it } from 'vitest';
import type {
  RaceEntry,
  RacePath,
  RaceReplay,
  RaceResult,
  ReplayFrame,
  RunnerResult,
  Silks,
} from '../../src/engine/types';
import {
  buildStripModel,
  cameraWindow,
  fieldSpreadM,
  frameAt,
  placeDiscs,
  smoothedLanes,
  stallYs,
} from '../../src/ui/race-viewer/viewModel';
import type { Rect, ViewerInfo } from '../../src/ui/race-viewer/viewModel';

// ── 합성 픽스처 (M7-R1: 게이트 · 레인 분산 · 이름표) ─────────────────────
const DISTANCE = 1200;
const WIDTH = 1200;
const HEIGHT = 240;
/** 중앙 띠 사각형(좌 250, 우 290 패널 제외) */
const RECT: Rect = { x: 250, y: 0, w: WIDTH - 250 - 290, h: HEIGHT };
const PALETTE = ['#1040c0', '#ffd100', '#ffffff', '#c01010', '#1f2a36', '#20a040', '#e070c0', '#808080', '#ff7f00', '#6b3fa0'];
/** 5두 기본 속도(m/s). 결승 시각 60.0 · 60.6 · 61.5 · 62.5 · 66.7 s */
const SPEEDS5 = [20, 19.8, 19.5, 19.2, 18];

function silksFor(i: number): Silks {
  return { primary: PALETTE[i % PALETTE.length] ?? '#000000', secondary: '#ffffff', pattern: 'plain' };
}

function entriesFor(n: number, playerIndex: number | null): RaceEntry[] {
  return Array.from({ length: n }, (_, i): RaceEntry => ({
    horseId: `h${i}`,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: `j${i}`,
    weightLb: 126,
    tactic: 'prominent',
    silks: silksFor(i),
    isPlayer: i === playerIndex,
    odds: null,
  }));
}

function infoFor(n: number, playerIndex: number | null = 2): ViewerInfo {
  return {
    raceName: 'Sample Stakes',
    grade: 'G3',
    courseName: 'Sample Park',
    surface: 'turf',
    distance: DISTANCE,
    going: 'good',
    entries: entriesFor(n, playerIndex),
    horseNames: Array.from({ length: n }, (_, i) => `Horse${i}`),
  };
}

/** 0.1s 틱 리플레이. progressAt / laneAt 으로 주자별 값을 정한다. */
function replayOf(
  n: number,
  tEnd: number,
  progressAt: (i: number, t: number) => number,
  laneAt: (i: number, t: number) => number,
): RaceReplay {
  const frames: ReplayFrame[] = [];
  const last = Math.round(tEnd * 10);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k <= last; k++) {
    const t = k / 10;
    frames.push({
      t,
      progress: idx.map((i) => progressAt(i, t)),
      lane: idx.map((i) => laneAt(i, t)),
      speed: idx.map(() => 18),
    });
  }
  return { tickSeconds: 0.1, horseIds: idx.map((i) => `h${i}`), frames };
}

/** 5두 기본 리플레이: 속도 SPEEDS5, 레인 고정 [0,1,0,2,1] */
const LANES5 = [0, 1, 0, 2, 1];
function replay5(): RaceReplay {
  return replayOf(5, 80, (i, t) => (SPEEDS5[i] ?? 0) * t, (i) => LANES5[i] ?? 0);
}

function makePath(): RacePath {
  return {
    racecourseId: 'sample-course',
    layoutId: 'straight',
    handedness: 'straight',
    surface: 'turf',
    distance: DISTANCE,
    homeStraightLength: DISTANCE,
    width: 30,
    sampleInto(s: number, out) {
      return Object.assign(out, this.sample(s));
    },
    sample(s: number) {
      const sc = Math.max(0, s);
      return {
        s: sc,
        toFinish: DISTANCE - sc,
        gradient: 0,
        curvature: 0,
        turn: null,
        isHomeStraight: true,
        camber: 0,
        point: { x: sc, y: 0 },
      };
    },
    layoutPolyline: [
      { x: 0, y: 0 },
      { x: 1400, y: 0 },
    ],
    racePolyline: [
      { x: 0, y: 0 },
      { x: DISTANCE, y: 0 },
    ],
  };
}

/** 주자 n두 결과. 착순은 runnerIndex 순, 2착은 코, 3착은 1½마신. */
function resultOf(n: number): RaceResult {
  const runners: RunnerResult[] = Array.from({ length: n }, (_, i): RunnerResult => {
    let margin: RunnerResult['margin'] = { label: 'lengths', lengths: 1.5 };
    if (i === 0) margin = null;
    if (i === 1) margin = { label: 'nose', lengths: 0 };
    return {
      runnerIndex: i,
      horseId: `h${i}`,
      saddleCloth: i + 1,
      draw: i + 1,
      jockeyId: `j${i}`,
      weightLb: 126,
      position: i + 1,
      finishTime: DISTANCE / (SPEEDS5[i] ?? 18),
      margin,
      beatenLengths: 0,
      sectionals: [],
      performanceFigure: 0,
      odds: null,
    };
  });
  return {
    raceId: 'sample-race',
    racecourseId: 'sample-course',
    date: { year: 2026, week: 10 },
    going: 'good',
    distance: DISTANCE,
    seed: 1,
    winningTime: runners[0]?.finishTime ?? 0,
    sectionalMarks: [],
    runners,
  };
}

function build(args: {
  replay: RaceReplay;
  t: number;
  info: ViewerInfo;
  result: RaceResult;
}) {
  return buildStripModel({ ...args, path: makePath(), width: WIDTH, height: HEIGHT });
}

// ── 출발 대기 게이트 ────────────────────────────────────────────────────
describe('게이트 단계 (gate.phase)', () => {
  const replay = replay5();
  const info = infoFor(5);
  const result = resultOf(5);

  it('τ=−2.0 loading, −0.5 ready, 0.1 open, 1.0 left(뒤에 남음)', () => {
    expect(build({ replay, t: -2.0, info, result }).gate?.phase).toBe('loading');
    expect(build({ replay, t: -0.5, info, result }).gate?.phase).toBe('ready');
    expect(build({ replay, t: 0.1, info, result }).gate?.phase).toBe('open');
    expect(build({ replay, t: 1.0, info, result }).gate?.phase).toBe('left');
  });

  it('M7-R2b: 출발 뒤 게이트는 카메라와 함께 왼쪽으로 흐르고, 앞문이 띠 밖으로 나가면 한 번만 사라진다', () => {
    let prevX = Infinity;
    let gone = false;
    for (let t = 0.5; t <= 70; t += 0.5) {
      const gate = build({ replay, t, info, result }).gate;
      if (gate === null) {
        gone = true;
        continue;
      }
      expect(gone).toBe(false);
      expect(gate.phase).toBe('left');
      expect(gate.remaining).toBe(0);
      expect(gate.x).toBeLessThanOrEqual(prevX + 1e-9);
      prevX = gate.x;
    }
    expect(gone).toBe(true);
    expect(build({ replay, t: 70, info, result }).gate).toBeNull();
  });

  it('출발까지 남은 초: loading·ready 는 −τ, open 은 0', () => {
    expect(build({ replay, t: -2.0, info, result }).gate?.remaining).toBeCloseTo(2.0, 9);
    expect(build({ replay, t: 0.1, info, result }).gate?.remaining).toBe(0);
  });

  it('칸 y 는 draw 1 이 가장 아래, 칸 수는 출주 수', () => {
    const stalls = build({ replay, t: -2.0, info, result }).gate?.stalls ?? [];
    expect(stalls).toHaveLength(5);
    for (let k = 1; k < stalls.length; k++) {
      expect(stalls[k - 1]!).toBeGreaterThan(stalls[k]!);
    }
    for (const y of stalls) {
      expect(y).toBeGreaterThanOrEqual(RECT.y);
      expect(y).toBeLessThanOrEqual(RECT.y + RECT.h);
    }
  });

  it('로딩 중 원판은 칸 x 보다 뒤에 있고, ready 부터는 칸 x 에 선다', () => {
    const loading = build({ replay, t: -2.0, info, result });
    const gateX = loading.gate?.x ?? NaN;
    for (const d of loading.center.discs) expect(d.x).toBeLessThan(gateX);
    const ready = build({ replay, t: -1.0, info, result });
    for (const d of ready.center.discs) expect(d.x).toBeCloseTo(ready.gate?.x ?? NaN, 9);
  });

  it('출발 순간(τ=0) 원판 y 는 자기 칸 y (draw 순)', () => {
    const model = build({ replay, t: 0, info, result });
    const stalls = model.gate?.stalls ?? [];
    for (const d of model.center.discs) {
      expect(d.y).toBeCloseTo(stalls[d.runnerIndex] ?? NaN, 9);
    }
  });

  it('첫 1.5s 동안 칸 y 에서 레인 y 로 보간: τ=0.75 는 두 값의 중간, τ=2 는 레인 y', () => {
    const stall0 = build({ replay, t: 0, info, result }).gate?.stalls[0] ?? NaN;
    // 0번 주자는 레인 0 이고 맨 먼저 자리를 잡으므로 레인 y = 바닥 레일 y(rect.y + rect.h − r)
    const railY = RECT.y + RECT.h - 13;
    const mid = build({ replay, t: 0.75, info, result }).center.discs.find((d) => d.runnerIndex === 0);
    expect(mid?.y).toBeCloseTo((stall0 + railY) / 2, 6);
    const after = build({ replay, t: 2, info, result }).center.discs.find((d) => d.runnerIndex === 0);
    expect(after?.y).toBeCloseTo(railY, 9);
  });

  it('결과만(τ = 결승 시각) 은 게이트가 없다', () => {
    expect(build({ replay, t: 70, info, result }).gate).toBeNull();
  });
});

// ── 레인 분산 · 떨림 제거 ──────────────────────────────────────────────
describe('레인 분산 (y 매핑)', () => {
  it('레일 근처(0~3m) 10두가 뭉친 프레임에서 원판 y 범위가 사용 높이의 60% 이상', () => {
    // 10두가 거의 같은 자리(progress 차 0.2m)에서 레인 0~3m 로 달린다 → 겹침 밀기가 적용된다.
    const replay = replayOf(10, 40, (i, t) => 18 * t + 0.2 * i, (i) => 0.33 * i);
    const model = build({ replay, t: 20, info: infoFor(10, null), result: resultOf(10) });
    const ys = model.center.discs.map((d) => d.y);
    const usableH = RECT.h - 2 * 13;
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(0.6 * usableH);
  });

  it('필드 폭 W: 최대 레인 + 1m 과 하한 6m 중 큰 값, 창 밖 프레임은 무시', () => {
    expect(fieldSpreadM(replay5(), 10)).toBe(6);
    const tall = replayOf(5, 80, (i, t) => (SPEEDS5[i] ?? 0) * t, (i) => (i === 3 ? 8 : 0));
    expect(fieldSpreadM(tall, 10)).toBe(9);
    const spike = replayOf(5, 80, (i, t) => (SPEEDS5[i] ?? 0) * t, (i, t) => (i === 3 && t >= 29 && t <= 31 ? 8 : 0));
    expect(fieldSpreadM(spike, 10)).toBe(6);
    expect(fieldSpreadM(spike, 29.5)).toBe(9);
  });

  it('레인 이동 평균: 선형으로 증가하는 레인은 같은 시각 값과 같다', () => {
    const ramp = replayOf(1, 40, () => 0, (_, t) => t);
    expect(smoothedLanes(ramp, 10)[0]).toBeCloseTo(10, 9);
  });

  it('칸 y 목록은 띠 안에 있고 간격이 같다', () => {
    const stalls = stallYs(5, RECT);
    const gaps = stalls.slice(1).map((y, k) => (stalls[k] ?? 0) - y);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0] ?? NaN, 9);
    expect(Math.min(...stalls)).toBeGreaterThanOrEqual(RECT.y + 13);
    expect(Math.max(...stalls)).toBeLessThanOrEqual(RECT.y + RECT.h - 13);
  });

  it('같은 τ 두 번 계산하면 같은 모델(결정성)', () => {
    const replay = replayOf(10, 40, (i, t) => 18 * t + 0.2 * i, (i) => 0.33 * i);
    const info = infoFor(10, 2);
    const result = resultOf(10);
    const a = build({ replay, t: 7.3, info, result });
    const b = build({ replay, t: 7.3, info, result });
    expect(b).toEqual(a);
  });

  it('연속 τ 에서 그리기 순서는 레인 바깥→안쪽, 같은 레인은 runnerIndex 순 (고정 레인 [0,1,0,2,1] → [3,1,4,0,2])', () => {
    const replay = replay5();
    const info = infoFor(5);
    const result = resultOf(5);
    for (let t = -2.4; t < 20; t += 0.37) {
      const order = build({ replay, t, info, result }).center.discs.map((d) => d.runnerIndex);
      expect(order).toEqual([3, 1, 4, 0, 2]);
    }
  });

  it('원판 배치 함수는 같은 입력에 같은 결과를 준다(placeDiscs 직접 호출)', () => {
    const replay = replay5();
    const frame = frameAt(replay, 5);
    const win = cameraWindow(frame, DISTANCE);
    const a = placeDiscs(frame, win, infoFor(5), RECT, 6);
    const b = placeDiscs(frame, win, infoFor(5), RECT, 6);
    expect(b).toEqual(a);
  });
});

// ── 이름표 · 내 순위 · 펄롱 표지 ───────────────────────────────────────
describe('플레이어 이름표 · 내 순위 · 표지', () => {
  const replay = replay5();
  const result = resultOf(5);

  it('플레이어 말이 있으면 이름표와 순위가 채워진다', () => {
    const model = build({ replay, t: 10, info: infoFor(5, 2), result });
    expect(model.playerTags).toHaveLength(1);
    expect(model.playerTags[0]?.name).toBe('Horse2');
    const disc = model.center.discs.find((d) => d.isPlayer);
    expect(model.playerTags[0]?.y).toBeLessThan(disc?.y ?? 0);
    // t=10: 선두 200m, 내 말(3번째 속도) 195m → 3위, 선두와 5m 차
    expect(model.myStanding?.position).toBe(3);
    expect(model.myStanding?.behind).not.toBeNull();
  });

  it('선두 플레이어는 behind 가 null', () => {
    const model = build({ replay, t: 10, info: infoFor(5, 0), result });
    expect(model.myStanding).toEqual({ position: 1, behind: null });
  });

  it('결승 후에는 확정 순위와 확정 착차를 쓴다', () => {
    const model = build({ replay, t: 62, info: infoFor(5, 2), result });
    expect(model.myStanding).toEqual({ position: 3, behind: '1½마신' });
  });

  it('플레이어 말이 없으면 playerTags 는 빈 배열, myStanding 은 null', () => {
    const model = build({ replay, t: 10, info: infoFor(5, null), result });
    expect(model.playerTags).toEqual([]);
    expect(model.myStanding).toBeNull();
  });

  it('top-level poles 는 펄롱 표지와 결승선 F 를 x 오름차순으로 가진다', () => {
    const inWindow = build({ replay, t: 62, info: infoFor(5, 2), result });
    expect(inWindow.poles.map((p) => p.label)).toContain('F');
    const xs = inWindow.poles.map((p) => p.x);
    for (let k = 1; k < xs.length; k++) expect(xs[k]!).toBeGreaterThanOrEqual(xs[k - 1]!);
    const early = build({ replay, t: 10, info: infoFor(5, 2), result });
    expect(early.poles.map((p) => p.label)).not.toContain('F');
  });

  it('surface 는 info.surface 를 그대로 준다', () => {
    expect(build({ replay, t: 10, info: infoFor(5, 2), result }).surface).toBe('turf');
  });
});

// ── M7-R2b: 출발 전 인기 순 · 게이트 옆 이름표 ─────────────────────────
describe('M7-R2b: 출발 전 인기 순 · 게이트 옆 이름표', () => {
  const replay = replay5();
  const result = resultOf(5);
  /** 오즈 9, 2, 없음, 5/2, 4 → 인기 순 1·3·4·0·2 (runner index) */
  const withOdds = (player: number | null): ViewerInfo => {
    const base = infoFor(5, player);
    const odds = [{ num: 9, den: 1 }, { num: 2, den: 1 }, null, { num: 5, den: 2 }, { num: 4, den: 1 }];
    return { ...base, entries: base.entries.map((e, i) => ({ ...e, odds: odds[i] ?? null })) };
  };

  it('출발 전 우측 패널은 인기 순 상위 3두(오즈만)를 보이고 제목은 인기 순', () => {
    const model = build({ replay, t: -2, info: withOdds(3), result });
    expect(model.right.heading).toBe('인기 순');
    expect(model.right.rows.map((r) => r.runnerIndex)).toEqual([1, 3, 4]);
    expect(model.right.rows.every((r) => r.marginText === '')).toBe(true);
    expect(model.myStanding).toBeNull();
  });

  it('출발 전 내 말은 인기 순위와 오즈(myFavourite)를 준다', () => {
    const model = build({ replay, t: -2, info: withOdds(3), result });
    expect(model.myFavourite?.rank).toBe(2);
    expect(model.myFavourite?.oddsText).not.toBe('-');
    const none = build({ replay, t: -2, info: withOdds(null), result });
    expect(none.myFavourite).toBeNull();
  });

  it('출발 뒤에는 제목·인기 순 줄이 없고 실시간 순위를 쓴다', () => {
    const model = build({ replay, t: 10, info: withOdds(3), result });
    expect(model.right.heading).toBeNull();
    expect(model.myFavourite).toBeNull();
    expect(model.right.rows.map((r) => r.runnerIndex)).toEqual([0, 1, 2]);
  });

  it('게이트 단계(loading·ready)에는 이름표가 게이트 오른쪽 앞문 바깥에 같은 높이로 온다', () => {
    for (const t of [-2, -0.5]) {
      const model = build({ replay, t, info: withOdds(2), result });
      const disc = model.center.discs.find((d) => d.isPlayer);
      const gateX = model.gate?.x ?? NaN;
      expect(model.playerTags[0]?.placement).toBe('right');
      expect(model.playerTags[0]?.y).toBeCloseTo(disc?.y ?? NaN, 9);
      expect(model.playerTags[0]?.x).toBeGreaterThan(gateX);
    }
  });

  it('게이트 밖(출발 뒤)에는 이름표가 원판 위쪽(above)에 온다', () => {
    const model = build({ replay, t: 10, info: withOdds(2), result });
    expect(model.playerTags[0]?.placement).toBe('above');
  });
});
