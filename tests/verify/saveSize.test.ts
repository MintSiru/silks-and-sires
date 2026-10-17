import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_LOG_LIMIT, START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import {
  advanceWeekGated,
  retainerRenewalsDue,
  submitYearEnd,
  yearEndCandidates,
  yearEndPending,
} from '../../src/engine/stud/yearEnd';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import type { GameEvent, GameState, YearEndSubmission } from '../../src/engine/types';

/**
 * M6-S S2 저장 크기 측정(명세 docs/specs/M6-S-save-management.md, 리포트 docs/reports/M6-S-size.md).
 * 실행: SAVE_SIZE_OUT=<결과 JSON 경로> [SAVE_SIZE_YEARS=30] npx vitest run tests/verify/saveSize.test.ts
 * SAVE_SIZE_OUT 이 없으면 건너뛴다. 무입력 진행(연말 정산은 기본 제출: 말 추천값·종마 계약 갱신)으로
 * 5·10·20·30년차 시작 시점(해당 연도 1주 진입 직후)에서 저장 본문을 측정한다.
 * 이 테스트는 무결성(예외·파산 중단·왕복 복원 실패)만 단언한다. 압축 목표(원본 25% 이하) 판정은 리포트가 한다.
 * 측정 전용이라 엔진을 바꾸지 않는다. 압축은 node:zlib gzipSync(기본 레벨 6) 로 한다.
 */

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

const SAVE_SIZE_OUT = process.env.SAVE_SIZE_OUT;
const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const PLAYER_NAME = '가상 마주';
const SAVED_AT = '2026-01-01T00:00:00Z';
const RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_YEARS = 30;
const MILESTONES: readonly number[] = [5, 10, 20, 30];
const TOP_FIELD_COUNT = 15;
const TARGET_RATIO = 0.25;

/* ------------------------------------------------------------------ */
/* 정적 데이터 (UI 와 같은 구성)                                         */
/* ------------------------------------------------------------------ */

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
  sales: getSalesData(),
};

const BOOT_DATA: BootstrapData = {
  ...STATIC_GAME,
  ...getPeopleData(),
};

/* ------------------------------------------------------------------ */
/* 보조                                                                 */
/* ------------------------------------------------------------------ */

function parseYears(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_YEARS;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`SAVE_SIZE_YEARS 는 1 이상의 정수여야 한다: ${raw}`);
  return v;
}

/** 연말 정산 기본 제출(g1ThirtyYears.test.ts 와 같다) */
function defaultSubmission(state: GameState): YearEndSubmission {
  return {
    year: state.date.year,
    horses: yearEndCandidates(state).map((c) => ({ horseId: c.horseId, choice: c.recommended })),
    retainers: retainerRenewalsDue(state).map((c) => ({ kind: c.kind, personId: c.personId, renew: true })),
  };
}

/** 이벤트 로그 상한을 지키며 이벤트를 붙인다(g1ThirtyYears.test.ts 와 같다) */
function appendEvents(state: GameState, events: readonly GameEvent[]): GameState {
  const merged = [...state.eventLog, ...events];
  return { ...state, eventLog: merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged };
}

