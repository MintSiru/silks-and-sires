import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import { buildRacePath } from '../../src/engine/course/path';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import type {
  FractionalOdds,
  Margin,
  RaceEntry,
  RaceReplay,
  RaceResult,
  RacePath,
  ReplayFrame,
  RunnerResult,
} from '../../src/engine/types';
import { formatMarginKo } from '../../src/engine/race/results';
import {
  buildStripModel,
  cameraWindow,
  contrastRatio,
  discBorderFor,
  elevationProfile,
  finalStandings,
  formatDistanceLabel,
  formatRatingChange,
  formatRemaining,
  frameAt,
  isPhotoMargin,
  liveStandings,
  photoCutFor,
  placeDiscs,
  relativeLuminance,
  replayDuration,
  resultBoard,
  sectionBoundaries,
  sectionSplit,
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
    // M7-R2b: 주로·거리 표기는 한국어(잔디 · 올웨더 · 더트)
    expect(formatDistanceLabel('turf', 1600)).toBe('잔디 1,600m (8f)');
    expect(formatDistanceLabel('aw', 1207)).toBe('올웨더 1,207m (6f)');
    expect(formatDistanceLabel('dirt', 1100)).toBe('더트 1,100m (5½f)');
    expect(formatDistanceLabel('turf', 1408)).toBe('잔디 1,408m (7f)');
    expect(formatDistanceLabel('turf', 2012)).toBe('잔디 2,012m (10f)');
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

  it('겹치는 두 원판 중 뒤쪽 alpha 0.55, 앞쪽 1, 그리기 순서는 레인 바깥→안쪽(같은 레인은 runnerIndex)', () => {
    // M7-R1: 반환 순서가 progress 오름차순 → 레인 그리기 순서로 바뀌었다(떨림 방지). 같은 레인이므로 [0,1,2].
    const frame = frameWith([100, 99, 50]);
    const discs = placeDiscs(frame, win, makeInfo(), rect, 30);
    expect(discs.map((d) => d.runnerIndex)).toEqual([0, 1, 2]);
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
    expect(model.left.surfaceLabel).toBe('잔디');
    expect(model.left.distanceText).toBe('1,200m (6f)');
    expect(model.left.goingLabel).toBe('좋음');
    expect(model.left.remainingLabel).toBe('6f');
    expect(model.left.speedLabel).toBe('72 km/h');
    expect(model.left.leader).toEqual({ x: 0, y: 0 });
  });

  it('출발 직후에는 결승선이 창 밖이라 F 표지가 없다', () => {
    expect(build(0).poles.map((p) => p.label)).not.toContain('F');
  });

  it('t=50 에는 1펄롱 표지(1f)가 창 안에 있다', () => {
    const labels = build(50).poles.map((p) => p.label);
    expect(labels).toContain('1f');
  });

  it('3착 통과 전은 실시간 순위, 통과 후는 확정 순위', () => {
    const live = build(60.5);
    expect(live.right.finished).toBe(false);
    expect(live.right.rows.map((r) => r.runnerIndex)).toEqual([0, 1, 2]);

    const done = build(62);
    expect(done.right.finished).toBe(true);
    expect(done.right.rows[0]?.marginText).toBe('1착');
    expect(done.poles.map((p) => p.label)).toContain('F');
  });

  it('2착이 코 차이면 승자 통과(60s)부터 2초 동안 사진 판정 컷', () => {
    expect(build(59.9).center.photoCut).toBeNull();
    expect(build(60).center.photoCut).not.toBeNull();
    expect(build(61.9).center.photoCut).not.toBeNull();
    expect(build(62).center.photoCut).toBeNull();
  });

  it('결과판은 사진 컷이 끝난 뒤(62s)에만 나온다', () => {
    expect(build(61.9).right.board).toBeNull();
    expect(build(62).right.board).not.toBeNull();
  });

  it('live 순위와 확정 순위 행, 원판에 승부복(silks)이 실린다', () => {
    const live = build(10);
    expect(live.right.rows[0]?.silks).toEqual(makeEntries()[0]?.silks);
    expect(live.center.discs[0]?.silks).toBeDefined();
    expect(build(62).right.rows[0]?.silks).toEqual(makeEntries()[0]?.silks);
  });

  it('등급 배지: L 은 Listed, null 은 null', () => {
    expect(build(0).right.gradeBadge).toBe('G3');
    expect(build(0, makeInfo({ grade: 'L' })).right.gradeBadge).toBe('Listed');
    expect(build(0, makeInfo({ grade: null })).right.gradeBadge).toBeNull();
  });
});

