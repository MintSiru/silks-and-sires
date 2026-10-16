/**
 * M5-E1 기록 화면용 순수 뷰 함수. 설계: docs/specs/M5-E-legacy-screens.md, docs/m5-plan.md.
 * 입력은 GameState 와 정적 데이터, 출력은 문자열·숫자로 된 행이다. state 는 고치지 않는다.
 * 엔진 조회(dynastyGoals·rivalViews·lineLabel)는 그대로 쓰고, 화면 문구와 정렬만 여기서 만든다.
 */
import {
  CEREMONY_EUROPE_TOP,
  CEREMONY_REPUTATION,
  DYNASTY_GOALS,
  FAMILY_GENERATIONS,
  FAMILY_MIN_BLACK_TYPE_WINNERS,
  FAMILY_MIN_GROUP_WINNERS,
  LINE_MIN_FOUNDER_GROUP_WINNERS,
  LINE_MIN_STUD_SONS,
  LINE_MIN_TOTAL_GROUP_WINNERS,
} from '../../engine/config/legacy';
import { RIVAL_INTENSITY_MAX } from '../../engine/config/rivals';
import type { ChronicleStaticData } from '../../engine/legacy/chronicleSystem';
import { dynastyGoals } from '../../engine/legacy/goals';
import { lineLabel } from '../../engine/legacy/lines';
import { rivalViews, type RivalView } from '../../engine/legacy/rivals';
import { formatDateKo } from '../../engine/time/calendar';
import type {
  ChronicleEntry,
  ChronicleKind,
  HorseId,
  LaurelCategory,
  LeadingCategory,
  OwnerId,
  GameState,
} from '../../engine/types';
import { chronicleKo, countryKo, laurelCategoryKo, leadingCategoryKo, RIVAL_REASON_KO } from '../game/text';

export type ChronicleFilter = 'mine' | 'world' | 'all';

/** 연대기 한 줄(화면 표). 말 항목이면 horseId 로 말 상세를 연다 */
export interface ChronicleRow {
  id: string;
  dateLabel: string;
  text: string;
  horseId?: HorseId;
  player: boolean;
}

export interface ChronicleYearGroup {
  year: number;
  rows: ChronicleRow[];
}

type GoalId = (typeof DYNASTY_GOALS)[number]['id'];

/** 왕조 목표 12개의 한국어 이름 */
const GOAL_TITLE_KO: Record<GoalId, string> = {
  first_win: '첫 승리',
  first_group_win: '첫 그룹 우승',
  first_g1_win: '첫 G1 우승',
  first_classic_win: '첫 클래식 우승',
  five_classics: '클래식 5종 석권',
  horse_of_the_year: '올해의 말',
  leading_owner: '유럽 리딩 마주 1위',
  leading_breeder: '유럽 리딩 생산자 1위',
  sire_line_established: '부계 확립',
  female_family_established: '명문 모계',
  ten_g1_wins: '통산 G1 10승',
  thirty_year_dynasty: '30년 왕조',
};

export interface GoalCard {
  id: string;
  title: string;
  done: boolean;
  doneYear: number | null;
  /** 진행값 / 목표치 (진행값은 목표치에서 자른다) */
  progressLabel: string;
  /** 0~1 */
  ratio: number;
}

export interface EstablishedLineRow {
  id: string;
  founderName: string;
  /** 'X 계통' (시조 이름 기준) */
  label: string;
  /** 원래 계통 이름(분지 표시용) */
  parentLabel: string;
  establishedYear: number;
  sons: number;
  groupWinners: number;
  playerBred: boolean;
}

export interface FemaleFamilyRow {
  founderMareId: HorseId;
  name: string;
  establishedYear: number;
  blackTypeWinners: number;
  playerBred: boolean;
}

export interface HallOfFameRow {
  horseId: HorseId;
  name: string;
  g1Wins: number;
  classicWins: number;
  /** 'Laurel 부문 (연도)' 목록 */
  awards: string[];
  firstYear: number;
}

export interface RivalRow {
  ownerId: OwnerId;
  /** 마주 이름(가상). 마주 정보가 없으면 안내 문구 */
  name: string;
  countryLabel: string;
  reasonLabel: string;
  since: number;
  active: boolean;
  intensity: number;
  /** 경쟁심 막대 길이 0~1 */
  intensityRatio: number;
  /** '3승 2패' (플레이어 기준) */
  record: string;
  /** 가장 최근 맞대결 한 줄. 맞대결이 없으면 null */
  recentClash: string | null;
}

export interface CeremonyLaurelRow {
  category: LaurelCategory;
  label: string;
  horseId: HorseId | null;
  horseName: string | null;
  mine: boolean;
}

export interface CeremonyLeadingRow {
  rank: number;
  id: string;
  name: string;
  mine: boolean;
}

