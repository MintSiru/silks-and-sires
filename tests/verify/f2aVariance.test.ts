import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { buildRacePath } from '../../src/engine/course/path';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { impliedProbability, oddsToDecimal } from '../../src/engine/race/odds';
import { relativeStrengths } from '../../src/engine/race/runRace';
import { estimateStrength, type RaceContext } from '../../src/engine/race/runnerModel';
import type { RunMeetingInPlaceOutput } from '../../src/engine/season/raceday';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  GameState,
  Horse,
  HorseId,
  Meeting,
  RaceEntry,
  RaceResult,
  Racecourse,
  RunnerInput,
  SeriesDefinition,
} from '../../src/engine/types';

/**
 * M3-F2a 승부 변동·오즈 오차 측정 스크립트. VERIFY=1 일 때만 실행된다.
 * 측정 방식은 tests/verify/f1bProbe.test.ts 와 같다(시드 20261011, 2시즌 105주, 플레이어 무출주,
 * 요약 경로·시뮬레이션 경로 분리, 능력 1위 = 레이스 전 말 상태로 estimateStrength 를 다시 계산).
 *
 * 손잡이 재정의: F2A_SUMMARY(SUMMARY_NOISE_SD), F2A_FORM(FORM_SD), F2A_MARKET(MARKET_NOISE_SD).
 * 환경변수가 없으면 config 의 실제 값을 쓴다. 있으면 격자 실험 모드로 보고 목표 판정은 하지 않는다.
 * F2A_OUT 경로가 있으면 결과 JSON 을 그 파일에 쓴다. 엔진 코드와 config 파일은 고치지 않는다.
 */

const tap = vi.hoisted(() => ({
  run: null as null | {
    before: (state: GameState, meeting: Meeting) => void;
    after: (state: GameState, meeting: Meeting, out: RunMeetingInPlaceOutput) => void;
  },
}));

vi.mock('../../src/engine/config/season', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/config/season')>();
  const v = process.env.F2A_SUMMARY;
  return { ...actual, SUMMARY_NOISE_SD: v === undefined ? actual.SUMMARY_NOISE_SD : Number(v) };
});

vi.mock('../../src/engine/config/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/config/runner')>();
  const v = process.env.F2A_FORM;
  return { ...actual, FORM_SD: v === undefined ? actual.FORM_SD : Number(v) };
});

vi.mock('../../src/engine/config/raceday', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/config/raceday')>();
  const v = process.env.F2A_MARKET;
  const t = process.env.F2A_TEMP;
  return {
    ...actual,
    MARKET_NOISE_SD: v === undefined ? actual.MARKET_NOISE_SD : Number(v),
    MARKET_TEMPERATURE: t === undefined ? actual.MARKET_TEMPERATURE : Number(t),
  };
});

vi.mock('../../src/engine/config/results', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/config/results')>();
  const v = process.env.F2A_DEAD;
  return { ...actual, DEAD_HEAT_SECONDS: v === undefined ? actual.DEAD_HEAT_SECONDS : Number(v) };
});

vi.mock('../../src/engine/season/raceday', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/season/raceday')>();
  return {
    ...actual,
    runMeetingInPlace: (...args: Parameters<typeof actual.runMeetingInPlace>): RunMeetingInPlaceOutput => {
      const [state, meeting] = args;
      tap.run?.before(state, meeting);
      const out = actual.runMeetingInPlace(...args);
      tap.run?.after(state, meeting, out);
      return out;
    },
  };
});

const SEED = process.env.F2A_SEED === undefined ? 20261011 : Number(process.env.F2A_SEED);
const SEASONS = 2;
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS + 1;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;

const OVERRIDE_MODE = [
  process.env.F2A_SUMMARY,
  process.env.F2A_FORM,
  process.env.F2A_MARKET,
  process.env.F2A_TEMP,
  process.env.F2A_DEAD,
  process.env.F2A_SEED,
].some((v) => v !== undefined);

const COURSES: Racecourse[] = getRacecourses();
const COURSE_BY_ID = new Map<string, Racecourse>(COURSES.map((c) => [c.id, c] as const));
const SERIES_DEFS: SeriesDefinition[] = getSeriesDefinitions();
const TEMPLATES = getRaceTemplates();

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES_DEFS,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES_DEFS,
};

