import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { OR_PER_ABILITY } from '../../src/engine/config/population';
import * as ratingCfg from '../../src/engine/config/rating';
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
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import { racingHorseIds } from '../../src/engine/world/population';
import { meanAbility, ratingFromAbility } from '../../src/engine/world/rating';
import type { GameState, HorseId, Racecourse, SeriesDefinition } from '../../src/engine/types';

/*
 * M3-F2c OR 보정 측정 스크립트. VERIFY=1 일 때만 실행된다.
 * - 상수 조합 탐색용 훅: F2C_RATING_OVERRIDE='{"DOWN_RATE":0.1}' 처럼 JSON 을 주면 config/rating 의 해당 export 를 덮어쓴다.
 *   미설정이면 rating.ts 값을 그대로 쓴다(최종 판정은 미설정 상태로 한다).
 * - 시드 20261011 · 7, 각 3시즌(157주). 연초 = 처리 주 1 직후, 연말 = 처리 주 52 직후 스냅샷.
 * - 목표 1~4 · 6 을 판정하고, 목표 5(OR≥100 비율)는 보고만 한다.
 * - 같은 시드를 한 번 더 돌려 연말 전 말의 (ID, OR, 능력) 직렬화 해시가 같은지 본다(목표 6).
 * 엔진은 고치지 않는다. 결과는 stdout 에만 쓴다.
 */

const tune = vi.hoisted((): Record<string, unknown> => {
  const raw = process.env.F2C_RATING_OVERRIDE;
  return raw === undefined || raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
});

vi.mock('../../src/engine/config/rating', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/config/rating')>();
  return { ...actual, ...tune };
});

const VERIFY = process.env.VERIFY !== undefined && process.env.VERIFY !== '';
const SEEDS: readonly number[] = [20261011, 7];
const SEASONS = 3;
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS + 1;
const YEARS: readonly number[] = [START_YEAR, START_YEAR + 1, START_YEAR + 2];
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;

const COURSES: Racecourse[] = getRacecourses();
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

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */

function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fx(x: number, d = 2): string {
  return Number.isFinite(x) ? x.toFixed(d) : 'NaN';
}

/** 연령 구간: 8세 이상은 8로 묶는다 */
function bucket(age: number): number {
  return age >= 8 ? 8 : age;
}

interface Snap {
  id: HorseId;
  age: number;
  or: number | null;
  ability: number;
}

