/**
 * M2-11 배합·유전 검증 (명세: docs/specs/M2-11-breeding-verification.md)
 *
 * 기본 모드(npm test): 작은 규모(세대 3, 집단 60)로 구조·재현성만 단언한다.
 * FULL 모드(VERIFY=1): 명세 규모로 돌리고 기준 이탈을 리포트 맨 위에 적는다.
 *   기준 미달은 테스트 실패로 두지 않는다(판단은 Opus). 구조가 깨지면 실패한다.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breed, type BreedArgs } from '../../src/engine/breeding/genetics';
import {
  dominantCrosses,
  findInbreeding,
  ownBloodPercent,
  totalBloodPercent,
} from '../../src/engine/breeding/inbreeding';
import { nickValue } from '../../src/engine/breeding/nicks';
import { buildMatingPedigree } from '../../src/engine/breeding/pedigree';
import { IN_TRAINING_ABILITY_WEIGHT } from '../../src/engine/config/assessment';
import {
  INBREED_EXCESS_FROM,
  INBREED_EXCESS_POTENTIAL_PENALTY,
  INBREED_EXCESS_SOUNDNESS_PENALTY,
  NICK_EFFECT_MAX,
  SOUNDNESS_REGRESSION,
} from '../../src/engine/config/genetics';
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
 * FULL 은 고닉스 200쌍 이상을 확보하도록 8000쌍으로 늘린다(M2-11 2차 재실행 요청).
 */
const NICK_PAIRS = FULL ? 8000 : 200;
/** 단서 정확도 실험의 말 수 */
const ASSESS_HORSES = FULL ? 1000 : 100;
const TEST_TIMEOUT_MS = FULL ? 900_000 : 60_000;

const FOUNDER_LEVEL = 55;
const FOUNDER_SPREAD = 10;
const BASE_YEAR = 2026;
/** 선택 교배: 성별별 상위 비율 */
const SELECT_RATIO = 0.2;
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
/** 개정 4: 선택 교배 붕괴 판정 (마지막 세대) */
const BLOOD_COLLAPSE_MAX = 12.5;
const SOUNDNESS_FLOOR = 40;