// ── 고저 단면 · 구간 기록 ───────────────────────────────────────────────
/** 기울기 함수 slope(s) 를 따르는 경로. 나머지 기하는 makePath 와 같다. */
function slopePath(slope: (s: number) => number): RacePath {
  const base = makePath();
  return {
    ...base,
    sample(s: number) {
      const sc = Math.max(0, s);
      return { ...base.sample(sc), gradient: slope(sc) };
    },
  };
}

/** 선두 속도 v(m/s) 로 일정하게 달리는 두 말 리플레이. 0.1s 틱. */
function steadyReplay(v: number, tEnd: number): RaceReplay {
  const frames: ReplayFrame[] = [];
  const last = Math.round(tEnd * 10);
  for (let k = 0; k <= last; k++) {
    const t = k / 10;
    frames.push({ t, progress: [v * t, v * 0.94 * t], lane: [0, 1], speed: [v, v * 0.94] });
  }
  return { tickSeconds: 0.1, horseIds: ['h0', 'h1'], frames };
}

describe('elevationProfile', () => {
  it('평탄 경로는 모든 h 가 0 이고 마지막 s 는 distance', () => {
    const profile = elevationProfile(makePath(), DISTANCE);
    expect(profile.every((p) => p.h === 0)).toBe(true);
    expect(profile[0]).toEqual({ s: 0, h: 0 });
    expect(profile[profile.length - 1]?.s).toBe(DISTANCE);
  });

  it('오르막 구간(s < 500, 기울기 0.01)에서는 h 가 늘고, 평지 구간에서는 h 가 유지된다', () => {
    const profile = elevationProfile(slopePath((s) => (s < 500 ? 0.01 : 0)), DISTANCE);
    const upTo = profile.filter((p) => p.s <= 480);
    for (let k = 1; k < upTo.length; k++) {
      expect(upTo[k]!.h).toBeGreaterThan(upTo[k - 1]!.h);
    }
    const flatFrom = profile.filter((p) => p.s >= 500);
    const h500 = flatFrom[0]?.h ?? NaN;
    for (const p of flatFrom) expect(p.h).toBeCloseTo(h500, 9);
    // 0.01 × 500m = 5m (사다리꼴 적분의 경계 한 칸 오차 허용)
    expect(h500).toBeGreaterThan(4.5);
    expect(h500).toBeLessThanOrEqual(5);
  });

  it('실제 코스 saint_ourens 3,000m(+10m 오르막 포함)는 최고점이 출발 대비 +8m 이상', () => {
    // 2,400m 는 출발점(u0 = 총길이 − 거리 = 876.5m)이 이미 오르막 한가운데라 최고점이 약 +7m 이다.
    const course = getRacecourse(loadRacecourses(racecoursesJson), 'saint_ourens');
    const path = buildRacePath(course, 3000);
    const profile = elevationProfile(path, 3000);
    expect(profile[0]?.h).toBe(0);
    expect(Math.max(...profile.map((p) => p.h))).toBeGreaterThanOrEqual(8);
  });

  it('stepM 이 0 이하이면 RangeError', () => {
    expect(() => elevationProfile(makePath(), DISTANCE, 0)).toThrow(RangeError);
  });
});

describe('sectionBoundaries', () => {
  it('1200m 은 결승에서 1펄롱씩 거슬러 올라간 표지와 결승선', () => {
    const b = sectionBoundaries(1200);
    expect(b).toHaveLength(6);
    expect(b[b.length - 1]).toBe(1200);
    expect(b[b.length - 2]).toBeCloseTo(1200 - 201.168, 6);
  });
});

describe('sectionSplit', () => {
  // 선두 16m/s: 펄롱(201.168m) 구간은 12.57s
  const replay = steadyReplay(16, 80);

  it('첫 구간을 다 지나기 전에는 null', () => {
    // 선두 240m: 표지 194m 는 넘었지만 두 번째 표지(395m) 전
    const split = sectionSplit(replay, DISTANCE, 240);
    expect(split).toBeNull();
  });

  it('선두가 두 번째 표지를 넘으면 구간 시간 12.6±0.1s', () => {
    const split = sectionSplit(replay, DISTANCE, 420);
    expect(split).not.toBeNull();
    expect(Number.parseFloat(split ?? 'NaN')).toBeCloseTo(12.6, 1);
    expect(split).toMatch(/^\d+\.\d+s$/);
  });

  it('결승선을 지나면 마지막 펄롱 구간 시간을 준다', () => {
    const split = sectionSplit(replay, DISTANCE, 1264);
    expect(Number.parseFloat(split ?? 'NaN')).toBeCloseTo(12.6, 1);
  });

  it('buildStripModel 의 center.split 과 left.profile 이 채워진다', () => {
    const model = buildStripModel({
      replay,
      t: 70,
      path: makePath(),
      info: makeInfo(),
      result: makeResult(),
      width: 1200,
      height: 240,
    });
    expect(Number.parseFloat(model.center.split ?? 'NaN')).toBeCloseTo(12.6, 1);
    expect(model.left.profile.points.length).toBeGreaterThan(1);
    // 평탄 경로: 모든 점의 y 가 같다(수평)
    const ys = new Set(model.left.profile.points.map((p) => p.y.toFixed(6)));
    expect(ys.size).toBe(1);
  });
});