/** 현역(in_training·resting) 말의 스냅샷 */
function snapshot(state: GameState, year: number): Map<HorseId, Snap> {
  const out = new Map<HorseId, Snap>();
  for (const id of racingHorseIds(state)) {
    const h = state.horses[id];
    if (h === undefined || (h.status !== 'in_training' && h.status !== 'resting')) continue;
    out.set(h.id, {
      id: h.id,
      age: ageInYear(h.birthYear, year),
      or: h.officialRating,
      ability: meanAbility(h.ability),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 시즌 진행                                                           */
/* ------------------------------------------------------------------ */

interface SeedRun {
  seed: number;
  start: Map<number, Map<HorseId, Snap>>;
  end: Map<number, Map<HorseId, Snap>>;
  /** 연도별 주간 관측 최고 OR */
  weekMax: Map<number, number>;
  /** 연도별 주간 관측에서 OR 135 이상을 한 번이라도 기록한 말 */
  hi135: Map<number, Set<HorseId>>;
  digest: string;
}

function runSeed(seed: number): SeedRun {
  const systems = createGameSystems(STATIC_GAME);
  let state = bootstrapGame({ seed, playerName: 'F2c Owner', silks: { ...SILKS } }, BOOT_DATA);
  const run: SeedRun = {
    seed,
    start: new Map(),
    end: new Map(),
    weekMax: new Map(),
    hi135: new Map(),
    digest: '',
  };
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const processed = { year: state.date.year, week: state.date.week };
    state = advanceWeek(state, systems).state;
    const y = processed.year;
    for (const id of racingHorseIds(state)) {
      const h = state.horses[id];
      if (h === undefined || h.officialRating === null) continue;
      run.weekMax.set(y, Math.max(run.weekMax.get(y) ?? 0, h.officialRating));
      if (h.officialRating >= 135) {
        const set = run.hi135.get(y) ?? new Set<HorseId>();
        set.add(h.id);
        run.hi135.set(y, set);
      }
    }
    if (processed.week === 1) run.start.set(y, snapshot(state, y));
    if (processed.week === WEEKS_PER_YEAR) run.end.set(y, snapshot(state, y));
  }
  const parts: string[] = [];
  for (const y of YEARS) {
    const snap = run.end.get(y);
    if (snap === undefined) continue;
    const ids = [...snap.keys()].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    for (const id of ids) {
      const s = snap.get(id);
      if (s !== undefined) parts.push(`${y}|${id}|${s.or ?? 'null'}|${s.ability}`);
    }
  }
  run.digest = createHash('sha256').update(parts.join('\n')).digest('hex');
  return run;
}

/* ------------------------------------------------------------------ */
/* 지표                                                                */
/* ------------------------------------------------------------------ */

interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

function mean4(snap: Map<HorseId, Snap> | undefined): number {
  if (snap === undefined) return NaN;
  return mean([...snap.values()].filter((s) => s.age >= 4 && s.or !== null).map((s) => s.or ?? NaN));
}

function ageOrGap(snap: Map<HorseId, Snap> | undefined, b: number): number {
  if (snap === undefined) return NaN;
  const rows = [...snap.values()].filter((s) => s.or !== null && bucket(s.age) === b);
  return mean(rows.map((s) => (s.or ?? NaN) - ratingFromAbility(s.ability)));
}

function sameHorseDelta(run: SeedRun, y: number, b: number): number {
  const s0 = run.start.get(y);
  const s1 = run.end.get(y);
  if (s0 === undefined || s1 === undefined) return NaN;
  const vals: number[] = [];
  for (const [id, e] of s1) {
    const s = s0.get(id);
    if (s === undefined || s.or === null || e.or === null || bucket(e.age) !== b) continue;
    vals.push(e.or - s.or - (e.ability - s.ability) * OR_PER_ABILITY);
  }
  return mean(vals);
}

function rated3Share100(snap: Map<HorseId, Snap> | undefined): number {
  if (snap === undefined) return NaN;
  const rows = [...snap.values()].filter((s) => s.age >= 3 && s.or !== null);
  return rows.length === 0 ? NaN : rows.filter((s) => (s.or ?? 0) >= 100).length / rows.length;
}

function evaluate(runs: readonly SeedRun[]): { checks: Check[] } {
  const checks: Check[] = [];

  // 목표 1: 4세 이상 평균 OR 의 시즌 간 변화 ±2 이내 (모든 전환)
  say('');
  say('### 목표 1: 4세 이상 평균 OR 시즌 간 변화');
  say('| 시드 | 전환 | 앞 해 평균 | 뒤 해 평균 | 변화 |');
  say('| --- | --- | --- | --- | --- |');
  const t1: string[] = [];
  let t1ok = true;
  for (const run of runs) {
    for (let i = 0; i + 1 < YEARS.length; i++) {
      const y0 = YEARS[i] ?? START_YEAR;
      const y1 = YEARS[i + 1] ?? START_YEAR;
      const a = mean4(run.end.get(y0));
      const b = mean4(run.end.get(y1));
      const d = b - a;
      say(`| ${run.seed} | ${y0}→${y1} | ${fx(a)} | ${fx(b)} | ${fx(d)} |`);
      t1.push(fx(d));
      if (!(Math.abs(d) <= 2)) t1ok = false;
    }
  }
  checks.push({ id: '1 4세+ 평균 OR 시즌 간 변화 ±2', ok: t1ok, detail: `변화 ${t1.join(', ')}` });

  // 목표 2: 연말 OR − ratingFromAbility 평균 (2세 −10~+6, 3·4·5세 −6~+6), 시드·시즌마다
  say('');
  say('### 목표 2: 연말 OR − ratingFromAbility 평균');
  say('| 시드 | 연도 | 2세 | 3세 | 4세 | 5세 |');
  say('| --- | --- | --- | --- | --- | --- |');
  const t2Vals: Record<number, number[]> = { 2: [], 3: [], 4: [], 5: [] };
  for (const run of runs) {
    for (const y of YEARS) {
      const cells = [2, 3, 4, 5].map((b) => {
        const v = ageOrGap(run.end.get(y), b);
        (t2Vals[b] ??= []).push(v);
        return fx(v, 1);
      });
      say(`| ${run.seed} | ${y} | ${cells.join(' | ')} |`);
    }
  }
  const t2Ok = runs.length > 0 && [2, 3, 4, 5].every((b) => (t2Vals[b] ?? []).every((v) => {
    const lo = b === 2 ? -10 : -6;
    return v >= lo && v <= 6;
  }));
  checks.push({
    id: '2 연말 OR−환산 (2세 −10~+6, 3·4·5세 −6~+6)',
    ok: t2Ok,
    detail: [2, 3, 4, 5].map((b) => `${b}세 ${fx(mean(t2Vals[b] ?? []), 1)} (최저 ${fx(Math.min(...(t2Vals[b] ?? [NaN])), 1)}, 최고 ${fx(Math.max(...(t2Vals[b] ?? [NaN])), 1)})`).join(' · '),
  });

  // 목표 3: 같은 말 연초→연말 (ΔOR − Δ능력×OR_PER_ABILITY) 평균, 4·5·6세 ±4 이내
  say('');
  say('### 목표 3: 같은 말 연초→연말 (ΔOR − Δ능력×OR_PER_ABILITY) 평균');
  say('| 시드 | 연도 | 4세 | 5세 | 6세 |');
  say('| --- | --- | --- | --- | --- |');
  const t3Vals: Record<number, number[]> = { 4: [], 5: [], 6: [] };
  for (const run of runs) {
    for (const y of YEARS) {
      const cells = [4, 5, 6].map((b) => {
        const v = sameHorseDelta(run, y, b);
        (t3Vals[b] ??= []).push(v);
        return fx(v, 2);
      });
      say(`| ${run.seed} | ${y} | ${cells.join(' | ')} |`);
    }
  }
  const t3Ok = runs.length > 0 && [4, 5, 6].every((b) => (t3Vals[b] ?? []).every((v) => Math.abs(v) <= 4));
  checks.push({
    id: '3 같은 말 ΔOR−Δ능력환산 ±4 (4·5·6세)',
    ok: t3Ok,
    detail: [4, 5, 6].map((b) => `${b}세 ${fx(mean(t3Vals[b] ?? []), 2)}`).join(' · '),
  });

  // 목표 4: 그해 최고 OR 120~134 (시즌마다), 135 이상 시즌당 0~1두
  say('');
  say('### 목표 4: 시즌 최고 OR 과 135 이상 두수');
  say('| 시드 | 연도 | 최고 OR(주간 관측) | 135 이상 두수 |');
  say('| --- | --- | --- | --- |');
  let t4ok = true;
  const t4Detail: string[] = [];
  for (const run of runs) {
    for (const y of YEARS) {
      const mx = run.weekMax.get(y) ?? NaN;
      const n = run.hi135.get(y)?.size ?? 0;
      say(`| ${run.seed} | ${y} | ${fx(mx, 0)} | ${n} |`);
      if (!(mx >= 120 && mx <= 134 && n <= 1)) t4ok = false;
      t4Detail.push(`${run.seed}/${y}: ${fx(mx, 0)}, 135+ ${n}`);
    }
  }
  checks.push({ id: '4 시즌 최고 OR 120~134, 135+ 0~1두', ok: t4ok, detail: t4Detail.join(' · ') });

  // 목표 5 (참고): OR 보유 3세 이상 중 OR≥100 비율
  say('');
  say('### 목표 5 (참고, 판정 제외): 연말 OR 보유 3세 이상 중 OR≥100 비율');
  say('| 시드 | 연도 | 비율 |');
  say('| --- | --- | --- |');
  for (const run of runs) {
    for (const y of YEARS) {
      say(`| ${run.seed} | ${y} | ${(rated3Share100(run.end.get(y)) * 100).toFixed(1)}% |`);
    }
  }

  return { checks };
}

/* ------------------------------------------------------------------ */
/* 테스트                                                              */
/* ------------------------------------------------------------------ */

describe('M3-F2c OR 보정 측정 (VERIFY=1 전용)', () => {
  it.skipIf(!VERIFY)(
    `시드 ${SEEDS.join('·')}, ${SEASONS}시즌 측정과 목표 판정`,
    () => {
      say('# M3-F2c OR 보정 측정');
      say(`- 덮어쓴 상수: ${Object.keys(tune).length === 0 ? '없음(rating.ts 값 그대로)' : JSON.stringify(tune)}`);
      say(
        `- 현재 상수: DOWN_RATE ${ratingCfg.DOWN_RATE}, MAX_DROP ${ratingCfg.MAX_DROP}, NO_DROP_BEATEN_L ${ratingCfg.NO_DROP_BEATEN_L}, UP_RATE ${ratingCfg.UP_RATE}, UP_RATE_WIN ${ratingCfg.UP_RATE_WIN}, MAX_RISE ${ratingCfg.MAX_RISE}, HANDICAP_WIN_MIN_RISE ${ratingCfg.HANDICAP_WIN_MIN_RISE}, FIRST_OR_RUNS ${ratingCfg.FIRST_OR_RUNS}, FIRST_OR_TOP_N ${ratingCfg.FIRST_OR_TOP_N}`,
      );
      say(`- RACE_STANDARD: ${JSON.stringify(ratingCfg.RACE_STANDARD)}`);

      const runs = SEEDS.map((seed) => runSeed(seed));
      const { checks } = evaluate(runs);

      // 목표 6: 같은 시드 재현성
      const again = runSeed(SEEDS[0] ?? 0);
      const repro = again.digest === (runs[0]?.digest ?? '');
      checks.push({ id: '6 같은 시드 재현성', ok: repro, detail: `시드 ${SEEDS[0]} 해시 ${repro ? '일치' : '불일치'} (${(runs[0]?.digest ?? '').slice(0, 12)})` });

      say('');
      say('## 판정');
      for (const c of checks) say(`- [${c.ok ? 'PASS' : 'FAIL'}] 목표 ${c.id} — ${c.detail}`);

      expect(checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    },
    3_600_000,
  );
});
