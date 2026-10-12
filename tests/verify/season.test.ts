import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import g1ExtraJson from '../../data/calendar/g1_extra.json';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
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
import { normalizeName } from '../../src/engine/naming/validate';
import { oddsToDecimal } from '../../src/engine/race/odds';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import type { RunMeetingInPlaceOutput } from '../../src/engine/season/raceday';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type {
  GameEvent,
  GameState,
  Horse,
  LaurelCategory,
  RaceGrade,
  RaceKind,
  RaceResult,
  SeasonAwards,
  SeriesDefinition,
} from '../../src/engine/types';

/**
 * M3-F1 시즌 자동 진행 검증.
 * 기본 모드: 시드 20261011, 1시즌(52주 + 연도 전환 1주 = 53주). 단언은 느슨한 범위만.
 * FULL 모드(VERIFY=1): 시드 3개 × 5시즌(시드마다 261주 연속 진행), 지표 집계 후 리포트 작성.
 * 엔진은 고치지 않는다. 레이스 결과는 runMeetingInPlace 의 반환값을 관찰만 한다(상태 변경 없음).
 */

/** 지표 출력. console.log 는 기본 리포터에서 숨겨지므로 stdout 에 직접 쓴다. */
function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/** 레이스 결과 관찰 훅. vi.mock 으로 감싼 runMeetingInPlace 가 여기로 넘긴다. */
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

const FULL = !!process.env.VERIFY;
const BASE_SEED = 20261011;
const FULL_SEEDS: readonly number[] = [20261011, 7, 424242];
const SEASONS = FULL ? 5 : 1;
/** 시즌 n개 = 52주씩 n개 + 마지막 연도 전환 1주 (시상은 그 1주에서 확정된다) */
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS + 1;
const REPRO_WEEKS = WEEKS_PER_YEAR + 1;
const REPRO_SAVE_WEEK = 26;
const TEST_TIMEOUT_MS = FULL ? 7_200_000 : 600_000;
const REPORT_PATH = fileURLToPath(new URL('../../docs/reports/2026-10-12-m3-season.md', import.meta.url));
const SAVED_AT = '2026-10-12T00:00:00.000Z';

/** 명세 기준 (리포트 판정용) */
const FAV_TARGET_MIN = 0.25;
const FAV_TARGET_MAX = 0.35;
/** 기본 모드 단언 범위(느슨) */
const FAV_LOOSE_MIN = 0.1;
const FAV_LOOSE_MAX = 0.6;
const G1_MEAN_FIELD_MIN = 8;
const SHORT_FIELD_SIZE = 5;
const SHORT_FIELD_MAX_SHARE = 0.05;
const LOOSE_MEAN_FIELD_MIN = 5;
const DEAD_HEAT_MAX_SHARE = 0.015;
const OR_BEST_MIN = 124;
const OR_BEST_MAX = 132;
const OR_HIGH = 135;
const OR_HIGH_MAX_PER_SEASON = 1;
const OR_DRIFT_MAX = 3;
const OR_DRIFT_MIN_AGE = 4;
const OLD_AGE = 7;
const OLD_MAX_SHARE = 0.08;
const WEEK_MEDIAN_MAX_MS = 400;
const SEASON_MAX_MS = 30_000;
const TOP_OR_N = 10;
const TOP_OWNER_N = 10;
const AGE_BUCKET_MAX = 8;
const QUANTILES: readonly number[] = [0.25, 0.5, 0.75, 0.95];

const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const G1_EXTRA_IDS = new Set((g1ExtraJson as { id: string }[]).map((r) => r.id));

const COURSES = getRacecourses();
const COURSE_COUNTRY = new Map(COURSES.map((c) => [c.id, c.country] as const));
const SERIES_DEFS: SeriesDefinition[] = getSeriesDefinitions();

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: getRaceTemplates(),
  series: SERIES_DEFS,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: getRaceTemplates(),
  series: SERIES_DEFS,
};

/* ------------------------------------------------------------------ */
/* 집계 타입                                                           */
/* ------------------------------------------------------------------ */

type ClassKey = 'G1' | 'G2' | 'G3' | 'L' | '핸디캡' | '메이든' | '기타';
const CLASS_KEYS: readonly ClassKey[] = ['G1', 'G2', 'G3', 'L', '핸디캡', '메이든', '기타'];

function classOf(grade: RaceGrade | null, kind: RaceKind): ClassKey {
  if (grade !== null) return grade;
  if (kind === 'handicap') return '핸디캡';
  if (kind === 'maiden') return '메이든';
  return '기타';
}

interface RaceObs {
  seed: number;
  year: number;
  raceId: string;
  templateId: string | null;
  name: string;
  cls: ClassKey;
  country: string;
  field: number;
  /** 인기 1위(오즈 최저, 동률은 마번 작은 말)가 1착(동착 포함)했는가. 오즈를 못 구하면 null */
  favWon: boolean | null;
  deadHeat: boolean;
}

interface RatedRow {
  id: string;
  name: string;
  age: number;
  or: number;
}

