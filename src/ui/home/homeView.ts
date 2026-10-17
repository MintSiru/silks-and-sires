import { getSalesData } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import { saleWeekOf } from '../../engine/sales/bidding';
import { yearEndPending } from '../../engine/stud/yearEnd';
import { autoTrainingCandidates } from '../../engine/season/autoTraining';
import { formatDateKo, weeksBetween } from '../../engine/time/calendar';
import type { GameState } from '../../engine/types';
import { recentResults } from '../season/seasonView';
import type { HorseTab } from '../horse/HorseLink';
import { eventInvolvesHorse } from '../horse/horseDetailView';
import { racePlanRows } from '../season/racePlanView';
export interface HomeTask {
  id: string;
  label: string;
  screen: 'horse' | 'yearEnd' | 'sales';
  horseId?: string;
  horseTab?: HorseTab;
}
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
export function homeView(state: GameState) {
  const ownedIds = Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId)
    .map((h) => h.id);
  const owned = new Set(ownedIds);
  const results = recentResults(state, state.raceResults.length);
  const entries = state.seasonState.meetings
    .filter((m) => weeksBetween(state.date, m.date) >= 0 && weeksBetween(state.date, m.date) <= 1)
    .flatMap((m) =>
      m.races
        .filter((r) => r.status !== 'run' && r.status !== 'abandoned')
        .flatMap((r) =>
          r.declarations
            .filter((d) => d.isPlayer && owned.has(d.horseId))
            .map((d) => ({
              key: `${m.date.year}:${m.date.week}:${d.horseId}`,
              horseId: d.horseId,
              weekLabel: weeksBetween(state.date, m.date) === 0 ? '이번 주' : '다음 주',
              raceName: r.race.name,
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
      entries.push({
        key,
        horseId,
        weekLabel: weeksBetween(state.date, plan.date) === 0 ? '이번 주' : '다음 주',
        raceName: `${row.name}${row.away}`,
        statusLabel: row.statusLabel,
      });
    }
  }
  entries.sort(
    (a, b) =>
      (a.weekLabel === '이번 주' ? 0 : 1) - (b.weekLabel === '이번 주' ? 0 : 1) ||
      a.key.localeCompare(b.key),
  );
  return {
    tasks: homeTasks(state),
    entries,
    results: results.filter((r) => r.playerRuns.length > 0).slice(0, 3),
    majorResult: results.find((r) => r.playerRuns.length === 0) ?? null,
    events: state.eventLog
      .filter(
        (e) =>
          ownedIds.some((id) => eventInvolvesHorse(e, id)) ||
          (e.type === 'horse_sold' &&
            (e.fromOwnerId === state.playerOwnerId || e.toOwnerId === state.playerOwnerId)),
      )
      .slice(-5)
      .reverse(),
  };
}
