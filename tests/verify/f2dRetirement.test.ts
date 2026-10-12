import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  POPULATION_BROODMARE_RETIRE_BANDS,
  POPULATION_COUNTRY_ORDER,
  POPULATION_GELDING_MIN_AGE,
  POPULATION_GELDING_SHARE,
  POPULATION_IN_TRAINING,
  POPULATION_RETIRE_AGE,
  POPULATION_STUD_RETIRE_BANDS,
  type EarlyRetireBand,
} from '../../src/engine/config/population';
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
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type { GameEvent, GameState, Horse } from '../../src/engine/types';
import { isRacingHorse } from '../../src/engine/world/population';
import { initialOfficialRating } from '../../src/engine/world/rating';

/**
 * M3-F2d AI 현역마 은퇴 규칙 검증 (VERIFY 전용 측정).
 * 기본 모드: 시드 20261011, 1시즌(52주 + 연도 전환 1주). 단언은 목표 1·2 와 재현성만.
 * FULL 모드(VERIFY=1): 시드 2개 × 5시즌(시드마다 261주 연속 진행). 목표 1~4·6 단언, 리포트 작성.
 * 시즌 종료 스냅샷은 52주 진행 직후(연초 교체 전) 상태다. 교체 연도 Y 의 은퇴는 시즌 Y−1 종료 뒤 연초 교체에서 난다.
 * 엔진은 고치지 않는다. 은퇴 이벤트의 종류(종마·번식·거세)는 말 상태로 분류한다(이벤트에는 사유 필드가 없다).
 */

/** 지표 출력. console.log 는 기본 리포터에서 숨겨지므로 stdout 에 직접 쓴다. */
function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

const FULL = !!process.env.VERIFY;
const BASE_SEED = 20261011;
const FULL_SEEDS: readonly number[] = [20261011, 7];
const SEASONS = FULL ? 5 : 1;
/** 시즌 n개 = 52주씩 n개 + 마지막 연도 전환 1주 (마지막 교체 연도까지 포함) */
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS + 1;
const REPRO_WEEKS = WEEKS_PER_YEAR + 1;
const REPRO_SAVE_WEEK = 26;
const TEST_TIMEOUT_MS = FULL ? 2_400_000 : 600_000;
const REPORT_PATH = fileURLToPath(new URL('../../docs/reports/2026-10-12-m3-f2d-retirement.md', import.meta.url));
const SAVED_AT = '2026-10-12T00:00:00.000Z';
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;

/** 목표 기준 (명세 M3-F2d) */
const OLD_AGE = 7;
const OLD_MAX_SHARE = 0.08;
const COUNT_TOLERANCE = 0.03;
const STEADY_FROM = 3;
const STEADY_TO = 5;
const AGE_SHIFT_MAX = 0.03;
const YOUNG_MAX_AGE = 5;
const TOP_OR_N = 10;
const TOP_YOUNG_MIN = 7;
/** 참고 범위: GB+IE+FR 종마 은퇴(교체 1회당) */
const STUD_REF_MIN = 15;
const STUD_REF_MAX = 40;

const YOUNGEST_AGE = 2;
const AGE_BUCKET_MAX = 8;
const BUCKETS: readonly number[] = [2, 3, 4, 5, 6, 7, AGE_BUCKET_MAX];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

/* ------------------------------------------------------------------ */
/* 집계 타입                                                           */
/* ------------------------------------------------------------------ */

type RetireKind = 'stud' | 'broodmare' | 'gelding';

interface RatedRow {
  id: string;
  name: string;
  age: number;
  or: number;
}

interface SeasonSnap {
  seed: number;
  /** 시즌 연도(52주 진행 직후 상태의 연도) */
  year: number;
  /** AI 현역마 두수(in_training·resting, 마주 소유, 플레이어 제외) */
  racing: number;
  /** 플레이어 소유 또는 무소속 in_training·resting 두수(집계에서 뺀다, 참고용) */
  nonAiRacing: number;
  byCountry: Record<string, number>;
  /** 나이 버킷(8 = 8세 이상) → 두수 */
  ageCounts: Record<number, number>;
  /** OR 보유 AI 현역마 (OR 내림차순, 동점은 ID 순) */
  rated: RatedRow[];
}