interface SeasonSnap {
  seed: number;
  year: number;
  /** 현역(in_training·resting) 두수 */
  racing: number;
  /** in_training 말의 나이 목록 */
  trainingAges: number[];
  /** OR 보유 현역 말 (OR 내림차순) */
  rated: RatedRow[];
  /** 나이 버킷(8 = 8세 이상) → OR 목록 */
  orByAge: Map<number, number[]>;
  /** 4세 이상 현역 평균 OR (해당 없으면 NaN) */
  meanOrFour: number;
  /** 시즌 종료 시 모든 말 이름 정규화 중복 수 */
  nameDup: number;
  aiFunds: number[];
  playerFunds: number;
  /** 포인트형 시리즈별 최고 득점과 득점 1위 말 이름 */
  pointsLeaders: { seriesId: string; top: number; leader: string | null }[];
}

interface WeekRec {
  year: number;
  week: number;
  ms: number;
}

interface RunResult {
  seed: number;
  bootMs: number;
  weeks: WeekRec[];
  races: RaceObs[];
  /** 개최 레이스 중 run 상태가 아닌 것(상태별 개수) */
  notRun: Map<string, number>;
  /** run 상태인데 결과가 없는 레이스(무결성 위반) */
  missingResult: number;
  /** 연도별 은퇴 두수 */
  retired: Map<number, number>;
  seriesDone: { seriesId: string; year: number; horseId: string }[];
  snaps: SeasonSnap[];
  finalState: GameState;
  checkpointJson: string | null;
}

/* ------------------------------------------------------------------ */
/* 실행                                                                */
/* ------------------------------------------------------------------ */

function isRacing(h: Horse): boolean {
  return h.status === 'in_training' || h.status === 'resting';
}

function compareId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function nameDuplicates(state: GameState): number {
  const seen = new Map<string, number>();
  for (const h of Object.values(state.horses)) {
    const key = normalizeName(h.name);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let dup = 0;
  for (const count of seen.values()) {
    if (count > 1) dup += count - 1;
  }
  return dup;
}

function snapshot(state: GameState, seed: number, year: number): SeasonSnap {
  const trainingAges: number[] = [];
  const rated: RatedRow[] = [];
  const orByAge = new Map<number, number[]>();
  let racing = 0;
  let sumFour = 0;
  let nFour = 0;
  for (const h of Object.values(state.horses)) {
    if (!isRacing(h)) continue;
    racing++;
    const age = ageInYear(h.birthYear, year);
    if (h.status === 'in_training') trainingAges.push(age);
    if (h.officialRating === null) continue;
    const or = h.officialRating;
    rated.push({ id: h.id, name: h.name, age, or });
    const bucket = Math.min(age, AGE_BUCKET_MAX);
    const list = orByAge.get(bucket) ?? [];
    list.push(or);
    orByAge.set(bucket, list);
    if (age >= OR_DRIFT_MIN_AGE) {
      sumFour += or;
      nFour++;
    }
  }
  rated.sort((a, b) => b.or - a.or || compareId(a.id, b.id));

  const aiFunds: number[] = [];
  for (const owner of Object.values(state.owners)) {
    if (!owner.isPlayer) aiFunds.push(owner.funds);
  }
  const pointsLeaders: SeasonSnap['pointsLeaders'] = [];
  for (const def of SERIES_DEFS) {
    if (def.kind !== 'points') continue;
    const progress = state.seasonState.series[def.id];
    const entries = Object.entries(progress?.points ?? {}).sort((a, b) => b[1] - a[1] || compareId(a[0], b[0]));
    const first = entries[0];
    pointsLeaders.push({
      seriesId: def.id,
      top: first?.[1] ?? 0,
      leader: first === undefined ? null : (state.horses[first[0]]?.name ?? null),
    });
  }

  return {
    seed,
    year,
    racing,
    trainingAges,
    rated,
    orByAge,
    meanOrFour: nFour === 0 ? NaN : sumFour / nFour,
    nameDup: nameDuplicates(state),
    aiFunds,
    playerFunds: state.owners[state.playerOwnerId]?.funds ?? 0,
    pointsLeaders,
  };
}

/** 이번 주 실행된 개최 하나를 레이스 관찰값으로 바꾼다. state 는 건드리지 않는다. */
function collectMeeting(run: RunResult, out: RunMeetingInPlaceOutput): void {
  const byId = new Map<string, RaceResult>();
  for (const r of out.results) byId.set(r.raceId, r);
  const year = out.meeting.date.year;
  for (const sr of out.meeting.races) {
    if (sr.status !== 'run') {
      run.notRun.set(sr.status, (run.notRun.get(sr.status) ?? 0) + 1);
      continue;
    }
    const result = byId.get(sr.race.id);
    if (result === undefined) {
      run.missingResult++;
      continue;
    }
    run.races.push({
      seed: run.seed,
      year,
      raceId: sr.race.id,
      templateId: sr.templateId,
      name: sr.race.name,
      cls: classOf(sr.race.grade, sr.race.kind),
      country: COURSE_COUNTRY.get(result.racecourseId) ?? 'unknown',
      field: result.runners.length,
      favWon: favouriteWon(result),
      deadHeat: result.runners.filter((r) => r.position === 1).length >= 2,
    });
  }
}

/** 인기 1위: 소수 오즈 오름차순, 동률은 마번 작은 말. 오즈가 하나라도 없으면 null */
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

/**
 * 시드 하나로 weeks 주 진행한다. observe 가 true 면 레이스·스냅샷을 모은다(상태는 같다).
 * checkpoint 주차 시점의 상태를 serializeGame 문자열로 남긴다.
 */
function simulate(seed: number, weeks: number, observe: boolean, checkpoint: number | null): RunResult {
  const systems = createGameSystems(STATIC_GAME);
  const t0 = performance.now();
  let state = bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  const bootMs = performance.now() - t0;

  const run: RunResult = {
    seed,
    bootMs,
    weeks: [],
    races: [],
    notRun: new Map(),
    missingResult: 0,
    retired: new Map(),
    seriesDone: [],
    snaps: [],
    finalState: state,
    checkpointJson: null,
  };

  for (let w = 1; w <= weeks; w++) {
    const meetings: RunMeetingInPlaceOutput[] = [];
    hook.onMeeting = observe ? (out) => meetings.push(out) : null;
    const processed = { year: state.date.year, week: state.date.week };
    const t = performance.now();
    const res = advanceWeek(state, systems);
    const ms = performance.now() - t;
    hook.onMeeting = null;
    state = res.state;
    run.weeks.push({ year: processed.year, week: processed.week, ms });

    for (const ev of res.events) collectEvent(run, ev);
    for (const out of meetings) collectMeeting(run, out);
    if (observe && w % WEEKS_PER_YEAR === 0) {
      run.snaps.push(snapshot(state, seed, START_YEAR + w / WEEKS_PER_YEAR - 1));
    }
    if (checkpoint === w) run.checkpointJson = serializeGame(state, SAVED_AT);
  }
  run.finalState = state;
  return run;
}

function collectEvent(run: RunResult, ev: GameEvent): void {
  if (ev.type === 'horse_status_changed' && ev.to === 'retired') {
    run.retired.set(ev.date.year, (run.retired.get(ev.date.year) ?? 0) + 1);
  }
  if (ev.type === 'series_completed') {
    run.seriesDone.push({ seriesId: ev.seriesId, year: ev.date.year, horseId: ev.horseId });
  }
}

function playOn(state: GameState, weeks: number): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  for (let i = 0; i < weeks; i++) {
    current = advanceWeek(current, systems).state;
  }
  return current;
}

