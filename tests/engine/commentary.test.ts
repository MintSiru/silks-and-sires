import { describe, expect, it } from 'vitest';
import namesJson from '../../data/names.json';
import commentaryJson from '../../data/text/commentary.ko.json';
import racecoursesJson from './fixtures/m1-racecourses.json'; // M1 기준 코스 고정(골든 보존)
import {
  COMMENTARY_KIND_ORDER,
  extractCommentaryEvents,
  type CommentaryEvent,
  type CommentaryKind,
  type CommentaryPath,
} from '../../src/engine/commentary/events';
import { horseVerdicts, lineKeyOf, renderCommentary, type CommentaryLines } from '../../src/engine/commentary/render';
import { getCommentaryLines } from '../../src/engine/data/commentaryData';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import { createRng } from '../../src/engine/rng';
import { runRace, type RunRaceOutput } from '../../src/engine/race/runRace';
import { generateSampleField, type NamePool } from '../../src/engine/race/sampleField';
import type {
  GameDate,
  MarginLabel,
  Race,
  RaceReplay,
  RaceResult,
  ReplayFrame,
  RunnerResult,
} from '../../src/engine/types';

const DATE: GameDate = { year: 2026, week: 20 };
const COURSES = loadRacecourses(racecoursesJson);
const NAMES: NamePool = namesJson;
const TICK = 0.1;

/** 골든 설정 하나(simGolden 의 saint_ourens 3000m 20두 seed 99) */
const GOLDEN = { courseId: 'saint_ourens', distance: 3000, size: 20, seed: 99 };

interface GoldenFixture {
  out: RunRaceOutput;
  replay: RaceReplay;
  names: string[];
  race: Race;
}

let goldenCache: GoldenFixture | null = null;

/** 실제 runRace(recordReplay true) 결과. 한 번만 만든다. */
function goldenRace(): GoldenFixture {
  if (goldenCache !== null) return goldenCache;
  const course = getRacecourse(COURSES, GOLDEN.courseId);
  const race: Race = {
    id: `commentary-golden-${GOLDEN.courseId}-${GOLDEN.distance}`,
    name: 'Golden Handicap',
    racecourseId: GOLDEN.courseId,
    distance: GOLDEN.distance,
    kind: 'handicap',
    grade: null,
    raceClass: 5,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'handicap',
      baseWeightLb: 126,
    },
    prizeMoney: [10000, 4000, 2000],
    maxRunners: 20,
  };
  const field = generateSampleField(createRng(GOLDEN.seed).fork('field'), {
    size: GOLDEN.size,
    distance: GOLDEN.distance,
    surface: course.surface,
    year: DATE.year,
    namePool: NAMES,
  });
  const out = runRace({
    race,
    course,
    going: 'good',
    date: DATE,
    seed: GOLDEN.seed,
    field,
    recordReplay: true,
  });
  const replay = out.sim.replay;
  if (replay === null) throw new Error('골든 레이스 리플레이가 없다');
  goldenCache = { out, replay, names: field.runners.map((r) => r.horse.name), race };
  return goldenCache;
}

function goldenEvents(): CommentaryEvent[] {
  const g = goldenRace();
  return extractCommentaryEvents({
    replay: g.replay,
    result: g.out.sim.result,
    path: g.out.path,
    distance: g.race.distance,
  });
}

// ---------- 합성 리플레이 ----------

interface Knot {
  t: number;
  p: number;
}

/** [시각, 진행도] 목록 앞에 (0, 0) 을 붙인다. 구간 사이는 선형. 마지막 점이 결승(p = distance). */
function knots(points: [number, number][]): Knot[] {
  return [{ t: 0, p: 0 }, ...points.map(([t, p]) => ({ t, p }))];
}

function progressOn(ks: readonly Knot[], t: number): number {
  const first = ks[0];
  const last = ks[ks.length - 1];
  if (first === undefined || last === undefined) throw new Error('빈 곡선');
  if (t <= first.t) return first.p;
  if (t >= last.t) return last.p;
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1];
    const b = ks[i];
    if (a !== undefined && b !== undefined && t <= b.t) {
      return a.p + ((b.p - a.p) * (t - a.t)) / (b.t - a.t);
    }
  }
  return last.p;
}

function finishOf(ks: readonly Knot[]): number {
  const last = ks[ks.length - 1];
  if (last === undefined) throw new Error('빈 곡선');
  return last.t;
}

