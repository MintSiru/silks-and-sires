import { describe, expect, it } from 'vitest';
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
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { racingHorseIds } from '../../src/engine/world/population';
import type { GameState, HorseId, Meeting, RaceGrade, Racecourse, SeriesDefinition } from '../../src/engine/types';

/**
 * M4-D3 균형 조정용 일회성 프로브(임시 파일, 끝나면 삭제). 엔진은 고치지 않는다.
 * 같은 시드로 6시즌(52 × 6 주) advanceWeek 를 진행하고 상금·2세 유입·부별 자마 수를 집계해 출력한다.
 */

const SEEDS: readonly number[] = [20261011, 7];
const SEASONS = 6;
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const COUNTRIES: readonly string[] = ['GB', 'IE', 'FR', 'DE', 'IT'];

const COURSES: Racecourse[] = getRacecourses();
const SERIES_DEFS: SeriesDefinition[] = getSeriesDefinitions();
const TEMPLATES = getRaceTemplates();
const STALLION_RECORDS = getStallionRecords();
const TIER_BY_KEY = new Map<string, number>(STALLION_RECORDS.map((r) => [r.key, r.marketTier] as const));

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: STALLION_RECORDS,
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES_DEFS,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: STALLION_RECORDS,
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES_DEFS,
};

/* ------------------------------------------------------------------ */
/* 보조                                                                */
/* ------------------------------------------------------------------ */

function log(lines: readonly string[]): void {
  process.stdout.write(`${lines.join('\n')}\n`);
}

/** 선형 보간 분위수(R type 7). 빈 배열이면 NaN */
function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] ?? NaN;
  const b = s[hi] ?? NaN;
  return a + (b - a) * (pos - lo);
}

function fmt(x: number, d = 0): string {
  return Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '-';
}

interface Entry2yo {
  sireId: HorseId | null;
  country: string;
  /** 부 등급 버킷: '1'~'5', '실명 등급 없음', '부 종마 아님', '부 미상' */
  bucket: string;
}

interface YearSnap {
  year: number;
  total: number;
  entries: Entry2yo[];
}

interface SeedSummary {
  seed: number;
  finalYear: number;
  finalWeek: number;
  unknownGradeRaces: number;
  ungradedRaces: number;
  raceCountByGrade: Record<string, number>;
  yearSnaps: YearSnap[];
}

function sireBucket(state: GameState, sireId: HorseId | null): string {
  if (sireId === null) return '부 미상';
  const st = state.stallions[sireId];
  if (st === undefined) return '부 종마 아님';
  const tier = st.realKey === null ? undefined : TIER_BY_KEY.get(st.realKey);
  return tier === undefined ? '실명 등급 없음' : String(tier);
}

function snapshot2yo(state: GameState, year: number): YearSnap {
  const entries: Entry2yo[] = [];
  for (const id of racingHorseIds(state)) {
    const h = state.horses[id];
    if (h === undefined || h.birthYear !== year - 2) continue;
    entries.push({ sireId: h.sireId, country: h.countryOfBirth, bucket: sireBucket(state, h.sireId) });
  }
  return { year, total: entries.length, entries };
}

/* ------------------------------------------------------------------ */
/* 시뮬레이션                                                           */
/* ------------------------------------------------------------------ */

function runSeed(seed: number): { summary: SeedSummary; state: GameState; winsByHorse: Map<HorseId, Map<RaceGrade, number>> } {
  const systems = createGameSystems(STATIC_GAME);
  let state = bootstrapGame({ seed, playerName: 'Probe Owner', silks: { ...SILKS } }, BOOT_DATA);

  /** raceId → 등급(null 이면 비그룹). 레이스가 개최 목록에 있을 때 기록한다 */
  const gradeByRace = new Map<string, RaceGrade | null>();
  const noteGrades = (ms: readonly Meeting[]): void => {
    for (const m of ms) for (const sr of m.races) gradeByRace.set(sr.race.id, sr.race.grade);
  };
  const seen = new Set<string>();
  const winsByHorse = new Map<HorseId, Map<RaceGrade, number>>();
  const raceCountByGrade = new Map<string, number>();
  let unknownGradeRaces = 0;
  let ungradedRaces = 0;
  const yearSnaps: YearSnap[] = [];

  for (let w = 0; w < TOTAL_WEEKS; w++) {
    noteGrades(state.seasonState.meetings);
    const processed = { year: state.date.year, week: state.date.week };
    state = advanceWeek(state, systems).state;
    noteGrades(state.seasonState.meetings);

    for (const r of state.raceResults) {
      if (seen.has(r.raceId)) continue;
      seen.add(r.raceId);
      if (!gradeByRace.has(r.raceId)) {
        unknownGradeRaces++;
        continue;
      }
      const g = gradeByRace.get(r.raceId) ?? null;
      if (g === null) {
        ungradedRaces++;
        continue;
      }
      raceCountByGrade.set(g, (raceCountByGrade.get(g) ?? 0) + 1);
      for (const run of r.runners) {
        if (run.position !== 1) continue;
        const byGrade = winsByHorse.get(run.horseId) ?? new Map<RaceGrade, number>();
        byGrade.set(g, (byGrade.get(g) ?? 0) + 1);
        winsByHorse.set(run.horseId, byGrade);
      }
    }

    // 2세 유입 집계: 매년 처리 1주 직후(현역마 교체 WEEK 1 이 끝난 뒤)
    if (processed.week === 1) yearSnaps.push(snapshot2yo(state, processed.year));
  }

  expect(state.date.year).toBe(START_YEAR + SEASONS);
  expect(state.date.week).toBe(1);

  const summary: SeedSummary = {
    seed,
    finalYear: state.date.year,
    finalWeek: state.date.week,
    unknownGradeRaces,
    ungradedRaces,
    raceCountByGrade: Object.fromEntries(raceCountByGrade),
    yearSnaps,
  };
  return { summary, state, winsByHorse };
}