/* ------------------------------------------------------------------ */
/* 통계 보조                                                           */
/* ------------------------------------------------------------------ */

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const lo = s[mid - 1] ?? NaN;
  const hi = s[mid] ?? NaN;
  return s.length % 2 === 1 ? hi : (lo + hi) / 2;
}

/** 선형 보간 분위수. sorted 는 오름차순 */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? NaN;
  const b = sorted[hi] ?? NaN;
  return a + (b - a) * (pos - lo);
}

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '-';
}

function num(x: number, digits = 1): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '-';
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? NaN : part / whole;
}

/* ------------------------------------------------------------------ */
/* 지표 집계와 리포트                                                  */
/* ------------------------------------------------------------------ */

interface Deviation {
  metric: string;
  measured: string;
  target: string;
  verdict: string;
}

interface Metrics {
  runs: RunResult[];
  races: RaceObs[];
  deviations: Deviation[];
  lines: string[];
  favAll: number;
  g1Mean: number;
  allMean: number;
  deadAll: number;
  weekMedianMs: number;
}

function ownerEarnings(state: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of Object.values(state.horses)) {
    if (h.ownerId === null) continue;
    m.set(h.ownerId, (m.get(h.ownerId) ?? 0) + h.record.earnings);
  }
  return m;
}

function quantileRows(snaps: SeasonSnap[]): string[] {
  const rows: string[] = [];
  const buckets = [2, 3, 4, 5, 6, 7, AGE_BUCKET_MAX];
  rows.push('| 나이 | 표본(두) | 25% | 50% | 75% | 95% |');
  rows.push('| --- | --- | --- | --- | --- | --- |');
  for (const b of buckets) {
    const all: number[] = [];
    for (const s of snaps) all.push(...(s.orByAge.get(b) ?? []));
    all.sort((x, y) => x - y);
    const label = b === AGE_BUCKET_MAX ? `${b}세 이상` : `${b}세`;
    rows.push(`| ${label} | ${all.length} | ${QUANTILES.map((q) => num(quantile(all, q), 0)).join(' | ')} |`);
  }
  return rows;
}