interface Synthetic {
  replay: RaceReplay;
  result: RaceResult;
  names: string[];
}

/** 곡선 목록으로 리플레이와 결과를 함께 만든다. labels 로 착차 라벨을 덮어쓸 수 있다. */
function buildSynthetic(curves: Knot[][], distance: number, labels: Partial<Record<number, MarginLabel>> = {}): Synthetic {
  const finish = curves.map(finishOf);
  const ft = (i: number): number => finish[i] ?? 0;
  const endT = Math.max(...finish) + 3;
  const steps = Math.round(endT / TICK);
  const frames: ReplayFrame[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k * TICK;
    frames.push({
      t,
      progress: curves.map((c) => progressOn(c, t)),
      lane: curves.map(() => 0),
      speed: curves.map(() => 0),
    });
  }
  const order = curves.map((_, i) => i).sort((a, b) => ft(a) - ft(b) || a - b);
  const winnerTime = ft(order[0] ?? 0);
  const runners: RunnerResult[] = order.map((i, pos) => {
    const beaten = (ft(i) - winnerTime) * 10;
    const label: MarginLabel = labels[i] ?? 'lengths';
    return {
      runnerIndex: i,
      horseId: `h${i}`,
      saddleCloth: i + 1,
      draw: i + 1,
      jockeyId: 'j',
      weightLb: 126,
      position: pos + 1,
      finishTime: ft(i),
      margin: pos === 0 ? null : { label, lengths: label === 'lengths' ? beaten : 0 },
      beatenLengths: beaten,
      sectionals: [],
      performanceFigure: 0,
      odds: null,
    };
  });
  return {
    replay: { tickSeconds: TICK, horseIds: curves.map((_, i) => `h${i}`), frames },
    result: {
      raceId: 'synthetic',
      racecourseId: 'synthetic',
      date: DATE,
      going: 'good',
      distance,
      seed: 0,
      winningTime: winnerTime,
      sectionalMarks: [],
      runners,
    },
    names: curves.map((_, i) => `Horse ${i}`),
  };
}

const SYN_DISTANCE = 1000;
/** 직선 200m → 결승 직선 입구 800m */
const SYN_PATH: CommentaryPath = { homeStraightLength: 200 };

function extractSynthetic(s: Synthetic, distance = SYN_DISTANCE): CommentaryEvent[] {
  return extractCommentaryEvents({ replay: s.replay, result: s.result, path: SYN_PATH, distance });
}

function ofKind(events: readonly CommentaryEvent[], kind: CommentaryKind): CommentaryEvent[] {
  return events.filter((e) => e.kind === kind);
}

function fillOne(template: string, name: string): string {
  return template.replace('{horse}', name);
}

// ---------- 테스트 ----------

describe('extractCommentaryEvents: 골든 레이스', () => {
  it('같은 입력이면 같은 사건이 나온다', () => {
    expect(goldenEvents()).toEqual(goldenEvents());
  });

  it('start·선두 사건(early_leader 또는 lead_battle)·turn_in·final_furlong·finish 가 각각 1회다', () => {
    const events = goldenEvents();
    expect(ofKind(events, 'start')).toHaveLength(1);
    expect(ofKind(events, 'early_leader').length + ofKind(events, 'lead_battle').length).toBe(1);
    expect(ofKind(events, 'turn_in')).toHaveLength(1);
    expect(ofKind(events, 'final_furlong')).toHaveLength(1);
    expect(ofKind(events, 'finish')).toHaveLength(1);
  });

  it('사건은 t 오름차순이고 같은 t 는 기획 나열 순이다', () => {
    const events = goldenEvents();
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const cur = events[i];
      if (prev === undefined || cur === undefined) throw new Error('사건 누락');
      expect(cur.t).toBeGreaterThanOrEqual(prev.t);
      if (cur.t === prev.t) {
        expect(COMMENTARY_KIND_ORDER.indexOf(cur.kind)).toBeGreaterThanOrEqual(COMMENTARY_KIND_ORDER.indexOf(prev.kind));
      }
    }
  });

  it('finish 의 승자는 result 1착과 같다', () => {
    const g = goldenRace();
    const finish = ofKind(goldenEvents(), 'finish');
    const first = g.out.sim.result.runners[0];
    expect(first).toBeDefined();
    expect(finish[0]?.horses[0]).toBe(first?.runnerIndex);
    expect(finish[0]?.t).toBe(g.out.sim.result.winningTime);
  });
});

