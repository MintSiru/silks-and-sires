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
import {
  buildStripModel,
  cameraWindow,
  contrastRatio,
  discBorderFor,
  finalStandings,
  formatDistanceLabel,
  formatRemaining,
  frameAt,
  liveStandings,
  placeDiscs,
  relativeLuminance,
  replayDuration,
  speedKmh,
  textColorFor,
} from '../../src/ui/race-viewer/viewModel';
import type { ViewerInfo } from '../../src/ui/race-viewer/viewModel';

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

function makeInfo(overrides: Partial<ViewerInfo> = {}): ViewerInfo {
  return {
    raceName: 'Sample Stakes',
    grade: 'G3',
    courseName: 'Sample Park',
    surface: 'turf',
    distance: DISTANCE,
    going: 'good',
    entries: makeEntries(),
    horseNames: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
    ...overrides,
  };
}

/** 0.1s 틱, 70s 까지. progress = v × t (결승 너머도 그대로 연장). */
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

function frameWith(progress: number[], lane: number[] = [0, 0, 0, 0, 0]): ReplayFrame {
  return { t: 0, progress, lane, speed: progress.map(() => 0) };
}

describe('frameAt / replayDuration', () => {
  it('duration 은 마지막 프레임 t', () => {
    expect(replayDuration(makeReplay())).toBeCloseTo(70, 9);
  });

  it('t=0 은 첫 프레임 값, t=0.05 는 첫 두 프레임 중간값', () => {
    const replay = makeReplay();
    const first = replay.frames[0]!;
    const second = replay.frames[1]!;
    const at0 = frameAt(replay, 0);
    expect(at0.progress).toEqual(first.progress);
    const mid = frameAt(replay, 0.05);
    for (let i = 0; i < 5; i++) {
      expect(mid.progress[i]).toBeCloseTo((first.progress[i]! + second.progress[i]!) / 2, 9);
    }
  });

  it('t > duration 이면 마지막 프레임, 음수면 첫 프레임', () => {
    const replay = makeReplay();
    const last = replay.frames[replay.frames.length - 1]!;
    expect(frameAt(replay, 999).progress).toEqual(last.progress);
    expect(frameAt(replay, -5).progress).toEqual(replay.frames[0]!.progress);
  });

  it('반환값을 바꿔도 replay 가 바뀌지 않는다', () => {
    const replay = makeReplay();
    const before = JSON.stringify(replay);
    const f = frameAt(replay, 3.3);
    f.progress[0] = -1;
    f.lane[0] = -1;
    f.speed[0] = -1;
    expect(JSON.stringify(replay)).toBe(before);
  });
});

describe('cameraWindow', () => {
  it('선두가 결승 150m 전이면 상위 4두의 최소 progress 를 trailer 로 쓴다', () => {
    const win = cameraWindow(frameWith([1050, 1040, 1000, 990, 900]), DISTANCE);
    // trailer = 990, span = 60, pad = 60 × 0.08 + 2.4 = 7.2
    expect(win.from).toBeCloseTo(990 - 7.2, 9);
    expect(win.to).toBeCloseTo(1050 + 7.2, 9);
    // 5위(900)는 창 밖이어도 된다
    expect(900 < win.from).toBe(true);
  });

  it('결승 전 200m 밖이면 전체 최소 progress 를 trailer 로 쓴다', () => {
    const win = cameraWindow(frameWith([500, 400, 300, 200, 100]), DISTANCE);
    // span = 400, pad = 400 × 0.08 + 2.4 = 34.4
    expect(win.from).toBeCloseTo(100 - 34.4, 9);
    expect(win.to).toBeCloseTo(500 + 34.4, 9);
  });

  it('모든 경우 to - from >= 30', () => {
    const cases = [
      [600, 599.9, 599.8, 599.7, 599.6],
      [0, 0, 0, 0, 0],
      [1190, 1190, 1190, 1190, 1190],
      [1300, 1200, 1100, 900, 100],
    ];
    for (const p of cases) {
      const win = cameraWindow(frameWith(p), DISTANCE);
      expect(win.to - win.from).toBeGreaterThanOrEqual(30);
    }
  });
});

