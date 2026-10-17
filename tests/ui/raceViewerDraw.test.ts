import { describe, expect, it } from 'vitest';
import type {
  Going,
  Margin,
  RaceEntry,
  RaceReplay,
  RaceResult,
  RacePath,
  ReplayFrame,
  RunnerResult,
  Surface,
} from '../../src/engine/types';
import { drawStrip, TRACK_BG } from '../../src/ui/race-viewer/stripRenderer';
import { buildStripModel, contrastRatio } from '../../src/ui/race-viewer/viewModel';
import type { StripModel, ViewerInfo } from '../../src/ui/race-viewer/viewModel';

// M7-R2 그리기 테스트. 합성 픽스처만 쓴다(시뮬레이터 미사용). 기존 stripRenderer.test.ts 와 같은 기록용 ctx 방식.

const DISTANCE = 1200;
const WIDTH = 1200;
const HEIGHT = 240;
/** 띠 바탕 왼쪽 경계(좌측 패널 폭). stripRenderer 의 LEFT_PANEL_W 와 같다. */
const TRACK_X = 250;
/** 띠 글자색(TEXT_MAIN). 주로 바탕과의 대비 확인용 */
const TEXT_MAIN = '#e6edf3';
/** 게이트 번호 글자 크기(stripRenderer 의 FONT_GATE_NO) */
const GATE_NO_FONT = '9px system-ui';
/** 원판 그림자 색(stripRenderer 의 DISC_SHADOW) */
const DISC_SHADOW = 'rgba(0, 0, 0, 0.45)';
const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
const PALETTE = ['#1040c0', '#ffd100', '#ffffff', '#c01010', '#1f2a36', '#2a9d8f', '#e76f51'];

interface FixtureOpts {
  /** 출주 두수 */
  n: number;
  /** 이름 목록(n 과 길이가 같아야 한다). 없으면 Horse0.. */
  names?: string[];
  /** 내 말 runner index(없으면 -1) */
  playerIndex: number;
  surface: Surface;
  going: Going;
}

