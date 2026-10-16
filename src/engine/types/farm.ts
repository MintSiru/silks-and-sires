/**
 * 새 게임 설정·목장·시설(M4-E). 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지.
 * 사용자 결정: 시작 유형 마주/오너브리더(2026-10-12), 난이도 안 A(2026-10-12),
 * 시설 확장 9종·각 3단계, 예후불량 기본 켬·현실 수준, 소재국 유럽 5개국, 목장 규모 3단계(2026-10-16).
 */
import type { Money } from './common';

/** 시작 유형. owner: 목장 없이 현역마만(목장을 사면 오너브리더) / owner_breeder: 목장 + 번식 암말 */
export type StartType = 'owner' | 'owner_breeder';

/** 난이도(시작 자금·지급 두수·시설 단계, 안 A) */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** 목장·마주 소재국으로 고를 수 있는 나라(유럽 5개국) */
export type HomeCountry = 'GB' | 'IE' | 'FR' | 'DE' | 'IT';

/** 새 게임에서 고른 설정(게임 내내 유지) */
export interface GameSettings {
  startType: StartType;
  difficulty: Difficulty;
  /** 예후불량(경주 중 치명적 부상) 켜기. 기본 true. D9 이른 사망은 이 설정과 무관하게 항상 켬 */
  catastrophicInjuries: boolean;
  /**
   * 조교사 출주 계획 진행 방식(UX1, 사용자 결정 2026-10-16 '그대로 진행'). 없거나 true 면 제안(proposed)도
   * 플레이어가 빼지 않는 한 그 주에 신청한다(true 는 새 제안을 approved 로 만든다). false 면 승인한 계획만 신청하고
   * 검토하지 않은 제안은 지나간다.
   */
  autoApproveRacePlans?: boolean;
  /**
   * 교배 제안 진행 방식(UX4). true: 제안을 만들자마자 예약(종부료 선지급) / 없음(기본, 사용자 결정 2026-10-16 '그대로 진행'):
   * 시즌 해 MATING_AUTO_BOOK_WEEK 에 빼지 않은 제안을 예약 / false: 승인한 제안만 예약
   */
  autoApproveMatings?: boolean;
  /** 자동 교배 한 두당 종부료 상한(€). null·없으면 교배 담당이 암말 수준으로 예산을 정한다 */
  matingFeeCap?: Money | null;
}

/**
 * 목장 시설 9종(각 0~3단계, 0 = 없음).
 * paddock 방목지(망아지·1세 성장) / pool 수영장(피로 회복) / hill_gallop 언덕 코스(스태미나 조교) /
 * indoor_school 실내 마장(겨울 컨디션) / vet_clinic 검사 설비(부상 예방·검사비·조기 확진) /
 * stallion_barn 종마사(종마 칸) / stable_block 마방 증축(번식 암말 수용 두수) /
 * yearling_complex 육성 시설(1·2세 마체·조숙) / foaling_unit 산실(출산 사고·유산 감소)
 */
export type FacilityKind = 'paddock' | 'pool' | 'hill_gallop' | 'indoor_school' | 'vet_clinic'
  | 'stallion_barn' | 'stable_block' | 'yearling_complex' | 'foaling_unit';

/** 목장 규모(번식 암말 기본 수용 두수가 다르다) */
export type FarmSize = 'small' | 'medium' | 'large';

/** GameState.farm — 플레이어 목장. 마주 시작이면 owned false(목장 구매 전) */
export interface FarmState {
  owned: boolean;
  /** 목장 소재국(owned 일 때). 마주 시작이면 null */
  country: HomeCountry | null;
  size: FarmSize | null;
  /** 가상 목장 이름(원칙 1). 없으면 null */
  name: string | null;
  /** 시설 단계(0~3). 목장이 없으면 모두 0 */
  facilities: Record<FacilityKind, number>;
  /** 목장을 얻은 해(시작 때부터면 시작 연도) */
  acquiredYear: number | null;
  /**
   * 진행 중인 시설 공사(M4-E1, 한 번에 하나). readyWeekKey 주(weekKey 형식) 처리 때 facilities 에 반영된다.
   * 없거나 null 이면 공사 없음(옛 저장본 포함)
   */
  construction?: { facility: FacilityKind; level: number; readyWeekKey: number } | null;
}

/** 목장 매물(M4-E0b). 매년 나라·규모별로 다시 만든다 */
export interface FarmListing {
  id: string;
  country: HomeCountry;
  size: FarmSize;
  /** 가상 목장 이름 */
  name: string;
  price: Money;
}
