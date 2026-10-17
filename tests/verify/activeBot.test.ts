import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { approveAllMatings } from '../../src/engine/breeding/matingPlan';
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
import { consignProposal } from '../../src/engine/sales/autoSell';
import { clearMaxBid, lotView, setMaxBid } from '../../src/engine/sales/bidding';
import type { SalesStaticData } from '../../src/engine/sales/system';
import { approvePlan, replanHorse } from '../../src/engine/season/racePlan';
import type { RunMeetingInPlaceOutput } from '../../src/engine/season/raceday';
import { advanceWeekGated, submitYearEnd, retainerRenewalsDue, yearEndCandidates, yearEndPending } from '../../src/engine/stud/yearEnd';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import type { Difficulty, GameEvent, GameState, HorseId, LedgerTotals, Money, YearEndSubmission } from '../../src/engine/types';

/**
 * M6-B2 능동 플레이 봇·난이도별 시작 측정(명세 docs/specs/M6-B-balance.md, B2).
 * 실행: BOT_OUT=<결과 JSON 절대 경로> npx vitest run tests/verify/activeBot.test.ts --testTimeout=7200000
 * BOT_OUT 이 없으면 전부 건너뛴다(기본 npm test 시간을 늘리지 않는다).
 * BOT_YEARS_CAP=<n>: 시험 실행용으로 연수를 n 년으로 줄인다. 보고 수치에는 쓰지 않는다.
 *
 * 시나리오: (a) 봇 10년 × 난이도 easy·normal·hard, (b) 무입력 3년 × 난이도 easy·normal·hard. 시드 20261011, 오너브리더, 캐주얼 경제(기본).
 * 봇은 useGame 이 부르는 공개 엔진 함수만 쓴다.
 *  - 1세 세일(kind yearling): 예산 = 자금의 20%. 공개 추정 범위(lotView.estimate)의 하한이 예산 안인 로트 중
 *    추정 중앙값이 높은 순으로, 해마다 낙찰 2두까지. 상한 = min(추정 상한, 예산 ÷ 고른 두수). 고르지 않은 입찰은 지운다.
 *  - 출주 계획: 조교 중인 말마다 replanHorse 후 제안 전부 approvePlan.
 *  - 교배: approveAllMatings. 빚이 있으면 엔진이 4~5티어만 제안하므로 봇은 그대로 승인한다.
 *  - 판매 제안: 제안 상태인 것 전부 consignProposal(그대로 위탁).
 *  - 연말 정산: 두 시나리오 모두 엔진 기본 추천·재계약 기본값(엔진이 제출 없이는 진행을 막는다).
 * 엔진 기본 자동 진행(출주 계획 제안 신청, 교배 자동 예약, 판매 자동 위탁)은 두 시나리오 모두 켜진 상태다.
 * 판정 기준은 두지 않는다(측정·보고만). 단언은 무결성(예외·정산 차단·NaN)만 한다.
 */

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

const BOT_OUT = process.env.BOT_OUT;
const BOT_YEARS_CAP = process.env.BOT_YEARS_CAP === undefined ? null : Number(process.env.BOT_YEARS_CAP);
const SEED = 20261011;
const BOT_YEARS = 10;
const IDLE_YEARS = 3;
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
/** 봇 예산 비율: 자금의 20% */
const BOT_BUDGET_SHARE = 0.2;
/** 봇이 한 해에 낙찰받는 1세 두수 상한 */
const BOT_MAX_YEARLING_BUYS = 2;
/** 분기 말 주(처리 후 기록). 1년 52주 기준 */
const QUARTER_WEEKS: readonly number[] = [13, 26, 39, 52];
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const PLAYER_NAME = '가상 마주';
const RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* 정적 데이터 (UI·G1 과 같은 구성)                                      */
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
const STATIC_SALES: SalesStaticData = { sales: SALES };
const BOOT_DATA: BootstrapData = { ...STATIC_GAME, ...getPeopleData() };
const YEARLING_EVENTS = new Map(SALES.events.filter((e) => e.kind === 'yearling').map((e) => [e.id, e] as const));

/* ------------------------------------------------------------------ */
/* 레이스 관찰 훅 (G1 과 같은 vi.mock 방식, 상태를 바꾸지 않는다)         */
/* ------------------------------------------------------------------ */

