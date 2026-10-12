import { describe, expect, it, vi } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { TWO_YO_FROM_WEEK } from '../../src/engine/config/meetings';
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
import type { RunMeetingInPlaceOutput } from '../../src/engine/season/raceday';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear, isInPhase } from '../../src/engine/time/calendar';
import type { GameState, Race } from '../../src/engine/types';

/**
 * M3-F2b 출주 공급 측정 스크립트. VERIFY=1 일 때만 실행된다. 엔진은 고치지 않는다.
 * 시드 20261011·7, 각 2시즌(105주). F1·F1b 측정 방식을 따른다.
 * - runMeetingInPlace 출력만 관찰한다(상태·rng 를 쓰지 않는다).
 * - 취소율 = 개최 레이스 중 abandoned / (abandoned + run).
 * - 3세 이상 출주 = 그 연도 중 한 번이라도 현역(in_training·resting)이었던 3세 이상 말의 연간 출주 평균.
 * - 2세 출주 = 처리 15주 직후 현역인 2세 말의 15주~52주 출주 횟수 평균과 1회 이상 비율.
 *   (보조: 연말 현역 2세의 연간 출주 평균. OR 이 없는 2세만 세면 선택 편향이 생긴다)
 * - 주당 진행 시간 = advanceWeek 실행 시간(ms)의 중앙값.
 * 결과는 stdout 에만 쓴다.
 */

function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/* ------------------------------------------------------------------ */
/* 관찰 훅 (vi.mock)                                                   */
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
/* 정적 데이터 (season.test.ts 와 같은 구성)                            */
/* ------------------------------------------------------------------ */

const SEEDS: readonly number[] = [20261011, 7];
const SEASONS = 2;
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS + 1;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
/** 2세 측정 나이(JUVENILE_AGE 와 같다) */
const JUVENILE_AGE_MEASURE = 2;
/** 3세 이상 측정 나이 하한 */
const ADULT_AGE = 3;
/** 2세 모집단을 잡는 주(처리 후 상태). 2세 경주가 열리는 첫 주와 같다 */
const JUVENILE_POP_WEEK = TWO_YO_FROM_WEEK;
/** 진단: 말 구성을 세는 주 */
const DIAG_WEEK = 20;
/** 진단 기준 출주 가능 준비도·피로(MIN_FITNESS_TO_RUN·MAX_FATIGUE_TO_RUN 과 같다) */
const DIAG_READY_FITNESS = 55;
const DIAG_READY_FATIGUE = 45;

const COURSES = getRacecourses();
const COURSE_COUNTRY = new Map(COURSES.map((c) => [c.id, c.country] as const));
const SERIES_DEFS = getSeriesDefinitions();

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
/* 분류·집계 타입                                                      */
/* ------------------------------------------------------------------ */

/** 레이스 분류 키: 그룹 등급, 핸디캡 클래스(H2~H7), 메이든·노비스·조건 */
type ClassKey = 'G1' | 'G2' | 'G3' | 'L' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'MDN' | 'NOV' | 'COND';
const CLASS_KEYS: readonly ClassKey[] = ['G1', 'G2', 'G3', 'L', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'MDN', 'NOV', 'COND'];

function classOf(race: Race): ClassKey {
  if (race.grade !== null) return race.grade;
  if (race.kind === 'handicap') return `H${race.raceClass}` as ClassKey;
  if (race.kind === 'maiden') return 'MDN';
  if (race.kind === 'novice') return 'NOV';
  return 'COND';
}

function distanceBucket(distance: number): string {
  if (distance <= 1408) return 'D<=1408';
  if (distance <= 1811) return 'D<=1811';
  if (distance <= 2414) return 'D<=2414';
  return 'D>2414';
}

interface SchedCount {
  total: number;
  abandoned: number;
}

interface CountryDiag {
  n: number;
  ready: number;
  orSum: number;
  orN: number;
}

