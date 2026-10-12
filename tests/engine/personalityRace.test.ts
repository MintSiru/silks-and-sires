import { describe, expect, it } from 'vitest';
import { neutralPersonality } from '../../src/engine/horse/traits';
import { getRacecourse, loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath } from '../../src/engine/course/path';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { createRng } from '../../src/engine/rng';
import { simulateRace } from '../../src/engine/race/simulate';
import {
  overheatLevel,
  personaDeviation,
  prepareRunner,
  resolveStyle,
  type RaceContext,
} from '../../src/engine/race/runnerModel';
import type {
  Abilities,
  Personality,
  Race,
  RaceSimInput,
  Racecourse,
  RunnerInput,
  RunningStyle,
} from '../../src/engine/types';

/**
 * M3-C5b: 성격 5축의 레이스 반영 검증.
 * 모든 효과는 성격값 50 에서 0 이어야 하며(골든 보존), 아래 수용 기준 2~5를 고정 시드로 확인한다.
 */

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);
const COURSE = getRacecourse(COURSES, 'saint_ourens');
const DATE = { year: 2026, week: 20 };
const SILKS = { primary: '#ffffff', secondary: '#000000', pattern: 'plain' as const };
const AVG: Abilities = { speed: 60, stamina: 60, acceleration: 60, guts: 60, power: 60 };

function personality(o: Partial<Personality> = {}): Personality {
  return { ...neutralPersonality(), ...o };
}

function aptitudes(distance: number) {
  return {
    distanceOptimum: distance,
    distanceRange: 400,
    goingPreference: 2,
    goingTolerance: 1.5,
    allWeather: 0,
    dirt: 0,
    leftHanded: 0,
    rightHanded: 0,
    undulation: 0,
  };
}

/** 같은 능력의 평균마. draw 로 출발 게이트, 성격·작전·선호 주로를 지정한다. */
function runner(
  id: string,
  draw: number,
  p: Personality,
  opts: { tactic?: RunningStyle; preferred?: RunningStyle; distance?: number } = {},
): RunnerInput {
  const distance = opts.distance ?? 2400;
  return {
    entry: {
      horseId: id,
      saddleCloth: draw,
      draw,
      jockeyId: `jk-${id}`,
      weightLb: 126,
      tactic: opts.tactic ?? 'prominent',
      silks: SILKS,
      isPlayer: false,
      odds: null,
    },
    horse: {
      id,
      name: `Horse ${id}`,
      sex: 'male',
      birthYear: 2020,
      ability: { ...AVG },
      aptitude: aptitudes(distance),
      condition: { fitness: 100, fatigue: 0, mental: 50, injury: null },
      preferredStyle: opts.preferred ?? 'prominent',
      personality: p,
    },
    jockey: { id: `jk-${id}`, name: `Jockey ${id}`, skill: 50 },
  };
}

function raceOf(distance: number): Race {
  return {
    id: `pers-${distance}`,
    name: 'Personality Test Handicap',
    racecourseId: COURSE.id,
    distance,
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
    prizeMoney: [10000, 4000],
    maxRunners: 20,
  };
}

function simulate(runners: RunnerInput[], distance: number, seed: number, recordReplay: boolean) {
  const input: RaceSimInput = {
    race: raceOf(distance),
    course: COURSE,
    going: 'good',
    date: DATE,
    runners,
    seed,
    options: { recordReplay },
  };
  return simulateRace(input);
}

const CTX: RaceContext = {
  distance: 2400,
  going: 'good',
  surface: 'turf',
  handedness: 'left',
  undulation: 0.5,
  trackWidth: buildRacePath(COURSE, 2400, undefined).width,
};

/** 두 말 레이스를 N회 돌려 주인공(a) 기준 집계. draw 는 짝수 회차에 바꿔 게이트 편향을 없앤다. */
interface DuelStats {
  /** 최초로 누군가 400m 를 넘긴 순간 선두가 a 인 비율 */
  leadAt400: number;
  /** a 의 평균 착순 (1 = 우승) */
  avgPosition: number;
  /** a 우승 비율 */
  winA: number;
  /** b 우승 비율 */
  winB: number;
}

