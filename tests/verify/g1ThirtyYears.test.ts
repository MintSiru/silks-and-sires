import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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
import { oddsToDecimal } from '../../src/engine/race/odds';
import { serializeGame } from '../../src/engine/save/serialize';
import type { RunMeetingInPlaceOutput } from '../../src/engine/season/raceday';
import { horseProfile } from '../../src/engine/stud/nh';
import {
  advanceWeekGated,
  retainerRenewalsDue,
  submitYearEnd,
  yearEndCandidates,
  yearEndPending,
} from '../../src/engine/stud/yearEnd';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import type {
  DistanceProfile,
  GameDate,
  GameEvent,
  GameState,
  RaceResult,
  SaleKind,
  SeriesDefinition,
  StudRole,
  YearEndSubmission,
} from '../../src/engine/types';

/**
 * M4-G1 30년 자동 진행 측정(명세 docs/specs/M4-G1-30year-verify.md). M4-G2에서 자금 흐름·프로파일·보존 정책 측정을 추가했다.
 * 실행: G1_OUT=<결과 JSON 경로> [G1_YEARS=30] npx vitest run tests/verify/g1ThirtyYears.test.ts
 * G1_OUT 이 없으면 건너뛴다. 이 테스트는 무결성(예외·NaN·음수 두수·파산 중단)만 단언하고,
 * 밸런스 판정 1~6 은 JSON 의 judgements 에 적어 리포트가 ✅/❌ 로 옮긴다(프로젝트 관례: season.test.ts 와 같다).
 * 게임 정적 데이터는 UI(src/ui/game/useGame.ts)와 같이 sales 를 포함한다.
 */

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

const G1_OUT = process.env.G1_OUT;
const SEED = 20261011;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const PLAYER_NAME = '가상 마주';
const SAVED_AT = '2026-01-01T00:00:00Z';
const RUN_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const DEFAULT_YEARS = 30;
const LONG_RUN_YEAR_FOR_RATIO = 30;
const BASE_YEAR_FOR_RATIO = 5;
const HORSE_RATIO_BASE_YEAR = 10;

/** 판정 기준 */
const INFLATION_MIN = 0.67;
const INFLATION_MAX = 1.5;
const MA_WINDOW = 3;
const CUP_NH_SHARE_MIN = 0.7;
const SPEED_NH_SHARE_MAX = 0.1;
const SALE_RATE_MIN = 0.3;
const SALE_RATE_MAX = 0.95;
/** season.test.ts 의 FAV_TARGET 과 같게(25~35%). 명세 본문의 28~38% 는 별도 열로 함께 적는다 */
const FAV_TARGET_MIN = 0.25;
const FAV_TARGET_MAX = 0.35;
const FAV_SPEC_MIN = 0.28;
const FAV_SPEC_MAX = 0.38;
const GROWTH_MAX = 1.5;
const RELATION_QUANTILES = [0.1, 0.5, 0.9] as const;
const FUND_QUANTILES = [0.1, 0.5, 0.9] as const;

const SALE_KINDS: readonly SaleKind[] = ['yearling', 'breeze_up', 'foal', 'breeding_stock', 'horses_in_training'];
const PROFILES: readonly DistanceProfile[] = ['speed', 'classic', 'middle', 'cup'];

/* ------------------------------------------------------------------ */
/* 정적 데이터 (UI 와 같은 구성)                                         */
/* ------------------------------------------------------------------ */

const COURSES = getRacecourses();
const SERIES_DEFS: SeriesDefinition[] = getSeriesDefinitions();
const SALES = getSalesData();
const SALE_KIND_BY_EVENT = new Map(SALES.events.map((e) => [e.id, e.kind] as const));

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: getRaceTemplates(),
  series: SERIES_DEFS,
  sales: SALES,
};

const BOOT_DATA: BootstrapData = {
  ...STATIC_GAME,
  ...getPeopleData(),
};

/* ------------------------------------------------------------------ */
/* 레이스 관찰 훅 (season.test.ts 와 같은 방식)                          */
/* ------------------------------------------------------------------ */

const hook = vi.hoisted(() => ({
  onMeeting: null as ((out: RunMeetingInPlaceOutput) => void) | null,
}));

vi.mock('../../src/engine/season/raceday', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/season/raceday')>();
  return {
    ...actual,
    runMeetingInPlace: (...args: Parameters<typeof actual.runMeetingInPlace>): RunMeetingInPlaceOutput => {
      const out = actual.runMeetingInPlace(...args);
      hook.onMeeting?.(out);
      return out;
    },
  };
});

/* ------------------------------------------------------------------ */
/* 통계 보조 (빈 표본은 NaN 이 아니라 null)                              */
/* ------------------------------------------------------------------ */

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return quantile(xs, 0.5);
}

/** 선형 보간 분위수. 입력 순서 무관 */
function quantile(xs: readonly number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo];
  const b = s[hi];
  if (a === undefined || b === undefined) return null;
  return a + (b - a) * (pos - lo);
}