interface SeedRun {
  seed: number;
  /** 분류별 예정·취소 */
  sched: Map<ClassKey, SchedCount>;
  /** 나라·계절·거리 구간별 예정·취소(키: 'C:GB', 'S:turf', 'D<=1408' 등) */
  byKey: Map<string, SchedCount>;
  /** 분류별 출주 완료 레이스의 출주 두수 */
  fields: Map<ClassKey, number[]>;
  /** 2세 전용(maxAge 2) 레이스 예정·취소 */
  twoYoSched: SchedCount;
  /** 연도별 말별 출주 횟수(전 레이스) */
  starts: Map<number, Map<string, number>>;
  /** 연도별 15주 이후 2세 전용 레이스 출주 횟수 */
  juvStarts: Map<number, Map<string, number>>;
  /** 연도별 3세 이상 현역(연중 한 번 이상) 말 */
  adultRacing: Map<number, Set<string>>;
  /** 연도별 15주 직후 현역 2세 말 */
  juvenilePop: Map<number, Set<string>>;
  /** 연말(52주 직후) 현역 2세 말 */
  yearEndJuvenile: Map<number, Set<string>>;
  /** 주별 advanceWeek 실행 시간(ms) */
  weekMs: number[];
  /** 진단(2026년 DIAG_WEEK): 나라별 말 수·출주 가능 수·OR 합 */
  countryDiag: Map<string, CountryDiag>;
  /** 진단(2026년 DIAG_WEEK): 3세 이상 말의 OR 5단위 구간 */
  orBins: Map<number, number>;
  /** 진단(2026년 DIAG_WEEK): 3세 이상 말의 적정 거리 200m 구간 */
  distBins: Map<number, number>;
}

function isRacingStatus(status: string): boolean {
  return status === 'in_training' || status === 'resting';
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function addCount<K>(map: Map<K, SchedCount>, key: K, abandoned: boolean): void {
  const c = map.get(key) ?? { total: 0, abandoned: 0 };
  c.total += 1;
  if (abandoned) c.abandoned += 1;
  map.set(key, c);
}

function setOf<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  const s = map.get(key) ?? new Set<V>();
  map.set(key, s);
  return s;
}

function collectMeeting(run: SeedRun, out: RunMeetingInPlaceOutput): void {
  const byId = new Map(out.results.map((r) => [r.raceId, r] as const));
  const year = out.meeting.date.year;
  const week = out.meeting.date.week;
  const season = isInPhase(week, 'turf_flat') ? 'S:turf' : 'S:aw';
  for (const sr of out.meeting.races) {
    if (sr.status !== 'run' && sr.status !== 'abandoned') continue;
    const abandoned = sr.status === 'abandoned';
    const key = classOf(sr.race);
    const country = `C:${COURSE_COUNTRY.get(sr.race.racecourseId) ?? 'unknown'}`;
    const twoYo = sr.race.conditions.maxAge === JUVENILE_AGE_MEASURE;

    addCount(run.sched, key, abandoned);
    addCount(run.byKey, country, abandoned);
    addCount(run.byKey, season, abandoned);
    addCount(run.byKey, distanceBucket(sr.race.distance), abandoned);
    if (twoYo) {
      run.twoYoSched.total += 1;
      if (abandoned) run.twoYoSched.abandoned += 1;
    }
    if (abandoned) continue;

    const result = byId.get(sr.race.id);
    if (result === undefined) continue;
    const list = run.fields.get(key) ?? [];
    list.push(result.runners.length);
    run.fields.set(key, list);

    const starts = run.starts.get(year) ?? new Map<string, number>();
    for (const r of result.runners) bump(starts, r.horseId);
    run.starts.set(year, starts);

    if (twoYo && week >= JUVENILE_POP_WEEK) {
      const js = run.juvStarts.get(year) ?? new Map<string, number>();
      for (const r of result.runners) bump(js, r.horseId);
      run.juvStarts.set(year, js);
    }
  }
}