interface RetireRec {
  seed: number;
  /** 교체 연도(1월 1주). 직전 시즌 종료 뒤 교체다. */
  year: number;
  country: string;
  kind: RetireKind;
  /** 은퇴 시점 나이(교체 연도 기준) */
  age: number;
}

/**
 * 교체 직전 상태에서 조기 은퇴 확률 합(기대 두수). 이벤트에는 사유가 없어 실측으로 가를 수 없으므로 기대값으로 본다.
 * 엔진의 밴드 판정과 같은 규칙(첫 매칭 밴드, 나이 8 이상 제외, 3세 이상 OR 은 초기 OR 로 환산, 4세 수말은 거세 확률 제외)을 재현한다.
 */
interface EarlyExpect {
  seed: number;
  /** 교체 연도 */
  year: number;
  country: string;
  stud: number;
  broodmare: number;
}

function chanceOf(bands: readonly EarlyRetireBand[], age: number, value: number): number {
  for (const band of bands) {
    if (age >= band.minAge && age <= band.maxAge && value >= band.minValue) return band.chance;
  }
  return 0;
}

function earlyExpectation(state: GameState, seed: number, year: number): EarlyExpect[] {
  const rows: EarlyExpect[] = POPULATION_COUNTRY_ORDER.map((country) => ({
    seed,
    year,
    country,
    stud: 0,
    broodmare: 0,
  }));
  for (const h of Object.values(state.horses)) {
    if (!isRacingHorse(state, h)) continue;
    const age = ageInYear(h.birthYear, year);
    if (age >= POPULATION_RETIRE_AGE || age < 3) continue;
    const row = rows.find((x) => x.country === h.countryOfBirth);
    if (row === undefined) continue;
    const value = h.officialRating ?? initialOfficialRating(h);
    if (h.sex === 'female') {
      row.broodmare += chanceOf(POPULATION_BROODMARE_RETIRE_BANDS, age, value);
    } else if (!h.gelded) {
      const notGelded = age === POPULATION_GELDING_MIN_AGE ? 1 - POPULATION_GELDING_SHARE : 1;
      row.stud += notGelded * chanceOf(POPULATION_STUD_RETIRE_BANDS, age, value);
    }
  }
  return rows;
}

interface RunResult {
  seed: number;
  retirements: RetireRec[];
  /** 교체 연도별 조기 은퇴 기대값(나라별) */
  expect: EarlyExpect[];
  snaps: SeasonSnap[];
  checkpointJson: string | null;
  finalState: GameState;
}

/* ------------------------------------------------------------------ */
/* 실행                                                                */
/* ------------------------------------------------------------------ */

function compareId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function bucketOf(age: number): number {
  return Math.min(Math.max(age, YOUNGEST_AGE), AGE_BUCKET_MAX);
}

function isRacingStatus(h: Horse): boolean {
  return h.status === 'in_training' || h.status === 'resting';
}

function snapshot(state: GameState, seed: number, year: number): SeasonSnap {
  const byCountry: Record<string, number> = {};
  const ageCounts: Record<number, number> = {};
  const rated: RatedRow[] = [];
  let racing = 0;
  let nonAiRacing = 0;
  for (const h of Object.values(state.horses)) {
    if (!isRacingStatus(h)) continue;
    if (!isRacingHorse(state, h)) {
      nonAiRacing++;
      continue;
    }
    racing++;
    const age = ageInYear(h.birthYear, year);
    byCountry[h.countryOfBirth] = (byCountry[h.countryOfBirth] ?? 0) + 1;
    const bucket = bucketOf(age);
    ageCounts[bucket] = (ageCounts[bucket] ?? 0) + 1;
    if (h.officialRating !== null) rated.push({ id: h.id, name: h.name, age, or: h.officialRating });
  }
  rated.sort((a, b) => b.or - a.or || compareId(a.id, b.id));
  return { seed, year, racing, nonAiRacing, byCountry, ageCounts, rated };
}

