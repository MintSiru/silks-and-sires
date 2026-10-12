import { SAVE_SCHEMA_VERSION, WEEKS_PER_YEAR } from '../config/game';
import { createEmptyEconomyState, createEmptyRelationsState } from '../economy/state';
import { defaultCoat, neutralPersonality } from '../horse/traits';
import { createEmptySeasonState } from '../season/state';
import { SAVE_FORMAT } from '../types';
import type { GameState, LoadResult, SaveEnvelope, SaveErrorCode } from '../types';

/** v7 → v8 이주에서 쓰는 조교료 기준값(이주 시점 고정값) */
const V8_WEEKLY_FEE_PER_GRADE = 180;

/** key n = 버전 n → n+1 변환 함수. 순수 함수여야 한다. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** key n = 버전 n → n+1 변환. 현재는 비어 있음 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /** v1 → v2 (M3): 시즌 상태 추가. 현역마·AI 인물은 시즌 시스템이 첫 주에 채운다 */
  1: (state) => {
    const date = state.date as { year?: unknown } | undefined;
    const year = typeof date?.year === 'number' ? date.year : 2026;
    return { ...state, seasonState: createEmptySeasonState(year) };
  },
  /** v2 → v3 (M3-C3): OR 미부여 말의 퍼포먼스 레이팅 보관 */
  2: (state) => {
    const season = state.seasonState as Record<string, unknown> | undefined;
    if (season === undefined) return state;
    return { ...state, seasonState: { ...season, unratedFigures: season.unratedFigures ?? {} } };
  },
  /** v3 → v4 (M3-C5·C6): 말에 성격·털색 추가(중립 성격, 기본 털색) */
  3: (state) => {
    const horses = state.horses as Record<string, Record<string, unknown>> | undefined;
    if (horses === undefined) return state;
    const next: Record<string, Record<string, unknown>> = {};
    for (const [id, h] of Object.entries(horses)) {
      next[id] = { ...h, personality: h.personality ?? neutralPersonality(), coat: h.coat ?? defaultCoat() };
    }
    // 다시보기 입력(SampleField)의 주자에도 성격을 채운다(중립 = 저장 당시와 같은 결과)
    const season = state.seasonState as { replayable?: { field: { runners: { horse: Record<string, unknown> }[] } }[] } | undefined;
    const replayable = season?.replayable?.map((r) => ({
      ...r,
      field: {
        ...r.field,
        runners: r.field.runners.map((ru) => ({
          ...ru,
          horse: { ...ru.horse, personality: ru.horse.personality ?? neutralPersonality() },
        })),
      },
    }));
    const seasonState = season === undefined || replayable === undefined ? state.seasonState : { ...season, replayable };
    return { ...state, horses: next, seasonState };
  },
  /** v4 → v5 (M3-E1·E2): 나라별 리딩·퍼포먼스 기록·레이스 레이팅·시상 이력 */
  4: (state) => {
    const season = state.seasonState as Record<string, unknown> | undefined;
    const seasonState =
      season === undefined
        ? season
        : {
            ...season,
            leadingByCountry: season.leadingByCountry ?? {},
            performances: season.performances ?? {},
            raceRatings: season.raceRatings ?? [],
          };
    return { ...state, seasonState, awardsHistory: state.awardsHistory ?? [] };
  },
  /** v5 → v6 (M3-C4): 종마별 자마 성적 누적 */
  5: (state) => ({ ...state, sireStats: state.sireStats ?? {} }),
  /** v6 → v7 (M4-A1): 경제·관계 상태. 이전 저장은 캐주얼 모드(파산 없음)로 이어간다 */
  6: (state) => ({
    ...state,
    economy: state.economy ?? createEmptyEconomyState('casual'),
    relations: state.relations ?? createEmptyRelationsState(),
  }),
  /**
   * v7 → v8 (M4-A2b): 조교사 주당 조교료를 시설 등급 × 180 으로 다시 계산한다.
   * 이주는 그 버전 당시 값으로 고정한다(나중에 config 의 WEEKLY_FEE_PER_FACILITY_GRADE 를 바꿔도 이 이주 결과는 같다).
   */
  7: (state) => {
    const trainers = state.trainers as Record<string, Record<string, unknown>> | undefined;
    if (trainers === undefined) return state;
    const next: Record<string, Record<string, unknown>> = {};
    for (const [id, t] of Object.entries(trainers)) {
      const grade = t.facilityGrade;
      next[id] = {
        ...t,
        weeklyFee: typeof grade === 'number' ? grade * V8_WEEKLY_FEE_PER_GRADE : t.weeklyFee,
      };
    }
    return { ...state, trainers: next };
  },
};