const hook = vi.hoisted(() => ({
  onMeeting: null as ((out: RunMeetingInPlaceOutput, state: GameState) => void) | null,
}));

vi.mock('../../src/engine/season/raceday', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/season/raceday')>();
  return {
    ...actual,
    runMeetingInPlace: (...args: Parameters<typeof actual.runMeetingInPlace>): RunMeetingInPlaceOutput => {
      const out = actual.runMeetingInPlace(...args);
      hook.onMeeting?.(out, args[0]);
      return out;
    },
  };
});

/* ------------------------------------------------------------------ */
/* 측정 기록 타입                                                       */
/* ------------------------------------------------------------------ */

interface WeekStamp {
  year: number;
  week: number;
}

interface PointRow {
  label: string;
  year: number;
  week: number;
  funds: number;
  debt: number;
  activeHorses: number;
  broodmares: number;
}

/** 봇이 건 입찰 한 건과 세일 뒤 결과(로트 결과가 나온 주에 채운다. 못 채우면 null) */
interface BidLogEntry {
  year: number;
  saleId: string;
  lotNo: number;
  /** 건 상한(€, 수수료 제외) */
  cap: Money;
  /** 공개 추정 범위 */
  low: Money;
  high: Money;
  outcome: 'won' | 'lost' | 'bought_back' | 'withdrawn' | null;
  price: Money | null;
}

interface BotActions {
  bidsSet: number;
  bidsCleared: number;
  bidLog: BidLogEntry[];
  /** 승인한 출주 계획 id(중복 없음). 매주 재계획되므로 횟수가 아니라 id 로 센다 */
  racePlanIds: string[];
  matingsApproved: number;
  matingsSkipped: number;
  sellsConsigned: number;
}

interface Buy {
  year: number;
  saleId: string;
  lotNo: number;
  price: Money;
}

interface Stats {
  quarterly: PointRow[];
  firstWin: WeekStamp | null;
  playerWins: number;
  firstGroupPlace: (WeekStamp & { grade: string; position: number }) | null;
  groupPlacings: number;
  groupWins: number;
  firstDebt: (WeekStamp & { amount: Money }) | null;
  maxDebt: number;
  debtWeeks: number;
  negativeFundsWeeks: number;
  minActive: number;
  activeWeekSum: number;
  activeWeeks: number;
  /** 플레이어가 낙찰받은 로트(모든 세일 종류) */
  buys: Buy[];
  /** 연도별 장부 합계(연말 주 처리 후 currentYear.player). 빚 원인 확인용 */
  ledger: { year: number; funds: number; debt: number; totals: LedgerTotals }[];
  yearEndSubmissions: number;
  actions: BotActions;
}

interface RunResult {
  mode: 'bot' | 'idle';
  difficulty: Difficulty;
  yearsRequested: number;
  weeksRun: number;
  startFunds: Money;
  endFunds: number;
  endDebt: number;
  halted: string | null;
  errors: string[];
  elapsedMs: number;
  stats: Omit<Stats, 'actions'> & { actions: Omit<BotActions, 'racePlanIds' | 'bidLog'> & { racePlansApproved: number } };
  /** 봇이 건 입찰과 세일 뒤 결과(outcome null = 끝까지 결과를 못 봄) */
  bids: BidLogEntry[];
  /** 게임 끝 시점 출주 계획 상태 분포(플레이어 말) */
  planStatus: Record<string, number>;
  /** 게임 끝 시점 플레이어 말의 누적 출주 수 */
  playerStarts: number;
}

/* ------------------------------------------------------------------ */
/* 보조                                                                 */
/* ------------------------------------------------------------------ */

function newStats(startActive: number): Stats {
  return {
    quarterly: [],
    firstWin: null,
    playerWins: 0,
    firstGroupPlace: null,
    groupPlacings: 0,
    groupWins: 0,
    firstDebt: null,
    maxDebt: 0,
    debtWeeks: 0,
    negativeFundsWeeks: 0,
    minActive: startActive,
    activeWeekSum: 0,
    activeWeeks: 0,
    buys: [],
    ledger: [],
    yearEndSubmissions: 0,
    actions: {
      bidsSet: 0,
      bidsCleared: 0,
      bidLog: [],
      racePlanIds: [],
      matingsApproved: 0,
      matingsSkipped: 0,
      sellsConsigned: 0,
    },
  };
}