/** 은퇴 이벤트를 말 상태(성별·거세)로 분류한다. 상태는 advanceWeek 결과 기준이다. */
function collectRetire(run: RunResult, ev: GameEvent, state: GameState): void {
  if (ev.type !== 'horse_status_changed' || ev.to !== 'retired') return;
  const horse = state.horses[ev.horseId];
  if (horse === undefined) return;
  const kind: RetireKind = horse.sex === 'female' ? 'broodmare' : horse.gelded ? 'gelding' : 'stud';
  run.retirements.push({
    seed: run.seed,
    year: ev.date.year,
    country: horse.countryOfBirth,
    kind,
    age: ageInYear(horse.birthYear, ev.date.year),
  });
}

/** 시드 하나로 weeks 주 진행한다. observe 가 true 면 은퇴·스냅샷을 모은다(상태는 같다). */
function simulate(seed: number, weeks: number, observe: boolean, checkpoint: number | null): RunResult {
  const systems = createGameSystems(STATIC_GAME);
  let state = bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  const run: RunResult = {
    seed,
    retirements: [],
    expect: [],
    snaps: [],
    checkpointJson: null,
    finalState: state,
  };
  for (let w = 1; w <= weeks; w++) {
    // 연초 교체 직전 상태(1월 1주, 교체 전)에서 조기 은퇴 기대값을 잰다
    if (observe && state.date.week === 1 && state.date.year > START_YEAR) {
      run.expect.push(...earlyExpectation(state, seed, state.date.year));
    }
    const res = advanceWeek(state, systems);
    state = res.state;
    if (observe) {
      for (const ev of res.events) collectRetire(run, ev, state);
      if (w % WEEKS_PER_YEAR === 0) {
        run.snaps.push(snapshot(state, seed, START_YEAR + w / WEEKS_PER_YEAR - 1));
      }
    }
    if (checkpoint === w) run.checkpointJson = serializeGame(state, SAVED_AT);
  }
  run.finalState = state;
  return run;
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
/* 지표                                                                */
/* ------------------------------------------------------------------ */

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '-';
}

function num(x: number, digits = 1): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '-';
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? NaN : part / whole;
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function oldShare(s: SeasonSnap): number {
  let old = 0;
  for (const b of BUCKETS) if (b >= OLD_AGE) old += s.ageCounts[b] ?? 0;
  return ratio(old, s.racing);
}

function bucketShare(s: SeasonSnap, bucket: number): number {
  return ratio(s.ageCounts[bucket] ?? 0, s.racing);
}

function bucketLabel(b: number): string {
  return b === AGE_BUCKET_MAX ? `${b}세 이상` : `${b}세`;
}

/** 시즌 종료 OR 상위 N두 중 5세 이하 두수 */
function youngInTop(s: SeasonSnap): number {
  return s.rated.slice(0, TOP_OR_N).filter((r) => r.age <= YOUNG_MAX_AGE).length;
}

interface Dev {
  metric: string;
  measured: string;
  target: string;
  verdict: string;
}

interface Evaluation {
  devs: Dev[];
  oldShareMax: number;
  countryDevMax: number;
  ageShiftMax: number;
  youngPooledMean: number;
  youngBySeed: Map<number, number>;
  /** 시드별 교체 연도별 GB+IE+FR 종마 은퇴 두수 */
  studRef: { seed: number; year: number; count: number }[];
  steadyMeasured: boolean;
}

