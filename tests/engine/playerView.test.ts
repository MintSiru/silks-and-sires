import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_ASSESSOR_SKILL,
  STAGE_FOAL_MAX_AGE,
  STAGE_YEARLING_MAX_AGE,
  STAGE_ADULT_MIN_AGE,
} from '../../src/engine/config/playerView';
import { PLAYER_START_MARES } from '../../src/engine/config/world';
import { WEEKS_PER_YEAR, START_YEAR } from '../../src/engine/config/game';
import { getNamingData, getNicks, getRaceTemplates, getRacecourses, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import {
  assessForPlayer,
  availableStallions,
  playerHorses,
  stageFor,
} from '../../src/engine/horse/playerView';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { bootstrapWorld, type WorldStaticData } from '../../src/engine/state/world';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  AssessmentStage,
  GameDate,
  GameEvent,
  GameState,
  Horse,
} from '../../src/engine/types';

const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;
const START_SEED = 20260101;

function worldData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    naming: getNamingData(),
  };
}

/** 주 시스템 전체 정적 데이터(시즌 시스템·연간 교체 포함) */
function gameData(): GameStaticData {
  return {
    nicks: getNicks(),
    naming: getNamingData(),
    stallionNames: getStallionNames(),
    stallionRecords: getStallionRecords(),
    courses: getRacecourses(),
    templates: getRaceTemplates(),
    series: getSeriesDefinitions(),
  };
}

function boot(seed = START_SEED): GameState {
  const game = createNewGame({ seed, playerName: 'Test Owner', silks: SILKS });
  return bootstrapWorld(game, worldData(), createRng(seed));
}

function firstPlayerHorse(state: GameState): Horse {
  const horse = playerHorses(state)[0];
  if (horse === undefined) {
    throw new Error('테스트 전제 위반: 플레이어 말이 없다');
  }
  return horse;
}

/** 나이가 정확히 `ageYears` 인 말을 만든다(START_YEAR 1주 기준). */
function horseOfAge(base: Horse, ageYears: number, status: Horse['status'] = 'weanling'): Horse {
  return { ...base, birthYear: START_YEAR - ageYears, status };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createGameSystems', () => {
  it('실행 순서는 달력 → 성장 → 교배 → 연간 교체 → 시즌이다', () => {
    const systems = createGameSystems(gameData());
    expect(systems.map((s) => s.id)).toEqual(['calendar', 'growth', 'breeding', 'population', 'season']);
  });

  it('52주 진행 시 세 시스템이 모두 주마다 한 번씩 실행되고 순서대로 호출된다', () => {
    const base = boot();
    const template = firstPlayerHorse(base);
    const foal: Horse = {
      ...template,
      id: 'h-test-foal',
      name: 'Test Foal',
      sex: 'female',
      gelded: false,
      birthYear: START_YEAR,
      status: 'foal',
      ownerId: null,
      breederId: null,
    };
    // 인물 없이 세계만 만든 상태이므로 연간 교체는 이미 올해 끝난 것으로 둔다(bootstrapGame 과 같은 상태)
    const state: GameState = {
      ...base,
      horses: { ...base.horses, [foal.id]: foal },
      seasonState: { ...base.seasonState, lastPopulationYear: START_YEAR },
    };

    const systems = createGameSystems(gameData());
    const spies = systems.map((s) => vi.spyOn(s, 'run'));

    let current = state;
    const events: GameEvent[] = [];
    for (let i = 0; i < WEEKS_PER_YEAR; i++) {
      const result = advanceWeek(current, systems);
      current = result.state;
      events.push(...result.events);
    }

    for (const spy of spies) {
      expect(spy.mock.calls.length).toBe(WEEKS_PER_YEAR);
    }
    const firstCalls = spies.map((s) => s.mock.invocationCallOrder[0] ?? -1);
    expect(firstCalls[0]).toBeLessThan(firstCalls[1] ?? -1);
    expect(firstCalls[1]).toBeLessThan(firstCalls[2] ?? -1);

    // 달력 시스템: 주 시작 이벤트와 네 단계의 시작 이벤트
    expect(events.filter((e) => e.type === 'week_started').length).toBe(WEEKS_PER_YEAR);
    const startedPhases = new Set(
      events.flatMap((e) => (e.type === 'phase_started' ? [e.phase] : [])),
    );
    expect(startedPhases).toEqual(new Set(['foaling', 'breeding', 'turf_flat', 'aw_winter']));

    // 성장 시스템: 2026년 출생 망아지가 이유마 단계로 넘어간다
    const foalChanges = events.filter(
      (e) => e.type === 'horse_status_changed' && e.horseId === foal.id,
    );
    expect(foalChanges.length).toBeGreaterThan(0);
    expect(current.horses[foal.id]?.status).not.toBe('foal');
  });
});

