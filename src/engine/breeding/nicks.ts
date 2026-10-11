import type { NickEntry, NickLabel, SireLineId } from '../types';
import {
  NICK_EXCELLENT,
  NICK_GOOD,
  NICK_POOR,
} from '../config/genetics';

/** 닉스 표 키. 부 계통 × 모부 계통 */
export function nickKey(sireLineId: SireLineId, damsireLineId: SireLineId): string {
  return `${sireLineId}|${damsireLineId}`;
}

/** 닉스 값(-1~+1). 조합이 없거나 계통이 null 이면 0 */
export function nickValue(
  table: readonly NickEntry[],
  sireLineId: SireLineId | null,
  damsireLineId: SireLineId | null,
): number {
  if (sireLineId === null || damsireLineId === null) return 0;
  const entry = table.find(
    (e) => e.sireLineId === sireLineId && e.damsireLineId === damsireLineId,
  );
  return entry?.value ?? 0;
}

/** 미공개(known false)면 값과 무관하게 'unknown' */
export function nickLabel(value: number, known: boolean): NickLabel {
  if (!known) return 'unknown';
  if (value >= NICK_EXCELLENT) return 'excellent';
  if (value >= NICK_GOOD) return 'good';
  if (value <= NICK_POOR) return 'poor';
  return 'neutral';
}

/** 게임 시작 시 공개된 닉스 키 목록(정렬, 중복 제거) */
export function initialRevealedNicks(table: readonly NickEntry[]): string[] {
  const keys = new Set<string>();
  for (const entry of table) {
    if (entry.knownAtStart) keys.add(nickKey(entry.sireLineId, entry.damsireLineId));
  }
  return [...keys].sort();
}