// ── 결과판 · 사진 판정 컷 · OR 변동 ─────────────────────────────────────
const MINUS = '−';

/** n두(= speeds.length) 합성 레이스. 착순은 결승 시각(= 속도) 순, 마번은 게이트 순 1..n. */
function fieldFixture(
  speeds: number[],
  secondMargin: Margin | null,
): { replay: RaceReplay; result: RaceResult; info: ViewerInfo } {
  const n = speeds.length;
  const frames: ReplayFrame[] = [];
  for (let k = 0; k <= 900; k++) {
    const t = k * 0.1;
    frames.push({
      t: Math.round(t * 10) / 10,
      progress: speeds.map((v) => v * t),
      lane: speeds.map(() => 0),
      speed: [...speeds],
    });
  }
  const entries: RaceEntry[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      horseId: `h${i}`,
      saddleCloth: i + 1,
      draw: i + 1,
      jockeyId: `j${i}`,
      weightLb: 126,
      tactic: 'prominent',
      silks: { primary: PRIMARIES[i % PRIMARIES.length] ?? '#000000', secondary: '#ffffff', pattern: 'hoops' },
      isPlayer: i === 0,
      odds: i === 0 ? { num: 3, den: 1 } : null,
    });
  }
  const order = speeds.map((_, i) => i).sort((a, b) => (speeds[b] ?? 0) - (speeds[a] ?? 0));
  const runners = order.map((ri, k): RunnerResult => {
    const entry = entries[ri];
    if (entry === undefined) throw new Error('fixture');
    let margin: Margin | null = { label: 'lengths', lengths: 1 };
    if (k === 0) margin = null;
    else if (k === 1) margin = secondMargin;
    return {
      runnerIndex: ri,
      horseId: entry.horseId,
      saddleCloth: entry.saddleCloth,
      draw: entry.draw,
      jockeyId: entry.jockeyId,
      weightLb: entry.weightLb,
      position: k + 1,
      finishTime: DISTANCE / (speeds[ri] ?? 1),
      margin,
      beatenLengths: 0,
      sectionals: [],
      performanceFigure: 0,
      odds: entry.odds,
    };
  });
  const result: RaceResult = {
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
  const info: ViewerInfo = {
    raceName: 'Sample Stakes',
    grade: null,
    courseName: 'Sample Park',
    surface: 'turf',
    distance: DISTANCE,
    going: 'good',
    entries,
    horseNames: entries.map((_, i) => `Horse ${i}`),
  };
  return { replay: { tickSeconds: 0.1, horseIds: entries.map((e) => e.horseId), frames }, result, info };
}

/** 7두 필드. 속도 20 → 19.8 → … 로 결승 순서가 마번 1..7 과 같다. */
const SEVEN = [20, 19.8, 19.5, 19.2, 18.9, 18.6, 18];

describe('formatRatingChange', () => {
  it('양수는 +, 음수는 − (U+2212), 0 은 ±0, 첫 OR 은 "첫 OR N"', () => {
    expect(formatRatingChange({ from: 95, to: 98 })).toBe('+3');
    expect(formatRatingChange({ from: 90, to: 88 })).toBe(`${MINUS}2`);
    expect(formatRatingChange({ from: 80, to: 80 })).toBe('±0');
    expect(formatRatingChange({ from: null, to: 98 })).toBe('첫 OR 98');
  });
});