/** 측정할 경과 연수: 5·10·20·30 중 실행 연수 이하 + 마지막 연수 */
function wantedYears(years: number): Set<number> {
  return new Set<number>([...MILESTONES.filter((m) => m <= years), years]);
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/* ------------------------------------------------------------------ */
/* 측정                                                                 */
/* ------------------------------------------------------------------ */

interface FieldSize {
  key: string;
  bytes: number;
  gzBytes: number;
}

interface Checkpoint {
  /** 경과 연수(시작 연도 기준). 5 이면 START_YEAR + 5 년 1주 진입 직후 */
  yearsElapsed: number;
  date: GameState['date'];
  originalBytes: number;
  gzipBytes: number;
  /** gzipBytes / originalBytes */
  ratio: number;
  targetMet: boolean;
  serializeMs: number;
  gzipMs: number;
  /** deserializeGame 이 ok 를 돌려주는가 */
  roundTripOk: boolean;
  roundTripError: string | null;
  /** serializeGame(deserializeGame(json)) === json 인가(정보용, 실패로 세지 않는다) */
  roundTripIdentical: boolean;
  /** gunzip 이 원본 문자열을 그대로 돌려주는가 */
  gzipRoundTripOk: boolean;
  /** 최상위 필드별 크기. 내림차순 정렬 */
  fields: FieldSize[];
}

function measure(state: GameState, yearsElapsed: number): Checkpoint {
  const t0 = performance.now();
  const json = serializeGame(state, SAVED_AT);
  const t1 = performance.now();
  const originalBytes = utf8Bytes(json);
  const gz = gzipSync(Buffer.from(json, 'utf8'));
  const t2 = performance.now();
  const gzipBytes = gz.length;
  const gzipRoundTripOk = gunzipSync(gz).toString('utf8') === json;

  const loaded = deserializeGame(json);
  const roundTripOk = loaded.ok;
  const roundTripError = loaded.ok ? null : `${loaded.error.code}: ${loaded.error.message}`;
  const roundTripIdentical = loaded.ok && serializeGame(loaded.state, SAVED_AT) === json;

  const fields: FieldSize[] = Object.entries(state).map(([key, value]) => {
    const text = JSON.stringify(value) ?? 'null';
    return { key, bytes: utf8Bytes(text), gzBytes: gzipSync(Buffer.from(text, 'utf8')).length };
  });
  fields.sort((a, b) => b.bytes - a.bytes || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    yearsElapsed,
    date: { ...state.date },
    originalBytes,
    gzipBytes,
    ratio: gzipBytes / originalBytes,
    targetMet: gzipBytes / originalBytes <= TARGET_RATIO,
    serializeMs: t1 - t0,
    gzipMs: t2 - t1,
    roundTripOk,
    roundTripError,
    roundTripIdentical,
    gzipRoundTripOk,
    fields,
  };
}

/* ------------------------------------------------------------------ */
/* 실행                                                                 */
/* ------------------------------------------------------------------ */

interface RunOutcome {
  checkpoints: Checkpoint[];
  advances: number;
  submissions: number;
  errors: string[];
  halted: string | null;
  totalMs: number;
  finalDate: GameState['date'];
}

function runYears(years: number): RunOutcome {
  const systems = createGameSystems(STATIC_GAME);
  const t0 = performance.now();
  let state = bootstrapGame(
    { seed: SEED, playerName: PLAYER_NAME, silks: { ...SILKS }, difficulty: 'normal', startType: 'owner_breeder' },
    BOOT_DATA,
  );
  const totalWeeks = years * WEEKS_PER_YEAR;
  const wanted = wantedYears(years);
  const done = new Set<number>();
  const checkpoints: Checkpoint[] = [];
  const errors: string[] = [];
  let advances = 0;
  let submissions = 0;
  let halted: string | null = null;

  while (advances < totalWeeks) {
    if (state.economy.bankrupt) {
      halted = `파산 (${state.date.year}년 ${state.date.week}주, 연속 적자 ${state.economy.negativeWeeks}주)`;
      break;
    }
    if (yearEndPending(state)) {
      const sub = submitYearEnd(state, defaultSubmission(state));
      if (!sub.ok) {
        errors.push(`연말 정산 제출 실패 ${state.date.year}년: ${sub.error}${sub.horseId ? ` (${sub.horseId})` : ''}`);
        break;
      }
      state = appendEvents(sub.state, sub.events);
      submissions++;
    }

    const processed = { year: state.date.year, week: state.date.week };
    let advanced: ReturnType<typeof advanceWeekGated>;
    try {
      advanced = advanceWeekGated(state, systems);
    } catch (e) {
      errors.push(`${processed.year}년 ${processed.week}주 진행 중 예외: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    if (advanced.blocked !== null) {
      errors.push(`${processed.year}년 ${processed.week}주: 연말 정산 게이트가 제출 뒤에도 막혔다`);
      break;
    }
    state = advanced.state;
    advances++;

    const elapsed = state.date.year - START_YEAR;
    if (state.date.week === 1 && wanted.has(elapsed) && !done.has(elapsed)) {
      done.add(elapsed);
      checkpoints.push(measure(state, elapsed));
      process.stdout.write(`[SAVE] ${elapsed}년차 측정 완료 (${checkpoints.length}/${wanted.size})\n`);
    }
  }

  if (errors.length === 0 && halted === null) {
    for (const y of wanted) {
      if (!done.has(y)) errors.push(`${y}년차 측정 지점에 도달하지 못했다`);
    }
  }

  return {
    checkpoints,
    advances,
    submissions,
    errors,
    halted,
    totalMs: performance.now() - t0,
    finalDate: { ...state.date },
  };
}

describe('M6-S S2 저장 크기 측정', () => {
  it.skipIf(!SAVE_SIZE_OUT)(
    `시드 ${SEED} 보통·오너브리더 SAVE_SIZE_YEARS(기본 ${DEFAULT_YEARS})년 무입력 진행, 저장 크기를 SAVE_SIZE_OUT 에 JSON 으로 기록`,
    () => {
      const years = parseYears(process.env.SAVE_SIZE_YEARS);
      const out = runYears(years);

      const result = {
        meta: {
          seed: SEED,
          difficulty: 'normal',
          startType: 'owner_breeder',
          startYear: START_YEAR,
          years,
          weeksPerYear: WEEKS_PER_YEAR,
          advances: out.advances,
          submissions: out.submissions,
          halted: out.halted,
          errors: out.errors,
          finalDate: out.finalDate,
          totalMs: Math.round(out.totalMs),
          savedAt: SAVED_AT,
          gzip: 'node:zlib gzipSync 기본 레벨(6)',
          targetRatio: TARGET_RATIO,
          milestones: [...wantedYears(years)],
          topFieldCount: TOP_FIELD_COUNT,
        },
        checkpoints: out.checkpoints,
      };

      const path = resolve(process.cwd(), SAVE_SIZE_OUT!);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      process.stdout.write(`[SAVE] 결과 기록: ${path} (측정 ${out.checkpoints.length}개, 총 ${Math.round(out.totalMs)}ms)\n`);

      // 무결성만 단언한다. 압축 목표 판정은 리포트가 targetMet 으로 한다.
      expect(out.errors).toEqual([]);
      expect(out.halted).toBeNull();
      for (const c of out.checkpoints) {
        expect(c.roundTripError, `${c.yearsElapsed}년차 왕복 복원`).toBeNull();
        expect(c.roundTripOk, `${c.yearsElapsed}년차 왕복 복원`).toBe(true);
        expect(c.gzipRoundTripOk, `${c.yearsElapsed}년차 gzip 왕복`).toBe(true);
        expect(c.originalBytes).toBeGreaterThan(0);
        expect(c.gzipBytes).toBeGreaterThan(0);
      }
    },
    RUN_TIMEOUT_MS,
  );
});