export interface CeremonyLeadingSection {
  category: LeadingCategory;
  label: string;
  rows: CeremonyLeadingRow[];
}

export interface CeremonyView {
  /** 시상 대상 시즌 연도(awardsHistory 의 year). 시상식은 다음 해 첫 주에 열린다 */
  year: number;
  laurel: CeremonyLaurelRow[];
  leading: CeremonyLeadingSection[];
  /** 그 시즌 내 연대기 하이라이트(최대 3줄, 날짜순) */
  highlights: string[];
  /** 시상식 명성 보상 합계(연간 상한 적용) */
  reputation: number;
}

/** Laurel 부문 표시 순서 */
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

/** 시상식 리딩 섹션 순서 */
const CEREMONY_LEADING_ORDER: readonly LeadingCategory[] = ['owner', 'breeder', 'sire'];

/** 연말 시상식 창의 하이라이트 줄 수 (화면 표시 상수) */
const CEREMONY_HIGHLIGHT_COUNT = 3;

/** 명명의 전당에 올리는 연대기 kind */
const HALL_KINDS: ReadonlySet<ChronicleKind> = new Set<ChronicleKind>(['g1_win', 'classic_win', 'laurel_award']);

/** 시상식 명성 보상으로 세는 연대기 kind (engine chronicleSystem 의 rewardOf 와 같은 기준) */
const REPUTATION_KINDS: ReadonlySet<ChronicleKind> = new Set<ChronicleKind>([
  'laurel_award',
  'leading_title',
  'series_champion',
]);

/** 하이라이트 우선순위(작을수록 먼저). 모든 kind 를 넣어 빠짐을 컴파일 때 막는다 */
const HIGHLIGHT_RANK: Record<ChronicleKind, number> = {
  g1_win: 0,
  classic_win: 1,
  group_win: 2,
  first_group_win: 3,
  first_win: 4,
  record_sale: 5,
  homebred_stallion: 6,
  sire_line_established: 7,
  female_family_established: 8,
  rival_clash: 9,
  rival_declared: 10,
  first_runner: 11,
  laurel_award: 12,
  leading_title: 13,
  series_champion: 14,
  world_classic: 15,
};

/** 라이벌 이유 한국어(text.ts 의 것은 비공개라 같은 문구를 여기 둔다) */

/** 확립 부계·명문 모계 목록 조건 안내 한 줄(config 값으로 만든다) */
export function lineConditionText(): string {
  return `부계 확립 조건: 게임 안에서 태어난 종마의 아들 ${LINE_MIN_STUD_SONS}마리 이상, 시조 자마 그룹 우승 ${LINE_MIN_FOUNDER_GROUP_WINNERS}두 이상, 시조와 아들들의 그룹 우승 합계 ${LINE_MIN_TOTAL_GROUP_WINNERS}두 이상.`;
}

/** 명문 모계 목록 조건 안내 한 줄(config 값으로 만든다) */
export function familyConditionText(): string {
  return `명문 모계 조건: 모계 ${FAMILY_GENERATIONS}대 안 블랙타입(그룹·리스티드) 우승마 ${FAMILY_MIN_BLACK_TYPE_WINNERS}두 이상, 그중 그룹 우승마 ${FAMILY_MIN_GROUP_WINNERS}두 이상.`;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 연대기 항목 id('연도-순번')의 순번. 찾지 못하면 0 */
function seqOf(id: string): number {
  const n = Number(id.slice(id.lastIndexOf('-') + 1));
  return Number.isFinite(n) ? n : 0;
}

/** 시간순 비교(연도 → 주 → 같은 해 순번) */
function compareChronology(a: ChronicleEntry, b: ChronicleEntry): number {
  return a.date.year - b.date.year || a.date.week - b.date.week || seqOf(a.id) - seqOf(b.id);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ownerLabelOf(state: GameState, id: OwnerId): string {
  return state.owners[id]?.name ?? state.breeders?.[id]?.name ?? id;
}

function horseNameOf(state: GameState, id: HorseId): string {
  return state.horses[id]?.name ?? id;
}

/** 내 소유 또는 내 생산마 */
function isPlayerHorse(state: GameState, horseId: HorseId): boolean {
  const horse = state.horses[horseId];
  return horse !== undefined && (horse.ownerId === state.playerOwnerId || horse.breederId === state.playerOwnerId);
}

function matchesFilter(entry: ChronicleEntry, filter: ChronicleFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'mine' ? entry.player : !entry.player;
}

function laurelLabelKo(label: string | undefined): string {
  return LAUREL_ORDER.includes(label as LaurelCategory) ? laurelCategoryKo(label as LaurelCategory) : '부문상';
}

/** 연대기를 연도 내림차순 묶음으로. 같은 해 안은 순번 내림차순. 항목이 없는 해는 만들지 않는다 */
export function chronicleYearGroups(
  state: GameState,
  filter: ChronicleFilter,
  nameOf: (id: HorseId) => string,
  ownerNameOf: (id: OwnerId) => string,
): ChronicleYearGroup[] {
  const byYear = new Map<number, ChronicleEntry[]>();
  for (const entry of state.chronicle ?? []) {
    if (!matchesFilter(entry, filter)) continue;
    const list = byYear.get(entry.date.year) ?? [];
    list.push(entry);
    byYear.set(entry.date.year, list);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]): ChronicleYearGroup => ({
      year,
      rows: [...entries]
        .sort((a, b) => seqOf(b.id) - seqOf(a.id))
        .map((entry): ChronicleRow => ({
          id: entry.id,
          dateLabel: formatDateKo(entry.date),
          text: chronicleKo(entry, nameOf, ownerNameOf),
          horseId: entry.horseId,
          player: entry.player,
        })),
    }));
}

