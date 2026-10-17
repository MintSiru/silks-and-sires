import { metersKo } from '../stable/stableView';
import { getRaceTemplates, getSalesData } from '../../engine/data/staticData';
import { bookingSeasonOf } from '../../engine/breeding/season';
import { displayName } from '../../engine/naming/register';
import { saleWeekOf } from '../../engine/sales/bidding';
import { yearEndPending } from '../../engine/stud/yearEnd';
import { autoTrainingCandidates } from '../../engine/season/autoTraining';
import { formatDateKo, weeksBetween } from '../../engine/time/calendar';
import type { GameEvent, GameState, HorseId, Race } from '../../engine/types';
import { recentResults, type RecentResultView } from '../season/seasonView';
import type { HorseTab } from '../horse/HorseLink';
import { eventInvolvesHorse } from '../horse/horseDetailView';
import { racePlanRows } from '../season/racePlanView';

/** 등급 배지 글자: G1·G2·G3·L 은 그대로, 등급 없는 레이스는 '클래스 N'(회색 배지) */
function gradeTextOf(race: Pick<Race, 'grade' | 'raceClass'>): string {
  return race.grade ?? `클래스 ${race.raceClass}`;
}

export interface HomeTask {
  id: string;
  label: string;
  screen: 'horse' | 'yearEnd' | 'sales';
  horseId?: string;
  horseTab?: HorseTab;
}

/** 홈 '최근 이벤트'에 올리는 사건 종류(B2). 출주 신청·레이스 결과는 '최근 결과' 칸이 맡으므로 뺀다. */
const HOME_EVENT_TYPES: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  // 부상
  'horse_injured',
  'injury_diagnosed',
  'horse_fatally_injured',
  // 출산
  'foal_born',
  // 세일 낙찰·판매(sale_lot_result 는 buyer·vendor 만 — isHomeEvent)
  'sale_lot_result',
  'horse_sold',
  'nh_store_sold',
  // 목표 달성·연대기급
  'sire_line_established',
  'female_family_established',
  'series_completed',
]);

export function homeTasks(state: GameState): HomeTask[] {
  const tasks: HomeTask[] = [];
  if (yearEndPending(state))
    tasks.push({ id: 'yearEnd', label: '연말 정산을 제출하세요', screen: 'yearEnd' });
  // 판매 제안(M6-0b2): 검토 대기 제안이 있으면 세일 메뉴로. 빼지 않으면 마감 전 주에 위탁된다.
  const sellCount = (state.sales.sellProposals ?? []).filter(
    (p) => p.status === 'proposed' && state.horses[p.horseId]?.ownerId === state.playerOwnerId,
  ).length;
  if (sellCount > 0)
    tasks.push({ id: 'sell-proposals', label: `판매 제안 ${sellCount}두 — 세일에서 검토`, screen: 'sales' });
  if (state.settings.autoSendToTraining === false) {
    for (const horse of autoTrainingCandidates(state)) {
      tasks.push({ id: `training:${horse.id}`, label: `${displayName(state, horse)} · 조교사에게 맡기기`,
        screen: 'horse', horseId: horse.id });
    }
  }
  for (const h of Object.values(state.horses).filter(
    (h) => h.ownerId === state.playerOwnerId && !['dead', 'historical'].includes(h.status),
  )) {
    const name = displayName(state, h);
    const count = (state.seasonState.racePlans?.[h.id] ?? []).filter(
      (p) => p.status === 'proposed',
    ).length;
    if (count && state.settings.autoApproveRacePlans === false)
      tasks.push({
        id: `plan:${h.id}`,
        label: `${name} · 출주 계획 제안 ${count}건 검토`,
        screen: 'horse',
        horseId: h.id,
        horseTab: 'plan',
      });
    if (h.nameRegistered === false)
      tasks.push({
        id: `name:${h.id}`,
        label: `${name} · 이름 짓기`,
        screen: 'horse',
        horseId: h.id,
      });
    if (
      h.condition.injury &&
      (h.condition.injury.diagnosed === false || h.condition.injury.treatment == null)
    ) {
      tasks.push({
        id: `injury:${h.id}`,
        label: `${name} · 부상 진단·치료 결정`,
        screen: 'horse',
        horseId: h.id,
      });
    }
  }
  for (const bid of state.sales.playerBids) {
    const event = getSalesData().events.find((e) => e.id === bid.saleId);
    const lot = state.sales.catalogues
      .find((c) => c.saleId === bid.saleId && c.year === bid.year && c.status === 'catalogued')
      ?.lots.find((l) => l.lotNo === bid.lotNo);
    if (!event || !lot || lot.result !== null) continue;
    const date = saleWeekOf(event, bid.year, lot);
    const remaining = weeksBetween(state.date, date);
    if (remaining >= 0 && remaining <= 1)
      tasks.push({
        id: `bid:${bid.saleId}:${bid.year}:${bid.lotNo}`,
        label: `${event.name} · ${bid.lotNo}번 입찰 마감 ${formatDateKo(date)}`,
        screen: 'sales',
      });
  }
  return tasks;
}

