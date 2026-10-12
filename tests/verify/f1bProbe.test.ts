import { describe, expect, it, vi } from 'vitest';
import g1ExtraJson from '../../data/calendar/g1_extra.json';
import { MAX_FATIGUE_TO_RUN } from '../../src/engine/config/conditioning';
import {
  FIELD_SIZE_CONDITIONS,
  FIELD_SIZE_GROUP,
  FIELD_SIZE_HANDICAP,
  FIELD_SIZE_LISTED,
  GROUP_OR_FLOOR,
  JUVENILE_AGE,
  MAIDEN_MAX_WINS,
  MIN_FIELD_SIZE,
  MIN_FITNESS_TO_RUN,
  MIN_WEEKS_BETWEEN_GROUP_RUNS,
  MIN_WEEKS_BETWEEN_RUNS,
  NOVICE_MAX_WINS,
  RACE_GRADE_ORDER,
  TRAVEL_CHANCE_GROUP,
  TRAVEL_COUNTRIES,
  type FieldSizeRange,
} from '../../src/engine/config/entries';
import {
  DOWN_RATE,
  HANDICAP_WIN_MIN_RISE,
  MAX_DROP,
  MAX_RISE,
  NO_DROP_BEATEN_L,
  UP_RATE,
  UP_RATE_WIN,
} from '../../src/engine/config/rating';
import { RATING_MAX, RATING_MIN } from '../../src/engine/config/population';
import { START_YEAR, WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { POPULATION_CUT_MIN_AGE, POPULATION_CUT_SHARE, POPULATION_RETIRE_AGE } from '../../src/engine/config/population';
import { MARKET_NOISE_SD, MARKET_TEMPERATURE } from '../../src/engine/config/raceday';
import { SUMMARY_NOISE_SD } from '../../src/engine/config/season';
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
import { isDistanceFit, isEligible, raceCountryOf, type CourseCountryLookup } from '../../src/engine/season/eligibility';
import { nextRating, performanceRatings } from '../../src/engine/season/handicapper';
import type { RunMeetingInPlaceOutput } from '../../src/engine/season/raceday';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear, weeksBetween } from '../../src/engine/time/calendar';
import { racingHorseIds } from '../../src/engine/world/population';
import { meanAbility, ratingFromAbility } from '../../src/engine/world/rating';
import type {
  CountryCode,
  GameDate,
  GameEvent,
  FractionalOdds,
  GameState,
  Horse,
  HorseId,
  Meeting,
  Race,
  RaceEntry,
  RaceGrade,
  RaceKind,
  Racecourse,
  RaceResult,
  Rng,
  RunnerInput,
  SeriesDefinition,
} from '../../src/engine/types';

/**
 * M3-F1b 원인 조사 측정 스크립트. VERIFY=1 일 때만 실행된다. 엔진은 고치지 않는다.
 * 시드 20261011, 2시즌(105주 = 52 × 2 + 연도 전환 1주).
 * - declareAiRunners 와 runMeetingInPlace 를 vi.mock 으로 감싸 입력·출력만 관찰한다(상태·rng 를 쓰지 않는다).
 * - 출주마 능력 강도(estimateStrength)는 관찰 시점의 사본으로 다시 계산한다(엔진 함수 재사용, 난수 없음).
 * - 몬테카를로(확률 예측)는 테스트 전용 mulberry32 로 고정 시드를 쓴다.
 * 결과는 stdout 에만 쓴다(파일 저장 없음).
 */

function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/* ------------------------------------------------------------------ */
/* 관찰 훅 (vi.mock)                                                   */
/* ------------------------------------------------------------------ */

const tap = vi.hoisted(() => ({
  decl: null as null | {
    before: (state: GameState, input: readonly Meeting[]) => void;
    after: (state: GameState, input: readonly Meeting[], out: Meeting[]) => void;
  },
  run: null as null | {
    before: (state: GameState, meeting: Meeting) => void;
    after: (state: GameState, meeting: Meeting, out: RunMeetingInPlaceOutput) => void;
  },
}));

vi.mock('../../src/engine/season/declarations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/season/declarations')>();
  return {
    ...actual,
    declareAiRunners: (
      state: GameState,
      meetings: readonly Meeting[],
      rng: Rng,
      courseCountry: CourseCountryLookup,
    ): Meeting[] => {
      tap.decl?.before(state, meetings);
      const out = actual.declareAiRunners(state, meetings, rng, courseCountry);
      tap.decl?.after(state, meetings, out);
      return out;
    },
  };
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

/* ------------------------------------------------------------------ */
/* 정적 데이터 (season.test.ts 와 같은 구성)                            */
/* ------------------------------------------------------------------ */

const SEED = 20261011;
const SEASONS = 2;
const TOTAL_WEEKS = WEEKS_PER_YEAR * SEASONS + 1;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const MC_CAP = 3000;
const MC_K = 100;
const SIGMA_GRID: readonly number[] = [0.006, 0.01, 0.015, 0.02, 0.03];
const MARKET_GRID: readonly number[] = [0.7, 1.5, 3.0];

const COURSES: Racecourse[] = getRacecourses();
const COURSE_BY_ID = new Map<string, Racecourse>(COURSES.map((c) => [c.id, c] as const));
const courseCountryOf: CourseCountryLookup = (id) => COURSE_BY_ID.get(id)?.country;
const SERIES_DEFS: SeriesDefinition[] = getSeriesDefinitions();
const TEMPLATES = getRaceTemplates();
const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t] as const));
const G1_EXTRA_IDS: string[] = (g1ExtraJson as { id: string }[]).map((r) => r.id);

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
/* 기록 타입                                                            */
/* ------------------------------------------------------------------ */

type ClassKey = 'G1' | 'G2' | 'G3' | 'L' | '핸디캡' | '메이든' | '노비스' | '조건';
const CLASS_ORDER: readonly ClassKey[] = ['G1', 'G2', 'G3', 'L', '핸디캡', '메이든', '노비스', '조건'];

function classOf(race: Race): ClassKey {
  if (race.grade !== null) return race.grade;
  if (race.kind === 'handicap') return '핸디캡';
  if (race.kind === 'maiden') return '메이든';
  if (race.kind === 'novice') return '노비스';
  return '조건';
}

interface DeclRec {
  year: number;
  week: number;
  raceId: string;
  templateId: string | null;
  cls: ClassKey;
  kind: RaceKind;
  grade: RaceGrade | null;
  country: CountryCode | null;
  maxRunners: number;
  /** 같은 주 선언 순서에서 이 레이스 직전까지 이미 찬 말을 뺀 후보 수(나라 조건 통과, 원정 제외) */
  strict: number;
  /** 그룹 레이스에서 원정 후보(TRAVEL_COUNTRIES, 나라 불일치)로 들어갈 수 있는 수. 실제는 TRAVEL_CHANCE_GROUP 확률로 통과 */
  travel: number;
  /** 목표 두수 기대치 − 이미 선언된 두수 (기대 필요 두수) */
  needExp: number;
  status: string;
  /** closed 였을 때의 최종 두수(선언 포함). abandoned 는 0 */
  field: number;
  /** 핸디캡이면 클래스(2~7), 아니면 null */
  hclass: number | null;
}

/** 후보 필터 단계(isEligible 와 같은 순서). 각 단계까지 통과한 말 수를 센다 */
const FUNNEL_STEPS: readonly string[] = [
  '마주 있음·이번 주 미사용',
  '조교 중(in_training)',
  '부상 없음',
  `준비도 ≥ MIN_FITNESS_TO_RUN(${MIN_FITNESS_TO_RUN})`,
  `피로 ≤ MAX_FATIGUE_TO_RUN(${MAX_FATIGUE_TO_RUN})`,
  '나이 범위(minAge·maxAge)',
  '성별 조건',
  'OR 대역(ratingMin·ratingMax)',
  '메이든·노비스 승수 상한',
  '마지막 출주 후 최소 주(그룹 3, 그 외 2)',
  '거리 적합(DISTANCE_TOLERANCE)',
  '그룹·리스티드 OR 하한(2세 제외)',
  '나라 조건(원정 제외, 엄격)',
];

interface WeekRec {
  year: number;
  week: number;
  meetings: number;
  open: number;
  generatedOpen: number;
  ready: number;
  groupOpen: number;
  g1Open: number;
  /** 3세 이상 현역 중 OR ≥ G1 하한(GROUP_OR_FLOOR.G1) 두수(선언 직전) */
  pool100: number;
}

interface RunRec {
  year: number;
  raceId: string;
  templateId: string | null;
  cls: ClassKey;
  simulated: boolean;
  field: number;
  favWon: boolean | null;
  favDec: number | null;
  favImplied: number | null;
  oddsFavIsTop: boolean;
  topWon: boolean;
  sdR: number;
  /** 레이스 안 능력(meanAbility 원점수) 표준편차 */
  abSd: number;
  rel: number[];
  winIdx: number[];
}

interface RunnerRec {
  year: number;
  raceId: string;
  age: number;
  cls: ClassKey;
  simulated: boolean;
  handicap: boolean;
  position: number;
  beaten: number;
  or0: number | null;
  or1: number | null;
  pr: number | null;
  mismatch: boolean;
}

interface Snap {
  id: HorseId;
  age: number;
  birthYear: number;
  country: CountryCode;
  status: Horse['status'];
  or: number | null;
  ability: number;
}

