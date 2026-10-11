import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getNamePool, getRaces, getRacecourse } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { runRace } from '../../src/engine/race/runRace';
import { generateSampleField } from '../../src/engine/race/sampleField';
import { impliedProbability, oddsToDecimal } from '../../src/engine/race/odds';
import { AW_GOING_ORDER, DIRT_GOING_ORDER, TURF_GOING_ORDER } from '../../src/engine/types';
import type { FractionalOdds, GameDate, Going, Margin, RunningStyle, Surface } from '../../src/engine/types';

/** 지표 출력. console.log 는 기본 리포터에서 숨겨지므로 stdout 에 직접 쓴다. */
function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/** VERIFY=1 이면 전체(3000회 + 리포트 작성), 아니면 기본(200회, 지표 계산만) */
const FULL = !!process.env.VERIFY;
const RACE_COUNT = FULL ? 3000 : 200;
const SEED_BASE = 1000;
const LEVEL = 60;
const DATE: GameDate = { year: 2026, week: 24 };
const TEST_TIMEOUT_MS = FULL ? 1_800_000 : 120_000;

/** 명세 목표: 인기 1위 승률 25~35% */
const FAV1_TARGET_MIN = 0.25;
const FAV1_TARGET_MAX = 0.35;
/** 기본 모드 단언 범위 (느슨) */
const FAV1_LOOSE_MIN = 0.1;
const FAV1_LOOSE_MAX = 0.6;
/** 명세 외 참고선: 게이트·작전 비(比)가 이 범위를 벗어나면 참고 관찰에 적는다(판정 아님) */
const REF_RATIO_MIN = 0.8;
const REF_RATIO_MAX = 1.2;
/** 이변 기준: 분수 오즈 10/1 이상 */
const UPSET_MIN_RATIO = 10;
/** 오즈 구간 경계(소수 오즈). 이 값 이상이면 다음 구간. 0번 구간은 2 미만. */
const CALIB_EDGES = [2, 3, 5, 8, 11, 21, 51] as const;
const CALIB_LABELS = [
  '소수 1~2 (1/1 미만)',
  '소수 2~3 (1/1~2/1)',
  '소수 3~5 (2/1~4/1)',
  '소수 5~8 (4/1~7/1)',
  '소수 8~11 (7/1~10/1 미만)',
  '소수 11~21 (10/1~20/1)',
  '소수 21~51 (20/1~50/1)',
  '소수 51 이상',
] as const;

const REPORT_PATH = fileURLToPath(
  new URL('../../docs/reports/2026-10-11-m1-race-balance.md', import.meta.url),
);

const STYLES: readonly RunningStyle[] = ['front', 'prominent', 'midfield', 'held_up'];
const STYLE_KO: Record<RunningStyle, string> = {
  front: '선행 (front)',
  prominent: '선입 (prominent)',
  midfield: '중위 (midfield)',
  held_up: '추입 (held_up)',
};
const GATE_KO = ['내측 1/3', '중간 1/3', '외측 1/3'] as const;
const MARGIN_ORDER = [
  '동착',
  '코',
  '짧은머리',
  '머리',
  '목',
  '1마신 미만',
  '1~3마신',
  '3~10마신',
  '10마신 이상',
  '디스턴스(대차)',
  '2착 없음(1착 동착)',
] as const;

function goingOrderFor(surface: Surface): readonly Going[] {
  if (surface === 'turf') return TURF_GOING_ORDER;
  if (surface === 'aw') return AW_GOING_ORDER;
  return DIRT_GOING_ORDER;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`인덱스 범위 밖 (${index})`);
  }
  return item;
}

function isPermutationOf1toN(values: readonly number[]): boolean {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.every((v, k) => v === k + 1);
}