function evaluate(runs: readonly RunResult[]): Evaluation {
  const devs: Dev[] = [];
  let oldShareMax = 0;
  let countryDevMax = 0;
  let ageShiftMax = 0;
  const youngAll: number[] = [];
  const youngBySeed = new Map<number, number>();
  const studRef: { seed: number; year: number; count: number }[] = [];
  let steadyMeasured = false;

  for (const r of runs) {
    const youngSeed: number[] = [];
    for (const s of r.snaps) {
      const old = oldShare(s);
      oldShareMax = Math.max(oldShareMax, old);
      if (!(old <= OLD_MAX_SHARE)) {
        devs.push({
          metric: `7세 이상 비율 (시드 ${r.seed}, ${s.year} 시즌 종료)`,
          measured: pct(old),
          target: `≤ ${pct(OLD_MAX_SHARE)}`,
          verdict: '초과',
        });
      }
      for (const c of POPULATION_COUNTRY_ORDER) {
        const target = POPULATION_IN_TRAINING[c];
        const got = s.byCountry[c] ?? 0;
        const dev = Math.abs(got - target) / target;
        countryDevMax = Math.max(countryDevMax, dev);
        if (!(dev <= COUNT_TOLERANCE)) {
          devs.push({
            metric: `${c} 현역마 두수 (시드 ${r.seed}, ${s.year} 시즌 종료)`,
            measured: `${got}두`,
            target: `${target}두 ±${pct(COUNT_TOLERANCE)}`,
            verdict: '이탈',
          });
        }
      }
      const young = youngInTop(s);
      youngSeed.push(young);
      youngAll.push(young);
    }
    if (youngSeed.length > 0) youngBySeed.set(r.seed, mean(youngSeed));

    const steady = r.snaps.filter((s) => {
      const season = s.year - START_YEAR + 1;
      return season >= STEADY_FROM && season <= STEADY_TO;
    });
    if (steady.length === STEADY_TO - STEADY_FROM + 1) {
      steadyMeasured = true;
      for (const b of BUCKETS) {
        const values = steady.map((s) => bucketShare(s, b));
        const shift = Math.max(...values) - Math.min(...values);
        ageShiftMax = Math.max(ageShiftMax, shift);
        if (!(shift <= AGE_SHIFT_MAX)) {
          devs.push({
            metric: `${bucketLabel(b)} 비율 변화 (시드 ${r.seed}, ${STEADY_FROM}~${STEADY_TO}시즌)`,
            measured: `${(shift * 100).toFixed(1)}%p`,
            target: `≤ ${(AGE_SHIFT_MAX * 100).toFixed(1)}%p`,
            verdict: '드리프트',
          });
        }
      }
    }

    for (const x of r.expect) {
      if (x.country !== 'GB' && x.country !== 'IE' && x.country !== 'FR') continue;
      const row = studRef.find((s) => s.seed === r.seed && s.year === x.year);
      if (row === undefined) studRef.push({ seed: r.seed, year: x.year, count: x.stud });
      else row.count += x.stud;
    }
  }

  const youngPooledMean = mean(youngAll);
  if (!(youngPooledMean >= TOP_YOUNG_MIN)) {
    devs.push({
      metric: `OR 상위 ${TOP_OR_N}두 중 ${YOUNG_MAX_AGE}세 이하 (시즌 평균)`,
      measured: num(youngPooledMean),
      target: `≥ ${TOP_YOUNG_MIN}두`,
      verdict: '미달',
    });
  }
  return {
    devs,
    oldShareMax,
    countryDevMax,
    ageShiftMax,
    youngPooledMean,
    youngBySeed,
    studRef,
    steadyMeasured,
  };
}

/* ------------------------------------------------------------------ */
/* 리포트                                                              */
/* ------------------------------------------------------------------ */