/** '다음 진행 때 자동으로 일어날 일' 한 줄(B3). 할 일이 없을 때 홈 브리핑 카드에 보인다. */
export interface BriefingItem {
  id: 'races' | 'matings' | 'sales';
  label: string;
  count: number;
  /** 화면 문구: '2건', '1두', 0 이면 '없음' */
  text: string;
  /** 한 줄 설명 */
  detail: string;
}

function briefingItem(
  id: BriefingItem['id'],
  label: string,
  count: number,
  unit: '건' | '두',
  detail: string,
): BriefingItem {
  return { id, label, count, text: count === 0 ? '없음' : `${count}${unit}`, detail };
}

/** 다음 진행 때 자동으로 처리되는 일의 개수: 출주 계획·교배 예약·판매 위탁(내 말만) */
export function briefingItems(state: GameState): BriefingItem[] {
  const owned = (horseId: HorseId) => state.horses[horseId]?.ownerId === state.playerOwnerId;
  const racePlanCount = Object.entries(state.seasonState.racePlans ?? {})
    .filter(([horseId]) => owned(horseId))
    .flatMap(([, plans]) => plans)
    .filter(
      (p) =>
        (p.status === 'proposed' || p.status === 'approved') &&
        weeksBetween(state.date, p.date) >= 0 &&
        weeksBetween(state.date, p.date) <= 1,
    ).length;
  const bookingSeason = bookingSeasonOf(state.date);
  const matingCount = bookingSeason === null
    ? 0
    : (state.stud.matingProposals ?? []).filter(
      (p) => p.season === bookingSeason && (p.status === 'proposed' || p.status === 'approved') && owned(p.mareId),
    ).length;
  const sellCount = (state.sales.sellProposals ?? []).filter(
    (p) => p.status === 'proposed' && owned(p.horseId),
  ).length;
  return [
    briefingItem('races', '출주 예정', racePlanCount, '건', '이번 주·다음 주 출주 계획'),
    briefingItem('matings', '교배 예약 예정', matingCount, '두', '이번 시즌 교배 제안 중 예약 전 암말'),
    briefingItem('sales', '판매 위탁 예정', sellCount, '두', '판매 제안 중 세일 위탁 전 말'),
  ];
}

/** 최근 결과 한 줄(내 말 관점). 같은 레이스에 내 말이 둘이면 말마다 한 줄 */
export interface HomeResultRow {
  key: string;
  horseId: HorseId;
  horseName: string;
  /** 착순(1부터) */
  position: number;
  /** 출주 두수(착순 배지 '5착/11') */
  fieldSize: number;
  dateLabel: string;
  raceName: string;
  /** 등급(G1·G2·G3·L). 등급 없는 레이스는 null */
  grade: string | null;
  winnerName: string;
}

/** 레이스 등급: 다시보기 목록 → 고정 일정 목록 순으로 찾는다(seasonView 의 raceInfoOf 와 같은 순서) */
function gradeOfRace(state: GameState, raceId: string): string | null {
  const replay = state.seasonState.replayable.find((r) => r.race.id === raceId);
  if (replay !== undefined) return replay.race.grade;
  return getRaceTemplates().find((t) => t.id === raceId)?.grade ?? null;
}

function homeResultRows(state: GameState, results: readonly RecentResultView[]): HomeResultRow[] {
  return results.flatMap((result) => {
    // recentResults 의 key 는 `${state.raceResults 순번}-${raceId}` 이다
    const raw = state.raceResults[Number(result.key.slice(0, result.key.indexOf('-')))];
    const fieldSize = raw?.runners.length ?? 0;
    const grade = raw === undefined ? null : gradeOfRace(state, raw.raceId);
    return result.playerRuns.map((run): HomeResultRow => ({
      key: `${result.key}:${run.horseId}`,
      horseId: run.horseId,
      horseName: run.name,
      position: run.position,
      fieldSize,
      dateLabel: result.dateLabel,
      raceName: result.raceName,
      grade,
      winnerName: result.winnerName,
    }));
  });
}

