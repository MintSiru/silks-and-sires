import { describe, expect, it, vi } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '../../src/engine/config/game';
import { defaultCoat, neutralPersonality } from '../../src/engine/horse/traits';
import {
  applyMigrations,
  deserializeGame,
  serializeGame,
  validateGameState,
} from '../../src/engine/save/serialize';
import type { GameState, Owner } from '../../src/engine/types';
import { SAVE_FORMAT } from '../../src/engine/types';
import { createEmptyEconomyState, createEmptyRelationsState } from '../../src/engine/economy/state';
import { TRAINER_EYE_MAX, TRAINER_EYE_MIN } from '../../src/engine/config/people';
import { trainerEyeFromId } from '../../src/engine/people/generate';
import { createEmptySeasonState } from '../../src/engine/season/state';

const PLAYER_ID = 'owner-player';

const playerOwner: Owner = {
  id: PLAYER_ID,
  name: '테스트 마주',
  country: 'GB',
  isPlayer: true,
  silks: { primary: '#1f4e79', secondary: '#f2c200', pattern: 'hoops' },
  funds: 500_000,
  studName: null,
  retainedJockeyId: null,
  horseIds: [],
  tier: 'small',
  persona: { commercial: 0.5, prestige: 0.5, patience: 0.5 },
  namePrefix: null,
};

/** 손으로 만든 최소 GameState 픽스처 */
function makeState(): GameState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    initialSeed: 20261011,
    rng: { algo: 'sfc32', s: [1, 2, 3, 4] },
    date: { year: 2026, week: 7 },
    season: {
      year: 2026,
      phases: {
        foaling: [{ startWeek: 1, endWeek: 22 }],
        breeding: [{ startWeek: 7, endWeek: 26 }],
        turf_flat: [{ startWeek: 13, endWeek: 45 }],
        aw_winter: [
          { startWeek: 1, endWeek: 12 },
          { startWeek: 46, endWeek: 52 },
        ],
      },
    },
    playerOwnerId: PLAYER_ID,
    horses: {},
    stallions: {},
    mares: {},
    owners: { [PLAYER_ID]: playerOwner },
    trainers: {},
    jockeys: {},
    breeding: { revealedNicks: [] },
    nextHorseNumber: 1,
    raceResults: [],
    seasonState: createEmptySeasonState(2026),
    awardsHistory: [],
    sireStats: {},
    eventLog: [{ type: 'week_started', date: { year: 2026, week: 7 } }],
    economy: createEmptyEconomyState('casual'),
    relations: createEmptyRelationsState(),
  };
}

/** 픽스처를 직렬화한 뒤 envelope 을 임의로 고쳐 다시 문자열로 만든다. */
function withEnvelope(patch: (envelope: Record<string, unknown>) => void): string {
  const envelope = JSON.parse(serializeGame(makeState(), '2026-02-15T09:00:00.000Z')) as Record<string, unknown>;
  patch(envelope);
  return JSON.stringify(envelope);
}

function withStatePatch(patch: (state: Record<string, unknown>) => void): string {
  return withEnvelope((envelope) => {
    patch(envelope.state as Record<string, unknown>);
  });
}