/** 연말 정산 기본 제출(G1 과 같다: 엔진 추천 + 재계약 전부) */
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

function compareLot(a: { saleId: string; lotNo: number }, b: { saleId: string; lotNo: number }): number {
  if (a.saleId !== b.saleId) return a.saleId < b.saleId ? -1 : 1;
  return a.lotNo - b.lotNo;
}

function activeCount(state: GameState): number {
  return Object.values(state.horses).filter((h) => h.ownerId === state.playerOwnerId
    && (h.status === 'in_training' || h.status === 'resting')).length;
}

function broodmareCount(state: GameState): number {
  return Object.values(state.horses).filter((h) => h.ownerId === state.playerOwnerId && h.status === 'broodmare').length;
}

/* ------------------------------------------------------------------ */
/* 봇 정책                                                              */
/* ------------------------------------------------------------------ */

/**
 * 1세 세일 입찰 정책(명세 B2 1번). 예산 = 자금의 20%.
 * 두수 n 을 2 에서 1 까지 줄여 가며, 공개 추정 하한이 예산 ÷ n 이하인 로트 중 추정 중앙값이 높은 순으로 n 두를 고른다.
 * 그래서 고른 로트마다 상한(= min(추정 상한, 예산 ÷ n))이 추정 하한 이상이다. 해마다 낙찰 2두까지.
 */
function botBids(state: GameState, actions: BotActions): GameState {
  const year = state.date.year;
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) return state;
  const budget = Math.floor(owner.funds * BOT_BUDGET_SHARE);
  const won = state.sales.catalogues
    .filter((c) => c.year === year)
    .flatMap((c) => c.lots)
    .filter((l) => l.result?.kind === 'sold' && l.result.buyerId === state.playerOwnerId).length;
  const slots = Math.max(0, BOT_MAX_YEARLING_BUYS - won);

  const open: { saleId: string; lotNo: number; mid: number; low: Money; high: Money; minBid: Money }[] = [];
  for (const cat of state.sales.catalogues) {
    const event = YEARLING_EVENTS.get(cat.saleId);
    if (event === undefined || cat.year !== year || cat.status !== 'catalogued') continue;
    for (const lot of cat.lots) {
      if (lot.result !== null) continue;
      if (lot.vendor.kind === 'owner' && lot.vendor.id === state.playerOwnerId) continue;
      const view = lotView(state, cat.saleId, year, lot.lotNo, STATIC_SALES);
      if (view === null) continue;
      const { low, high } = view.estimate;
      open.push({ saleId: cat.saleId, lotNo: lot.lotNo, mid: (low + high) / 2, low, high, minBid: event.minimumBid });
    }
  }
  open.sort((a, b) => b.mid - a.mid || compareLot(a, b));

  let picks: typeof open = [];
  let perLot = 0;
  for (let n = slots; n >= 1 && picks.length === 0; n--) {
    const share = Math.floor(budget / n);
    const affordable = open.filter((p) => p.low <= share);
    if (affordable.length >= n) {
      picks = affordable.slice(0, n);
      perLot = share;
    }
  }
  const placed = picks
    .map((p) => ({ ...p, cap: Math.min(p.high, perLot) }))
    .filter((p) => p.cap >= p.minBid);

  let next = state;
  // 고르지 않은 올해 1세 입찰은 지운다
  for (const bid of state.sales.playerBids.filter((b) => b.year === year && YEARLING_EVENTS.has(b.saleId))) {
    if (placed.some((p) => p.saleId === bid.saleId && p.lotNo === bid.lotNo)) continue;
    const r = clearMaxBid(next, bid.saleId, year, bid.lotNo);
    if (r.ok) { next = r.state; actions.bidsCleared++; }
  }
  for (const p of placed) {
    const existing = next.sales.playerBids.find((b) => b.saleId === p.saleId && b.year === year && b.lotNo === p.lotNo);
    if (existing?.maxBid === p.cap) continue;
    const r = setMaxBid(next, p.saleId, year, p.lotNo, p.cap, STATIC_SALES);
    if (!r.ok) continue;
    next = r.state;
    actions.bidsSet++;
    actions.bidLog.push({ year, saleId: p.saleId, lotNo: p.lotNo, cap: p.cap, low: p.low, high: p.high, outcome: null, price: null });
  }
  return next;
}

