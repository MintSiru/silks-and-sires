/**
 * 순위·시상 화면 뷰 모델 (M3-D3c). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 공식 OR 숫자는 담지 않는다(officialRating 필드를 읽지 않는다). Ledger·Global 레이팅은 '평가지·랭킹 발표 값'이라 보인다.
 * 표시 크기(목록 개수)는 화면 상수이며 밸런스 상수가 아니다.
 */
import { observedProfile } from '../../engine/breeding/offspring';
import { getRaceTemplates } from '../../engine/data/staticData';
import { formatDateKo } from '../../engine/time/calendar';
import type {
  CountryCode,
  DistanceProfile,
  GameState,
  HorseId,
  LaurelCategory,
  LeadingCategory,
  LeadingEntry,
  LeadingTables,
  Money,
  RaceGrade,
  RaceId,
  SeasonAwards,
  SeriesDefinition,
  SeriesId,
} from '../../engine/types';
import { countryKo, distanceProfileKo, laurelCategoryKo, seriesNameKo } from '../game/text';

/** 리딩 기본 표시 개수 */
export const LEADING_VIEW_LIMIT = 20;
/** 시상 목록(Ledger·Global) 표시 개수 */
export const AWARDS_LIST_SHOWN = 10;
/** 시리즈 포인트 상위 표시 개수 */
export const SERIES_TOP_POINTS = 5;
/** 산구 성적 기본 표시 개수 */
export const SIRE_TABLE_LIMIT = 30;

/** 리딩 범위: 유럽 합산 또는 나라 코드 */
export type LeadingScope = 'EU' | CountryCode;

/** 부문 표시 순서(Laurel 8부문) */
const LAUREL_ORDER: readonly LaurelCategory[] = [
  'horse_of_the_year',
  'older_horse',
  'stayer',
  'sprinter',
  'two_year_old_colt',
  'two_year_old_filly',
  'three_year_old_colt',
  'three_year_old_filly',
];

/** 해당 수상마가 없을 때 표기 */
const NO_LAUREL = '해당 없음';
/** 거리 적성이 아직 정해지지 않았을 때 표기 */
const UNDECIDED_PROFILE = '자료 부족';
const CROWN_KIND_KO = '달성형';
const POINTS_KIND_KO = '포인트형';

function compareId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function assertLimit(name: string, limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`${name}: limit 은 0 이상의 정수여야 한다: ${limit}`);
  }
}

function nameOfHorse(state: GameState, id: HorseId): string {
  return state.horses[id]?.name ?? id;
}

/** 레이스 이름: 고정 일정 목록에서 찾고, 없으면 id 를 그대로 쓴다 */
function raceNameOf(raceId: RaceId): string {
  return getRaceTemplates().find((t) => t.id === raceId)?.name ?? raceId;
}

// ── 시리즈 ──────────────────────────────────────────────────────

export interface SeriesLegView {
  raceId: RaceId;
  raceName: string;
  /** 레그 우승마 이름. 아직 안 열렸거나 우승마가 없으면 null */
  winnerName: string | null;
}

export interface SeriesPointRow {
  rank: number;
  horseId: HorseId;
  name: string;
  points: number;
}

export interface SeriesCardView {
  seriesId: SeriesId;
  name: string;
  kind: 'crown' | 'points';
  kindLabel: string;
  /** 진행 중인 해. 진행 기록이 없으면 null */
  year: number | null;
  /** crown: 레그별 우승마(시리즈 정의 순서). points 면 빈 배열 */
  legs: SeriesLegView[];
  /** points: 포인트 상위 SERIES_TOP_POINTS 두. crown 이면 빈 배열 */
  topPoints: SeriesPointRow[];
  championId: HorseId | null;
  /** 달성마(crown) 또는 시즌 1위(points, 시즌 종료 후). 없으면 null */
  championName: string | null;
  bonus: Money;
}