describe('serializeGame / deserializeGame', () => {
  it('왕복 변환 결과가 원본과 toEqual 이다', () => {
    const original = makeState();
    const json = serializeGame(original, '2026-02-15T09:00:00.000Z');
    const result = deserializeGame(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(original);
    }
  });

  it('envelope 에 format, 현재 schemaVersion, savedAt 이 들어가고 들여쓰기가 없다', () => {
    const json = serializeGame(makeState(), '2026-02-15T09:00:00.000Z');
    const envelope = JSON.parse(json) as Record<string, unknown>;

    expect(json.includes('\n')).toBe(false);
    expect(envelope.format).toBe(SAVE_FORMAT);
    expect(envelope.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(envelope.savedAt).toBe('2026-02-15T09:00:00.000Z');
  });

  it('잘못된 JSON 은 invalid_json 이고 throw 하지 않는다', () => {
    let result: ReturnType<typeof deserializeGame> | undefined;
    expect(() => {
      result = deserializeGame('{"format": ');
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.error.code).toBe('invalid_json');
    }
  });

  it('format 이 다르면 wrong_format', () => {
    const json = withEnvelope((envelope) => {
      envelope.format = 'some-other-game-save';
    });
    const result = deserializeGame(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('wrong_format');
  });

  it('객체가 아닌 JSON(null, 배열)은 wrong_format', () => {
    for (const json of ['null', '[]', '42']) {
      const result = deserializeGame(json);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('wrong_format');
    }
  });

  it('schemaVersion 99 는 unsupported_version', () => {
    const json = withEnvelope((envelope) => {
      envelope.schemaVersion = 99;
    });
    const result = deserializeGame(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported_version');
  });

  it('schemaVersion 0 은 unsupported_version', () => {
    const json = withEnvelope((envelope) => {
      envelope.schemaVersion = 0;
    });
    const result = deserializeGame(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported_version');
  });

  it('date.week = 53 은 invalid_state 이고 메시지에 date.week 가 드러난다', () => {
    const json = withStatePatch((state) => {
      state.date = { year: 2026, week: 53 };
    });
    const result = deserializeGame(json);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_state');
      expect(result.error.message).toContain('date.week');
    }
  });

  it('플레이어 owner 가 owners 에 없으면 invalid_state', () => {
    const json = withStatePatch((state) => {
      state.owners = {};
    });
    const result = deserializeGame(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_state');
  });

  it('state 가 아예 없어도 throw 하지 않고 invalid_state 를 반환한다', () => {
    const json = withEnvelope((envelope) => {
      delete envelope.state;
    });
    let result: ReturnType<typeof deserializeGame> | undefined;
    expect(() => {
      result = deserializeGame(json);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.error.code).toBe('invalid_state');
  });

  it('invalid_state 메시지는 문제 최대 3개를 "; " 로 잇는다', () => {
    const json = withStatePatch((state) => {
      state.rng = null;
      state.date = null;
      state.season = null;
      state.horses = [];
    });
    const result = deserializeGame(json);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_state');
      expect(result.error.message.split('; ')).toHaveLength(3);
    }
  });

  it('schemaVersion 이 현재 버전과 같으면 주입된 마이그레이션은 적용되지 않는다', () => {
    const spy = vi.fn((state: Record<string, unknown>) => ({ ...state, foo: 1 }));
    const result = deserializeGame(serializeGame(makeState(), '2026-02-15T09:00:00.000Z'), { 1: spy });
    expect(result.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('validateGameState', () => {
  it('정상 픽스처는 빈 배열', () => {
    expect(validateGameState(makeState())).toEqual([]);
  });

  it('객체가 아니면 문제 1개 이상', () => {
    expect(validateGameState(null).length).toBeGreaterThan(0);
    expect(validateGameState('state').length).toBeGreaterThan(0);
  });

  it('rng.s 가 4개 32비트 정수가 아니면 문제를 보고한다', () => {
    const short = { ...makeState(), rng: { algo: 'sfc32', s: [1, 2, 3] } };
    const overflow = { ...makeState(), rng: { algo: 'sfc32', s: [1, 2, 3, 2 ** 32] } };
    const fractional = { ...makeState(), rng: { algo: 'sfc32', s: [1, 2, 3, 0.5] } };
    expect(validateGameState(short).some((p) => p.includes('rng.s'))).toBe(true);
    expect(validateGameState(overflow).some((p) => p.includes('rng.s'))).toBe(true);
    expect(validateGameState(fractional).some((p) => p.includes('rng.s'))).toBe(true);
  });

  it('배열이어야 하는 컬렉션(raceResults, eventLog)과 객체여야 하는 컬렉션을 구분한다', () => {
    const bad = { ...makeState(), raceResults: {}, horses: [] };
    const problems = validateGameState(bad);
    expect(problems.some((p) => p.includes('raceResults'))).toBe(true);
    expect(problems.some((p) => p.includes('horses'))).toBe(true);
  });
});

describe('applyMigrations', () => {
  it('from === to 이면 상태를 그대로 돌려준다', () => {
    const state = { a: 1 };
    const outcome = applyMigrations(state, 1, 1, {});
    expect(outcome).toEqual({ ok: true, state: { a: 1 } });
  });

  it('v → v+1 함수가 없으면 unsupported 로 실패한다 (missingFrom = v)', () => {
    const outcome = applyMigrations({}, 1, 2, {});
    expect(outcome).toEqual({ ok: false, missingFrom: 1 });
  });

  it('중간 함수가 빠지면 그 지점의 버전을 알려준다', () => {
    const outcome = applyMigrations({}, 1, 3, { 1: (s) => ({ ...s, foo: 1 }) });
    expect(outcome).toEqual({ ok: false, missingFrom: 2 });
  });

  it('함수가 있으면 적용되고 순서대로 체인된다', () => {
    const outcome = applyMigrations({ base: true }, 1, 3, {
      1: (s) => ({ ...s, foo: 1 }),
      2: (s) => ({ ...s, foo: Number(s.foo) + 10 }),
    });
    expect(outcome).toEqual({ ok: true, state: { base: true, foo: 11 } });
  });

  it('가짜 마이그레이션 { 1: s => ({ ...s, foo: 1 }) } 은 v=1→2 에 적용된다', () => {
    const outcome = applyMigrations({ bar: 2 }, 1, 2, { 1: (s) => ({ ...s, foo: 1 }) });
    expect(outcome).toEqual({ ok: true, state: { bar: 2, foo: 1 } });
  });
});

describe('deserializeGame 마이그레이션 경로 (현재 버전을 2 로 바꾼 모듈로 검증)', () => {
  async function loadWithSchemaVersion(version: number) {
    vi.resetModules();
    vi.doMock('../../src/engine/config/game', async () => {
      const actual = await vi.importActual<typeof import('../../src/engine/config/game')>(
        '../../src/engine/config/game',
      );
      return { ...actual, SAVE_SCHEMA_VERSION: version };
    });
    return import('../../src/engine/save/serialize');
  }

  it('저장 버전 1 → 현재 2: 마이그레이션이 있으면 적용되고 schemaVersion 이 2 가 된다', async () => {
    const mod = await loadWithSchemaVersion(2);
    const json = JSON.stringify({
      format: SAVE_FORMAT,
      schemaVersion: 1,
      savedAt: '2026-02-15T09:00:00.000Z',
      state: { ...makeState(), schemaVersion: 1 },
    });
    const result = mod.deserializeGame(json, { 1: (s) => ({ ...s, foo: 1 }) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(2);
      expect((result.state as unknown as Record<string, unknown>).foo).toBe(1);
    }
    vi.doUnmock('../../src/engine/config/game');
    vi.resetModules();
  });

  it('저장 버전 1 → 현재 2: 마이그레이션 함수가 없으면 unsupported_version', async () => {
    const mod = await loadWithSchemaVersion(2);
    const json = JSON.stringify({
      format: SAVE_FORMAT,
      schemaVersion: 1,
      savedAt: '2026-02-15T09:00:00.000Z',
      state: { ...makeState(), schemaVersion: 1 },
    });
    const result = mod.deserializeGame(json, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported_version');
    vi.doUnmock('../../src/engine/config/game');
    vi.resetModules();
  });
});

describe('저장 마이그레이션 v1 → v2 (M3)', () => {
  it('seasonState 가 없는 v1 저장본을 빈 시즌 상태로 불러온다', () => {
    const v2 = makeState();
    const { seasonState: _omit, ...rest } = v2;
    void _omit;
    const v1 = { ...rest, schemaVersion: 1 };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 1, savedAt: '2026-10-11T00:00:00.000Z', state: v1 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.state.seasonState).toEqual(createEmptySeasonState(v2.date.year));
    }
  });
});

describe('저장 마이그레이션 v2 → v3 (M3-C3)', () => {
  it('unratedFigures 가 없는 v2 저장본에 빈 맵을 채운다', () => {
    const v3 = makeState();
    const { unratedFigures: _omit, ...season } = v3.seasonState;
    void _omit;
    const v2 = { ...v3, schemaVersion: 2, seasonState: season };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 2, savedAt: '2026-10-11T00:00:00.000Z', state: v2 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.state.seasonState.unratedFigures).toEqual({});
    }
  });
});

describe('저장 마이그레이션 v3 → v4 (M3-C5·C6)', () => {
  it('성격·털색이 없는 말에 중립 성격과 기본 털색을 채운다', () => {
    const v4 = makeState();
    const horses: Record<string, unknown> = { h_old: { id: 'h_old', name: 'Old Save Horse' } };
    for (const [id, h] of Object.entries(v4.horses)) {
      const { personality: _p, coat: _c, ...rest } = h;
      void _p;
      void _c;
      horses[id] = rest;
    }
    const v3 = { ...v4, schemaVersion: 3, horses };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 3, savedAt: '2026-10-12T00:00:00.000Z', state: v3 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(Object.keys(result.state.horses)).toContain('h_old');
      for (const h of Object.values(result.state.horses)) {
        expect(h.personality).toEqual(neutralPersonality());
        expect(h.coat).toEqual(defaultCoat());
      }
    }
  });
});

describe('저장 마이그레이션 v4 → v5 (M3-E1·E2)', () => {
  it('시상 이력·나라별 리딩·퍼포먼스 기록이 없는 v4 저장본에 빈 값을 채운다', () => {
    const v5 = makeState();
    const { leadingByCountry: _a, performances: _b, raceRatings: _c, ...season } = v5.seasonState;
    void _a;
    void _b;
    void _c;
    const { awardsHistory: _d, sireStats: _e, ...rest } = v5;
    void _e;
    void _d;
    const v4 = { ...rest, schemaVersion: 4, seasonState: season };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 4, savedAt: '2026-10-12T00:00:00.000Z', state: v4 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.state.awardsHistory).toEqual([]);
      expect(result.state.seasonState.leadingByCountry).toEqual({});
      expect(result.state.seasonState.performances).toEqual({});
      expect(result.state.seasonState.raceRatings).toEqual([]);
    }
  });
});

describe('저장 마이그레이션 v5 → v6 (M3-C4)', () => {
  it('sireStats 가 없는 v5 저장본에 빈 표를 채운다', () => {
    const v6 = makeState();
    const { sireStats: _s, ...rest } = v6;
    void _s;
    const v5 = { ...rest, schemaVersion: 5 };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 5, savedAt: '2026-10-12T00:00:00.000Z', state: v5 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.state.sireStats).toEqual({});
    }
  });
});

describe('저장 마이그레이션 v6 → v7 (M4-A1)', () => {
  it('경제·관계가 없는 v6 저장본은 캐주얼 모드·빈 장부·초기 명성으로 이어진다', () => {
    const v7 = makeState();
    const { economy: _e, relations: _r, ...rest } = v7;
    void _e;
    void _r;
    const v6 = { ...rest, schemaVersion: 6 };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 6, savedAt: '2026-10-12T00:00:00.000Z', state: v6 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.state.economy).toEqual(createEmptyEconomyState('casual'));
      expect(result.state.relations).toEqual(createEmptyRelationsState());
    }
  });
});