/** 주 날짜 a 가 b 와 같거나 뒤인가 */
function onOrAfter(a: { year: number; week: number }, b: { year: number; week: number }): boolean {
  return a.year > b.year || (a.year === b.year && a.week >= b.week);
}

/**
 * 출주 계획(명세 B2 1번). 예정된 계획(제안·승인, 날짜가 이번 주 이후)이 없을 때만 재계획한다.
 * 매주 재계획하면 이번 주에 실행될 승인 계획이 재계획 중 사라져 출주가 영영 안 된다(시험 실행에서 확인).
 * 그다음 제안 상태인 계획은 전부 승인한다.
 */
function botRacePlans(state: GameState, actions: BotActions): GameState {
  let next = state;
  const horseIds: HorseId[] = Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId && h.status === 'in_training' && h.trainerId !== null)
    .map((h) => h.id);
  for (const horseId of horseIds) {
    const plans = next.seasonState.racePlans?.[horseId] ?? [];
    const pending = plans.some((p) => (p.status === 'proposed' || p.status === 'approved') && onOrAfter(p.date, next.date));
    if (!pending) {
      const re = replanHorse(next, STATIC_GAME, horseId);
      if (re.ok) next = re.state;
    }
    const proposedIds = (next.seasonState.racePlans?.[horseId] ?? []).filter((p) => p.status === 'proposed').map((p) => p.id);
    for (const planId of proposedIds) {
      const ap = approvePlan(next, horseId, planId);
      if (!ap.ok) continue;
      next = ap.state;
      if (!actions.racePlanIds.includes(planId)) actions.racePlanIds.push(planId);
    }
  }
  return next;
}

/** 교배 제안 승인(명세 B2 1번). 빚이 있을 때의 저가 종마 제한은 엔진 규칙을 그대로 따른다 */
function botMatings(state: GameState, actions: BotActions): GameState {
  const before = state.stud.matingProposals ?? [];
  const r = approveAllMatings(state);
  if (!r.ok) return state;
  const after = r.state.stud.matingProposals ?? [];
  const count = (list: typeof before, status: string) => list.filter((p) => p.status === status).length;
  actions.matingsApproved += Math.max(0, count(after, 'booked') - count(before, 'booked'));
  actions.matingsSkipped += Math.max(0, count(after, 'skipped') - count(before, 'skipped'));
  return r.state;
}

/** 판매 제안 그대로 위탁(명세 B2 1번) */
function botConsign(state: GameState, actions: BotActions): GameState {
  let next = state;
  for (const proposal of state.sales.sellProposals ?? []) {
    if (proposal.status !== 'proposed') continue;
    const r = consignProposal(next, proposal.horseId, STATIC_SALES);
    if (r.ok) { next = r.state; actions.sellsConsigned++; }
  }
  return next;
}

function botStep(state: GameState, actions: BotActions): GameState {
  let next = botBids(state, actions);
  next = botRacePlans(next, actions);
  next = botMatings(next, actions);
  next = botConsign(next, actions);
  return next;
}

/* ------------------------------------------------------------------ */
/* 관찰                                                                 */
/* ------------------------------------------------------------------ */

/** 개최 결과에서 플레이어 말의 1착·그룹 입상(G1~G3 3위 안)을 센다. 상태를 바꾸지 않는다 */
function observeMeeting(stats: Stats, out: RunMeetingInPlaceOutput, state: GameState): void {
  const byId = new Map(out.results.map((r) => [r.raceId, r] as const));
  const stamp: WeekStamp = { year: out.meeting.date.year, week: out.meeting.date.week };
  for (const sr of out.meeting.races) {
    if (sr.status !== 'run') continue;
    const result = byId.get(sr.race.id);
    if (result === undefined) continue;
    for (const runner of result.runners) {
      if (state.horses[runner.horseId]?.ownerId !== state.playerOwnerId) continue;
      if (runner.position === 1) {
        stats.playerWins++;
        stats.firstWin ??= stamp;
      }
      const grade = sr.race.grade;
      if (grade !== null && grade !== 'L' && runner.position <= 3) {
        stats.groupPlacings++;
        if (runner.position === 1) stats.groupWins++;
        stats.firstGroupPlace ??= { ...stamp, grade, position: runner.position };
      }
    }
  }
}