describe('extractCommentaryEvents: 합성 리플레이로 kind 별 판정', () => {
  it('start 는 t = 0 에 한 번 나온다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[101, 1000]])], SYN_DISTANCE);
    const start = ofKind(extractSynthetic(s), 'start');
    expect(start).toEqual([{ t: 0, kind: 'start', horses: [] }]);
  });

  it('slow_start: 2초 시점 최하위가 바로 앞 말과 3m 이상 뒤지면 그 말을 기록한다', () => {
    const s = buildSynthetic(
      [knots([[100, 1000]]), knots([[102, 1000]]), knots([[0.5, 0], [105, 1000]])],
      SYN_DISTANCE,
    );
    const slow = ofKind(extractSynthetic(s), 'slow_start');
    expect(slow).toHaveLength(1);
    expect(slow[0]?.t).toBe(2);
    expect(slow[0]?.horses).toEqual([2]);
    expect(slow[0]?.value).toBeGreaterThanOrEqual(3);
  });

  it('lead_battle: 400m 대신 거리 25%(250m) 지점에서 2위와 0.5m 이내면 두 말 선두 다툼', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[100.03, 1000]])], SYN_DISTANCE);
    const events = extractSynthetic(s);
    expect(ofKind(events, 'lead_battle')).toHaveLength(1);
    expect(ofKind(events, 'lead_battle')[0]?.horses).toEqual([0, 1]);
    expect(ofKind(events, 'early_leader')).toHaveLength(0);
  });

  it('early_leader: 2위와 간격이 벌어진 선두는 early_leader 로 기록한다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[120, 1000]])], SYN_DISTANCE);
    const early = ofKind(extractSynthetic(s), 'early_leader');
    expect(early).toHaveLength(1);
    expect(early[0]?.horses).toEqual([0]);
  });

  it('pace: 50% 지점이 빠르면 value +1, 느리면 −1', () => {
    const fast = buildSynthetic([knots([[24, 500], [50, 1000]]), knots([[60, 1000]])], SYN_DISTANCE);
    const fastPace = ofKind(extractSynthetic(fast), 'pace');
    expect(fastPace).toHaveLength(1);
    expect(fastPace[0]?.value).toBe(1);
    expect(lineKeyOf(fastPace[0] as CommentaryEvent)).toBe('pace_fast');

    const slow = buildSynthetic([knots([[26, 500], [50, 1000]]), knots([[60, 1000]])], SYN_DISTANCE);
    const slowPace = ofKind(extractSynthetic(slow), 'pace');
    expect(slowPace).toHaveLength(1);
    expect(slowPace[0]?.value).toBe(-1);
    expect(lineKeyOf(slowPace[0] as CommentaryEvent)).toBe('pace_slow');
  });

  it('turn_in 은 직선 입구(800m)에 선두가 닿는 시각에 상위 3두를 기록한다', () => {
    const s = buildSynthetic(
      [knots([[90, 1000]]), knots([[97, 1000]]), knots([[98, 1000]]), knots([[99, 1000]])],
      SYN_DISTANCE,
    );
    const turn = ofKind(extractSynthetic(s), 'turn_in');
    expect(turn).toHaveLength(1);
    expect(turn[0]?.t).toBeCloseTo(72, 5);
    expect(turn[0]?.horses).toEqual([0, 1, 2]);
  });

  it('move 와 lead_change: 직선에서 3계단 이상 올라온 말과 선두 교체를 기록한다', () => {
    const s = buildSynthetic(
      [
        knots([[40, 800], [55, 1000]]),
        knots([[41, 800], [60, 1000]]),
        knots([[42, 800], [60, 1000]]),
        knots([[43, 800], [60, 1000]]),
        knots([[44, 800], [48, 1000]]),
      ],
      SYN_DISTANCE,
    );
    const events = extractSynthetic(s);
    const moves = ofKind(events, 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.horses).toEqual([4]);
    expect(moves[0]?.value).toBe(4);
    expect(moves[0]?.t).toBeCloseTo(48, 5);

    const changes = ofKind(events, 'lead_change');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.horses).toEqual([4, 0]);
    expect(changes[0]?.t).toBeGreaterThan(40);
    expect(changes[0]?.t).toBeLessThan(48);
  });

  it('final_furlong: 결승 201m 전 선두와 2위 간격을 value 로 준다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[120, 1000]])], SYN_DISTANCE);
    const ff = ofKind(extractSynthetic(s), 'final_furlong');
    expect(ff).toHaveLength(1);
    expect(ff[0]?.horses).toEqual([0]);
    expect(ff[0]?.value).toBeGreaterThan(0);
  });

  it('photo: 1·2착 착차가 nose 이면 사진 판정, finish 의 value 는 2착 마신이다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[100.05, 1000]])], SYN_DISTANCE, { 1: 'nose' });
    const events = extractSynthetic(s);
    const photo = ofKind(events, 'photo');
    expect(photo).toHaveLength(1);
    expect(photo[0]?.horses).toEqual([0, 1]);
    expect(photo[0]?.t).toBe(100);
    const finish = ofKind(events, 'finish');
    expect(finish).toHaveLength(1);
    expect(finish[0]?.horses).toEqual([0]);
    expect(finish[0]?.value).toBeCloseTo(0.5, 5);
    expect(events.indexOf(photo[0] as CommentaryEvent)).toBeLessThan(events.indexOf(finish[0] as CommentaryEvent));
  });

  it('착차가 크면 photo 는 없다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[110, 1000]])], SYN_DISTANCE);
    expect(ofKind(extractSynthetic(s), 'photo')).toHaveLength(0);
  });
});