interface Fixture {
  replay: RaceReplay;
  path: RacePath;
  info: ViewerInfo;
  result: RaceResult;
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

/** 앞쪽 말일수록 빠르다(인덱스 0 이 1착). 레인은 인덱스로 나눠 흩어 둔다. */
function makeFixture(opts: FixtureOpts): Fixture {
  const { n, playerIndex, surface, going } = opts;
  const names = opts.names ?? Array.from({ length: n }, (_, i) => `Horse${i}`);
  const speeds = Array.from({ length: n }, (_, i) => 20 - i * 0.2);
  const lanes = Array.from({ length: n }, (_, i) => (i * 3) % 5);
  const entries: RaceEntry[] = speeds.map((_, i) => ({
    horseId: `h${i}`,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: `j${i}`,
    weightLb: 126,
    tactic: 'prominent',
    silks: { primary: PALETTE[i % PALETTE.length] ?? '#1040c0', secondary: '#000000', pattern: 'plain' },
    isPlayer: i === playerIndex,
    odds: null,
  }));
  const frames: ReplayFrame[] = [];
  const last = Math.ceil((DISTANCE / (20 - (n - 1) * 0.2)) * 10) + 50;
  for (let k = 0; k <= last; k++) {
    const t = k / 10;
    frames.push({
      t: Math.round(t * 10) / 10,
      progress: speeds.map((v) => v * t),
      lane: [...lanes],
      speed: [...speeds],
    });
  }
  const runners: RunnerResult[] = speeds.map((v, i) => {
    const entry = entries[i];
    if (entry === undefined) throw new Error('fixture');
    const margin: Margin | null = i === 0 ? null : { label: 'lengths', lengths: 1 };
    return {
      runnerIndex: i,
      horseId: entry.horseId,
      saddleCloth: entry.saddleCloth,
      draw: entry.draw,
      jockeyId: entry.jockeyId,
      weightLb: entry.weightLb,
      position: i + 1,
      finishTime: DISTANCE / v,
      margin,
      beatenLengths: 0,
      sectionals: [DISTANCE / v],
      performanceFigure: 0,
      odds: entry.odds,
    };
  });
  return {
    replay: { tickSeconds: 0.1, horseIds: entries.map((e) => e.horseId), frames },
    path: makePath(),
    info: {
      raceName: 'Sample Stakes',
      grade: 'G3',
      courseName: 'Sample Park',
      surface,
      distance: DISTANCE,
      going,
      entries,
      horseNames: opts.names ?? names,
    },
    result: {
      raceId: 'sample-race',
      racecourseId: 'sample-course',
      date: { year: 2026, week: 10 },
      going,
      distance: DISTANCE,
      seed: 1,
      winningTime: DISTANCE / speeds[0]!,
      sectionalMarks: [],
      runners,
    },
  };
}

function modelOf(f: Fixture, t: number): StripModel {
  return buildStripModel({
    replay: f.replay,
    t,
    path: f.path,
    info: f.info,
    result: f.result,
    width: WIDTH,
    height: HEIGHT,
  });
}

// ── 기록용 가짜 ctx ─────────────────────────────────────────────────────
interface Call {
  name: string;
  args: unknown[];
}

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

function drawAt(f: Fixture, t: number): Call[] {
  const { ctx, calls } = recordingCtx();
  drawStrip(ctx, modelOf(f, t));
  return calls;
}

function texts(calls: Call[]): string[] {
  return calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
}

/** 지정한 글자 크기(font)로 그린 글자만 모은다. set:font 로 현재 글자 크기를 따라간다. */
function textsWithFont(calls: Call[], font: string): string[] {
  const out: string[] = [];
  let current: unknown;
  for (const c of calls) {
    if (c.name === 'set:font') current = c.args[0];
    else if (c.name === 'fillText' && current === font) out.push(String(c.args[0]));
  }
  return out;
}

/** 같은 좌표로 채운 사각형(fillRect(x, y, …))의 fillStyle. 처음 채운 것 기준. */
function fillStyleOfRectAt(calls: Call[], x: number, y: number): unknown {
  let current: unknown;
  for (const c of calls) {
    if (c.name === 'set:fillStyle') current = c.args[0];
    else if (c.name === 'fillRect' && c.args[0] === x && c.args[1] === y) return current;
  }
  return undefined;
}

describe('출발 게이트 (M7-R2)', () => {
  const f = makeFixture({ n: 5, names: NAMES, playerIndex: 2, surface: 'turf', going: 'good' });

  it('loading 과 ready 에는 칸 번호를 칸 수만큼 작은 글씨로 그린다', () => {
    expect(textsWithFont(drawAt(f, -2), GATE_NO_FONT)).toEqual(['1', '2', '3', '4', '5']);
    expect(textsWithFont(drawAt(f, -0.5), GATE_NO_FONT)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('ready 에만 출발 준비 글자를 그린다', () => {
    expect(texts(drawAt(f, -2))).not.toContain('출발 준비');
    expect(texts(drawAt(f, -0.5))).toContain('출발 준비');
    expect(texts(drawAt(f, 0.1))).not.toContain('출발 준비');
  });

  it('open 에는 앞 테두리 자리에 밝은 선(두께 2)을 긋는다', () => {
    const open = drawAt(f, 0.1);
    expect(open.some((c) => c.name === 'set:lineWidth' && c.args[0] === 2)).toBe(true);
    expect(textsWithFont(open, GATE_NO_FONT)).toHaveLength(5);
  });

  it('M7-R2b: 출발 뒤 게이트는 뒤에 남아 칸 번호를 계속 그리고(앞문 열린 채, 밝은 선 없음), 띠 밖으로 나가면 사라진다', () => {
    const after = drawAt(f, 1);
    expect(textsWithFont(after, GATE_NO_FONT)).toHaveLength(5);
    expect(after.some((c) => c.name === 'set:lineWidth' && c.args[0] === 2)).toBe(false);
    expect(textsWithFont(drawAt(f, 70), GATE_NO_FONT)).toHaveLength(0);
  });

  it('출발 전(τ<0) 우측 패널은 제목 인기 순과 인기 순 상위 3두의 오즈를 보이고, 내 말 줄은 N번 인기', () => {
    const odds = [{ num: 9, den: 1 }, { num: 2, den: 1 }, null, { num: 5, den: 2 }, { num: 4, den: 1 }];
    const withOdds: Fixture = {
      ...f,
      info: { ...f.info, entries: f.info.entries.map((e, i) => ({ ...e, odds: odds[i] ?? null })) },
    };
    const pre = texts(drawAt(withOdds, -2));
    expect(pre).toContain('인기 순');
    // 내 말(Charlie, 인덱스 2 = 오즈 없음 → 맨 뒤) 은 인기 5위
    expect(pre.some((x) => x === '내 말 5번 인기 · -')).toBe(true);
    expect(pre.some((x) => x.includes('선두와'))).toBe(false);
    expect(texts(drawAt(withOdds, 10))).not.toContain('인기 순');
  });

  it('M7-R2b: 잔디 줄무늬는 카메라와 함께 흐른다(같은 색 사각형의 x 가 시간에 따라 바뀜), 올웨더는 줄무늬 색이 다르다', () => {
    const stripeXs = (calls: Call[], fill: string): number[] => {
      const out: number[] = [];
      let current: unknown;
      for (const c of calls) {
        if (c.name === 'set:fillStyle') current = c.args[0];
        else if (c.name === 'fillRect' && current === fill && typeof c.args[0] === 'number') out.push(c.args[0]);
      }
      return out;
    };
    const turfA = stripeXs(drawAt(f, 10), '#2f6639');
    const turfB = stripeXs(drawAt(f, 11), '#2f6639');
    expect(turfA.length).toBeGreaterThan(0);
    expect(turfA).not.toEqual(turfB);
    const aw = makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: 'aw', going: 'good' });
    expect(stripeXs(drawAt(aw, 10), 'rgba(255, 255, 255, 0.05)').length).toBeGreaterThan(0);
  });

  it('원판마다 1px 아래 그림자 원을 먼저 그린다(겹침 구분)', () => {
    const calls = drawAt(f, 10);
    const shadows = calls.filter((c) => c.name === 'set:fillStyle' && c.args[0] === DISC_SHADOW);
    expect(shadows).toHaveLength(f.info.entries.length);
  });
});

describe('주로·마장·펄롱 표지 (M7-R2)', () => {
  const surfaces: Surface[] = ['turf', 'aw', 'dirt'];

  it('잔디·올웨더·더트 바탕색이 서로 다르고, 띠 글자색과 대비 4.5:1 이상', () => {
    const colors = surfaces.map((s) => {
      const f = makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: s, going: 'good' });
      const fill = fillStyleOfRectAt(drawAt(f, 10), TRACK_X, 0);
      expect(fill).toBe(TRACK_BG[s]);
      return TRACK_BG[s];
    });
    expect(new Set(colors).size).toBe(3);
    for (const c of colors) {
      expect(contrastRatio(c, TEXT_MAIN)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('주로 종류와 마장을 한국어로 쓴다(잔디 / 올웨더 / 더트, 표준)', () => {
    const turf = texts(drawAt(makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: 'turf', going: 'standard' }), 10));
    expect(turf).toContain('마장 표준');
    expect(turf.some((s) => s.startsWith('잔디 1,200m'))).toBe(true);
    const aw = texts(drawAt(makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: 'aw', going: 'good' }), 10));
    expect(aw.some((s) => s.startsWith('올웨더 '))).toBe(true);
    const dirt = texts(drawAt(makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: 'dirt', going: 'dirt_muddy' }), 10));
    expect(dirt.some((s) => s.startsWith('더트 '))).toBe(true);
    expect(dirt).toContain('마장 진흙');
  });

  it('카메라 창 안의 펄롱 표지 라벨을 그린다(10초: 5f)', () => {
    const f = makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: 'turf', going: 'good' });
    expect(texts(drawAt(f, 10))).toContain('5f');
  });

  it('결승선이 창 안이면 체크 무늬 기둥과 F 라벨을 그린다', () => {
    const f = makeFixture({ n: 5, names: NAMES, playerIndex: -1, surface: 'turf', going: 'good' });
    const before = drawAt(f, 10);
    expect(texts(before)).not.toContain('F');
    expect(before.some((c) => c.name === 'set:fillStyle' && c.args[0] === '#111111')).toBe(false);
    const near = drawAt(f, 60);
    expect(texts(near)).toContain('F');
    expect(near.some((c) => c.name === 'set:fillStyle' && c.args[0] === '#111111')).toBe(true);
  });
});