/** 착차 라벨을 보고서용 구간으로 묶는다. */
function marginBucket(m: Margin | null | undefined): string {
  if (m === null || m === undefined) return '2착 없음(1착 동착)';
  switch (m.label) {
    case 'dead_heat':
      return '동착';
    case 'nose':
      return '코';
    case 'short_head':
      return '짧은머리';
    case 'head':
      return '머리';
    case 'neck':
      return '목';
    case 'lengths':
      if (m.lengths < 1) return '1마신 미만';
      if (m.lengths < 3) return '1~3마신';
      if (m.lengths < 10) return '3~10마신';
      return '10마신 이상';
    case 'distance':
      return '디스턴스(대차)';
    default:
      return '2착 없음(1착 동착)';
  }
}

interface Count {
  starts: number;
  wins: number;
}

interface GateCell {
  name: string;
  runners: number[];
  wins: number[];
}

interface TimeCell {
  course: string;
  distance: number;
  going: string;
  n: number;
  sum: number;
  min: number;
  max: number;
}

interface CalibCell {
  starts: number;
  wins: number;
  /** 레이스 안에서 정규화한 내재 확률의 합 */
  probSum: number;
}

interface Agg {
  races: number;
  incomplete: number;
  integrityFail: number;
  starters: number;
  winners: number;
  /** 인기 1·2·3위 우승 수 (동착은 각각 집계) */
  favWins: number[];
  strengthWins: number;
  gate: Map<string, GateCell>;
  style: Map<RunningStyle, Count>;
  going: Map<string, Count>;
  time: Map<string, TimeCell>;
  margin: Map<string, number>;
  marginTotal: number;
  upsetStarts: number;
  upsetWins: number;
  upsetRaces: number;
  /** 마장 -> 그 마장으로 달린 레이스 id 집합 (교란 확인용) */
  goingRaces: Map<string, Set<string>>;
  calib: CalibCell[];
}

function newAgg(): Agg {
  const style = new Map<RunningStyle, Count>();
  for (const s of STYLES) style.set(s, { starts: 0, wins: 0 });
  return {
    races: 0,
    incomplete: 0,
    integrityFail: 0,
    starters: 0,
    winners: 0,
    favWins: [0, 0, 0],
    strengthWins: 0,
    gate: new Map(),
    style,
    going: new Map(),
    time: new Map(),
    margin: new Map(),
    marginTotal: 0,
    upsetStarts: 0,
    upsetWins: 0,
    upsetRaces: 0,
    goingRaces: new Map(),
    calib: CALIB_LABELS.map(() => ({ starts: 0, wins: 0, probSum: 0 })),
  };
}

function bump(map: Map<string, Count>, key: string, won: boolean): void {
  const c = map.get(key) ?? { starts: 0, wins: 0 };
  c.starts++;
  if (won) c.wins++;
  map.set(key, c);
}