function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((acc, x) => acc + x, 0) / xs.length;
}

function ratio(part: number | null | undefined, whole: number | null | undefined): number | null {
  if (part === null || part === undefined || whole === null || whole === undefined || whole === 0) return null;
  return part / whole;
}

function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function inRange(x: number, lo: number, hi: number): boolean {
  return x >= lo && x <= hi;
}

/** 판정 합성: 하나라도 false 면 false, 측정 불가(null)가 있으면 null, 아니면 true */
function allOf(checks: readonly (boolean | null)[]): boolean | null {
  if (checks.some((c) => c === false)) return false;
  if (checks.some((c) => c === null)) return null;
  return true;
}

/* ------------------------------------------------------------------ */
/* 레이스: 인기 1위 승률 (season.test.ts 의 favouriteWon 과 같다)         */
/* ------------------------------------------------------------------ */

function favouriteWon(result: RaceResult): boolean | null {
  const priced: { dec: number; saddle: number; position: number }[] = [];
  for (const r of result.runners) {
    if (r.odds === null) return null;
    priced.push({ dec: oddsToDecimal(r.odds), saddle: r.saddleCloth, position: r.position });
  }
  priced.sort((a, b) => a.dec - b.dec || a.saddle - b.saddle);
  const fav = priced[0];
  return fav === undefined ? null : fav.position === 1;
}

interface RaceAgg {
  run: number;
  missingResult: number;
  priced: number;
  favWon: number;
  g1Priced: number;
  g1FavWon: number;
}

/* ------------------------------------------------------------------ */
/* 연도별 집계 상태                                                     */
/* ------------------------------------------------------------------ */

interface SaleAgg {
  offered: number;
  sold: number;
  withdrawn: number;
  boughtBack: number;
  unresolved: number;
  prices: number[];
}

interface EntrantRec {
  id: string;
  firstSeasonYear: number;
  /** 편입을 처음 관측한 게임 날짜(진행 후 관측 기준) */
  detected: GameDate;
  profile: DistanceProfile | 'unknown';
  role: StudRole;
}

interface Collector {
  races: Map<number, RaceAgg>;
  sales: Map<number, Map<SaleKind, SaleAgg>>;
  seenCatalogues: Set<string>;
  /** NH 스토어 판매(모든 마주, 이벤트 nh_store_sold 기준) */
  nh: Map<number, { count: number; sum: number }>;
  /** 플레이어 NH 판매(장부 nh_store_sale 기준, 새 항목만) */
  nhPlayer: Map<number, { count: number; sum: number }>;
  seenNh: Set<string>;
  knownStallions: Set<string>;
  entrants: EntrantRec[];
  weekMs: Map<number, number[]>;
  unknownSaleEvents: number;
}

function newCollector(initial: GameState): Collector {
  return {
    races: new Map(),
    sales: new Map(),
    seenCatalogues: new Set(),
    nh: new Map(),
    nhPlayer: new Map(),
    seenNh: new Set(),
    knownStallions: new Set(Object.keys(initial.stallions)),
    entrants: [],
    weekMs: new Map(),
    unknownSaleEvents: 0,
  };
}

function raceAggOf(c: Collector, year: number): RaceAgg {
  const existing = c.races.get(year);
  if (existing !== undefined) return existing;
  const fresh: RaceAgg = { run: 0, missingResult: 0, priced: 0, favWon: 0, g1Priced: 0, g1FavWon: 0 };
  c.races.set(year, fresh);
  return fresh;
}

function observeMeeting(c: Collector, out: RunMeetingInPlaceOutput): void {
  const year = out.meeting.date.year;
  const agg = raceAggOf(c, year);
  const byId = new Map<string, RaceResult>();
  for (const r of out.results) byId.set(r.raceId, r);
  for (const sr of out.meeting.races) {
    if (sr.status !== 'run') continue;
    agg.run++;
    const result = byId.get(sr.race.id);
    if (result === undefined) {
      agg.missingResult++;
      continue;
    }
    const fav = favouriteWon(result);
    if (fav === null) continue;
    agg.priced++;
    if (fav) agg.favWon++;
    if (sr.race.grade === 'G1') {
      agg.g1Priced++;
      if (fav) agg.g1FavWon++;
    }
  }
}

function saleAggOf(byKind: Map<SaleKind, SaleAgg>, kind: SaleKind): SaleAgg {
  const existing = byKind.get(kind);
  if (existing !== undefined) return existing;
  const fresh: SaleAgg = { offered: 0, sold: 0, withdrawn: 0, boughtBack: 0, unresolved: 0, prices: [] };
  byKind.set(kind, fresh);
  return fresh;
}

