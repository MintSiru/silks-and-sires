import { neutralPersonality } from '../../src/engine/horse/traits';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import {
  conditionFactor,
  courseFit,
  distanceFit,
  estimateStrength,
  exhaustedSpeed,
  paceFactor,
  prepareRunner,
  rawSpeed,
  speedMultiplier,
  staminaDrainPerSecond,
  weightFactor,
  powerGoingFit,
  type RaceContext,
} from '../../src/engine/race/runnerModel';
import { CRUISE_FRACTION } from '../../src/engine/config/runner';
import type {
  Abilities,
  Aptitudes,
  Condition,
  RunnerInput,
} from '../../src/engine/types';

/** 평균마 기본값. 거리별 테스트는 distanceOptimum 을 레이스 거리로 맞춘다. */
const AVG_ABILITY: Abilities = {
  speed: 60,
  stamina: 60,
  acceleration: 60,
  guts: 60,
  power: 60,
};

const AVG_CONDITION: Condition = {
  fitness: 100,
  fatigue: 0,
  mental: 50,
  injury: null,
};

const SILKS = { primary: '#ffffff', secondary: '#000000', pattern: 'plain' as const };

function avgAptitudes(distance: number): Aptitudes {
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

interface Overrides {
  distance?: number;
  ability?: Partial<Abilities>;
  aptitude?: Partial<Aptitudes>;
  condition?: Partial<Condition>;
  weightLb?: number;
  draw?: number;
  skill?: number;
}

function makeInput(o: Overrides = {}): RunnerInput {
  return {
    entry: {
      horseId: 'h1',
      saddleCloth: 1,
      draw: o.draw ?? 1,
      jockeyId: 'j1',
      weightLb: o.weightLb ?? 126,
      tactic: 'prominent',
      silks: SILKS,
      isPlayer: false,
      odds: null,
    },
    horse: {
      id: 'h1',
      name: 'Test Horse',
      sex: 'male',
      birthYear: 2020,
      ability: { ...AVG_ABILITY, ...o.ability },
      aptitude: { ...avgAptitudes(o.distance ?? 1600), ...o.aptitude },
      condition: { ...AVG_CONDITION, ...o.condition },
      preferredStyle: 'prominent',
      personality: neutralPersonality(),
    },
    jockey: { id: 'j1', name: 'Test Jockey', skill: o.skill ?? 50 },
  };
}

function makeCtx(distance = 1600, extra: Partial<RaceContext> = {}): RaceContext {
  return {
    distance,
    going: 'good',
    surface: 'turf',
    handedness: 'left',
    undulation: 0.5,
    trackWidth: 30,
    ...extra,
  };
}

describe('수용 기준 1: 평균마 순항 속도', () => {
  it('평균마 1600m 의 순항 속도(폼 제외)는 15.9~16.4 m/s 이다', () => {
    const input = makeInput();
    const ctx = makeCtx(1600);
    const cruise = rawSpeed(input.horse.ability.speed) * CRUISE_FRACTION * speedMultiplier(input, ctx);
    expect(cruise).toBeGreaterThanOrEqual(15.9);
    expect(cruise).toBeLessThanOrEqual(16.4);
    expect(cruise).toBeCloseTo(16.3, 1);
  });

  it('같은 평균마에서 1006m > 1600m > 3219m 순으로 순항 속도가 빠르다', () => {
    const cruiseAt = (distance: number): number => {
      const input = makeInput({ distance });
      return rawSpeed(input.horse.ability.speed) * CRUISE_FRACTION * speedMultiplier(input, makeCtx(distance));
    };
    const c1006 = cruiseAt(1006);
    const c1600 = cruiseAt(1600);
    const c3219 = cruiseAt(3219);
    expect(c1006).toBeGreaterThan(c1600);
    expect(c1600).toBeGreaterThan(c3219);
  });
});

describe('수용 기준 2: 단조성', () => {
  it('speed 능력 +10 이면 같은 시드에서 순항 속도가 증가한다', () => {
    const ctx = makeCtx(1600);
    const low = prepareRunner(makeInput({ ability: { speed: 60 } }), 0, ctx, createRng(7));
    const high = prepareRunner(makeInput({ ability: { speed: 70 } }), 0, ctx, createRng(7));
    expect(high.cruiseSpeed).toBeGreaterThan(low.cruiseSpeed);
  });

  it('부담중량 +7lb 이면 speedMultiplier 가 약 0.7% 감소한다', () => {
    const ctx = makeCtx(1600);
    const base = speedMultiplier(makeInput({ weightLb: 126 }), ctx);
    const heavier = speedMultiplier(makeInput({ weightLb: 133 }), ctx);
    expect(heavier).toBeLessThan(base);
    expect(heavier / base).toBeCloseTo(0.993, 6);
  });

  it('heavy 마장에서 power 80 말의 powerGoingFit 이 power 40 말보다 크다', () => {
    expect(powerGoingFit(80, 'heavy')).toBeGreaterThan(powerGoingFit(40, 'heavy'));
  });

  it('distanceOptimum 이 레이스 거리에서 800m 벗어나면 distanceFit < 0.975', () => {
    const fit = distanceFit({ distanceOptimum: 800, distanceRange: 400 }, 1600);
    expect(fit).toBeLessThan(0.975);
  });

  it('paceFactor 는 거리가 길수록 작다', () => {
    expect(paceFactor(1006)).toBeGreaterThan(paceFactor(1600));
    expect(paceFactor(1600)).toBeGreaterThan(paceFactor(3219));
  });

  it('courseFit: 좌회전 적성이 높은 말이 좌회전 코스에서 더 높다', () => {
    const apt = { leftHanded: 1, rightHanded: 0, undulation: 0 };
    expect(courseFit(apt, 'left', 0.5)).toBeGreaterThan(courseFit(apt, 'right', 0.5));
    expect(courseFit(apt, 'straight', 0.5)).toBe(1);
  });

  it('weightFactor 는 기준 중량에서 정확히 1 이다', () => {
    expect(weightFactor(126)).toBe(1);
  });

  it('conditionFactor: 평균 컨디션은 1, 피로가 쌓이면 낮아진다', () => {
    expect(conditionFactor(AVG_CONDITION)).toBe(1);
    expect(conditionFactor({ ...AVG_CONDITION, fatigue: 80 })).toBeLessThan(1);
  });
});

describe('수용 기준 3: goingFit 반영', () => {
  it('heavy 마장에서 heavy 선호 말이 firm 선호 말보다 speedMultiplier 가 크다', () => {
    const ctx = makeCtx(1600, { going: 'heavy' });
    const heavyLover = makeInput({ aptitude: { goingPreference: 6 } });
    const firmLover = makeInput({ aptitude: { goingPreference: 0 } });
    expect(speedMultiplier(heavyLover, ctx)).toBeGreaterThan(speedMultiplier(firmLover, ctx));
  });
});

describe('수용 기준 4: 결정성과 rng 소비', () => {
  it('같은 시드로 prepareRunner 를 두 번 호출하면 깊은 비교로 같다', () => {
    const input = makeInput();
    const ctx = makeCtx(1600);
    const a = prepareRunner(input, 3, ctx, createRng(20261011));
    const b = prepareRunner(input, 3, ctx, createRng(20261011));
    expect(a).toEqual(b);
  });

  it('prepareRunner 후 rng 상태는 next() 3회분 진행한 상태와 같다 (normal 2회 + next 1회)', () => {
    const input = makeInput();
    const ctx = makeCtx(1600);
    const used = createRng(99);
    const reference = createRng(99);
    prepareRunner(input, 0, ctx, used);
    reference.next();
    reference.next();
    reference.next();
    expect(used.getState()).toEqual(reference.getState());
  });

  it('prepareRunner 는 index, horseId, style 을 입력에서 그대로 옮긴다', () => {
    const r = prepareRunner(makeInput(), 5, makeCtx(1600), createRng(1));
    expect(r.index).toBe(5);
    expect(r.horseId).toBe('h1');
    expect(r.style).toBe('prominent');
  });

  it('탈진 속도는 순항 속도보다 작다', () => {
    const r = prepareRunner(makeInput(), 0, makeCtx(1600), createRng(3));
    expect(exhaustedSpeed(r)).toBeLessThan(r.cruiseSpeed);
  });
});

describe('수용 기준 5: 출발 레인 (startLane)', () => {
  it('draw 1 → 0.5 m', () => {
    const r = prepareRunner(makeInput({ draw: 1 }), 0, makeCtx(1600, { trackWidth: 30 }), createRng(5));
    expect(r.startLane).toBeCloseTo(0.5, 9);
  });

  it('draw 10 → 10.4 m', () => {
    const r = prepareRunner(makeInput({ draw: 10 }), 0, makeCtx(1600, { trackWidth: 30 }), createRng(5));
    expect(r.startLane).toBeCloseTo(10.4, 9);
  });

  it('폭 22 에서 draw 30 은 21.5 m 로 clamp 된다', () => {
    const r = prepareRunner(makeInput({ draw: 30 }), 0, makeCtx(1600, { trackWidth: 22 }), createRng(5));
    expect(r.startLane).toBeCloseTo(21.5, 9);
  });
});

describe('수용 기준 6: 스태미나 소모', () => {
  it('staminaDrainPerSecond(16, 16, 0, good, 0.5) = 1', () => {
    expect(staminaDrainPerSecond(16, 16, 0, 'good', 0.5)).toBeCloseTo(1, 9);
  });

  it("heavy 에서는 1.16 배다", () => {
    expect(staminaDrainPerSecond(16, 16, 0, 'heavy', 0.5)).toBeCloseTo(1.16, 9);
  });

  it('경사 0.02, power01 0 이면 good 에서 1.16 이다', () => {
    expect(staminaDrainPerSecond(16, 16, 0.02, 'good', 0)).toBeCloseTo(1.16, 9);
  });

  it('경사 0.02, power01 1 이면 good 에서 1.08 이다', () => {
    expect(staminaDrainPerSecond(16, 16, 0.02, 'good', 1)).toBeCloseTo(1.08, 9);
  });
});

describe('수용 기준 7: estimateStrength', () => {
  it('평균마보다 speed 10 높은 말이 더 크다', () => {
    const ctx = makeCtx(1600);
    const avg = estimateStrength(makeInput(), ctx);
    const fast = estimateStrength(makeInput({ ability: { speed: 70 } }), ctx);
    expect(fast).toBeGreaterThan(avg);
  });

  it('3219m 에서 stamina 20 말은 stamina 80 말보다 작다', () => {
    const ctx = makeCtx(3219);
    const weak = estimateStrength(makeInput({ distance: 3219, ability: { stamina: 20 } }), ctx);
    const strong = estimateStrength(makeInput({ distance: 3219, ability: { stamina: 80 } }), ctx);
    expect(weak).toBeLessThan(strong);
  });

  it('난수를 쓰지 않으므로 같은 입력에 항상 같은 값을 준다', () => {
    const ctx = makeCtx(1600);
    expect(estimateStrength(makeInput(), ctx)).toBe(estimateStrength(makeInput(), ctx));
  });
});
