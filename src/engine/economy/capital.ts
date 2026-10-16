import { WEEKS_PER_YEAR } from '../config/game';
import { BREEDER_CAPITAL_RANGE, CAPITAL_REVERSION_RATE, OWNER_CAPITAL_RANGE } from '../config/stability';
import type { WeeklySystem } from '../types';
import { recordMoney } from './ledger';

/** 경마 밖 자산의 출자·인출, 생산자의 운영비·배당. 플레이어는 적용하지 않는다. */
export function createCapitalSystem(): WeeklySystem {
  return { id: 'capital', run(draft, { date }) {
    if (date.week !== WEEKS_PER_YEAR) return [];
    for (const id of Object.keys(draft.owners).sort()) {
      const owner = draft.owners[id]!;
      if (owner.isPlayer || id === draft.playerOwnerId) continue;
      const range = OWNER_CAPITAL_RANGE[owner.tier];
      const target = (range.min + range.max) / 2;
      recordMoney(draft, id, 'other', Math.round((target - owner.funds) * CAPITAL_REVERSION_RATE), date);
    }
    for (const id of Object.keys(draft.breeders).sort()) {
      const breeder = draft.breeders[id]!;
      const range = BREEDER_CAPITAL_RANGE[breeder.scale];
      const target = (range.min + range.max) / 2;
      breeder.funds += Math.round((target - breeder.funds) * CAPITAL_REVERSION_RATE);
    }
    return [];
  } };
}