describe('assessForPlayer', () => {
  it('같은 주에 두 번 보면 같은 결과다', () => {
    const state = boot();
    const id = firstPlayerHorse(state).id;
    const a = assessForPlayer(state, id);
    const b = assessForPlayer(state, id);
    expect(b).toEqual(a);
  });

  it('state.rng 를 바꾸지 않는다', () => {
    const state = boot();
    const id = firstPlayerHorse(state).id;
    const before = structuredClone(state.rng);
    assessForPlayer(state, id);
    expect(state.rng).toEqual(before);
  });

  it('기본 평가자 능력은 PLAYER_ASSESSOR_SKILL 과 같다', () => {
    const state = boot();
    const id = firstPlayerHorse(state).id;
    expect(assessForPlayer(state, id)).toEqual(assessForPlayer(state, id, PLAYER_ASSESSOR_SKILL));
  });

  it('주가 바뀌면 결과가 달라질 수 있다(여러 주에 걸쳐 서로 다른 결과가 나온다)', () => {
    const state = boot();
    const id = firstPlayerHorse(state).id;
    const weeks = Array.from({ length: 10 }, (_, i) => i + 1);
    const variants = new Set(
      weeks.map((week) =>
        JSON.stringify(assessForPlayer({ ...state, date: { year: START_YEAR, week } }, id)),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('없는 말을 요청하면 throw 한다', () => {
    const state = boot();
    expect(() => assessForPlayer(state, 'h-does-not-exist')).toThrow();
  });
});

describe('stageFor', () => {
  const base = (() => {
    const state = boot();
    return firstPlayerHorse(state);
  })();
  const at = (year: number, week: number): GameDate => ({ year, week });

  it('in_training 상태는 나이와 무관하게 in_training 이다', () => {
    expect(stageFor({ ...base, status: 'in_training', birthYear: START_YEAR }, at(START_YEAR, 1))).toBe(
      'in_training',
    );
    expect(
      stageFor({ ...base, status: 'in_training', birthYear: START_YEAR - 5 }, at(START_YEAR, 1)),
    ).toBe('in_training');
  });

  it('나이 0 은 foal 이다', () => {
    expect(stageFor(horseOfAge(base, 0, 'foal'), at(START_YEAR, 1))).toBe('foal');
  });

  it('나이가 STAGE_FOAL_MAX_AGE 바로 아래면 foal, 정확히 같으면 yearling 이다', () => {
    const below = stageFor(horseOfAge(base, STAGE_FOAL_MAX_AGE), at(START_YEAR - 1, WEEKS_PER_YEAR));
    const exact = stageFor(horseOfAge(base, STAGE_FOAL_MAX_AGE), at(START_YEAR, 1));
    expect(below).toBe('foal');
    expect(exact).toBe('yearling');
  });

  it('나이가 STAGE_YEARLING_MAX_AGE 바로 아래면 yearling, 정확히 같으면 two_year_old 이다', () => {
    const below = stageFor(
      horseOfAge(base, STAGE_YEARLING_MAX_AGE),
      at(START_YEAR - 1, WEEKS_PER_YEAR),
    );
    const exact = stageFor(horseOfAge(base, STAGE_YEARLING_MAX_AGE), at(START_YEAR, 1));
    expect(below).toBe('yearling');
    expect(exact).toBe('two_year_old');
  });

  it('STAGE_ADULT_MIN_AGE 이상 성마(번식 암말)는 in_training 단계로 평가한다', () => {
    const below = stageFor(
      horseOfAge(base, STAGE_ADULT_MIN_AGE, 'broodmare'),
      at(START_YEAR - 1, WEEKS_PER_YEAR),
    );
    const exact = stageFor(horseOfAge(base, STAGE_ADULT_MIN_AGE, 'broodmare'), at(START_YEAR, 1));
    const old = stageFor(horseOfAge(base, 10, 'broodmare'), at(START_YEAR, 1));
    expect(below).toBe('two_year_old');
    expect(exact).toBe('in_training');
    expect(old).toBe('in_training');
  });

  it('단계 경계 순서: foal < yearling < two_year_old', () => {
    const order: AssessmentStage[] = ['foal', 'yearling', 'two_year_old'];
    const stages = [0, STAGE_FOAL_MAX_AGE, STAGE_YEARLING_MAX_AGE].map((age) =>
      stageFor(horseOfAge(base, age), at(START_YEAR, 1)),
    );
    expect(stages).toEqual(order);
  });
});

describe('playerHorses', () => {
  it('플레이어 보유 말을 id 오름차순으로 돌려준다', () => {
    const state = boot();
    const horses = playerHorses(state);
    expect(horses.length).toBe(PLAYER_START_MARES);
    const ids = horses.map((h) => h.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('owner.horseIds 의 순서가 뒤집혀 있어도 결과는 id 오름차순이다', () => {
    const state = boot();
    const reversed = structuredClone(state);
    const owner = reversed.owners[reversed.playerOwnerId];
    if (owner === undefined) throw new Error('테스트 전제 위반: 플레이어 마주 없음');
    owner.horseIds.reverse();
    const ids = playerHorses(reversed).map((h) => h.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toEqual(playerHorses(state).map((h) => h.id));
  });
});

describe('availableStallions', () => {
  it('교배 시작 연도가 된 종마를 빠짐없이 돌려주고 종부료 내림차순으로 정렬한다', () => {
    const state = boot();
    const rows = availableStallions(state);
    expect(rows.length).toBeGreaterThan(0);
    const startedCount = Object.values(state.stallions).filter((s) => s.firstSeasonYear <= state.date.year).length;
    expect(rows.length).toBe(startedCount);
    for (let i = 0; i + 1 < rows.length; i++) {
      const cur = rows[i];
      const next = rows[i + 1];
      if (cur === undefined || next === undefined) throw new Error('인덱스 오류');
      expect(cur.stallion.fee).toBeGreaterThanOrEqual(next.stallion.fee);
    }
    for (const row of rows) {
      expect(row.horse.id).toBe(row.stallion.horseId);
      expect(state.horses[row.horse.id]).toEqual(row.horse);
    }
  });

  it('종부료가 같으면 말 이름 오름차순이다', () => {
    const state = boot();
    const flat = structuredClone(state);
    for (const stallion of Object.values(flat.stallions)) {
      stallion.fee = 1;
    }
    const rows = availableStallions(flat);
    for (let i = 0; i + 1 < rows.length; i++) {
      const cur = rows[i];
      const next = rows[i + 1];
      if (cur === undefined || next === undefined) throw new Error('인덱스 오류');
      expect(cur.horse.name <= next.horse.name).toBe(true);
    }
  });

  it('같은 입력이면 같은 순서를 돌려준다', () => {
    const state = boot();
    const a = availableStallions(state).map((r) => r.horse.id);
    const b = availableStallions(state).map((r) => r.horse.id);
    expect(b).toEqual(a);
  });
});

describe('임대 복귀 종마 (M2-02 availableFromYear)', () => {
  it('American Pharoah 는 2027 부터 교배 가능 종마 목록에 나온다', () => {
    const state = boot();
    const ap = state.stallions['stl_american_pharoah'];
    expect(ap?.firstSeasonYear).toBe(2027);
    expect(state.date.year).toBeLessThan(2027);
    expect(availableStallions(state).some((r) => r.stallion.horseId === 'stl_american_pharoah')).toBe(false);
    const later = { ...state, date: { ...state.date, year: 2027 } };
    expect(availableStallions(later).some((r) => r.stallion.horseId === 'stl_american_pharoah')).toBe(true);
  });
});