describe('liveStandings', () => {
  it('상위 3두 순서, 선두 표기, 착차·오즈 문자열', () => {
    // 1.2m 차 → 0.5마신 → '½마신', 0.1m 차 → '코'
    const frame = frameWith([100, 98.8, 98.7, 50, 40]);
    const rows = liveStandings(frame, makeInfo());
    expect(rows.map((r) => r.runnerIndex)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.marginText)).toEqual(['선두', '½마신', '코']);
    expect(rows.map((r) => r.oddsText)).toEqual(['5/2', '3/1', '-']);
    expect(rows[0]?.horseName).toBe('Alpha');
    expect(rows[0]?.silksPrimary).toBe('#1040c0');
  });

  it('progress 가 같으면 마번 오름차순', () => {
    const rows = liveStandings(frameWith([100, 100, 90, 80, 70]), makeInfo());
    expect(rows.map((r) => r.runnerIndex)).toEqual([0, 1, 2]);
  });
});

describe('finalStandings', () => {
  it('result.runners 순서를 따르고 착차 문자열을 만든다', () => {
    const rows = finalStandings(makeResult(), makeInfo());
    expect(rows.map((r) => r.runnerIndex)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.marginText)).toEqual(['1착', '코', '1½마신']);
    expect(rows[0]?.oddsText).toBe('5/2');
  });

  it('동착이면 둘 다 1착, margin null 이 2위 이후면 동착', () => {
    const result = makeResult();
    const second = result.runners[1];
    if (second === undefined) throw new Error('fixture');
    result.runners[1] = { ...second, position: 1, margin: null };
    const rows = finalStandings(result, makeInfo(), 5);
    expect(rows[0]?.marginText).toBe('1착');
    expect(rows[1]?.marginText).toBe('1착');
    expect(rows[4]?.marginText).toBe('대차');

    const third = result.runners[2];
    if (third === undefined) throw new Error('fixture');
    result.runners[2] = { ...third, margin: null };
    expect(finalStandings(result, makeInfo(), 3)[2]?.marginText).toBe('동착');
  });
});

describe('색 대비', () => {
  it('textColorFor', () => {
    expect(textColorFor('#ffffff')).toBe('#000000');
    expect(textColorFor('#000080')).toBe('#ffffff');
    expect(textColorFor('#ffd100')).toBe('#000000');
  });

  it('discBorderFor: 띠 배경과 비슷하면 흰색', () => {
    expect(discBorderFor('#1f2a36')).toBe('#ffffff');
    expect(discBorderFor('#ffffff')).toBe('#000000');
  });

  it('상대 휘도와 대비비', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 9);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
  });
});

describe('표기', () => {
  it('formatDistanceLabel', () => {
    expect(formatDistanceLabel('turf', 1600)).toBe('TURF 1,600m (8f)');
    expect(formatDistanceLabel('aw', 1207)).toBe('AW 1,207m (6f)');
    expect(formatDistanceLabel('turf', 1100)).toBe('TURF 1,100m (5½f)');
    expect(formatDistanceLabel('turf', 1408)).toBe('TURF 1,408m (7f)');
    expect(formatDistanceLabel('turf', 2012)).toBe('TURF 2,012m (10f)');
  });

  it('formatRemaining', () => {
    expect(formatRemaining(402)).toBe('2f');
    expect(formatRemaining(300)).toBe('1½f');
    expect(formatRemaining(-1)).toBe('결승');
    expect(formatRemaining(0)).toBe('결승');
    expect(formatRemaining(10)).toBe('½f');
  });

  it('speedKmh 는 반올림한 km/h', () => {
    expect(speedKmh(20)).toBe(72);
    expect(speedKmh(19.8)).toBe(71);
  });
});