interface RetireRec {
  year: number;
  horseId: HorseId;
  age: number;
  country: CountryCode;
}

interface Col {
  weeks: WeekRec[];
  decls: DeclRec[];
  runs: RunRec[];
  runners: RunnerRec[];
  /** year → horseId → 출주 횟수 */
  starts: Map<number, Map<HorseId, number>>;
  /** 처리 주 1(연초 처리 직후) 스냅샷: year → 말 */
  start: Map<number, Map<HorseId, Snap>>;
  /** 처리 주 52(연말 처리 직후) 스냅샷 */
  end: Map<number, Map<HorseId, Snap>>;
  retired: RetireRec[];
  seriesDone: { seriesId: string; year: number }[];
  /** seriesId → year → horseId → 우승한 레그 템플릿 id 집합 */
  legWins: Map<string, Map<number, Map<HorseId, Set<string>>>>;
  /** 현재 개최의 출주 전 말 사본(run 훅 전후에 쓴다) */
  preHorses: Map<HorseId, Horse>;
  /** 후보 필터 단계별 통과 말 수 합(레이스 종류 키별) */
  funnel: Map<string, { n: number; sums: number[] }>;
}

function emptyCol(): Col {
  return {
    weeks: [],
    decls: [],
    runs: [],
    runners: [],
    starts: new Map(),
    start: new Map(),
    end: new Map(),
    retired: [],
    seriesDone: [],
    legWins: new Map(),
    preHorses: new Map(),
    funnel: new Map(),
  };
}

/* ------------------------------------------------------------------ */
/* 작은 보조                                                            */
/* ------------------------------------------------------------------ */

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

function pct(x: number, d = 1): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-';
}

function fx(x: number, d = 2): string {
  return Number.isFinite(x) ? x.toFixed(d) : '-';
}

function share(part: number, whole: number): number {
  return whole === 0 ? NaN : part / whole;
}

function ageBucket(age: number): number {
  return Math.min(age, 8);
}

function ageLabel(b: number): string {
  return b >= 8 ? '8세 이상' : `${b}세`;
}

/** 필드 목표 두수 범위(entries.ts 와 같은 규칙) */
function fieldRange(race: Race): FieldSizeRange {
  switch (race.kind) {
    case 'group':
      return FIELD_SIZE_GROUP;
    case 'listed':
      return FIELD_SIZE_LISTED;
    case 'handicap':
      return FIELD_SIZE_HANDICAP;
    default:
      return FIELD_SIZE_CONDITIONS;
  }
}

/** declarations.ts priorityKey 와 같은 처리 순서 */
function gradeRank(grade: RaceGrade | null): number {
  if (grade === null) return RACE_GRADE_ORDER.length;
  return RACE_GRADE_ORDER.indexOf(grade);
}

function priorityKey(race: Race): readonly [number, number] {
  if (race.kind === 'group') return [0, gradeRank(race.grade)];
  if (race.kind === 'listed') return [1, gradeRank(race.grade)];
  if (race.kind === 'handicap') return [2, race.raceClass];
  return [3, 0];
}

/** declarations.ts groupValue 의 하한 판정과 같다(2세는 잠재 평균이라 하한 없음) */
function groupFloorOk(h: Horse, age: number, race: Race): boolean {
  if (age <= JUVENILE_AGE) return true;
  const or = h.officialRating;
  if (or === null) return false;
  const floor = race.grade === null ? Number.NEGATIVE_INFINITY : GROUP_OR_FLOOR[race.grade];
  return or >= floor;
}

function racingHorses(state: GameState): Horse[] {
  const out: Horse[] = [];
  for (const id of racingHorseIds(state)) {
    const h = state.horses[id];
    if (h !== undefined && (h.status === 'in_training' || h.status === 'resting')) out.push(h);
  }
  return out;
}

/** 나라·선택 조건을 통과하는 후보 수. 원정(group + TRAVEL_COUNTRIES, 나라 불일치)은 따로 센다 */
function countCandidates(
  state: GameState,
  race: Race,
  date: GameDate,
  raceCountry: CountryCode | null,
  used: ReadonlySet<HorseId>,
  pool: readonly Horse[],
): { strict: number; travel: number } {
  let strict = 0;
  let travel = 0;
  const groupLike = race.kind === 'group' || race.kind === 'listed';
  for (const h of pool) {
    if (used.has(h.id) || h.ownerId === null) continue;
    if (!isEligible(h, race, date, state.seasonState)) continue;
    if (!isDistanceFit(h, race)) continue;
    const age = ageInYear(h.birthYear, date.year);
    if (groupLike && !groupFloorOk(h, age, race)) continue;
    if (raceCountry === null || h.countryOfBirth === raceCountry) {
      strict++;
    } else if (race.kind === 'group' && TRAVEL_COUNTRIES.includes(h.countryOfBirth)) {
      travel++;
    }
  }
  return { strict, travel };
}

/** 레이스 종류 키(펀넬 표). 핸디캡은 클래스별로 나눈다 */
function funnelKey(race: Race): string {
  if (race.kind === 'handicap') return `핸디캡 ${race.raceClass}`;
  return classOf(race);
}

/**
 * isEligible 와 같은 순서의 단계별 통과 여부를 한 말에 대해 계산해, 연속으로 통과한 단계 수를 돌려준다.
 * 나라 단계는 엄격(원정 제외)이다. eligibility.ts isEligible 와 같은 규칙을 단계별로 펼친 것이다.
 */
function passedSteps(
  h: Horse,
  state: GameState,
  race: Race,
  date: GameDate,
  raceCountry: CountryCode | null,
  used: ReadonlySet<HorseId>,
): number {
  const sc = race.conditions;
  const age = ageInYear(h.birthYear, date.year);
  const last = state.seasonState.lastRun[h.id];
  const minWeeks = race.kind === 'group' ? MIN_WEEKS_BETWEEN_GROUP_RUNS : MIN_WEEKS_BETWEEN_RUNS;
  const sexOk =
    sc.sex === 'open' ||
    (sc.sex === 'fillies_mares' && h.sex === 'female') ||
    (sc.sex === 'colts_geldings' && h.sex === 'male');
  const ratingOk =
    (sc.ratingMin === null && sc.ratingMax === null) ||
    (h.officialRating !== null &&
      (sc.ratingMin === null || h.officialRating >= sc.ratingMin) &&
      (sc.ratingMax === null || h.officialRating <= sc.ratingMax));
  let winsOk = true;
  if (race.kind === 'maiden') winsOk = h.record.wins <= MAIDEN_MAX_WINS;
  if (race.kind === 'novice') winsOk = h.record.wins <= NOVICE_MAX_WINS;
  const groupLike = race.kind === 'group' || race.kind === 'listed';
  const b: boolean[] = [
    !used.has(h.id) && h.ownerId !== null,
    h.status === 'in_training',
    h.condition.injury === null,
    h.condition.fitness >= MIN_FITNESS_TO_RUN,
    h.condition.fatigue <= MAX_FATIGUE_TO_RUN,
    age >= sc.minAge && (sc.maxAge === null || age <= sc.maxAge),
    sexOk,
    ratingOk,
    winsOk,
    last === undefined || weeksBetween(last, date) >= minWeeks,
    isDistanceFit(h, race),
    !groupLike || groupFloorOk(h, age, race),
    raceCountry === null || h.countryOfBirth === raceCountry,
  ];
  let c = 0;
  while (c < b.length && b[c] === true) c++;
  return c;
}

/** 정수 시드 mulberry32 (테스트 전용 몬테카를로) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussFrom(u: () => number): () => number {
  return () => {
    const u1 = Math.max(u(), 1e-12);
    const u2 = u();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

/* ------------------------------------------------------------------ */
/* 시즌 진행과 관찰                                                     */
/* ------------------------------------------------------------------ */

function snapshot(state: GameState, year: number): Map<HorseId, Snap> {
  const m = new Map<HorseId, Snap>();
  for (const h of racingHorses(state)) {
    m.set(h.id, {
      id: h.id,
      age: ageInYear(h.birthYear, year),
      birthYear: h.birthYear,
      country: h.countryOfBirth,
      status: h.status,
      or: h.officialRating,
      ability: meanAbility(h.ability),
    });
  }
  return m;
}

