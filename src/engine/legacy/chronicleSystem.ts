import { CEREMONY_EUROPE_TOP, CEREMONY_REPUTATION } from '../config/legacy';
import { adjustReputation } from '../economy/relations';
import type { SeasonStaticData } from '../season/system';
import type { SalesStaticData } from '../sales/system';
import type { ChronicleEntry, GameDate, GameState, HorseId, LeadingTop, WeeklySystem } from '../types';
import { appendChronicle, hasChronicle } from './chronicle';

export type ChronicleStaticData = Pick<SeasonStaticData, 'templates'> & SalesStaticData;
type Entry = Omit<ChronicleEntry, 'id'>;

function playerHorse(state: GameState, horseId: HorseId): boolean {
  const horse = state.horses[horseId];
  return horse !== undefined && (horse.ownerId === state.playerOwnerId || horse.breederId === state.playerOwnerId);
}

/** 고정 일정 raceId는 매년 재사용된다. 같은 종류라도 날짜·부문·대상이 다르면 별개 사건이다. */
function record(draft: GameState, entry: Entry): boolean {
  if (hasChronicle(draft, entry.kind, entry.horseId, entry.raceId)
    && (draft.chronicle ?? []).some((e) => e.kind === entry.kind && e.horseId === entry.horseId
      && e.raceId === entry.raceId && e.date.year === entry.date.year && e.date.week === entry.date.week
      && e.label === entry.label && e.ownerId === entry.ownerId)) return false;
  appendChronicle(draft, entry);
  return true;
}

function raceRecords(draft: GameState, date: GameDate, data: ChronicleStaticData): void {
  const templates = new Map(data.templates.map((t) => [t.id, t]));
  for (const result of draft.raceResults) {
    if (result.date.year !== date.year || result.date.week !== date.week) continue;
    const template = templates.get(result.raceId);
    for (const runner of result.runners) {
      const horse = draft.horses[runner.horseId];
      if (horse === undefined) continue;
      const entry = { date: result.date, player: true, horseId: horse.id, raceId: result.raceId };
      if (horse.ownerId === draft.playerOwnerId) {
        if (!hasChronicle(draft, 'first_runner')) appendChronicle(draft, { ...entry, kind: 'first_runner' });
        if (runner.position === 1 && !hasChronicle(draft, 'first_win')) {
          appendChronicle(draft, { ...entry, kind: 'first_win' });
        }
      }
      if (runner.position !== 1 || template === undefined) continue;
      const related = playerHorse(draft, horse.id);
      const isGroup = template.grade === 'G1' || template.grade === 'G2' || template.grade === 'G3';
      const details = { ...entry, templateId: template.id, label: template.name };
      if (related && isGroup) {
        if (horse.ownerId === draft.playerOwnerId && !hasChronicle(draft, 'first_group_win')) {
          appendChronicle(draft, { ...details, kind: 'first_group_win' });
        }
        record(draft, { ...details, kind: 'group_win', count: horse.record.groupWins });
        if (template.grade === 'G1') record(draft, { ...details, kind: 'g1_win' });
      }
      if (template.tags.includes('classic')) {
        record(draft, { ...details, player: related, kind: related ? 'classic_win' : 'world_classic' });
      }
    }
  }
}

function leadingRecords(draft: GameState, tables: LeadingTop, scope: string, date: GameDate): number {
  let reward = 0;
  const occurrences = new Map<string, number>();
  for (const category of ['owner', 'breeder', 'sire'] as const) {
    const limit = scope === 'europe' ? CEREMONY_EUROPE_TOP : 1;
    for (const [index, entry] of tables[category].slice(0, limit).entries()) {
      const related = category === 'sire' ? playerHorse(draft, entry.id) : entry.id === draft.playerOwnerId;
      if (!related) continue;
      const title: Entry = { kind: 'leading_title', date, player: true, label: `${scope}:${index + 1}`,
        ownerId: category === 'sire' ? undefined : entry.id,
        horseId: category === 'sire' ? entry.id : undefined };
      // 마주와 생산자는 같은 id·순위일 수 있다. 타입·label을 바꾸지 않고 수상 항목 수만큼
      // 기록한다. 같은 스냅샷 재실행 시 기존 동일 항목의 개수로 중복을 막는다.
      const key = `${title.ownerId ?? ''}:${title.horseId ?? ''}:${title.label}`;
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      const recorded = (draft.chronicle ?? []).filter((e) => e.kind === title.kind && e.label === title.label
        && e.ownerId === title.ownerId && e.horseId === title.horseId && e.date.year === date.year).length;
      if (recorded < occurrence) {
        appendChronicle(draft, title);
        reward += scope !== 'europe' ? CEREMONY_REPUTATION.countryFirst
          : index === 0 ? CEREMONY_REPUTATION.europeFirst : CEREMONY_REPUTATION.europePlaced;
      }
    }
  }
  return reward;
}