/** 구조 상수(형식 규칙). 밸런스 수치가 아니므로 여기 둔다. */
const MIN_SCHEMA_VERSION = 1;
const RNG_WORD_COUNT = 4;
const UINT32_MAX = 2 ** 32 - 1;
const MIN_WEEK = 1;
const MAX_PROBLEMS_IN_MESSAGE = 3;

export type MigrationOutcome =
  | { ok: true; state: Record<string, unknown> }
  | { ok: false; missingFrom: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isUint32(value: unknown): value is number {
  return isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function failure(code: SaveErrorCode, message: string): LoadResult {
  return { ok: false, error: { code, message } };
}

/**
 * from 에서 to 까지 migrations[v] 를 차례로 적용한다 (v = from .. to-1).
 * 중간에 함수가 없으면 { ok: false, missingFrom: v } 를 반환한다. 예외는 던지지 않는다.
 */
export function applyMigrations(
  state: Record<string, unknown>,
  from: number,
  to: number,
  migrations: Readonly<Record<number, Migration>>,
): MigrationOutcome {
  let current = state;
  for (let version = from; version < to; version += 1) {
    const migrate = migrations[version];
    if (typeof migrate !== 'function') {
      return { ok: false, missingFrom: version };
    }
    current = migrate(current);
  }
  return { ok: true, state: current };
}

/** GameState 를 SaveEnvelope 로 감싸 JSON 문자열(들여쓰기 없음)로 만든다. */
export function serializeGame(state: GameState, savedAtIso: string): string {
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: savedAtIso,
    state,
  };
  return JSON.stringify(envelope);
}

/**
 * JSON 문자열을 GameState 로 복원한다. 모든 실패는 LoadResult 로 반환하며 예외를 던지지 않는다.
 * 순서: JSON 파싱 → format 확인 → schemaVersion 범위 확인 → 마이그레이션 → 상태 검증.
 */
export function deserializeGame(
  json: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): LoadResult {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return failure('invalid_json', '저장 데이터를 JSON 으로 읽을 수 없습니다.');
    }

    if (!isRecord(parsed) || parsed.format !== SAVE_FORMAT) {
      return failure('wrong_format', '이 게임의 저장 파일 형식이 아닙니다.');
    }

    const version = parsed.schemaVersion;
    if (!isInteger(version) || version < MIN_SCHEMA_VERSION || version > SAVE_SCHEMA_VERSION) {
      return failure(
        'unsupported_version',
        `지원하지 않는 저장 버전입니다 (${String(version)}, 지원 범위 ${MIN_SCHEMA_VERSION}~${SAVE_SCHEMA_VERSION}).`,
      );
    }

    let candidate: unknown = parsed.state;
    if (version < SAVE_SCHEMA_VERSION && isRecord(candidate)) {
      const outcome = applyMigrations(candidate, version, SAVE_SCHEMA_VERSION, migrations);
      if (!outcome.ok) {
        return failure(
          'unsupported_version',
          `버전 ${outcome.missingFrom} → ${outcome.missingFrom + 1} 마이그레이션이 없어 불러올 수 없습니다.`,
        );
      }
      candidate = { ...outcome.state, schemaVersion: SAVE_SCHEMA_VERSION };
    }

    const problems = validateGameState(candidate);
    if (problems.length > 0) {
      return failure('invalid_state', problems.slice(0, MAX_PROBLEMS_IN_MESSAGE).join('; '));
    }

    return { ok: true, state: candidate as GameState };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return failure('invalid_state', `저장 데이터를 처리하지 못했습니다: ${detail}`);
  }
}

