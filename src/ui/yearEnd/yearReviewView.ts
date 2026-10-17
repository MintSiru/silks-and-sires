/**
 * 연말 정산 '한 해 돌아보기' 뷰 모델(M7-F). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 *
 * 연말 정산 화면은 새해 1주(아직 처리 전)에 뜬다. 그 시점에는 연도 전환(startNewSeason)이 아직 돌지 않았으므로
 * 지난해 값이 그대로 남아 있다: economy.currentYear(장부 합계), seasonState.performances(퍼포먼스),
 * raceResults(레이스 결과, 연도 필터). 그래서 돌아보는 해는 state.date.year - 1 이다.
 *
 * 플레이어에게 OR 숫자는 보이지 않는다: 레이팅은 ratingHintKo 문구로만 보인다(seasonView 와 같은 규칙).
 * '내 말'은 현재 소유 말이다. 올해 중 팔린 말의 출주는 레이스 이벤트(race_run)가 남아 있으면 그 기록을 따른다.
 */
import { getRacecourses, getSalesData } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import { formatDateKo } from '../../engine/time/calendar';
import { announceWeekOf } from '../../engine/sales/system';
import type {
  ChronicleEntry,
  ChronicleKind,
  GameDate,
  GameEvent,
  GameState,
  HorseId,
  LedgerCategory,
  LedgerEntry,
  RaceGrade,
  RaceId,
  Money,
  OwnerId,
  RacecourseId,
} from '../../engine/types';
import { chronicleBodyKo, chronicleTagOf } from '../legacy/legacyView';
import { chronicleKo, feeKo, ratingHintKo, saleAnnounceKo } from '../game/text';

/** 화면에 보이는 주요 순간 최대 개수 */
export const REVIEW_MOMENT_LIMIT = 5;
/** 입상 기준: 1~3착 */
const PLACE_LAST = 3;
/** '2세가 되는 말' 기준 나이(새해 나이) */
const TWO_YEAR_OLD = 2;

export type YearReviewCardKey = 'racing' | 'trade' | 'finance' | 'moments' | 'next';

export interface YearReviewRow {
  label: string;
  value: string;
}

export interface YearReviewCard {
  key: YearReviewCardKey;
  titleKo: string;
  rows: YearReviewRow[];
  /** 카드 아래 안내 문구(출주 없음·빚 등). 없으면 빈 배열 */
  notices: string[];
}

export interface YearReviewView {
  /** 돌아보는 해(끝난 해) */
  year: number;
  titleKo: string;
  cards: YearReviewCard[];
}

/** 레이스 등급 표기. 리스티드는 '리스티드'로 쓴다 */
const GRADE_KO: Record<RaceGrade, string> = { G1: 'G1', G2: 'G2', G3: 'G3', L: '리스티드' };
/** 등급 순서(작을수록 높음). 등급 없는 레이스는 가장 뒤 */
const GRADE_RANK: Record<RaceGrade, number> = { G1: 0, G2: 1, G3: 2, L: 3 };
const UNGRADED_RANK = 4;
const UNGRADED_KO = '일반 레이스';

/** 판매로 세는 장부 항목(수입) */
const SALE_INCOME: ReadonlySet<LedgerCategory> = new Set<LedgerCategory>(['sale_proceeds', 'stallion_sale', 'nh_store_sale']);
/** 구매로 세는 장부 항목(지출). 개인 거래는 부호로 판단한다 */
const PURCHASE_EXPENSE: LedgerCategory = 'sale_purchase';
const PRIVATE_TRADE: LedgerCategory = 'private_sale';

/** 주요 순간 고르기 우선순위(작을수록 먼저). 종류가 늘면 컴파일이 막는다 */
const MOMENT_PRIORITY: Record<ChronicleKind, number> = {
  classic_win: 0,
  g1_win: 1,
  laurel_award: 2,
  leading_title: 3,
  series_champion: 4,
  group_win: 5,
  first_group_win: 6,
  record_sale: 7,
  homebred_stallion: 8,
  sire_line_established: 9,
  female_family_established: 10,
  rival_clash: 11,
  rival_declared: 12,
  first_win: 13,
  first_runner: 14,
  world_classic: 15,
};

