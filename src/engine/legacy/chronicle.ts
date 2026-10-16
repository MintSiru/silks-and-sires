import { CHRONICLE_WORLD_YEARS } from '../config/legacy';
import type { ChronicleEntry, GameState } from '../types';

/**
 * 연대기에 한 줄을 더한다(draft 를 직접 바꾼다 — 주간 시스템 안에서 호출). id 는 그해 순번으로 붙인다.
 * 세계 항목(player=false)은 CHRONICLE_WORLD_YEARS 보다 오래된 것을 지운다. 난수를 쓰지 않는다.
 */
export function appendChronicle(draft: GameState, entry: Omit<ChronicleEntry, 'id'>): ChronicleEntry {
  const chronicle = (draft.chronicle ??= []);
  const year = entry.date.year;
  const seq = chronicle.filter((e) => e.date.year === year).length + 1;
  const added: ChronicleEntry = { ...entry, date: { ...entry.date }, id: `${year}-${seq}` };
  chronicle.push(added);
  const oldest = year - CHRONICLE_WORLD_YEARS;
  if (chronicle.some((e) => !e.player && e.date.year < oldest)) {
    draft.chronicle = chronicle.filter((e) => e.player || e.date.year >= oldest);
  }
  return added;
}

/** 이 kind·말(·레이스) 항목이 이미 있는지(같은 사건을 두 번 적지 않게) */
export function hasChronicle(state: GameState, kind: ChronicleEntry['kind'], horseId?: string, raceId?: string): boolean {
  return (state.chronicle ?? []).some((e) => e.kind === kind
    && (horseId === undefined || e.horseId === horseId) && (raceId === undefined || e.raceId === raceId));
}
