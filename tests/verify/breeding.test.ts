/**
 * M2-11 배합·유전 검증 (명세: docs/specs/M2-11-breeding-verification.md, 개정 1~3)
 *
 * 기본 모드(npm test): 작은 규모(세대 3, 집단 60)로 구조·재현성만 단언한다.
 * FULL 모드(VERIFY=1): 명세 규모로 돌리고 기준 이탈을 리포트 맨 위에 적는다.
 *   기준 미달은 테스트 실패로 두지 않는다(판단은 Opus). 구조가 깨지면 실패한다.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  breed,
  isComplementary,
  ownComplement,
  type BreedArgs,
  type HorseLookup,
} from '../../src/engine/breeding/genetics';
import {
  dominantCrosses,
  findInbreeding,
  ownBloodPercent,
  totalBloodPercent,
} from '../../src/engine/breeding/inbreeding';
import { nickValue } from '../../src/engine/breeding/nicks';
import { buildMatingPedigree, type PedigreeLookup } from '../../src/engine/breeding/pedigree';
import { IN_TRAINING_ABILITY_WEIGHT } from '../../src/engine/config/assessment';
import {
  COMPLEMENT_BONUS,
  INBREED_EXCESS_FROM,
  INBREED_EXCESS_POTENTIAL_PENALTY,
  INBREED_EXCESS_SOUNDNESS_PENALTY,
  INBREED_LOW,
  NICK_EFFECT_MAX,
  POPULATION_MEAN,
  REGRESSION_TO_MEAN,
  SIRE_WEIGHT,
  SOUNDNESS_REGRESSION,
} from '../../src/engine/config/genetics';
import { PROFILE_DISTANCE } from '../../src/engine/config/world';
import { SOUNDNESS_MEAN } from '../../src/engine/config/horse';
import { getNicks, getSireLines } from '../../src/engine/data/staticData';
import { assessHorse } from '../../src/engine/horse/assessment';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { GRADE_ORDER } from '../../src/engine/types';
import type {
  AssessmentStage,
  GameDate,
  Grade,
  Horse,
  HorseId,
  NickEntry,
  Rng,
  SireLineId,
} from '../../src/engine/types';

/* ------------------------------------------------------------------ */
/* 규모·시드·기준값                                                    */
/* ------------------------------------------------------------------ */

const FULL = !!process.env.VERIFY;

/** 교배 사이클 수. 1세대(창시자) 뒤에 이만큼 세대를 더 만든다(FULL: 2~21세대). */
const CYCLES = FULL ? 20 : 3;
/** 수·암 각각의 두수. FULL: 100·100(집단 200), 기본: 30·30(집단 60). 매 세대 교배 쌍 수 = 2 × PER_SEX. */
const PER_SEX = FULL ? 100 : 30;
/**
 * 닉스 효과 실험의 무작위 쌍 수. 고닉스(≥ 0.5) 쌍은 무작위 쌍의 약 3.5% 뿐이라(2000쌍 → 70쌍),
 * FULL 은 고닉스 200쌍 이상을 확보하도록 8000쌍으로 늘린다.
 */
const NICK_PAIRS = FULL ? 16000 : 200;
/** 단서 정확도 실험의 말 수 */
const ASSESS_HORSES = FULL ? 1000 : 100;
const TEST_TIMEOUT_MS = FULL ? 900_000 : 60_000;

const FOUNDER_LEVEL = 55;
const FOUNDER_SPREAD = 10;
const BASE_YEAR = 2026;
/** 선택 교배: 성별별 상위 비율 */
const SELECT_RATIO = 0.2;
/** 열린 종마 풀(개정 3): 매 세대 새로 만드는 바깥 종마 수 */
const OUTSIDE_SIRES_PER_GEN = 30;
/** 열린 종마 풀(개정 3): 종마 1두의 세대당 최대 교배 수 */
const OPEN_SIRE_MAX_PER_GEN = 10;
/** 단서 실험: 평가자 능력 */
const ASSESS_SKILL = 50;
const ASSESS_DATE: GameDate = { year: BASE_YEAR, week: 1 };
const STAGES: readonly AssessmentStage[] = ['foal', 'yearling', 'two_year_old', 'in_training'];

/** 명세 기준값 (FULL 에서 이탈을 기록하는 데 쓴다) */
const MEAN_BAND = 5;
const SD_RATIO_MIN = 0.5;
const SD_RATIO_MAX = 1.5;
const SELECT_GAIN_MIN = 5;
const SATURATION_CAP = 85;
const NICK_HIGH_MIN = 0.5;
const NICK_LOW_ABS_MAX = 0.2;
/** 개정 2: 설계 기대 ≈ NICK_EFFECT_MAX × 평균 닉스 값 ≈ 2.2 */
const NICK_DIFF_MIN = 1;
const NICK_DIFF_MAX = 3.5;
/** 개정 3: in_training 단계 ρ 기준 */
const RHO_IN_TRAINING_MIN = 0.7;
/** 개정 3 C9: 마지막 세대 평균 혈량 ≤ INBREED_EXCESS_FROM */
const BLOOD_COLLAPSE_MAX = INBREED_EXCESS_FROM;
/** 개정 5 C9: 평균 혈량은 이 세대 이후(포함)의 평균으로 판정한다 */
const LATE_FROM_GEN = 11;
const SOUNDNESS_FLOOR = 40;
/** 개정 4 C12: 보완형 표본 쌍 수. 보완형 개수(200 이상)가 기준이며, FULL 은 보완형이 그 이상 나오도록 넉넉히 뽑는다. */
const COMPLEMENT_PAIRS = FULL ? 8000 : 400;
/** 개정 4 C12: 보완형 표본 최소 쌍 수 */
const COMPLEMENT_MIN_N = 200;
/** 개정 4 C12: 관측/기대 허용 폭(±30%) */
const COMPLEMENT_RATIO_TOL = 0.3;
/**
 * 개정 4 I2 기준: 개정 3 의 I1(무작위 교배 마지막 세대 잠재 59.41, M2-16 이전 값).
 * I2 는 이 값 대비 +1 을 넘으면 이탈 지표에 적는다.
 */
const I1_REFERENCE_LAST = 59.41;
const I2_EXTRA_MAX = 1;

const SEED = {
  complementPairs: 'm2-11-complement-pairs',
  founders: 'm2-11-founders',
  randomMating: 'm2-11-random-mating',
  openMating: 'm2-11-open-mating',
  avoidMating: 'm2-11-avoid-mating',
  selectionMating: 'm2-11-selection-mating',
  nickPairs: 'm2-11-nick-pairs',
  assessHorses: 'm2-11-assess-horses',
} as const;

const REPORT_PATH = fileURLToPath(
  new URL('../../docs/reports/2026-10-11-m2-breeding.md', import.meta.url),
);

const NICKS: readonly NickEntry[] = getNicks();
/** 하위 계통 = 상위(parentLineId)가 있는 계통. 루트 계통은 창시자 배정에서 뺀다. */
const CHILD_LINE_IDS: readonly SireLineId[] = getSireLines()
  .filter((line) => line.parentLineId !== null)
  .map((line) => line.id);

/**
 * random: 전체 말 중 무작위 짝(무회피, 보너스 유전 상태).
 * open: 열린 종마 풀 선택(개정 3, 판정 대상). 암말은 자가 상위 20%, 종마 후보는 자가 상위 20% + 바깥 종마 30두.
 * avoid: 닫힌 회피 선택(개정 2, 진단만). 성별별 상위 20% 풀에서 예상 혈량 ≤ 25% 수말 무작위.
 * selection: 닫힌 무회피 선택(진단만). 성별별 상위 20% 풀에서 무작위 짝.
 */
type Mode = 'random' | 'open' | 'avoid' | 'selection';

interface Mating {
  inbred: boolean;
  bloodPercent: number;
}

interface Snapshot {
  generation: number;
  count: number;
  potentialMean: number;
  potentialSd: number;
  potentialMax: number;
  /** 세대 1(창시자)은 교배가 없으므로 null */
  inbreedRate: number | null;
  /** 혈량 > INBREED_EXCESS_FROM 인 교배 비율(감점 구간). 세대 1은 null */
  excessRate: number | null;
  /** 세대 1은 null */
  meanBloodPercent: number | null;
  soundnessMean: number;
}

interface ScenarioRun {
  snapshots: Snapshot[];
  registry: Map<HorseId, Horse>;
  /**
   * 세대별 "허용 후보 없음 → 혈량 최저 후보 대체" 비율(쌍 기준, 세대 2부터). open·avoid 만 채운다.
   */
  fallbackRates: number[];
  /** 열린 풀 전용: 세대별 바깥 종마 교배 비율(쌍 기준). open 만 채운다. */
  outsideRates: number[];
}

interface ScenarioOptions {
  /** 진단: 모든 인브리드 보정(보너스·감점)을 끈다. 저장값에 감점이 없으므로 부·모 own 값도 0 */
  ignoreInbreeding?: boolean;
  /** 진단(개정 2): 예상 혈량이 INBREED_LOW 초과 INBREED_EXCESS_FROM 이하인 망아지만 보너스를 끈다 */
  bonusOff?: boolean;
}

interface NickGroup {
  n: number;
  potentialMean: number;
  nickMean: number;
}

interface NickResult {
  pairs: number;
  high: NickGroup;
  low: NickGroup;
  middle: number;
  diff: number;
  se: number;
  expected: number;
  /** 같은 쌍을 닉스 유무로 두 번 교배한 반사실 차이의 평균(잡음 없음) */
  counterfactualHighMean: number;
  /** |(닉스 있음 − 없음) − NICK_EFFECT_MAX × 닉| 의 평균. 0 이면 기전이 정확히 맞는다 */
  counterfactualResidual: number;
  /** 정보(개정 5): 그룹별 보완형 비율 */
  highComplementShare: number;
  lowComplementShare: number;
}

interface StageResult {
  stage: AssessmentStage;
  /**
   * 개정 3 단계별 진짜 값: foal·yearling·two_year_old 는 잠재 평균 5종, in_training 은 현재 능력 0.6 + 잠재 0.4 혼합
   * (엔진 trueTraits 와 같은 가중). 판정에 쓰는 값이다.
   */
  rho: number;
  /** 참고(명세 원안): 진짜 값 = 잠재 평균 전 단계 공통 */
  rhoPotential: number;
  /** 참고: 진짜 값 = 조교 혼합 전 단계 공통 */
  rhoBlend: number;
  meanScore: number;
  distribution: number[];
}

interface AssessResult {
  horses: number;
  stages: StageResult[];
}