/** 마감된 카탈로그를 한 번만 집계한다(세일 결과는 closed 카탈로그의 lots 에 남는다) */
function observeSales(c: Collector, state: GameState): void {
  for (const cat of state.sales.catalogues) {
    if (cat.status !== 'closed') continue;
    const key = `${cat.saleId}:${cat.year}`;
    if (c.seenCatalogues.has(key)) continue;
    c.seenCatalogues.add(key);
    const kind = SALE_KIND_BY_EVENT.get(cat.saleId);
    if (kind === undefined) {
      c.unknownSaleEvents++;
      continue;
    }
    let byKind = c.sales.get(cat.year);
    if (byKind === undefined) {
      byKind = new Map();
      c.sales.set(cat.year, byKind);
    }
    const agg = saleAggOf(byKind, kind);
    for (const lot of cat.lots) {
      agg.offered++;
      const result = lot.result;
      if (result === null) agg.unresolved++;
      else if (result.kind === 'sold') {
        agg.sold++;
        agg.prices.push(result.price);
      } else if (result.kind === 'bought_back') agg.boughtBack++;
      else agg.withdrawn++;
    }
  }
}

function addTo(map: Map<number, { count: number; sum: number }>, year: number, amount: number): void {
  const cur = map.get(year) ?? { count: 0, sum: 0 };
  cur.count++;
  cur.sum += amount;
  map.set(year, cur);
}

/** NH 스토어 판매: 모든 마주의 판매는 주 이벤트(nh_store_sold, 가격 포함)로 센다 */
function observeNhEvents(c: Collector, events: readonly GameEvent[]): void {
  for (const ev of events) {
    if (ev.type === 'nh_store_sold') addTo(c.nh, ev.date.year, ev.price);
  }
}

/** 플레이어 NH 판매는 장부(nh_store_sale)에 남는다. 새 항목만 센다 */
function observeNhPlayer(c: Collector, state: GameState): void {
  for (const e of state.economy.playerLedger) {
    if (e.category !== 'nh_store_sale') continue;
    const key = `${e.date.year}:${e.date.week}:${e.horseId ?? ''}`;
    if (c.seenNh.has(key)) continue;
    c.seenNh.add(key);
    addTo(c.nhPlayer, e.date.year, e.amount);
  }
}

/** AI 종마 편입: 처음 보는 AI 종마(aiEntrant)를 그 시점의 프로필·역할과 함께 기록한다 */
function observeStallions(c: Collector, state: GameState): void {
  for (const [id, stallion] of Object.entries(state.stallions)) {
    if (c.knownStallions.has(id)) continue;
    c.knownStallions.add(id);
    if (stallion.aiEntrant !== true) continue;
    const horse = state.horses[id];
    c.entrants.push({
      id,
      firstSeasonYear: stallion.firstSeasonYear,
      detected: { ...state.date },
      profile: horse === undefined ? 'unknown' : horseProfile(horse),
      role: stallion.studRole ?? 'flat',
    });
  }
}

/* ------------------------------------------------------------------ */
/* 연말 정산 기본 제출 (tests/engine/yearEnd.test.ts 의 submission 과 같다) */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 연별 스냅샷                                                          */
/* ------------------------------------------------------------------ */

interface SaleRow {
  offered: number;
  sold: number;
  rate: number | null;
  avgPrice: number | null;
  medianPrice: number | null;
  withdrawn: number;
  boughtBack: number;
  unresolved: number;
}

function saleRowOf(agg: SaleAgg | undefined): SaleRow {
  if (agg === undefined) {
    return { offered: 0, sold: 0, rate: null, avgPrice: null, medianPrice: null, withdrawn: 0, boughtBack: 0, unresolved: 0 };
  }
  const turnover = agg.prices.reduce((acc, p) => acc + p, 0);
  return {
    offered: agg.offered,
    sold: agg.sold,
    rate: share(agg.sold, agg.offered),
    avgPrice: agg.prices.length === 0 ? null : turnover / agg.prices.length,
    medianPrice: median(agg.prices),
    withdrawn: agg.withdrawn,
    boughtBack: agg.boughtBack,
    unresolved: agg.unresolved,
  };
}

function mergeSaleAggs(list: readonly SaleAgg[]): SaleAgg {
  const out: SaleAgg = { offered: 0, sold: 0, withdrawn: 0, boughtBack: 0, unresolved: 0, prices: [] };
  for (const a of list) {
    out.offered += a.offered;
    out.sold += a.sold;
    out.withdrawn += a.withdrawn;
    out.boughtBack += a.boughtBack;
    out.unresolved += a.unresolved;
    out.prices.push(...a.prices);
  }
  return out;
}