function ceremony(draft: GameState, date: GameDate): void {
  // WeekContext에는 앞선 시스템의 이벤트가 없다. season이 awards_announced를 내는 바로 그 주의
  // 확정 스냅샷을 읽는다. 재호출 시 이미 기록된 항목에는 보상을 더하지 않는다.
  if (date.week !== 1) return;
  const awards = draft.awardsHistory.find((a) => a.year === date.year - 1);
  if (awards === undefined) return;
  const rewardOf = (entry: ChronicleEntry): number => {
    if (entry.kind === 'laurel_award') return entry.label === 'horse_of_the_year'
      ? CEREMONY_REPUTATION.horseOfTheYear : CEREMONY_REPUTATION.laurel;
    if (entry.kind === 'series_champion') return CEREMONY_REPUTATION.series;
    if (entry.kind === 'leading_title') return entry.label === 'europe:1' ? CEREMONY_REPUTATION.europeFirst
      : entry.label?.startsWith('europe:') ? CEREMONY_REPUTATION.europePlaced : CEREMONY_REPUTATION.countryFirst;
    return 0;
  };
  const previousReward = (draft.chronicle ?? []).filter((e) => e.player && e.date.year === date.year)
    .reduce((sum, e) => sum + rewardOf(e), 0);
  let reward = 0;
  for (const [category, horseId] of Object.entries(awards.laurel)) {
    if (horseId === null || !playerHorse(draft, horseId)) continue;
    if (record(draft, { kind: 'laurel_award', date, player: true, horseId, label: category })) {
      reward += category === 'horse_of_the_year' ? CEREMONY_REPUTATION.horseOfTheYear : CEREMONY_REPUTATION.laurel;
    }
  }
  reward += leadingRecords(draft, awards.leading, 'europe', date);
  for (const scope of Object.keys(awards.leadingByCountry).sort() as (keyof typeof awards.leadingByCountry)[]) {
    const tables = awards.leadingByCountry[scope];
    if (tables !== undefined) reward += leadingRecords(draft, tables, scope, date);
  }
  for (const [seriesId, horseId] of Object.entries(awards.seriesChampions).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (playerHorse(draft, horseId)
      && record(draft, { kind: 'series_champion', date, player: true, horseId, label: seriesId })) {
      reward += CEREMONY_REPUTATION.series;
    }
  }
  adjustReputation(draft, Math.min(reward, Math.max(0, CEREMONY_REPUTATION.annualCap - previousReward)));
}

function stallionRecords(draft: GameState, date: GameDate): void {
  for (const id of Object.keys(draft.stallions).sort()) {
    if (draft.horses[id]?.breederId !== draft.playerOwnerId || hasChronicle(draft, 'homebred_stallion', id)) continue;
    appendChronicle(draft, { kind: 'homebred_stallion', date, player: true, horseId: id });
  }
}

function saleRecords(draft: GameState, date: GameDate, data: ChronicleStaticData): void {
  for (const catalogue of draft.sales.catalogues) {
    if (catalogue.status !== 'closed') continue;
    const sold = catalogue.lots.filter((lot) => lot.result?.kind === 'sold');
    const highest = sold.reduce((max, lot) => Math.max(max, lot.result?.kind === 'sold' ? lot.result.price : 0), 0);
    for (const lot of sold) {
      const result = lot.result;
      if (result?.kind !== 'sold' || result.price !== highest) continue;
      if (result.buyerId !== draft.playerOwnerId && lot.vendor.id !== draft.playerOwnerId) continue;
      const label = data.sales?.events.find((e) => e.id === catalogue.saleId)?.name ?? catalogue.saleId;
      // 모든 북이 끝난 뒤 최고가 확정. 보존된 카탈로그를 다시 보더라도 한 번만 기록한다.
      if ((draft.chronicle ?? []).some((e) => e.kind === 'record_sale' && e.horseId === lot.horseId
        && e.label === label && e.date.year === catalogue.year)) continue;
      record(draft, { kind: 'record_sale', date: { year: catalogue.year, week: date.week }, player: true,
        horseId: lot.horseId, label, amount: result.price, ownerId: result.buyerId });
    }
  }
}

/** season·sales 뒤에 등록한다. 난수·legacy 쓰기·내부 상태를 사용하지 않는다. */
export function createChronicleSystem(data: ChronicleStaticData): WeeklySystem {
  return {
    id: 'chronicle',
    run(draft, ctx) {
      raceRecords(draft, ctx.date, data);
      ceremony(draft, ctx.date);
      stallionRecords(draft, ctx.date);
      saleRecords(draft, ctx.date, data);
      return [];
    },
  };
}
