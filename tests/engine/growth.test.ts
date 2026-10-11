import { describe, expect, it } from 'vitest';
import { GROWTH_DECLINE_RATE, GROWTH_PEAK_AGE } from '../../src/engine/config/horse';
import { WEANING_WEEK } from '../../src/engine/config/growth';
import { createRng } from '../../src/engine/rng';
import { generateHorse } from '../../src/engine/horse/generate';
import { ageInYearsAt, growthSystem } from '../../src/engine/horse/growth';
import { createNewGame } from '../../src/engine/state/newGame';
import { addWeeks } from '../../src/engine/time/calendar';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameEvent, GameState, Horse, HorseStatus, Sex } from '../../src/engine/types';

const SILKS = { primary: '#1d4ed8', secondary: '#facc15', pattern: 'hoops' as const };

function newGame(): GameState {
  return createNewGame({ seed: 7, playerName: 'Test Owner', silks: SILKS });
}

function makeHorse(
  id: string,
  opts: { birthYear: number; status: HorseStatus; sex?: Sex; seed?: string },
): Horse {
  return generateHorse(createRng(opts.seed ?? `growth-${id}`), {
    id,
    name: `Test ${id}`,
    sex: opts.sex ?? 'male',
    birthYear: opts.birthYear,
    currentYear: opts.birthYear,
    countryOfBirth: 'GB',
    status: opts.status,
    level: 60,
  });
}

function stateWith(horses: Horse[]): GameState {
  const state = newGame();
  state.horses = Object.fromEntries(horses.map((h) => [h.id, h]));
  return state;
}

/** 주어진 날짜에서 growthSystem 만 한 주 실행한다. state 는 직접 변형된다. */
function runGrowthWeek(state: GameState, date: { year: number; week: number }, events: GameEvent[]): void {
  events.push(...growthSystem.run(state, { date, rng: createRng(1) }));
}

describe('ageInYearsAt', () => {
  it('출생 연도 1주는 정수 나이, 이후 주는 52분의 1 단위로 증가한다', () => {
    expect(ageInYearsAt(2024, { year: 2024, week: 1 })).toBe(0);
    expect(ageInYearsAt(2024, { year: 2026, week: 1 })).toBe(2);
    expect(ageInYearsAt(2024, { year: 2026, week: 27 })).toBeCloseTo(2.5, 10);
  });
});

describe('수용 기준 1: 2026년 출생 망아지의 단계 전환', () => {
  it('36주에 weanling, 2027년 1주에 yearling 이벤트가 나오고 이후 상태 변화가 없다', () => {
    const foal = makeHorse('h1', { birthYear: 2026, status: 'foal' });
    let state = stateWith([foal]);
    const statusEvents: GameEvent[] = [];

    // 2026년 1주부터 2027년 1주까지(53회 진행) + 이후 60주
    for (let i = 0; i < 53 + 60; i++) {
      const result = advanceWeek(state);
      statusEvents.push(...result.events.filter((e) => e.type === 'horse_status_changed'));
      state = result.state;
    }

    expect(statusEvents).toEqual([
      {
        type: 'horse_status_changed',
        horseId: 'h1',
        from: 'foal',
        to: 'weanling',
        date: { year: 2026, week: WEANING_WEEK },
      },
      {
        type: 'horse_status_changed',
        horseId: 'h1',
        from: 'weanling',
        to: 'yearling',
        date: { year: 2027, week: 1 },
      },
    ]);
    expect(state.horses['h1']?.status).toBe('yearling');
  });

  it('36주 이전에는 foal 을 유지한다', () => {
    const foal = makeHorse('h1', { birthYear: 2026, status: 'foal' });
    let state = stateWith([foal]);
    for (let week = 1; week < WEANING_WEEK; week++) {
      const result = advanceWeek(state);
      expect(result.events).not.toContainEqual(expect.objectContaining({ type: 'horse_status_changed' }));
      state = result.state;
    }
    expect(state.horses['h1']?.status).toBe('foal');
  });
});