/** 홈 최근 이벤트 대상인지: 종류 목록 + 판매·보유 관계 조건 */
function isHomeEvent(state: GameState, event: GameEvent, owned: readonly HorseId[]): boolean {
  if (!HOME_EVENT_TYPES.has(event.type)) return false;
  switch (event.type) {
    case 'sale_lot_result':
      return event.role === 'buyer' || event.role === 'vendor';
    case 'horse_sold':
      return event.fromOwnerId === state.playerOwnerId || event.toOwnerId === state.playerOwnerId;
    case 'nh_store_sold':
      return true;
    default:
      return owned.some((id) => eventInvolvesHorse(event, id));
  }
}

/** '출주 예정' 카드 한 줄. 등급·거리는 조건 목표(레이스 미정)면 null */
export interface HomeEntry {
  key: string;
  horseId: HorseId;
  weekLabel: string;
  raceName: string;
  /** 등급 배지 글자(G1·L·클래스 N). 레이스가 정해지지 않았으면 null */
  gradeText: string | null;
  /** 거리 문구(예: 2,012m). 레이스가 정해지지 않았으면 null */
  distanceText: string | null;
  statusLabel: string;
}

export function homeView(state: GameState) {
  const ownedIds = Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId)
    .map((h) => h.id);
  const owned = new Set(ownedIds);
  const results = recentResults(state, state.raceResults.length);
  const entries: HomeEntry[] = state.seasonState.meetings
    .filter((m) => weeksBetween(state.date, m.date) >= 0 && weeksBetween(state.date, m.date) <= 1)
    .flatMap((m) =>
      m.races
        .filter((r) => r.status !== 'run' && r.status !== 'abandoned')
        .flatMap((r) =>
          r.declarations
            .filter((d) => d.isPlayer && owned.has(d.horseId))
            .map((d): HomeEntry => ({
              key: `${m.date.year}:${m.date.week}:${d.horseId}`,
              horseId: d.horseId,
              weekLabel: weeksBetween(state.date, m.date) === 0 ? '이번 주' : '다음 주',
              raceName: r.race.name,
              gradeText: gradeTextOf(r.race),
              distanceText: metersKo(r.race.distance),
              statusLabel: '출주 신청됨',
            })),
        ),
    );
  for (const horseId of owned) {
    const plans = (state.seasonState.racePlans?.[horseId] ?? []).filter(
      (p) =>
        ['proposed', 'approved', 'declared'].includes(p.status) &&
        weeksBetween(state.date, p.date) >= 0 &&
        weeksBetween(state.date, p.date) <= 1,
    );
    for (const plan of plans) {
      const key = `${plan.date.year}:${plan.date.week}:${horseId}`;
      if (entries.some((e) => e.key === key)) continue;
      const horse = state.horses[horseId]!;
      const row = racePlanRows([plan], {
        requireApproval: state.settings.autoApproveRacePlans === false,
        country:
          (horse.trainerId === null ? undefined : state.trainers[horse.trainerId]?.country) ??
          horse.countryOfBirth,
      })[0]!;
      // 레이스가 정해진 계획만 등급·거리를 단다(조건 목표는 조건 문구만 — 마구간 다음 출주와 같다)
      const template =
        plan.templateId === null ? undefined : getRaceTemplates().find((t) => t.id === plan.templateId);
      entries.push({
        key,
        horseId,
        weekLabel: weeksBetween(state.date, plan.date) === 0 ? '이번 주' : '다음 주',
        raceName: `${template === undefined ? row.name : template.name}${row.away}`,
        gradeText: template === undefined ? null : gradeTextOf(template),
        distanceText: template === undefined ? null : metersKo(template.distance),
        statusLabel: row.statusLabel,
      });
    }
  }
  entries.sort(
    (a, b) =>
      (a.weekLabel === '이번 주' ? 0 : 1) - (b.weekLabel === '이번 주' ? 0 : 1) ||
      a.key.localeCompare(b.key),
  );
  const playedResults = results.filter((r) => r.playerRuns.length > 0).slice(0, 3);
  return {
    tasks: homeTasks(state),
    briefing: briefingItems(state),
    entries,
    results: playedResults,
    resultRows: homeResultRows(state, playedResults),
    majorResult: results.find((r) => r.playerRuns.length === 0) ?? null,
    events: state.eventLog
      .filter((e) => isHomeEvent(state, e, ownedIds))
      .slice(-5)
      .reverse(),
  };
}
