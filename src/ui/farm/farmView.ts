/** 목장 화면의 읽기 전용 계산. 비용·효과는 엔진 설정과 같은 값을 쓴다. */
import { DUE_WEEK_KEY_YEAR_SCALE } from '../../engine/config/breedingSeason';
import {
  FACILITY_KINDS, FACILITY_MAX_LEVEL, FACILITY_UPKEEP_PER_LEVEL_YEAR,
  FARM_BASE_PRICE, FARM_COUNTRY_PRICE_MULT, FARM_MARE_CAPACITY, FARM_RESALE_SHARE,
  STABLE_BLOCK_CAPACITY_BONUS, PADDOCK_GROWTH_PER_LEVEL, POOL_REST_RECOVERY_PER_LEVEL,
  POOL_INJURY_RECOVERY_CHANCE_PER_LEVEL, HILL_GALLOP_STAMINA_PER_LEVEL,
  INDOOR_RESPIRATORY_REDUCTION_PER_LEVEL, VET_EXAM_REDUCTION_PER_LEVEL,
  VET_DIAGNOSIS_WEEKS_PER_LEVEL, VET_INJURY_REDUCTION_PER_LEVEL,
  YEARLING_COMPLEX_GROWTH_PER_LEVEL, YEARLING_COMPLEX_START_FITNESS_PER_LEVEL,
  FOALING_UNIT_LOSS_REDUCTION_PER_LEVEL,
} from '../../engine/config/farm';
import { canSpendDiscretionary } from '../../engine/economy/solvency';
import { facilityLevel, upgradeCost } from '../../engine/farm/facilities';
import { mareCapacity, playerBroodmareCount } from '../../engine/farm/purchase';
import { formatDateKo } from '../../engine/time/calendar';
import type { FacilityKind, GameState } from '../../engine/types';
import { countryKo, FACILITY_KO, FARM_SIZE_KO } from '../game/text';

const pct = (value: number): string => `${Math.round(value * 100)}%`;
const stableBonus = (level: number): number => STABLE_BLOCK_CAPACITY_BONUS[level] ?? 0;
const stallionSlots = (level: number): number => Math.max(1, level);

/** 현재 단계의 효과. 계수는 반드시 config 에서 가져온다. */
const FACILITY_EFFECT_KO: Record<FacilityKind, (level: number) => string> = {
  paddock: (l) => `망아지·1세 성장 +${pct(PADDOCK_GROWTH_PER_LEVEL * l)}`,
  pool: (l) => `휴양 피로 회복 +${pct(POOL_REST_RECOVERY_PER_LEVEL * l)} · 부상 회복 촉진 확률 ${pct(POOL_INJURY_RECOVERY_CHANCE_PER_LEVEL * l)}`,
  hill_gallop: (l) => `스태미나 조교 +${pct(HILL_GALLOP_STAMINA_PER_LEVEL * l)}`,
  indoor_school: (l) => `겨울 호흡기 질환 위험 −${pct(INDOOR_RESPIRATORY_REDUCTION_PER_LEVEL * l)}`,
  vet_clinic: (l) => `검사비 −${pct(VET_EXAM_REDUCTION_PER_LEVEL * l)} · 확진 ${VET_DIAGNOSIS_WEEKS_PER_LEVEL * l}주 단축 · 부상 위험 −${pct(VET_INJURY_REDUCTION_PER_LEVEL * l)}`,
  stallion_barn: (l) => `종마 ${stallionSlots(l)}칸`,
  stable_block: (l) => `번식 암말 수용 +${stableBonus(l)}두`,
  yearling_complex: (l) => `1·2세 성장 +${pct(YEARLING_COMPLEX_GROWTH_PER_LEVEL * l)} · 데뷔 체력 +${YEARLING_COMPLEX_START_FITNESS_PER_LEVEL * l}`,
  foaling_unit: (l) => `출산 사고·유산 위험 −${pct(FOALING_UNIT_LOSS_REDUCTION_PER_LEVEL * l)}`,
};

export function farmSummary(state: GameState) {
  const farm = state.farm;
  if (!farm.owned) return { owned: false as const, name: '목장 없음' };
  return {
    owned: true as const,
    name: farm.name ?? '내 목장',
    countryKo: farm.country === null ? '—' : countryKo(farm.country),
    sizeKo: farm.size === null ? '—' : FARM_SIZE_KO[farm.size],
    acquiredYear: farm.acquiredYear,
    broodmareCount: playerBroodmareCount(state),
    mareCapacity: mareCapacity(state),
    baseCapacity: farm.size === null ? 0 : FARM_MARE_CAPACITY[farm.size],
    stableBonus: stableBonus(facilityLevel(state, 'stable_block')),
    annualUpkeep: FACILITY_KINDS.reduce((sum, kind) => sum + facilityLevel(state, kind), 0) * FACILITY_UPKEEP_PER_LEVEL_YEAR,
    stallionSlots: stallionSlots(facilityLevel(state, 'stallion_barn')),
  };
}

export function facilityRows(state: GameState) {
  const construction = state.farm.construction;
  return FACILITY_KINDS.map((kind) => {
    const level = facilityLevel(state, kind);
    const nextCost = level >= FACILITY_MAX_LEVEL ? null : upgradeCost(kind, level + 1);
    const building = construction?.facility === kind ? construction : null;
    const constructionKo = building === null ? null
      : `공사 중 → ${building.level}단계, 완공 예정 ${formatDateKo({
        year: Math.floor(building.readyWeekKey / DUE_WEEK_KEY_YEAR_SCALE),
        week: building.readyWeekKey % DUE_WEEK_KEY_YEAR_SCALE,
      })}`;
    const disabledReason = !state.farm.owned ? '목장을 먼저 구매하세요.'
      : construction != null ? '시설 공사 중입니다. 완공 후 착공할 수 있습니다.'
      : nextCost === null ? '최대 단계입니다.'
      : !canSpendDiscretionary(state, nextCost) ? '자금이 부족하거나 빚이 있어 착공할 수 없습니다.' : null;
    return { kind, name: FACILITY_KO[kind], level, maxLevel: FACILITY_MAX_LEVEL,
      effectKo: FACILITY_EFFECT_KO[kind](level), nextCost, constructionKo, disabledReason };
  });
}

export function listingRows(state: GameState) {
  const farm = state.farm;
  const resale = farm.owned && farm.size !== null && farm.country !== null
    ? Math.round(FARM_BASE_PRICE[farm.size] * FARM_COUNTRY_PRICE_MULT[farm.country] * FARM_RESALE_SHARE) : 0;
  const bonus = stableBonus(farm.owned ? facilityLevel(state, 'stable_block') : 1);
  const mares = playerBroodmareCount(state);
  return state.farmListings.map((listing) => {
    const capacity = FARM_MARE_CAPACITY[listing.size] + bonus;
    const netCost = listing.price - resale;
    const disabledReason = capacity < mares ? '너무 작음: 현재 번식 암말을 모두 수용할 수 없습니다.'
      : netCost > 0 && !canSpendDiscretionary(state, netCost) ? '자금이 부족하거나 빚이 있어 구매할 수 없습니다.' : null;
    return { id: listing.id, name: listing.name, countryKo: countryKo(listing.country),
      sizeKo: FARM_SIZE_KO[listing.size], capacity, price: listing.price, resale, netCost,
      canPurchase: disabledReason === null, disabledReason };
  });
}