describe('renderCommentary', () => {
  const lines = getCommentaryLines();

  it('같은 입력·시드면 같은 문장이 나온다', () => {
    const g = goldenRace();
    const events = goldenEvents();
    const a = renderCommentary(events, g.names, GOLDEN.seed, lines);
    const b = renderCommentary(events, g.names, GOLDEN.seed, lines);
    expect(a).toEqual(b);
    expect(a).toHaveLength(events.length);
    for (const line of a) {
      expect(line.text).not.toMatch(/[{}]/);
    }
  });

  it('같은 키가 연달아 나오면 직전과 다른 후보를 고른다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[101, 1000]]), knots([[102, 1000]])], SYN_DISTANCE);
    const moves: CommentaryEvent[] = [
      { t: 10, kind: 'move', horses: [1], value: 3 },
      { t: 11, kind: 'move', horses: [1], value: 3 },
      { t: 12, kind: 'move', horses: [1], value: 3 },
      { t: 13, kind: 'move', horses: [1], value: 3 },
    ];
    const rendered = renderCommentary(moves, s.names, 7, lines);
    for (let i = 1; i < rendered.length; i++) {
      expect(rendered[i]?.text).not.toBe(rendered[i - 1]?.text);
    }
  });

  it('자리 표시 {horse}·{horse2}·{n} 을 말 이름과 값으로 바꾼다', () => {
    const names = ['Alpha', 'Beta'];
    const custom: CommentaryLines = { lead_change: ['{horse}, {horse2} 제치고 {n}'] };
    const out = renderCommentary([{ t: 5, kind: 'lead_change', horses: [0, 1], value: 2.25 }], names, 1, custom);
    expect(out[0]?.text).toBe('Alpha, Beta 제치고 2.3');
  });
});