/** 한 번의 출주 중 플레이어 말 한 두 */
interface PlayerRun {
  date: GameDate;
  raceId: RaceId;
  racecourseId: RacecourseId;
  distance: number;
  horseId: HorseId;
  position: number;
  grade: RaceGrade | null;
}

/** 날짜·레이스 id 로 레이스 한 번을 가리키는 키. 고정 일정 레이스 id 는 해마다 같으므로 날짜를 함께 쓴다 */
function raceKey(date: GameDate, raceId: RaceId): string {
  return `${date.year}/${date.week}/${raceId}`;
}

/** 지난해 레이스의 등급. 등급 있는 레이스는 퍼포먼스 기록이 모든 출주마에 남는다 */
function gradeMapOf(state: GameState, year: number): Map<string, RaceGrade> {
  const grades = new Map<string, RaceGrade>();
  for (const entries of Object.values(state.seasonState.performances)) {
    for (const entry of entries) {
      if (entry.date.year !== year || entry.grade === null) continue;
      grades.set(raceKey(entry.date, entry.raceId), entry.grade);
    }
  }
  return grades;
}

/** 지난해 race_run 이벤트: 레이스마다 플레이어 말 목록. 로그가 잘려 없으면 빈 맵 */
function playerRunsByRace(events: readonly GameEvent[], year: number): Map<string, Set<HorseId>> {
  const byRace = new Map<string, Set<HorseId>>();
  for (const event of events) {
    if (event.type !== 'race_run' || event.date.year !== year) continue;
    byRace.set(raceKey(event.date, event.raceId), new Set(event.playerHorseIds));
  }
  return byRace;
}

/** 지난해 플레이어 출주 목록. 이벤트가 있는 레이스는 이벤트 기록을, 없는 레이스는 현재 소유 여부를 본다 */
function collectPlayerRuns(state: GameState, year: number, owned: ReadonlySet<HorseId>): PlayerRun[] {
  const grades = gradeMapOf(state, year);
  const eventRuns = playerRunsByRace(state.eventLog, year);
  const runs: PlayerRun[] = [];
  for (const result of state.raceResults) {
    if (result.date.year !== year) continue;
    const key = raceKey(result.date, result.raceId);
    const eventHorses = eventRuns.get(key);
    for (const runner of result.runners) {
      const isPlayer = eventHorses !== undefined ? eventHorses.has(runner.horseId) : owned.has(runner.horseId);
      if (!isPlayer) continue;
      runs.push({
        date: result.date,
        raceId: result.raceId,
        racecourseId: result.racecourseId,
        distance: result.distance,
        horseId: runner.horseId,
        position: runner.position,
        grade: grades.get(key) ?? null,
      });
    }
  }
  return runs;
}

function positionKo(position: number): string {
  return `${position}착`;
}

function nameOf(state: GameState, horseId: HorseId): string {
  const horse = state.horses[horseId];
  return horse === undefined ? horseId : displayName(state, horse);
}

function ownerNameOf(state: GameState, ownerId: OwnerId): string {
  return state.owners[ownerId]?.name ?? ownerId;
}

/** 최고 성적 레이스: 등급 높은 순, 그다음 착순 좋은 순. 같으면 먼저 나온 기록 */
function bestRun(runs: readonly PlayerRun[]): PlayerRun | null {
  let best: PlayerRun | null = null;
  for (const run of runs) {
    if (best === null || betterRun(run, best)) best = run;
  }
  return best;
}

function betterRun(a: PlayerRun, b: PlayerRun): boolean {
  const rankA = a.grade === null ? UNGRADED_RANK : GRADE_RANK[a.grade];
  const rankB = b.grade === null ? UNGRADED_RANK : GRADE_RANK[b.grade];
  if (rankA !== rankB) return rankA < rankB;
  return a.position < b.position;
}

function bestRunLine(state: GameState, run: PlayerRun, courses: ReadonlyMap<RacecourseId, string>): string {
  const course = courses.get(run.racecourseId) ?? run.racecourseId;
  const grade = run.grade === null ? UNGRADED_KO : GRADE_KO[run.grade];
  return `${formatDateKo(run.date)} · ${course} ${run.distance}m · ${grade} ${positionKo(run.position)} · ${nameOf(state, run.horseId)}`;
}