/* ------------------------------------------------------------------ */
/* 집계·출력                                                            */
/* ------------------------------------------------------------------ */

function maxOrOf(state: GameState, id: HorseId): number | null {
  const vals: number[] = (state.seasonState.ratingHistory[id] ?? []).map((c) => c.to);
  const h = state.horses[id];
  if (h !== undefined && h.officialRating !== null) vals.push(h.officialRating);
  return vals.length === 0 ? null : Math.max(...vals);
}

function earningsStats(label: string, hs: { earnings: number }[]): string {
  const xs = hs.map((h) => h.earnings);
  return `| ${label} | ${xs.length} | ${fmt(quantile(xs, 0.5))} | ${fmt(quantile(xs, 0.75))} | ${fmt(xs.length === 0 ? NaN : Math.max(...xs))} |`;
}

function reportSeed(seed: number): void {
  const { summary, state, winsByHorse } = runSeed(seed);
  const lines: string[] = [];
  lines.push('', `## 시드 ${seed} (${SEASONS}시즌, ${TOTAL_WEEKS}주)`);
  lines.push(
    `- 최종 상태 ${summary.finalYear}년 ${summary.finalWeek}주, 말 수 ${Object.keys(state.horses).length}, 레이스 결과 ${state.raceResults.length}(보존분)`,
  );
  lines.push(
    `- 집계 레이스(신규 결과): ${JSON.stringify(summary.raceCountByGrade)}, 등급 미확인 ${summary.unknownGradeRaces}, 비그룹 ${summary.ungradedRaces}`,
  );

  // 수말(gelded 아님) 후보
  const maleOf = (id: HorseId): boolean => {
    const h = state.horses[id];
    return h !== undefined && h.sex === 'male' && !h.gelded;
  };
  const earningsOf = (id: HorseId): number => state.horses[id]?.record.earnings ?? 0;
  const g1Winners: HorseId[] = [];
  const g1TwoPlus: HorseId[] = [];
  const g23Only: HorseId[] = [];
  for (const [id, byGrade] of winsByHorse) {
    if (!maleOf(id)) continue;
    const g1 = byGrade.get('G1') ?? 0;
    const g2or3 = (byGrade.get('G2') ?? 0) + (byGrade.get('G3') ?? 0);
    if (g1 >= 1) g1Winners.push(id);
    if (g1 >= 2) g1TwoPlus.push(id);
    if (g1 === 0 && g2or3 >= 1) g23Only.push(id);
  }
  const rows = (ids: HorseId[]): { earnings: number }[] => ids.map((id) => ({ earnings: earningsOf(id) }));
  const orValues = (ids: HorseId[]): number[] =>
    ids.map((id) => maxOrOf(state, id)).filter((x): x is number => x !== null);

  lines.push('', '### a·b. 수말 상금 분포 (record.earnings)', '');
  lines.push('| 집단 | 두수 | 중앙값 | 75퍼센타일 | 최댓값 |');
  lines.push('| --- | --- | --- | --- | --- |');
  lines.push(earningsStats('a. G1 우승 경험 수말', rows(g1Winners)));
  lines.push(earningsStats('a-2. G1 2승 이상 수말', rows(g1TwoPlus)));
  lines.push(earningsStats('b. G2·G3 우승 있음 & G1 없음 수말', rows(g23Only)));

  lines.push('', '### c. 최고 OR 중앙값 (ratingHistory.to 최댓값과 officialRating 중 큰 값)', '');
  lines.push('| 집단 | OR 있는 두수 | 중앙값 | 75퍼센타일 |');
  lines.push('| --- | --- | --- | --- |');
  for (const [label, ids] of [
    ['a. G1 우승 수말', g1Winners],
    ['a-2. G1 2승 이상', g1TwoPlus],
    ['b. G2·G3 only', g23Only],
  ] as const) {
    const ors = orValues(ids);
    lines.push(`| ${label} | ${ors.length} | ${fmt(quantile(ors, 0.5), 1)} | ${fmt(quantile(ors, 0.75), 1)} |`);
  }

  // d. 연도별 2세 유입
  const snaps = summary.yearSnaps;
  lines.push('', '### d. 연도별 신규 2세 현역마(birthYear = 연도 − 2, 처리 1주 직후)', '');
  lines.push('| 연도 | 합계 | GB | IE | FR | DE | IT | 기타 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of snaps) {
    const byC = new Map<string, number>();
    for (const e of s.entries) byC.set(e.country, (byC.get(e.country) ?? 0) + 1);
    const other = s.total - COUNTRIES.reduce((a, c) => a + (byC.get(c) ?? 0), 0);
    lines.push(
      `| ${s.year} | ${s.total} | ${COUNTRIES.map((c) => byC.get(c) ?? 0).join(' | ')} | ${other} |`,
    );
  }
  const totals = snaps.map((s) => s.total);
  const injected = snaps.filter((s) => s.year > START_YEAR).map((s) => s.total);
  lines.push(
    `- 6개 연도 평균 ${fmt(mean(totals), 1)} (${snaps.map((s) => s.year).join(', ')}년), 시작 연도(${START_YEAR}) 제외 평균 ${fmt(mean(injected), 1)}`,
  );

  // e. 부별
  const tierOrder = ['1', '2', '3', '4', '5', '실명 등급 없음', '부 종마 아님', '부 미상'];
  const tierTotals = new Map<string, number>(tierOrder.map((t) => [t, 0] as const));
  const sireTotals = new Map<string, { total: number; bucket: string; sireId: HorseId | null }>();
  for (const s of snaps) {
    for (const e of s.entries) {
      tierTotals.set(e.bucket, (tierTotals.get(e.bucket) ?? 0) + 1);
      const key = e.sireId ?? '(null)';
      const cur = sireTotals.get(key) ?? { total: 0, bucket: e.bucket, sireId: e.sireId };
      cur.total++;
      sireTotals.set(key, cur);
    }
  }
  const n = snaps.length;
  lines.push('', '### e-1. 부 등급별 2세 두수 (6년 합계, 연간 평균)', '');
  lines.push('| 부 등급 | 6년 합 | 연간 평균 | 비율 |');
  lines.push('| --- | --- | --- | --- |');
  const grand = [...tierTotals.values()].reduce((a, b) => a + b, 0);
  for (const t of tierOrder) {
    const v = tierTotals.get(t) ?? 0;
    lines.push(`| ${t} | ${v} | ${fmt(v / n, 1)} | ${fmt(grand === 0 ? NaN : (v / grand) * 100, 1)}% |`);
  }
  const tier15 = ['1', '2', '3', '4', '5'].reduce((a, t) => a + (tierTotals.get(t) ?? 0), 0);
  lines.push(`- 티어 1~5 합계: ${tier15} (6년), 연간 평균 ${fmt(tier15 / n, 1)}`);

  lines.push('', '### e-2. 부 한 두당 연간 자마 수 상위 10두 (2세 기준, 6년 합 / 연수)', '');
  lines.push('| 순위 | 부 이름 | 등급 | 6년 합 | 연간 평균 |');
  lines.push('| --- | --- | --- | --- | --- |');
  const top = [...sireTotals.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  top.forEach((t, i) => {
    const name = t.sireId === null ? '(미상)' : (state.horses[t.sireId]?.name ?? String(t.sireId));
    lines.push(`| ${i + 1} | ${name} | ${t.bucket} | ${t.total} | ${fmt(t.total / n, 2)} |`);
  });
  lines.push(`- 2세를 낳은 부 수(서로 다른 부 id): ${sireTotals.size}`);
  log(lines);
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe('M4-D3 종마 사업 균형 프로브 (임시)', () => {
  for (const seed of SEEDS) {
    it(
      `시드 ${seed}, ${SEASONS}시즌 집계`,
      () => {
        reportSeed(seed);
      },
      1_200_000,
    );
  }
});
