import { describe, expect, it } from 'vitest';
import type {
  FractionalOdds,
  RaceEntry,
  RaceReplay,
  RaceResult,
  RacePath,
  ReplayFrame,
  RunnerResult,
} from '../../src/engine/types';
import { drawStrip } from '../../src/ui/race-viewer/stripRenderer';
import { buildStripModel } from '../../src/ui/race-viewer/viewModel';
import type { StripModel, ViewerInfo } from '../../src/ui/race-viewer/viewModel';

// ── 합성 픽스처 (시뮬레이터 미사용) ─────────────────────────────────────
const DISTANCE = 1200;
const SPEEDS = [20, 19.8, 19.5, 19.2, 18.0];
const PRIMARIES = ['#1040c0', '#ffd100', '#ffffff', '#c01010', '#1f2a36'];
const ODDS: (FractionalOdds | null)[] = [{ num: 5, den: 2 }, { num: 3, den: 1 }, null, null, null];

function makeEntries(): RaceEntry[] {
  return PRIMARIES.map((primary, i) => ({
    horseId: `h${i}`,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: `j${i}`,
    weightLb: 126,
    tactic: 'prominent',
    silks: { primary, secondary: '#000000', pattern: 'plain' },
    isPlayer: i === 2,
    odds: ODDS[i] ?? null,
  }));
}

function makeInfo(): ViewerInfo {
  return {
    raceName: 'Sample Stakes',
    grade: 'G3',
    courseName: 'Sample Park',
    surface: 'turf',
    distance: DISTANCE,
    going: 'good',
    entries: makeEntries(),
    horseNames: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
  };
}

function makeReplay(): RaceReplay {
  const frames: ReplayFrame[] = [];
  for (let k = 0; k <= 700; k++) {
    const t = k * 0.1;
    frames.push({
      t: Math.round(t * 10) / 10,
      progress: SPEEDS.map((v) => v * t),
      lane: [0, 1, 0, 2, 1],
      speed: [...SPEEDS],
    });
  }
  return { tickSeconds: 0.1, horseIds: ['h0', 'h1', 'h2', 'h3', 'h4'], frames };
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

function runnerResult(i: number, position: number, finishTime: number, margin: RunnerResult['margin']): RunnerResult {
  const entry = makeEntries()[i];
  if (entry === undefined) throw new Error('fixture');
  return {
    runnerIndex: i,
    horseId: entry.horseId,
    saddleCloth: entry.saddleCloth,
    draw: entry.draw,
    jockeyId: entry.jockeyId,
    weightLb: entry.weightLb,
    position,
    finishTime,
    margin,
    beatenLengths: 0,
    sectionals: [finishTime],
    performanceFigure: 0,
    odds: entry.odds,
  };
}

function makeResult(): RaceResult {
  return {
    raceId: 'sample-race',
    racecourseId: 'sample-course',
    date: { year: 2026, week: 10 },
    going: 'good',
    distance: DISTANCE,
    seed: 1,
    winningTime: DISTANCE / SPEEDS[0]!,
    sectionalMarks: [],
    runners: [
      runnerResult(0, 1, DISTANCE / SPEEDS[0]!, null),
      runnerResult(1, 2, DISTANCE / SPEEDS[1]!, { label: 'nose', lengths: 0 }),
      runnerResult(2, 3, DISTANCE / SPEEDS[2]!, { label: 'lengths', lengths: 1.5 }),
      runnerResult(3, 4, DISTANCE / SPEEDS[3]!, { label: 'lengths', lengths: 0.5 }),
      runnerResult(4, 5, DISTANCE / SPEEDS[4]!, { label: 'distance', lengths: 0 }),
    ],
  };
}

function modelAt(t: number): StripModel {
  return buildStripModel({
    replay: makeReplay(),
    t,
    path: makePath(),
    info: makeInfo(),
    result: makeResult(),
    width: 1200,
    height: 200,
  });
}

// ── 기록용 가짜 ctx ─────────────────────────────────────────────────────
interface Call {
  name: string;
  args: unknown[];
}

/** 모든 메서드 호출과 속성 대입을 calls 에 쌓는다. */
function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === 'string') {
        calls.push({ name: `set:${prop}`, args: [value] });
        target[prop] = value;
      }
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function countOf(calls: Call[], name: string): number {
  return calls.filter((c) => c.name === name).length;
}

