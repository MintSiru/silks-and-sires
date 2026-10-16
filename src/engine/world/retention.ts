import { WEEKS_PER_YEAR } from '../config/game';
import { AI_TERMINAL_KEEP_YEARS, PEDIGREE_KEEP_GENERATIONS } from '../config/stability';
import { POPULATION_RETIRE_AGE } from '../config/population';
import { tallyRemovedFamilyWinners } from '../legacy/lines';
import type { GameState, Horse, WeeklySystem } from '../types';

function terminal(horse: Horse): boolean {
  return horse.status === 'retired' || horse.status === 'dead';
}

/** 종마 선발·판매가 끝난 뒤 AI 은퇴마를 은퇴 목장으로 보낸다. 플레이어 규칙은 유지한다. */
export function releaseAiRetirees(state: GameState): void {
  const released = new Set<string>();
  for (const horse of Object.values(state.horses)) {
    if (!terminal(horse) || horse.ownerId === null || horse.ownerId === state.playerOwnerId) continue;
    released.add(horse.id);
    horse.ownerId = null;
    horse.trainerId = null;
  }
  if (released.size === 0) return;
  for (const owner of Object.values(state.owners)) {
    if (!owner.isPlayer) owner.horseIds = owner.horseIds.filter((id) => !released.has(id));
  }
}

/**
 * 기존 스키마에는 은퇴 연도가 없다. AI 현역의 최종 은퇴 나이(8세)를 보수적인
 * 상한으로 쓰고, 마지막 출주·NH 판매·부상 종료·사망 중 더 늦은 날짜까지 기다린다.
 * 종마·번식 암말은 별도 참조로 영구 보호하므로 고령 번식 은퇴를 오인하지 않는다.
 */
function terminalYear(state: GameState, horse: Horse): number {
  return Math.max(horse.birthYear + POPULATION_RETIRE_AGE,
    horse.diedYear ?? 0, horse.nhSoldYear ?? 0,
    state.seasonState.lastRun[horse.id]?.year ?? 0,
    ...(horse.injuryHistory ?? []).map((r) => r.since.year + Math.ceil(r.weeks / WEEKS_PER_YEAR)));
}

/** 참조 수집은 ID 값과 키를 모두 본다. M5 선택 필드의 확장도 보수적으로 보호한다. */
function collectReferences(value: unknown, horses: GameState['horses'], roots: Set<string>): void {
  if (typeof value === 'string') {
    if (horses[value] !== undefined) roots.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, horses, roots);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (horses[key] !== undefined) roots.add(key);
      collectReferences(item, horses, roots);
    }
  }
}

/** 살아 있는 말·보존 기록과 5대 혈통에서 참조하지 않는 오래된 AI 기록만 지운다. */
export function pruneAiHorseRecords(state: GameState, year: number): string[] {
  const roots = new Set<string>();
  const candidates = new Set<string>();
  for (const horse of Object.values(state.horses)) {
    if (!terminal(horse) || horse.ownerId === state.playerOwnerId || horse.breederId === state.playerOwnerId
      || year - terminalYear(state, horse) <= AI_TERMINAL_KEEP_YEARS) roots.add(horse.id);
    else candidates.add(horse.id);
  }
  // 소유 목록과 계산용 이력은 참조 루트에서 제외하고 삭제 뒤 동기화한다.
  for (const [key, value] of Object.entries(state)) {
    if (['horses', 'owners', 'breeders', 'seasonState'].includes(key)) continue;
    collectReferences(value, state.horses, roots);
  }
  for (const [key, value] of Object.entries(state.seasonState)) {
    if (['ratingHistory', 'lastRun', 'unratedFigures'].includes(key)) continue;
    collectReferences(value, state.horses, roots);
  }

  const protectedIds = new Set(roots);
  let frontier = [...roots];
  for (let depth = 0; depth < PEDIGREE_KEEP_GENERATIONS; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const horse = state.horses[id];
      if (horse === undefined) continue;
      for (const parent of [horse.sireId, horse.damId, horse.virtualDam?.sireId, horse.familyId]) {
        if (parent == null || protectedIds.has(parent)) continue;
        protectedIds.add(parent);
        next.push(parent);
      }
    }
    frontier = next;
  }
  const removed = [...candidates].filter((id) => !protectedIds.has(id)).sort();
  const removedSet = new Set(removed);
  // 명문 모계 판정(M5-C)이 지워진 블랙타입 우승마를 계속 세도록 몫을 옮긴다.
  tallyRemovedFamilyWinners(state, removed);
  for (const id of removed) {
    delete state.horses[id];
    delete state.seasonState.ratingHistory[id];
    delete state.seasonState.lastRun[id];
    delete state.seasonState.unratedFigures[id];
  }
  for (const owner of Object.values(state.owners)) owner.horseIds = owner.horseIds.filter((id) => !removedSet.has(id));
  for (const breeder of Object.values(state.breeders)) breeder.horseIds = breeder.horseIds.filter((id) => !removedSet.has(id));
  return removed;
}

export function createRetentionSystem(): WeeklySystem {
  return { id: 'retention', run(draft, { date }) {
    releaseAiRetirees(draft);
    if (date.week === 1) pruneAiHorseRecords(draft, date.year);
    return [];
  } };
}
