import sireLines from '../../../data/stallions/sire_lines.json';
import { START_YEAR } from '../config/game';
import { getRaceTemplates } from '../data/staticData';
import {
  FAMILY_GENERATIONS,
  FAMILY_MIN_BLACK_TYPE_WINNERS,
  FAMILY_MIN_GROUP_WINNERS,
  LINE_MIN_FOUNDER_GROUP_WINNERS,
  LINE_MIN_STUD_SONS,
  LINE_MIN_TOTAL_GROUP_WINNERS,
} from '../config/legacy';
import type { EstablishedLine, FemaleFamily, GameEvent, GameState, Horse, HorseId, SireLine, SireLineId, WeeklySystem } from '../types';
import { appendChronicle } from './chronicle';

export interface LineCandidate {
  founderId: HorseId;
  sons: number;
  founderGroupWinners: number;
  groupWinners: number;
  eligible: boolean;
}

export interface FamilyCandidate {
  founderMareId: HorseId;
  blackTypeWinners: number;
  groupWinners: number;
  eligible: boolean;
}

/** 종마 레코드는 은퇴·사망·해외 판매 뒤에도 남는다. 현재 status 로 이력을 제한하지 않는다. */
export function lineCandidates(state: GameState): LineCandidate[] {
  const sonsBySire = new Map<HorseId, HorseId[]>();
  for (const id of Object.keys(state.stallions)) {
    const horse = state.horses[id];
    if (horse?.sex !== 'male' || horse.sireId === null) continue;
    const sons = sonsBySire.get(horse.sireId) ?? [];
    sons.push(id);
    sonsBySire.set(horse.sireId, sons);
  }
  const candidates: LineCandidate[] = [];
  for (const id of Object.keys(state.stallions).sort()) {
    const horse = state.horses[id];
    if (horse?.sex !== 'male' || horse.status === 'historical' || state.stallions[id]!.realKey !== null) continue;
    const sons = sonsBySire.get(id) ?? [];
    const founderGroupWinners = state.sireStats[id]?.groupWinners ?? 0;
    const groupWinners = sons.reduce((sum, son) => sum + (state.sireStats[son]?.groupWinners ?? 0), founderGroupWinners);
    candidates.push({ founderId: id, sons: sons.length, founderGroupWinners, groupWinners,
      eligible: sons.length >= LINE_MIN_STUD_SONS
        && founderGroupWinners >= LINE_MIN_FOUNDER_GROUP_WINNERS
        && groupWinners >= LINE_MIN_TOTAL_GROUP_WINNERS });
  }
  return candidates;
}

/**
 * 모계만 거슬러 최대 3대의 기초 암말에 각 우승마를 한 번씩 더한다. O(말 수 × 3 + 보존 결과).
 * 현재 공용 타입에는 통산 리스티드 우승 필드가 없다. 보존된 결과·시즌 기록으로 확인한 우승만 세며,
 * 이미 지워진 옛 리스티드 우승은 복원할 수 없다(입상 수 blackTypePlacings 로 추측하지 않는다).
 */
function listedWinnerIds(state: GameState): Set<HorseId> {
  const listedRaceIds = new Set(getRaceTemplates().filter((race) => race.grade === 'L').map((race) => race.id));
  const listedWinners = new Set<HorseId>();
  for (const result of state.raceResults) {
    if (!listedRaceIds.has(result.raceId)) continue;
    for (const runner of result.runners) {
      if (runner.position === 1) listedWinners.add(runner.horseId);
    }
  }
  return listedWinners;
}

function blackTypeOf(state: GameState, horse: Horse, listedWinners: Set<HorseId>): 'group' | 'listed' | null {
  if (horse.record.groupWins > 0) return 'group';
  return listedWinners.has(horse.id) || (state.seasonState.performances[horse.id] ?? [])
    .some((run) => run.grade !== null && run.position === 1) ? 'listed' : null;
}