function duel(
  pa: Personality,
  pb: Personality,
  distance: number,
  runs: number,
  opts: { tactic?: RunningStyle; recordReplay: boolean; baseSeed: number },
): DuelStats {
  let lead = 0;
  let positionSum = 0;
  let winA = 0;
  let winB = 0;
  for (let s = 0; s < runs; s++) {
    const swap = s % 2 === 1;
    const a = runner('a', swap ? 2 : 1, pa, { tactic: opts.tactic, distance });
    const b = runner('b', swap ? 1 : 2, pb, { tactic: opts.tactic, distance });
    const out = simulate([a, b], distance, opts.baseSeed + s, opts.recordReplay);
    const posA = out.result.runners.find((r) => r.horseId === 'a')?.position ?? 0;
    const posB = out.result.runners.find((r) => r.horseId === 'b')?.position ?? 0;
    positionSum += posA;
    if (posA === 1) winA++;
    if (posB === 1) winB++;
    if (out.replay !== null) {
      const frames = out.replay.frames;
      const ia = out.replay.horseIds.indexOf('a');
      const ib = out.replay.horseIds.indexOf('b');
      let k = 0;
      while (k < frames.length - 1 && Math.max(...(frames[k]?.progress ?? [0])) < 400) k++;
      const f = frames[k];
      if (f !== undefined && (f.progress[ia] ?? 0) > (f.progress[ib] ?? 0)) lead++;
    }
  }
  return {
    leadAt400: lead / runs,
    avgPosition: positionSum / runs,
    winA: winA / runs,
    winB: winB / runs,
  };
}

describe('성격 파생값 (성격 50 이면 0 또는 배수 1)', () => {
  it('중립 성격의 과열도·겁·경합 배율·초반 배수는 정확히 0 또는 1 이다', () => {
    const p = neutralPersonality();
    expect(personaDeviation(50)).toBe(0);
    expect(overheatLevel(p)).toBe(0);
    const r = prepareRunner(runner('n', 1, p), 0, CTX, createRng(11), createRng('persona:1:n'));
    expect(r.overheat).toBe(0);
    expect(r.timidity).toBe(0);
    expect(r.battleGutsScale).toBe(1);
    expect(r.earlySpeedMult).toBe(1);
    expect(r.earlyDrainMult).toBe(1);
  });

  it('과열(기세 90·침착 10)은 초반 속도 배수 > 1, 소모 배수 > 1 이다', () => {
    const r = prepareRunner(
      runner('h', 1, personality({ drive: 90, composure: 10 })),
      0,
      CTX,
      createRng(11),
    );
    expect(r.overheat).toBeCloseTo(0.8, 10);
    expect(r.earlySpeedMult).toBeGreaterThan(1);
    expect(r.earlyDrainMult).toBeGreaterThan(1);
  });

  it('느긋함(기세 10·침착 90)은 초반 속도 배수 < 1 이고 소모 배수는 1 이다', () => {
    const r = prepareRunner(
      runner('c', 1, personality({ drive: 10, composure: 90 })),
      0,
      CTX,
      createRng(11),
    );
    expect(r.overheat).toBeLessThan(0);
    expect(r.earlySpeedMult).toBeLessThan(1);
    expect(r.earlyDrainMult).toBe(1);
  });

  it('성격 난수 스트림이 없으면 고집 무시 판정을 하지 않는다', () => {
    const input = runner('s', 1, personality({ stubbornness: 100 }), {
      tactic: 'held_up',
      preferred: 'front',
    });
    expect(resolveStyle(input, undefined)).toBe('held_up');
  });

  it('prepareRunner 는 성격 스트림을 써도 레이스 rng 를 기존과 같은 3회분만 소비한다', () => {
    const used = createRng(77);
    const reference = createRng(77);
    prepareRunner(
      runner('u', 1, personality({ stubbornness: 100 }), { tactic: 'held_up', preferred: 'front' }),
      0,
      CTX,
      used,
      createRng('persona:77:u'),
    );
    reference.normal(0, 1); // 레이스 rng 2회 소비
    reference.next(); // 레이스 rng 1회 소비
    expect(used.getState()).toEqual(reference.getState());
  });
});