function aggregate(runs: RunResult[]): Metrics {
  const races = runs.flatMap((r) => r.races);
  const deviations: Deviation[] = [];
  const lines: string[] = [];

  // 1. 출주 두수
  const allFields = races.map((r) => r.field);
  const allMean = mean(allFields);
  const shortShare = ratio(allFields.filter((f) => f < SHORT_FIELD_SIZE).length, races.length);
  const g1 = races.filter((r) => r.cls === 'G1');
  const g1Mean = mean(g1.map((r) => r.field));

  // 2. 인기 1위 승률 (오즈 있는 레이스만)
  const priced = races.filter((r) => r.favWon !== null);
  const favAll = ratio(priced.filter((r) => r.favWon === true).length, priced.length);
  const g1Priced = g1.filter((r) => r.favWon !== null);
  const favG1 = ratio(g1Priced.filter((r) => r.favWon === true).length, g1Priced.length);

  // 3. 동착
  const deadAll = ratio(races.filter((r) => r.deadHeat).length, races.length);

  // 4. 주당 진행 시간
  const weekMs = runs.flatMap((r) => r.weeks.map((w) => w.ms));
  const weekMedianMs = median(weekMs);

  // OR·연령·상금·시리즈·시상·이름
  const snaps = runs.flatMap((r) => r.snaps);
  const finalState = runs.map((r) => r.finalState);

  if (!(favAll >= FAV_TARGET_MIN && favAll <= FAV_TARGET_MAX)) {
    deviations.push({
      metric: '인기 1위 승률(전체)',
      measured: pct(favAll),
      target: `${pct(FAV_TARGET_MIN)}~${pct(FAV_TARGET_MAX)}`,
      verdict: favAll > FAV_TARGET_MAX ? '초과(인기 쏠림)' : '미달(인기 무력)',
    });
  }
  if (!(favG1 >= FAV_TARGET_MIN && favG1 <= FAV_TARGET_MAX)) {
    deviations.push({
      metric: '인기 1위 승률(G1)',
      measured: pct(favG1),
      target: `${pct(FAV_TARGET_MIN)}~${pct(FAV_TARGET_MAX)}`,
      verdict: favG1 > FAV_TARGET_MAX ? '초과(인기 쏠림)' : '미달(인기 무력)',
    });
  }
  if (!(g1Mean >= G1_MEAN_FIELD_MIN)) {
    deviations.push({ metric: 'G1 평균 두수', measured: num(g1Mean), target: `≥ ${G1_MEAN_FIELD_MIN}`, verdict: '미달' });
  }
  if (!(shortShare <= SHORT_FIELD_MAX_SHARE)) {
    deviations.push({
      metric: `${SHORT_FIELD_SIZE}두 미만 레이스 비율`,
      measured: pct(shortShare),
      target: `≤ ${pct(SHORT_FIELD_MAX_SHARE)}`,
      verdict: '초과',
    });
  }
  if (!(deadAll <= DEAD_HEAT_MAX_SHARE)) {
    deviations.push({
      metric: '1착 동착 비율(전체)',
      measured: pct(deadAll),
      target: `≤ ${pct(DEAD_HEAT_MAX_SHARE)}`,
      verdict: '초과',
    });
  }
  for (const r of runs) {
    for (const s of r.snaps) {
      if (!(s.rated.length > 0)) continue;
      const best = s.rated[0]?.or ?? NaN;
      if (!(best >= OR_BEST_MIN && best <= OR_BEST_MAX)) {
        deviations.push({
          metric: `그해 최고 OR (시드 ${r.seed}, ${s.year})`,
          measured: num(best, 0),
          target: `${OR_BEST_MIN}~${OR_BEST_MAX}`,
          verdict: best > OR_BEST_MAX ? '초과' : '미달',
        });
      }
      const high = s.rated.filter((x) => x.or >= OR_HIGH).length;
      if (high > OR_HIGH_MAX_PER_SEASON) {
        deviations.push({
          metric: `${OR_HIGH} 이상 두수 (시드 ${r.seed}, ${s.year})`,
          measured: `${high}두`,
          target: `시즌당 ≤ ${OR_HIGH_MAX_PER_SEASON}두`,
          verdict: '초과(드물지 않음)',
        });
      }
    }
    const fourSeries = r.snaps.map((s) => s.meanOrFour).filter((x) => Number.isFinite(x));
    for (let i = 1; i < fourSeries.length; i++) {
      const drift = (fourSeries[i] ?? NaN) - (fourSeries[i - 1] ?? NaN);
      if (Math.abs(drift) > OR_DRIFT_MAX) {
        deviations.push({
          metric: `4세 이상 평균 OR 시즌 간 변화 (시드 ${r.seed}, 시즌 ${i} → ${i + 1})`,
          measured: num(drift),
          target: `±${OR_DRIFT_MAX} 이내`,
          verdict: '드리프트',
        });
      }
    }
  }
  for (const r of runs) {
    for (const s of r.snaps) {
      const share = ratio(s.trainingAges.filter((a) => a >= OLD_AGE).length, s.trainingAges.length);
      if (!(share <= OLD_MAX_SHARE)) {
        deviations.push({
          metric: `${OLD_AGE}세 이상 비율(in_training, 시드 ${r.seed}, ${s.year} 시즌 종료)`,
          measured: pct(share),
          target: `≤ ${pct(OLD_MAX_SHARE)}`,
          verdict: '초과',
        });
      }
    }
  }
  const trainingAll = snaps.flatMap((s) => s.trainingAges);
  const oldShare = ratio(trainingAll.filter((a) => a >= OLD_AGE).length, trainingAll.length);
  if (!(oldShare <= OLD_MAX_SHARE)) {
    deviations.push({
      metric: `${OLD_AGE}세 이상 비율(in_training, 시즌 종료 시)`,
      measured: pct(oldShare),
      target: `≤ ${pct(OLD_MAX_SHARE)}`,
      verdict: '초과',
    });
  }
  const nameDup = Math.max(0, ...snaps.map((s) => s.nameDup), ...finalState.map((s) => nameDuplicates(s)));
  if (nameDup !== 0) {
    deviations.push({ metric: '말 이름 정규화 중복', measured: String(nameDup), target: '0', verdict: '위반' });
  }

  lines.push(`- 집계 레이스 ${races.length}, 인기 1위 승률(전체) ${pct(favAll)}, G1 ${pct(favG1)}, 전체 평균 두수 ${num(allMean)}`);
  lines.push(`- 주당 진행 중앙값 ${num(weekMedianMs, 1)} ms`);

  return {
    runs,
    races,
    deviations,
    lines,
    favAll,
    g1Mean,
    allMean,
    deadAll,
    weekMedianMs,
  };
}