/** 레이스 한 건의 관찰값 */
interface RaceRec {
  simulated: boolean;
  field: number;
  /** 인기 1위가 1착(동착 포함)이면 true. 오즈 전부 있는 레이스만 값이 있다 */
  favWon: boolean | null;
  favDec: number | null;
  /** 능력 1위(노이즈 없는 강도 최대)가 1착이면 true */
  topWon: boolean;
  oddsFavIsTop: boolean;
  /** 레이스 안 공동 착순이 한 번이라도 있으면 true */
  deadHeat: boolean;
  /** 1착 동착 */
  winnerDeadHeat: boolean;
  sdR: number;
}

/** 출주마 한 두의 오즈 관찰값(오즈 보정용). raw = den/(num+den), norm = raw ÷ 레이스 내 raw 합(오버라운드 제거) */
interface OddsRec {
  dec: number;
  raw: number;
  norm: number;
  won: boolean;
}

const recs: RaceRec[] = [];
const oddsRecs: OddsRec[] = [];
let preHorses = new Map<HorseId, Horse>();

/** 소수 오즈 구간 경계(이상이면 다음 구간). 구간 0 = 2 미만 */
const BIN_EDGES: readonly number[] = [2, 3, 5, 8, 11];
const BIN_LABELS: readonly string[] = ['2 미만', '2~3', '3~5', '5~8', '8~11', '11 이상'];
const BIN_MIN_N = 100;
const BIN_TOL = 0.05;

function binOf(dec: number): number {
  let i = 0;
  while (i < BIN_EDGES.length && dec >= (BIN_EDGES[i] ?? Infinity)) i++;
  return i;
}

interface BinRow {
  label: string;
  n: number;
  meanRaw: number;
  meanNorm: number;
  winRate: number;
  diffRaw: number;
  diffNorm: number;
}

function binRows(rs: readonly OddsRec[]): BinRow[] {
  return BIN_LABELS.map((label, b) => {
    const xs = rs.filter((r) => binOf(r.dec) === b);
    const winRate = share(xs.filter((r) => r.won).length, xs.length);
    const meanRaw = mean(xs.map((r) => r.raw));
    const meanNorm = mean(xs.map((r) => r.norm));
    return {
      label,
      n: xs.length,
      meanRaw,
      meanNorm,
      winRate,
      diffRaw: meanRaw - winRate,
      diffNorm: meanNorm - winRate,
    };
  });
}

function share(part: number, whole: number): number {
  return whole === 0 ? NaN : part / whole;
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid] ?? NaN;
  if (s.length % 2 === 1) return hi;
  return ((s[mid - 1] ?? NaN) + hi) / 2;
}

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

function beforeRun(state: GameState, meeting: Meeting): void {
  preHorses = new Map<HorseId, Horse>();
  for (const sr of meeting.races) {
    if (sr.status !== 'closed') continue;
    for (const d of sr.declarations) {
      const h = state.horses[d.horseId];
      if (h !== undefined && !preHorses.has(d.horseId)) preHorses.set(d.horseId, structuredClone(h));
    }
  }
}

