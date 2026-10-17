import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_LOG_LIMIT, WEEKS_PER_YEAR } from '../../src/engine/config/game';
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
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeekGated, submitYearEnd, retainerRenewalsDue, yearEndCandidates, yearEndPending } from '../../src/engine/stud/yearEnd';
import type { Difficulty, GameEvent, GameState, SaleKind, YearEndSubmission } from '../../src/engine/types';

/**
 * M6-B3a 세일 추정 범위 측정(명세 docs/specs/M6-B3-balance-tuning.md, B3a 1번).
 * 실행: SALE_EST_OUT=<결과 JSON 절대 경로> npx vitest run tests/verify/saleEstimate.test.ts --testTimeout=7200000
 * SALE_EST_OUT 이 없으면 전부 건너뛴다(기본 npm test 시간을 늘리지 않는다).
 *
 * 시나리오: 무입력(플레이어 입찰·출품·교배 없이 엔진 기본 진행만) × 5년 × 시드 20261011, 7. 난이도 normal, 오너브리더, 캐주얼 경제(기본).
 * 기록: 팔린 로트(result.kind === 'sold')마다 낙찰가 ÷ lot.valuation 비율을 세일 종류(kind)별로 모은다.
 * 바이백(bought_back)·철회(withdrawn) 는 비율에서 제외하고 개수만 센다. 로트 결과는 매주 처리 뒤에 읽는다
 * (카탈로그는 마지막 북 뒤 일정 주가 지나면 지워지므로 한 번만 세고 키 saleId:year:lotNo 로 중복을 막는다).
 * 분위수와 범위 상수는 보고서 측에서 이 JSON 을 읽어 계산한다. 이 테스트는 무결성(예외·정산 차단)만 단언한다.
 */

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

const SALE_EST_OUT = process.env.SALE_EST_OUT;
const SEEDS: readonly number[] = [20261011, 7];
const YEARS = 5;
const DIFFICULTY: Difficulty = 'normal';
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const PLAYER_NAME = '가상 마주';
const RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* 정적 데이터 (activeBot·G1 과 같은 구성)                                */
/* ------------------------------------------------------------------ */

const SALES = getSalesData();
const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
  sales: SALES,
};
const BOOT_DATA: BootstrapData = { ...STATIC_GAME, ...getPeopleData() };
const KIND_BY_EVENT = new Map(SALES.events.map((e) => [e.id, e.kind] as const));

/* ------------------------------------------------------------------ */
/* 측정 기록 타입                                                       */
/* ------------------------------------------------------------------ */

interface KindCount {
  sold: number;
  boughtBack: number;
  withdrawn: number;
}

interface SeedRun {
  seed: number;
  difficulty: Difficulty;
  yearsRequested: number;
  weeksRun: number;
  halted: string | null;
  errors: string[];
  elapsedMs: number;
  /** 종류별 개수(sold·boughtBack·withdrawn) */
  counts: Partial<Record<SaleKind, KindCount>>;
  /** 종류별 낙찰가 ÷ 평가값 비율(sold 만, 소수 6자리) */
  ratios: Partial<Record<SaleKind, number[]>>;
}

/* ------------------------------------------------------------------ */
/* 보조                                                                 */
/* ------------------------------------------------------------------ */

/** 연말 정산 기본 제출(activeBot 과 같다: 엔진 추천 + 재계약 전부) */
function defaultSubmission(state: GameState): YearEndSubmission {
  return {
    year: state.date.year,
    horses: yearEndCandidates(state).map((c) => ({ horseId: c.horseId, choice: c.recommended })),
    retainers: retainerRenewalsDue(state).map((c) => ({ kind: c.kind, personId: c.personId, renew: true })),
  };
}