describe('placeDiscs', () => {
  const rect = { x: 0, y: 0, w: 700, h: 200 };
  const win = { from: 40, to: 110 }; // 1m = 10px

  it('겹치는 두 원판 중 뒤쪽 alpha 0.55, 앞쪽 1, progress 오름차순 반환', () => {
    const frame = frameWith([100, 99, 50]);
    const discs = placeDiscs(frame, win, makeInfo(), rect, 30);
    expect(discs.map((d) => d.runnerIndex)).toEqual([2, 1, 0]);
    const byIndex = new Map(discs.map((d) => [d.runnerIndex, d]));
    expect(byIndex.get(1)?.alpha).toBe(0.55);
    expect(byIndex.get(0)?.alpha).toBe(1);
    expect(byIndex.get(2)?.alpha).toBe(1);
  });

  it('lane 0 원판의 y 가 lane 이 큰 원판보다 아래(값이 큼)', () => {
    const frame = frameWith([100, 100], [0, 10]);
    const discs = placeDiscs(frame, { from: 0, to: 200 }, makeInfo(), rect, 20);
    const lane0 = discs.find((d) => d.runnerIndex === 0);
    const lane10 = discs.find((d) => d.runnerIndex === 1);
    expect(lane0).toBeDefined();
    expect(lane10).toBeDefined();
    expect(lane0!.y).toBeGreaterThan(lane10!.y);
  });

  it('label 은 마번, isPlayer 와 색 정보 포함', () => {
    const discs = placeDiscs(frameWith([100, 90, 80, 70, 60]), win, makeInfo(), rect, 30);
    const player = discs.find((d) => d.runnerIndex === 2);
    expect(player?.label).toBe('3');
    expect(player?.isPlayer).toBe(true);
    expect(player?.fill).toBe('#ffffff');
    expect(player?.textColor).toBe('#000000');
    expect(player?.border).toBe('#000000');
  });
});

describe('buildStripModel', () => {
  const build = (t: number, info: ViewerInfo = makeInfo()) =>
    buildStripModel({
      replay: makeReplay(),
      t,
      path: makePath(),
      info,
      result: makeResult(),
      width: 1200,
      height: 200,
    });

  it('중앙 rect 는 좌우 패널 폭을 뺀 나머지', () => {
    const model = build(0);
    expect(model.center.rect).toEqual({ x: 250, y: 0, w: 660, h: 200 });
  });

  it('좌측 패널 라벨: 거리·마장·남은 거리·선두 속도', () => {
    const model = build(0);
    expect(model.left.distanceLabel).toBe('TURF 1,200m (6f)');
    expect(model.left.goingLabel).toBe('GOOD');
    expect(model.left.remainingLabel).toBe('6f');
    expect(model.left.speedLabel).toBe('72 km/h');
    expect(model.left.leader).toEqual({ x: 0, y: 0 });
  });

  it('출발 직후에는 결승선이 창 밖이라 finishX 가 null', () => {
    expect(build(0).center.finishX).toBeNull();
  });

  it('t=50 에는 1펄롱 표지(1f)가 창 안에 있다', () => {
    const labels = build(50).center.poles.map((p) => p.label);
    expect(labels).toContain('1f');
  });

  it('3착 통과 전은 실시간 순위, 통과 후는 확정 순위', () => {
    const live = build(60.5);
    expect(live.right.finished).toBe(false);
    expect(live.right.rows.map((r) => r.runnerIndex)).toEqual([0, 1, 2]);

    const done = build(62);
    expect(done.right.finished).toBe(true);
    expect(done.right.rows[0]?.marginText).toBe('1착');
    expect(done.center.finishX).not.toBeNull();
  });

  it('2착이 코 차이면 3착 통과 후 2초 동안 PHOTO', () => {
    expect(build(62).right.photo).toBe(true);
    expect(build(64).right.photo).toBe(false);
  });

  it('등급 배지: L 은 Listed, null 은 null', () => {
    expect(build(0).right.gradeBadge).toBe('G3');
    expect(build(0, makeInfo({ grade: 'L' })).right.gradeBadge).toBe('Listed');
    expect(build(0, makeInfo({ grade: null })).right.gradeBadge).toBeNull();
  });
});