/** 레이스 i 를 실행하고 집계에 반영한다. */
function tally(agg: Agg, i: number): void {
  const seed = SEED_BASE + i;
  const races = getRaces();
  const race = at(races, seed % races.length);
  const course = getRacecourse(race.racecourseId);
  const goings = goingOrderFor(course.surface);
  const going = at(goings, Math.floor(seed / races.length) % goings.length);
  const size = 4 + (seed % (race.maxRunners - 3));

  const field = generateSampleField(createRng(seed).fork('field'), {
    size,
    distance: race.distance,
    surface: course.surface,
    year: DATE.year,
    namePool: getNamePool(),
    level: LEVEL,
  });
  const out = runRace({
    race,
    course,
    going,
    date: DATE,
    seed,
    field,
    recordReplay: false,
  });

  const { entries, strengths, sim } = out;
  const res = sim.result;
  const n = entries.length;

  // 완주 판정: 두수 일치, 1착 존재, 결승 시각 유한, 오즈 산출 완료
  const odds: FractionalOdds[] = [];
  for (const e of entries) {
    if (e.odds !== null) odds.push(e.odds);
  }
  const finished =
    res.runners.length === n &&
    odds.length === n &&
    res.runners.some((r) => r.position === 1) &&
    res.runners.every((r) => Number.isFinite(r.finishTime) && r.finishTime > 0);
  if (!finished) {
    agg.incomplete++;
    return;
  }
  agg.races++;

  if (
    !isPermutationOf1toN(entries.map((e) => e.draw)) ||
    !isPermutationOf1toN(entries.map((e) => e.saddleCloth))
  ) {
    agg.integrityFail++;
  }

  const winnerSet = new Set(res.runners.filter((r) => r.position === 1).map((r) => r.runnerIndex));

  // 인기 순위: 소수 오즈 오름차순, 동률은 마번 작은 말
  const dec = odds.map((o) => oddsToDecimal(o));
  const implied = odds.map((o) => impliedProbability(o));
  const impliedSum = implied.reduce((a, b) => a + b, 0);
  const gr = agg.goingRaces.get(going) ?? new Set<string>();
  gr.add(race.id);
  agg.goingRaces.set(going, gr);
  const order = entries
    .map((_, idx) => idx)
    .sort((a, b) => at(dec, a) - at(dec, b) || at(entries, a).saddleCloth - at(entries, b).saddleCloth);
  for (let k = 0; k < 3 && k < order.length; k++) {
    if (winnerSet.has(at(order, k))) agg.favWins[k] = (agg.favWins[k] ?? 0) + 1;
  }

  // 전력 1위 (strength 최댓값, 동률은 앞 index)
  let best = 0;
  for (let idx = 1; idx < strengths.length; idx++) {
    if (at(strengths, idx) > at(strengths, best)) best = idx;
  }
  if (winnerSet.has(best)) agg.strengthWins++;

  // 말 단위 집계: 게이트 / 작전 / 마장 / 이변
  const gateKey = course.id;
  if (!agg.gate.has(gateKey)) {
    agg.gate.set(gateKey, {
      name: course.name,
      runners: [0, 0, 0],
      wins: [0, 0, 0],
    });
  }
  const gateCell = agg.gate.get(gateKey);
  let upsetWonThisRace = false;

  for (let idx = 0; idx < n; idx++) {
    const e = at(entries, idx);
    const won = winnerSet.has(idx);
    const o = at(odds, idx);
    const bucket = Math.min(2, Math.floor(((e.draw - 1) * 3) / n));

    agg.starters++;
    if (won) agg.winners++;

    if (gateCell !== undefined) {
      gateCell.runners[bucket] = (gateCell.runners[bucket] ?? 0) + 1;
      if (won) gateCell.wins[bucket] = (gateCell.wins[bucket] ?? 0) + 1;
    }

    const styleCount = agg.style.get(e.tactic) ?? { starts: 0, wins: 0 };
    styleCount.starts++;
    if (won) styleCount.wins++;
    agg.style.set(e.tactic, styleCount);

    bump(agg.going, going, won);

    const d = at(dec, idx);
    let cb = 0;
    while (cb < CALIB_EDGES.length && d >= at(CALIB_EDGES, cb)) cb++;
    const cell = at(agg.calib, cb);
    cell.starts++;
    if (won) cell.wins++;
    cell.probSum += impliedSum === 0 ? 0 : at(implied, idx) / impliedSum;

    if (o.num / o.den >= UPSET_MIN_RATIO) {
      agg.upsetStarts++;
      if (won) {
        agg.upsetWins++;
        upsetWonThisRace = true;
      }
    }
  }
  if (upsetWonThisRace) agg.upsetRaces++;

  // 우승 시간
  const timeKey = `${course.id}|${race.distance}|${going}`;
  const t = agg.time.get(timeKey) ?? {
    course: course.name,
    distance: race.distance,
    going,
    n: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
  };
  t.n++;
  t.sum += res.winningTime;
  t.min = Math.min(t.min, res.winningTime);
  t.max = Math.max(t.max, res.winningTime);
  agg.time.set(timeKey, t);

  // 2착 착차 (1착과의 차)
  const second = res.runners.find((r) => r.position === 2);
  const mb = marginBucket(second === undefined ? null : second.margin);
  agg.margin.set(mb, (agg.margin.get(mb) ?? 0) + 1);
  agg.marginTotal++;
}