function renderReport(runs: readonly RunResult[], ev: Evaluation, seeds: readonly number[]): string {
  const L: string[] = [];
  L.push('# M3-F2d AI 현역마 은퇴 규칙 검증 (2026-10-12)');
  L.push('');
  L.push('자동 생성: `tests/verify/f2dRetirement.test.ts` (`VERIFY=1 npx vitest run tests/verify/f2dRetirement.test.ts`).');
  L.push('');
  L.push('## 목표 판정 (맨 위)');
  L.push('');
  L.push('| 목표 | 측정 | 기준 | 판정 |');
  L.push('| --- | --- | --- | --- |');
  L.push(`| 1. 시즌 종료 현역 7세 이상 비율 | 최대 ${pct(ev.oldShareMax)} | ≤ ${pct(OLD_MAX_SHARE)} (모든 시즌) | ${ev.oldShareMax <= OLD_MAX_SHARE ? '충족' : '미충족'} |`);
  L.push(`| 2. 나라별 현역마 두수 | 최대 편차 ${pct(ev.countryDevMax)} | 설정값 ±${pct(COUNT_TOLERANCE)} (모든 시즌) | ${ev.countryDevMax <= COUNT_TOLERANCE ? '충족' : '미충족'} |`);
  L.push(
    `| 3. ${STEADY_FROM}~${STEADY_TO}시즌 나이별 비율 변화 | ${ev.steadyMeasured ? `최대 ${(ev.ageShiftMax * 100).toFixed(1)}%p` : '측정 안 함(시즌 부족)'} | 각 ≤ ${(AGE_SHIFT_MAX * 100).toFixed(1)}%p | ${!ev.steadyMeasured ? '-' : ev.ageShiftMax <= AGE_SHIFT_MAX ? '충족' : '미충족'} |`,
  );
  L.push(
    `| 4. 시즌 종료 OR 상위 ${TOP_OR_N}두 중 ${YOUNG_MAX_AGE}세 이하 | 평균 ${num(ev.youngPooledMean)}두 | ≥ ${TOP_YOUNG_MIN}두 (시즌 평균) | ${ev.youngPooledMean >= TOP_YOUNG_MIN ? '충족' : '미충족'} |`,
  );
  L.push('| 5. 시즌당 종마·번식 은퇴 | 아래 6장 | 보고만(참고: GB+IE+FR 종마 은퇴 15~40두) | 보고 |');
  L.push('| 6. 같은 시드 재현성·저장 왕복 | 테스트 항목 1 | 단언 | 테스트 통과 시 충족 |');
  L.push('');
  if (ev.devs.length === 0) {
    L.push('기준 이탈: 없음');
  } else {
    L.push('기준 이탈 상세:');
    L.push('');
    L.push('| 지표 | 측정값 | 기준 | 판정 |');
    L.push('| --- | --- | --- | --- |');
    for (const d of ev.devs) L.push(`| ${d.metric} | ${d.measured} | ${d.target} | ${d.verdict} |`);
  }
  L.push('');
  L.push('## 실행 조건');
  L.push('');
  L.push('| 항목 | 값 |');
  L.push('| --- | --- |');
  L.push(`| 모드 | ${FULL ? 'FULL (VERIFY=1)' : '기본'} |`);
  L.push(`| 시드 | ${seeds.join(', ')} |`);
  L.push(`| 시즌 수 | ${SEASONS} (시드마다 ${TOTAL_WEEKS}주 연속 진행: 52주 × ${SEASONS} + 연도 전환 1주) |`);
  L.push('| 플레이어 | 아무것도 하지 않음 (AI 만) |');
  L.push('| 집계 대상 | AI 현역마 (in_training·resting, 마주 소유, 플레이어 제외) |');
  L.push('| 시즌 종료 스냅샷 | 52주 진행 직후(연초 교체 전). 교체 연도 Y 의 은퇴는 시즌 Y−1 종료 뒤에 난다 |');
  L.push('| 은퇴 분류 | 이벤트에 사유 필드가 없어 말 상태로 나눈다: 종마 = 수말(거세 안 함), 번식 = 암말, 거세 = 거세마. 8세 이상 강제 은퇴 포함 |');
  L.push('');

  L.push('## 1. 재현성');
  L.push('');
  L.push('| 검사 | 결과 |');
  L.push('| --- | --- |');
  L.push(`| 같은 시드 ${REPRO_WEEKS}주 두 번 → serializeGame 문자열 동일 | 단언 통과 (테스트 항목 1) |`);
  L.push(`| ${REPRO_SAVE_WEEK}주 저장 → 불러오기 → 계속 진행 = 연속 진행 | 단언 통과 (테스트 항목 1) |`);
  L.push(`| 관찰 실행 ${REPRO_WEEKS}주 = 무관찰 실행 ${REPRO_WEEKS}주 | 단언 통과 (테스트 항목 2) |`);
  L.push('');

  L.push('## 2. 목표 1: 시즌 종료 현역 7세 이상 비율');
  L.push('');
  L.push('| 시드 | 시즌 | AI 현역 두수 | 7세 이상 비율 | 8세 이상(기대 0) | 비AI in_training·resting(집계 제외, 참고) |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of runs) {
    for (const s of r.snaps) {
      L.push(
        `| ${r.seed} | ${s.year} | ${s.racing} | ${pct(oldShare(s))} | ${s.ageCounts[AGE_BUCKET_MAX] ?? 0} | ${s.nonAiRacing} |`,
      );
    }
  }
  L.push('');

  L.push('## 3. 목표 2: 나라별 현역마 두수');
  L.push('');
  L.push('| 시드 | 시즌 | ' + POPULATION_COUNTRY_ORDER.map((c) => `${c}(목표 ${POPULATION_IN_TRAINING[c]})`).join(' | ') + ' |');
  L.push('| --- | --- | ' + POPULATION_COUNTRY_ORDER.map(() => '---').join(' | ') + ' |');
  for (const r of runs) {
    for (const s of r.snaps) {
      L.push(
        `| ${r.seed} | ${s.year} | ` +
          POPULATION_COUNTRY_ORDER.map((c) => `${s.byCountry[c] ?? 0}`).join(' | ') +
          ' |',
      );
    }
  }
  L.push('');

  L.push('## 4. 나이별 비율 (시즌 종료, 목표 3)');
  L.push('');
  for (const r of runs) {
    L.push(`### 4-${runs.indexOf(r) + 1}. 시드 ${r.seed}`);
    L.push('');
    L.push('| 시즌 | ' + BUCKETS.map(bucketLabel).join(' | ') + ' |');
    L.push('| --- | ' + BUCKETS.map(() => '---').join(' | ') + ' |');
    for (const s of r.snaps) {
      L.push(`| ${s.year} | ${BUCKETS.map((b) => pct(bucketShare(s, b))).join(' | ')} |`);
    }
    const steady = r.snaps.filter((s) => {
      const season = s.year - START_YEAR + 1;
      return season >= STEADY_FROM && season <= STEADY_TO;
    });
    if (steady.length === STEADY_TO - STEADY_FROM + 1) {
      const shifts = BUCKETS.map((b) => {
        const values = steady.map((s) => bucketShare(s, b));
        return (Math.max(...values) - Math.min(...values)) * 100;
      });
      L.push('');
      L.push(`${STEADY_FROM}~${STEADY_TO}시즌 최대 변화(%p): ${BUCKETS.map((b, i) => `${bucketLabel(b)} ${num(shifts[i] ?? NaN, 2)}`).join(', ')}`);
    }
    L.push('');
  }

  L.push('## 5. 목표 4: 시즌 종료 OR 상위 10두 중 5세 이하');
  L.push('');
  L.push('| 시드 | 시즌 | 5세 이하 두수 |');
  L.push('| --- | --- | --- |');
  for (const r of runs) {
    for (const s of r.snaps) L.push(`| ${r.seed} | ${s.year} | ${youngInTop(s)} |`);
  }
  L.push('');
  for (const r of runs) {
    L.push(`- 시드 ${r.seed} 시즌 평균: ${num(ev.youngBySeed.get(r.seed) ?? NaN)}두`);
  }
  L.push(`- 전체 시즌 평균(시드·시즌 풀링): ${num(ev.youngPooledMean)}두 (기준 ≥ ${TOP_YOUNG_MIN})`);
  L.push('');
  L.push('### 5-2. 마지막 시즌 종료 OR 상위 10두');
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

  L.push('## 6. 목표 5: 시즌당 종마·번식·거세 은퇴 (교체 연도별, 나라별)');
  L.push('');
  L.push(
    '교체 연도 Y 는 시즌 Y−1 종료 뒤 1월 1주 교체다. 종마 = 은퇴한 수말(거세 안 함), 번식 = 은퇴한 암말, 거세 = 거세마. 괄호 안은 그중 8세 이상 강제 은퇴.',
  );
  L.push(
    '주의: 종 칸은 조기 은퇴(상위마)와 나이별 하위 정리·8세 강제 은퇴를 합친 수다. 이벤트에 사유가 없어 가를 수 없다(보고 사항). 조기 은퇴만의 기대 두수는 아래 6-3 에 적는다.',
  );
  L.push('');
  for (const r of runs) {
    L.push(`### 6-${runs.indexOf(r) + 1}. 시드 ${r.seed}`);
    L.push('');
    L.push('| 교체 연도 | ' + POPULATION_COUNTRY_ORDER.join(' | ') + ' | 합계 |');
    L.push('| --- | ' + POPULATION_COUNTRY_ORDER.map(() => '---').join(' | ') + ' | --- |');
    for (let k = 1; k <= SEASONS; k++) {
      const year = START_YEAR + k;
      const cells: string[] = [];
      let sumStud = 0;
      let sumBroodmare = 0;
      let sumGelding = 0;
      let sumAll = 0;
      for (const c of POPULATION_COUNTRY_ORDER) {
        const rs = r.retirements.filter((x) => x.year === year && x.country === c);
        const stud = rs.filter((x) => x.kind === 'stud');
        const broodmare = rs.filter((x) => x.kind === 'broodmare');
        const gelding = rs.filter((x) => x.kind === 'gelding');
        const forced = rs.filter((x) => x.age >= AGE_BUCKET_MAX).length;
        sumStud += stud.length;
        sumBroodmare += broodmare.length;
        sumGelding += gelding.length;
        sumAll += rs.length;
        cells.push(`종 ${stud.length} / 번 ${broodmare.length} / 거 ${gelding.length} (강제 ${forced})`);
      }
      L.push(`| ${year} | ${cells.join(' | ')} | 종 ${sumStud} / 번 ${sumBroodmare} / 거 ${sumGelding} (합 ${sumAll}) |`);
    }
    L.push('');
  }
  L.push('### 6-3. 조기 은퇴 기대 두수(교체 직전 상태 기준 확률 합)');
  L.push('');
  L.push('| 시드 | 교체 연도 | 나라 | 종마 기대 | 번식 기대 |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const r of runs) {
    for (const x of r.expect) {
      L.push(`| ${r.seed} | ${x.year} | ${x.country} | ${num(x.stud)} | ${num(x.broodmare)} |`);
    }
  }
  L.push('');
  L.push('참고 범위 검사(GB+IE+FR 종마 조기 은퇴 기대, 교체 1회당 15~40두):');
  L.push('');
  L.push('| 시드 | 교체 연도 | GB+IE+FR 종마 기대 | 범위 안 |');
  L.push('| --- | --- | --- | --- |');
  for (const row of ev.studRef) {
    const inside = row.count >= STUD_REF_MIN && row.count <= STUD_REF_MAX;
    L.push(`| ${row.seed} | ${row.year} | ${num(row.count)} | ${inside ? '예' : '아니오(참고만)'} |`);
  }
  L.push('');

  const studVals = ev.studRef.map((x) => x.count);
  const mareVals: number[] = [];
  for (const r of runs) {
    for (let k = 1; k <= SEASONS; k++) {
      const year = START_YEAR + k;
      mareVals.push(r.expect.filter((x) => x.year === year).reduce((a, x) => a + x.broodmare, 0));
    }
  }
  const nonAiMax = Math.max(0, ...runs.flatMap((r) => r.snaps.map((s) => s.nonAiRacing)));
  L.push('## 7. 보고 사항');
  L.push('');
  L.push(
    '- 은퇴 이벤트(horse_status_changed)에 사유 필드가 없다. 조기 은퇴와 나이별 정리를 실측으로 가르지 못해 6-3 기대값으로 대체했다. 이벤트 타입은 바꾸지 않았다.',
  );
  L.push(
    `- GB+IE+FR 종마 조기 은퇴 기대: ${num(Math.min(...studVals))}~${num(Math.max(...studVals))}두/교체 (참고 범위 ${STUD_REF_MIN}~${STUD_REF_MAX}두).`,
  );
  L.push(
    `- 5개국 암말 조기 은퇴 기대: ${num(Math.min(...mareVals), 0)}~${num(Math.max(...mareVals), 0)}두/교체. 번식 표의 나이별 '그 밖' 행(5세 0.15, 6세 0.50, 7세 0.80)이 평가값과 무관하게 적용되어, 암말 은퇴가 상위마에 한정되지 않는다.`,
  );
  L.push(
    `- 비AI in_training·resting 두수(플레이어 소유 또는 무소속, 집계 제외): 시즌당 최대 ${nonAiMax}두.`,
  );
  L.push(
    '- 초기 나이 분포(config POPULATION_AGE_SHARES)를 정상 상태 분포(26/24/20.7/15.7/9.1/4.5%)에 맞춰 바꿨다. 이전 값(30/30/18/11/7/4%)은 정상 상태까지 약 6년의 과도기가 있어 목표 3을 막았다.',
  );
  L.push(
  );
  L.push('');
  L.push('## 참고: 집계 범위');
  L.push('');
  L.push(`- 시즌 스냅샷 연도: ${runs.map((r) => `시드 ${r.seed}: ${r.snaps.map((s) => s.year).join(', ')}`).join(' / ')}`);
  L.push(`- 목표 3 측정 시즌: ${STEADY_FROM}~${STEADY_TO}시즌 ${ev.steadyMeasured ? '(측정됨)' : '(FULL 모드에서만 측정)'}`);
  L.push('');
  return L.join('\n');
}