function onDecl(col: Col, state: GameState, input: readonly Meeting[], out: Meeting[]): void {
  const date = input[0]?.date;
  if (date === undefined) return;
  const pool = racingHorses(state);
  const inDecl = new Set<HorseId>();
  for (const m of input) for (const sr of m.races) for (const d of sr.declarations) inDecl.add(d.horseId);
  const ready = pool.filter(
    (h) =>
      h.status === 'in_training' &&
      h.ownerId !== null &&
      h.condition.injury === null &&
      h.condition.fitness >= MIN_FITNESS_TO_RUN &&
      h.condition.fatigue <= MAX_FATIGUE_TO_RUN,
  ).length;

  interface Slot {
    mi: number;
    ri: number;
    key: readonly [number, number];
  }
  const slots: Slot[] = [];
  input.forEach((m, mi) => {
    m.races.forEach((sr, ri) => {
      if (sr.status === 'open') slots.push({ mi, ri, key: priorityKey(sr.race) });
    });
  });
  slots.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.mi - b.mi || a.ri - b.ri);

  let groupOpen = 0;
  let g1Open = 0;
  let generatedOpen = 0;
  for (const m of input) {
    for (const sr of m.races) {
      if (sr.status !== 'open') continue;
      if (sr.race.kind === 'group' || sr.race.kind === 'listed') groupOpen++;
      if (sr.race.grade === 'G1') g1Open++;
      if (sr.templateId === null) generatedOpen++;
    }
  }

  const used = new Set<HorseId>(inDecl);
  for (const s of slots) {
    const sr = input[s.mi]?.races[s.ri];
    const outSr = out[s.mi]?.races[s.ri];
    if (sr === undefined || outSr === undefined) continue;
    const raceCountry = raceCountryOf(courseCountryOf, sr.race.racecourseId);
    const c = countCandidates(state, sr.race, date, raceCountry, used, pool);
    const fk = funnelKey(sr.race);
    const acc = col.funnel.get(fk) ?? { n: 0, sums: FUNNEL_STEPS.map(() => 0) };
    acc.n++;
    for (const h of pool) {
      const k = passedSteps(h, state, sr.race, date, raceCountry, used);
      for (let i = 0; i < k; i++) acc.sums[i] = (acc.sums[i] ?? 0) + 1;
    }
    col.funnel.set(fk, acc);
    const range = fieldRange(sr.race);
    const needExp = Math.max(0, Math.min((range.min + range.max) / 2, sr.race.maxRunners) - sr.declarations.length);
    const closed = outSr.status === 'closed';
    const aiPicks = closed ? outSr.declarations.filter((d) => !inDecl.has(d.horseId)) : [];
    for (const p of aiPicks) used.add(p.horseId);
    col.decls.push({
      year: date.year,
      week: date.week,
      raceId: sr.race.id,
      templateId: sr.templateId,
      cls: classOf(sr.race),
      kind: sr.race.kind,
      grade: sr.race.grade,
      country: raceCountry,
      maxRunners: sr.race.maxRunners,
      strict: c.strict,
      travel: c.travel,
      needExp,
      status: outSr.status,
      field: closed ? outSr.declarations.length : 0,
      hclass: sr.race.kind === 'handicap' ? sr.race.raceClass : null,
    });
  }

  col.weeks.push({
    year: date.year,
    week: date.week,
    meetings: input.length,
    open: slots.length,
    generatedOpen,
    ready,
    groupOpen,
    g1Open,
    pool100: pool.filter(
      (h) => ageInYear(h.birthYear, date.year) >= 3 && h.officialRating !== null && h.officialRating >= GROUP_OR_FLOOR.G1,
    ).length,
  });
}

function preRun(col: Col, state: GameState, meeting: Meeting): void {
  col.preHorses = new Map<HorseId, Horse>();
  for (const sr of meeting.races) {
    if (sr.status !== 'closed') continue;
    for (const d of sr.declarations) {
      const h = state.horses[d.horseId];
      if (h !== undefined && !col.preHorses.has(d.horseId)) col.preHorses.set(d.horseId, structuredClone(h));
    }
  }
}

function onRun(col: Col, state: GameState, meeting: Meeting, out: RunMeetingInPlaceOutput): void {
  const year = out.meeting.date.year;
  const byRaceId = new Map<string, RaceResult>(out.results.map((r) => [r.raceId, r] as const));
  meeting.races.forEach((sr, ri) => {
    if (sr.status !== 'closed') return;
    const result = byRaceId.get(sr.race.id);
    const course = COURSE_BY_ID.get(sr.race.racecourseId);
    if (result === undefined || course === undefined) return;
    const cls = classOf(sr.race);
    const simulated = out.meeting.races[ri]?.simulated ?? false;

    let yearStarts = col.starts.get(year);
    if (yearStarts === undefined) {
      yearStarts = new Map<HorseId, number>();
      col.starts.set(year, yearStarts);
    }
    for (const r of result.runners) yearStarts.set(r.horseId, (yearStarts.get(r.horseId) ?? 0) + 1);

    // 레이팅 재계산(엔진 함수와 같은 입력: 레이스 전 OR·나이)
    const ratings = new Map<HorseId, number | null>();
    const ages = new Map<HorseId, number>();
    for (const r of result.runners) {
      const h0 = col.preHorses.get(r.horseId);
      if (h0 === undefined) continue;
      ratings.set(r.horseId, h0.officialRating);
      ages.set(r.horseId, ageInYear(h0.birthYear, year));
    }
    const prs = performanceRatings(sr.race, result, ratings, ages);
    for (const r of result.runners) {
      const h0 = col.preHorses.get(r.horseId);
      if (h0 === undefined) continue;
      const or0 = h0.officialRating;
      const or1 = state.horses[r.horseId]?.officialRating ?? null;
      const pr = prs.get(r.horseId) ?? null;
      let mismatch = false;
      if (or0 !== null && pr !== null) {
        mismatch = nextRating(or0, pr, r.position, r.beatenLengths, sr.race) !== or1;
      }
      col.runners.push({
        year,
        raceId: sr.race.id,
        age: ageInYear(h0.birthYear, year),
        cls,
        simulated,
        handicap: sr.race.kind === 'handicap',
        position: r.position,
        beaten: r.beatenLengths,
        or0,
        or1,
        pr,
        mismatch,
      });
    }

    // 능력 강도 재계산(summary.ts·runRace.ts 와 같은 식). 입력은 관찰 시점 사본
    const path = buildRacePath(course, sr.race.distance, sr.race.layoutId);
    const ctx: RaceContext = {
      distance: sr.race.distance,
      going: result.going,
      surface: path.surface,
      handedness: path.handedness,
      undulation: course.undulation,
      trackWidth: path.width,
    };
    const ordered: { id: HorseId; position: number; odds: RaceResult['runners'][number]['odds']; saddle: number }[] = [];
    const strengths: number[] = [];
    const abilities: number[] = [];
    for (const r of result.runners) {
      const h0 = col.preHorses.get(r.horseId);
      const jockey = state.jockeys[r.jockeyId];
      if (h0 === undefined || jockey === undefined) continue;
      const input: RunnerInput = {
        entry: { weightLb: r.weightLb } as RaceEntry,
        horse: h0,
        jockey: { id: jockey.id, name: jockey.name, skill: jockey.skill },
      };
      strengths.push(estimateStrength(input, ctx));
      abilities.push(meanAbility(h0.ability));
      ordered.push({ id: r.horseId, position: r.position, odds: r.odds, saddle: r.saddleCloth });
    }
    if (strengths.length < 2) return;
    const rel = relativeStrengths(strengths);
    const sdR = stdev(rel);
    let topIdx = 0;
    rel.forEach((v, i) => {
      if (v > (rel[topIdx] ?? -Infinity)) topIdx = i;
    });
    const winIdx: number[] = [];
    ordered.forEach((o, i) => {
      if (o.position === 1) winIdx.push(i);
    });

    // 인기 1위: 소수 오즈 오름차순, 동률은 마번 작은 말 (favouriteWon 과 같은 규칙)
    const priced: { i: number; dec: number; saddle: number; position: number; odds: FractionalOdds }[] = [];
    ordered.forEach((o, i) => {
      if (o.odds !== null) {
        priced.push({ i, dec: oddsToDecimal(o.odds), saddle: o.saddle, position: o.position, odds: o.odds });
      }
    });
    priced.sort((a, b) => a.dec - b.dec || a.saddle - b.saddle);
    const fav = priced[0];
    const hasAllOdds = priced.length === ordered.length;
    col.runs.push({
      year,
      raceId: sr.race.id,
      templateId: sr.templateId,
      cls,
      simulated,
      field: ordered.length,
      favWon: hasAllOdds && fav !== undefined ? fav.position === 1 : null,
      favDec: hasAllOdds && fav !== undefined ? fav.dec : null,
      favImplied: hasAllOdds && fav !== undefined ? impliedProbability(fav.odds) : null,
      oddsFavIsTop: fav !== undefined && fav.i === topIdx,
      topWon: winIdx.includes(topIdx),
      sdR,
      abSd: stdev(abilities),
      rel,
      winIdx,
    });

    // 출주 기록과 시리즈 레그 우승
    if (sr.templateId !== null) {
      const winnerId = ordered[winIdx[0] ?? -1]?.id;
      if (winnerId !== undefined) {
        for (const def of SERIES_DEFS) {
          if (!def.legs.includes(sr.templateId)) continue;
          let byYear = col.legWins.get(def.id);
          if (byYear === undefined) {
            byYear = new Map();
            col.legWins.set(def.id, byYear);
          }
          let byHorse = byYear.get(year);
          if (byHorse === undefined) {
            byHorse = new Map();
            byYear.set(year, byHorse);
          }
          const legs = byHorse.get(winnerId) ?? new Set<string>();
          legs.add(sr.templateId);
          byHorse.set(winnerId, legs);
        }
      }
    }
  });
}

function collectEvent(col: Col, ev: GameEvent, state: GameState): void {
  if (ev.type === 'horse_status_changed' && ev.to === 'retired') {
    const h = state.horses[ev.horseId];
    if (h === undefined) return;
    col.retired.push({
      year: ev.date.year,
      horseId: ev.horseId,
      age: ageInYear(h.birthYear, ev.date.year),
      country: h.countryOfBirth,
    });
  }
  if (ev.type === 'series_completed') {
    col.seriesDone.push({ seriesId: ev.seriesId, year: ev.date.year });
  }
}