function safeRatio(bucketWins: number, totalWins: number, bucketRuns: number, totalRuns: number): number {
  if (totalWins === 0 || totalRuns === 0 || bucketRuns === 0) return NaN;
  return (bucketWins / totalWins) / (bucketRuns / totalRuns);
}

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '-';
}

function num(x: number, digits = 2): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '-';
}

/** 집계 결과를 마크다운 리포트로 만든다. 목표 이탈 지표는 맨 위에 둔다. */
function renderReport(agg: Agg, meta: { elapsedSec: number }): {
  text: string;
  deviations: string[];
  refNotes: string[];
  fav1: number;
} {
  const races = agg.races;
  const fav = agg.favWins.map((w) => (races === 0 ? NaN : w / races));
  const fav1 = fav[0] ?? NaN;
  const strengthRate = races === 0 ? NaN : agg.strengthWins / races;

  // 목표 이탈
  const deviations: string[] = [];
  if (!(fav1 >= FAV1_TARGET_MIN && fav1 <= FAV1_TARGET_MAX)) {
    deviations.push(
      `| 인기 1위 승률 | ${pct(fav1)} | ${pct(FAV1_TARGET_MIN)}~${pct(FAV1_TARGET_MAX)} | ${fav1 > FAV1_TARGET_MAX ? '초과(인기 쏠림)' : '미달(인기 무력)'} |`,
    );
  }

  // 참고 관찰 (명세 외 참고선)
  const refNotes: string[] = [];
  for (const [, cell] of agg.gate) {
    const totalW = cell.wins.reduce((a, b) => a + b, 0);
    const totalR = cell.runners.reduce((a, b) => a + b, 0);
    cell.runners.forEach((r, b) => {
      const rt = safeRatio(cell.wins[b] ?? 0, totalW, r, totalR);
      if (Number.isFinite(rt) && (rt < REF_RATIO_MIN || rt > REF_RATIO_MAX)) {
        refNotes.push(`- 게이트 ${cell.name} ${GATE_KO[b]}: 승리 비 ${num(rt)} (참고선 ${REF_RATIO_MIN}~${REF_RATIO_MAX})`);
      }
    });
  }
  for (const s of STYLES) {
    const c = agg.style.get(s) ?? { starts: 0, wins: 0 };
    const rt = safeRatio(c.wins, agg.winners, c.starts, agg.starters);
    if (Number.isFinite(rt) && (rt < REF_RATIO_MIN || rt > REF_RATIO_MAX)) {
      refNotes.push(`- 작전 ${STYLE_KO[s]}: 승리 비 ${num(rt)} (참고선 ${REF_RATIO_MIN}~${REF_RATIO_MAX})`);
    }
  }

  const L: string[] = [];
  L.push('# M1 레이스 밸런스 리포트 (2026-10-11)');
  L.push('');
  L.push('자동 생성: `tests/verify/balance.test.ts` (`VERIFY=1 npm run test:verify`).');
  L.push('');
  L.push('## 목표 범위 이탈 지표');
  L.push('');
  if (deviations.length === 0) {
    L.push('없음');
  } else {
    L.push('| 지표 | 측정값 | 목표 | 판정 |');
    L.push('| --- | --- | --- | --- |');
    for (const d of deviations) L.push(d);
  }
  L.push('');
  L.push('명세에 목표 범위가 정의된 지표는 인기 1위 승률(25~35%) 하나뿐이다. 나머지 표는 목표 판정 없이 수치만 남긴다.');
  L.push('');
  L.push('### 참고 관찰 (명세 외 참고선, 판정 아님)');
  L.push('');
  if (refNotes.length === 0) {
    L.push(`없음 (게이트·작전 비가 ${REF_RATIO_MIN}~${REF_RATIO_MAX} 안)`);
  } else {
    L.push(`게이트·작전 비가 ${REF_RATIO_MIN}~${REF_RATIO_MAX} 를 벗어난 항목 (Haiku 가 임의로 잡은 참고선이며 명세 목표가 아니다):`);
    L.push('');
    for (const r of refNotes) L.push(r);
  }
  L.push('');
  L.push('교란 주의: 마장은 레이스와 함께 결정되므로 레이스 종류 수가 1 인 마장의 마장 효과는 레이스 효과와 섞여 있다.');
  for (const [g, set] of agg.goingRaces) {
    if (set.size === 1) L.push(`- 마장 ${g}: 레이스 1종에만 배정됨 (${[...set][0] ?? '-'})`);
  }
  L.push('');

  L.push('## 실행 조건');
  L.push('');
  L.push('| 항목 | 값 |');
  L.push('| --- | --- |');
  L.push(`| 레이스 수 | ${RACE_COUNT} (완주 ${races}, 완주 실패 ${agg.incomplete}) |`);
  L.push(`| 시드 범위 | ${SEED_BASE} ~ ${SEED_BASE + RACE_COUNT - 1} (s = 1000 + i) |`);
  L.push('| 레이스 선택 | getRaces()[s % 12] |');
  L.push('| 두수 | 4 + (s % (maxRunners - 3)) |');
  L.push('| 마장 | 코스 surface 목록[floor(s / 12) % 길이] (turf 7단계 / aw 3단계) |');
  L.push('| 능력 수준 | level 60 |');
  L.push('| 실행 방식 | runRace, recordReplay = false |');
  L.push(`| 출주 총수 | ${agg.starters} |`);
  L.push(`| 우승 총수 (동착 포함) | ${agg.winners} |`);
  L.push(`| 데이터 무결성 위반 | ${agg.integrityFail} (게이트·마번 순열 검사) |`);
  L.push(`| 소요 시간 | ${num(meta.elapsedSec, 1)} s (집계 전체) |`);
  L.push('');
  // 1. 인기 순위별 승률
  L.push('## 1. 인기 순위별 승률');
  L.push('');
  L.push('인기 = 소수 오즈 오름차순, 동률은 마번 작은 말. 승률 = 해당 순위 말이 1착(동착 포함)한 레이스 비율.');
  L.push('');
  L.push('| 인기 | 우승 수 | 승률 | 목표 |');
  L.push('| --- | --- | --- | --- |');
  L.push(`| 1위 | ${agg.favWins[0]} | ${pct(fav[0] ?? NaN)} | ${pct(FAV1_TARGET_MIN)}~${pct(FAV1_TARGET_MAX)} |`);
  L.push(`| 2위 | ${agg.favWins[1]} | ${pct(fav[1] ?? NaN)} | 명세 없음 |`);
  L.push(`| 3위 | ${agg.favWins[2]} | ${pct(fav[2] ?? NaN)} | 명세 없음 |`);
  L.push('');

  // 2. 전력 1위
  L.push('## 2. 예상 전력(strength) 1위 승률');
  L.push('');
  L.push('시장 노이즈가 빠진 능력 지표의 1위(동률은 앞 index)가 이긴 비율. 인기 1위 승률과 비교해 시장 온도를 읽는다.');
  L.push('');
  L.push('| 지표 | 우승 수 | 레이스 수 | 승률 |');
  L.push('| --- | --- | --- | --- |');
  L.push(`| 전력 1위 | ${agg.strengthWins} | ${races} | ${pct(strengthRate)} |`);
  L.push('');

  // 3. 게이트
  L.push('## 3. 게이트 위치별 승률 (코스별)');
  L.push('');
  L.push('게이트(draw) 를 안쪽 1/3·중간 1/3·바깥 1/3 으로 나눈다(draw 1..N 기준 floor((draw-1)*3/N)).');
  L.push('승리 비율 = 구간 우승 수 / 전체 우승 수, 출주 비율 = 구간 출주 수 / 전체 출주 수, 비 = 승리 비율 / 출주 비율 (1.00 = 중립).');
  L.push('');
  L.push('| 코스 | 구간 | 출주 | 우승 | 출주 비율 | 승리 비율 | 비 (승리/출주) |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [, cell] of agg.gate) {
    const totalW = cell.wins.reduce((a, b) => a + b, 0);
    const totalR = cell.runners.reduce((a, b) => a + b, 0);
    cell.runners.forEach((r, b) => {
      const w = cell.wins[b] ?? 0;
      const rt = safeRatio(w, totalW, r, totalR);
      L.push(
        `| ${cell.name} | ${GATE_KO[b]} | ${r} | ${w} | ${pct(r / totalR)} | ${pct(totalW === 0 ? NaN : w / totalW)} | ${num(rt)} |`,
      );
    });
  }
  L.push('');

  // 4. 작전
  L.push('## 4. 작전별 승률');
  L.push('');
  L.push('승률 = 우승 수 / 출주 수. 비 = (작전 우승 / 전체 우승) / (작전 출주 / 전체 출주), 1.00 = 중립.');
  L.push('');
  L.push('| 작전 | 우승 | 출주 | 승률 (우승/출주) | 승리 비율 | 출주 비율 | 비 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of STYLES) {
    const c = agg.style.get(s) ?? { starts: 0, wins: 0 };
    L.push(
      `| ${STYLE_KO[s]} | ${c.wins} | ${c.starts} | ${pct(c.starts === 0 ? NaN : c.wins / c.starts)} | ${pct(agg.winners === 0 ? NaN : c.wins / agg.winners)} | ${pct(agg.starters === 0 ? NaN : c.starts / agg.starters)} | ${num(safeRatio(c.wins, agg.winners, c.starts, agg.starters))} |`,
    );
  }
  L.push('');

  // 5. 우승 시간
  L.push('## 5. 우승 시간 (코스·거리·마장별)');
  L.push('');
  L.push('| 코스 | 거리(m) | 마장 | 레이스 수 | 평균 우승 시간(s) | 최소(s) | 최대(s) |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  const timeRows = [...agg.time.values()].sort(
    (a, b) => a.course.localeCompare(b.course) || a.distance - b.distance || a.going.localeCompare(b.going),
  );
  for (const t of timeRows) {
    L.push(
      `| ${t.course} | ${t.distance} | ${t.going} | ${t.n} | ${num(t.sum / t.n, 2)} | ${num(t.min, 2)} | ${num(t.max, 2)} |`,
    );
  }
  L.push('');

  // 5-2. 마장별 승률 (보조)
  L.push('### 5-2. 마장별 승률 (보조)');
  L.push('');
  L.push('승률 (우승/출주)은 두수에 따라 기저율(1/두수)이 달라 마장끼리 직접 비교에 적합하지 않다. 비 열(출주 대비 승리 비)을 우선 본다.');
  L.push('');
  L.push('| 마장 | 우승 | 출주 | 승률 (우승/출주) | 비 (승리/출주) | 레이스 종류 수 |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  const goingRows = [...agg.going.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [g, c] of goingRows) {
    const rc = agg.goingRaces.get(g)?.size ?? 0;
    L.push(
      `| ${g} | ${c.wins} | ${c.starts} | ${pct(c.starts === 0 ? NaN : c.wins / c.starts)} | ${num(safeRatio(c.wins, agg.winners, c.starts, agg.starters))} | ${rc} |`,
    );
  }
  L.push('');

  // 6. 착차
  L.push('## 6. 2착 착차 분포 (1착과의 차)');
  L.push('');
  L.push('| 구간 | 건수 | 비율 |');
  L.push('| --- | --- | --- |');
  for (const label of MARGIN_ORDER) {
    const c = agg.margin.get(label) ?? 0;
    L.push(`| ${label} | ${c} | ${pct(agg.marginTotal === 0 ? NaN : c / agg.marginTotal)} |`);
  }
  L.push('');

  // 7. 이변
  L.push('## 7. 이변: 오즈 10/1 이상 말의 우승 비율');
  L.push('');
  L.push('분수 오즈 num/den >= 10 인 말. 우승 비율 = 해당 말의 우승 수 / 해당 말의 출주 수.');
  L.push('');
  L.push('| 구분 | 출주 | 우승 | 우승 비율 |');
  L.push('| --- | --- | --- | --- |');
  L.push(
    `| 10/1 이상 | ${agg.upsetStarts} | ${agg.upsetWins} | ${pct(agg.upsetStarts === 0 ? NaN : agg.upsetWins / agg.upsetStarts)} |`,
  );
  L.push('');
  L.push(
    `10/1 이상 말이 우승한 레이스 비율: ${agg.upsetRaces} / ${races} = ${pct(races === 0 ? NaN : agg.upsetRaces / races)}`,
  );
  L.push('');

  // 7-2. 오즈 구간별 내재 확률 대비 실제 승률 (보조)
  L.push('### 7-2. 오즈 구간별 내재 확률 대비 실제 승률 (보조)');
  L.push('');
  L.push('내재 확률은 레이스 안에서 den/(num+den) 을 합 1 로 정규화한 값(오버라운드 제거). 실제/내재 = 1.00 이면 시장이 맞다.');
  L.push('');
  L.push('| 소수 오즈 구간 | 출주 | 우승 | 실제 승률 | 평균 내재 확률 | 실제/내재 |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  CALIB_LABELS.forEach((label, b) => {
    const c = at(agg.calib, b);
    const actual = c.starts === 0 ? NaN : c.wins / c.starts;
    const expected = c.starts === 0 ? NaN : c.probSum / c.starts;
    L.push(`| ${label} | ${c.starts} | ${c.wins} | ${pct(actual)} | ${pct(expected)} | ${num(actual / expected)} |`);
  });
  L.push('');

  return { text: L.join('\n') + '\n', deviations, refNotes, fav1 };
}

