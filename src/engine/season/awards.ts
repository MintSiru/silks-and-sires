/**
 * 연간 시상·순위 계산 (M3-E1b). 연도 전환 때 올해 기록으로 세 단체 시상과 리딩 상위를 확정한다.
 * - The Racing Ledger(150 척도): 상위 출주 PR 평균 + 상위 보너스.
 * - Global Turf Rankings(OR 척도): 그룹·리스티드 PR 최고값, 최우수 레이스.
 * - Laurel Racing Awards: 부문별 자격을 거친 뒤 경주 점수 + Ledger 가중치 + 심사위원 잡음.
 * 순수 함수: 입력 state 는 바꾸지 않는다. 난수는 주입된 rng 의 하위 스트림만 쓴다.
 */
import {
  DISTANCE_CATEGORY_MIN_SHARE,
  GLOBAL_LIST_SIZE,
  LAUREL_GROUP_GRADES,
  LAUREL_HOY_MIN_GROUP_WINS,
  LAUREL_JURY_SD,
  LAUREL_JURY_WEIGHT,
  LAUREL_OLDER_MIN_AGE,
  LAUREL_RUN_SCORES,
  LAUREL_THREE_YO_AGE,
  LAUREL_TWO_YO_AGE,
  LEADING_TOP_N,
  LEDGER_LIST_SIZE,
  LEDGER_MAX,
  LEDGER_PIVOT,
  LEDGER_SINGLE_RUN_PENALTY,
  LEDGER_TOP_BONUS_MAX,
  LEDGER_TOP_BONUS_RATE,
  LEDGER_TOP_RUNS,
  SPRINTER_MAX_DISTANCE,
  STAYER_MIN_DISTANCE,
} from '../config/awards';
import { PLACED_MAX_POSITION } from '../config/season';
import type {
  CountryCode,
  GameState,
  Horse,
  HorseId,
  LaurelCategory,
  LeadingEntry,
  LeadingTables,
  LeadingTop,
  PerformanceEntry,
  RaceGrade,
  RaceRatingEntry,
  RatedHorse,
  Rng,
  SeasonAwards,
  SeriesId,
} from '../types';
import { ageInYear } from '../time/calendar';

/** 시상 계산 입력. 올해 기록(seasonState)과 말 정보(horses), 결과 여부(raceResults)만 읽는다 */
export type AwardsSource = Pick<GameState, 'horses' | 'raceResults' | 'seasonState'>;

interface HorseRuns {
  horseId: HorseId;
  /** 올해 출주 기록(1개 이상) */
  runs: PerformanceEntry[];
}

function compareId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 그룹(G1~G3) 등급 여부. 리스티드('L')는 제외 */
function isGroupGrade(grade: RaceGrade | null): boolean {
  return grade !== null && LAUREL_GROUP_GRADES.includes(grade);
}

function isGroupWin(e: PerformanceEntry): boolean {
  return isGroupGrade(e.grade) && e.position === 1;
}

function isGroupPlacing(e: PerformanceEntry): boolean {
  return isGroupGrade(e.grade) && e.position <= PLACED_MAX_POSITION;
}

/** 경주 점수: 그룹·리스티드 착순 점수표. 그 밖은 0점 */
function runScore(e: PerformanceEntry): number {
  if (e.grade === null) return 0;
  const row = LAUREL_RUN_SCORES.find((s) => s.grade === e.grade && s.position === e.position);
  return row?.score ?? 0;
}

/**
 * 한 말의 The Racing Ledger 레이팅(150 척도). 출주 PR 목록 기준, 출주가 없으면 null.
 * base = 상위 출주 PR 평균(출주 1회면 그 PR − 감점). 보너스는 base 가 PIVOT 을 넘는 만큼 붙고 상한이 있다.
 */
export function ledgerRating(prs: readonly number[]): number | null {
  const top = [...prs].sort((a, b) => b - a).slice(0, LEDGER_TOP_RUNS);
  const best = top[0];
  if (best === undefined) return null;
  const base =
    top.length === 1 ? best - LEDGER_SINGLE_RUN_PENALTY : top.reduce((sum, v) => sum + v, 0) / top.length;
  const bonus = clamp((base - LEDGER_PIVOT) * LEDGER_TOP_BONUS_RATE, 0, LEDGER_TOP_BONUS_MAX);
  return Math.min(LEDGER_MAX, Math.round(base + bonus));
}

/** 올해 출주 기록이 있는 말(id 순) */
function yearRuns(source: AwardsSource, year: number): HorseRuns[] {
  const out: HorseRuns[] = [];
  for (const horseId of Object.keys(source.seasonState.performances).sort(compareId)) {
    const all = source.seasonState.performances[horseId] ?? [];
    const runs = all.filter((e) => e.date.year === year);
    if (runs.length > 0) out.push({ horseId, runs });
  }
  return out;
}