function texts(calls: Call[]): string[] {
  return calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
}

describe('drawStrip', () => {
  it('arc 호출 수가 출주 두수 이상', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    expect(countOf(calls, 'arc')).toBeGreaterThanOrEqual(makeEntries().length);
  });

  it('fillText 에 레이스명과 마장 라벨이 포함', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    const all = texts(calls);
    expect(all.some((s) => s.includes('Sample Stakes'))).toBe(true);
    // M7-R2: 마장은 한국어('GOOD' → '좋음'), 주로·거리는 '잔디 1,200m (6f)' 식
    expect(all.some((s) => s.includes('마장 좋음'))).toBe(true);
    expect(all.some((s) => s.startsWith('잔디 '))).toBe(true);
  });

  it('save 와 restore 호출 수가 같다', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    expect(countOf(calls, 'save')).toBeGreaterThan(0);
    expect(countOf(calls, 'save')).toBe(countOf(calls, 'restore'));
  });

  it('승자 통과 후 2초 동안 사진 판정 컷을 그린다', () => {
    // 승자 결승 60s, 컷 60~62s
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(61));
    expect(texts(calls)).toContain('사진 판정');
  });

  it('결승 전에는 사진 판정 컷을 그리지 않는다', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    expect(texts(calls)).not.toContain('사진 판정');
  });

  it('컷이 끝나고 3착도 통과하면 결과판(머리글 SP·착차)을 그린다', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(62));
    const all = texts(calls);
    expect(all).toContain('SP');
    expect(all).toContain('착차');
    expect(all).not.toContain('사진 판정');
  });

  it('결승 전 실시간 순위에는 결과판 머리글을 그리지 않는다', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    expect(texts(calls)).not.toContain('SP');
  });

  it('프레임당 그리기 평균이 2ms 이하(60프레임, 사진 컷·결과판 구간 포함)', () => {
    const models = Array.from({ length: 60 }, (_, k) => modelAt(55 + (k * 10) / 59));
    // 워밍업 한 번
    drawStrip(recordingCtx().ctx, models[0]!);
    const t0 = performance.now();
    for (const m of models) {
      drawStrip(recordingCtx().ctx, m);
    }
    const perFrame = (performance.now() - t0) / models.length;
    expect(perFrame).toBeLessThanOrEqual(2);
  });

  it('플레이어(금색 링) 원판에 링을 추가로 그린다', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    expect(calls.some((c) => c.name === 'set:strokeStyle' && c.args[0] === '#f5c518')).toBe(true);
  });

  it('선두가 두 번째 표지 뒤에 있으면 구간 기록(작은 글씨)을 그린다', () => {
    // 선두 20m/s: 펄롱 구간 10.06s → 표기 10.1s. t=50 은 선두 1000m(998.8m 표지 통과).
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(50));
    expect(texts(calls)).toContain('구간 10.1s');
  });

  it('첫 구간 전에는 구간 기록을 그리지 않는다', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(5));
    expect(texts(calls).some((x) => x.startsWith('구간 '))).toBe(false);
  });

  it('고저 단면 선과 선두 점을 그린다(평탄 경로도 같은 경로 호출)', () => {
    const { ctx, calls } = recordingCtx();
    drawStrip(ctx, modelAt(10));
    expect(countOf(calls, 'lineTo')).toBeGreaterThan(0);
    expect(calls.some((c) => c.name === 'set:lineWidth' && c.args[0] === 1.5)).toBe(true);
  });
});