/** 지난해 플레이어 말의 최고 레이팅 말(문구만, 숫자 없음). 기록이 없으면 null */
function topRatedHorse(state: GameState, year: number, owned: ReadonlySet<HorseId>): { horseId: HorseId; or: number } | null {
  let top: { horseId: HorseId; or: number } | null = null;
  for (const horseId of [...owned].sort()) {
    for (const change of state.seasonState.ratingHistory[horseId] ?? []) {
      if (change.date.year !== year) continue;
      if (top === null || change.to > top.or) top = { horseId, or: change.to };
    }
  }
  return top;
}

function racingCard(state: GameState, year: number, owned: ReadonlySet<HorseId>): YearReviewCard {
  const runs = collectPlayerRuns(state, year, owned);
  const starts = runs.length;
  const wins = runs.filter((run) => run.position === 1).length;
  const placed = runs.filter((run) => run.position <= PLACE_LAST).length;
  const group = runs.filter((run) => run.grade === 'G1' || run.grade === 'G2' || run.grade === 'G3');
  const listed = runs.filter((run) => run.grade === 'L');
  const groupWins = group.filter((run) => run.position === 1).length;
  const groupPlaced = group.filter((run) => run.position <= PLACE_LAST).length;
  const listedWins = listed.filter((run) => run.position === 1).length;
  const listedPlaced = listed.filter((run) => run.position <= PLACE_LAST).length;
  const prize = state.economy.currentYear.player.prize ?? 0;

  const courses = new Map(getRacecourses().map((course) => [course.id, course.name] as const));
  const best = bestRun(runs);
  const top = topRatedHorse(state, year, owned);

  return {
    key: 'racing',
    titleKo: '경주',
    rows: [
      { label: '출주', value: `${starts}회 · ${wins}승 · 입상 ${placed}회` },
      { label: '그룹·리스티드', value: `그룹 ${groupWins}승 · 입상 ${groupPlaced}회 / 리스티드 ${listedWins}승 · 입상 ${listedPlaced}회` },
      { label: '상금 합계', value: feeKo(prize) },
      { label: '최고 성적 레이스', value: best === null ? '출주 기록 없음' : bestRunLine(state, best, courses) },
      { label: '올해 최고 레이팅 말', value: top === null ? '레이팅 기록 없음' : `${nameOf(state, top.horseId)} · ${ratingHintKo(top.or)}` },
    ],
    notices: starts === 0 ? ['올해는 출주한 말이 없었습니다.'] : [],
  };
}

function tradeCard(state: GameState, year: number): YearReviewCard {
  const ledger: LedgerEntry[] = state.economy.playerLedger.filter((entry) => entry.date.year === year);
  const births = Object.values(state.horses).filter((horse) => horse.birthYear === year && horse.breederId === state.playerOwnerId).length;
  const sold = ledger.filter((entry) => SALE_INCOME.has(entry.category) || (entry.category === PRIVATE_TRADE && entry.amount > 0));
  const bought = ledger.filter((entry) => entry.category === PURCHASE_EXPENSE || (entry.category === PRIVATE_TRADE && entry.amount < 0));
  const soldTotal = sumOf(sold);
  const boughtTotal = -sumOf(bought);
  return {
    key: 'trade',
    titleKo: '생산·거래',
    rows: [
      { label: '출산', value: `${births}두` },
      { label: '판매', value: `${sold.length}두 · ${feeKo(soldTotal)}` },
      { label: '구매', value: `${bought.length}두 · ${feeKo(boughtTotal)}` },
    ],
    notices: [],
  };
}

function sumOf(entries: readonly LedgerEntry[]): Money {
  let total = 0;
  for (const entry of entries) total += entry.amount;
  return total;
}