function afterRun(state: GameState, meeting: Meeting, out: RunMeetingInPlaceOutput): void {
  const byRaceId = new Map<string, RaceResult>(out.results.map((r) => [r.raceId, r] as const));
  meeting.races.forEach((sr, ri) => {
    if (sr.status !== 'closed') return;
    const result = byRaceId.get(sr.race.id);
    const course = COURSE_BY_ID.get(sr.race.racecourseId);
    if (result === undefined || course === undefined) return;
    const simulated = out.meeting.races[ri]?.simulated ?? false;

    // 능력 강도 재계산(summary.ts·runRace.ts 와 같은 식). 입력은 레이스 전 사본
    const path = buildRacePath(course, sr.race.distance, sr.race.layoutId);
    const ctx: RaceContext = {
      distance: sr.race.distance,
      going: result.going,
      surface: path.surface,
      handedness: path.handedness,
      undulation: course.undulation,
      trackWidth: path.width,
    };
    const rs: { r: RaceResult['runners'][number]; h0: Horse }[] = [];
    const strengths: number[] = [];
    for (const r of result.runners) {
      const h0 = preHorses.get(r.horseId);
      const jockey = state.jockeys[r.jockeyId];
      if (h0 === undefined || jockey === undefined) continue;
      const input: RunnerInput = {
        entry: { weightLb: r.weightLb } as RaceEntry,
        horse: h0,
        jockey: { id: jockey.id, name: jockey.name, skill: jockey.skill },
      };
      strengths.push(estimateStrength(input, ctx));
      rs.push({ r, h0 });
    }
    if (strengths.length < 2) return;
    const rel = relativeStrengths(strengths);
    let topIdx = 0;
    rel.forEach((v, i) => {
      if (v > (rel[topIdx] ?? -Infinity)) topIdx = i;
    });

    // 인기 1위: 소수 오즈 오름차순, 동률은 마번 작은 말 (favouriteWon 과 같은 규칙)
    const priced: { i: number; dec: number; saddle: number; position: number }[] = [];
    rs.forEach((x, i) => {
      if (x.r.odds !== null) {
        priced.push({ i, dec: oddsToDecimal(x.r.odds), saddle: x.r.saddleCloth, position: x.r.position });
      }
    });
    priced.sort((a, b) => a.dec - b.dec || a.saddle - b.saddle);
    const fav = priced[0];
    const hasAllOdds = priced.length === rs.length;

    const positions = result.runners.map((r) => r.position);
    recs.push({
      simulated,
      field: rs.length,
      favWon: hasAllOdds && fav !== undefined ? fav.position === 1 : null,
      favDec: hasAllOdds && fav !== undefined ? fav.dec : null,
      topWon: rs[topIdx]?.r.position === 1,
      oddsFavIsTop: fav !== undefined && fav.i === topIdx,
      deadHeat: new Set(positions).size < positions.length,
      winnerDeadHeat: positions.filter((p) => p === 1).length > 1,
      sdR: stdev(rel),
    });

    const priced2 = result.runners.flatMap((r) => (r.odds === null ? [] : [{ odds: r.odds, won: r.position === 1 }]));
    const raws = priced2.map((x) => impliedProbability(x.odds));
    const rawSum = raws.reduce((a, b) => a + b, 0);
    priced2.forEach((x, i) => {
      const raw = raws[i] ?? 0;
      oddsRecs.push({ dec: oddsToDecimal(x.odds), raw, norm: rawSum > 0 ? raw / rawSum : 0, won: x.won });
    });
  });
}

function runSeasons(): void {
  const systems = createGameSystems(STATIC_GAME);
  let state = bootstrapGame({ seed: SEED, playerName: 'F2a Probe Owner', silks: { ...SILKS } }, BOOT_DATA);
  tap.run = { before: beforeRun, after: afterRun };
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    state = advanceWeek(state, systems).state;
  }
  tap.run = null;
}

interface Agg {
  races: number;
  favPriced: number;
  favRate: number;
  topRate: number;
  favMeanDec: number;
  deadRate: number;
  winnerDeadRate: number;
  sdMedian: number;
}

function agg(rs: readonly RaceRec[]): Agg {
  const priced = rs.filter((r) => r.favWon !== null);
  const favWins = priced.filter((r) => r.favWon === true).length;
  return {
    races: rs.length,
    favPriced: priced.length,
    favRate: priced.length === 0 ? NaN : favWins / priced.length,
    topRate: rs.length === 0 ? NaN : rs.filter((r) => r.topWon).length / rs.length,
    favMeanDec: mean(priced.map((r) => r.favDec ?? NaN)),
    deadRate: rs.length === 0 ? NaN : rs.filter((r) => r.deadHeat).length / rs.length,
    winnerDeadRate: rs.length === 0 ? NaN : rs.filter((r) => r.winnerDeadHeat).length / rs.length,
    sdMedian: median(rs.map((r) => r.sdR)),
  };
}

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : '-';
}

function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