function observeWeek(run: SeedRun, state: GameState, year: number, week: number): void {
  for (const h of Object.values(state.horses)) {
    if (!isRacingStatus(h.status)) continue;
    const age = ageInYear(h.birthYear, year);
    if (age >= ADULT_AGE) setOf(run.adultRacing, year).add(h.id);
    if (week === JUVENILE_POP_WEEK && age === JUVENILE_AGE_MEASURE) setOf(run.juvenilePop, year).add(h.id);
    if (week === WEEKS_PER_YEAR && age === JUVENILE_AGE_MEASURE) setOf(run.yearEndJuvenile, year).add(h.id);

    if (week === DIAG_WEEK && year === START_YEAR) {
      const cur = run.countryDiag.get(h.countryOfBirth) ?? { n: 0, ready: 0, orSum: 0, orN: 0 };
      cur.n += 1;
      if (h.status === 'in_training' && h.condition.fitness >= DIAG_READY_FITNESS && h.condition.fatigue <= DIAG_READY_FATIGUE) {
        cur.ready += 1;
      }
      if (h.officialRating !== null) {
        cur.orSum += h.officialRating;
        cur.orN += 1;
      }
      run.countryDiag.set(h.countryOfBirth, cur);
      if (age >= ADULT_AGE) {
        const db = Math.floor(h.aptitude.distanceOptimum / 200) * 200;
        run.distBins.set(db, (run.distBins.get(db) ?? 0) + 1);
        if (h.officialRating !== null) {
          const ob = Math.floor(h.officialRating / 5) * 5;
          run.orBins.set(ob, (run.orBins.get(ob) ?? 0) + 1);
        }
      }
    }
  }
}

function simulate(seed: number): SeedRun {
  const systems = createGameSystems(STATIC_GAME);
  let state = bootstrapGame({ seed, playerName: 'F2b Owner', silks: { ...SILKS } }, BOOT_DATA);
  const run: SeedRun = {
    seed,
    sched: new Map(),
    byKey: new Map(),
    fields: new Map(),
    twoYoSched: { total: 0, abandoned: 0 },
    starts: new Map(),
    juvStarts: new Map(),
    adultRacing: new Map(),
    juvenilePop: new Map(),
    yearEndJuvenile: new Map(),
    weekMs: [],
    countryDiag: new Map(),
    orBins: new Map(),
    distBins: new Map(),
  };

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const outs: RunMeetingInPlaceOutput[] = [];
    hook.onMeeting = (out) => outs.push(out);
    const processedYear = state.date.year;
    const processedWeek = state.date.week;
    const t = performance.now();
    const res = advanceWeek(state, systems);
    run.weekMs.push(performance.now() - t);
    hook.onMeeting = null;
    state = res.state;
    for (const out of outs) collectMeeting(run, out);
    observeWeek(run, state, processedYear, processedWeek);
  }
  return run;
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
  return s.length % 2 === 1 ? (s[mid] ?? NaN) : (lo + hi) / 2;
}

