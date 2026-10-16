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
  hard: { funds: 250_000, mares: 1, breederRacehorses: 0, ownerRacehorses: 1, facilityLevel: 1, farmSize: 'small' },
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