function validateDate(value: unknown, label: string, problems: string[]): void {
  if (!isRecord(value)) {
    problems.push(`${label} 가 객체가 아닙니다`);
    return;
  }
  if (!isInteger(value.year)) {
    problems.push(`${label}.year 가 정수가 아닙니다`);
  }
  const week = value.week;
  if (!isInteger(week) || week < MIN_WEEK || week > WEEKS_PER_YEAR) {
    problems.push(`${label}.week 가 ${MIN_WEEK}~${WEEKS_PER_YEAR} 정수가 아닙니다`);
  }
}

function validateRng(value: unknown, problems: string[]): void {
  if (!isRecord(value)) {
    problems.push('rng 가 객체가 아닙니다');
    return;
  }
  if (value.algo !== 'sfc32') {
    problems.push('rng.algo 가 sfc32 가 아닙니다');
  }
  const words = value.s;
  if (!Array.isArray(words) || words.length !== RNG_WORD_COUNT || !words.every(isUint32)) {
    problems.push(`rng.s 는 0~${UINT32_MAX} 정수 ${RNG_WORD_COUNT}개 배열이어야 합니다`);
  }
}

function validateSeason(value: unknown, problems: string[]): void {
  if (!isRecord(value)) {
    problems.push('season 이 객체가 아닙니다');
    return;
  }
  if (!isInteger(value.year)) {
    problems.push('season.year 가 정수가 아닙니다');
  }
  if (!isRecord(value.phases)) {
    problems.push('season.phases 가 객체가 아닙니다');
  }
}

const OBJECT_COLLECTION_KEYS = ['horses', 'stallions', 'mares', 'owners', 'trainers', 'jockeys'] as const;
const ARRAY_COLLECTION_KEYS = ['raceResults', 'eventLog'] as const;

/**
 * GameState 의 최소 구조를 검사한다. 문제 목록을 반환하며 빈 배열이면 정상.
 * 예외를 던지지 않는다.
 */
export function validateGameState(value: unknown): string[] {
  if (!isRecord(value)) {
    return ['state 가 객체가 아닙니다'];
  }

  const problems: string[] = [];

  if (typeof value.schemaVersion !== 'number') {
    problems.push('schemaVersion 이 숫자가 아닙니다');
  }
  if (typeof value.initialSeed !== 'number') {
    problems.push('initialSeed 가 숫자가 아닙니다');
  }
  validateRng(value.rng, problems);
  validateDate(value.date, 'date', problems);
  validateSeason(value.season, problems);

  const playerOwnerId = value.playerOwnerId;
  if (typeof playerOwnerId !== 'string') {
    problems.push('playerOwnerId 가 문자열이 아닙니다');
  }

  for (const key of OBJECT_COLLECTION_KEYS) {
    if (!isRecord(value[key])) {
      problems.push(`${key} 가 배열이 아닌 객체가 아닙니다`);
    }
  }
  for (const key of ARRAY_COLLECTION_KEYS) {
    if (!Array.isArray(value[key])) {
      problems.push(`${key} 가 배열이 아닙니다`);
    }
  }

  const owners = value.owners;
  if (typeof playerOwnerId === 'string' && isRecord(owners)) {
    const playerOwner = Object.prototype.hasOwnProperty.call(owners, playerOwnerId)
      ? owners[playerOwnerId]
      : undefined;
    if (!isRecord(playerOwner)) {
      problems.push(`플레이어 owner(${playerOwnerId})가 owners 에 없습니다`);
    }
  }

  return problems;
}