describe('수용 기준 2: 과열', () => {
  it('기세 90·침착 10 말은 400m 선두 비율이 중립보다 높고 평균 착순이 더 나쁘다 (2,400m, 300회)', () => {
    const hot = duel(personality({ drive: 90, composure: 10 }), neutralPersonality(), 2400, 300, {
      recordReplay: true,
      baseSeed: 10_000,
    });
    const base = duel(neutralPersonality(), neutralPersonality(), 2400, 300, {
      recordReplay: true,
      baseSeed: 10_000,
    });
    expect(hot.leadAt400).toBeGreaterThan(base.leadAt400);
    expect(hot.leadAt400).toBeGreaterThan(0.5);
    expect(hot.avgPosition).toBeGreaterThan(base.avgPosition);
  }, 120_000);
});

describe('수용 기준 3: 겁', () => {
  it('겁 95 말의 평균 출발 지연은 중립보다 크다 (300회)', () => {
    const mean = (timidity: number): number => {
      let sum = 0;
      for (let s = 0; s < 300; s++) {
        sum += prepareRunner(runner('t', 5, personality({ timidity })), 0, CTX, createRng(s + 1))
          .startDelay;
      }
      return sum / 300;
    };
    expect(mean(95)).toBeGreaterThan(mean(50));
  });

  it('겁 95 말의 평균 레인 위치는 중립보다 바깥쪽이다', () => {
    const meanLane = (timidity: number): number => {
      let sum = 0;
      let count = 0;
      for (let s = 0; s < 100; s++) {
        const out = simulate(
          [runner('t', 5, personality({ timidity })), runner('o', 6, neutralPersonality())],
          2400,
          20_000 + s,
          true,
        );
        const replay = out.replay;
        if (replay === null) continue;
        const idx = replay.horseIds.indexOf('t');
        for (const f of replay.frames) {
          sum += f.lane[idx] ?? 0;
          count++;
        }
      }
      return sum / count;
    };
    expect(meanLane(95)).toBeGreaterThan(meanLane(50));
  }, 120_000);
});

describe('수용 기준 4: 투쟁심', () => {
  it('같은 능력 1,600m 경합에서 투쟁심 95 쪽 승률 ≥ 0.55, 투쟁심 5 쪽 ≤ 0.45 (500회)', () => {
    const stats = duel(personality({ fight: 95 }), personality({ fight: 5 }), 1600, 500, {
      recordReplay: false,
      baseSeed: 30_000,
    });
    expect(stats.winA).toBeGreaterThanOrEqual(0.55);
    expect(stats.winB).toBeLessThanOrEqual(0.45);
  }, 120_000);
});

describe('수용 기준 5: 고집', () => {
  const ctx: RaceContext = { ...CTX, distance: 1600 };

  it('고집 100·선호 front·작전 held_up 말은 1,000회 중 front 로 달리는 비율이 0.25~0.35', () => {
    let front = 0;
    for (let s = 0; s < 1000; s++) {
      const r = prepareRunner(
        runner('s', 3, personality({ stubbornness: 100 }), { tactic: 'held_up', preferred: 'front' }),
        0,
        ctx,
        createRng(s + 1),
        createRng(`persona:${s}:s`),
      );
      if (r.style === 'front') front++;
    }
    const ratio = front / 1000;
    expect(ratio).toBeGreaterThanOrEqual(0.25);
    expect(ratio).toBeLessThanOrEqual(0.35);
  });

  it('고집 50 이면 작전을 무시하지 않는다 (비율 0)', () => {
    let front = 0;
    for (let s = 0; s < 1000; s++) {
      const r = prepareRunner(
        runner('s', 3, personality({ stubbornness: 50 }), { tactic: 'held_up', preferred: 'front' }),
        0,
        ctx,
        createRng(s + 1),
        createRng(`persona:${s}:s`),
      );
      if (r.style === 'front') front++;
    }
    expect(front).toBe(0);
  });
});

describe('성격 레이스 재현성', () => {
  it('같은 시드·같은 성격이면 결과와 리플레이가 같다', () => {
    const build = (): RunnerInput[] => [
      runner('a', 1, personality({ drive: 85, composure: 20, fight: 80, timidity: 70 })),
      runner('b', 2, personality({ stubbornness: 90 }), { tactic: 'held_up', preferred: 'front' }),
      runner('c', 3, neutralPersonality()),
    ];
    const x = simulate(build(), 2400, 4242, true);
    const y = simulate(build(), 2400, 4242, true);
    expect(JSON.stringify(x.result)).toBe(JSON.stringify(y.result));
    expect(x.replay).toEqual(y.replay);
  });
});