/** 시리즈 전체 카드(정의 순서). defs 는 getSeriesDefinitions() 를 넘긴다 */
export function seriesView(state: GameState, defs: readonly SeriesDefinition[]): SeriesCardView[] {
  return defs.map((def) => {
    const progress = state.seasonState.series[def.id];
    const championId = progress?.champion ?? null;
    const legs: SeriesLegView[] = [];
    const topPoints: SeriesPointRow[] = [];

    if (def.kind === 'crown') {
      for (const raceId of def.legs) {
        const winnerId: HorseId | undefined = progress?.legWinners[raceId];
        legs.push({
          raceId,
          raceName: raceNameOf(raceId),
          winnerName: winnerId === undefined ? null : nameOfHorse(state, winnerId),
        });
      }
    } else {
      const entries = Object.entries(progress?.points ?? {})
        .filter(([, points]) => points > 0)
        .sort(([idA, a], [idB, b]) => b - a || compareId(idA, idB))
        .slice(0, SERIES_TOP_POINTS);
      entries.forEach(([horseId, points], index) => {
        topPoints.push({ rank: index + 1, horseId, name: nameOfHorse(state, horseId), points });
      });
    }

    return {
      seriesId: def.id,
      name: seriesNameKo(def.id),
      kind: def.kind,
      kindLabel: def.kind === 'crown' ? CROWN_KIND_KO : POINTS_KIND_KO,
      year: progress === undefined ? null : progress.year,
      legs,
      topPoints,
      championId,
      championName: championId === null ? null : nameOfHorse(state, championId),
      bonus: def.bonus,
    };
  });
}

// ── 리딩 ────────────────────────────────────────────────────────

export interface LeadingRowView {
  rank: number;
  id: string;
  name: string;
  runners: number;
  wins: number;
  places: number;
  groupWins: number;
  earnings: Money;
}

/** 리딩 정렬: 승수 → 상금 → 출주 → id (awards.ts 의 leadingTop 과 같다) */
function compareLeading(a: LeadingEntry, b: LeadingEntry): number {
  return b.wins - a.wins || b.earnings - a.earnings || b.runners - a.runners || compareId(a.id, b.id);
}

function nameOfLeading(state: GameState, category: LeadingCategory, id: string): string {
  switch (category) {
    case 'sire':
    case 'damsire':
      return nameOfHorse(state, id);
    case 'jockey':
      return state.jockeys[id]?.name ?? id;
    case 'trainer':
      return state.trainers[id]?.name ?? id;
    case 'owner':
    case 'breeder':
      return state.owners[id]?.name ?? id;
  }
}

/**
 * 올해 리딩 상위(정렬: 승 → 상금 → 출주). scope 'EU' 는 유럽 합산 표, 나라 코드는 그 나라 표만 쓴다.
 * 그 나라에 출주 기록이 없으면 빈 배열이다.
 */
export function leadingView(
  state: GameState,
  category: LeadingCategory,
  scope: LeadingScope,
  limit: number = LEADING_VIEW_LIMIT,
): LeadingRowView[] {
  assertLimit('leadingView', limit);
  const tables: LeadingTables | undefined =
    scope === 'EU' ? state.seasonState.leading : state.seasonState.leadingByCountry[scope];
  if (tables === undefined) return [];
  return Object.values(tables[category])
    .sort(compareLeading)
    .slice(0, limit)
    .map((e, index) => ({
      rank: index + 1,
      id: e.id,
      name: nameOfLeading(state, category, e.id),
      runners: e.runners,
      wins: e.wins,
      places: e.places,
      groupWins: e.groupWins,
      earnings: e.earnings,
    }));
}

/** 리딩 범위 선택지: 유럽 합산 + 올해 출주 기록이 있는 나라(국가 코드 순) */
export function leadingScopes(state: GameState): LeadingScope[] {
  const countries = Object.keys(state.seasonState.leadingByCountry).sort(compareId) as CountryCode[];
  return ['EU', ...countries];
}

/** 리딩 범위 한국어. 'EU' → '유럽 합산', 나라 코드 → 국가 명 */
export function leadingScopeKo(scope: LeadingScope): string {
  return scope === 'EU' ? '유럽 합산' : countryKo(scope);
}

// ── 시상 ────────────────────────────────────────────────────────

export interface LaurelRowView {
  category: LaurelCategory;
  label: string;
  horseId: HorseId | null;
  /** 수상마 이름. 해당 없으면 '해당 없음' */
  horseName: string;
}

export interface RatedRowView {
  rank: number;
  horseId: HorseId;
  name: string;
  /** 평가지·랭킹 발표 값(공식 OR 이 아니다) */
  rating: number;
}

export interface BestRaceView {
  raceId: RaceId;
  name: string;
  dateLabel: string;
  countryLabel: string;
  grade: RaceGrade;
  rating: number;
}

export interface SeriesChampionRow {
  seriesId: SeriesId;
  name: string;
  horseId: HorseId;
  horseName: string;
}

export interface AwardsView {
  year: number;
  laurel: LaurelRowView[];
  ledger: RatedRowView[];
  globalRankings: RatedRowView[];
  bestRace: BestRaceView | null;
  seriesChampions: SeriesChampionRow[];
}