describe('단계 전환 경계', () => {
  it('전년도 출생 망아지는 해가 바뀌는 첫 주에 weanling 과 yearling 을 연달아 기록한다', () => {
    const foal = makeHorse('h1', { birthYear: 2025, status: 'foal' });
    const state = stateWith([foal]);
    const events: GameEvent[] = [];
    runGrowthWeek(state, { year: 2026, week: 1 }, events);
    expect(events).toEqual([
      {
        type: 'horse_status_changed',
        horseId: 'h1',
        from: 'foal',
        to: 'weanling',
        date: { year: 2026, week: 1 },
      },
      {
        type: 'horse_status_changed',
        horseId: 'h1',
        from: 'weanling',
        to: 'yearling',
        date: { year: 2026, week: 1 },
      },
    ]);
    expect(state.horses['h1']?.status).toBe('yearling');
  });

  it('yearling 은 growthSystem 이 in_training 으로 바꾸지 않는다(M3 담당)', () => {
    const yearling = makeHorse('h1', { birthYear: 2025, status: 'yearling' });
    const state = stateWith([yearling]);
    const events: GameEvent[] = [];
    for (let week = 1; week <= 52; week++) {
      runGrowthWeek(state, { year: 2026, week }, events);
    }
    expect(events).toEqual([]);
    expect(state.horses['h1']?.status).toBe('yearling');
  });
});

describe('수용 기준 2: normal 성장형의 능력 곡선', () => {
  it('2세→4세 동안 speed 가 단조 증가하고 4~5세에 potential 과 같다(1e-9)', () => {
    const horse = makeHorse('h1', { birthYear: 2024, status: 'in_training' });
    horse.growth = {
      type: 'normal',
      peakAge: GROWTH_PEAK_AGE.normal,
      declineRate: GROWTH_DECLINE_RATE.normal,
    };
    const state = stateWith([horse]);
    const events: GameEvent[] = [];

    const start = { year: 2026, week: 1 };
    const age4 = { year: 2028, week: 1 };
    const age5 = { year: 2029, week: 1 };

    // 2세 → 4세: 매주 값이 직전보다 커야 한다
    let prev = -Infinity;
    let date = start;
    while (date.year < age4.year || (date.year === age4.year && date.week <= age4.week)) {
      runGrowthWeek(state, date, events);
      const speed = state.horses['h1']?.ability.speed ?? NaN;
      expect(speed).toBeGreaterThan(prev);
      prev = speed;
      date = addWeeks(date, 1);
    }

    // 4세 → 5세: potential 과 같다
    const potentialSpeed = horse.potential.speed;
    date = age4;
    while (date.year < age5.year || (date.year === age5.year && date.week <= age5.week)) {
      runGrowthWeek(state, date, events);
      const speed = state.horses['h1']?.ability.speed ?? NaN;
      expect(Math.abs(speed - potentialSpeed)).toBeLessThan(1e-9);
      date = addWeeks(date, 1);
    }
  });
});

describe('수용 기준 3: historical·dead 말은 변경되지 않는다', () => {
  it('historical 과 dead 말의 JSON 이 60주 진행 후에도 같다', () => {
    const historical = makeHorse('hist', { birthYear: 1990, status: 'historical' });
    const dead = makeHorse('dead', { birthYear: 2010, status: 'dead' });
    const state = stateWith([historical, dead]);
    const before = JSON.stringify([state.horses['hist'], state.horses['dead']]);

    const events: GameEvent[] = [];
    let date = { year: 2026, week: 1 };
    for (let i = 0; i < 60; i++) {
      runGrowthWeek(state, date, events);
      date = addWeeks(date, 1);
    }

    expect(JSON.stringify([state.horses['hist'], state.horses['dead']])).toBe(before);
    expect(events).toEqual([]);
  });
});

describe('growthSystem 은 rng 를 쓰지 않는다', () => {
  it('run 호출 전후 rng 상태가 같다', () => {
    const horse = makeHorse('h1', { birthYear: 2025, status: 'foal' });
    const state = stateWith([horse]);
    const rng = createRng('no-rng-use');
    const before = rng.getState();
    growthSystem.run(state, { date: { year: 2026, week: 40 }, rng });
    expect(rng.getState()).toEqual(before);
  });
});

describe('수용 기준 4: advanceWeek 재현성', () => {
  it('같은 상태로 52주를 두 번 진행하면 JSON 이 같다', () => {
    const horses = [
      makeHorse('h1', { birthYear: 2026, status: 'foal', seed: 'a' }),
      makeHorse('h2', { birthYear: 2024, status: 'in_training', seed: 'b' }),
      makeHorse('h3', { birthYear: 2025, status: 'weanling', seed: 'c' }),
      makeHorse('h4', { birthYear: 1995, status: 'historical', seed: 'd' }),
    ];
    const run = (): string => {
      let state = stateWith(horses);
      for (let i = 0; i < 52; i++) {
        state = advanceWeek(state).state;
      }
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });
});