interface YearRow {
  year: number;
  /** 연차(1부터) */
  n: number;
  funds: {
    aiCount: number;
    aiMedian: number | null;
    aiP10: number | null;
    aiP90: number | null;
    aiNegative: number;
    playerFunds: number;
    playerDebt: number;
    economyMode: string;
    bankrupt: boolean;
    negativeWeeks: number;
  };
  sales: { kinds: Record<SaleKind, SaleRow>; total: SaleRow };
  nh: {
    storeSales: number;
    storeHorsesSoldYear: number;
    avgPrice: number | null;
    totalAmount: number;
    playerSales: number;
    playerAvgPrice: number | null;
  };
  races: { run: number; priced: number; favWinRate: number | null; g1Priced: number; g1FavWinRate: number | null; missingResult: number };
  relations: { count: number; mean: number | null; quantiles: Record<string, number | null>; reputation: number };
  horses: { total: number; byStatus: Record<string, number> };
  moneyFlow: { aiTotals: GameState['economy']['currentYear']['aiTotals']; player: GameState['economy']['currentYear']['player']; breederMedian: number | null; breederTotal: number; aiTotal: number };
  stateSizes: Record<string, number>;
  profileMs: Record<string, number>;
  breederFlows: Record<string, number>;
  perf: { advanceMsMedian: number | null; weeks: number; advanceMsTotal: number; advanceMsMax: number; saveBytes: number; saveChars: number };
}

function emptyProfileCounts(): Record<string, { n: number; nh: number; dual: number; flat: number }> {
  const out: Record<string, { n: number; nh: number; dual: number; flat: number }> = {};
  for (const p of [...PROFILES, 'unknown']) out[p] = { n: 0, nh: 0, dual: 0, flat: 0 };
  return out;
}

function countEntrants(list: readonly EntrantRec[]): Record<string, { n: number; nh: number; dual: number; flat: number }> {
  const out = emptyProfileCounts();
  for (const e of list) {
    const row = out[e.profile] ?? out.unknown!;
    row.n++;
    if (e.role === 'nh') row.nh++;
    else if (e.role === 'dual') row.dual++;
    else row.flat++;
  }
  return out;
}

const profileByYear = new Map<number, Record<string, number>>();
const breederFlows = new Map<number, Record<string, number>>();

