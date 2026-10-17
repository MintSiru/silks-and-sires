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
const up = (value: number): string => `+${pct(value)}`;
const down = (value: number): string => `−${pct(value)}`;
const stableBonus = (level: number): number => STABLE_BLOCK_CAPACITY_BONUS[level] ?? 0;
const stallionSlots = (level: number): number => Math.max(1, level);

/** 시설 효과 한 항목. value 는 단계별 수치(config 계수 × 단계), format 은 화면 표기. */
interface EffectEntry {
  label: string;
  value: (level: number) => number;
  format: (value: number) => string;
}

/** 시설별 효과 항목. 계수는 반드시 config 에서 가져온다. */
const FACILITY_EFFECTS: Record<FacilityKind, readonly EffectEntry[]> = {
  paddock: [
    { label: '망아지·1세 성장', value: (l) => PADDOCK_GROWTH_PER_LEVEL * l, format: up },
  ],
  pool: [
    { label: '휴양 피로 회복', value: (l) => POOL_REST_RECOVERY_PER_LEVEL * l, format: up },
    { label: '부상 회복 촉진 확률', value: (l) => POOL_INJURY_RECOVERY_CHANCE_PER_LEVEL * l, format: pct },
  ],
  hill_gallop: [
    { label: '스태미나 조교', value: (l) => HILL_GALLOP_STAMINA_PER_LEVEL * l, format: up },
  ],
  indoor_school: [
    { label: '겨울 호흡기 질환 위험', value: (l) => INDOOR_RESPIRATORY_REDUCTION_PER_LEVEL * l, format: down },
  ],
  vet_clinic: [
    { label: '검사비', value: (l) => VET_EXAM_REDUCTION_PER_LEVEL * l, format: down },
    { label: '확진', value: (l) => VET_DIAGNOSIS_WEEKS_PER_LEVEL * l, format: (v) => `${v}주 단축` },
    { label: '부상 위험', value: (l) => VET_INJURY_REDUCTION_PER_LEVEL * l, format: down },
  ],
  stallion_barn: [
    { label: '종마', value: stallionSlots, format: (v) => `${v}칸` },
  ],
  stable_block: [
    { label: '번식 암말 수용', value: stableBonus, format: (v) => `+${v}두` },
  ],
  yearling_complex: [
    { label: '1·2세 성장', value: (l) => YEARLING_COMPLEX_GROWTH_PER_LEVEL * l, format: up },
    { label: '데뷔 체력', value: (l) => YEARLING_COMPLEX_START_FITNESS_PER_LEVEL * l, format: (v) => `+${v}` },
  ],
  foaling_unit: [
    { label: '출산 사고·유산 위험', value: (l) => FOALING_UNIT_LOSS_REDUCTION_PER_LEVEL * l, format: down },
  ],
};

/** 현재 단계의 효과 문구. 예: '망아지·1세 성장 +10%' */
export function facilityEffectKo(kind: FacilityKind, level: number): string {
  return FACILITY_EFFECTS[kind].map((e) => `${e.label} ${e.format(e.value(level))}`).join(' · ');
}

/** 효과 항목 한 줄의 '현재 → 다음 단계' 비교. next 는 최대 단계면 null, improved 는 다음 단계가 더 클 때 true */
export interface EffectPart {
  label: string;
  current: string;
  next: string | null;
  improved: boolean;
}

export function facilityEffectParts(kind: FacilityKind, level: number): EffectPart[] {
  const hasNext = level < FACILITY_MAX_LEVEL;
  return FACILITY_EFFECTS[kind].map((e) => {
    const current = e.value(level);
    const nextValue = e.value(level + 1);
    return {
      label: e.label,
      current: e.format(current),
      next: hasNext ? e.format(nextValue) : null,
      improved: hasNext && nextValue > current,
    };
  });
}

/** 단계 진행 칸: 3단계 중 1단계면 '■□□'. 칸 수는 최대 단계. */
export function stageGlyph(level: number, maxLevel: number): string {
  const filled = Math.min(Math.max(level, 0), maxLevel);
  return '■'.repeat(filled) + '□'.repeat(maxLevel - filled);
}

/** 단계 진행 칸의 읽기용 이름. 예: '1/3단계' */
export function stageLabel(level: number, maxLevel: number): string {
  return `${level}/${maxLevel}단계`;
}

function readyDateKo(readyWeekKey: number): string {
  return formatDateKo({
    year: Math.floor(readyWeekKey / DUE_WEEK_KEY_YEAR_SCALE),
    week: readyWeekKey % DUE_WEEK_KEY_YEAR_SCALE,
  });
}

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

/** 화면 맨 위에 고정하는 공사 상태. 공사 중이 아니면 null */
export interface ConstructionBanner {
  facility: FacilityKind;
  /** 예: '방목지 1단계 → 2단계 · 완료 예정 2027년 1월 3주' (화면에서 앞에 '공사 중 · ' 를 붙인다) */
  text: string;
}

export function constructionBanner(state: GameState): ConstructionBanner | null {
  const construction = state.farm.construction;
  if (!state.farm.owned || construction == null) return null;
  const from = facilityLevel(state, construction.facility);
  return {
    facility: construction.facility,
    text: `${FACILITY_KO[construction.facility]} ${from}단계 → ${construction.level}단계 · 완료 예정 ${readyDateKo(construction.readyWeekKey)}`,
  };
}

export function facilityRows(state: GameState) {
  const construction = state.farm.construction;
  return FACILITY_KINDS.map((kind) => {
    const level = facilityLevel(state, kind);
    const nextCost = level >= FACILITY_MAX_LEVEL ? null : upgradeCost(kind, level + 1);
    const building = construction?.facility === kind ? construction : null;
    const constructionKo = building === null ? null
      : `공사 중 → ${building.level}단계, 완공 예정 ${readyDateKo(building.readyWeekKey)}`;
    const disabledReason = !state.farm.owned ? '목장을 먼저 구매하세요.'
      : construction != null ? '시설 공사 중입니다. 완공 후 착공할 수 있습니다.'
      : nextCost === null ? '최대 단계입니다.'
      : !canSpendDiscretionary(state, nextCost) ? '자금이 부족하거나 빚이 있어 착공할 수 없습니다.' : null;
    return { kind, name: FACILITY_KO[kind], level, maxLevel: FACILITY_MAX_LEVEL,
      stageGlyph: stageGlyph(level, FACILITY_MAX_LEVEL), stageLabel: stageLabel(level, FACILITY_MAX_LEVEL),
      effectKo: facilityEffectKo(kind, level), effects: facilityEffectParts(kind, level),
      nextCost, constructionKo, disabledReason };
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