function pct(x: number, d = 1): string {
  return Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(d)}%`;
}

function fx(x: number, d = 2): string {
  return Number.isNaN(x) ? 'n/a' : x.toFixed(d);
}

function share(part: number, whole: number): number {
  return whole === 0 ? NaN : part / whole;
}

/* ------------------------------------------------------------------ */
/* 보고                                                                */
/* ------------------------------------------------------------------ */

function reportSeed(run: SeedRun): void {
  say('');
  say(`## 시드 ${run.seed}`);
  say('');
  say('| 분류 | 예정 | 취소 | 취소율 | 출주 두수 평균 | 5두 미만 비율 |');
  say('| --- | --- | --- | --- | --- | --- |');
  for (const k of CLASS_KEYS) {
    const s = run.sched.get(k);
    if (s === undefined) continue;
    const f = run.fields.get(k) ?? [];
    say(
      `| ${k} | ${s.total} | ${s.abandoned} | ${pct(share(s.abandoned, s.total))} | ${fx(mean(f))} | ${pct(share(f.filter((n) => n < 5).length, f.length))} |`,
    );
  }

  let total = 0;
  let abandoned = 0;
  for (const s of run.sched.values()) {
    total += s.total;
    abandoned += s.abandoned;
  }
  let gTotal = 0;
  let gAbandoned = 0;
  for (const k of ['G1', 'G2', 'G3'] as const) {
    const s = run.sched.get(k);
    if (s === undefined) continue;
    gTotal += s.total;
    gAbandoned += s.abandoned;
  }
  const allFields = [...run.fields.values()].flat();
  say('');
  say(
    `- 전체 취소율 ${pct(share(abandoned, total))} (${abandoned}/${total}), G1~G3 취소율 ${pct(share(gAbandoned, gTotal))} (${gAbandoned}/${gTotal}), 전체 5두 미만 ${pct(share(allFields.filter((n) => n < 5).length, allFields.length))}`,
  );
  say(
    `- 취소율 분해: ${[...run.byKey.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, s]) => `${k} ${pct(share(s.abandoned, s.total))}(${s.abandoned}/${s.total})`)
      .join(', ')}`,
  );
  say(
    `- 2세 전용 레이스 예정 ${run.twoYoSched.total}, 취소 ${run.twoYoSched.abandoned} (${pct(share(run.twoYoSched.abandoned, run.twoYoSched.total))})`,
  );

  for (let y = START_YEAR; y < START_YEAR + SEASONS; y++) {
    const adult = [...(run.adultRacing.get(y) ?? new Set<string>())];
    const st = run.starts.get(y) ?? new Map<string, number>();
    const adultCounts = adult.map((id) => st.get(id) ?? 0);
    const jpop = [...(run.juvenilePop.get(y) ?? new Set<string>())];
    const jst = run.juvStarts.get(y) ?? new Map<string, number>();
    const jCounts = jpop.map((id) => jst.get(id) ?? 0);
    const yeJ = [...(run.yearEndJuvenile.get(y) ?? new Set<string>())];
    const yeJCounts = yeJ.map((id) => st.get(id) ?? 0);
    say('');
    say(`- ${y}년 3세+ 현역 ${adult.length}두: 연 출주 평균 ${fx(mean(adultCounts))}, 중앙값 ${fx(median(adultCounts), 1)}`);
    say(
      `- ${y}년 15주 직후 현역 2세 ${jpop.length}두: 15주 이후 1회 이상 출주 ${pct(share(jCounts.filter((c) => c >= 1).length, jCounts.length))}, 평균 ${fx(mean(jCounts))}회`,
    );
    say(`- ${y}년 연말 현역 2세 ${yeJ.length}두(보조): 연간 출주 평균 ${fx(mean(yeJCounts))}회`);
  }

  say('');
  say(`- 주당 진행 시간 중앙값 ${fx(median(run.weekMs), 1)} ms, 평균 ${fx(mean(run.weekMs), 1)} ms`);

  say('');
  say(`진단(${START_YEAR}년 ${DIAG_WEEK}주):`);
  for (const [c, d] of [...run.countryDiag.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    say(`- ${c}: 말 ${d.n}두, 출주 가능 ${d.ready}두, 평균 OR ${fx(d.orSum / Math.max(1, d.orN), 1)}`);
  }
  say(
    `- 3세+ 적정 거리 200m 구간: ${[...run.distBins.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}:${n}`).join(' ')}`,
  );
  say(
    `- 3세+ OR 5단위 구간: ${[...run.orBins.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}:${n}`).join(' ')}`,
  );
}

/* ------------------------------------------------------------------ */
/* 실행                                                                */
/* ------------------------------------------------------------------ */

const FULL = !!process.env.VERIFY;

describe('M3-F2b 출주 공급 측정 (VERIFY=1 전용)', () => {
  it.skipIf(!FULL)(
    `시드 ${SEEDS.join('·')}, ${SEASONS}시즌 출주 공급 측정`,
    () => {
      say('# M3-F2b 출주 공급 측정 (2시즌, 105주)');
      for (const seed of SEEDS) {
        const run = simulate(seed);
        reportSeed(run);
        expect(run.sched.size).toBeGreaterThan(0);
      }
    },
    1_800_000,
  );
});