/** 왕조 목표 12개 카드. 진행값은 목표치에서 자르고, 비율은 0~1 로 둔다 */
export function goalCards(state: GameState, data: Pick<ChronicleStaticData, 'templates'>): GoalCard[] {
  return dynastyGoals(state, data).map((goal): GoalCard => {
    const progress = Math.min(Math.max(0, goal.progress), goal.target);
    return {
      id: goal.id,
      title: GOAL_TITLE_KO[goal.id as GoalId] ?? goal.id,
      done: goal.done,
      doneYear: goal.doneYear,
      progressLabel: `${progress} / ${goal.target}`,
      ratio: goal.target > 0 ? clamp01(progress / goal.target) : 0,
    };
  });
}

/** 확립 부계 목록. 최근 확립 순(같은 해는 id 순) */
export function establishedLineRows(state: GameState): EstablishedLineRow[] {
  return [...(state.legacy?.lines ?? [])]
    .sort((a, b) => b.establishedYear - a.establishedYear || compareIds(a.id, b.id))
    .map((line): EstablishedLineRow => ({
      id: line.id,
      founderName: horseNameOf(state, line.founderId),
      label: lineLabel(state, line),
      parentLabel: lineLabel(state, line.parentLineId),
      establishedYear: line.establishedYear,
      sons: line.sons,
      groupWinners: line.groupWinners,
      playerBred: line.playerBred,
    }));
}

/** 명문 모계 목록. 최근 확립 순(같은 해는 id 순) */
export function femaleFamilyRows(state: GameState): FemaleFamilyRow[] {
  return [...(state.legacy?.families ?? [])]
    .sort((a, b) => b.establishedYear - a.establishedYear || compareIds(a.founderMareId, b.founderMareId))
    .map((family): FemaleFamilyRow => ({
      founderMareId: family.founderMareId,
      name: horseNameOf(state, family.founderMareId),
      establishedYear: family.establishedYear,
      blackTypeWinners: family.blackTypeWinners,
      playerBred: family.playerBred,
    }));
}

/**
 * 명예의 전당: 연대기의 플레이어 g1_win·classic_win·laurel_award 가 있는 말별 한 행.
 * 정렬: G1 승수 → 클래식 승수 → 수상 수 (모두 내림차순) → 첫 기록 연도(오름차순) → horseId.
 */
export function hallOfFameRows(state: GameState, nameOf: (id: HorseId) => string): HallOfFameRow[] {
  const byHorse = new Map<HorseId, ChronicleEntry[]>();
  for (const entry of state.chronicle ?? []) {
    if (!entry.player || entry.horseId === undefined || !HALL_KINDS.has(entry.kind)) continue;
    const list = byHorse.get(entry.horseId) ?? [];
    list.push(entry);
    byHorse.set(entry.horseId, list);
  }
  const rows = [...byHorse.entries()].map(([horseId, entries]): HallOfFameRow => {
    const sorted = [...entries].sort(compareChronology);
    const laurel = sorted.filter((e) => e.kind === 'laurel_award');
    return {
      horseId,
      name: nameOf(horseId),
      g1Wins: sorted.filter((e) => e.kind === 'g1_win').length,
      classicWins: sorted.filter((e) => e.kind === 'classic_win').length,
      awards: laurel.map((e) => `${laurelLabelKo(e.label)} (${e.date.year})`),
      firstYear: sorted[0]?.date.year ?? 0,
    };
  });
  return rows.sort((a, b) => b.g1Wins - a.g1Wins || b.classicWins - a.classicWins
    || b.awards.length - a.awards.length || a.firstYear - b.firstYear || compareIds(a.horseId, b.horseId));
}

/** 가장 최근 맞대결 항목(날짜·순번 기준). 없으면 undefined */
function latestOf(entries: readonly ChronicleEntry[]): ChronicleEntry | undefined {
  return entries.reduce<ChronicleEntry | undefined>(
    (best, entry) => best === undefined || compareChronology(entry, best) > 0 ? entry : best,
    undefined,
  );
}