describe('resultBoard', () => {
  it('상위 6두만, 착순 순서대로', () => {
    const { result, info } = fieldFixture(SEVEN, { label: 'nose', lengths: 0 });
    const board = resultBoard(result, info);
    expect(board).toHaveLength(6);
    expect(board.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(board.map((r) => r.runnerIndex)).toEqual(result.runners.slice(0, 6).map((r) => r.runnerIndex));
  });

  it('착차 문구는 formatMarginKo 와 같고, 1착은 "1착"', () => {
    const margin: Margin = { label: 'short_head', lengths: 0 };
    const { result, info } = fieldFixture(SEVEN, margin);
    const board = resultBoard(result, info);
    expect(board[0]?.marginText).toBe('1착');
    expect(board[1]?.marginText).toBe(formatMarginKo(margin));
    expect(board[2]?.marginText).toBe(formatMarginKo({ label: 'lengths', lengths: 1 }));
  });

  it('SP 는 분수 오즈, 없으면 "-"', () => {
    const { result, info } = fieldFixture(SEVEN, { label: 'nose', lengths: 0 });
    const board = resultBoard(result, info);
    const first = board.find((r) => r.runnerIndex === 0);
    expect(first?.oddsText).toBe('3/1');
    expect(board.find((r) => r.runnerIndex === 1)?.oddsText).toBe('-');
  });

  it('ratingChanges 가 없으면 ratingText 는 null, 있으면 형식대로', () => {
    const { result, info } = fieldFixture(SEVEN, { label: 'nose', lengths: 0 });
    expect(resultBoard(result, info).every((r) => r.ratingText === null)).toBe(true);

    const withRatings: ViewerInfo = {
      ...info,
      ratingChanges: {
        0: { from: 95, to: 98 },
        1: { from: 90, to: 88 },
        2: { from: null, to: 98 },
        3: { from: 80, to: 80 },
      },
    };
    const byIndex = new Map(resultBoard(result, withRatings).map((r) => [r.runnerIndex, r.ratingText]));
    expect(byIndex.get(0)).toBe('+3');
    expect(byIndex.get(1)).toBe(`${MINUS}2`);
    expect(byIndex.get(2)).toBe('첫 OR 98');
    expect(byIndex.get(3)).toBe('±0');
    expect(byIndex.get(4)).toBeNull();
  });

  it('buildStripModel: 3착 통과 후(사진 없음) 결과판이 나온다', () => {
    const { replay, result, info } = fieldFixture(SEVEN, { label: 'lengths', lengths: 2 });
    const at = (t: number) =>
      buildStripModel({ replay, t, path: makePath(), info, result, width: 1200, height: 240 });
    // 3착 = 1200/19.5 ≈ 61.54s
    expect(at(61.4).right.board).toBeNull();
    expect(at(61.6).right.board).toHaveLength(6);
    expect(at(61.6).center.photoCut).toBeNull();
  });
});

describe('photoCutFor / 사진 판정 컷', () => {
  it('라벨 nose, short_head, head, 동착(null) 이면 사진 판정', () => {
    expect(isPhotoMargin({ label: 'nose', lengths: 0 })).toBe(true);
    expect(isPhotoMargin({ label: 'short_head', lengths: 0 })).toBe(true);
    expect(isPhotoMargin({ label: 'head', lengths: 0 })).toBe(true);
    expect(isPhotoMargin(null)).toBe(true);
    expect(isPhotoMargin({ label: 'neck', lengths: 0 })).toBe(false);
    expect(isPhotoMargin({ label: 'lengths', lengths: 1 })).toBe(false);
  });

  it('사진 판정이 아니면 null', () => {
    const { replay, result } = fieldFixture(SEVEN, { label: 'lengths', lengths: 1 });
    expect(photoCutFor(replay, result)).toBeNull();
  });

  it('사진 판정이면 t0 = 승자 결승, gapM = (2착 − 승자 결승 시각) × 승자 속도 (±0.1m)', () => {
    const { replay, result } = fieldFixture(SEVEN, { label: 'nose', lengths: 0 });
    const cut = photoCutFor(replay, result);
    expect(cut).not.toBeNull();
    expect(cut?.t0).toBeCloseTo(DISTANCE / SEVEN[0]!, 9);
    expect(cut?.winner).toBe(0);
    expect(cut?.second).toBe(1);
    const expected = (DISTANCE / SEVEN[1]! - DISTANCE / SEVEN[0]!) * SEVEN[0]!;
    expect(Math.abs((cut?.gapM ?? NaN) - expected)).toBeLessThanOrEqual(0.1);
  });

  it('동착(2착 margin null)도 사진 판정', () => {
    const { replay, result } = fieldFixture(SEVEN, null);
    expect(photoCutFor(replay, result)).not.toBeNull();
  });

  it('buildStripModel 의 photoCut 은 t0 ≤ t < t0 + 2 동안만 값이 있다', () => {
    const { replay, result, info } = fieldFixture(SEVEN, { label: 'nose', lengths: 0 });
    const at = (t: number) =>
      buildStripModel({ replay, t, path: makePath(), info, result, width: 1200, height: 240 });
    expect(at(59).center.photoCut).toBeNull();
    expect(at(60.5).center.photoCut?.winner).toBe(0);
    expect(at(62.5).center.photoCut).toBeNull();
    // 사진 컷이 끝나야 결과판이 나온다(3착 61.54s < 62s)
    expect(at(61.9).right.board).toBeNull();
    expect(at(62).right.board).not.toBeNull();
  });
});