/** 한 주 처리 직후 상태를 본다. processed 는 처리한 주의 날짜 */
function observeWeek(stats: Stats, seenBuys: Set<string>, state: GameState, processed: WeekStamp): void {
  const owner = state.owners[state.playerOwnerId];
  const funds = owner?.funds ?? 0;
  const debt = state.economy.debt;
  const active = activeCount(state);

  stats.minActive = Math.min(stats.minActive, active);
  stats.activeWeekSum += active;
  stats.activeWeeks++;
  if (funds < 0) stats.negativeFundsWeeks++;
  if (debt > 0) {
    stats.debtWeeks++;
    stats.maxDebt = Math.max(stats.maxDebt, debt);
    stats.firstDebt ??= { ...processed, amount: debt };
  }

  for (const cat of state.sales.catalogues) {
    for (const lot of cat.lots) {
      if (lot.result?.kind !== 'sold' || lot.result.buyerId !== state.playerOwnerId) continue;
      const key = `${cat.saleId}:${cat.year}:${lot.lotNo}`;
      if (seenBuys.has(key)) continue;
      seenBuys.add(key);
      stats.buys.push({ year: cat.year, saleId: cat.saleId, lotNo: lot.lotNo, price: lot.result.price });
    }
  }

  // 봇 입찰의 로트 결과를 세일이 끝난 주에 붙잡는다(카탈로그는 세일 뒤 정리될 수 있다)
  for (const entry of stats.actions.bidLog) {
    if (entry.outcome !== null) continue;
    const cat = state.sales.catalogues.find((c) => c.saleId === entry.saleId && c.year === entry.year);
    const result = cat?.lots.find((l) => l.lotNo === entry.lotNo)?.result ?? null;
    if (result === null) continue;
    if (result.kind === 'sold') {
      entry.outcome = result.buyerId === state.playerOwnerId ? 'won' : 'lost';
      entry.price = result.price;
    } else if (result.kind === 'bought_back') {
      entry.outcome = 'bought_back';
      entry.price = result.lastBid;
    } else {
      entry.outcome = 'withdrawn';
    }
  }

  if (processed.week === WEEKS_PER_YEAR) {
    stats.ledger.push({ year: processed.year, funds, debt, totals: { ...state.economy.currentYear.player } });
  }

  const qIndex = QUARTER_WEEKS.indexOf(processed.week);
  if (qIndex >= 0) {
    stats.quarterly.push({
      label: `${processed.year}Q${qIndex + 1}`,
      year: processed.year,
      week: processed.week,
      funds,
      debt,
      activeHorses: active,
      broodmares: broodmareCount(state),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 실행                                                                 */
/* ------------------------------------------------------------------ */

function runScenario(mode: 'bot' | 'idle', difficulty: Difficulty, requestedYears: number): RunResult {
  const years = BOT_YEARS_CAP ?? requestedYears;
  const t0 = performance.now();
  let state = bootstrapGame(
    { seed: SEED, playerName: PLAYER_NAME, silks: { ...SILKS }, difficulty, startType: 'owner_breeder' },
    BOOT_DATA,
  );
  const startFunds = state.owners[state.playerOwnerId]?.funds ?? 0;
  const stats = newStats(activeCount(state));
  const seenBuys = new Set<string>();
  const actions = stats.actions;
  const systems = createGameSystems(STATIC_GAME);
  const totalWeeks = years * WEEKS_PER_YEAR;
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
      stats.yearEndSubmissions++;
    }
    if (mode === 'bot') state = botStep(state, actions);

    const processed: WeekStamp = { year: state.date.year, week: state.date.week };
    hook.onMeeting = (out, current) => observeMeeting(stats, out, current);
    let advanced: ReturnType<typeof advanceWeekGated>;
    try {
      advanced = advanceWeekGated(state, systems);
    } catch (e) {
      errors.push(`${processed.year}년 ${processed.week}주 진행 중 예외: ${e instanceof Error ? e.message : String(e)}`);
      break;
    } finally {
      hook.onMeeting = null;
    }
    if (advanced.blocked !== null) {
      errors.push(`${processed.year}년 ${processed.week}주: 연말 정산 게이트가 제출 뒤에도 막혔다`);
      break;
    }
    state = advanced.state;
    weeksRun++;
    observeWeek(stats, seenBuys, state, processed);
  }

  const planStatus: Record<string, number> = {};
  let playerStarts = 0;
  for (const [horseId, plans] of Object.entries(state.seasonState.racePlans ?? {})) {
    if (state.horses[horseId]?.ownerId !== state.playerOwnerId) continue;
    for (const plan of plans) planStatus[plan.status] = (planStatus[plan.status] ?? 0) + 1;
  }
  for (const horse of Object.values(state.horses)) {
    if (horse.ownerId === state.playerOwnerId) playerStarts += horse.record.starts;
  }

  return {
    mode,
    difficulty,
    yearsRequested: years,
    weeksRun,
    startFunds,
    endFunds: state.owners[state.playerOwnerId]?.funds ?? 0,
    endDebt: state.economy.debt,
    halted,
    errors,
    elapsedMs: Math.round(performance.now() - t0),
    stats: {
      quarterly: stats.quarterly,
      firstWin: stats.firstWin,
      playerWins: stats.playerWins,
      firstGroupPlace: stats.firstGroupPlace,
      groupPlacings: stats.groupPlacings,
      groupWins: stats.groupWins,
      firstDebt: stats.firstDebt,
      maxDebt: stats.maxDebt,
      debtWeeks: stats.debtWeeks,
      negativeFundsWeeks: stats.negativeFundsWeeks,
      minActive: stats.minActive,
      activeWeekSum: stats.activeWeekSum,
      activeWeeks: stats.activeWeeks,
      buys: stats.buys,
      ledger: stats.ledger,
      yearEndSubmissions: stats.yearEndSubmissions,
      actions: {
        bidsSet: actions.bidsSet,
        bidsCleared: actions.bidsCleared,
        racePlansApproved: actions.racePlanIds.length,
        matingsApproved: actions.matingsApproved,
        matingsSkipped: actions.matingsSkipped,
        sellsConsigned: actions.sellsConsigned,
      },
    },
    bids: actions.bidLog.map((entry) => ({ ...entry })),
    planStatus,
    playerStarts,
  };
}

/* ------------------------------------------------------------------ */
/* 테스트                                                               */
/* ------------------------------------------------------------------ */

/** 결과 누적(모든 describe 가 같은 파일에 쓴다) */
const results: RunResult[] = [];

function flush(): void {
  const path = resolve(process.cwd(), BOT_OUT!);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ seed: SEED, scenarios: results }, null, 2)}\n`, 'utf8');
  process.stdout.write(`[BOT] 결과 기록: ${path} (완료 ${results.length}개)\n`);
}

describe.skipIf(BOT_OUT === undefined)('M6-B2 능동 플레이 봇·난이도별 시작 측정', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`(a) 봇 ${BOT_YEARS}년 · ${difficulty}`, () => {
      const r = runScenario('bot', difficulty, BOT_YEARS);
      results.push(r);
      flush();
      expect(r.errors).toEqual([]);
      expect(Number.isFinite(r.endFunds)).toBe(true);
      expect(r.stats.minActive).toBeGreaterThanOrEqual(0);
    }, RUN_TIMEOUT_MS);
  }

  for (const difficulty of DIFFICULTIES) {
    it(`(b) 무입력 ${IDLE_YEARS}년 · ${difficulty}`, () => {
      const r = runScenario('idle', difficulty, IDLE_YEARS);
      results.push(r);
      flush();
      expect(r.errors).toEqual([]);
      expect(Number.isFinite(r.endFunds)).toBe(true);
      expect(r.stats.minActive).toBeGreaterThanOrEqual(0);
    }, RUN_TIMEOUT_MS);
  }
});

/**
 * 진단(명세 밖, BOT_DIAG 가 있을 때만): 무입력 10년 × 보통·어려움. 봇 10년 빚이 봇 행동 때문인지 엔진 경제 때문인지 나누는 대조군.
 * 실행: BOT_DIAG=1 BOT_OUT=<파일> npx vitest run tests/verify/activeBot.test.ts -t 진단
 */
describe.skipIf(BOT_OUT === undefined || process.env.BOT_DIAG === undefined)('M6-B2 진단: 무입력 10년', () => {
  for (const difficulty of ['normal', 'hard'] as const) {
    it(`(진단) 무입력 ${BOT_YEARS}년 · ${difficulty}`, () => {
      const r = runScenario('idle', difficulty, BOT_YEARS);
      results.push(r);
      flush();
      expect(r.errors).toEqual([]);
      expect(Number.isFinite(r.endFunds)).toBe(true);
    }, RUN_TIMEOUT_MS);
  }
});