interface ComplementResult {
  pairs: number;
  compN: number;
  nonN: number;
  /** 그룹 평균 잠재(avg5) */
  compMean: number;
  nonMean: number;
  /** 그룹 차이(보완형 − 비보완형). 명세 판정 대상 */
  groupDiff: number;
  groupSe: number;
  /** 기대 = COMPLEMENT_BONUS × 보완형 쌍의 부모 중간값(조정된 블렌드 평균) */
  parentMid: number;
  expected: number;
  /** 같은 쌍 반사실(부 거리 적성만 바꿔 보완형을 끔): 보완형 − 비보완형 평균. 잡음·표본 구성 차이 없음 */
  counterfactualDiff: number;
  /** |반사실 차이 − COMPLEMENT_BONUS × 쌍별 부모 중간값| 평균. 0 이면 기전이 정확히 맞는다 */
  counterfactualResidual: number;
  /** 반사실용 부 교체 후에도 보완형이 남은 쌍 수. 0 이어야 반사실이 성립한다 */
  flipFailures: number;
}

interface Criterion {
  id: string;
  text: string;
  observed: string;
  pass: boolean;
}

/** 판정 없이 표에만 남기는 정보 행(개정 3 C1 설명용) */
interface InfoRow {
  id: string;
  text: string;
  observed: string;
}

/** FULL 리포트용 결과 저장소. 테스트 파일 안에서 순서대로 채운다. */
const results: {
  random?: ScenarioRun;
  randomBonusOff?: ScenarioRun;
  open?: ScenarioRun;
  avoid?: ScenarioRun;
  selection?: ScenarioRun;
  randomNoInbreed?: ScenarioRun;
  selectionNoInbreed?: ScenarioRun;
  nick?: NickResult;
  complement?: ComplementResult;
  assess?: AssessResult;
  timingsMs: Record<string, number>;
} = { timingsMs: {} };

/* ------------------------------------------------------------------ */
/* 공용 유틸                                                           */
/* ------------------------------------------------------------------ */

function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function avg5(h: Horse): number {
  const p = h.potential;
  return (p.speed + p.stamina + p.acceleration + p.guts + p.power) / 5;
}

function avgAbility(h: Horse): number {
  const a = h.ability;
  return (a.speed + a.stamina + a.acceleration + a.guts + a.power) / 5;
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  return xs.reduce((sum, v) => sum + v, 0) / xs.length;
}