/** 라이벌 목록(rivalViews 순서: 활성 먼저, 그다음 지난 라이벌) */
export function rivalRows(state: GameState): RivalRow[] {
  return rivalViews(state).map((view: RivalView): RivalRow => {
    const latest = latestOf(view.clashes);
    return {
      ownerId: view.ownerId,
      name: view.name ?? '이름 없는 마주',
      countryLabel: view.country === null ? '' : countryKo(view.country),
      reasonLabel: RIVAL_REASON_KO[view.reason],
      since: view.since,
      active: view.active,
      intensity: view.intensity,
      intensityRatio: clamp01(view.intensity / RIVAL_INTENSITY_MAX),
      record: `${view.playerAhead}승 ${view.rivalAhead}패`,
      recentClash: latest === undefined ? null
        : chronicleKo(latest, (id) => horseNameOf(state, id), (id) => ownerLabelOf(state, id)),
    };
  });
}

/** engine chronicleSystem 의 보상 기준과 같다(연대기 항목 → 명성) */
function reputationOf(entry: ChronicleEntry): number {
  if (entry.kind === 'laurel_award') {
    return entry.label === 'horse_of_the_year' ? CEREMONY_REPUTATION.horseOfTheYear : CEREMONY_REPUTATION.laurel;
  }
  if (entry.kind === 'series_champion') return CEREMONY_REPUTATION.series;
  if (entry.kind === 'leading_title') {
    if (entry.label === 'europe:1') return CEREMONY_REPUTATION.europeFirst;
    return entry.label?.startsWith('europe:') ? CEREMONY_REPUTATION.europePlaced : CEREMONY_REPUTATION.countryFirst;
  }
  return 0;
}

/**
 * 시상식 명성 보상 합계. 시상식 항목은 시즌 다음 해 첫 주에 기록되므로(year + 1) 그 해의 플레이어 항목을 센다.
 * 연간 상한(CEREMONY_REPUTATION.annualCap)을 넘지 않는다.
 */
function ceremonyReputation(state: GameState, year: number): number {
  const sum = (state.chronicle ?? [])
    .filter((e) => e.player && e.date.year === year + 1 && REPUTATION_KINDS.has(e.kind))
    .reduce((total, e) => total + reputationOf(e), 0);
  return Math.min(sum, CEREMONY_REPUTATION.annualCap);
}

/** 그 시즌의 연대기 하이라이트: 우선순위 상위 N 개를 고르고 날짜순으로 보여 준다 */
function seasonHighlights(state: GameState, year: number, nameOf: (id: HorseId) => string): string[] {
  const picked = (state.chronicle ?? [])
    .filter((e) => e.player && e.date.year === year)
    .sort((a, b) => HIGHLIGHT_RANK[a.kind] - HIGHLIGHT_RANK[b.kind] || compareChronology(b, a))
    .slice(0, CEREMONY_HIGHLIGHT_COUNT)
    .sort(compareChronology);
  return picked.map((e) => chronicleKo(e, nameOf, (id) => ownerLabelOf(state, id)));
}

/**
 * 연말 시상식 창 데이터. 해당 시즌 시상(awardsHistory.year === year)이 없으면 null.
 * 말 이름은 nameOf, 마주·생산자 이름은 state.owners(없으면 breeders), 종마 이름은 nameOf.
 */
export function ceremonyView(
  state: GameState,
  year: number,
  nameOf: (id: HorseId) => string,
): CeremonyView | null {
  const awards = state.awardsHistory.find((a) => a.year === year);
  if (awards === undefined) return null;
  const laurel = LAUREL_ORDER.map((category): CeremonyLaurelRow => {
    const horseId = awards.laurel[category] ?? null;
    return {
      category,
      label: laurelCategoryKo(category),
      horseId,
      horseName: horseId === null ? null : nameOf(horseId),
      mine: horseId !== null && isPlayerHorse(state, horseId),
    };
  });
  const leading = CEREMONY_LEADING_ORDER.map((category): CeremonyLeadingSection => ({
    category,
    label: leadingCategoryKo(category),
    rows: (awards.leading[category] ?? []).slice(0, CEREMONY_EUROPE_TOP).map((entry, index): CeremonyLeadingRow => ({
      rank: index + 1,
      id: entry.id,
      name: category === 'sire' ? nameOf(entry.id) : ownerLabelOf(state, entry.id),
      mine: category === 'sire' ? isPlayerHorse(state, entry.id) : entry.id === state.playerOwnerId,
    })),
  }));
  return {
    year,
    laurel,
    leading,
    highlights: seasonHighlights(state, year, nameOf),
    reputation: ceremonyReputation(state, year),
  };
}