/** 시상 기록 고르기: year 가 없으면 가장 최근, 있으면 그 해. 없으면 null */
function pickAwards(state: GameState, year?: number): SeasonAwards | null {
  const history = state.awardsHistory;
  if (year === undefined) return history[history.length - 1] ?? null;
  return history.find((a) => a.year === year) ?? null;
}

function ratedRows(state: GameState, list: SeasonAwards['ledger']): RatedRowView[] {
  return list.slice(0, AWARDS_LIST_SHOWN).map((r, index) => ({
    rank: index + 1,
    horseId: r.horseId,
    name: nameOfHorse(state, r.horseId),
    rating: r.rating,
  }));
}

/**
 * 지난 시상 뷰. year 를 생략하면 가장 최근 시상, 지정하면 그 해 시상. 기록이 없으면 null.
 * Laurel 8부문(자격 마가 없으면 '해당 없음'), Ledger·Global 상위 10, 최우수 레이스, 시리즈 챔피언을 낸다.
 */
export function awardsView(state: GameState, year?: number): AwardsView | null {
  const awards = pickAwards(state, year);
  if (awards === null) return null;

  const laurel: LaurelRowView[] = LAUREL_ORDER.map((category) => {
    const horseId = awards.laurel[category];
    return {
      category,
      label: laurelCategoryKo(category),
      horseId,
      horseName: horseId === null ? NO_LAUREL : nameOfHorse(state, horseId),
    };
  });

  const best = awards.bestRace;
  const bestRace: BestRaceView | null =
    best === null
      ? null
      : {
          raceId: best.raceId,
          name: best.name,
          dateLabel: formatDateKo(best.date),
          countryLabel: countryKo(best.country),
          grade: best.grade,
          rating: best.rating,
        };

  const seriesChampions: SeriesChampionRow[] = Object.entries(awards.seriesChampions)
    .sort(([a], [b]) => compareId(a, b))
    .map(([seriesId, horseId]) => ({
      seriesId,
      name: seriesNameKo(seriesId),
      horseId,
      horseName: nameOfHorse(state, horseId),
    }));

  return {
    year: awards.year,
    laurel,
    ledger: ratedRows(state, awards.ledger),
    globalRankings: ratedRows(state, awards.globalRankings),
    bestRace,
    seriesChampions,
  };
}

/** 시상이 있는 연도 목록(최신순). 시상 선택 상자용 */
export function awardYears(state: GameState): number[] {
  return state.awardsHistory.map((a) => a.year).reverse();
}

// ── 산구 성적 ───────────────────────────────────────────────────

export interface SireRowView {
  rank: number;
  sireId: HorseId;
  name: string;
  /** 출주한 자마 수 */
  starters: number;
  /** 1승 이상 자마 수 */
  winners: number;
  wins: number;
  groupWins: number;
  earnings: Money;
  /** 실제 성적 기준 거리 적성 한국어. 미정이면 '자료 부족' */
  profileLabel: string;
}

export interface SireTotals {
  /** 자마 성적이 있는 종마 수(표 절단 전) */
  sires: number;
  starters: number;
  winners: number;
  wins: number;
  groupWins: number;
  earnings: Money;
}

export interface SireTableView {
  /** 승 수 순 상위 limit 두 */
  rows: SireRowView[];
  /** 표 절단 전 전체 합계(sireStats 전체) */
  totals: SireTotals;
}

/** 산구 성적 표: 승 수 → 상금 → id 순 정렬. totals 는 상위 절단과 무관한 전체 합계다. */
export function sireTable(state: GameState, limit: number = SIRE_TABLE_LIMIT): SireTableView {
  assertLimit('sireTable', limit);
  const entries = Object.entries(state.sireStats);
  const totals: SireTotals = { sires: entries.length, starters: 0, winners: 0, wins: 0, groupWins: 0, earnings: 0 };
  for (const [, s] of entries) {
    totals.starters += s.starters;
    totals.winners += s.winners;
    totals.wins += s.wins;
    totals.groupWins += s.groupWins;
    totals.earnings += s.earnings;
  }

  const sorted = [...entries].sort(
    ([idA, a], [idB, b]) => b.wins - a.wins || b.earnings - a.earnings || compareId(idA, idB),
  );
  const rows: SireRowView[] = sorted.slice(0, limit).map(([sireId, s], index) => {
    const profile: DistanceProfile | null = observedProfile(s);
    return {
      rank: index + 1,
      sireId,
      name: nameOfHorse(state, sireId),
      starters: s.starters,
      winners: s.winners,
      wins: s.wins,
      groupWins: s.groupWins,
      earnings: s.earnings,
      profileLabel: profile === null ? UNDECIDED_PROFILE : distanceProfileKo(profile),
    };
  });
  return { rows, totals };
}