function financeCard(state: GameState, year: number): YearReviewCard {
  const totals = state.economy.currentYear.player;
  let income = 0;
  let expense = 0;
  for (const amount of Object.values(totals)) {
    if (amount === undefined) continue;
    if (amount > 0) income += amount;
    else expense -= amount;
  }
  const net = income - expense;
  const player = state.owners[state.playerOwnerId];
  const endFunds = player?.funds ?? 0;
  const startFunds = state.economy.yearSummaries.find((s) => s.year === year - 1)?.playerFunds;
  const debt = state.economy.debt;

  const rows: YearReviewRow[] = [
    { label: '수입', value: feeKo(income) },
    { label: '지출', value: feeKo(expense) },
    { label: '순손익', value: net >= 0 ? `흑자 ${feeKo(net)}` : `적자 ${feeKo(-net)}` },
    {
      label: '자금',
      value: startFunds === undefined ? `연말 ${feeKo(endFunds)}` : `연초 ${feeKo(startFunds)} → 연말 ${feeKo(endFunds)}`,
    },
  ];
  const notices: string[] = [];
  if (debt > 0) {
    rows.push({ label: '빚', value: feeKo(debt) });
    notices.push(`빚 ${feeKo(debt)}이 남아 있습니다.`);
  }
  return { key: 'finance', titleKo: '경영', rows, notices };
}

function momentsCard(state: GameState, year: number): YearReviewCard {
  const entries: ChronicleEntry[] = (state.chronicle ?? []).filter((entry) => entry.date.year === year && entry.player);
  // 우선순위가 높은 순으로 고르고, 고른 항목은 기록 순서(배열 순서)대로 보인다
  const picked = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => MOMENT_PRIORITY[a.entry.kind] - MOMENT_PRIORITY[b.entry.kind] || a.index - b.index)
    .slice(0, REVIEW_MOMENT_LIMIT)
    .sort((a, b) => a.index - b.index)
    .map((row) => row.entry);
  const rows: YearReviewRow[] = picked.map((entry) => {
    const text = chronicleKo(entry, (id) => nameOf(state, id), (id) => ownerNameOf(state, id));
    return { label: chronicleTagOf(entry.kind).label, value: chronicleBodyKo(entry.kind, text) };
  });
  return {
    key: 'moments',
    titleKo: '주요 순간',
    rows,
    notices: picked.length === 0 ? ['올해 기록된 순간이 없습니다.'] : [],
  };
}

function nextCard(state: GameState, owned: ReadonlySet<HorseId>): YearReviewCard {
  const next = state.date.year;
  const bookedMares = Object.values(state.mares).filter((mare) =>
    mare.bookedFor?.season === next && owned.has(mare.horseId)).length;
  const twoYearOlds = [...owned].filter((id) => {
    const horse = state.horses[id];
    return horse !== undefined && next - horse.birthYear === TWO_YEAR_OLD;
  }).length;
  const firstSale = [...getSalesData().events]
    .filter((event) => announceWeekOf(event) >= state.date.week)
    .sort((a, b) => announceWeekOf(a) - announceWeekOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  return {
    key: 'next',
    titleKo: '내년 준비',
    rows: [
      { label: '교배 예약', value: `${bookedMares}두 (${next}년 시즌)` },
      { label: '2세가 되는 말', value: `${twoYearOlds}두` },
      {
        label: '첫 세일',
        value: firstSale === undefined ? '발표 일정 없음' : `${firstSale.name} · ${saleAnnounceKo(next, next, announceWeekOf(firstSale))}`,
      },
    ],
    notices: [],
  };
}

/**
 * 연말 정산 화면 위의 '한 해 돌아보기'. state.date.year 가 맞이하는 새해이고, 돌아보는 해는 그 전 해다.
 * 상태를 바꾸지 않는다.
 */
export function yearReviewView(state: GameState): YearReviewView {
  const year = state.date.year - 1;
  const owned = new Set<HorseId>(
    Object.values(state.horses).filter((horse) => horse.ownerId === state.playerOwnerId).map((horse) => horse.id),
  );
  return {
    year,
    titleKo: `${year}년 돌아보기`,
    cards: [
      racingCard(state, year, owned),
      tradeCard(state, year),
      financeCard(state, year),
      momentsCard(state, year),
      nextCard(state, owned),
    ],
  };
}