function runSeasons(col: Col): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let state = bootstrapGame({ seed: SEED, playerName: 'Probe Owner', silks: { ...SILKS } }, BOOT_DATA);

  tap.decl = {
    before: () => undefined,
    after: (st, input, out) => onDecl(col, st, input, out),
  };
  tap.run = {
    before: (st, m) => preRun(col, st, m),
    after: (st, m, out) => onRun(col, st, m, out),
  };
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const processed = { year: state.date.year, week: state.date.week };
    const res = advanceWeek(state, systems);
    state = res.state;
    for (const ev of res.events) collectEvent(col, ev, state);
    if (processed.week === 1) col.start.set(processed.year, snapshot(state, processed.year));
    if (processed.week === WEEKS_PER_YEAR) col.end.set(processed.year, snapshot(state, processed.year));
  }
  tap.decl = null;
  tap.run = null;
  return state;
}

/* ------------------------------------------------------------------ */
/* 보고 1: 취소·출주 공급·말별 출주 횟수                                 */
/* ------------------------------------------------------------------ */

function reportSupply(col: Col): void {
  say('');
  say('## 1. 취소와 출주 공급');
  const d = col.decls;
  const ab = d.filter((x) => x.status === 'abandoned').length;
  say(`- 개최 예정(open 으로 선언 단계에 든 레이스) ${d.length}, 취소 ${ab}, 취소율 ${pct(share(ab, d.length))}`);
  say('');
  say('| 종류 | 예정 수 | 취소 수 | 취소율 | 후보 평균(나라 통과) | 원정 후보 평균 | 기대 필요 두수 평균 | 후보 2두 미만 비율 |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const cls of CLASS_ORDER) {
    const rs = d.filter((x) => x.cls === cls);
    if (rs.length === 0) continue;
    const a = rs.filter((x) => x.status === 'abandoned').length;
    const expCand = (x: DeclRec): number => x.strict + TRAVEL_CHANCE_GROUP * x.travel;
    say(
      `| ${cls} | ${rs.length} | ${a} | ${pct(share(a, rs.length))} | ${fx(mean(rs.map((x) => x.strict)))} | ${fx(mean(rs.map((x) => x.travel)))} | ${fx(mean(rs.map((x) => x.needExp)))} | ${pct(share(rs.filter((x) => expCand(x) < MIN_FIELD_SIZE).length, rs.length))} |`,
    );
  }
  const bins: [string, (n: number) => boolean][] = [
    ['0두', (n) => n === 0],
    ['1두', (n) => n === 1],
    ['2~4두', (n) => n >= 2 && n <= 4],
    ['5~7두', (n) => n >= 5 && n <= 7],
    ['8~11두', (n) => n >= 8 && n <= 11],
    ['12두 이상', (n) => n >= 12],
  ];
  say('');
  say('후보 수(나라 통과 기준)별 취소율:');
  say('');
  say('| 후보 수 | 레이스 | 취소율 |');
  say('| --- | --- | --- |');
  for (const [label, pred] of bins) {
    const rs = d.filter((x) => pred(x.strict));
    say(`| ${label} | ${rs.length} | ${pct(share(rs.filter((x) => x.status === 'abandoned').length, rs.length))} |`);
  }

  const wk = col.weeks;
  say('');
  say(
    `- 주당 평균: 개최 ${fx(mean(wk.map((w) => w.meetings)))}, 선언 대상 레이스 ${fx(mean(wk.map((w) => w.open)))}, 자동 생성 레이스 ${fx(mean(wk.map((w) => w.generatedOpen)))}, 출주 가능 말(in_training·부상 없음·준비도≥${MIN_FITNESS_TO_RUN}·피로≤${MAX_FATIGUE_TO_RUN}) ${fx(mean(wk.map((w) => w.ready)), 0)}두`,
  );
  say(`- 주당 필요 두수 기대치 합 ${fx(mean(wk.map((w) => d.filter((x) => x.year === w.year && x.week === w.week).reduce((a, x) => a + x.needExp, 0))), 0)}`);
  for (const y of [...new Set(d.map((x) => x.year))].sort()) {
    const gen = new Set(d.filter((x) => x.year === y && x.templateId === null).map((x) => x.raceId));
    const fixed = d.filter((x) => x.year === y && x.templateId !== null).length;
    say(`- ${y}년: 자동 생성 레이스(선언 단계 도달) ${gen.size}개, 고정 일정 레이스 ${fixed}개`);
  }

  // 말별 출주 횟수
  say('');
  say('### 1-2. 말별 시즌 출주 횟수 (연말 현역 기준)');
  for (const y of [...col.end.keys()].sort()) {
    const snap = col.end.get(y);
    const st = col.starts.get(y) ?? new Map<HorseId, number>();
    if (snap === undefined) continue;
    const horses = [...snap.values()];
    const counts = horses.map((h) => st.get(h.id) ?? 0);
    const hist = [0, 1, 2, 3, 4, 5].map((k) => counts.filter((c) => c === k).length);
    const eight = counts.filter((c) => c >= 6).length;
    say(
      `- ${y}년 연말 현역 ${horses.length}두: 0회 ${pct(share(hist[0] ?? 0, horses.length))}, 1회 ${pct(share(hist[1] ?? 0, horses.length))}, 2회 ${pct(share(hist[2] ?? 0, horses.length))}, 3회 ${pct(share(hist[3] ?? 0, horses.length))}, 4회 ${pct(share(hist[4] ?? 0, horses.length))}, 5회 ${pct(share(hist[5] ?? 0, horses.length))}, 6회 이상 ${pct(share(eight, horses.length))}, 평균 ${fx(mean(counts))}`,
    );
    const bands: [string, (or: number | null) => boolean][] = [
      ['OR 없음(2세 등)', (or) => or === null],
      ['≤60', (or) => or !== null && or <= 60],
      ['61~80', (or) => or !== null && or >= 61 && or <= 80],
      ['81~100', (or) => or !== null && or >= 81 && or <= 100],
      ['101~110', (or) => or !== null && or >= 101 && or <= 110],
      ['111+', (or) => or !== null && or >= 111],
    ];
    for (const [label, pred] of bands) {
      const hs = horses.filter((h) => pred(h.or));
      const cs = hs.map((h) => st.get(h.id) ?? 0);
      say(`  - OR 대역 ${label}: ${hs.length}두, 평균 출주 ${fx(mean(cs))}회, 0회 비율 ${pct(share(cs.filter((c) => c === 0).length, hs.length))}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 보고 2: 그룹 레이스 두수                                            */
/* ------------------------------------------------------------------ */

function reportGroup(col: Col): void {
  say('');
  say('## 2. 그룹 레이스 두수');
  const d = col.decls;
  say('| 종류·연도 | 예정 | 취소율 | 후보 평균(나라 통과) | 원정 후보 평균 | 기대 필요 두수 | 출주 두수 평균(개최만) | 8두 미만 비율(개최만) |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const cls of ['G1', 'G2', 'G3', 'L'] as const) {
    for (const y of [...new Set(d.map((x) => x.year))].sort()) {
      const rs = d.filter((x) => x.cls === cls && x.year === y);
      if (rs.length === 0) continue;
      const run = rs.filter((x) => x.status === 'closed');
      say(
        `| ${cls} ${y} | ${rs.length} | ${pct(share(rs.length - run.length, rs.length))} | ${fx(mean(rs.map((x) => x.strict)))} | ${fx(mean(rs.map((x) => x.travel)))} | ${fx(mean(rs.map((x) => x.needExp)))} | ${fx(mean(run.map((x) => x.field)))} | ${pct(share(run.filter((x) => x.field < 8).length, run.length))} |`,
      );
    }
  }
  const g1 = d.filter((x) => x.cls === 'G1');
  const countries = [...new Set(g1.map((x) => x.country ?? 'unknown'))].sort();
  say('');
  say('G1 나라별 (개최 레이스 기준 출주 두수, 후보 평균):');
  say('');
  say('| 나라 | 예정 | 후보 평균 | 출주 두수 평균 |');
  say('| --- | --- | --- | --- |');
  for (const c of countries) {
    const rs = g1.filter((x) => (x.country ?? 'unknown') === c);
    say(`| ${c} | ${rs.length} | ${fx(mean(rs.map((x) => x.strict)))} | ${fx(mean(rs.filter((x) => x.status === 'closed').map((x) => x.field)))} |`);
  }

  say('');
  say('연말 현역 중 G1 자격 풀(OR ≥ 100 & 3세 이상, 나라별) 과 2세 두수:');
  say('');
  say('| 연도 | 나라 | OR≥100 & 3세+ | 2세(잠재 기준) |');
  say('| --- | --- | --- | --- |');
  for (const [y, snap] of [...col.end.entries()].sort((a, b) => a[0] - b[0])) {
    for (const c of ['GB', 'IE', 'FR', 'DE', 'IT']) {
      const hs = [...snap.values()].filter((h) => h.country === c);
      const strong = hs.filter((h) => h.age >= 3 && h.or !== null && h.or >= GROUP_OR_FLOOR.G1).length;
      const two = hs.filter((h) => h.age <= JUVENILE_AGE).length;
      say(`| ${y} | ${c} | ${strong} | ${two} |`);
    }
  }

  const wk = col.weeks;
  say('');
  say(
    `- 주당 그룹(G1·G2·G3·L) 개최 예정 수: 평균 ${fx(mean(wk.map((w) => w.groupOpen)))}, 최대 ${Math.max(...wk.map((w) => w.groupOpen))}, 2개 이상인 주 ${pct(share(wk.filter((w) => w.groupOpen >= 2).length, wk.length))}`,
  );
  say(`- 주당 G1 개최 예정 수: 평균 ${fx(mean(wk.map((w) => w.g1Open)))}, 최대 ${Math.max(...wk.map((w) => w.g1Open))}`);
}

/* ------------------------------------------------------------------ */
/* 보고 3: 인기 1위 승률과 능력 노이즈                                 */
/* ------------------------------------------------------------------ */

function bucketOfField(n: number): string {
  if (n <= 4) return '2~4두';
  if (n <= 7) return '5~7두';
  if (n <= 11) return '8~11두';
  return '12두 이상';
}

/** 몬테카를로: 시장 인식(rel + market 잡음 → argmax 가 인기)과 결과(T_i = (1 − rel/100)(1 + σ z)) 로 확률 예측 */
function predictRates(
  races: readonly RunRec[],
  sigma: number,
  marketSd: number,
  seed: number,
): { fav: number; top: number } {
  const u = mulberry32(seed);
  const g = gaussFrom(u);
  let favHit = 0;
  let topHit = 0;
  let total = 0;
  for (const r of races) {
    const n = r.rel.length;
    if (n < 2) continue;
    let topIdx = 0;
    r.rel.forEach((v, i) => {
      if (v > (r.rel[topIdx] ?? -Infinity)) topIdx = i;
    });
    for (let k = 0; k < MC_K; k++) {
      let favIdx = 0;
      let favVal = -Infinity;
      for (let i = 0; i < n; i++) {
        const p = (r.rel[i] ?? 0) + marketSd * g();
        if (p > favVal) {
          favVal = p;
          favIdx = i;
        }
      }
      let winIdx = 0;
      let winVal = Infinity;
      for (let i = 0; i < n; i++) {
        const f = (1 - (r.rel[i] ?? 0) / 100) * (1 + sigma * g());
        if (f < winVal) {
          winVal = f;
          winIdx = i;
        }
      }
      if (winIdx === favIdx) favHit++;
      if (winIdx === topIdx) topHit++;
      total++;
    }
  }
  return { fav: total === 0 ? NaN : favHit / total, top: total === 0 ? NaN : topHit / total };
}

function reportFavourite(col: Col): void {
  say('');
  say('## 3. 인기 1위 승률과 능력 노이즈');
  const runs = col.runs;
  const priced = runs.filter((r) => r.favWon !== null);
  const favAll = share(priced.filter((r) => r.favWon === true).length, priced.length);
  say(`- 전체 집계 ${priced.length}, 인기 1위 승률 ${pct(favAll)}, 인기 1위 평균 소수 오즈 ${fx(mean(priced.map((r) => r.favDec ?? NaN)))}, 평균 내재 확률 ${pct(mean(priced.map((r) => r.favImplied ?? NaN)))}`);
  say('');
  say('| 종류 | 두수 | 레이스 | 인기 1위 승률 | 인기 평균 소수 오즈 | 인기 평균 내재 확률 |');
  say('| --- | --- | --- | --- | --- | --- |');
  for (const cls of CLASS_ORDER) {
    const rs = priced.filter((r) => r.cls === cls);
    if (rs.length === 0) continue;
    const w = rs.filter((r) => r.favWon === true).length;
    say(`| ${cls} | 전체 | ${rs.length} | ${pct(share(w, rs.length))} | ${fx(mean(rs.map((r) => r.favDec ?? NaN)))} | ${pct(mean(rs.map((r) => r.favImplied ?? NaN)))} |`);
  }
  say('');
  say('| 두수 구간 | 레이스 | 인기 1위 승률 | 인기 평균 소수 오즈 | 인기 평균 내재 확률 |');
  say('| --- | --- | --- | --- | --- |');
  for (const b of ['2~4두', '5~7두', '8~11두', '12두 이상']) {
    const rs = priced.filter((r) => bucketOfField(r.field) === b);
    const w = rs.filter((r) => r.favWon === true).length;
    say(`| ${b} | ${rs.length} | ${pct(share(w, rs.length))} | ${fx(mean(rs.map((r) => r.favDec ?? NaN)))} | ${pct(mean(rs.map((r) => r.favImplied ?? NaN)))} |`);
  }

  const sum = runs.filter((r) => !r.simulated);
  const sim = runs.filter((r) => r.simulated);
  say('');
  say('경로별(요약 모드 = 결과만 추첨 / 시뮬레이션 = G1·G2·G3·L):');
  say('');
  say('| 경로 | 레이스 | 인기 1위 승률 | 능력 1위(노이즈 없음) 승률 | 인기=능력 1위 일치율 | 능력 차 SD 중앙값(%) |');
  say('| --- | --- | --- | --- | --- | --- |');
  for (const [label, rs] of [
    ['요약', sum],
    ['시뮬레이션', sim],
  ] as const) {
    const p = rs.filter((r) => r.favWon !== null);
    say(
      `| ${label} | ${rs.length} | ${pct(share(p.filter((r) => r.favWon === true).length, p.length))} | ${pct(share(rs.filter((r) => r.topWon).length, rs.length))} | ${pct(share(rs.filter((r) => r.oddsFavIsTop).length, rs.length))} | ${fx(median(rs.map((r) => r.sdR)))} |`,
    );
  }
  const sdMed = median(runs.map((r) => r.sdR));
  say('');
  say(
    `- 능력 차(레이스 안 강도 SD 중앙값) ${fx(sdMed)} 단위(% 시간). 시장 잡음 MARKET_NOISE_SD=${MARKET_NOISE_SD}, 결과 잡음 SUMMARY_NOISE_SD×100=${fx(SUMMARY_NOISE_SD * 100)}`,
  );
  say(`- 비율: 능력 차 SD ÷ 시장 잡음 = ${fx(sdMed / MARKET_NOISE_SD, 2)}, 능력 차 SD ÷ 결과 잡음 = ${fx(sdMed / (SUMMARY_NOISE_SD * 100), 2)}`);
  say(`- 시장 온도 MARKET_TEMPERATURE=${MARKET_TEMPERATURE}, 오버라운드 등 나머지 상수는 raceday.ts 참조`);
  const abMed = median(runs.map((r) => r.abSd));
  const pop26 = col.end.get(START_YEAR);
  const popAb = pop26 === undefined ? [] : [...pop26.values()].filter((h) => h.age >= 3).map((h) => h.ability);
  say(
    `- 레이스 안 능력(meanAbility 원점수) SD 중앙값 ${fx(abMed, 2)} (요약 ${fx(median(sum.map((r) => r.abSd)), 2)}, 시뮬레이션 ${fx(median(sim.map((r) => r.abSd)), 2)}). 2026 연말 3세 이상 전체 능력 SD ${fx(stdev(popAb), 2)}. 참고 상수: M1 샘플 SAMPLE_ABILITY_SD=1.5(raceday.ts:18), 인구 POPULATION_ABILITY_SPREAD=9(population.ts:62)`,
  );

  // 몬테카를로 예측 (요약 경로)
  const cap = sum.length <= MC_CAP ? sum : sum.filter((_, i) => i % Math.ceil(sum.length / MC_CAP) === 0);
  const obsFav = share(cap.filter((r) => r.favWon === true).length, cap.filter((r) => r.favWon !== null).length);
  const obsTop = share(cap.filter((r) => r.topWon).length, cap.length);
  say('');
  say(`몬테카를로 예측(요약 경로 표본 ${cap.length}레이스, 레이스당 ${MC_K}회). 현재 상수: 결과 잡음 ${SUMMARY_NOISE_SD}, 시장 잡음 ${MARKET_NOISE_SD}`);
  const cur = predictRates(cap, SUMMARY_NOISE_SD, MARKET_NOISE_SD, 7);
  say(`- 관측: 인기 1위 승률 ${pct(obsFav)}, 능력 1위 승률 ${pct(obsTop)}`);
  say(`- 예측(현재 상수): 인기 1위 승률 ${pct(cur.fav)}, 능력 1위 승률 ${pct(cur.top)}`);
  say('');
  say('| 결과 잡음 σ \\ 시장 잡음 | ' + MARKET_GRID.map((m) => `시장 ${m}`).join(' | ') + ' |');
  say('| --- | ' + MARKET_GRID.map(() => '---').join(' | ') + ' |');
  for (const s of SIGMA_GRID) {
    const cells = MARKET_GRID.map((m) => pct(predictRates(cap, s, m, 11).fav));
    say(`| σ ${s} | ${cells.join(' | ')} |`);
  }
  say('');
  say('같은 격자의 능력 1위 승률 예측:');
  say('');
  say('| 결과 잡음 σ \\ 시장 잡음 | ' + MARKET_GRID.map((m) => `시장 ${m}`).join(' | ') + ' |');
  say('| --- | ' + MARKET_GRID.map(() => '---').join(' | ') + ' |');
  for (const s of SIGMA_GRID) {
    const cells = MARKET_GRID.map((m) => pct(predictRates(cap, s, m, 13).top));
    say(`| σ ${s} | ${cells.join(' | ')} |`);
  }
}

/* ------------------------------------------------------------------ */
/* 보고 4: OR 드리프트                                                 */
/* ------------------------------------------------------------------ */

function reportOr(col: Col): void {
  say('');
  say('## 4. OR 변화 (4세 이상 평균 하락)');
  const rr = col.runners;
  const withOr = rr.filter((r) => r.or0 !== null && r.or1 !== null && r.pr !== null);
  const mismatches = rr.filter((r) => r.mismatch).length;
  say(`- 출주 기록 ${rr.length}, OR 보유 출주 ${withOr.length}, nextRating 재계산 불일치 ${mismatches} (0 이어야 정상)`);
  say('');
  say('### 4-1. 레이스당 OR 변화 (연령별, 레이스 전 OR 기준)');
  say('');
  say('| 나이 | 출주 | 평균 ΔOR | 평균 (PR − 레이스 전 OR) | ΔOR>0 비율 | ΔOR<0 비율 | ΔOR=0 비율 |');
  say('| --- | --- | --- | --- | --- | --- | --- |');
  for (const b of [2, 3, 4, 5, 6, 7, 8]) {
    const rs = withOr.filter((r) => ageBucket(r.age) === b);
    const dl = rs.map((r) => (r.or1 ?? 0) - (r.or0 ?? 0));
    const dd = rs.map((r) => (r.pr ?? 0) - (r.or0 ?? 0));
    say(
      `| ${ageLabel(b)} | ${rs.length} | ${fx(mean(dl))} | ${fx(mean(dd))} | ${pct(share(dl.filter((x) => x > 0).length, rs.length))} | ${pct(share(dl.filter((x) => x < 0).length, rs.length))} | ${pct(share(dl.filter((x) => x === 0).length, rs.length))} |`,
    );
  }
  const winners = withOr.filter((r) => r.position === 1);
  const others = withOr.filter((r) => r.position > 1);
  say('');
  say(`- 1착 출주: ${winners.length}, 평균 (PR − OR) ${fx(mean(winners.map((r) => (r.pr ?? 0) - (r.or0 ?? 0))))}, 평균 ΔOR ${fx(mean(winners.map((r) => (r.or1 ?? 0) - (r.or0 ?? 0))))}`);
  say(`- 비(1)착 출주: ${others.length}, 평균 (PR − OR) ${fx(mean(others.map((r) => (r.pr ?? 0) - (r.or0 ?? 0))))}, 평균 ΔOR ${fx(mean(others.map((r) => (r.or1 ?? 0) - (r.or0 ?? 0))))}`);

  say('');
  say('### 4-2. 같은 해 연초(처리 주 1 직후) → 연말(처리 주 52 직후) 개별 OR 변화');
  say('');
  say('| 연도 | 나이(연말) | 두수 | 평균 ΔOR | 평균 Δ능력(능력 5종 평균) |');
  say('| --- | --- | --- | --- | --- |');
  for (const y of [...col.start.keys()].sort()) {
    const s0 = col.start.get(y);
    const s1 = col.end.get(y);
    if (s0 === undefined || s1 === undefined) continue;
    for (const b of [2, 3, 4, 5, 6, 7, 8]) {
      const pairs: { d: number; da: number }[] = [];
      for (const [id, e] of s1) {
        const s = s0.get(id);
        if (s === undefined || s.or === null || e.or === null || ageBucket(e.age) !== b) continue;
        pairs.push({ d: e.or - s.or, da: e.ability - s.ability });
      }
      if (pairs.length === 0) continue;
      say(`| ${y} | ${ageLabel(b)} | ${pairs.length} | ${fx(mean(pairs.map((p) => p.d)))} | ${fx(mean(pairs.map((p) => p.da)))} |`);
    }
  }

  say('');
  say('### 4-3. 4세 이상 평균 OR 의 연도 간 분해 (연말 → 다음 연말)');
  say('');
  say('분해 식: 평균_B − 평균_A = (i) 개별 변화(잔류 S 의 Δ) + (ii) 생존 선택(S 의 전년 평균 − A 평균) + (iii) 신규 편입(B 평균 − S 의 금년 평균)');
  say('');
  const years = [...col.end.keys()].sort();
  for (let i = 1; i < years.length; i++) {
    const y0 = years[i - 1] ?? 0;
    const y1 = years[i] ?? 0;
    const A = col.end.get(y0);
    const B = col.end.get(y1);
    if (A === undefined || B === undefined) continue;
    const aList = [...A.values()].filter((h) => h.age >= 4 && h.or !== null);
    const bList = [...B.values()].filter((h) => h.age >= 4 && h.or !== null);
    // 잔류 S: A 의 4세+ OR 보유 말 중 y1 에도 4세+ OR 보유로 현역인 말
    const sA: Snap[] = [];
    const sB: Snap[] = [];
    for (const h of aList) {
      const b = B.get(h.id);
      if (b === undefined || b.or === null || b.age < 4) continue;
      sA.push(h);
      sB.push(b);
    }
    const meanA = mean(aList.map((h) => h.or ?? NaN));
    const meanB = mean(bList.map((h) => h.or ?? NaN));
    const meanSA = mean(sA.map((h) => h.or ?? NaN));
    const meanSB = mean(sB.map((h) => h.or ?? NaN));
    say(
      `- ${y0}→${y1}: A(${y0} 4세+) ${aList.length}두 평균 ${fx(meanA)}, B(${y1} 4세+) ${bList.length}두 평균 ${fx(meanB)}, 차이 ${fx(meanB - meanA)} | 잔류 S ${sA.length}두 | (i) 개별 ${fx(meanSB - meanSA)} | (ii) 생존 선택 ${fx(meanSA - meanA)} | (iii) 신규 편입 ${fx(meanB - meanSB)}`,
    );
  }

  say('');
  say('### 4-4. 능력 곡선과 OR (연말 스냅샷, 나이별)');
  say('');
  say('| 연도 | 나이 | 두수 | 평균 능력 5종 | 평균 OR | 능력 환산 OR(ratingFromAbility) | 평균(OR − 환산) |');
  say('| --- | --- | --- | --- | --- | --- | --- |');
  for (const y of years) {
    const snap = col.end.get(y);
    if (snap === undefined) continue;
    for (const b of [2, 3, 4, 5, 6, 7, 8]) {
      const hs = [...snap.values()].filter((h) => ageBucket(h.age) === b);
      const rated = hs.filter((h) => h.or !== null);
      say(
        `| ${y} | ${ageLabel(b)} | ${hs.length} | ${fx(mean(hs.map((h) => h.ability)), 1)} | ${fx(mean(rated.map((h) => h.or ?? NaN)), 1)} | ${fx(mean(rated.map((h) => ratingFromAbility(h.ability))), 1)} | ${fx(mean(rated.map((h) => (h.or ?? NaN) - ratingFromAbility(h.ability))), 1)} |`,
      );
    }
  }
  for (const y of years) {
    const snap = col.end.get(y);
    if (snap === undefined) continue;
    const four = [...snap.values()].filter((h) => h.age >= 4 && h.or !== null);
    const best = Math.max(...[...snap.values()].map((h) => h.or ?? 0));
    say(`- ${y} 연말 4세 이상 평균 OR ${fx(mean(four.map((h) => h.or ?? NaN)))}, 최고 OR ${fx(best, 0)}`);
  }
}

/* ------------------------------------------------------------------ */
/* 보고 5: 은퇴과 연령 구조                                            */
/* ------------------------------------------------------------------ */

function reportRetire(col: Col): void {
  say('');
  say('## 5. 은퇴와 연령 구조');
  say(`- 은퇴 규칙(population.ts): 연초 처리에서 나이 ≥ POPULATION_RETIRE_AGE(${POPULATION_RETIRE_AGE}) 전원 은퇴, 나이 ≥ POPULATION_CUT_MIN_AGE(${POPULATION_CUT_MIN_AGE}) 를 나라별로 선발값 하위 POPULATION_CUT_SHARE(${POPULATION_CUT_SHARE}) 은퇴`);
  const years = [...col.end.keys()].sort();
  say('');
  say('| 전환 연도(연초 처리) | 은퇴 합계 | 강제(8세) | 하위 컷(4~7세) | 기타 | 신규 2세(birthYear = Y−2, 연초) |');
  say('| --- | --- | --- | --- | --- | --- |');
  const transitions = [...col.start.keys()].sort();
  for (const y of transitions) {
    const rs = col.retired.filter((r) => r.year === y);
    const forced = rs.filter((r) => r.age >= POPULATION_RETIRE_AGE).length;
    const cut = rs.filter((r) => r.age >= POPULATION_CUT_MIN_AGE && r.age < POPULATION_RETIRE_AGE).length;
    const other = rs.length - forced - cut;
    const start = col.start.get(y);
    const entries = start === undefined ? 0 : [...start.values()].filter((h) => h.birthYear === y - 2).length;
    say(`| ${y} | ${rs.length} | ${forced} | ${cut} | ${other} | ${entries} |`);
  }

  say('');
  say('### 5-1. 나이별 컷 비율 (전년 연말 현역 기준, 연초 처리 시점의 나이)');
  say('');
  say('| 연도 | 나이 | 전년 연말 인원 | 은퇴 수 | 은퇴율 |');
  say('| --- | --- | --- | --- | --- |');
  for (const y of transitions) {
    const prev = col.end.get(y - 1);
    if (prev === undefined) continue;
    for (const a of [4, 5, 6, 7, 8]) {
      const pop = [...prev.values()].filter((h) => h.age + 1 === a).length;
      const rs = col.retired.filter((r) => r.year === y && r.age === a).length;
      say(`| ${y} | ${ageLabel(a)} | ${pop} | ${rs} | ${pct(share(rs, pop))} |`);
    }
  }

  say('');
  say('### 5-2. 나라별 신규 투입 vs 은퇴 (같은 해)');
  say('');
  say('| 연도 | 나라 | 은퇴 | 신규 2세 |');
  say('| --- | --- | --- | --- |');
  for (const y of transitions) {
    const start = col.start.get(y);
    for (const c of ['GB', 'IE', 'FR', 'DE', 'IT']) {
      const ret = col.retired.filter((r) => r.year === y && r.country === c).length;
      const ent = start === undefined ? 0 : [...start.values()].filter((h) => h.country === c && h.birthYear === y - 2).length;
      say(`| ${y} | ${c} | ${ret} | ${ent} |`);
    }
  }

  say('');
  say('### 5-3. 연령 분포 (처리 주 52 직후 현역, 그리고 다음 연초)');
  say('');
  say('| 시점 | 2세 | 3세 | 4세 | 5세 | 6세 | 7세 | 8세 이상 | 7세 이상 비율 |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const dist = (label: string, snap: Map<HorseId, Snap> | undefined): void => {
    if (snap === undefined) return;
    const hs = [...snap.values()];
    const c = (a: number): number => hs.filter((h) => (a >= 8 ? h.age >= 8 : h.age === a)).length;
    const old = hs.filter((h) => h.age >= 7).length;
    say(`| ${label} | ${c(2)} | ${c(3)} | ${c(4)} | ${c(5)} | ${c(6)} | ${c(7)} | ${c(8)} | ${pct(share(old, hs.length))} |`);
  };
  for (const y of years) dist(`${y} 연말`, col.end.get(y));
  for (const y of transitions) dist(`${y} 연초 처리 후`, col.start.get(y));
}

/* ------------------------------------------------------------------ */
/* 보고 6: g1_extra 템플릿과 시리즈                                    */
/* ------------------------------------------------------------------ */

function reportTemplates(col: Col): void {
  say('');
  say('## 6. g1_extra 템플릿 개최 현황과 시리즈 레그');
  say('');
  say('| 템플릿 | 주(1~52) | 나라 | 조건 | 선언 단계 도달 | 취소 | 개최 | 후보 평균(나라 통과) | 원정 후보 평균 |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const id of G1_EXTRA_IDS) {
    const t = TEMPLATE_BY_ID.get(id);
    const rs = col.decls.filter((x) => x.templateId === id);
    const runs = col.runs.filter((r) => r.templateId === id).length;
    const week = t === undefined ? '-' : String(weekOfSlot(t.schedule));
    const course = t === undefined ? undefined : COURSE_BY_ID.get(t.racecourseId);
    const cond = t === undefined ? '-' : `${t.conditions.minAge}~${t.conditions.maxAge ?? '∞'}세, ${t.conditions.sex}, ${t.distance}m`;
    say(
      `| ${id} | ${week} | ${course?.country ?? '-'} | ${cond} | ${rs.length} | ${rs.filter((x) => x.status === 'abandoned').length} | ${runs} | ${fx(mean(rs.map((x) => x.strict)))} | ${fx(mean(rs.map((x) => x.travel)))} |`,
    );
  }

  say('');
  say('| 시리즈 | 종류 | 레그 수 | 레그 선언 도달 | 레그 취소 | 레그 개최 | 한 해 최다 레그 우승(한 말) | 2레그 이상 우승마 수(해별 합) | 챔피언 이벤트 |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const def of SERIES_DEFS) {
    const legDecl = col.decls.filter((x) => x.templateId !== null && def.legs.includes(x.templateId));
    const legRuns = col.runs.filter((r) => r.templateId !== null && def.legs.includes(r.templateId)).length;
    const byYear = col.legWins.get(def.id);
    let maxLegs = 0;
    let multi = 0;
    if (byYear !== undefined) {
      for (const byHorse of byYear.values()) {
        for (const legs of byHorse.values()) {
          maxLegs = Math.max(maxLegs, legs.size);
          if (legs.size >= 2) multi++;
        }
      }
    }
    const done = col.seriesDone.filter((s) => s.seriesId === def.id).length;
    say(
      `| ${def.id} | ${def.kind} | ${def.legs.length} | ${legDecl.length} | ${legDecl.filter((x) => x.status === 'abandoned').length} | ${legRuns} | ${maxLegs} | ${multi} | ${done} |`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* 보고 1b: 후보 필터 펀넬과 취소 세부                                  */
/* ------------------------------------------------------------------ */

const FUNNEL_KEY_ORDER: readonly string[] = [
  'G1',
  'G2',
  'G3',
  'L',
  '핸디캡 2',
  '핸디캡 3',
  '핸디캡 4',
  '핸디캡 5',
  '핸디캡 6',
  '핸디캡 7',
  '메이든',
  '노비스',
  '조건',
];

function reportFunnel(col: Col): void {
  say('');
  say('## 1b. 후보 필터 펀넬 (레이스당 단계별로 살아남은 말 수 평균)');
  say('');
  say('단계는 누적이다. 앞 단계에서 떨어진 말은 뒤 단계 수에 들지 않는다. 마지막 행이 나라 조건까지 통과한 엄격 후보 수다.');
  say('');
  const keys = [...col.funnel.keys()].sort((a, b) => FUNNEL_KEY_ORDER.indexOf(a) - FUNNEL_KEY_ORDER.indexOf(b));
  say(`| 단계 | ${keys.join(' | ')} |`);
  say(`| --- | ${keys.map(() => '---').join(' | ')} |`);
  say(`| 레이스 수 | ${keys.map((k) => String(col.funnel.get(k)?.n ?? 0)).join(' | ')} |`);
  FUNNEL_STEPS.forEach((label, i) => {
    const cells = keys.map((k) => {
      const acc = col.funnel.get(k);
      return acc === undefined || acc.n === 0 ? '-' : fx((acc.sums[i] ?? 0) / acc.n, 1);
    });
    say(`| ${i + 1}. ${label} | ${cells.join(' | ')} |`);
  });

  say('');
  say('연도별 취소율:');
  say('');
  const years = [...new Set(col.decls.map((d) => d.year))].sort();
  const cls4: readonly ClassKey[] = ['G1', 'G2', 'G3', 'L', '핸디캡', '메이든', '노비스'];
  say(`| 연도 | ${cls4.join(' | ')} | 전체 |`);
  say(`| --- | ${cls4.map(() => '---').join(' | ')} | --- |`);
  for (const y of years) {
    const cells = cls4.map((c) => {
      const rs = col.decls.filter((d) => d.year === y && d.cls === c);
      return rs.length === 0 ? '-' : pct(share(rs.filter((d) => d.status === 'abandoned').length, rs.length));
    });
    const all = col.decls.filter((d) => d.year === y);
    say(`| ${y} | ${cells.join(' | ')} | ${pct(share(all.filter((d) => d.status === 'abandoned').length, all.length))} |`);
  }

  say('');
  say('핸디캡 클래스별, 자동 생성·고정 일정별 취소:');
  say('');
  say('| 구분 | 예정 | 취소율 | 후보 평균(엄격) | 후보 2두 미만 비율 |');
  say('| --- | --- | --- | --- | --- |');
  const rowOf = (label: string, rs: DeclRec[]): void => {
    if (rs.length === 0) return;
    say(
      `| ${label} | ${rs.length} | ${pct(share(rs.filter((d) => d.status === 'abandoned').length, rs.length))} | ${fx(mean(rs.map((d) => d.strict)))} | ${pct(share(rs.filter((d) => d.strict < MIN_FIELD_SIZE).length, rs.length))} |`,
    );
  };
  for (const hc of [2, 3, 4, 5, 6, 7]) rowOf(`핸디캡 ${hc}`, col.decls.filter((d) => d.hclass === hc));
  rowOf('자동 생성(templateId 없음)', col.decls.filter((d) => d.templateId === null));
  rowOf('고정 일정(템플릿)', col.decls.filter((d) => d.templateId !== null));
}

/* ------------------------------------------------------------------ */
/* 보고 2b: G1 자격 풀과 OR 기준                                       */
/* ------------------------------------------------------------------ */

function reportPool(col: Col): void {
  say('');
  say('### 2-2. 연말 현역 OR 분포와 그룹 OR 하한 (3세 이상, 나라 무관)');
  say('');
  say(`| 연도 | OR≥90 (G3 하한) | OR≥95 (G2 하한) | OR≥${GROUP_OR_FLOOR.G1} (G1 하한) | OR≥105 | 3세 이상 현역 | 3세 이상 평균 OR |`);
  say('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [y, snap] of [...col.end.entries()].sort((a, b) => a[0] - b[0])) {
    const old = [...snap.values()].filter((h) => h.age >= 3 && h.or !== null);
    const cnt = (t: number): number => old.filter((h) => (h.or ?? -Infinity) >= t).length;
    say(
      `| ${y} | ${cnt(90)} | ${cnt(95)} | ${cnt(GROUP_OR_FLOOR.G1)} | ${cnt(105)} | ${[...snap.values()].filter((h) => h.age >= 3).length} | ${fx(mean(old.map((h) => h.or ?? NaN)), 1)} |`,
    );
  }

  say('');
  say('### 2-2b. OR≥100 & 3세+ 말의 출주 종류 분포 (G1 후보가 다른 레이스에 먼저 소진되는지)');
  say('');
  const top = col.runners.filter((r) => r.age >= 3 && r.or0 !== null && r.or0 >= GROUP_OR_FLOOR.G1);
  const topStarts = top.length;
  say(`- 출주 기록(OR 은 레이스 전 값, 3세 이상) ${topStarts}`);
  for (const c of CLASS_ORDER) {
    const n = top.filter((r) => r.cls === c).length;
    say(`  - ${c}: ${n}회 (${pct(share(n, topStarts))})`);
  }

  say('');
  say('### 2-3. G1 후보의 시기별 변화 (분기 = 주 1~13, 14~26, 27~39, 40~52)');
  say('');
  say('| 연도 분기 | G1 예정 | 엄격 후보 평균 | 원정 후보 평균 | 출주 두수 평균(개최) | OR≥100·3세+ 두수 평균(주간) |');
  say('| --- | --- | --- | --- | --- | --- |');
  const years = [...new Set(col.weeks.map((w) => w.year))].sort();
  for (const y of years) {
    for (let q = 1; q <= 4; q++) {
      const inQ = (wk: number): boolean => Math.ceil(wk / 13) === q;
      const g1 = col.decls.filter((d) => d.cls === 'G1' && d.year === y && inQ(d.week));
      const run = g1.filter((d) => d.status === 'closed');
      const pool = col.weeks.filter((w) => w.year === y && inQ(w.week));
      if (g1.length === 0 && pool.length === 0) continue;
      say(
        `| ${y} Q${q} | ${g1.length} | ${fx(mean(g1.map((d) => d.strict)))} | ${fx(mean(g1.map((d) => d.travel)))} | ${fx(mean(run.map((d) => d.field)))} | ${fx(mean(pool.map((w) => w.pool100)), 1)} |`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* 보고 4b: OR 반사실 재계산 (기록된 레이스 결과에 상수를 바꿔 한 번 더 적용) */
/* ------------------------------------------------------------------ */

interface RateCfg {
  upWin: number;
  up: number;
  down: number;
  maxRise: number;
  maxDrop: number;
  hwMin: number;
  noDrop: number;
}

const RATE_BASE: RateCfg = {
  upWin: UP_RATE_WIN,
  up: UP_RATE,
  down: DOWN_RATE,
  maxRise: MAX_RISE,
  maxDrop: MAX_DROP,
  hwMin: HANDICAP_WIN_MIN_RISE,
  noDrop: NO_DROP_BEATEN_L,
};

/** handicapper.ts nextRating 과 같은 식. 상수만 바꿔 쓸 수 있게 인자로 받는다(1차 근사: 피드백 없음) */
function nextCf(c: RateCfg, prev: number, pr: number, pos: number, beaten: number, handicap: boolean): number {
  const clampR = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const d = pr - prev;
  let change = 0;
  if (pos === 1) {
    change = clampR(Math.round(d * c.upWin), 0, c.maxRise);
    if (handicap) change = Math.max(change, c.hwMin);
  } else if (d > 0) {
    change = clampR(Math.round(d * c.up), 0, c.maxRise);
  } else if (d < 0) {
    change = beaten > c.noDrop ? 0 : Math.max(Math.round(d * c.down), -c.maxDrop);
  }
  return clampR(prev + change, RATING_MIN, RATING_MAX);
}

function reportCounterfactual(col: Col): void {
  say('');
  say('### 4-5. OR 반사실 재계산 (기록된 출주 결과, 1차 근사)');
  say('');
  const withOr = col.runners.filter((r) => r.or0 !== null && r.pr !== null && r.or1 !== null);
  // 레이스별 필드 평균 (OR − PR): S4 에서 PR 을 필드 평균 OR 에 맞춘다
  const offsetByRace = new Map<string, number>();
  const groups = new Map<string, number[]>();
  for (const r of withOr) {
    const list = groups.get(r.raceId) ?? [];
    list.push((r.or0 ?? 0) - (r.pr ?? 0));
    groups.set(r.raceId, list);
  }
  for (const [id, list] of groups) offsetByRace.set(id, mean(list));

  const snap26 = col.end.get(START_YEAR);
  const st26 = col.starts.get(START_YEAR) ?? new Map<HorseId, number>();
  const runsPerYear = snap26 === undefined ? NaN : mean([...snap26.values()].map((h) => st26.get(h.id) ?? 0).filter((c) => c > 0));
  say(`- 기준 대상 ${withOr.length} 출주. 연간 출주 수(첫 해 연말 현역 평균, 출주 1회 이상) ${fx(runsPerYear, 1)} → 연간 Δ 추정 = 레이스당 평균 Δ × 연간 출주 수`);
  say('');

  const scenarios: { label: string; cfg: RateCfg; calibrate: boolean }[] = [
    { label: 'S0 현재 상수', cfg: RATE_BASE, calibrate: false },
    { label: 'S1 DOWN_RATE 0.25 → 0.10', cfg: { ...RATE_BASE, down: 0.1 }, calibrate: false },
    { label: 'S2 NO_DROP_BEATEN_L 20 → 10', cfg: { ...RATE_BASE, noDrop: 10 }, calibrate: false },
    { label: 'S3 MAX_DROP 5 → 2', cfg: { ...RATE_BASE, maxDrop: 2 }, calibrate: false },
    { label: 'S4 필드 평균 보정(PR 을 필드 평균 OR 에 맞춤)', cfg: RATE_BASE, calibrate: true },
  ];
  say('| 시나리오 | 전체 레이스당 Δ | 2세 | 3세 | 4세 | 5세 | 6세 | 7세 | 연간 Δ 추정(4세 이상 평균) |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const observed = withOr.map((r) => (r.or1 ?? 0) - (r.or0 ?? 0));
  for (const s of scenarios) {
    const deltas = withOr.map((r) => {
      const adj = s.calibrate ? (r.pr ?? 0) + (offsetByRace.get(r.raceId) ?? 0) : (r.pr ?? 0);
      return { age: r.age, d: nextCf(s.cfg, r.or0 ?? 0, adj, r.position, r.beaten, r.handicap) - (r.or0 ?? 0) };
    });
    const byAge = (a: number): number => mean(deltas.filter((x) => ageBucket(x.age) === a).map((x) => x.d));
    const four = deltas.filter((x) => x.age >= 4).map((x) => x.d);
    say(
      `| ${s.label} | ${fx(mean(deltas.map((x) => x.d)), 2)} | ${fx(byAge(2), 2)} | ${fx(byAge(3), 2)} | ${fx(byAge(4), 2)} | ${fx(byAge(5), 2)} | ${fx(byAge(6), 2)} | ${fx(byAge(7), 2)} | ${fx(mean(four) * runsPerYear, 1)} |`,
    );
  }
  say('');
  say(`- 관측값(실제 ΔOR) 전체 평균 ${fx(mean(observed), 2)}. S0 가 관측과 같아야 한다(재현 검사).`);

  say('');
  say('### 4-6. 패배 마신 구간별 (1착 제외)');
  say('');
  say('| 패배 마신 | 출주 | 평균 (PR − 레이스 전 OR) | 평균 실제 ΔOR | ΔOR<0 비율 |');
  say('| --- | --- | --- | --- | --- |');
  const losers = withOr.filter((r) => r.position > 1);
  const bands: [string, (b: number) => boolean][] = [
    ['0~5', (b) => b <= 5],
    ['5~10', (b) => b > 5 && b <= 10],
    ['10~20', (b) => b > 10 && b <= 20],
    ['20 초과(하락 없음 규칙)', (b) => b > 20],
  ];
  for (const [label, pred] of bands) {
    const rs = losers.filter((r) => pred(r.beaten));
    const dl = rs.map((r) => (r.or1 ?? 0) - (r.or0 ?? 0));
    say(
      `| ${label} | ${rs.length} | ${fx(mean(rs.map((r) => (r.pr ?? 0) - (r.or0 ?? 0))), 2)} | ${fx(mean(dl), 2)} | ${pct(share(dl.filter((x) => x < 0).length, rs.length))} |`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 테스트                                                              */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */

describe('M3-F1b 원인 조사 측정 (VERIFY=1 전용)', () => {
  it.skipIf(!process.env.VERIFY)(
    `시드 ${SEED}, ${SEASONS}시즌(${TOTAL_WEEKS}주) 측정 출력`,
    () => {
      const col = emptyCol();
      const finalState = runSeasons(col);

      say('# M3-F1b 측정 출력 (시드 20261011, 2시즌, 105주)');
      say(`- 집계 레이스(출주 완료) ${col.runs.length}, 선언 단계 레이스 ${col.decls.length}, 출주 기록 ${col.runners.length}, 은퇴 이벤트 ${col.retired.length}, 시리즈 완료 ${col.seriesDone.length}`);
      say(`- 최종 상태 연도 ${finalState.date.year} 주 ${finalState.date.week}, 말 수 ${Object.keys(finalState.horses).length}`);
      reportSupply(col);
      reportGroup(col);
      reportFavourite(col);
      reportFunnel(col);
      reportPool(col);
      reportOr(col);
      reportCounterfactual(col);
      reportRetire(col);
      reportTemplates(col);

      expect(col.runs.length).toBeGreaterThan(0);
      expect(col.decls.length).toBeGreaterThan(0);
      expect(START_YEAR).toBe(2026);
    },
    1_800_000,
  );
});