function sortRated(list: RatedHorse[]): RatedHorse[] {
  return list.sort((a, b) => b.rating - a.rating || compareId(a.horseId, b.horseId));
}

/** 전체 Ledger 순위(상위 절단 전). Laurel 점수 계산에도 쓴다 */
export function rankLedger(source: AwardsSource, year: number): RatedHorse[] {
  const rated: RatedHorse[] = [];
  for (const { horseId, runs } of yearRuns(source, year)) {
    const rating = ledgerRating(runs.map((e) => e.pr));
    if (rating !== null) rated.push({ horseId, rating });
  }
  return sortRated(rated);
}

/** The Racing Ledger 상위 목록(LEDGER_LIST_SIZE) */
export function computeLedger(source: AwardsSource, year: number): RatedHorse[] {
  return rankLedger(source, year).slice(0, LEDGER_LIST_SIZE);
}

/** Global Turf Rankings: 말별 올해 그룹·리스티드 PR 최고값 상위 목록 */
export function computeGlobalRankings(source: AwardsSource, year: number): RatedHorse[] {
  const rated: RatedHorse[] = [];
  for (const { horseId, runs } of yearRuns(source, year)) {
    let best: number | null = null;
    for (const e of runs) {
      if (e.grade === null) continue;
      if (best === null || e.pr > best) best = e.pr;
    }
    if (best !== null) rated.push({ horseId, rating: best });
  }
  return sortRated(rated).slice(0, GLOBAL_LIST_SIZE);
}

/** 최우수 레이스: 올해 G1 레이스 중 레이팅 최고(동점은 raceId 순). 없으면 null */
export function computeBestRace(source: AwardsSource, year: number): RaceRatingEntry | null {
  let best: RaceRatingEntry | null = null;
  for (const r of source.seasonState.raceRatings) {
    if (r.date.year !== year || r.grade !== 'G1') continue;
    if (best === null || r.rating > best.rating || (r.rating === best.rating && compareId(r.raceId, best.raceId) < 0)) {
      best = r;
    }
  }
  return best === null ? null : { ...best };
}

/**
 * 거리 부문 자격. 그룹·리스티드 출주 중 해당 거리 비율이 절반 이상이고 그 거리에서 그룹 입상이 1회 이상이면
 * 그 거리 레이스 목록을, 아니면 null.
 */
function distanceRuns(runs: readonly PerformanceEntry[], inBand: (distance: number) => boolean): PerformanceEntry[] | null {
  const graded = runs.filter((e) => e.grade !== null);
  if (graded.length === 0) return null;
  const band = graded.filter((e) => inBand(e.distance));
  if (band.length / graded.length < DISTANCE_CATEGORY_MIN_SHARE) return null;
  if (!band.some(isGroupPlacing)) return null;
  return band;
}

/**
 * 부문 자격 판정. 자격이 있으면 점수에 넣을 레이스 목록을, 없으면 null.
 * 나이·성별 부문은 말의 모든 출주를 쓴다(나이는 해마다 한 번 바뀌므로 한 해 안에서 같다).
 * '수'는 거세마를 포함한 male 을 뜻한다.
 */
function categoryRuns(
  category: LaurelCategory,
  horse: Horse,
  runs: readonly PerformanceEntry[],
  year: number,
): readonly PerformanceEntry[] | null {
  const age = ageInYear(horse.birthYear, year);
  switch (category) {
    case 'horse_of_the_year':
      return runs.filter(isGroupWin).length >= LAUREL_HOY_MIN_GROUP_WINS ? runs : null;
    case 'older_horse':
      return age >= LAUREL_OLDER_MIN_AGE ? runs : null;
    case 'two_year_old_colt':
      return age === LAUREL_TWO_YO_AGE && horse.sex === 'male' ? runs : null;
    case 'two_year_old_filly':
      return age === LAUREL_TWO_YO_AGE && horse.sex === 'female' ? runs : null;
    case 'three_year_old_colt':
      return age === LAUREL_THREE_YO_AGE && horse.sex === 'male' ? runs : null;
    case 'three_year_old_filly':
      return age === LAUREL_THREE_YO_AGE && horse.sex === 'female' ? runs : null;
    case 'stayer':
      return distanceRuns(runs, (d) => d >= STAYER_MIN_DISTANCE);
    case 'sprinter':
      return distanceRuns(runs, (d) => d <= SPRINTER_MAX_DISTANCE);
  }
}

/**
 * Laurel Racing Awards: 부문별 수상마(자격 말이 없으면 null).
 * 점수 = 자격 레이스의 경주 점수 합 + LAUREL_JURY_WEIGHT × Ledger 레이팅 + 심사위원 잡음.
 * 잡음은 말마다 한 번, id 순으로 rng.fork('laurel:' + year) 에서 뽑아 부문끼리 같은 표를 쓴다.
 * ledger 는 상위 절단 전 전체 목록이어야 한다(rankLedger).
 */