function renderReport(m: Metrics, seeds: readonly number[]): string {
  const { runs, races } = m;
  const L: string[] = [];
  const snapsAll = runs.flatMap((r) => r.snaps);
  const yearsOf = (r: RunResult): number[] => r.snaps.map((s) => s.year);

  L.push('# M3-F1 시즌 자동 진행 검증 (2026-10-12)');
  L.push('');
  L.push('자동 생성: `tests/verify/season.test.ts` (`VERIFY=1 npx vitest run tests/verify/season.test.ts`).');
  L.push('');
  L.push('## 기준 이탈 (맨 위)');
  L.push('');
  if (m.deviations.length === 0) {
    L.push('없음');
  } else {
    L.push('| 지표 | 측정값 | 기준 | 판정 |');
    L.push('| --- | --- | --- | --- |');
    for (const d of m.deviations) L.push(`| ${d.metric} | ${d.measured} | ${d.target} | ${d.verdict} |`);
  }
  L.push('');
  L.push(
    `판정 주의: 기준은 명세 M3-F1 값이다. 같은 시드 재현성이 깨지거나 레이스가 완주하지 못하면 테스트 단언이 먼저 실패한다(이 리포트에는 적지 않는다).`,
  );
  L.push('');

  L.push('## 실행 조건');
  L.push('');
  L.push('| 항목 | 값 |');
  L.push('| --- | --- |');
  L.push(`| 모드 | FULL (VERIFY=1) |`);
  L.push(`| 시드 | ${seeds.join(', ')} |`);
  L.push(`| 시즌 수 | ${SEASONS} (시드마다 ${TOTAL_WEEKS}주 연속 진행: 52주 × ${SEASONS} + 연도 전환 1주) |`);
  L.push('| 플레이어 | 아무것도 하지 않음 (AI 만) |');
  L.push(`| 집계 레이스 | ${races.length} (run 상태, 결과 있음) |`);
  const notRunByStatus = new Map<string, number>();
  for (const r of runs) {
    for (const [st, c] of r.notRun) notRunByStatus.set(st, (notRunByStatus.get(st) ?? 0) + c);
  }
  const notRunText = [...notRunByStatus.entries()].map(([st, c]) => `${st} ${c}`).join(', ') || '없음';
  L.push(`| run 이 아닌 개최 레이스 (상태별) | ${notRunText} |`);
  L.push(`| 결과 누락(무결성) | ${runs.reduce((a, r) => a + r.missingResult, 0)} |`);
  L.push('| 관찰 방식 | runMeetingInPlace 반환값을 vi.mock 으로 관찰 (상태 변경 없음). 레이스 결과는 시즌 종료 후 raceResults 에 남지 않으므로 이 방식만 쓸 수 있다 |');
  L.push('| 현역 정의 | status 가 in_training 또는 resting. OR·연령 지표는 이 집합에서 잰다 |');
  L.push('');

  L.push('## 1. 재현성');
  L.push('');
  L.push('| 검사 | 결과 |');
  L.push('| --- | --- |');
  L.push(`| 같은 시드 ${REPRO_WEEKS}주 두 번 → serializeGame 문자열 동일 | 단언 통과 (테스트 항목 1) |`);
  L.push(`| ${REPRO_SAVE_WEEK}주 저장 → 불러오기 → 계속 진행 = 연속 진행 | 단언 통과 (테스트 항목 1) |`);
  L.push(`| 관찰 실행 ${REPRO_WEEKS}주 = 무관찰 실행 ${REPRO_WEEKS}주 | 단언 통과 (테스트 항목 1) |`);
  L.push('');

  L.push('## 2. 성능');
  L.push('');
  L.push('| 시드 | bootstrapGame (ms) | 주당 중앙값 (ms) | 주당 최대 (ms) | 1시즌 52주 합 (ms) | 연도 전환 주 (ms) |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of runs) {
    const ms = r.weeks.map((w) => w.ms);
    const seasonMs = r.weeks.filter((w) => w.year === START_YEAR).reduce((a, w) => a + w.ms, 0);
    const transition = r.weeks.filter((w) => w.year !== START_YEAR && w.week === 1).reduce((a, w) => a + w.ms, 0);
    L.push(`| ${r.seed} | ${num(r.bootMs, 0)} | ${num(median(ms), 1)} | ${num(Math.max(...ms), 1)} | ${num(seasonMs, 0)} | ${num(transition, 0)} |`);
  }
  L.push('');
  L.push(`전체 주당 중앙값 ${num(m.weekMedianMs, 1)} ms (기준 ≤ ${WEEK_MEDIAN_MAX_MS} ms). 1시즌 기준 ${SEASON_MAX_MS / 1000}s 는 리포트 판정만 한다.`);
  L.push('');

  L.push('## 3. 출주 두수');
  L.push('');
  L.push('| 등급 | 레이스 수 | 평균 두수 | 최소 두수 | 5두 미만 비율 |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const key of CLASS_KEYS) {
    const rs = races.filter((r) => r.cls === key);
    const fields = rs.map((r) => r.field);
    L.push(
      `| ${key} | ${rs.length} | ${num(mean(fields))} | ${fields.length === 0 ? '-' : Math.min(...fields)} | ${pct(ratio(fields.filter((f) => f < SHORT_FIELD_SIZE).length, rs.length))} |`,
    );
  }
  L.push(`| 전체 | ${races.length} | ${num(mean(races.map((r) => r.field)))} | ${Math.min(...races.map((r) => r.field))} | ${pct(ratio(races.filter((r) => r.field < SHORT_FIELD_SIZE).length, races.length))} |`);
  L.push('');
  L.push('### 3-2. 나라별 G1 평균 두수');
  L.push('');
  L.push('| 나라 | G1 레이스 수 | 평균 두수 |');
  L.push('| --- | --- | --- |');
  const countries = [...new Set(races.filter((r) => r.cls === 'G1').map((r) => r.country))].sort();
  for (const c of countries) {
    const rs = races.filter((r) => r.cls === 'G1' && r.country === c);
    L.push(`| ${c} | ${rs.length} | ${num(mean(rs.map((r) => r.field)))} |`);
  }
  L.push('');
  L.push('### 3-3. g1_extra.json 24개 레이스별 두수');
  L.push('');
  L.push('| 템플릿 id | 이름 | 개최 횟수 | 평균 두수 | 최소 | 최대 |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const id of [...G1_EXTRA_IDS].sort(compareId)) {
    const rs = races.filter((r) => r.templateId === id);
    const fields = rs.map((r) => r.field);
    const name = rs[0]?.name ?? '(개최 없음)';
    L.push(
      `| ${id} | ${name} | ${rs.length} | ${num(mean(fields))} | ${fields.length === 0 ? '-' : Math.min(...fields)} | ${fields.length === 0 ? '-' : Math.max(...fields)} |`,
    );
  }
  L.push('');

  L.push('## 4. 인기 1위 승률과 동착');
  L.push('');
  L.push('| 구분 | 집계 | 인기 1위 승 | 승률 | 목표 |');
  L.push('| --- | --- | --- | --- | --- |');
  const favRow = (label: string, rs: RaceObs[]): string => {
    const p = rs.filter((r) => r.favWon !== null);
    const w = p.filter((r) => r.favWon === true).length;
    return `| ${label} | ${p.length} | ${w} | ${pct(ratio(w, p.length))} | ${pct(FAV_TARGET_MIN)}~${pct(FAV_TARGET_MAX)} |`;
  };
  L.push(favRow('전체', races));
  L.push(favRow('G1', races.filter((r) => r.cls === 'G1')));
  for (const seed of seeds) L.push(favRow(`전체 (시드 ${seed})`, races.filter((r) => r.seed === seed)));
  L.push('');
  L.push('| 구분 | 레이스 수 | 1착 동착 | 비율 | 기준 |');
  L.push('| --- | --- | --- | --- | --- |');
  L.push(
    `| 전체 | ${races.length} | ${races.filter((r) => r.deadHeat).length} | ${pct(m.deadAll)} | ≤ ${pct(DEAD_HEAT_MAX_SHARE)} |`,
  );
  L.push(
    `| G1 | ${races.filter((r) => r.cls === 'G1').length} | ${races.filter((r) => r.cls === 'G1' && r.deadHeat).length} | ${pct(ratio(races.filter((r) => r.cls === 'G1' && r.deadHeat).length, races.filter((r) => r.cls === 'G1').length))} | 참고 |`,
  );
  L.push('');

  L.push('## 5. OR 분포');
  L.push('');
  L.push('| 시드 | 시즌 | 현역 OR 보유 두수 | 그해 최고 OR | 135 이상 두수 | 4세 이상 평균 OR |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of snapsAll) {
    L.push(
      `| ${s.seed} | ${s.year} | ${s.rated.length} | ${num(s.rated[0]?.or ?? NaN, 0)} | ${s.rated.filter((x) => x.or >= OR_HIGH).length} | ${num(s.meanOrFour)} |`,
    );
  }
  L.push('');
  L.push('### 5-2. 시즌 종료 시 OR 상위 10두 (시드별 마지막 시즌)');
  L.push('');
  L.push('| 시드 | 순위 | 말 | 연령 | OR |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const r of runs) {
    const last = r.snaps[r.snaps.length - 1];
    if (last === undefined) continue;
    last.rated.slice(0, TOP_OR_N).forEach((h, i) => {
      L.push(`| ${r.seed} | ${i + 1} | ${h.name} | ${h.age} | ${h.or} |`);
    });
  }
  L.push('');
  L.push('### 5-3. 연령별 OR 분위수 (시즌 종료 스냅샷 전체 풀링)');
  L.push('');
  for (const row of quantileRows(snapsAll)) L.push(row);
  L.push('');
  L.push('### 5-4. 4세 이상 평균 OR 추이 (드리프트)');
  L.push('');
  L.push('| 시드 | 시즌 연도 | 4세 이상 평균 OR | 직전 시즌과 차이 |');
  L.push('| --- | --- | --- | --- |');
  for (const r of runs) {
    let prev = NaN;
    for (const s of r.snaps) {
      const diff = Number.isFinite(prev) && Number.isFinite(s.meanOrFour) ? s.meanOrFour - prev : NaN;
      L.push(`| ${r.seed} | ${s.year} | ${num(s.meanOrFour)} | ${num(diff)} |`);
      prev = s.meanOrFour;
    }
  }
  L.push('');

  L.push('## 6. 연령 분포와 은퇴');
  L.push('');
  L.push('| 연령 | in_training 두수 | 비율 |');
  L.push('| --- | --- | --- |');
  const trainingAll = snapsAll.flatMap((s) => s.trainingAges);
  for (let age = 2; age <= AGE_BUCKET_MAX; age++) {
    const c = trainingAll.filter((a) => (age === AGE_BUCKET_MAX ? a >= AGE_BUCKET_MAX : a === age)).length;
    L.push(`| ${age === AGE_BUCKET_MAX ? `${age}세 이상` : `${age}세`} | ${c} | ${pct(ratio(c, trainingAll.length))} |`);
  }
  L.push('');
  L.push(`7세 이상 비율 (풀링): ${pct(ratio(trainingAll.filter((a) => a >= OLD_AGE).length, trainingAll.length))} (기준 ≤ ${pct(OLD_MAX_SHARE)})`);
  L.push('');
  L.push('| 시드 | 연도 | 7세 이상 비율 | 은퇴 두수(해당 연도 이벤트) |');
  L.push('| --- | --- | --- | --- |');
  for (const r of runs) {
    for (const s of r.snaps) {
      const ages = s.trainingAges;
      L.push(
        `| ${r.seed} | ${s.year} | ${pct(ratio(ages.filter((a) => a >= OLD_AGE).length, ages.length))} | ${r.retired.get(s.year) ?? 0} |`,
      );
    }
  }
  L.push('');

  L.push('## 7. 상금과 자금');
  L.push('');
  for (const r of runs) {
    const earnings = ownerEarnings(r.finalState);
    const owners = r.finalState.owners;
    const rows = [...earnings.entries()]
      .filter(([id]) => owners[id] !== undefined)
      .sort((a, b) => b[1] - a[1] || compareId(a[0], b[0]))
      .slice(0, TOP_OWNER_N);
    const total = [...earnings.values()].reduce((a, b) => a + b, 0);
    const ae = [...earnings.entries()]
      .filter(([id]) => owners[id]?.country === 'AE')
      .reduce((a, [, v]) => a + v, 0);
    const playerEarn = earnings.get(r.finalState.playerOwnerId) ?? 0;
    L.push(`### 7-${runs.indexOf(r) + 1}. 시드 ${r.seed}`);
    L.push('');
    L.push('| 순위 | 마주 | 국적 | tier | 누적 상금(€, 보유마 기록 합) |');
    L.push('| --- | --- | --- | --- | --- |');
    rows.forEach(([id, v], i) => {
      const o = owners[id];
      L.push(`| ${i + 1} | ${o?.name ?? id} | ${o?.country ?? '-'} | ${o?.tier ?? '-'} | ${Math.round(v)} |`);
    });
    L.push('');
    L.push(`- AE 마주 상금 합계 비율: ${pct(ratio(ae, total))}`);
    L.push(`- 플레이어 누적 상금: ${Math.round(playerEarn)} € (플레이어는 출주하지 않음)`);
    L.push('');
    L.push('| 연도 | AI 자금 합계(€) | AI 자금 중앙값(€) | 플레이어 자금(€) |');
    L.push('| --- | --- | --- | --- |');
    for (const s of r.snaps) {
      L.push(`| ${s.year} | ${Math.round(s.aiFunds.reduce((a, b) => a + b, 0))} | ${Math.round(median(s.aiFunds))} | ${Math.round(s.playerFunds)} |`);
    }
    L.push('');
  }

  L.push('## 8. 시리즈 달성');
  L.push('');
  L.push(`| 시리즈 | 종류 | 달성 합계 (${runs.length}시드 × ${SEASONS}시즌) | 시즌당 평균 | 포인트형 1위 점수(최고) |`);
  L.push('| --- | --- | --- | --- | --- |');
  for (const def of SERIES_DEFS) {
    const total = runs.reduce((a, r) => a + r.seriesDone.filter((d) => d.seriesId === def.id).length, 0);
    const topScores = runs.flatMap((r) => r.snaps.flatMap((s) => s.pointsLeaders.filter((p) => p.seriesId === def.id).map((p) => p.top)));
    const top = def.kind === 'points' ? num(Math.max(...topScores, 0), 0) : '-';
    L.push(`| ${def.id} | ${def.kind} | ${total} | ${num(total / (runs.length * SEASONS), 2)} | ${top} |`);
  }
  L.push('');

  L.push('## 9. 시상 (awardsHistory)');
  L.push('');
  L.push('| 시드 | 시상 건수 | 부문 수상마 있는 부문(8) | 최우수 레이스 |');
  L.push('| --- | --- | --- | --- |');
  for (const r of runs) {
    const aw: SeasonAwards[] = r.finalState.awardsHistory;
    const laurelCount = aw.map((a) => Object.values(a.laurel as Record<LaurelCategory, string | null>).filter((x) => x !== null).length);
    const bestNames = aw.map((a) => a.bestRace?.name ?? '-');
    L.push(`| ${r.seed} | ${aw.length} | ${laurelCount.join(', ') || '-'} | ${bestNames.join(', ') || '-'} |`);
  }
  L.push('');

  L.push('## 10. 이름 중복');
  L.push('');
  L.push('| 시드 | 시즌 종료 시 정규화 중복 최대 | 최종 상태 중복 |');
  L.push('| --- | --- | --- |');
  for (const r of runs) {
    const dup = Math.max(0, ...r.snaps.map((s) => s.nameDup));
    L.push(`| ${r.seed} | ${dup} | ${nameDuplicates(r.finalState)} |`);
  }
  L.push('');

  L.push('## 참고: 집계 범위');
  L.push('');
  L.push(`- 시즌 스냅샷 연도: ${runs.map((r) => `시드 ${r.seed}: ${yearsOf(r).join(', ')}`).join(' / ')}`);
  L.push('- 시즌 종료 스냅샷은 52주 진행 직후(연도 전환 주 처리 전) 상태다. 시상은 연도 전환 주에 확정된다.');
  L.push('');
  return L.join('\n');
}