/** 모집단 표준편차(분모 n) */
function popSd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function fmt(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function first<T>(xs: readonly T[]): T {
  const v = xs[0];
  if (v === undefined) throw new RangeError('빈 배열');
  return v;
}

function last<T>(xs: readonly T[]): T {
  const v = xs[xs.length - 1];
  if (v === undefined) throw new RangeError('빈 배열');
  return v;
}

function byIdAsc(a: Horse, b: Horse): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function gradeScore(g: Grade): number {
  return GRADE_ORDER.length - 1 - GRADE_ORDER.indexOf(g);
}

/** 동점은 평균 순위 */
function ranks(values: readonly number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0));
  const out = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    const startValue = values[order[start] ?? 0] ?? 0;
    let end = start;
    while (end + 1 < order.length && (values[order[end + 1] ?? 0] ?? 0) === startValue) end++;
    const avgRank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) out[order[k] ?? 0] = avgRank;
    start = end + 1;
  }
  return out;
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = (x[i] ?? 0) - mx;
    const dy = (y[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom === 0 ? 0 : sxy / denom;
}

function spearman(x: readonly number[], y: readonly number[]): number {
  return pearson(ranks(x), ranks(y));
}

/** 세대별 비율 배열에서 처음 50% 이상이 되는 세대(없으면 null). index 0 = 2세대 */
function firstHalfGeneration(rates: readonly number[]): number | null {
  const idx = rates.findIndex((v) => v >= 0.5);
  return idx >= 0 ? idx + 2 : null;
}

/* ------------------------------------------------------------------ */
/* 집단 시뮬레이션                                                     */
/* ------------------------------------------------------------------ */

/** 창시자 집단. 수·암 각각 perSex 두. sireLineId 는 하위 계통에서 무작위 배정(암말은 이것이 곧 모부 계통). */
function createFounders(seed: string, perSex: number): Horse[] {
  const rng = createRng(seed);
  const horses: Horse[] = [];
  for (let i = 0; i < perSex * 2; i++) {
    const male = i < perSex;
    const id = `F1-${String(i).padStart(3, '0')}`;
    horses.push(
      generateHorse(rng, {
        id,
        name: id,
        sex: male ? 'male' : 'female',
        birthYear: BASE_YEAR - 4,
        currentYear: BASE_YEAR,
        countryOfBirth: 'GB',
        status: male ? 'stud' : 'broodmare',
        level: FOUNDER_LEVEL,
        spread: FOUNDER_SPREAD,
        sireLineId: rng.pick(CHILD_LINE_IDS),
      }),
    );
  }
  return horses;
}

/**
 * 개정 3 바깥 종마: 매 세대 새로 만든다(1세대 창시자와 같은 방식, 무작위 sireLineId, 혈통 미상이라 자가 말과 혈연 없음).
 * 전용 하위 스트림(outsideRng)에서만 뽑아 재현성을 유지한다.
 */
function makeOutsideSires(outsideRng: Rng, gen: number, registry: Map<HorseId, Horse>): Horse[] {
  const out: Horse[] = [];
  for (let i = 0; i < OUTSIDE_SIRES_PER_GEN; i++) {
    const id = `O${gen}-${String(i).padStart(3, '0')}`;
    const horse = generateHorse(outsideRng, {
      id,
      name: id,
      sex: 'male',
      birthYear: BASE_YEAR - 4,
      currentYear: BASE_YEAR,
      countryOfBirth: 'GB',
      status: 'stud',
      level: FOUNDER_LEVEL,
      spread: FOUNDER_SPREAD,
      sireLineId: outsideRng.pick(CHILD_LINE_IDS),
    });
    registry.set(id, horse);
    out.push(horse);
  }
  return out;
}

function snapshot(generation: number, horses: readonly Horse[], matings: readonly Mating[] | null): Snapshot {
  const avgs = horses.map(avg5);
  return {
    generation,
    count: horses.length,
    potentialMean: mean(avgs),
    potentialSd: popSd(avgs),
    potentialMax: Math.max(...avgs),
    inbreedRate: matings === null ? null : matings.filter((m) => m.inbred).length / matings.length,
    excessRate:
      matings === null
        ? null
        : matings.filter((m) => m.bloodPercent > INBREED_EXCESS_FROM).length / matings.length,
    meanBloodPercent: matings === null ? null : mean(matings.map((m) => m.bloodPercent)),
    soundnessMean: mean(horses.map((h) => h.soundness)),
  };
}

/** 성별별 잠재 평균 상위 SELECT_RATIO (최소 1두). 동점은 id 순. */
function topShare(horses: readonly Horse[]): Horse[] {
  const n = Math.max(1, Math.ceil(horses.length * SELECT_RATIO));
  return [...horses].sort((a, b) => avg5(b) - avg5(a) || byIdAsc(a, b)).slice(0, n);
}

/** 모의 부(외조부): dam.sireId 로 찾은 말. 없으면 null (season.ts damsireOf 와 같은 방식) */
function damsireOf(horseLookup: HorseLookup, dam: Horse): Horse | null {
  if (dam.sireId === null) return null;
  return horseLookup(dam.sireId) ?? null;
}

/** 가상 교배의 예상 혈량(게임 본체와 같은 방식: 지배 교차 합). */
function expectedBlood(lookup: PedigreeLookup, sire: Horse, dam: Horse): number {
  const root = buildMatingPedigree(lookup, sire.id, dam.id);
  return totalBloodPercent(dominantCrosses(root, findInbreeding(root)));
}

/**
 * 회피 선택(닫힌, 개정 2 진단): 예상 혈량 ≤ INBREED_EXCESS_FROM 인 수말 가운데 무작위.
 * 허용 수말이 없으면 풀에서 예상 혈량이 가장 낮은 수말(동점은 id 순).
 */
function pickAvoidingSire(
  rng: Rng,
  sirePool: readonly Horse[],
  dam: Horse,
  lookup: PedigreeLookup,
): { sire: Horse; fallback: boolean } {
  const scored = sirePool.map((sire) => ({ sire, blood: expectedBlood(lookup, sire, dam) }));
  const allowed = scored.filter((s) => s.blood <= INBREED_EXCESS_FROM).map((s) => s.sire);
  if (allowed.length > 0) return { sire: rng.pick(allowed), fallback: false };
  const lowest = [...scored].sort((a, b) => a.blood - b.blood || byIdAsc(a.sire, b.sire))[0];
  if (lowest === undefined) throw new RangeError('빈 수말 풀');
  return { sire: lowest.sire, fallback: true };
}

/**
 * 열린 종마 풀 선택(개정 3, 판정 대상). 후보 중 세대 상한(OPEN_SIRE_MAX_PER_GEN)에 안 찬 수말만 본다.
 * 예상 혈량 ≤ INBREED_EXCESS_FROM 인 후보 가운데 잠재 평균이 가장 높은 수말(동점 id 순).
 * 허용 후보가 없으면 상한에 안 찬 후보 중 예상 혈량이 가장 낮은 수말(동점 id 순).
 */
function pickOpenSire(
  candidates: readonly Horse[],
  dam: Horse,
  lookup: PedigreeLookup,
  load: ReadonlyMap<HorseId, number>,
): { sire: Horse; fallback: boolean } {
  const open = candidates.filter((s) => (load.get(s.id) ?? 0) < OPEN_SIRE_MAX_PER_GEN);
  const scored = open.map((sire) => ({ sire, blood: expectedBlood(lookup, sire, dam) }));
  const allowed = scored.filter((s) => s.blood <= INBREED_EXCESS_FROM);
  if (allowed.length > 0) {
    const best = [...allowed].sort((a, b) => avg5(b.sire) - avg5(a.sire) || byIdAsc(a.sire, b.sire))[0];
    if (best === undefined) throw new RangeError('허용 후보 정렬 실패');
    return { sire: best.sire, fallback: false };
  }
  const lowest = [...scored].sort((a, b) => a.blood - b.blood || byIdAsc(a.sire, b.sire))[0];
  if (lowest === undefined) throw new RangeError('열린 종마 풀이 비었다(세대 상한 초과)');
  return { sire: lowest.sire, fallback: true };
}

/** 쌍마다 인브리드를 탐지하고 망아지를 만든다. 모계 명성은 0(미사용). */
function produceFoals(
  rng: Rng,
  pairs: readonly (readonly [Horse, Horse])[],
  gen: number,
  registry: ReadonlyMap<HorseId, Horse>,
  options: ScenarioOptions,
): { foals: Horse[]; matings: Mating[] } {
  const lookup: PedigreeLookup = (id) => registry.get(id);
  const horseLookup: HorseLookup = (id) => registry.get(id);
  const foals: Horse[] = [];
  const matings: Mating[] = [];
  pairs.forEach(([sire, dam], i) => {
    // 개정 1: 게임 본체(season.ts, preview.ts)와 같은 방식 — 지배 교차만 남긴다.
    const root = buildMatingPedigree(lookup, sire.id, dam.id);
    const crosses = dominantCrosses(root, findInbreeding(root));
    const bp = totalBloodPercent(crosses);
    // 개정 2 보너스만 끔: 보너스만 있고 감점은 없는 구간(INBREED_LOW 초과 INBREED_EXCESS_FROM 이하)이면 보정 목록을 비운다.
    const dropBonus = options.bonusOff === true && bp > INBREED_LOW && bp <= INBREED_EXCESS_FROM;
    const ignore = options.ignoreInbreeding === true;
    const id = `G${gen}-${String(i).padStart(3, '0')}`;
    const args: BreedArgs = {
      sire,
      dam,
      // 모부 계통 = 어미의 부(= 어미 본인의 sireLineId). 검증은 runScenario 불변식 테스트에서 확인한다.
      damsireLineId: dam.sireLineId,
      nicks: NICKS,
      // 진단 모드에서는 보정만 끈다(인브리드 탐지 결과는 통계에 그대로 남긴다). rng 소비 순서는 같다.
      inbreeding: ignore || dropBonus ? [] : crosses,
      // M2-05c 1대 한정: 부·모의 과다 감점을 되돌려 유전 기준값을 만든다(season.ts 와 같은 방식).
      // 감점 끔 진단은 저장된 잠재·건강도에 감점이 없으므로 되돌리지 않는다(0). 되돌리면 편향이 생긴다.
      sireOwnBloodPercent: ignore ? 0 : ownBloodPercent(lookup, sire),
      damOwnBloodPercent: ignore ? 0 : ownBloodPercent(lookup, dam),
      // 개정 4(M2-16): 모의 부(외조부)와 부·모 own 보완형. 감점 끔 진단은 own 보완형도 false
      damsire: damsireOf(horseLookup, dam),
      sireOwnComplement: ignore ? false : ownComplement(horseLookup, sire),
      damOwnComplement: ignore ? false : ownComplement(horseLookup, dam),
      damFamilyScore: 0,
      id,
      name: id,
      birthYear: BASE_YEAR,
      currentYear: BASE_YEAR,
      countryOfBirth: 'GB',
      ownerId: null,
      breederId: null,
    };
    foals.push(breed(rng, args));
    matings.push({ inbred: crosses.length > 0, bloodPercent: bp });
  });
  return { foals, matings };
}

/**
 * 1세대 창시자 + cycles 회 교배. 모드는 Mode 참고. 각 세대 쌍 수 = 2 × perSex (집단 크기 유지).
 * open 모드의 바깥 종마는 rng.fork('outside-sires') 하위 스트림에서만 뽑는다.
 */
function runScenario(mode: Mode, cycles: number, perSex: number, options: ScenarioOptions = {}): ScenarioRun {
  const founders = createFounders(SEED.founders, perSex);
  const registry = new Map<HorseId, Horse>();
  for (const h of founders) registry.set(h.id, h);
  const seed =
    mode === 'random'
      ? SEED.randomMating
      : mode === 'open'
        ? SEED.openMating
        : mode === 'avoid'
          ? SEED.avoidMating
          : SEED.selectionMating;
  const rng = createRng(seed);
  // open 에서만 하위 스트림을 뗀다(다른 모드의 부모 스트림 소비를 바꾸지 않으려고).
  const outsideRng: Rng | null = mode === 'open' ? rng.fork('outside-sires') : null;
  const lookup: PedigreeLookup = (id) => registry.get(id);

  const snapshots: Snapshot[] = [snapshot(1, founders, null)];
  const fallbackRates: number[] = [];
  const outsideRates: number[] = [];
  let current = founders;
  for (let c = 1; c <= cycles; c++) {
    const gen = c + 1;
    const males = current.filter((h) => h.sex === 'male');
    const females = current.filter((h) => h.sex === 'female');
    const sirePool = mode === 'random' ? males : topShare(males);
    const damPool = mode === 'random' ? females : topShare(females);
    const outside = outsideRng !== null ? makeOutsideSires(outsideRng, gen, registry) : [];
    const outsideIds = new Set<HorseId>(outside.map((h) => h.id));
    const candidates = [...sirePool, ...outside];
    const load = new Map<HorseId, number>();
    const pairs: [Horse, Horse][] = [];
    let fallbacks = 0;
    let outsideUsed = 0;
    for (let i = 0; i < perSex * 2; i++) {
      if (mode === 'open') {
        const dam = rng.pick(damPool);
        const pick = pickOpenSire(candidates, dam, lookup, load);
        load.set(pick.sire.id, (load.get(pick.sire.id) ?? 0) + 1);
        if (pick.fallback) fallbacks++;
        if (outsideIds.has(pick.sire.id)) outsideUsed++;
        pairs.push([pick.sire, dam]);
      } else if (mode === 'avoid') {
        const dam = rng.pick(damPool);
        const pick = pickAvoidingSire(rng, sirePool, dam, lookup);
        if (pick.fallback) fallbacks++;
        pairs.push([pick.sire, dam]);
      } else {
        pairs.push([rng.pick(sirePool), rng.pick(damPool)]);
      }
    }
    if (mode === 'open' || mode === 'avoid') fallbackRates.push(fallbacks / pairs.length);
    if (mode === 'open') outsideRates.push(outsideUsed / pairs.length);
    const { foals, matings } = produceFoals(rng, pairs, gen, registry, options);
    for (const f of foals) registry.set(f.id, f);
    snapshots.push(snapshot(gen, foals, matings));
    current = foals;
  }
  return { snapshots, registry, fallbackRates, outsideRates };
}

/* ------------------------------------------------------------------ */
/* 닉스 효과 실험                                                      */
/* ------------------------------------------------------------------ */

function runNickSection(): NickResult {
  const founders = createFounders(SEED.founders, PER_SEX);
  const males = founders.filter((h) => h.sex === 'male');
  const females = founders.filter((h) => h.sex === 'female');
  const rng = createRng(SEED.nickPairs);
  const byId = new Map<HorseId, Horse>(founders.map((h) => [h.id, h]));
  const lookup: PedigreeLookup = (id) => byId.get(id);
  const horseLookup: HorseLookup = (id) => byId.get(id);

  const high: { avg: number; nick: number }[] = [];
  const low: { avg: number; nick: number }[] = [];
  let middle = 0;
  let residualSum = 0;
  let cfHighSum = 0;
  let highComp = 0;
  let lowComp = 0;

  for (let i = 0; i < NICK_PAIRS; i++) {
    const sire = rng.pick(males);
    const dam = rng.pick(females);
    const nick = nickValue(NICKS, sire.sireLineId, dam.sireLineId);
    const damsire = damsireOf(horseLookup, dam);
    const comp = isComplementary(sire, dam, damsire);
    const base: Omit<BreedArgs, 'nicks'> = {
      sire,
      dam,
      damsireLineId: dam.sireLineId,
      inbreeding: [],
      sireOwnBloodPercent: ownBloodPercent(lookup, sire),
      damOwnBloodPercent: ownBloodPercent(lookup, dam),
      damsire,
      sireOwnComplement: ownComplement(horseLookup, sire),
      damOwnComplement: ownComplement(horseLookup, dam),
      damFamilyScore: 0,
      id: `N-${i}`,
      name: `N-${i}`,
      birthYear: BASE_YEAR,
      currentYear: BASE_YEAR,
      countryOfBirth: 'GB',
      ownerId: null,
      breederId: null,
    };
    // 같은 시드 두 번: 닉스 유무만 다른 반사실 비교. breed 는 닉스 값과 무관하게 rng 를 같은 순서로 쓴다.
    const withNick = breed(createRng(`nick-pair:${i}`), { ...base, nicks: NICKS });
    const withoutNick = breed(createRng(`nick-pair:${i}`), { ...base, nicks: [] });
    const delta = avg5(withNick) - avg5(withoutNick);
    residualSum += Math.abs(delta - NICK_EFFECT_MAX * nick);

    if (nick >= NICK_HIGH_MIN) {
      high.push({ avg: avg5(withNick), nick });
      cfHighSum += delta;
      if (comp) highComp++;
    } else if (Math.abs(nick) < NICK_LOW_ABS_MAX) {
      low.push({ avg: avg5(withNick), nick });
      if (comp) lowComp++;
    } else {
      middle++;
    }
  }

  const group = (items: { avg: number; nick: number }[]): NickGroup => ({
    n: items.length,
    potentialMean: mean(items.map((x) => x.avg)),
    nickMean: mean(items.map((x) => x.nick)),
  });
  const h = group(high);
  const l = group(low);
  const seOf = (items: { avg: number }[]): number => popSd(items.map((x) => x.avg)) ** 2 / items.length;

  return {
    pairs: NICK_PAIRS,
    high: h,
    low: l,
    middle,
    diff: h.potentialMean - l.potentialMean,
    se: Math.sqrt(seOf(high) + seOf(low)),
    expected: NICK_EFFECT_MAX * (h.nickMean - l.nickMean),
    counterfactualHighMean: high.length === 0 ? Number.NaN : cfHighSum / high.length,
    counterfactualResidual: residualSum / NICK_PAIRS,
    highComplementShare: high.length === 0 ? Number.NaN : highComp / high.length,
    lowComplementShare: low.length === 0 ? Number.NaN : lowComp / low.length,
  };
}

/* ------------------------------------------------------------------ */
/* 단서 정확도 실험                                                    */
/* ------------------------------------------------------------------ */

/** 보완형 기대값의 부모 중간값: 능력 5종 각각 조정된 블렌드(엔진 blendedPotential 과 같은 식)의 평균 */
function parentMidOf(sire: Horse, dam: Horse): number {
  const keys = ['speed', 'stamina', 'acceleration', 'guts', 'power'] as const;
  const mids = keys.map((k) => {
    const m = SIRE_WEIGHT * sire.potential[k] + (1 - SIRE_WEIGHT) * dam.potential[k];
    return m + (POPULATION_MEAN - m) * REGRESSION_TO_MEAN;
  });
  return mean(mids);
}

/**
 * 개정 4 C12: 보완형 효과. 창시자 무작위 쌍에서 보완형 망아지와 비보완형 망아지의 잠재 평균 차이(판정)와,
 * 보완형 쌍마다 부의 거리 적성만 중간 거리로 바꿔 보완형을 끈 반사실 교배 차이(정확한 기전 점검)를 함께 잰다.
 * 부의 거리 적성은 잠재 계산에 들어가지 않고(보완 판정과 거리 유전에만 쓰임), rng 소비도 같아서 반사실이 성립한다.
 */
function runComplementSection(): ComplementResult {
  const founders = createFounders(SEED.founders, PER_SEX);
  const males = founders.filter((h) => h.sex === 'male');
  const females = founders.filter((h) => h.sex === 'female');
  const byId = new Map<HorseId, Horse>(founders.map((h) => [h.id, h]));
  const horseLookup: HorseLookup = (id) => byId.get(id);
  const rng = createRng(SEED.complementPairs);
  const nonComplementDistance = PROFILE_DISTANCE.middle;

  const compAvg: number[] = [];
  const nonAvg: number[] = [];
  const parentMids: number[] = [];
  const cfDiffs: number[] = [];
  const cfResiduals: number[] = [];
  let flipFailures = 0;

  for (let i = 0; i < COMPLEMENT_PAIRS; i++) {
    const sire = rng.pick(males);
    const dam = rng.pick(females);
    const damsire = damsireOf(horseLookup, dam);
    const base: Omit<BreedArgs, 'nicks'> = {
      sire,
      dam,
      damsire,
      damsireLineId: dam.sireLineId,
      inbreeding: [],
      sireOwnBloodPercent: ownBloodPercent(horseLookup, sire),
      damOwnBloodPercent: ownBloodPercent(horseLookup, dam),
      sireOwnComplement: ownComplement(horseLookup, sire),
      damOwnComplement: ownComplement(horseLookup, dam),
      damFamilyScore: 0,
      id: `C-${i}`,
      name: `C-${i}`,
      birthYear: BASE_YEAR,
      currentYear: BASE_YEAR,
      countryOfBirth: 'GB',
      ownerId: null,
      breederId: null,
    };
    const isComp = isComplementary(sire, dam, damsire);
    const foal = breed(createRng(`comp-pair:${i}`), { ...base, nicks: NICKS });
    if (!isComp) {
      nonAvg.push(avg5(foal));
      continue;
    }
    compAvg.push(avg5(foal));
    const mid = parentMidOf(sire, dam);
    parentMids.push(mid);
    // 반사실: 부 거리 적성만 중간 거리로 바꿔 보완형을 끈다. 같은 시드, 같은 쌍.
    const nonSire: Horse = { ...sire, aptitude: { ...sire.aptitude, distanceOptimum: nonComplementDistance } };
    if (isComplementary(nonSire, dam, damsire)) flipFailures++;
    const withoutFoal = breed(createRng(`comp-pair:${i}`), { ...base, sire: nonSire, nicks: NICKS });
    const cfDiff = avg5(foal) - avg5(withoutFoal);
    cfDiffs.push(cfDiff);
    cfResiduals.push(Math.abs(cfDiff - COMPLEMENT_BONUS * mid));
  }

  const compMean = mean(compAvg);
  const nonMean = mean(nonAvg);
  const seOf = (xs: readonly number[]): number => (xs.length === 0 ? Number.NaN : popSd(xs) ** 2 / xs.length);
  const parentMid = mean(parentMids);
  return {
    pairs: COMPLEMENT_PAIRS,
    compN: compAvg.length,
    nonN: nonAvg.length,
    compMean,
    nonMean,
    groupDiff: compMean - nonMean,
    groupSe: Math.sqrt(seOf(compAvg) + seOf(nonAvg)),
    parentMid,
    expected: COMPLEMENT_BONUS * parentMid,
    counterfactualDiff: mean(cfDiffs),
    counterfactualResidual: mean(cfResiduals),
    flipFailures,
  };
}

function runAssessSection(): AssessResult {
  const rng = createRng(SEED.assessHorses);
  // 평가 대상은 2살(2024년생, 2026 기준). 조교 중 단계에서 현재 능력이 의미를 가지도록 나이를 맞춘다.
  const horses = Array.from({ length: ASSESS_HORSES }, (_, i) =>
    generateHorse(rng, {
      id: `A-${i}`,
      name: `A-${i}`,
      sex: i % 2 === 0 ? 'male' : 'female',
      birthYear: BASE_YEAR - 2,
      currentYear: BASE_YEAR,
      countryOfBirth: 'GB',
      status: 'in_training',
      level: FOUNDER_LEVEL,
      spread: FOUNDER_SPREAD,
    }),
  );
  // 개정 3: 단계별 진짜 값. 잠재 평균(명세 원안)과 조교 혼합(엔진 trueTraits 와 같은 가중)을 함께 잰다.
  const truthPotential = horses.map(avg5);
  const truthBlend = horses.map(
    (h) => IN_TRAINING_ABILITY_WEIGHT * avgAbility(h) + (1 - IN_TRAINING_ABILITY_WEIGHT) * avg5(h),
  );

  const stages: StageResult[] = STAGES.map((stage) => {
    const grades = horses.map((h, i) =>
      assessHorse(h, stage, ASSESS_SKILL, ASSESS_DATE, createRng(`assess:${stage}:${i}`)).conformation.overall,
    );
    const scores = grades.map(gradeScore);
    const truth = stage === 'in_training' ? truthBlend : truthPotential;
    return {
      stage,
      rho: spearman(scores, truth),
      rhoPotential: spearman(scores, truthPotential),
      rhoBlend: spearman(scores, truthBlend),
      meanScore: mean(scores),
      distribution: GRADE_ORDER.map((g) => grades.filter((x) => x === g).length),
    };
  });

  return { horses: horses.length, stages };
}

/* ------------------------------------------------------------------ */
/* 기준 판정                                                           */
/* ------------------------------------------------------------------ */

interface BaseStat {
  generation: number;
  /** 유전 기준값 평균·SD (개정 5) */
  baseMean: number;
  baseSd: number;
  /** 표현형(저장값) 평균·SD (정보) */
  phenMean: number;
  phenSd: number;
  /** 보완형으로 태어난 말 비율 */
  complementShare: number;
}

/**
 * 개정 5: 세대별 유전 기준값. 말이 보완형으로 태어났으면(ownComplement) 잠재 평균 ÷ (1 + COMPLEMENT_BONUS).
 * 그 세대에서 새로 생긴 보완 보너스는 자손에게 누적되지 않으므로 기준값에서 뺀다. 세대 1(창시자)은 보완형이 없다.
 */
function geneticBaseStats(run: ScenarioRun): BaseStat[] {
  const lookup: HorseLookup = (id) => run.registry.get(id);
  const byGen = new Map<number, Horse[]>();
  for (const h of run.registry.values()) {
    const m = /^G(\d+)-/.exec(h.id);
    let gen: number | null = null;
    if (m !== null && m[1] !== undefined) gen = Number(m[1]);
    else if (h.id.startsWith('F1-')) gen = 1;
    if (gen === null) continue;
    const list = byGen.get(gen) ?? [];
    list.push(h);
    byGen.set(gen, list);
  }
  return [...byGen.keys()]
    .sort((a, b) => a - b)
    .map((generation) => {
      const horses = byGen.get(generation) ?? [];
      const comp = horses.map((h) => ownComplement(lookup, h));
      const base = horses.map((h, i) => (comp[i] ? avg5(h) / (1 + COMPLEMENT_BONUS) : avg5(h)));
      const phen = horses.map(avg5);
      return {
        generation,
        baseMean: mean(base),
        baseSd: popSd(base),
        phenMean: mean(phen),
        phenSd: popSd(phen),
        complementShare: comp.filter((c) => c).length / horses.length,
      };
    });
}

function buildCriteria(): { criteria: Criterion[]; info: InfoRow[] } {
  const rnd = results.random?.snapshots;
  const rndRun = results.random;
  const bonusOff = results.randomBonusOff?.snapshots;
  const open = results.open?.snapshots;
  const selNoInbreed = results.selectionNoInbreed?.snapshots;
  const nick = results.nick;
  const assess = results.assess;
  const cx = results.complement;
  if (!rnd || !rndRun || !bonusOff || !open || !nick || !assess || !cx) {
    throw new Error('FULL 결과가 모두 없다');
  }

  const r0 = first(rnd);
  const rndRest = rnd.slice(1);
  // 개정 5: C2·I2 는 유전 기준값으로 잰다. 표현형 SD 비는 정보(I3).
  const bases = geneticBaseStats(rndRun);
  const b1 = first(bases);
  const baseRatios = bases.slice(1).map((b) => b.baseSd / b1.baseSd);
  const baseRatioMin = Math.min(...baseRatios);
  const baseRatioMax = Math.max(...baseRatios);
  const ratios = rndRest.map((s) => s.potentialSd / r0.potentialSd);
  const ratioMin = Math.min(...ratios);
  const ratioMax = Math.max(...ratios);
  const lastBase = last(bases);
  const i2Delta = lastBase.baseMean - I1_REFERENCE_LAST;

  // 개정 5 C9: 11~21세대 평균 혈량, 세대별 최대는 정보
  const late = open.filter((s) => s.generation >= LATE_FROM_GEN);
  const lateBloodMean = mean(late.map((s) => s.meanBloodPercent ?? 0));
  const lateBloodMax = late.reduce(
    (m, s) => (s.meanBloodPercent !== null && s.meanBloodPercent > m.v ? { v: s.meanBloodPercent, g: s.generation } : m),
    { v: Number.NEGATIVE_INFINITY, g: 0 },
  );

  // 개정 3 C1: 보너스만 끔 진단으로 판정. 보너스 유전 상태의 상승폭은 정보 행.
  const b0 = first(bonusOff);
  const boRest = bonusOff.slice(1);
  const boDev = boRest.reduce((m, s) => Math.max(m, Math.abs(s.potentialMean - b0.potentialMean)), 0);
  const boWorst = boRest.reduce(
    (w, s) => (Math.abs(s.potentialMean - b0.potentialMean) > Math.abs(w.potentialMean - b0.potentialMean) ? s : w),
    first(boRest),
  );
  const rndDev = rndRest.reduce((m, s) => Math.max(m, Math.abs(s.potentialMean - r0.potentialMean)), 0);
  const rndWorst = rndRest.reduce(
    (w, s) => (Math.abs(s.potentialMean - r0.potentialMean) > Math.abs(w.potentialMean - r0.potentialMean) ? s : w),
    first(rndRest),
  );

  // 개정 3 판정: 열린 종마 풀 선택
  const s0 = first(open);
  const sLast = last(open);
  const gain = sLast.potentialMean - s0.potentialMean;

  const stageRho = (stage: AssessmentStage): number => {
    const found = assess.stages.find((s) => s.stage === stage);
    if (!found) throw new Error(`단계 결과 없음: ${stage}`);
    return found.rho;
  };
  const rhoFoal = stageRho('foal');
  const rhoYearling = stageRho('yearling');
  const rhoTwo = stageRho('two_year_old');
  const rhoIn = stageRho('in_training');

  const monotonic = rhoFoal < rhoYearling && rhoYearling < rhoTwo && rhoTwo < rhoIn;

  const criteria: Criterion[] = [
    {
      id: 'C1',
      text: `무작위 교배(보너스 끔 진단): 전 세대 잠재 평균이 1세대 ±${MEAN_BAND} 안`,
      observed: `최대 |Δ| = ${fmt(boDev)} (${boWorst.generation}세대, 1세대 ${fmt(b0.potentialMean)})`,
      pass: boDev <= MEAN_BAND,
    },
    {
      id: 'C2',
      text: `무작위 교배(유전 기준값, 개정 5): 전 세대 SD 가 1세대의 ${SD_RATIO_MIN * 100}~${SD_RATIO_MAX * 100}%`,
      observed: `기준 SD 비 범위 ${fmt(baseRatioMin * 100, 1)}%~${fmt(baseRatioMax * 100, 1)}% (1세대 기준 SD ${fmt(b1.baseSd)})`,
      pass: baseRatioMin >= SD_RATIO_MIN && baseRatioMax <= SD_RATIO_MAX,
    },
    {
      id: 'C3',
      text: `열린 종마 풀 선택: 20세대 후 평균 상승 +${SELECT_GAIN_MIN} 이상`,
      observed: `1세대 ${fmt(s0.potentialMean)} → 마지막 ${fmt(sLast.potentialMean)} (상승 ${fmt(gain)})`,
      pass: gain >= SELECT_GAIN_MIN,
    },
    {
      id: 'C4',
      text: `열린 종마 풀 선택: ${SATURATION_CAP} 미만에서 포화`,
      observed:
        `마지막 세대 평균 ${fmt(sLast.potentialMean)}, 최대 ${fmt(sLast.potentialMax)}` +
        (selNoInbreed ? ` (참고: 닫힌 무회피 감점 끔 마지막 ${fmt(last(selNoInbreed).potentialMean)})` : ''),
      pass: sLast.potentialMean < SATURATION_CAP,
    },
    {
      id: 'C5',
      text: `닉스 효과(같은 쌍 반사실, 개정 5): 닉스 ≥ ${NICK_HIGH_MIN} 쌍의 닉스 유무 차이 ${NICK_DIFF_MIN}~${NICK_DIFF_MAX}`,
      observed:
        `반사실 차이 ${fmt(nick.counterfactualHighMean)} (잔차 ${fmt(nick.counterfactualResidual, 4)}), ` +
        `기대 NICK_EFFECT_MAX×평균닉스차 = ${fmt(nick.expected)}`,
      pass: nick.counterfactualHighMean >= NICK_DIFF_MIN && nick.counterfactualHighMean <= NICK_DIFF_MAX,
    },
    {
      id: 'C6',
      text: `단서(개정 3, 단계별 진짜 값): in_training 스피어만 ρ ≥ ${RHO_IN_TRAINING_MIN}`,
      observed: `ρ(in_training) = ${fmt(rhoIn, 3)}`,
      pass: rhoIn >= RHO_IN_TRAINING_MIN,
    },
    {
      id: 'C7',
      text: '단서: foal 은 in_training 보다 낮음',
      observed: `ρ(foal) = ${fmt(rhoFoal, 3)}, ρ(in_training) = ${fmt(rhoIn, 3)}`,
      pass: rhoFoal < rhoIn,
    },
    {
      id: 'C8',
      text: '단서: 단계별 ρ 단조 증가 (foal < yearling < two_year_old < in_training)',
      observed: `${fmt(rhoFoal, 3)} < ${fmt(rhoYearling, 3)} < ${fmt(rhoTwo, 3)} < ${fmt(rhoIn, 3)}`,
      pass: monotonic,
    },
    {
      id: 'C9',
      text: `열린 종마 풀 선택 붕괴: ${LATE_FROM_GEN}~${CYCLES + 1}세대 평균 혈량 ≤ ${BLOOD_COLLAPSE_MAX}% (교배 기준, 개정 5)`,
      observed: `${LATE_FROM_GEN}~${CYCLES + 1}세대 평균 ${fmt(lateBloodMean)}% (${late.length}개 세대)`,
      pass: lateBloodMean <= BLOOD_COLLAPSE_MAX,
    },
    {
      id: 'C10',
      text: `열린 종마 풀 선택 붕괴: 마지막 세대 건강도 평균 ≥ ${SOUNDNESS_FLOOR}`,
      observed: `${fmt(sLast.soundnessMean)} (1세대 ${fmt(s0.soundnessMean)})`,
      pass: sLast.soundnessMean >= SOUNDNESS_FLOOR,
    },
    {
      id: 'C11',
      text: '열린 종마 풀 선택 붕괴: 마지막 세대 잠재 평균 ≥ 1세대 잠재 평균',
      observed: `${fmt(sLast.potentialMean)} vs 1세대 ${fmt(s0.potentialMean)}`,
      pass: sLast.potentialMean >= s0.potentialMean,
    },
    {
      id: 'C12',
      text: `보완형 효과: 보완형 − 비보완형 잠재 차이가 COMPLEMENT_BONUS(${COMPLEMENT_BONUS}) × 부모 중간값의 ±${COMPLEMENT_RATIO_TOL * 100}% 안 (보완형 ${COMPLEMENT_MIN_N}쌍 이상)`,
      observed:
        `그룹 차이 ${fmt(cx.groupDiff)} (SE ${fmt(cx.groupSe)}), 기대 ${fmt(cx.expected)} ` +
        `(부모 중간값 ${fmt(cx.parentMid)}), 관측/기대 ${fmt(cx.groupDiff / cx.expected, 2)}, 보완형 ${cx.compN}쌍 / 비보완형 ${cx.nonN}쌍`,
      pass:
        cx.compN >= COMPLEMENT_MIN_N &&
        cx.groupDiff / cx.expected >= 1 - COMPLEMENT_RATIO_TOL &&
        cx.groupDiff / cx.expected <= 1 + COMPLEMENT_RATIO_TOL,
    },
    {
      id: 'I2',
      text: `I2(개정 5, 유전 기준값): 무작위 교배 마지막 세대 기준 평균이 I1 기준(${I1_REFERENCE_LAST}) 대비 +${I2_EXTRA_MAX} 이내`,
      observed: `마지막 세대 기준 평균 ${fmt(lastBase.baseMean)}, I1 대비 ${i2Delta >= 0 ? '+' : ''}${fmt(i2Delta)}`,
      pass: i2Delta <= I2_EXTRA_MAX,
    },
  ];

  const info: InfoRow[] = [
    {
      id: 'I1',
      text: '무작위 교배(보너스 유전 상태, 판정 아님): 전 세대 잠재 평균(표현형) 최대 |Δ|',
      observed: `${fmt(rndDev)} (${rndWorst.generation}세대, 1세대 ${fmt(r0.potentialMean)}, 마지막 ${fmt(last(rnd).potentialMean)})`,
    },
    {
      id: 'I3',
      text: '무작위 교배 표현형(저장값) SD 비 범위(개정 5 정보)',
      observed: `${fmt(ratioMin * 100, 1)}%~${fmt(ratioMax * 100, 1)}% (1세대 SD ${fmt(r0.potentialSd)}, 마지막 ${fmt(last(rnd).potentialSd)})`,
    },
    {
      id: 'I4',
      text: `열린 종마 풀 ${LATE_FROM_GEN}세대 이후 세대별 평균 혈량 최대(개정 5 정보)`,
      observed: `${fmt(lateBloodMax.v)}% (${lateBloodMax.g}세대), 기준 ${BLOOD_COLLAPSE_MAX}%`,
    },
    {
      id: 'I5',
      text: '닉스 그룹 차이(부모 구성 교란 포함, 개정 5 정보) 와 그룹별 보완형 비율',
      observed:
        `그룹 차이 ${fmt(nick.diff)} (SE ${fmt(nick.se)}), 고닉스 보완형 비율 ${fmt(nick.highComplementShare * 100, 1)}%, ` +
        `저닉스 보완형 비율 ${fmt(nick.lowComplementShare * 100, 1)}%`,
    },
    {
      id: 'I6',
      text: '무작위 교배 세대별 보완형 말 비율(개정 5 정보)',
      observed: `${fmt(mean(bases.slice(1).map((b) => b.complementShare)) * 100, 1)}% (2~${CYCLES + 1}세대 평균)`,
    },
  ];
  return { criteria, info };
}

/* ------------------------------------------------------------------ */
/* 리포트                                                              */
/* ------------------------------------------------------------------ */

function snapshotTable(snaps: readonly Snapshot[]): string[] {
  const pct = (v: number | null): string => (v === null ? '—' : fmt(v * 100, 1) + '%');
  const rows = snaps.map(
    (s) =>
      `| ${s.generation} | ${s.count} | ${fmt(s.potentialMean)} | ${fmt(s.potentialSd)} | ${fmt(s.potentialMax)} | ` +
      `${pct(s.inbreedRate)} | ${pct(s.excessRate)} | ${fmt(s.meanBloodPercent)} | ${fmt(s.soundnessMean)} |`,
  );
  return [
    '| 세대 | 두수 | 잠재 평균 | SD | 최대 | 인브리드율 | 감점구간(혈량>25%) 비율 | 평균 혈량(%) | 건강도 평균 |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ];
}

interface CauseInput {
  rnd: readonly Snapshot[];
  rndNo: readonly Snapshot[];
  rndBonusOff: readonly Snapshot[];
  open: readonly Snapshot[];
  openFallback: readonly number[];
  openOutside: readonly number[];
  avoid: readonly Snapshot[];
  avoidFallback: readonly number[];
  closed: readonly Snapshot[];
  closedNo: readonly Snapshot[];
  complement: ComplementResult | null;
  nick: NickResult | null;
  assess: AssessResult | null;
}

/** 이탈의 원인을 진단 실행 결과로 요약한다(해석 문장은 숫자와 함께만 쓴다). */
function buildCauseLines(input: CauseInput): string[] {
  const {
    rnd,
    rndNo,
    rndBonusOff,
    open,
    openFallback,
    openOutside,
    avoid,
    avoidFallback,
    closed,
    closedNo,
    complement,
    nick,
    assess,
  } = input;
  const lines: string[] = [];

  if (rnd.length > 0 && rndNo.length > 0) {
    const z = last(rnd);
    const b = first(rndNo);
    const y = last(rndNo);
    const halfGen = firstHalfGeneration(rnd.slice(1).map((s) => s.inbreedRate ?? 0));
    lines.push(
      `- 무작위 교배(보너스 유전 상태): 감점 끔 진단은 잠재 ${fmt(b.potentialMean)} → ${fmt(y.potentialMean)}, 건강도 ${fmt(b.soundnessMean)} → ${fmt(y.soundnessMean)} 로 평탄하다. ` +
        `감점 켬(1대 한정)은 인브리드율 ${halfGen !== null ? `${halfGen}세대에 50% 이상` : '50% 미만'}, ` +
        `마지막 세대 잠재 ${fmt(z.potentialMean)}, 건강도 ${fmt(z.soundnessMean)}.`,
    );
    const zExcess = z.excessRate;
    lines.push(
      `- 무작위 교배 마지막 세대 감점구간(혈량 > ${INBREED_EXCESS_FROM}%) 교배 비율 ${fmt(zExcess === null ? null : zExcess * 100, 1)}%. ` +
        `건강도 중간값은 SOUNDNESS_REGRESSION(${SOUNDNESS_REGRESSION}) 만큼 집단 평균 쪽으로 당겨진다(genetics.ts soundnessRegressed).`,
    );
  }
  if (rnd.length > 0 && rndBonusOff.length > 0) {
    const r0 = first(rnd);
    const bo = rndBonusOff.slice(1);
    const boDev = bo.reduce((m, s) => Math.max(m, Math.abs(s.potentialMean - r0.potentialMean)), 0);
    const bl = last(rndBonusOff);
    const verdict =
      boDev <= MEAN_BAND
        ? `보너스만 끈 진단에서 상승이 C1 기준(±${MEAN_BAND}) 안으로 사라졌다(최대 |Δ| ${fmt(boDev)}). C1 판정은 통과이며, 근친 보너스 유전이 무작위 상승의 원인으로 확정된다.`
        : `보너스만 끈 진단에서도 상승이 남는다(최대 |Δ| ${fmt(boDev)}). C1 판정은 이탈이며, 근친 보너스 유전만으로는 상승을 설명하지 못한다.`;
    lines.push(
      `- 보너스만 끔(C1 판정 진단): 같은 시드에서 예상 혈량 ${INBREED_LOW}% 초과 ${INBREED_EXCESS_FROM}% 이하 망아지의 보너스만 끔. ` +
        `마지막 세대 잠재 ${fmt(bl.potentialMean)} (1세대 ${fmt(r0.potentialMean)}), 보너스 유전 상태 마지막 ${fmt(last(rnd).potentialMean)}. ${verdict}`,
    );
  }

  if (open.length > 0) {
    const sl = last(open);
    const s0 = first(open);
    const outsideLast = openOutside.length > 0 ? last(openOutside) : 0;
    const fbLast = openFallback.length > 0 ? last(openFallback) : 0;
    const lateOpen = open.filter((s) => s.generation >= LATE_FROM_GEN);
    const maxBloodLate = Math.max(...lateOpen.map((s) => s.meanBloodPercent ?? 0));
    lines.push(
      `- 열린 종마 풀 선택(판정): 마지막 세대의 평균 혈량 ${fmt(sl.meanBloodPercent)}% 는 그 세대 바깥 종마 교배 비율(${fmt(outsideLast * 100, 1)}%)에 따라 0 또는 크게 달라진다(개정 5 는 ${LATE_FROM_GEN}~${CYCLES + 1}세대 평균으로 판정). ` +
        `${LATE_FROM_GEN}세대 이후 세대별 평균 혈량 최대 ${fmt(maxBloodLate)}%(기준 ${INBREED_EXCESS_FROM}% 이하). ` +
        `잠재 ${fmt(s0.potentialMean)} → ${fmt(sl.potentialMean)} (상승 ${fmt(sl.potentialMean - s0.potentialMean)}), ` +
        `건강도 마지막 ${fmt(sl.soundnessMean)}, 평균 혈량 마지막 ${fmt(sl.meanBloodPercent)}%. ` +
        `바깥 종마 교배 비율 마지막 ${fmt(outsideLast * 100, 1)}%, 허용 후보 없음(혈량 최저 대체) 비율 마지막 ${fmt(fbLast * 100, 1)}%` +
        (firstHalfGeneration(openFallback) === null
          ? '(대체 50% 도달 없음).'
          : `(대체 50% 도달: ${firstHalfGeneration(openFallback)}세대).`),
    );
    const soundnessE = SOUNDNESS_MEAN - sl.soundnessMean;
    lines.push(
      `- 건강도 정상상태(근사, 1대 한정 후): 건강도 평균 ≈ ${SOUNDNESS_MEAN} − E (E = 세대 평균 자기 감점). ` +
        `열린 풀 마지막 세대 역산 E = ${fmt(soundnessE)}` +
        (rnd.length > 0 ? `, 무작위 마지막 세대 역산 E = ${fmt(SOUNDNESS_MEAN - last(rnd).soundnessMean)}` : '') +
        `. 근사식이며 정확한 E 는 미측정이다. 혈량 1%p 초과당 건강도 감점은 ${INBREED_EXCESS_SOUNDNESS_PENALTY}, 잠재 감점은 ${INBREED_EXCESS_POTENTIAL_PENALTY}.`,
    );
  }
  if (avoid.length > 0) {
    const sl = last(avoid);
    lines.push(
      `- 닫힌 회피 선택(진단): 허용 수말이 없어 최저 혈량 수말로 대체된 쌍 비율이 ${firstHalfGeneration(avoidFallback) === null ? '50% 에 도달하지 않음' : `${firstHalfGeneration(avoidFallback)}세대에 50% 도달`}, ` +
        `마지막 세대 평균 혈량 ${fmt(sl.meanBloodPercent)}%, 건강도 ${fmt(sl.soundnessMean)}. ` +
        `닫힌 200두는 5대 혈통 기준 몇 세대 뒤 전원이 근연이 되므로 회피가 작동하지 않는다(테스트 세계의 한계).`,
    );
  }
  if (closed.length > 0 && closedNo.length > 0) {
    const sl = last(closed);
    const sn = last(closedNo);
    lines.push(
      `- 닫힌 무회피 선택(진단): 감점을 끄면 잠재 평균이 마지막 ${fmt(sn.potentialMean)} 까지 오른다(${sn.potentialMean < SATURATION_CAP ? `${SATURATION_CAP} 미만` : `${SATURATION_CAP} 이상`}). ` +
        `감점을 켜면 마지막 ${fmt(sl.potentialMean)}, 건강도 ${fmt(sl.soundnessMean)}, 평균 혈량 ${fmt(sl.meanBloodPercent)}%. 근친 감점이 결과를 지배한다.`,
    );
  }
  if (complement) {
    const cf = complement;
    lines.push(
      `- 보완형 효과(C12): 그룹 차이 ${fmt(cf.groupDiff)} 대 기대 ${fmt(cf.expected)} (관측/기대 ${fmt(cf.groupDiff / cf.expected, 2)}). ` +
        `같은 쌍 반사실 차이 ${fmt(cf.counterfactualDiff)} (잔차 ${fmt(cf.counterfactualResidual, 4)}, 부 교체 후 보완형 잔존 ${cf.flipFailures}쌍). ` +
        `그룹 차이와 반사실 차이가 다르면 보완형 쌍과 비보완형 쌍의 부모 구성 차이가 섞인 것이다. 기전 자체는 반사실 쪽이 정확하다.`,
    );
  }
  if (rnd.length > 0) {
    const i2 = last(rnd).potentialMean - I1_REFERENCE_LAST;
    lines.push(
      `- 무작위 교배 I2: 마지막 세대 ${fmt(last(rnd).potentialMean)}, 개정 3 I1 기준 ${fmt(I1_REFERENCE_LAST)} 대비 ${i2 >= 0 ? '+' : ''}${fmt(i2)}. ` +
        `보완형 1대 한정 효과와 거리 적성 유전 변경이 함께 들어간 값이므로 두 요인은 이 실행만으로 나눌 수 없다.`,
    );
  }
  if (nick) {
    const tableHigh = NICKS.filter((e) => e.value >= NICK_HIGH_MIN);
    const tableHighMean = mean(tableHigh.map((e) => e.value));
    lines.push(
      `- 닉스: 닉스 표의 고닉스 항목 ${tableHigh.length}개 평균 ${fmt(tableHighMean, 3)} → NICK_EFFECT_MAX(${NICK_EFFECT_MAX}) × 평균 ≈ ${fmt(NICK_EFFECT_MAX * tableHighMean)} (개정 2 기준 1~${NICK_DIFF_MAX} 안). ` +
        `관측 차이 ${fmt(nick.diff)}, 반사실 차이 ${fmt(nick.counterfactualHighMean)}, 잔차 ${fmt(nick.counterfactualResidual, 4)}. ` +
        `그룹 차이와 반사실 차이의 어긋남은 고닉스·저닉스 쌍의 부모 구성 차이(표본 교란)에서 온다. 기전 검증은 반사실 쪽이다.`,
    );
  }
  if (assess) {
    const parts = assess.stages.map((s) => `${s.stage} ${fmt(s.rho, 3)}`).join(' → ');
    lines.push(`- 단서: 단계별 진짜 값 기준 ρ 는 ${parts}. 잠재 기준 원안 ρ 는 ${assess.stages.map((s) => fmt(s.rhoPotential, 3)).join(' → ')}.`);
  }
  return lines;
}

function seriesPct(rates: readonly number[]): string {
  return rates.map((v) => fmt(v * 100, 0)).join(' · ');
}

function buildReport(criteria: readonly Criterion[], info: readonly InfoRow[], timings: Record<string, number>): string {
  const rnd = results.random?.snapshots ?? [];
  const open = results.open?.snapshots ?? [];
  const avoid = results.avoid?.snapshots ?? [];
  const closed = results.selection?.snapshots ?? [];
  const nick = results.nick;
  const assess = results.assess;
  const deviations = criteria.filter((c) => !c.pass);
  const totalMs = Object.values(timings).reduce((s, v) => s + v, 0);

  const out: string[] = [];
  out.push('# M2-11 배합·유전 검증 리포트', '');
  out.push('개정 5(측정 방식 정리) 재실행', '');
  out.push('- 작성일: 2026-10-11');
  out.push('- 실행: `VERIFY=1 npx vitest run tests/verify/breeding.test.ts` (FULL 모드)');
  const sec = (key: string): string => fmt((timings[key] ?? 0) / 1000, 1);
  out.push(
    `- 소요: 무작위 ${sec('random')}초 · 보너스 끔 ${sec('bonusOff')}초 · 열린 풀 ${sec('open')}초 · 닫힌 회피 ${sec('avoid')}초 · ` +
      `닫힌 무회피 ${sec('selection')}초 · 닉스 ${sec('nick')}초 · 단서 ${sec('assess')}초 · 합계 ${fmt(totalMs / 1000, 1)}초`,
  );
  out.push('');

  out.push('## 기준 이탈 지표', '');
  if (deviations.length === 0) {
    out.push('없음');
  } else {
    for (const d of deviations) out.push(`- **${d.id} 이탈**: ${d.text}. 관측: ${d.observed}`);
  }
  out.push('');

  out.push('### 원인 진단 (관측 요약, 판정 아님)', '');
  out.push(
    ...buildCauseLines({
      rnd,
      rndNo: results.randomNoInbreed?.snapshots ?? [],
      rndBonusOff: results.randomBonusOff?.snapshots ?? [],
      open,
      openFallback: results.open?.fallbackRates ?? [],
      openOutside: results.open?.outsideRates ?? [],
      avoid,
      avoidFallback: results.avoid?.fallbackRates ?? [],
      closed,
      closedNo: results.selectionNoInbreed?.snapshots ?? [],
      complement: results.complement ?? null,
      nick: nick ?? null,
      assess: assess ?? null,
    }),
  );
  out.push('');

  out.push('## 기준 판정 전체', '');
  out.push('| # | 기준 | 관측 | 판정 |', '|---|---|---|---|');
  for (const c of criteria) out.push(`| ${c.id} | ${c.text} | ${c.observed} | ${c.pass ? '통과' : '이탈'} |`);
  for (const r of info) out.push(`| ${r.id} | ${r.text} | ${r.observed} | 정보 |`);
  out.push('');

  out.push('## 실행 조건', '');
  out.push('| 항목 | 값 |', '|---|---|');
  out.push(`| 창시자 시드 | \`${SEED.founders}\` (수 ${PER_SEX}·암 ${PER_SEX}, 능력 level ${FOUNDER_LEVEL}, spread ${FOUNDER_SPREAD}) |`);
  out.push(`| 무작위 교배 시드 | \`${SEED.randomMating}\` (보너스 끔 진단도 같은 시드) |`);
  out.push(
    `| 열린 종마 풀 시드 | \`${SEED.openMating}\` (암말 자가 상위 ${SELECT_RATIO * 100}%, 종마 후보 자가 상위 ${SELECT_RATIO * 100}% + 바깥 종마 ${OUTSIDE_SIRES_PER_GEN}두/세대 (rng.fork('outside-sires')), 세대당 종마 상한 ${OPEN_SIRE_MAX_PER_GEN}두) |`,
  );
  out.push(`| 닫힌 회피 선택 시드 | \`${SEED.avoidMating}\` (진단) |`);
  out.push(`| 닫힌 무회피 선택 시드 | \`${SEED.selectionMating}\` (진단) |`);
  out.push(`| 닉스 쌍 시드 | \`${SEED.nickPairs}\` (쌍 ${NICK_PAIRS}개) |`);
  out.push(`| 단서 말 시드 | \`${SEED.assessHorses}\` (말 ${ASSESS_HORSES}두, 평가자 능력 ${ASSESS_SKILL}) |`);
  out.push(`| 교배 사이클 | ${CYCLES}회 (1세대 창시자 + 2~${CYCLES + 1}세대) |`);
  out.push(`| 쌍당 교배 | 매 세대 쌍 ${PER_SEX * 2}개, 모계 명성 0, 부·모 own 혈량 전달(1대 한정) |`);
  out.push('');

  out.push('## 1. 닫힌 집단 무작위 교배 (보너스 유전 상태, C2·I2 는 유전 기준값으로 판정, C1 은 보너스 끔 진단)', '');
  out.push(...snapshotTable(rnd));
  out.push('');
  if (results.random) {
    out.push('### 1-b. 유전 기준값 (개정 5: 보완형 말은 잠재 ÷ (1 + COMPLEMENT_BONUS), C2·I2 판정 대상)', '');
    out.push('| 세대 | 기준 평균 | 기준 SD | 표현형 평균 | 표현형 SD | 보완형 말 비율 |', '|---|---|---|---|---|---|');
    for (const b of geneticBaseStats(results.random)) {
      out.push(
        `| ${b.generation} | ${fmt(b.baseMean)} | ${fmt(b.baseSd)} | ${fmt(b.phenMean)} | ${fmt(b.phenSd)} | ${fmt(b.complementShare * 100, 1)}% |`,
      );
    }
  }
  out.push('');

  out.push('## 2. 열린 종마 풀 선택 (판정 대상, 개정 3)', '');
  out.push(...snapshotTable(open));
  out.push('');
  if (open.length > 0) {
    const s0 = first(open);
    const sl = last(open);
    out.push(
      `- 열린 풀 건강도: ${fmt(s0.soundnessMean)} → ${fmt(sl.soundnessMean)} (변화 ${fmt(sl.soundnessMean - s0.soundnessMean)}), ` +
        `인브리드율: 2세대 ${fmt((open[1]?.inbreedRate ?? 0) * 100, 1)}% → 마지막 ${fmt((sl.inbreedRate ?? 0) * 100, 1)}%, ` +
        `평균 혈량: 2세대 ${fmt(open[1]?.meanBloodPercent ?? null)}% → 마지막 ${fmt(sl.meanBloodPercent)}%`,
    );
    out.push(`- 열린 풀 허용 후보 없음 → 최저 혈량 대체 비율(세대 2→): ${seriesPct(results.open?.fallbackRates ?? [])}`);
    out.push(`- 열린 풀 바깥 종마 교배 비율(세대 2→): ${seriesPct(results.open?.outsideRates ?? [])}`);
    out.push('');
  }

  out.push('## 2-b. 닫힌 회피 선택 (진단만, 판정 제외)', '');
  out.push(...snapshotTable(avoid));
  out.push('');
  if (avoid.length > 0) {
    out.push(`- 닫힌 회피 대체 비율(세대 2→): ${seriesPct(results.avoid?.fallbackRates ?? [])}`);
    out.push('');
  }

  out.push('## 2-c. 닫힌 무회피 선택 (진단만, 판정 제외)', '');
  out.push(...snapshotTable(closed));
  out.push('');

  out.push('## 2-d. 보완형 효과 (C12, 개정 4)', '');
  if (results.complement) {
    const cx = results.complement;
    out.push('| 항목 | 값 |', '|---|---|');
    out.push(`| 쌍 수 | ${cx.pairs} (보완형 ${cx.compN}, 비보완형 ${cx.nonN}) |`);
    out.push(`| 보완형 평균 잠재 | ${fmt(cx.compMean)} |`);
    out.push(`| 비보완형 평균 잠재 | ${fmt(cx.nonMean)} |`);
    out.push(`| 그룹 차이 (보완형 − 비보완형) | ${fmt(cx.groupDiff)} (SE ${fmt(cx.groupSe)}) |`);
    out.push(`| 기대 COMPLEMENT_BONUS(${COMPLEMENT_BONUS}) × 보완형 쌍 부모 중간값(${fmt(cx.parentMid)}) | ${fmt(cx.expected)} |`);
    out.push(`| 같은 쌍 반사실 차이 (부 거리 적성만 교체) | ${fmt(cx.counterfactualDiff)} |`);
    out.push(`| 반사실 잔차 평균 \\|Δ − 0.08×부모 중간값\\| | ${fmt(cx.counterfactualResidual, 4)} |`);
    out.push(`| 부 교체 후 보완형이 남은 쌍 | ${cx.flipFailures} |`);
  }
  out.push('');

  out.push('## 3. 닉스 효과', '');
  if (nick) {
    out.push('| 항목 | 값 |', '|---|---|');
    out.push(`| 쌍 수 | ${nick.pairs} (닉스 ≥ ${NICK_HIGH_MIN}: ${nick.high.n}, |닉스| < ${NICK_LOW_ABS_MAX}: ${nick.low.n}, 중간 구간: ${nick.middle}) |`);
    out.push(`| 고닉스 평균 잠재 | ${fmt(nick.high.potentialMean)} (평균 닉스 ${fmt(nick.high.nickMean, 3)}) |`);
    out.push(`| 저닉스 평균 잠재 | ${fmt(nick.low.potentialMean)} (평균 닉스 ${fmt(nick.low.nickMean, 3)}) |`);
    out.push(`| 차이 (고 − 저) | ${fmt(nick.diff)} (SE ${fmt(nick.se)}) |`);
    out.push(`| 기대치 NICK_EFFECT_MAX × 평균 닉스 차 | ${fmt(nick.expected)} |`);
    out.push(`| 반사실 차이 (고닉스 쌍, 잡음 없음) | ${fmt(nick.counterfactualHighMean)} |`);
    out.push(`| 반사실 잔차 평균 \\|Δ − 4×닉\\| | ${fmt(nick.counterfactualResidual, 4)} |`);
  }
  out.push('');

  out.push('## 4. 단서 정확도 (overall 등급 vs 진짜 값)', '');
  if (assess) {
    out.push('| 단계 | ρ (단계별 진짜 값, 판정) | ρ (잠재 기준, 명세 원안 참고) | ρ (조교 혼합 기준, 참고) | 평균 등급 점수(S=5…E=0) | S | A | B | C | D | E |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const s of assess.stages) {
      out.push(`| ${s.stage} | ${fmt(s.rho, 3)} | ${fmt(s.rhoPotential, 3)} | ${fmt(s.rhoBlend, 3)} | ${fmt(s.meanScore)} | ${s.distribution.join(' | ')} |`);
    }
    const stageRhos = assess.stages.map((s) => s.rho);
    const stageMono = stageRhos.every((v, i) => i === 0 || (stageRhos[i - 1] ?? 0) < v);
    out.push('');
    out.push(`- 단계별 진짜 값 기준 단조 증가: ${stageMono ? '성립' : '불성립'}. in_training ρ ${fmt(stageRhos[stageRhos.length - 1] ?? null, 3)} (기준 ≥ ${RHO_IN_TRAINING_MIN}).`);
  }
  out.push('');

  out.push('## 5. 진단', '');
  out.push('### 5-1. 무작위 교배, 인브리드 보정 끔 (교배에서만 끔, 탐지 통계는 그대로 기록)', '');
  out.push(...snapshotTable(results.randomNoInbreed?.snapshots ?? []));
  out.push('');
  out.push('### 5-2. 닫힌 무회피 선택, 인브리드 보정 끔', '');
  out.push(...snapshotTable(results.selectionNoInbreed?.snapshots ?? []));
  out.push('');
  out.push(
    `### 5-3. 무작위 교배, 보너스만 끔 (C1 판정 진단: 예상 혈량 ${INBREED_LOW}% 초과 ${INBREED_EXCESS_FROM}% 이하 망아지만 보너스 없음)`,
    '',
  );
  out.push(...snapshotTable(results.randomBonusOff?.snapshots ?? []));
  out.push('');

  out.push('## 가정과 해석 메모', '');
  out.push('- 세대: 1세대는 창시자, 이후 교배 사이클 20회로 2~21세대를 만든다(표 행 21개).');
  out.push('- 하위 계통: parentLineId 가 있는 계통 17개에서 창시자 sireLineId 를 무작위 배정했다. 루트 계통 2개는 제외.');
  out.push('- 모부 계통: 교배의 damsireLineId 는 어미의 sireLineId 를 쓴다(어미의 부 = 어미 계통, breed 가 그대로 물려주는 값).');
  out.push('- 표준편차: 모집단 SD(분모 n). 잠재 평균은 5개 능력 잠재치의 단순 평균.');
  out.push('- 세대 잠재 평균·건강도는 망아지 자신의 감점(잠재 0.4/%p, 건강도 1.0/%p)을 포함한 저장값이다(개정 측정 기준).');
  out.push('- 모계 명성 점수는 0으로 고정(닫힌 집단에 명성 정보가 없음). 인브리드 보정은 교배마다 `dominantCrosses(root, findInbreeding(root))` 결과를 쓴다(season.ts·preview.ts 와 같은 방식).');
  out.push('- 1대 한정(M2-05c): 부·모의 기준값은 `ownBloodPercent(lookup, 부·모)` 로 구한 자신의 혈량을 breed 에 넘겨 과다 감점을 되돌린다(season.ts 와 같은 방식). 감점 끔 진단은 저장값에 감점이 없으므로 이 값을 0 으로 넘긴다.');
  out.push('- 열린 종마 풀(개정 3, 판정): 암말은 자가 상위 20%. 종마 후보는 자가 상위 20% 수말 + 매 세대 새로 만든 바깥 종마 30두(혈통 미상, 자가 말과 혈연 없음). 암말마다 예상 혈량 ≤ 25% 후보 중 잠재 최고, 종마당 세대 최대 10두. 허용 후보가 없으면 혈량 최저.');
  out.push('- 닫힌 회피·무회피 선택(개정 2): 진단 표로만 남긴다. 닫힌 200두는 5대 혈통 기준 몇 세대 뒤 전원이 근연이 되는 테스트 세계의 한계다.');
  out.push('- 단서 실험: 말은 2살(2024년생). 진짜 값은 개정 3에 따라 단계별로 정한다: foal·yearling·two_year_old 는 잠재 평균, in_training 은 현재 능력 0.6 + 잠재 0.4.');
  out.push('- 닉스 효과: 같은 시드로 닉스 유무만 바꾼 반사실 쌍을 함께 기록. 기전이 맞으면 잔차는 0에 가깝다(클램프 제외). FULL 8000쌍(고닉스 200쌍 이상 확보).');
  out.push('');

  if (rnd.length > 0) {
    out.push(`> 생성: ${new Date().toISOString()}`);
    out.push('');
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* 테스트                                                              */
/* ------------------------------------------------------------------ */

describe('M2-11 배합·유전 검증', () => {
  it(
    '재현성: 같은 시드로 무작위·열린·닫힌 선택 교배를 두 번 돌리면 말 레코드가 완전히 같다',
    () => {
      for (const mode of ['random', 'open', 'avoid', 'selection'] as const) {
        const a = runScenario(mode, CYCLES, PER_SEX);
        const b = runScenario(mode, CYCLES, PER_SEX);
        expect(a.snapshots).toEqual(b.snapshots);
        expect(JSON.stringify([...a.registry.values()])).toBe(JSON.stringify([...b.registry.values()]));
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '혈통 불변식: 모든 자마의 sireLineId 는 부의 sireLineId 와 같다(모부 계통 키의 근거)',
    () => {
      const { registry } = runScenario('random', 2, 20);
      let checked = 0;
      for (const h of registry.values()) {
        if (h.sireId === null) continue;
        const sire = registry.get(h.sireId);
        if (!sire) continue;
        expect(h.sireLineId).toBe(sire.sireLineId);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '열린 종마 풀 불변식: 바깥 종마는 혈통 미상, 세대당 종마 1두의 교배는 상한 이하',
    () => {
      const run = runScenario('open', 2, 20);
      const outside = [...run.registry.values()].filter((h) => h.id.startsWith('O'));
      expect(outside.length).toBe(2 * OUTSIDE_SIRES_PER_GEN);
      for (const o of outside) {
        expect(o.sireId).toBeNull();
        expect(o.damId).toBeNull();
      }
      for (let gen = 2; gen <= 3; gen++) {
        const counts = new Map<HorseId, number>();
        for (const h of run.registry.values()) {
          if (!h.id.startsWith(`G${gen}-`) || h.sireId === null) continue;
          counts.set(h.sireId, (counts.get(h.sireId) ?? 0) + 1);
        }
        for (const n of counts.values()) expect(n).toBeLessThanOrEqual(OPEN_SIRE_MAX_PER_GEN);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `무작위 교배 ${CYCLES}세대 시뮬레이션 (집단 ${PER_SEX * 2})`,
    () => {
      const t0 = performance.now();
      const run = runScenario('random', CYCLES, PER_SEX);
      results.timingsMs.random = performance.now() - t0;
      results.random = run;

      expect(run.snapshots).toHaveLength(CYCLES + 1);
      for (const s of run.snapshots) {
        expect(s.count).toBe(PER_SEX * 2);
        expect(Number.isFinite(s.potentialMean)).toBe(true);
        expect(s.potentialMean).toBeGreaterThan(0);
        expect(s.potentialMean).toBeLessThanOrEqual(100);
        expect(s.soundnessMean).toBeGreaterThanOrEqual(1);
        expect(s.soundnessMean).toBeLessThanOrEqual(100);
      }
      expect(first(run.snapshots).inbreedRate).toBeNull();
      for (const s of run.snapshots.slice(1)) {
        expect(s.inbreedRate).toBeGreaterThanOrEqual(0);
        expect(s.inbreedRate).toBeLessThanOrEqual(1);
      }
      say(
        `[무작위] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}` +
          ` (${fmt((results.timingsMs.random ?? 0) / 1000, 2)}초)`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `진단(C1 판정): 보너스만 끔 — 무작위 교배 (같은 시드)`,
    () => {
      const t0 = performance.now();
      const run = runScenario('random', CYCLES, PER_SEX, { bonusOff: true });
      results.timingsMs.bonusOff = performance.now() - t0;
      results.randomBonusOff = run;
      expect(run.snapshots).toHaveLength(CYCLES + 1);
      say(
        `[진단 무작위·보너스 끔] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `열린 종마 풀 선택 ${CYCLES}세대 시뮬레이션 (판정 대상, 개정 3)`,
    () => {
      const t0 = performance.now();
      const run = runScenario('open', CYCLES, PER_SEX);
      results.timingsMs.open = performance.now() - t0;
      results.open = run;

      expect(run.snapshots).toHaveLength(CYCLES + 1);
      for (const s of run.snapshots) {
        expect(Number.isFinite(s.potentialMean)).toBe(true);
        expect(Number.isFinite(s.soundnessMean)).toBe(true);
      }
      for (const r of [...run.fallbackRates, ...run.outsideRates]) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
      say(
        `[열린 풀] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}` +
          `, 평균 혈량 마지막 ${fmt(last(run.snapshots).meanBloodPercent)}%, 건강도 마지막 ${fmt(last(run.snapshots).soundnessMean)}` +
          ` (${fmt((results.timingsMs.open ?? 0) / 1000, 2)}초)`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `진단: 닫힌 회피 선택 ${CYCLES}세대 (개정 2, 진단만)`,
    () => {
      const t0 = performance.now();
      const run = runScenario('avoid', CYCLES, PER_SEX);
      results.timingsMs.avoid = performance.now() - t0;
      results.avoid = run;
      expect(run.snapshots).toHaveLength(CYCLES + 1);
      say(
        `[진단 닫힌 회피] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}` +
          `, 평균 혈량 마지막 ${fmt(last(run.snapshots).meanBloodPercent)}%`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `진단: 닫힌 무회피 선택 ${CYCLES}세대 (진단만)`,
    () => {
      const t0 = performance.now();
      const run = runScenario('selection', CYCLES, PER_SEX);
      results.timingsMs.selection = performance.now() - t0;
      results.selection = run;

      expect(run.snapshots).toHaveLength(CYCLES + 1);
      for (const s of run.snapshots) {
        expect(Number.isFinite(s.potentialMean)).toBe(true);
        expect(Number.isFinite(s.soundnessMean)).toBe(true);
      }
      say(
        `[닫힌 무회피] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}` +
          `, 인브리드율 마지막 ${fmt((last(run.snapshots).inbreedRate ?? 0) * 100, 1)}%` +
          ` (${fmt((results.timingsMs.selection ?? 0) / 1000, 2)}초)`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '진단: 인브리드 보정 끔 — 무작위 교배 (같은 시드, 통계는 그대로 기록)',
    () => {
      const run = runScenario('random', CYCLES, PER_SEX, { ignoreInbreeding: true });
      results.randomNoInbreed = run;
      expect(run.snapshots).toHaveLength(CYCLES + 1);
      say(
        `[진단 무작위·보정 끔] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}` +
          `, 건강도 ${fmt(first(run.snapshots).soundnessMean)} → ${fmt(last(run.snapshots).soundnessMean)}`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '진단: 인브리드 보정 끔 — 닫힌 무회피 선택 (같은 시드)',
    () => {
      const run = runScenario('selection', CYCLES, PER_SEX, { ignoreInbreeding: true });
      results.selectionNoInbreed = run;
      expect(run.snapshots).toHaveLength(CYCLES + 1);
      say(
        `[진단 닫힌 무회피·보정 끔] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `보완형 효과 (무작위 쌍 ${COMPLEMENT_PAIRS}, 개정 4 C12)`,
    () => {
      const t0 = performance.now();
      const cx = runComplementSection();
      results.timingsMs.complement = performance.now() - t0;
      results.complement = cx;

      expect(cx.pairs).toBe(COMPLEMENT_PAIRS);
      expect(cx.compN + cx.nonN).toBe(COMPLEMENT_PAIRS);
      // 반사실 성립 조건: 부 교체 후 보완형이 남으면 안 된다
      expect(cx.flipFailures).toBe(0);
      if (cx.compN > 0) expect(cx.counterfactualResidual).toBeLessThan(0.5);
      say(
        `[보완형] 보완형 ${cx.compN}쌍 · 비보완형 ${cx.nonN}쌍 · 그룹 차이 ${fmt(cx.groupDiff)} · 기대 ${fmt(cx.expected)}` +
          ` · 반사실 차이 ${fmt(cx.counterfactualDiff)} · 반사실 잔차 ${fmt(cx.counterfactualResidual, 4)}`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `닉스 효과 (무작위 쌍 ${NICK_PAIRS})`,
    () => {
      const t0 = performance.now();
      const nick = runNickSection();
      results.timingsMs.nick = performance.now() - t0;
      results.nick = nick;

      expect(nick.pairs).toBe(NICK_PAIRS);
      expect(nick.high.n + nick.low.n + nick.middle).toBe(NICK_PAIRS);
      // 기전 구조 점검: 닉스 유무 차이가 NICK_EFFECT_MAX × 닉스 값과 맞아야 한다(클램프가 드물어 허용 오차 작음)
      expect(nick.counterfactualResidual).toBeLessThan(0.5);
      say(
        `[닉스] 고 ${nick.high.n}쌍 ${fmt(nick.high.potentialMean)} · 저 ${nick.low.n}쌍 ${fmt(nick.low.potentialMean)}` +
          ` · 차이 ${fmt(nick.diff)} · 반사실 잔차 ${fmt(nick.counterfactualResidual, 4)}`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `단서 정확도 (말 ${ASSESS_HORSES}두, 4단계)`,
    () => {
      const t0 = performance.now();
      const assess = runAssessSection();
      results.timingsMs.assess = performance.now() - t0;
      results.assess = assess;

      expect(assess.stages).toHaveLength(STAGES.length);
      for (const s of assess.stages) {
        expect(s.rho).toBeGreaterThanOrEqual(-1);
        expect(s.rho).toBeLessThanOrEqual(1);
        expect(s.distribution.reduce((sum, v) => sum + v, 0)).toBe(ASSESS_HORSES);
      }
      // 구현 상식 점검(판정 기준 아님): 조교 중 단계 단서는 엔진이 추정하려는 진짜 값(혼합)과 강한 양의 상관이어야 한다
      const rhoInBlend = assess.stages.find((s) => s.stage === 'in_training')?.rhoBlend ?? 0;
      expect(rhoInBlend).toBeGreaterThan(0.5);
      say(
        assess.stages.map((s) => `[단서] ${s.stage} ρ=${fmt(s.rho, 3)} (잠재 기준 ${fmt(s.rhoPotential, 3)})`).join(' · '),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it.runIf(FULL)(
    'FULL: 기준 판정 후 리포트 저장 (docs/reports/2026-10-11-m2-breeding.md)',
    () => {
      const { criteria, info } = buildCriteria();
      const timings = results.timingsMs;
      const md = buildReport(criteria, info, timings);
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, md, 'utf8');
      expect(existsSync(REPORT_PATH)).toBe(true);
      const deviations = criteria.filter((c) => !c.pass).map((c) => c.id);
      say(`[리포트] ${REPORT_PATH} 저장. 기준 이탈: ${deviations.length === 0 ? '없음' : deviations.join(', ')}`);
    },
    TEST_TIMEOUT_MS,
  );
});
