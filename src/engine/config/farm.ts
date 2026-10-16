/** 목장·시설 구조 상수(M4-E). 밸런스 수치(비용·효과)는 E0·E1 티켓에서 이 파일에 더한다. */
import type { FacilityKind, FarmState, GameSettings, HomeCountry } from '../types';

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

/** 모든 시설을 같은 단계로 둔 표 */
export function uniformFacilities(level: number): Record<FacilityKind, number> {
  return Object.fromEntries(FACILITY_KINDS.map((kind) => [kind, level])) as Record<FacilityKind, number>;
}

/** 목장 없음(마주 시작) */
export function emptyFarm(): FarmState {
  return { owned: false, country: null, size: null, name: null, facilities: uniformFacilities(0), acquiredYear: null };
}