describe('horseVerdicts', () => {
  const lines = getCommentaryLines();
  const seed = 3;

  function verdictsOf(s: Synthetic): Record<number, string> {
    return horseVerdicts({ replay: s.replay, result: s.result, names: s.names, seed, lines, path: SYN_PATH });
  }

  function expectInKey(text: string, key: string, name: string): void {
    const candidates = lines[key] ?? [];
    expect(candidates.map((c) => fillOne(c, name))).toContain(text);
  }

  it('made_all: 400m(거리 25%) 선두가 1착이면 made_all 문장을 쓴다', () => {
    const s = buildSynthetic([knots([[100, 1000]]), knots([[102, 1000]]), knots([[104, 1000]])], SYN_DISTANCE);
    const v = verdictsOf(s);
    expectInKey(v[0] ?? '', 'made_all', 'Horse 0');
  });

  it('came_from_back: 50% 지점 하위 1/3 이었다가 3착 이내면 came_from_back 문장을 쓴다', () => {
    const s = buildSynthetic(
      [
        knots([[100, 1000]]),
        knots([[101, 1000]]),
        knots([[103, 1000]]),
        knots([[105, 1000]]),
        knots([[106, 1000]]),
        knots([[50, 400], [102, 1000]]),
      ],
      SYN_DISTANCE,
    );
    const v = verdictsOf(s);
    expectInKey(v[5] ?? '', 'came_from_back', 'Horse 5');
  });

  it('faded: 직선 입구 3위 이내였다가 6착 이하면 faded 문장을 쓴다', () => {
    const a = [41, 40, 42, 43, 44, 45, 46, 47];
    const b = [90, 50, 55, 60, 65, 70, 75, 80];
    const s = buildSynthetic(
      a.map((ai, i) => knots([[ai, 800], [b[i] ?? 0, 1000]])),
      SYN_DISTANCE,
    );
    const v = verdictsOf(s);
    expectInKey(v[0] ?? '', 'faded', 'Horse 0');
  });

  it('stayed_on: 직선 입구보다 3계단 이상 올라 입상하면 stayed_on 문장을 쓴다', () => {
    const s = buildSynthetic(
      [
        knots([[90, 1000]]),
        knots([[97, 1000]]),
        knots([[98, 1000]]),
        knots([[99, 1000]]),
        knots([[45, 470], [80, 600], [95, 1000]]),
      ],
      SYN_DISTANCE,
    );
    const v = verdictsOf(s);
    expectInKey(v[4] ?? '', 'stayed_on', 'Horse 4');
  });

  it('골든 레이스: 출주마 전원에게 문장 1개씩 준다', () => {
    const g = goldenRace();
    const v = horseVerdicts({
      replay: g.replay,
      result: g.out.sim.result,
      names: g.names,
      seed: GOLDEN.seed,
      lines,
      path: g.out.path,
    });
    expect(Object.keys(v)).toHaveLength(g.out.sim.result.runners.length);
    for (const r of g.out.sim.result.runners) {
      const text = v[r.runnerIndex];
      expect(text, `runner ${r.runnerIndex}`).toBeTruthy();
      expect(text ?? '').not.toMatch(/[{}]/);
    }
  });
});

describe('commentary.ko.json 형식', () => {
  const REQUIRED_KEYS = [
    'start',
    'slow_start',
    'early_leader',
    'lead_battle',
    'pace_fast',
    'pace_slow',
    'turn_in',
    'move',
    'lead_change',
    'final_furlong',
    'photo',
    'finish',
    'made_all',
    'came_from_back',
    'faded',
    'stayed_on',
    'never_dangerous',
    'ran_to_form',
    'winner_easy',
    'winner_narrow',
  ];
  const PLACEHOLDERS = new Set(['horse', 'horse2', 'n']);
  const table = commentaryJson as Record<string, string[]>;

  it('필수 키가 정확히 있고 키마다 후보가 5개 이상이다', () => {
    expect(Object.keys(table).sort()).toEqual([...REQUIRED_KEYS].sort());
    for (const key of REQUIRED_KEYS) {
      const list = table[key] ?? [];
      expect(list.length, key).toBeGreaterThanOrEqual(5);
    }
  });

  it('자리 표시는 정의된 것만 쓰고, {horse} 뒤에 한글 조사가 오지 않는다', () => {
    for (const key of REQUIRED_KEYS) {
      for (const sentence of table[key] ?? []) {
        for (const m of sentence.matchAll(/\{([^{}]*)\}/g)) {
          expect(PLACEHOLDERS.has(m[1] ?? ''), `${key}: {${m[1]}}`).toBe(true);
        }
        expect(sentence, key).not.toMatch(/\{horse2?\}[이가을를은는의]/);
      }
    }
  });

  it('getCommentaryLines 는 같은 표를 준다', () => {
    expect(getCommentaryLines()).toEqual(table);
  });
});

describe('실황 처리 시간 (골든 레이스 1개, 사건 + 문장 + 한 줄 평)', () => {
  it('중앙값 5ms 미만이다 (워밍업 5회 후 31회)', () => {
    const g = goldenRace();
    const lines = getCommentaryLines();
    const run = (): void => {
      const events = extractCommentaryEvents({
        replay: g.replay,
        result: g.out.sim.result,
        path: g.out.path,
        distance: g.race.distance,
      });
      renderCommentary(events, g.names, GOLDEN.seed, lines);
      horseVerdicts({ replay: g.replay, result: g.out.sim.result, names: g.names, seed: GOLDEN.seed, lines, path: g.out.path });
    };
    for (let w = 0; w < 5; w++) run();
    const times: number[] = [];
    for (let r = 0; r < 31; r++) {
      const start = performance.now();
      run();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[15] as number;
    console.info(`commentary median ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(5);
  });
});