describe('저장 마이그레이션 v8 → v9 (M4-B2·B3)', () => {
  it('조교사에 상마안(ID 해시)과 플레이어 전속 계약 목록이 생긴다', () => {
    const v9 = makeState();
    v9.trainers = {
      'tr-000001': {
        id: 'tr-000001', name: 'T', country: 'GB', yardName: 'Y', region: 'R', facilityGrade: 2, style: 'all_round',
        skill: 50, weeklyFee: 360, capacity: 40, birthYear: 1980, staminaBias: 0, juvenileFocus: 0.5, eye: 0,
      } as never,
    };
    const { contracts: _c, ...relRest } = v9.relations;
    void _c;
    const trainer = { ...(v9.trainers['tr-000001'] as unknown as Record<string, unknown>) };
    delete trainer.eye;
    const v8 = { ...v9, schemaVersion: 8, trainers: { 'tr-000001': trainer }, relations: relRest };
    const json = JSON.stringify({ format: 'silks-and-sires-save', schemaVersion: 8, savedAt: '2026-10-12T00:00:00.000Z', state: v8 });
    const result = deserializeGame(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.state.trainers['tr-000001']?.eye).toBe(trainerEyeFromId('tr-000001'));
      expect(result.state.relations.contracts).toEqual([]);
    }
  });

  it('trainerEyeFromId 는 범위 안의 결정적 값이다', () => {
    for (const id of ['tr-000001', 'tr-000002', 'tr-123456']) {
      const v = trainerEyeFromId(id);
      expect(v).toBe(trainerEyeFromId(id));
      expect(v).toBeGreaterThanOrEqual(TRAINER_EYE_MIN);
      expect(v).toBeLessThanOrEqual(TRAINER_EYE_MAX);
    }
  });
});
