/** 플레이어 목장 시설: 착공 API·완공·유지비. 시스템 등록은 호출자가 담당한다. */
import { DUE_WEEK_KEY_YEAR_SCALE } from '../config/breedingSeason';
import {
  FACILITY_BUILD_WEEKS, FACILITY_COST_MULT, FACILITY_KINDS, FACILITY_MAX_LEVEL,
  FACILITY_UPGRADE_COST, FACILITY_UPKEEP_PER_LEVEL_YEAR,
} from '../config/farm';
import { WEEKS_PER_YEAR } from '../config/game';
import { recordMoney } from '../economy/ledger';
import { canSpendDiscretionary } from '../economy/solvency';
import { addWeeks } from '../time/calendar';
import type { FacilityKind, GameDate, GameEvent, GameState, Money, WeeklySystem } from '../types';

/** 번식 시스템의 출산 예정 키와 같은 형식. 연말은 addWeeks 로 먼저 정규화한다. */
function weekKey(date: GameDate): number {
  return date.year * DUE_WEEK_KEY_YEAR_SCALE + date.week;
}

export function facilityLevel(state: Pick<GameState, 'farm'>, kind: FacilityKind): number {
  return state.farm.owned ? state.farm.facilities[kind] : 0;
}

export function upgradeCost(kind: FacilityKind, targetLevel: number): Money {
  return FACILITY_UPGRADE_COST[targetLevel]! * (FACILITY_COST_MULT[kind] ?? 1);
}

export type FacilityUpgradeResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: 'no_farm' | 'max_level' | 'under_construction' | 'insufficient_funds' };

export function startFacilityUpgrade(state: GameState, kind: FacilityKind): FacilityUpgradeResult {
  if (!state.farm.owned) return { ok: false, error: 'no_farm' };
  const level = facilityLevel(state, kind) + 1;
  if (level > FACILITY_MAX_LEVEL) return { ok: false, error: 'max_level' };
  if (state.farm.construction != null) return { ok: false, error: 'under_construction' };
  const cost = upgradeCost(kind, level);
  if (!canSpendDiscretionary(state, cost)) return { ok: false, error: 'insufficient_funds' };
  const draft = structuredClone(state);
  recordMoney(draft, draft.playerOwnerId, 'facility', -cost, draft.date);
  draft.farm.construction = { facility: kind, level,
    readyWeekKey: weekKey(addWeeks(draft.date, FACILITY_BUILD_WEEKS)) };
  // 착공은 비용을 담아 반환하고, 완공 때는 같은 종류의 cost 0 알림을 낸다.
  return { ok: true, state: draft, events: [{ type: 'facility_upgraded', facility: kind,
    level, cost, date: { ...draft.date } }] };
}

export function createFacilitiesSystem(): WeeklySystem {
  return {
    id: 'facilities',
    run(draft, { date }) {
      const events: GameEvent[] = [];
      const construction = draft.farm.construction;
      if (draft.farm.owned && construction != null && weekKey(date) >= construction.readyWeekKey) {
        draft.farm.facilities[construction.facility] = construction.level;
        draft.farm.construction = null;
        events.push({ type: 'facility_upgraded', facility: construction.facility,
          level: construction.level, cost: 0, date: { ...date } });
      }
      draft.stud.slots = Math.max(1, facilityLevel(draft, 'stallion_barn'));
      const levels = FACILITY_KINDS.reduce((sum, kind) => sum + facilityLevel(draft, kind), 0);
      recordMoney(draft, draft.playerOwnerId, 'facility',
        -Math.round(levels * FACILITY_UPKEEP_PER_LEVEL_YEAR / WEEKS_PER_YEAR), date);
      return events;
    },
  };
}
