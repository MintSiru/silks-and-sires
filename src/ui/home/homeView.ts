import { getSalesData } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import { saleWeekOf } from '../../engine/sales/bidding';
import { yearEndPending } from '../../engine/stud/yearEnd';
import { formatDateKo, weeksBetween } from '../../engine/time/calendar';
import type { GameState } from '../../engine/types';
import { recentResults } from '../season/seasonView';
import type { HorseTab } from '../horse/HorseLink';
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
  for (const h of Object.values(state.horses).filter(
    (h) => h.ownerId === state.playerOwnerId && !['dead', 'historical'].includes(h.status),
  )) {
    const name = displayName(state, h);
    const count = (state.seasonState.racePlans?.[h.id] ?? []).filter((p) => p.status === 'proposed').length;
    if (count)
      tasks.push({
        id: `plan:${h.id}`,
        label: `${name} · 출주 계획 제안 ${count}건 검토`,
        screen: 'horse',
        horseId: h.id,
        horseTab: 'plan',
      });
    if (h.nameRegistered === false)
      tasks.push({ id: `name:${h.id}`, label: `${name} · 이름 짓기`, screen: 'horse', horseId: h.id });
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
  return {
    tasks: homeTasks(state),
    entries: state.seasonState.meetings
      .filter((m) => m.date.year === state.date.year && m.date.week === state.date.week)
      .flatMap((m) =>
        m.races
          .filter((r) => r.status !== 'run' && r.status !== 'abandoned')
          .flatMap((r) =>
            r.declarations
              .filter((d) => d.isPlayer)
              .map((d) => ({
                key: `${m.id}:${r.race.id}:${d.horseId}`,
                horseId: d.horseId,
                raceName: r.race.name,
              })),
          ),
      ),
    results: recentResults(state, 3),
    events: state.eventLog
      .filter((e) => e.type !== 'week_started')
      .slice(-5)
      .reverse(),
  };
}