/** 모계 3대 기초 암말 id(가까운 순). 순환 방지 */
function femaleAncestors(state: GameState, horse: Horse): HorseId[] {
  const out: HorseId[] = [];
  const seen = new Set<HorseId>([horse.id]);
  let damId = horse.damId;
  for (let generation = 0; generation < FAMILY_GENERATIONS && damId !== null && !seen.has(damId); generation++) {
    seen.add(damId);
    out.push(damId);
    damId = state.horses[damId]?.damId ?? null;
  }
  return out;
}

/**
 * 기록 정리(retention)가 말 기록을 지우기 직전에 부른다. 지워질 블랙타입 우승마의 몫을
 * legacy.familyTally 에 옮겨 명문 모계 판정이 줄어들지 않게 한다. 난수 미사용.
 */
export function tallyRemovedFamilyWinners(draft: GameState, removedIds: readonly HorseId[]): void {
  const listedWinners = listedWinnerIds(draft);
  for (const id of removedIds) {
    const horse = draft.horses[id];
    if (horse === undefined) continue;
    const kind = blackTypeOf(draft, horse, listedWinners);
    if (kind === null) continue;
    const tally = ((draft.legacy ??= { lines: [], families: [] }).familyTally ??= {});
    for (const damId of femaleAncestors(draft, horse)) {
      const entry = (tally[damId] ??= { blackTypeWinners: 0, groupWinners: 0 });
      entry.blackTypeWinners++;
      if (kind === 'group') entry.groupWinners++;
    }
  }
}