describe('내 말 강조 (M7-R2)', () => {
  // 내 말 = 5착(Echo). 4착 Delta 는 상위 3두 밖이라 이름이 그려지지 않아야 한다.
  const f = makeFixture({ n: 5, names: NAMES, playerIndex: 4, surface: 'turf', going: 'good' });

  it('내 말 이름표는 말 이름을 한 번만 그린다(다른 말 이름은 표시하지 않음)', () => {
    const all = texts(drawAt(f, 10));
    expect(all.filter((s) => s === 'Echo')).toHaveLength(1);
    expect(all).not.toContain('Delta');
  });

  it('playerTags 가 내 말 한 마리의 이름표 자리를 준다', () => {
    const model = modelOf(f, 10);
    expect(model.playerTags.map((t) => t.name)).toEqual(['Echo']);
  });

  it('내 말 순위 한 줄: 5위는 선두와의 차를 쓴다', () => {
    const line = texts(drawAt(f, 10)).find((s) => s.startsWith('내 말 '));
    expect(line).toBeDefined();
    expect(line?.startsWith('내 말 5위 · 선두와 ')).toBe(true);
  });

  it('3위 안이면 같은 줄을 금색 굵은 글씨로 강조한다', () => {
    const top = makeFixture({ n: 5, names: NAMES, playerIndex: 2, surface: 'turf', going: 'good' });
    const calls = drawAt(top, 10);
    expect(texts(calls)).toContain('내 말 3위 · 선두와 ' + modelOf(top, 10).myStanding?.behind);
    const bold = calls.some((c) => c.name === 'set:font' && c.args[0] === 'bold 12px system-ui');
    expect(bold).toBe(true);
  });
});

describe('성능 (M7-R2)', () => {
  it('20두 한 프레임 그리기 평균이 4ms 이하(1200×240, 기록용 ctx 기준, 워밍업 후 30프레임)', () => {
    const f = makeFixture({ n: 20, playerIndex: 7, surface: 'turf', going: 'good' });
    const models = Array.from({ length: 30 }, (_, k) => modelOf(f, 5 + (k * 0.5)));
    drawStrip(recordingCtx().ctx, models[0]!);
    const t0 = performance.now();
    for (const m of models) {
      drawStrip(recordingCtx().ctx, m);
    }
    const perFrame = (performance.now() - t0) / models.length;
    expect(perFrame).toBeLessThanOrEqual(4);
  });
});