function appendEvents(state: GameState, events: readonly GameEvent[]): GameState {
  const merged = [...state.eventLog, ...events];
  return { ...state, eventLog: merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** 주 처리 직후 카탈로그의 로트 결과를 한 번씩 센다 */
function observeLots(
  state: GameState,
  seen: Set<string>,
  counts: Partial<Record<SaleKind, KindCount>>,
  ratios: Partial<Record<SaleKind, number[]>>,
): void {
  for (const cat of state.sales.catalogues) {
    const kind = KIND_BY_EVENT.get(cat.saleId);
    if (kind === undefined) continue;
    for (const lot of cat.lots) {
      const result = lot.result;
      if (result === null) continue;
      const key = `${cat.saleId}:${cat.year}:${lot.lotNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = (counts[kind] ??= { sold: 0, boughtBack: 0, withdrawn: 0 });
      if (result.kind === 'sold') {
        c.sold++;
        if (lot.valuation > 0) (ratios[kind] ??= []).push(round6(result.price / lot.valuation));
      } else if (result.kind === 'bought_back') {
        c.boughtBack++;
      } else {
        c.withdrawn++;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 실행                                                                 */
/* ------------------------------------------------------------------ */

function runSeed(seed: number): SeedRun {
  const t0 = performance.now();
  let state = bootstrapGame(
    { seed, playerName: PLAYER_NAME, silks: { ...SILKS }, difficulty: DIFFICULTY, startType: 'owner_breeder' },
    BOOT_DATA,
  );
  const systems = createGameSystems(STATIC_GAME);
  const seen = new Set<string>();
  const counts: Partial<Record<SaleKind, KindCount>> = {};
  const ratios: Partial<Record<SaleKind, number[]>> = {};
  const totalWeeks = YEARS * WEEKS_PER_YEAR;
  const errors: string[] = [];
  let halted: string | null = null;
  let weeksRun = 0;

  while (weeksRun < totalWeeks) {
    if (state.economy.bankrupt) {
      halted = `파산 (${state.date.year}년 ${state.date.week}주)`;
      break;
    }
    if (yearEndPending(state)) {
      const sub = submitYearEnd(state, defaultSubmission(state));
      if (!sub.ok) {
        errors.push(`연말 정산 제출 실패 ${state.date.year}년: ${sub.error}${sub.horseId ? ` (${sub.horseId})` : ''}`);
        break;
      }
      state = appendEvents(sub.state, sub.events);
    }

    const at = `${state.date.year}년 ${state.date.week}주`;
    let advanced: ReturnType<typeof advanceWeekGated>;
    try {
      advanced = advanceWeekGated(state, systems);
    } catch (e) {
      errors.push(`${at} 진행 중 예외: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    if (advanced.blocked !== null) {
      errors.push(`${at}: 연말 정산 게이트가 제출 뒤에도 막혔다`);
      break;
    }
    state = advanced.state;
    weeksRun++;
    observeLots(state, seen, counts, ratios);
  }

  return {
    seed,
    difficulty: DIFFICULTY,
    yearsRequested: YEARS,
    weeksRun,
    halted,
    errors,
    elapsedMs: Math.round(performance.now() - t0),
    counts,
    ratios,
  };
}

/* ------------------------------------------------------------------ */
/* 테스트                                                               */
/* ------------------------------------------------------------------ */

const runs: SeedRun[] = [];

function flush(): void {
  const path = resolve(process.cwd(), SALE_EST_OUT!);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ seeds: SEEDS, years: YEARS, difficulty: DIFFICULTY, runs }, null, 2)}\n`, 'utf8');
  process.stdout.write(`[SALE_EST] 결과 기록: ${path} (완료 ${runs.length}개)\n`);
}

describe.skipIf(SALE_EST_OUT === undefined)('M6-B3a 세일 추정 범위 측정(무입력 5년)', () => {
  for (const seed of SEEDS) {
    it(`무입력 ${YEARS}년 · 시드 ${seed}`, () => {
      const r = runSeed(seed);
      runs.push(r);
      flush();
      expect(r.errors).toEqual([]);
      expect(r.halted).toBeNull();
      const soldTotal = Object.values(r.counts).reduce((sum, c) => sum + (c?.sold ?? 0), 0);
      expect(soldTotal).toBeGreaterThan(0);
    }, RUN_TIMEOUT_MS);
  }
});