describe('M3-F2a 승부 변동·오즈 오차 측정 (VERIFY=1 전용)', () => {
  it.skipIf(!process.env.VERIFY)(
    `시드 ${SEED}, ${SEASONS}시즌(${TOTAL_WEEKS}주) 측정`,
    () => {
      runSeasons();
      const sum = recs.filter((r) => !r.simulated);
      const sim = recs.filter((r) => r.simulated);
      const overall = agg(recs);
      const sumA = agg(sum);
      const simA = agg(sim);

      const overrides = {
        seed: SEED,
        summary: process.env.F2A_SUMMARY ?? null,
        form: process.env.F2A_FORM ?? null,
        market: process.env.F2A_MARKET ?? null,
        temperature: process.env.F2A_TEMP ?? null,
        deadHeatSeconds: process.env.F2A_DEAD ?? null,
      };
      say(`# M3-F2a 측정 (시드 ${SEED}, ${SEASONS}시즌) 손잡이 ${JSON.stringify(overrides)}`);
      say(`- 레이스 ${recs.length} (요약 ${sum.length}, 시뮬레이션 ${sim.length})`);
      for (const [label, a] of [
        ['전체', overall],
        ['요약', sumA],
        ['시뮬레이션', simA],
      ] as const) {
        say(
          `- ${label}: 인기1 ${pct(a.favRate)} (${a.favPriced}), 능력1 ${pct(a.topRate)}, 인기 평균 소수 오즈 ${a.favMeanDec.toFixed(3)}, 동착 레이스 ${pct(a.deadRate)}, 1착 동착 ${pct(a.winnerDeadRate)}, 능력 차 SD 중앙값 ${a.sdMedian.toFixed(3)}`,
        );
      }

      const bins = binRows(oddsRecs);
      const binsChecked = bins.filter((b) => b.n >= BIN_MIN_N);
      const binMaxAbsNorm = Math.max(...binsChecked.map((b) => Math.abs(b.diffNorm)));
      const binMaxAbsRaw = Math.max(...binsChecked.map((b) => Math.abs(b.diffRaw)));
      say('- 오즈 보정 (구간: 소수 오즈, 표본 100 이상만 판정. 내재 확률 = 오버라운드 제거값·원값)');
      for (const b of bins) {
        say(
          `  - ${b.label}: n ${b.n}, 내재(제거) ${pct(b.meanNorm)}, 내재(원값) ${pct(b.meanRaw)}, 실제 승률 ${pct(b.winRate)}, 차(제거) ${(b.diffNorm * 100).toFixed(2)}%p, 차(원값) ${(b.diffRaw * 100).toFixed(2)}%p`,
        );
      }
      say(`- 판정 구간 최대 |차|: 제거 ${(binMaxAbsNorm * 100).toFixed(2)}%p, 원값 ${(binMaxAbsRaw * 100).toFixed(2)}%p`);

      const outPath = process.env.F2A_OUT;
      if (outPath !== undefined && outPath !== '') {
        writeFileSync(
          outPath,
          `${JSON.stringify({ overrides, overall, summary: sumA, simulated: simA, races: recs.length, bins, binMaxAbsNorm, binMaxAbsRaw }, null, 2)}\n`,
          'utf8',
        );
      }

      expect(recs.length).toBeGreaterThan(0);
      expect(sum.length).toBeGreaterThan(0);
      expect(sim.length).toBeGreaterThan(0);

      // 목표 판정은 손잡이 재정의가 없는 실제 상수 실행에서만 한다
      if (!OVERRIDE_MODE) {
        // 목표 1: 전체 28~38%, 경로별 26~40% (1차 반려 결정)
        expect(overall.favRate).toBeGreaterThanOrEqual(0.28);
        expect(overall.favRate).toBeLessThanOrEqual(0.38);
        for (const a of [sumA, simA]) {
          expect(a.favRate).toBeGreaterThanOrEqual(0.26);
          expect(a.favRate).toBeLessThanOrEqual(0.4);
        }
        // 목표 2(능력 1위 38~52%, 두 경로 차 8%p 이내)는 M3-F2a 티켓에서 제외(이월). 원인은 필드 안 능력 분산이며
        // F2b·F2c 이후 F1 재측정에서 다시 본다. 수치는 위 출력에 계속 남긴다.
        // 목표 3: 인기 1위 평균 소수 오즈 2.2~3.2 + 오즈 보정(구간별 제거 내재 확률과 승률 차 5%p 이내, 표본 100 이상)
        expect(overall.favMeanDec).toBeGreaterThanOrEqual(2.2);
        expect(overall.favMeanDec).toBeLessThanOrEqual(3.2);
        expect(binsChecked.length).toBeGreaterThan(0);
        expect(binMaxAbsNorm).toBeLessThanOrEqual(BIN_TOL);
        // 목표 4: 1착 동착 비율 1.5% 이하 (1차 반려 결정: 동착 정의 = 1착 동착)
        expect(overall.winnerDeadRate).toBeLessThanOrEqual(0.015);
      }
    },
    1_800_000,
  );
});