/* ------------------------------------------------------------------ */
/* 테스트                                                              */
/* ------------------------------------------------------------------ */

describe('시즌 자동 진행 검증 (M3-F1)', () => {
  it(`재현성: 같은 시드 ${REPRO_WEEKS}주 두 번 동일, 저장·복원 후 연속 진행과 동일`, () => {
    const first = simulate(BASE_SEED, REPRO_WEEKS, false, null);
    const json1 = serializeGame(first.finalState, SAVED_AT);
    const second = simulate(BASE_SEED, REPRO_WEEKS, false, null);
    const json2 = serializeGame(second.finalState, SAVED_AT);
    expect(json2).toBe(json1);

    const half = simulate(BASE_SEED, REPRO_SAVE_WEEK, false, null);
    const loaded = deserializeGame(serializeGame(half.finalState, SAVED_AT));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const resumed = playOn(loaded.state, REPRO_WEEKS - REPRO_SAVE_WEEK);
    expect(serializeGame(resumed, SAVED_AT)).toBe(json1);
  }, TEST_TIMEOUT_MS);

  it(`시즌 진행 ${TOTAL_WEEKS}주 관찰 실행(${FULL ? `시드 ${FULL_SEEDS.length}개` : '기본 1시즌'}) 집계${FULL ? ', 리포트 작성' : ''}`, () => {
    const seeds = FULL ? FULL_SEEDS : [BASE_SEED];
    const runs: RunResult[] = [];
    for (const seed of seeds) {
      const checkpoint = seed === seeds[0] ? REPRO_WEEKS : null;
      runs.push(simulate(seed, TOTAL_WEEKS, true, checkpoint));
    }

    // 관찰 실행과 무관찰 실행의 같은 시점 상태가 같아야 한다(관찰이 상태를 바꾸지 않는다)
    const first = runs[0];
    if (first === undefined) throw new Error('실행 결과가 없다');
    const reference = simulate(BASE_SEED, REPRO_WEEKS, false, null);
    expect(first.checkpointJson).toBe(serializeGame(reference.finalState, SAVED_AT));

    const m = aggregate(runs);
    say(
      `[시즌] 시드 ${seeds.join(',')} × ${SEASONS}시즌, 레이스 ${m.races.length}, 인기 1위 승률 ${pct(m.favAll)} (G1 ${pct(
        ratio(m.races.filter((r) => r.cls === 'G1' && r.favWon === true).length, m.races.filter((r) => r.cls === 'G1').length),
      )}), ` +
        `G1 평균 두수 ${num(m.g1Mean)}, 전체 평균 두수 ${num(m.allMean)}, 동착 ${pct(m.deadAll)}, ` +
        `주당 중앙값 ${num(m.weekMedianMs, 1)} ms, 기준 이탈 ${m.deviations.length}건`,
    );
    for (const line of m.lines) say(line);

    // 기본 모드 단언(느슨한 범위). 목표 이탈은 단언하지 않는다.
    const missing = runs.reduce((a, r) => a + r.missingResult, 0);
    expect(missing).toBe(0);
    expect(m.races.length).toBeGreaterThan(0);
    expect(m.allMean).toBeGreaterThanOrEqual(LOOSE_MEAN_FIELD_MIN);
    const favRateLoose = ratio(m.races.filter((r) => r.favWon === true).length, m.races.filter((r) => r.favWon !== null).length);
    expect(favRateLoose).toBeGreaterThanOrEqual(FAV_LOOSE_MIN);
    expect(favRateLoose).toBeLessThanOrEqual(FAV_LOOSE_MAX);
    for (const r of runs) {
      expect(nameDuplicates(r.finalState)).toBe(0);
      for (const s of r.snaps) expect(s.nameDup).toBe(0);
      expect(r.finalState.awardsHistory.length).toBeGreaterThanOrEqual(1);
    }

    if (FULL) {
      const text = renderReport(m, seeds);
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, text, 'utf8');
      expect(existsSync(REPORT_PATH)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);
});
