/** 목장·시설 구조 상수(M4-E). 밸런스 수치(비용·효과)는 E0·E1 티켓에서 이 파일에 더한다. */
import type { Difficulty, FacilityKind, FarmSize, FarmState, GameSettings, HomeCountry } from '../types';

/** 시설 9종(표시 순서) */
export const FACILITY_KINDS: readonly FacilityKind[] = [
  'paddock', 'pool', 'hill_gallop', 'indoor_school', 'vet_clinic',
  'stallion_barn', 'stable_block', 'yearling_complex', 'foaling_unit',
];

/** 시설 최고 단계 */
export const FACILITY_MAX_LEVEL = 3;

/** 목장·마주 소재국(유럽 5개국, 사용자 결정 2026-10-16) */
export const HOME_COUNTRIES: readonly HomeCountry[] = ['GB', 'IE', 'FR', 'DE', 'IT'];

/** 옛 저장본·기본 새 게임 설정(보통 난이도 오너브리더, 예후불량 켬) */
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  startType: 'owner_breeder', difficulty: 'normal', catastrophicInjuries: true,
};

/** 시작 난이도 안 A(사용자 결정 2026-10-12): 자금·지급 두수·시설·규모를 함께 조정한다. */
export const STARTING_PACKAGES: Readonly<Record<Difficulty, {
  funds: number;
  mares: number;
  breederRacehorses: number;
  ownerRacehorses: number;
  facilityLevel: number;
  farmSize: FarmSize;
}>> = {
  easy: { funds: 1_500_000, mares: 3, breederRacehorses: 2, ownerRacehorses: 3, facilityLevel: 2, farmSize: 'medium' },
  normal: { funds: 600_000, mares: 2, breederRacehorses: 1, ownerRacehorses: 2, facilityLevel: 1, farmSize: 'medium' },
  // 어려움 오너브리더도 현역 1두(사용자 결정 2026-10-17 — 0두면 수입원이 없어 3년차 빚, M6-B2)
  hard: { funds: 250_000, mares: 1, breederRacehorses: 1, ownerRacehorses: 1, facilityLevel: 1, farmSize: 'small' },
};

/** 소재국 혈통 차이(사용자 피드백 2026-10-12): 같은 나라 계류 종마의 선택 가중치를 3배로 한다. */
export const HOME_SIRE_WEIGHT_MULT = 3;

/** 안 A 지급 현역마 나이. 필요한 두수만 앞에서 취한다. */
export const STARTING_RACEHORSE_AGES: readonly number[] = [3, 2, 2];

/** 모든 시설을 같은 단계로 둔 표 */
export function uniformFacilities(level: number): Record<FacilityKind, number> {
  return Object.fromEntries(FACILITY_KINDS.map((kind) => [kind, level])) as Record<FacilityKind, number>;
}

/** 목장 없음(마주 시작) */
export function emptyFarm(): FarmState {
  return { owned: false, country: null, size: null, name: null, facilities: uniformFacilities(0), acquiredYear: null };
}

/* ── M4-E0b 목장 구매(사용자 승인 2026-10-16) ── */

/** 규모별 번식 암말 기본 수용 두수 */
export const FARM_MARE_CAPACITY: Readonly<Record<FarmSize, number>> = { small: 6, medium: 15, large: 30 };
/** 규모별 영국 기준가(유로). 소형 €400k 는 2026-10-12 안 A 메모와 같다 */
export const FARM_BASE_PRICE: Readonly<Record<FarmSize, number>> = { small: 400_000, medium: 1_000_000, large: 2_500_000 };
/** 나라별 목장 가격 배수 */
export const FARM_COUNTRY_PRICE_MULT: Readonly<Record<HomeCountry, number>> = { GB: 1, IE: 0.9, FR: 0.95, DE: 0.7, IT: 0.6 };
/** 매물 가격 흔들림 폭(±) */
export const FARM_LISTING_PRICE_SPREAD = 0.1;
/** 나라·규모마다 해마다 띄우는 매물 수(최소~최대) */
export const FARM_LISTINGS_PER_SLOT_MIN = 1;
export const FARM_LISTINGS_PER_SLOT_MAX = 2;
/** 이전할 때 기존 목장 매각가 = 그 나라·규모 기준가 × 이 값 */
export const FARM_RESALE_SHARE = 0.75;

/* ── M4-E1 시설(사용자 승인 2026-10-16) ── */

/** 단계별 공사비(이전 단계에서 올릴 때). 인덱스 = 목표 단계(1~3) */
export const FACILITY_UPGRADE_COST: readonly number[] = [0, 60_000, 150_000, 350_000];
/** 공사비 배수가 다른 시설(큰 건물) */
export const FACILITY_COST_MULT: Readonly<Partial<Record<FacilityKind, number>>> = { stallion_barn: 1.5, stable_block: 1.5 };
/**
 * 연 유지비 = 시설 단계 합 × 이 값(주마다 나눠 장부 'facility'). 플레이어 전용(AI 에 적용 안 됨).
 * M6-B3(2026-10-17): 8,000 → 4,000(절반). 쉬움 10년 자금 1,147k → 1,867k(목표 ≥1.2M 충족), 어려움 3년 빚 없음 유지.
 * 보통 10년 빚 없음은 이 값으로 미달(2032년 빚 시작) — docs/reports/M6-B3-fixed-costs.md 참고.
 */
export const FACILITY_UPKEEP_PER_LEVEL_YEAR = 4_000;
/** 공사 기간(주). 그동안 새 단계 효과 없음 */
export const FACILITY_BUILD_WEEKS = 4;
/** 마방 증축 단계별 번식 암말 수용 보너스(인덱스 = 단계) */
export const STABLE_BLOCK_CAPACITY_BONUS: readonly number[] = [0, 3, 6, 10];

/** 시설 효과: 사용자 승인 수치안(2026-10-16), 모두 단계당 보정. */
export const PADDOCK_GROWTH_PER_LEVEL = 0.04;
export const POOL_REST_RECOVERY_PER_LEVEL = 0.2;
export const POOL_INJURY_RECOVERY_CHANCE_PER_LEVEL = 0.1;
export const HILL_GALLOP_STAMINA_PER_LEVEL = 0.05;
export const INDOOR_RESPIRATORY_REDUCTION_PER_LEVEL = 0.15;
export const VET_EXAM_REDUCTION_PER_LEVEL = 0.25;
export const VET_DIAGNOSIS_WEEKS_PER_LEVEL = 1;
export const VET_INJURY_REDUCTION_PER_LEVEL = 0.05;
export const YEARLING_COMPLEX_GROWTH_PER_LEVEL = 0.03;
export const YEARLING_COMPLEX_START_FITNESS_PER_LEVEL = 10;
export const FOALING_UNIT_LOSS_REDUCTION_PER_LEVEL = 0.2;
/** 목장 매물 가격 반올림 단위(€, M4-E0b) */
export const FARM_LISTING_PRICE_ROUND = 10_000;

/** 목장 이름 등록 길이(앞뒤 공백 제거 후) */
export const FARM_NAME_MIN_LENGTH = 2;
export const FARM_NAME_MAX_LENGTH = 30;