describe('밸런스 지표 집계', () => {
  it(`레이스 ${RACE_COUNT}회 자동 진행, 지표 집계${FULL ? ', 리포트 작성' : ''}`, () => {
    const t0 = performance.now();
    const agg = newAgg();
    for (let i = 0; i < RACE_COUNT; i++) {
      tally(agg, i);
    }
    const elapsedSec = (performance.now() - t0) / 1000;

    const { text, deviations, refNotes, fav1 } = renderReport(agg, { elapsedSec });

    say(
      `[밸런스] 레이스 ${RACE_COUNT}, 완주 ${agg.races}, 실패 ${agg.incomplete}, 무결성 위반 ${agg.integrityFail}, ` +
        `인기 1위 승률 ${(fav1 * 100).toFixed(1)}%, 목표 이탈 ${deviations.length}건, 참고 관찰 ${refNotes.length}건, ` +
        `소요 ${elapsedSec.toFixed(1)}s`,
    );

    // 모든 레이스 완주, 무결성은 두 모드 공통 단언
    expect(agg.incomplete).toBe(0);
    expect(agg.integrityFail).toBe(0);
    expect(agg.races).toBe(RACE_COUNT);

    if (FULL) {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, text, 'utf8');
      expect(existsSync(REPORT_PATH)).toBe(true);
    } else {
      // 기본 모드: 느슨한 범위만 단언. 목표 이탈은 실패로 만들지 않는다.
      expect(fav1).toBeGreaterThanOrEqual(FAV1_LOOSE_MIN);
      expect(fav1).toBeLessThanOrEqual(FAV1_LOOSE_MAX);
    }
  }, TEST_TIMEOUT_MS);
});