export function computeLaurel(
  source: AwardsSource,
  year: number,
  ledger: readonly RatedHorse[],
  rng: Rng,
): Record<LaurelCategory, HorseId | null> {
  const ledgerOf = new Map<HorseId, number>(ledger.map((r) => [r.horseId, r.rating] as const));
  const jury = rng.fork('laurel:' + year);
  const candidates = yearRuns(source, year);
  const noise = new Map<HorseId, number>();
  for (const { horseId } of candidates) {
    noise.set(horseId, jury.normal(0, LAUREL_JURY_SD));
  }

  const winnerOf = (category: LaurelCategory): HorseId | null => {
    let best: { horseId: HorseId; score: number } | null = null;
    for (const { horseId, runs } of candidates) {
      const horse = source.horses[horseId];
      const rating = ledgerOf.get(horseId);
      if (horse === undefined || rating === undefined) continue;
      const used = categoryRuns(category, horse, runs, year);
      if (used === null) continue;
      const raceScore = used.reduce((sum, e) => sum + runScore(e), 0);
      const score = raceScore + LAUREL_JURY_WEIGHT * rating + (noise.get(horseId) ?? 0);
      if (best === null || score > best.score || (score === best.score && compareId(horseId, best.horseId) < 0)) {
        best = { horseId, score };
      }
    }
    return best === null ? null : best.horseId;
  };

  return {
    horse_of_the_year: winnerOf('horse_of_the_year'),
    older_horse: winnerOf('older_horse'),
    stayer: winnerOf('stayer'),
    sprinter: winnerOf('sprinter'),
    two_year_old_colt: winnerOf('two_year_old_colt'),
    two_year_old_filly: winnerOf('two_year_old_filly'),
    three_year_old_colt: winnerOf('three_year_old_colt'),
    three_year_old_filly: winnerOf('three_year_old_filly'),
  };
}

function compareLeading(a: LeadingEntry, b: LeadingEntry): number {
  return b.wins - a.wins || b.earnings - a.earnings || b.runners - a.runners || compareId(a.id, b.id);
}

function topOf(table: Record<string, LeadingEntry>): LeadingEntry[] {
  return Object.values(table)
    .sort(compareLeading)
    .slice(0, LEADING_TOP_N)
    .map((e) => ({ ...e }));
}

/** 리딩 상위(카테고리별 최대 LEADING_TOP_N). 정렬: 승수 → 상금 → 출주 → id */
export function leadingTop(tables: LeadingTables): LeadingTop {
  return {
    sire: topOf(tables.sire),
    damsire: topOf(tables.damsire),
    jockey: topOf(tables.jockey),
    trainer: topOf(tables.trainer),
    owner: topOf(tables.owner),
    breeder: topOf(tables.breeder),
  };
}

function countryTops(source: AwardsSource): Partial<Record<CountryCode, LeadingTop>> {
  const out: Partial<Record<CountryCode, LeadingTop>> = {};
  const byCountry = source.seasonState.leadingByCountry;
  for (const code of Object.keys(byCountry).sort(compareId) as CountryCode[]) {
    const tables = byCountry[code];
    if (tables !== undefined) out[code] = leadingTop(tables);
  }
  return out;
}

/** 그 해 챔피언이 확정된 시리즈(crown 달성 또는 points 1위) */
function seriesChampionsOf(source: AwardsSource, year: number): Record<SeriesId, HorseId> {
  const out: Record<SeriesId, HorseId> = {};
  for (const id of Object.keys(source.seasonState.series).sort(compareId)) {
    const progress = source.seasonState.series[id];
    if (progress !== undefined && progress.year === year && progress.champion !== null) {
      out[id] = progress.champion;
    }
  }
  return out;
}

/** 지난해에 레이스가 하나라도 있었는지. 없으면 연도 전환 때 시상을 만들지 않는다 */
export function hadRacesIn(source: AwardsSource, year: number): boolean {
  if (source.raceResults.some((r) => r.date.year === year)) return true;
  for (const runs of Object.values(source.seasonState.performances)) {
    if (runs.some((e) => e.date.year === year)) return true;
  }
  return Object.values(source.seasonState.leading.jockey).some((e) => e.runners > 0);
}

/**
 * 한 해의 시상·순위 전체. 연도 전환 직전(leading 초기화 전)에 부른다.
 * rng 는 호출자가 넘긴 하위 스트림(예: fork('awards'))만 쓴다.
 */
export function computeSeasonAwards(source: AwardsSource, year: number, rng: Rng): SeasonAwards {
  const ledgerAll = rankLedger(source, year);
  return {
    year,
    laurel: computeLaurel(source, year, ledgerAll, rng),
    ledger: ledgerAll.slice(0, LEDGER_LIST_SIZE),
    globalRankings: computeGlobalRankings(source, year),
    bestRace: computeBestRace(source, year),
    leading: leadingTop(source.seasonState.leading),
    leadingByCountry: countryTops(source),
    seriesChampions: seriesChampionsOf(source, year),
  };
}