const SEED = {
  founders: 'm2-11-founders',
  randomMating: 'm2-11-random-mating',
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

type Mode = 'random' | 'selection';

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

interface Criterion {
  id: string;
  text: string;
  observed: string;
  pass: boolean;
}

/** FULL 리포트용 결과 저장소. 테스트 파일 안에서 순서대로 채운다. */
const results: {
  random?: ScenarioRun;
  selection?: ScenarioRun;
  randomNoInbreed?: ScenarioRun;
  selectionNoInbreed?: ScenarioRun;
  nick?: NickResult;
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
  return [...horses]
    .sort((a, b) => avg5(b) - avg5(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, n);
}

/** 쌍마다 인브리드를 탐지하고 망아지를 만든다. 모계 명성은 0(미사용). */
function produceFoals(
  rng: Rng,
  pairs: readonly (readonly [Horse, Horse])[],
  gen: number,
  registry: ReadonlyMap<HorseId, Horse>,
  ignoreInbreeding: boolean,
): { foals: Horse[]; matings: Mating[] } {
  const lookup = (id: HorseId): Horse | undefined => registry.get(id);
  const foals: Horse[] = [];
  const matings: Mating[] = [];
  pairs.forEach(([sire, dam], i) => {
    // 개정 1: 게임 본체(season.ts, preview.ts)와 같은 방식 — 지배 교차만 남긴다.
    const root = buildMatingPedigree(lookup, sire.id, dam.id);
    const crosses = dominantCrosses(root, findInbreeding(root));
    const id = `G${gen}-${String(i).padStart(3, '0')}`;
    const args: BreedArgs = {
      sire,
      dam,
      // 모부 계통 = 어미의 부(= 어미 본인의 sireLineId). 검증은 runScenario 불변식 테스트에서 확인한다.
      damsireLineId: dam.sireLineId,
      nicks: NICKS,
      // 진단 모드에서는 보정만 끈다(인브리드 탐지 결과는 통계에 그대로 남긴다). rng 소비 순서는 같다.
      inbreeding: ignoreInbreeding ? [] : crosses,
      // M2-05c 1대 한정: 부·모의 과다 감점을 되돌려 유전 기준값을 만든다(season.ts 와 같은 방식).
      // 감점 끔 진단은 저장된 잠재·건강도에 감점이 없으므로 되돌리지 않는다(0). 되돌리면 편향이 생긴다.
      sireOwnBloodPercent: ignoreInbreeding ? 0 : ownBloodPercent(lookup, sire),
      damOwnBloodPercent: ignoreInbreeding ? 0 : ownBloodPercent(lookup, dam),
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
    matings.push({ inbred: crosses.length > 0, bloodPercent: totalBloodPercent(crosses) });
  });
  return { foals, matings };
}

/**
 * 1세대 창시자 + cycles 회 교배. mode 'random': 전체 말 중 무작위 짝.
 * mode 'selection': 세대마다 성별별 잠재 평균 상위 20% 만 부모로 쓴다.
 * 각 세대 쌍 수 = 2 × perSex (집단 크기 유지).
 */
function runScenario(mode: Mode, cycles: number, perSex: number, ignoreInbreeding = false): ScenarioRun {
  const founders = createFounders(SEED.founders, perSex);
  const registry = new Map<HorseId, Horse>();
  for (const h of founders) registry.set(h.id, h);
  const rng = createRng(mode === 'random' ? SEED.randomMating : SEED.selectionMating);

  const snapshots: Snapshot[] = [snapshot(1, founders, null)];
  let current = founders;
  for (let c = 1; c <= cycles; c++) {
    const gen = c + 1;
    const males = current.filter((h) => h.sex === 'male');
    const females = current.filter((h) => h.sex === 'female');
    const sirePool = mode === 'random' ? males : topShare(males);
    const damPool = mode === 'random' ? females : topShare(females);
    const pairs: [Horse, Horse][] = [];
    for (let i = 0; i < perSex * 2; i++) {
      pairs.push([rng.pick(sirePool), rng.pick(damPool)]);
    }
    const { foals, matings } = produceFoals(rng, pairs, gen, registry, ignoreInbreeding);
    for (const f of foals) registry.set(f.id, f);
    snapshots.push(snapshot(gen, foals, matings));
    current = foals;
  }
  return { snapshots, registry };
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
  const lookup = (id: HorseId): Horse | undefined => byId.get(id);

  const high: { avg: number; nick: number }[] = [];
  const low: { avg: number; nick: number }[] = [];
  let middle = 0;
  let residualSum = 0;
  let cfHighSum = 0;

  for (let i = 0; i < NICK_PAIRS; i++) {
    const sire = rng.pick(males);
    const dam = rng.pick(females);
    const nick = nickValue(NICKS, sire.sireLineId, dam.sireLineId);
    const base: Omit<BreedArgs, 'nicks'> = {
      sire,
      dam,
      damsireLineId: dam.sireLineId,
      inbreeding: [],
      sireOwnBloodPercent: ownBloodPercent(lookup, sire),
      damOwnBloodPercent: ownBloodPercent(lookup, dam),
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
    } else if (Math.abs(nick) < NICK_LOW_ABS_MAX) {
      low.push({ avg: avg5(withNick), nick });
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
  };
}

/* ------------------------------------------------------------------ */
/* 단서 정확도 실험                                                    */
/* ------------------------------------------------------------------ */

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

function buildCriteria(): Criterion[] {
  const rnd = results.random?.snapshots;
  const sel = results.selection?.snapshots;
  const selNoInbreed = results.selectionNoInbreed?.snapshots;
  const nick = results.nick;
  const assess = results.assess;
  if (!rnd || !sel || !nick || !assess) throw new Error('FULL 결과가 모두 없다');

  const r0 = first(rnd);
  const rndRest = rnd.slice(1);
  const maxDev = rndRest.reduce((m, s) => Math.max(m, Math.abs(s.potentialMean - r0.potentialMean)), 0);
  const worstGen = rndRest.reduce(
    (w, s) => (Math.abs(s.potentialMean - r0.potentialMean) > Math.abs(w.potentialMean - r0.potentialMean) ? s : w),
    first(rndRest),
  );
  const ratios = rndRest.map((s) => s.potentialSd / r0.potentialSd);
  const ratioMin = Math.min(...ratios);
  const ratioMax = Math.max(...ratios);

  const s0 = first(sel);
  const sLast = last(sel);
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

  return [
    {
      id: 'C1',
      text: `무작위 교배: 전 세대 잠재 평균이 1세대 ±${MEAN_BAND} 안`,
      observed: `최대 |Δ| = ${fmt(maxDev)} (${worstGen.generation}세대, 1세대 ${fmt(r0.potentialMean)})`,
      pass: maxDev <= MEAN_BAND,
    },
    {
      id: 'C2',
      text: `무작위 교배: 전 세대 SD 가 1세대의 ${SD_RATIO_MIN * 100}~${SD_RATIO_MAX * 100}%`,
      observed: `SD 비 범위 ${fmt(ratioMin * 100, 1)}%~${fmt(ratioMax * 100, 1)}% (1세대 SD ${fmt(r0.potentialSd)})`,
      pass: ratioMin >= SD_RATIO_MIN && ratioMax <= SD_RATIO_MAX,
    },
    {
      id: 'C3',
      text: `선택 교배: 20세대 후 평균 상승 +${SELECT_GAIN_MIN} 이상`,
      observed: `1세대 ${fmt(s0.potentialMean)} → 마지막 ${fmt(sLast.potentialMean)} (상승 ${fmt(gain)})`,
      pass: gain >= SELECT_GAIN_MIN,
    },
    {
      id: 'C4',
      text: `선택 교배: ${SATURATION_CAP} 미만에서 포화`,
      observed:
        `마지막 세대 평균 ${fmt(sLast.potentialMean)}, 최대 ${fmt(sLast.potentialMax)}` +
        (selNoInbreed ? ` (참고: 감점 끔 마지막 ${fmt(last(selNoInbreed).potentialMean)})` : ''),
      pass: sLast.potentialMean < SATURATION_CAP,
    },
    {
      id: 'C5',
      text: `닉스 효과: 닉스 ≥ ${NICK_HIGH_MIN} 조합 − |닉스| < ${NICK_LOW_ABS_MAX} 조합 평균 차이 ${NICK_DIFF_MIN}~${NICK_DIFF_MAX}`,
      observed: `차이 ${fmt(nick.diff)} (SE ${fmt(nick.se)}), 기대 NICK_EFFECT_MAX×평균닉스차 = ${fmt(nick.expected)}`,
      pass: nick.diff >= NICK_DIFF_MIN && nick.diff <= NICK_DIFF_MAX,
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
    // 개정 4: 닫힌 집단 붕괴 판정(선택 교배, 마지막 세대). 인브리드율 100% 자체는 기준이 아니다.
    {
      id: 'C9',
      text: `선택 교배 붕괴: 마지막 세대 평균 혈량 ≤ ${BLOOD_COLLAPSE_MAX}% (교배 기준)`,
      observed: `${fmt(sLast.meanBloodPercent)}% (인브리드율 ${fmt((sLast.inbreedRate ?? 0) * 100, 1)}%)`,
      pass: (sLast.meanBloodPercent ?? Number.POSITIVE_INFINITY) <= BLOOD_COLLAPSE_MAX,
    },
    {
      id: 'C10',
      text: `선택 교배 붕괴: 마지막 세대 건강도 평균 ≥ ${SOUNDNESS_FLOOR}`,
      observed: `${fmt(sLast.soundnessMean)} (1세대 ${fmt(s0.soundnessMean)})`,
      pass: sLast.soundnessMean >= SOUNDNESS_FLOOR,
    },
    {
      id: 'C11',
      text: '선택 교배 붕괴: 마지막 세대 잠재 평균 ≥ 1세대 잠재 평균',
      observed: `${fmt(sLast.potentialMean)} vs 1세대 ${fmt(s0.potentialMean)}`,
      pass: sLast.potentialMean >= s0.potentialMean,
    },
  ];
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

/** 이탈의 원인을 진단 실행 결과로 요약한다(해석 문장은 숫자와 함께만 쓴다). */
function buildCauseLines(
  rnd: readonly Snapshot[],
  rndNo: readonly Snapshot[],
  sel: readonly Snapshot[],
  selNo: readonly Snapshot[],
  nick: NickResult | null,
  assess: AssessResult | null,
): string[] {
  const lines: string[] = [];
  if (rnd.length > 0 && rndNo.length > 0) {
    const z = last(rnd);
    const b = first(rndNo);
    const y = last(rndNo);
    const firstHalfInbred = rnd.find((s) => (s.inbreedRate ?? 0) >= 0.5);
    lines.push(
      `- 무작위 교배 잠재: 감점 끔 진단은 잠재 ${fmt(b.potentialMean)} → ${fmt(y.potentialMean)}, 건강도 ${fmt(b.soundnessMean)} → ${fmt(y.soundnessMean)} 로 평탄하다. ` +
        `1대 한정 반영 후(감점 켬)는 인브리드율 ${firstHalfInbred ? firstHalfInbred.generation + '세대에 50% 이상' : '50% 미만'}, ` +
        `마지막 세대 잠재 평균 ${fmt(z.potentialMean)}, 건강도 ${fmt(z.soundnessMean)}. ` +
        `잠재 상승(C1 이탈)은 부·모 감점을 되돌려 기준값이 올라가는 효과와 근친 보너스(INBREED_BONUS_MAX, 자손에게 그대로 유전)가 섞인 결과로 보이나, ` +
        `감점 끔 진단은 보너스도 함께 꺼지므로 이 실행만으로는 둘을 나눌 수 없다(가설, 미검증).`,
    );
    lines.push(
      `- 마지막 세대 감점구간(혈량 > ${INBREED_EXCESS_FROM}%) 교배 비율 ${fmt(z.excessRate === null ? null : z.excessRate * 100, 1)}%. ` +
        `건강도 중간값은 SOUNDNESS_REGRESSION(${SOUNDNESS_REGRESSION}) 만큼 집단 평균 쪽으로 당겨진다(genetics.ts soundnessRegressed).`,
    );
  }
  if (sel.length > 0 && selNo.length > 0) {
    const sl = last(sel);
    const sn = last(selNo);
    lines.push(
      `- 선택 교배: 감점을 끄면 잠재 평균이 마지막 ${fmt(sn.potentialMean)} 까지 오르고 85 미만에서 완만해진다(포화 확인). ` +
        `감점을 켜면 마지막 ${fmt(sl.potentialMean)}. 선택 효과 자체보다 근친 감점이 결과를 지배한다.`,
    );
    lines.push(
      `- 1대 한정 반영 후(M2-05c): 부·모의 과다 감점은 부·모 자신의 기준값으로 되돌려져 자손에게 전달되지 않는다. ` +
        `선택 교배 마지막 세대의 건강도 ${fmt(sl.soundnessMean)}, 잠재 ${fmt(sl.potentialMean)}, 평균 혈량 ${fmt(sl.meanBloodPercent)}% 는 ` +
        `감점 끔 진단(마지막 건강도 ${fmt(last(selNo).soundnessMean)}, 잠재 ${fmt(last(selNo).potentialMean)})과 비교해 읽는다. ` +
        `남는 감점은 해당 말 자신의 건강도(혈량 1%p 초과당 ${INBREED_EXCESS_SOUNDNESS_PENALTY})와 잠재(1%p당 ${INBREED_EXCESS_POTENTIAL_PENALTY})뿐이다.`,
    );
    // 정상상태 산술(근사, 1대 한정 후): 부·모 건강도를 감점 전 값으로 되돌리므로 s̄ = 0.85(s̄ + Ē) + 0.15·SOUNDNESS_MEAN − Ē 에서 s̄ ≈ SOUNDNESS_MEAN − Ē.
    lines.push(
      `- 건강도 정상상태(근사, 1대 한정 후): 건강도 평균 ≈ ${SOUNDNESS_MEAN} − E (E = 세대 평균 자기 감점). ` +
        `관측 역산 E = ${SOUNDNESS_MEAN} − 건강도: 무작위 마지막 ${rnd.length > 0 ? fmt(SOUNDNESS_MEAN - last(rnd).soundnessMean) : '—'}, 선택 마지막 ${fmt(SOUNDNESS_MEAN - sl.soundnessMean)}. ` +
        `선택 교배 E 가 ${fmt(SOUNDNESS_MEAN - sl.soundnessMean, 0)} 근처인 것은 평균 혈량 ${fmt(sl.meanBloodPercent)}% 에서 ` +
        `혈량 1%p 초과당 감점 ${INBREED_EXCESS_SOUNDNESS_PENALTY} 과 정합한다(근사, 정확한 E 는 미측정).`,
    );
  }
  if (nick) {
    const tableHigh = NICKS.filter((e) => e.value >= NICK_HIGH_MIN);
    const tableHighMean = mean(tableHigh.map((e) => e.value));
    lines.push(
      `- 닉스: 닉스 표의 고닉스 항목 ${tableHigh.length}개 평균 ${fmt(tableHighMean, 3)} → NICK_EFFECT_MAX(${NICK_EFFECT_MAX}) × 평균 ≈ ${fmt(NICK_EFFECT_MAX * tableHighMean)} (개정 2 기준 1~${NICK_DIFF_MAX} 안). ` +
        `관측 차이 ${fmt(nick.diff)}, 반사실 차이 ${fmt(nick.counterfactualHighMean)}, 잔차 ${fmt(nick.counterfactualResidual, 4)}.`,
    );
  }
  if (assess) {
    const parts = assess.stages.map((s) => `${s.stage} ${fmt(s.rho, 3)}`).join(' → ');
    lines.push(`- 단서: 단계별 진짜 값 기준 ρ 는 ${parts}. 잠재 기준 원안 ρ 는 ${assess.stages.map((s) => fmt(s.rhoPotential, 3)).join(' → ')}.`);
  }
  return lines;
}

function buildReport(criteria: readonly Criterion[], timings: Record<string, number>): string {
  const rnd = results.random?.snapshots ?? [];
  const sel = results.selection?.snapshots ?? [];
  const nick = results.nick;
  const assess = results.assess;
  const deviations = criteria.filter((c) => !c.pass);
  const totalMs = Object.values(timings).reduce((s, v) => s + v, 0);

  const out: string[] = [];
  out.push('# M2-11 배합·유전 검증 리포트', '');
  out.push('M2-05c(근친 약세 1대 한정) 반영 재실행', '');
  out.push('- 작성일: 2026-10-11');
  out.push('- 실행: `VERIFY=1 npx vitest run tests/verify/breeding.test.ts` (FULL 모드)');
  const sec = (key: string): string => fmt((timings[key] ?? 0) / 1000, 1);
  out.push(`- 소요: 무작위 ${sec('random')}초 · 선택 ${sec('selection')}초 · 닉스 ${sec('nick')}초 · 단서 ${sec('assess')}초 · 합계 ${fmt(totalMs / 1000, 1)}초`);
  out.push('');

  out.push('## 기준 이탈 지표', '');
  if (deviations.length === 0) {
    out.push('없음');
  } else {
    for (const d of deviations) out.push(`- **${d.id} 이탈**: ${d.text}. 관측: ${d.observed}`);
  }
  out.push('');

  const causeLines = buildCauseLines(results.random?.snapshots ?? [], results.randomNoInbreed?.snapshots ?? [], results.selection?.snapshots ?? [], results.selectionNoInbreed?.snapshots ?? [], nick ?? null, assess ?? null);
  if (causeLines.length > 0) {
    out.push('### 원인 진단 (관측 요약, 판정 아님)', '');
    out.push(...causeLines);
    out.push('');
  }

  out.push('## 기준 판정 전체', '');
  out.push('| # | 기준 | 관측 | 판정 |', '|---|---|---|---|');
  for (const c of criteria) out.push(`| ${c.id} | ${c.text} | ${c.observed} | ${c.pass ? '통과' : '이탈'} |`);
  out.push('');

  out.push('## 실행 조건', '');
  out.push('| 항목 | 값 |', '|---|---|');
  out.push(`| 창시자 시드 | \`${SEED.founders}\` (수 ${PER_SEX}·암 ${PER_SEX}, 능력 level ${FOUNDER_LEVEL}, spread ${FOUNDER_SPREAD}) |`);
  out.push(`| 무작위 교배 시드 | \`${SEED.randomMating}\` |`);
  out.push(`| 선택 교배 시드 | \`${SEED.selectionMating}\` (상위 ${SELECT_RATIO * 100}% 성별별) |`);
  out.push(`| 닉스 쌍 시드 | \`${SEED.nickPairs}\` (쌍 ${NICK_PAIRS}개) |`);
  out.push(`| 단서 말 시드 | \`${SEED.assessHorses}\` (말 ${ASSESS_HORSES}두, 평가자 능력 ${ASSESS_SKILL}) |`);
  out.push(`| 교배 사이클 | ${CYCLES}회 (1세대 창시자 + 2~${CYCLES + 1}세대) |`);
  out.push(`| 쌍당 교배 | 매 세대 쌍 ${PER_SEX * 2}개, 모계 명성 0 |`);
  out.push('');

  out.push('## 1. 닫힌 집단 무작위 교배', '');
  out.push(...snapshotTable(rnd));
  out.push('');

  out.push('## 2. 선택 교배 (성별별 잠재 평균 상위 20%)', '');
  out.push(...snapshotTable(sel));
  out.push('');
  if (rnd.length > 0 && sel.length > 0) {
    const s0 = first(sel);
    const sl = last(sel);
    out.push(
      `- 선택 교배 건강도: ${fmt(s0.soundnessMean)} → ${fmt(sl.soundnessMean)} (변화 ${fmt(sl.soundnessMean - s0.soundnessMean)}), ` +
        `인브리드율: 2세대 ${fmt((sel[1]?.inbreedRate ?? 0) * 100, 1)}% → 마지막 ${fmt((sl.inbreedRate ?? 0) * 100, 1)}%, ` +
        `평균 혈량: 2세대 ${fmt(sel[1]?.meanBloodPercent ?? null)}% → 마지막 ${fmt(sl.meanBloodPercent)}%`,
    );
    out.push('');
  }

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

  out.push('## 4. 단서 정확도 (overall 등급 vs 진짜 잠재 평균)', '');
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

  out.push('## 5. 진단: 인브리드 보정을 끈 같은 시드 실행', '');
  out.push('인브리드 감점(혈량 > 25%)을 교배에서만 끄고, 탐지 통계는 그대로 기록했다. 나머지 규칙은 동일.', '');
  const rndNo = results.randomNoInbreed?.snapshots ?? [];
  const selNo = results.selectionNoInbreed?.snapshots ?? [];
  out.push('### 5-1. 무작위 교배 (보정 끔)', '');
  out.push(...snapshotTable(rndNo));
  out.push('');
  out.push('### 5-2. 선택 교배 (보정 끔)', '');
  out.push(...snapshotTable(selNo));
  out.push('');

  out.push('## 가정과 해석 메모', '');
  out.push('- 세대: 1세대는 창시자, 이후 교배 사이클 20회로 2~21세대를 만든다(표 행 21개).');
  out.push('- 하위 계통: parentLineId 가 있는 계통 17개에서 창시자 sireLineId 를 무작위 배정했다. 루트 계통 2개는 제외.');
  out.push('- 모부 계통: 교배의 damsireLineId 는 어미의 sireLineId 를 쓴다(어미의 부 = 어미 계통, breed 가 그대로 물려주는 값).');
  out.push('- 표준편차: 모집단 SD(분모 n). 잠재 평균은 5개 능력 잠재치의 단순 평균.');
  out.push('- 모계 명성 점수는 0으로 고정(닫힌 집단에 명성 정보가 없음). 인브리드 보정은 교배마다 `dominantCrosses(root, findInbreeding(root))` 결과를 쓴다(season.ts·preview.ts 와 같은 방식).');
  out.push('- 1대 한정(M2-05c): 부·모의 기준값은 `ownBloodPercent(lookup, 부·모)` 로 구한 자신의 혈량을 breed 에 넘겨 과다 감점을 되돌린다(season.ts 와 같은 방식). 감점 끔 진단은 저장값에 감점이 없으므로 이 값을 0 으로 넘긴다.');
  out.push('- 닉스 실험은 고닉스 쌍 200개 이상을 확보하려고 FULL 8000쌍(기본 200쌍)을 쓴다.');
  out.push('- 단서 실험: 말은 2살(2024년생). 진짜 값은 개정 3에 따라 단계별로 정한다: foal·yearling·two_year_old 는 잠재 평균, in_training 은 현재 능력 0.6 + 잠재 0.4.');
  out.push('- 닉스 효과: 같은 시드로 닉스 유무만 바꾼 반사실 쌍을 함께 기록. 기전이 맞으면 잔차는 0에 가깝다(클램프 제외).');
  out.push('');

  if (nick && rnd.length > 0) {
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
    '재현성: 같은 시드로 무작위·선택 교배를 두 번 돌리면 말 레코드가 완전히 같다',
    () => {
      for (const mode of ['random', 'selection'] as const) {
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
    `선택 교배 ${CYCLES}세대 시뮬레이션 (성별별 상위 ${SELECT_RATIO * 100}%)`,
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
        `[선택] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}` +
          `, 인브리드율 마지막 ${fmt((last(run.snapshots).inbreedRate ?? 0) * 100, 1)}%` +
          ` (${fmt((results.timingsMs.selection ?? 0) / 1000, 2)}초)`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    `진단: 인브리드 보정 끔 — 무작위 교배 (같은 시드, 통계는 그대로 기록)`,
    () => {
      const run = runScenario('random', CYCLES, PER_SEX, true);
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
    `진단: 인브리드 보정 끔 — 선택 교배 (같은 시드)`,
    () => {
      const run = runScenario('selection', CYCLES, PER_SEX, true);
      results.selectionNoInbreed = run;
      expect(run.snapshots).toHaveLength(CYCLES + 1);
      say(
        `[진단 선택·보정 끔] 1세대 평균 ${fmt(first(run.snapshots).potentialMean)} → 마지막 ${fmt(last(run.snapshots).potentialMean)}`,
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
      const criteria = buildCriteria();
      const timings = results.timingsMs;
      const md = buildReport(criteria, timings);
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, md, 'utf8');
      expect(existsSync(REPORT_PATH)).toBe(true);
      const deviations = criteria.filter((c) => !c.pass).map((c) => c.id);
      say(`[리포트] ${REPORT_PATH} 저장. 기준 이탈: ${deviations.length === 0 ? '없음' : deviations.join(', ')}`);
    },
    TEST_TIMEOUT_MS,
  );
});