export function familyCandidates(state: GameState): FamilyCandidate[] {
  const listedWinners = listedWinnerIds(state);
  const candidates = new Map<HorseId, FamilyCandidate>();
  for (const horse of Object.values(state.horses)) {
    // 번식 레코드는 사망·은퇴 뒤에도 보존된다. 과거 혈통표 전용 말은 제외한다.
    if (horse.sex === 'female' && horse.status !== 'historical'
      && (state.mares[horse.id] !== undefined || horse.status === 'broodmare')) {
      candidates.set(horse.id, { founderMareId: horse.id, blackTypeWinners: 0, groupWinners: 0, eligible: false });
    }
  }
  for (const horse of Object.values(state.horses)) {
    const kind = blackTypeOf(state, horse, listedWinners);
    if (kind === null) continue;
    for (const damId of femaleAncestors(state, horse)) {
      const candidate = candidates.get(damId);
      if (candidate !== undefined) {
        candidate.blackTypeWinners++;
        if (kind === 'group') candidate.groupWinners++;
      }
    }
  }
  // 기록 정리로 지워진 우승마의 몫(retention 이 옮겨 둔 값)
  for (const [mareId, tally] of Object.entries(state.legacy?.familyTally ?? {})) {
    const candidate = candidates.get(mareId);
    if (candidate === undefined) continue;
    candidate.blackTypeWinners += tally.blackTypeWinners;
    candidate.groupWinners += tally.groupWinners;
  }
  return [...candidates.values()].sort((a, b) => compareId(a.founderMareId, b.founderMareId)).map((candidate) => ({
    ...candidate, eligible: candidate.blackTypeWinners >= FAMILY_MIN_BLACK_TYPE_WINNERS
      && candidate.groupWinners >= FAMILY_MIN_GROUP_WINNERS,
  }));
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 자기 자신부터 부계만 따라가 가장 가까운 확립 계통을 찾는다. 누락·순환 혈통도 종료한다. */
export function establishedLineOf(state: GameState, horseId: HorseId): EstablishedLine | null {
  const byFounder = new Map((state.legacy?.lines ?? []).map((line) => [line.founderId, line]));
  return ancestorRecord(state, horseId, 'sireId', byFounder);
}

/** 자기 자신 또는 모계 조상 중 가장 가까운 명문 모계. 아비 쪽 모계는 포함하지 않는다. */
export function familyOf(state: GameState, horseId: HorseId): FemaleFamily | null {
  const byFounder = new Map((state.legacy?.families ?? []).map((family) => [family.founderMareId, family]));
  return ancestorRecord(state, horseId, 'damId', byFounder);
}

function ancestorRecord<T>(
  state: GameState, horseId: HorseId, parentKey: 'sireId' | 'damId', records: ReadonlyMap<HorseId, T>,
): T | null {
  const seen = new Set<HorseId>();
  let id: HorseId | null = horseId;
  while (id !== null && !seen.has(id)) {
    const record = records.get(id);
    if (record !== undefined) return record;
    seen.add(id);
    id = state.horses[id]?.[parentKey] ?? null;
  }
  return null;
}

/** 확립 계통은 시조 이름, 기존 계통은 원래 SireLine.label 을 그대로 표시한다. */
export function lineLabel(state: GameState, line: EstablishedLine | SireLine | SireLineId): string {
  const record = typeof line === 'string'
    ? state.legacy?.lines.find((entry) => entry.id === line) ?? sireLines.find((entry) => entry.id === line)
    : line;
  if (record === undefined) return typeof line === 'string' ? line : line.id;
  if ('founderId' in record) return `${state.horses[record.founderId]?.name ?? record.founderId} 계통`;
  return record.label;
}

/** 새 게임 첫 주는 연도 전환이 아니다. 시스템 객체에는 실행 이력을 저장하지 않는다. */
function isYearTransition(year: number, week: number): boolean {
  return week === 1 && year > START_YEAR;
}

/** 연초 시상 확정 뒤 실행. 혈통·니크·공용 RNG 는 바꾸지 않고 칭호·이벤트·연대기만 추가한다. */
export function createLegacySystem(): WeeklySystem {
  return {
    id: 'legacy',
    run(draft, ctx): GameEvent[] {
      if (!isYearTransition(ctx.date.year, ctx.date.week)) return [];
      const legacy = (draft.legacy ??= { lines: [], families: [] });
      const knownLines = new Set(legacy.lines.map((line) => line.founderId));
      const knownFamilies = new Set(legacy.families.map((family) => family.founderMareId));
      const events: GameEvent[] = [];
      const newLines = lineCandidates(draft).filter((candidate) => candidate.eligible && !knownLines.has(candidate.founderId));
      // 같은 연도에 부자 모두 확립돼도 아들의 parentLineId 가 새 아비 계통을 가리키게 먼저 전부 추가한다.
      for (const candidate of newLines) {
        const horse = draft.horses[candidate.founderId]!;
        legacy.lines.push({ id: `line_${horse.id}`, founderId: horse.id,
          parentLineId: horse.sireLineId ?? draft.stallions[horse.id]!.sireLineId, establishedYear: ctx.date.year,
          sons: candidate.sons, groupWinners: candidate.groupWinners,
          playerBred: horse.breederId === draft.playerOwnerId });
      }
      for (const candidate of newLines) {
        const horse = draft.horses[candidate.founderId]!;
        const line = legacy.lines.find((entry) => entry.founderId === horse.id)!;
        const parent = horse.sireId === null ? null : establishedLineOf(draft, horse.sireId);
        if (parent !== null) line.parentLineId = parent.id;
        events.push({ type: 'sire_line_established', horseId: horse.id, lineId: line.id, date: { ...ctx.date } });
        appendChronicle(draft, { kind: 'sire_line_established', horseId: horse.id,
          lineId: line.id, count: candidate.groupWinners, player: line.playerBred, date: ctx.date });
      }
      for (const candidate of familyCandidates(draft)) {
        if (!candidate.eligible || knownFamilies.has(candidate.founderMareId)) continue;
        const horse = draft.horses[candidate.founderMareId]!;
        const playerBred = horse.breederId === draft.playerOwnerId;
        legacy.families.push({ founderMareId: horse.id, establishedYear: ctx.date.year,
          blackTypeWinners: candidate.blackTypeWinners, playerBred });
        events.push({ type: 'female_family_established', horseId: horse.id, date: { ...ctx.date } });
        appendChronicle(draft, { kind: 'female_family_established', horseId: horse.id,
          count: candidate.blackTypeWinners, player: playerBred, date: ctx.date });
      }
      return events;
    },
  };
}