function snapshotYear(state: GameState, label: number, c: Collector, n: number): YearRow {
  const aiFunds: number[] = [];
  let aiNegative = 0;
  for (const owner of Object.values(state.owners)) {
    if (owner.isPlayer) continue;
    aiFunds.push(owner.funds);
    if (owner.funds < 0) aiNegative++;
  }
  const kinds = Object.fromEntries(
    SALE_KINDS.map((k) => [k, saleRowOf(c.sales.get(label)?.get(k))]),
  ) as Record<SaleKind, SaleRow>;
  const allYear = c.sales.get(label);
  const total = saleRowOf(allYear === undefined ? undefined : mergeSaleAggs([...allYear.values()]));

  const race = c.races.get(label);
  const nhYear = c.nh.get(label);
  const relVals = Object.values(state.relations.values).filter((v): v is number => typeof v === 'number');
  const byStatus: Record<string, number> = {};
  for (const h of Object.values(state.horses)) byStatus[h.status] = (byStatus[h.status] ?? 0) + 1;
  const player = state.owners[state.playerOwnerId];

  const t = c.weekMs.get(label) ?? [];
  const saveJson = serializeGame(state, SAVED_AT);

  const nhPlayerYear = c.nhPlayer.get(label);
  return {
    year: label,
    n,
    funds: {
      aiCount: aiFunds.length,
      aiMedian: median(aiFunds),
      aiP10: quantile(aiFunds, FUND_QUANTILES[0]),
      aiP90: quantile(aiFunds, FUND_QUANTILES[2]),
      aiNegative: aiNegative,
      playerFunds: player?.funds ?? 0,
      playerDebt: state.economy.debt,
      economyMode: state.economy.mode,
      bankrupt: state.economy.bankrupt,
      negativeWeeks: state.economy.negativeWeeks,
    },
    sales: { kinds, total },
    nh: {
      storeSales: nhYear?.count ?? 0,
      storeHorsesSoldYear: Object.values(state.horses).filter((h) => h.nhSoldYear === label).length,
      avgPrice: nhYear === undefined || nhYear.count === 0 ? null : nhYear.sum / nhYear.count,
      totalAmount: nhYear?.sum ?? 0,
      playerSales: nhPlayerYear?.count ?? 0,
      playerAvgPrice: nhPlayerYear === undefined || nhPlayerYear.count === 0 ? null : nhPlayerYear.sum / nhPlayerYear.count,
    },
    races: {
      run: race?.run ?? 0,
      priced: race?.priced ?? 0,
      favWinRate: share(race?.favWon ?? 0, race?.priced ?? 0),
      g1Priced: race?.g1Priced ?? 0,
      g1FavWinRate: share(race?.g1FavWon ?? 0, race?.g1Priced ?? 0),
      missingResult: race?.missingResult ?? 0,
    },
    relations: {
      count: relVals.length,
      mean: mean(relVals),
      quantiles: Object.fromEntries(RELATION_QUANTILES.map((q) => [`p${q * 100}`, quantile(relVals, q)])),
      reputation: state.relations.reputation,
    },
    horses: { total: Object.keys(state.horses).length, byStatus },
    moneyFlow: {
      aiTotals: { ...state.economy.currentYear.aiTotals }, player: { ...state.economy.currentYear.player },
      breederMedian: median(Object.values(state.breeders).map((b) => b.funds)),
      breederTotal: Object.values(state.breeders).reduce((a, b) => a + b.funds, 0),
      aiTotal: aiFunds.reduce((a, b) => a + b, 0),
    },
    stateSizes: Object.fromEntries([
      ...Object.entries(state).map(([k, v]) => [k, new TextEncoder().encode(JSON.stringify(v)).length]),
      ...Object.entries(state.seasonState).map(([k, v]) => [`seasonState.${k}`, new TextEncoder().encode(JSON.stringify(v)).length]),
    ]),
    profileMs: { ...profileByYear.get(label), cloneAndDispatch: t.reduce((a, b) => a + b, 0)
      - Object.values(profileByYear.get(label) ?? {}).reduce((a, b) => a + b, 0) },
    breederFlows: { ...breederFlows.get(label) },
    perf: {
      advanceMsMedian: median(t),
      weeks: t.length,
      advanceMsTotal: t.reduce((acc, x) => acc + x, 0),
      advanceMsMax: t.length === 0 ? 0 : Math.max(...t),
      saveBytes: new TextEncoder().encode(saveJson).length,
      saveChars: saveJson.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 실행                                                                 */
/* ------------------------------------------------------------------ */

function parseYears(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_YEARS;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`G1_YEARS 는 1 이상의 정수여야 한다: ${raw}`);
  return v;
}

interface RunOutcome {
  years: YearRow[];
  entrants: EntrantRec[];
  unknownSaleEvents: number;
  submissions: number;
  advances: number;
  errors: string[];
  halted: string | null;
  finalDate: GameState['date'];
  finalState: GameState | null;
  totalMs: number;
  initialBalances: { ai: number; breeders: number; player: number };
  races: Map<number, RaceAgg>;
}

function runYears(years: number): RunOutcome {
  profileByYear.clear();
  breederFlows.clear();
  const systems = createGameSystems(STATIC_GAME).map((system) => ({
    id: system.id,
    run: (draft: GameState, ctx: Parameters<typeof system.run>[1]) => {
      const breederBefore = system.id === 'sales' || system.id === 'capital'
        ? Object.values(draft.breeders).reduce((a, b) => a + b.funds, 0) : null;
      const started = performance.now();
      const events = system.run(draft, ctx);
      if (breederBefore !== null) {
        const flows = breederFlows.get(ctx.date.year) ?? {};
        flows[system.id] = (flows[system.id] ?? 0) + Object.values(draft.breeders).reduce((a, b) => a + b.funds, 0) - breederBefore;
        breederFlows.set(ctx.date.year, flows);
      }
      const totals = profileByYear.get(ctx.date.year) ?? {};
      totals[system.id] = (totals[system.id] ?? 0) + performance.now() - started;
      profileByYear.set(ctx.date.year, totals);
      return events;
    },
  }));
  const t0 = performance.now();
  let state = bootstrapGame(
    { seed: SEED, playerName: PLAYER_NAME, silks: { ...SILKS }, difficulty: 'normal', startType: 'owner_breeder' },
    BOOT_DATA,
  );
  const initialBalances = {
    ai: Object.values(state.owners).filter((o) => !o.isPlayer).reduce((a, o) => a + o.funds, 0),
    breeders: Object.values(state.breeders).reduce((a, b) => a + b.funds, 0),
    player: state.owners[state.playerOwnerId]!.funds,
  };
  const collector = newCollector(state);
  const rows: YearRow[] = [];
  const errors: string[] = [];
  const totalWeeks = years * WEEKS_PER_YEAR;
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
    hook.onMeeting = (out) => observeMeeting(collector, out);
    const started = performance.now();
    let advanced: ReturnType<typeof advanceWeekGated>;
    try {
      advanced = advanceWeekGated(state, systems);
    } catch (e) {
      errors.push(`${processed.year}년 ${processed.week}주 진행 중 예외: ${e instanceof Error ? e.message : String(e)}`);
      break;
    } finally {
      hook.onMeeting = null;
    }
    const ms = performance.now() - started;
    if (advanced.blocked !== null) {
      errors.push(`${processed.year}년 ${processed.week}주: 연말 정산 게이트가 제출 뒤에도 막혔다`);
      break;
    }
    state = advanced.state;
    advances++;

    const bucket = collector.weekMs.get(processed.year) ?? [];
    bucket.push(ms);
    collector.weekMs.set(processed.year, bucket);

    observeNhEvents(collector, advanced.events);
    observeSales(collector, state);
    observeNhPlayer(collector, state);
    observeStallions(collector, state);

    const labelled = state.date.year - 1;
    if (state.date.week === 1 && labelled >= START_YEAR && labelled - START_YEAR === rows.length) {
      const row = snapshotYear(state, labelled, collector, rows.length + 1);
      rows.push(row);
      if (G1_OUT) {
        const progress = resolve(process.cwd(), `${G1_OUT}.progress.jsonl`);
        mkdirSync(dirname(progress), { recursive: true });
        appendFileSync(progress, `${JSON.stringify(row)}\n`);
      }
      process.stdout.write(
        `[G1] ${labelled}년 끝: AI 중앙값 ${row.funds.aiMedian?.toFixed(0) ?? '-'} · 플레이어 ${row.funds.playerFunds} · `
        + `말 ${row.horses.total} · 저장 ${row.perf.saveBytes}B · 주당 누적 ${row.perf.advanceMsTotal.toFixed(0)}ms\n`,
      );
    }
  }

  return {
    years: rows,
    entrants: collector.entrants,
    unknownSaleEvents: collector.unknownSaleEvents,
    submissions,
    advances,
    errors,
    halted,
    finalDate: { ...state.date },
    finalState: state,
    totalMs: performance.now() - t0,
    initialBalances,
    races: collector.races,
  };
}

/* ------------------------------------------------------------------ */
/* 판정 1~6                                                             */
/* ------------------------------------------------------------------ */

interface Judgement {
  no: number;
  name: string;
  pass: boolean | null;
  detail: string;
}

function judge(out: RunOutcome, years: number): { judgements: Judgement[]; derived: Record<string, number | null> } {
  const at = (n: number): YearRow | undefined => out.years[n - 1];
  const derived: Record<string, number | null> = {};

  // 1. 인플레 없음
  const aiRatio = ratio(at(LONG_RUN_YEAR_FOR_RATIO)?.funds.aiMedian, at(BASE_YEAR_FOR_RATIO)?.funds.aiMedian);
  const yearlingMa = (n: number): number | null => {
    const vals: number[] = [];
    for (let k = n - MA_WINDOW + 1; k <= n; k++) {
      const p = at(k)?.sales.kinds.yearling.avgPrice;
      if (p !== null && p !== undefined) vals.push(p);
    }
    return mean(vals);
  };
  const yearlyRatio = ratio(yearlingMa(LONG_RUN_YEAR_FOR_RATIO), yearlingMa(BASE_YEAR_FOR_RATIO));
  const breederRatio = ratio(at(LONG_RUN_YEAR_FOR_RATIO)?.moneyFlow.breederMedian, at(BASE_YEAR_FOR_RATIO)?.moneyFlow.breederMedian);
  derived.breederMedianRatio30vs5 = breederRatio;
  derived.aiMedianRatio30vs5 = aiRatio;
  derived.yearlingAvgMa3Ratio30vs5 = yearlyRatio;
  const j1 = allOf([
    aiRatio === null ? null : inRange(aiRatio, INFLATION_MIN, INFLATION_MAX),
    breederRatio === null ? null : inRange(breederRatio, INFLATION_MIN, INFLATION_MAX),
    yearlyRatio === null ? null : inRange(yearlyRatio, INFLATION_MIN, INFLATION_MAX),
  ]);

  // 2. 종마 진로 (편입 누적)
  const all = out.entrants;
  const cup = all.filter((e) => e.profile === 'cup');
  const middle = all.filter((e) => e.profile === 'middle');
  const speed = all.filter((e) => e.profile === 'speed');
  const cupNhDual = share(cup.filter((e) => e.role !== 'flat').length, cup.length);
  const middleNhDual = share(middle.filter((e) => e.role !== 'flat').length, middle.length);
  const speedNh = share(speed.filter((e) => e.role === 'nh').length, speed.length);
  derived.cupNhOrDualShare = cupNhDual;
  derived.middleNhOrDualShare = middleNhDual;
  derived.speedNhShare = speedNh;
  derived.cupEntrants = cup.length;
  derived.speedEntrants = speed.length;
  const j2 = allOf([
    cupNhDual === null ? null : cupNhDual >= CUP_NH_SHARE_MIN,
    speedNh === null ? null : speedNh <= SPEED_NH_SHARE_MAX,
  ]);

  // 3. 세일 낙찰률 (해마다 전체)
  const saleRates = out.years.map((r) => ({ year: r.year, rate: r.sales.total.rate, offered: r.sales.total.offered }));
  const saleOut = saleRates.filter((r) => r.rate !== null && !inRange(r.rate, SALE_RATE_MIN, SALE_RATE_MAX));
  const saleNone = saleRates.filter((r) => r.rate === null).length;
  const j3 = saleOut.length > 0 ? false : saleNone > 0 ? null : saleRates.length === 0 ? null : true;

  // 4. 인기 1위 승률 (해마다 전체)
  const favRates = out.years.map((r) => ({ year: r.year, rate: r.races.favWinRate, priced: r.races.priced }));
  const favOut = favRates.filter((r) => r.rate !== null && r.rate > FAV_SPEC_MAX);
  const favAverage = mean(favRates.flatMap((r) => r.rate === null ? [] : [r.rate]));
  derived.favWinRateAnnualMean = favAverage;
  derived.favWinRateMax = Math.max(...favRates.map((r) => r.rate ?? 0));
  const favNone = favRates.filter((r) => r.rate === null).length;
  const favSpecOut = favRates.filter((r) => r.rate !== null && !inRange(r.rate, FAV_SPEC_MIN, FAV_SPEC_MAX));
  derived.favWinRateSpecRange28to38Outside = favSpecOut.length;
  const j4 = favOut.length > 0 ? false : favNone > 0 || favAverage === null ? null : inRange(favAverage, FAV_TARGET_MIN, FAV_TARGET_MAX);

  // 5. 말 레코드·저장 크기 성장
  const horseRatio = ratio(at(LONG_RUN_YEAR_FOR_RATIO)?.horses.total, at(HORSE_RATIO_BASE_YEAR)?.horses.total);
  const sizeRatio = ratio(at(LONG_RUN_YEAR_FOR_RATIO)?.perf.saveBytes, at(HORSE_RATIO_BASE_YEAR)?.perf.saveBytes);
  const weekRatio = ratio(at(LONG_RUN_YEAR_FOR_RATIO)?.perf.advanceMsMedian, at(1)?.perf.advanceMsMedian);
  derived.weekMedianRatio30vs1 = weekRatio;
  derived.horseRecordRatio30vs10 = horseRatio;
  derived.saveSizeRatio30vs10 = sizeRatio;
  const j5 = allOf([
    weekRatio === null ? null : weekRatio <= 2,
    horseRatio === null ? null : horseRatio <= GROWTH_MAX,
    sizeRatio === null ? null : sizeRatio <= GROWTH_MAX,
  ]);

  // 6. 예외·NaN·음수 두수·파산 중단
  const j6 = out.errors.length === 0 && out.halted === null && out.years.length === years;

  const judgements: Judgement[] = [
    {
      no: 1,
      name: '인플레 없음',
      pass: j1,
      detail: `AI 자금 중앙값 30년차/5년차 = ${fmtRatio(aiRatio)} (0.67~1.5), 생산자 중앙값 비 ${fmtRatio(breederRatio)}, 1세 세일 평균가 3년 이동평균 30년차/5년차 = ${fmtRatio(yearlyRatio)}`,
    },
    {
      no: 2,
      name: '컵 프로필 편입 종마 NH·겸용 비율 ≥70%, speed NH ≤10%',
      pass: j2,
      detail: `컵 편입 ${cup.length}두 중 NH·겸용 ${fmtPct(cupNhDual)} (중장거리 ${middle.length}두 중 ${fmtPct(middleNhDual)}); `
        + `speed ${speed.length}두 중 NH ${fmtPct(speedNh)}`,
    },
    {
      no: 3,
      name: '세일 낙찰률 해마다 30%~95%',
      pass: j3,
      detail: `연도별 낙찰률 ${saleRates.map((r) => `${r.year}:${fmtPct(r.rate)}`).join(', ')}`,
    },
    {
      no: 4,
      name: '인기 1위 승률 연평균 25%~35%, 어느 해도 38% 이하 (M4-G2)',
      pass: j4,
      detail: `연평균 ${fmtPct(favAverage)}; 연도별 ${favRates.map((r) => `${r.year}:${fmtPct(r.rate)}`).join(', ')}; 명세 본문 28~38% 기준 이탈 연도 ${favSpecOut.length}개`,
    },
    {
      no: 5,
      name: '말 레코드·저장 크기 30년차/10년차 ≤1.5',
      pass: j5,
      detail: `말 레코드 비 ${fmtRatio(horseRatio)}, 저장 크기 비 ${fmtRatio(sizeRatio)}, 주당 중앙값 비(30/1) ${fmtRatio(weekRatio)}`,
    },
    {
      no: 6,
      name: '예외·NaN·음수 두수 없음',
      pass: j6,
      detail: `예외 ${out.errors.length}건, 파산·중단 ${out.halted ?? '없음'}, 연수 ${out.years.length}/${years}`,
    },
  ];
  return { judgements, derived };
}

function fmtRatio(x: number | null): string {
  return x === null ? '측정 불가' : x.toFixed(3);
}

function fmtPct(x: number | null): string {
  return x === null ? '-' : `${(x * 100).toFixed(1)}%`;
}

/** NaN·Infinity 가 JSON 에 섞였는지 찾는다(null 은 '표본 없음'이라 허용) */
function nonFinitePaths(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => nonFinitePaths(v, `${path}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) nonFinitePaths(v, `${path}.${k}`, out);
  }
}

/** 음수 두수·말이 안 맞는 집계(상장 < 낙찰 등) */
function negativeCountIssues(rows: readonly YearRow[]): string[] {
  const issues: string[] = [];
  for (const r of rows) {
    if (r.horses.total < 0) issues.push(`${r.year} 말 레코드 ${r.horses.total}`);
    if (r.funds.aiCount < 0) issues.push(`${r.year} AI 마주 수 ${r.funds.aiCount}`);
    for (const k of SALE_KINDS) {
      const row = r.sales.kinds[k];
      if (row.offered < 0 || row.sold < 0 || row.sold > row.offered) {
        issues.push(`${r.year} ${k} 상장 ${row.offered} 낙찰 ${row.sold}`);
      }
    }
    if (r.nh.storeSales < 0 || r.nh.storeHorsesSoldYear < 0) issues.push(`${r.year} NH 판매 두수 음수`);
    if (r.races.priced < 0 || r.races.run < 0) issues.push(`${r.year} 레이스 두수 음수`);
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* 테스트                                                               */
/* ------------------------------------------------------------------ */

describe('M4-G1 30년 자동 진행 측정', () => {
  it.skipIf(!process.env.G1_REPRO_OUT)('G1 실제 조건·연말 게이트로 2년 두 번 결정성 확인', () => {
    const first = runYears(2);
    const second = runYears(2);
    const a = serializeGame(first.finalState!, SAVED_AT);
    const b = serializeGame(second.finalState!, SAVED_AT);
    const result = { seed: SEED, years: 2, advances: [first.advances, second.advances],
      errors: [...first.errors, ...second.errors], identical: a === b,
      hashes: [a, b].map((s) => createHash('sha256').update(s).digest('hex')) };
    const path = resolve(process.cwd(), process.env.G1_REPRO_OUT!);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
    expect(result.errors).toEqual([]);
    expect(result.advances).toEqual([104, 104]);
    expect(result.identical).toBe(true);
  }, RUN_TIMEOUT_MS);

  it.skipIf(!G1_OUT)(
    `시드 ${SEED} 보통·오너브리더 ${DEFAULT_YEARS}년(G1_YEARS) 무입력 진행, 연별 지표를 G1_OUT 에 JSON 으로 기록`,
    () => {
      const years = parseYears(process.env.G1_YEARS);
      const progress = resolve(process.cwd(), `${G1_OUT}.progress.jsonl`);
      mkdirSync(dirname(progress), { recursive: true });
      writeFileSync(progress, '');
      const out = runYears(years);
      const { judgements, derived } = judge(out, years);

      const nonFinite: string[] = [];
      nonFinitePaths(out.years, 'years', nonFinite);
      nonFinitePaths(derived, 'derived', nonFinite);
      const negatives = negativeCountIssues(out.years);
      const cumulativeCounts = {
        total: out.entrants.length,
        byProfile: countEntrants(out.entrants),
      };

      const final = out.finalState;
      nonFinitePaths(final, 'finalState', nonFinite);
      const result = {
        previousG1: process.env.G1_PREVIOUS ? JSON.parse(readFileSync(process.env.G1_PREVIOUS, 'utf8')) as unknown : null,
        meta: {
          initialBalances: out.initialBalances,
          seed: SEED,
          difficulty: 'normal',
          startType: 'owner_breeder',
          economyMode: final?.economy.mode ?? null,
          years,
          weeksPerYear: WEEKS_PER_YEAR,
          advances: out.advances,
          submissions: out.submissions,
          startDate: { year: START_YEAR, week: 1 },
          endDate: out.finalDate,
          totalMs: Math.round(out.totalMs),
        },
        years: out.years,
        // 엔진 연말 요약(economy.yearSummaries). 닫힘은 다음 해 1주 진행 때라 마지막 해는 빠질 수 있다(진단용)
        engineYearSummaries: out.finalState?.economy.yearSummaries ?? [],
        entrants: {
          cumulative: cumulativeCounts,
          // 연도 행 y 의 편입 = firstSeasonYear 가 다음 해(y+1)인 AI 종마(명세: firstSeasonYear === 다음 해)
          byYear: out.years.map((r) => ({
            year: r.year,
            entered: out.entrants.filter((e) => e.firstSeasonYear === r.year + 1).length,
            byProfile: countEntrants(out.entrants.filter((e) => e.firstSeasonYear === r.year + 1)),
          })),
          list: out.entrants,
        },
        derived,
        judgements,
        integrity: {
          errors: out.errors,
          halted: out.halted,
          nonFinitePaths: nonFinite,
          negativeIssues: negatives,
          missingRaceResults: [...out.races.values()].reduce((acc, r) => acc + r.missingResult, 0),
          unknownSaleEvents: out.unknownSaleEvents,
        },
      };

      const path = resolve(process.cwd(), G1_OUT!);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      process.stdout.write(`[G1] 결과 기록: ${path} (연수 ${out.years.length}/${years}, 총 ${Math.round(out.totalMs)}ms)\n`);

      // 무결성만 단언한다. 밸런스 판정 1~5 는 JSON·리포트에서 ✅/❌ 로 보고한다.
      expect(out.errors).toEqual([]);
      expect(out.halted).toBeNull();
      expect(out.years).toHaveLength(years);
      expect(nonFinite).toEqual([]);
      expect(negatives).toEqual([]);
    },
    RUN_TIMEOUT_MS,
  );
});