/* ------------------------------------------------------------------ */
/* 테스트                                                              */
/* ------------------------------------------------------------------ */

describe('AI 현역마 은퇴 규칙 검증 (M3-F2d)', () => {
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

  it(`측정: 시드 ${FULL ? FULL_SEEDS.length : 1}개 × ${SEASONS}시즌 관찰 실행, 목표 1~4 집계${FULL ? ', 리포트 작성' : ''}`, () => {
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

    const ev = evaluate(runs);
    say(
      `[f2d] 시드 ${seeds.join(',')} × ${SEASONS}시즌: 7세 이상 최대 ${pct(ev.oldShareMax)}, ` +
        `나라별 두수 최대 편차 ${pct(ev.countryDevMax)}, 3~5시즌 나이 비율 최대 변화 ${(ev.ageShiftMax * 100).toFixed(1)}%p, ` +
        `OR 상위 ${TOP_OR_N}두 중 ${YOUNG_MAX_AGE}세 이하 평균 ${num(ev.youngPooledMean)}두, 기준 이탈 ${ev.devs.length}건`,
    );
    for (const r of runs) {
      const studGbIeFr = ev.studRef.filter((x) => x.seed === r.seed).map((x) => x.count);
      say(`[f2d] 시드 ${r.seed} GB+IE+FR 종마 은퇴(교체 연도별): ${studGbIeFr.join(', ')}`);
    }

    if (FULL) {
      const text = renderReport(runs, ev, seeds);
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, text, 'utf8');
    }

    // 기본 모드: 1시즌 목표 1·2 만 단언한다. FULL 모드: 목표 1~4 전부 단언한다.
    for (const r of runs) {
      for (const s of r.snaps) {
        expect(oldShare(s), `7세 이상 비율 (시드 ${r.seed}, ${s.year})`).toBeLessThanOrEqual(OLD_MAX_SHARE);
        for (const c of POPULATION_COUNTRY_ORDER) {
          const target = POPULATION_IN_TRAINING[c];
          const dev = Math.abs((s.byCountry[c] ?? 0) - target) / target;
          expect(dev, `${c} 두수 (시드 ${r.seed}, ${s.year})`).toBeLessThanOrEqual(COUNT_TOLERANCE);
        }
      }
    }
    if (FULL) {
      expect(ev.steadyMeasured).toBe(true);
      expect(ev.ageShiftMax).toBeLessThanOrEqual(AGE_SHIFT_MAX);
      expect(ev.youngPooledMean).toBeGreaterThanOrEqual(TOP_YOUNG_MIN);
      expect(existsSync(REPORT_PATH)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);
});

