import { createBreedingSystem, type BreedingStaticData } from '../breeding/season';
import { createContractsSystem } from '../economy/contracts';
import { createCostsSystem } from '../economy/costs';
import { createRelationsSystem } from '../economy/relations';
import { createSolvencySystem } from '../economy/solvency';
import { createFacilitiesSystem } from '../farm/facilities';
import { createFarmListingsSystem } from '../farm/purchase';
import { growthSystem } from '../horse/growth';
import { createPrivateTradeSystem } from '../sales/privateTrade';
import { createSalesSystem, type SalesStaticData } from '../sales/system';
import { createSeasonSystem, type SeasonStaticData } from '../season/system';
import { createStudBooksSystem } from '../stud/books';
import { createFeeReviewSystem } from '../stud/market';
import { createStudLeaseSystem } from '../stud/trade';
import { createStudFertilitySystem } from '../stud/fertility';
import { createStudRotationSystem } from '../stud/rotation';
import { createMortalitySystem } from '../stud/mortality';
import { createBreedingHealthSystem } from '../stud/health';
import { calendarSystem } from '../time/advance';
import type { WeeklySystem } from '../types';
import type { RacingPopulationStaticData } from '../world/population';
import { createPopulationSystem } from '../world/populationSystem';

/** 게임 주 시스템 전체가 쓰는 정적 데이터 */
export type GameStaticData = BreedingStaticData & SeasonStaticData & RacingPopulationStaticData & SalesStaticData;

/**
 * 게임 주 시스템 목록. 실행 순서: 달력 → 목장 매물(farm_listings) → 성장 → 교배 → 종마 예약·정산 → 종마 임대료(stud_leases) → 관측 수태율·저수태 은퇴(stud_fertility) → 고령 은퇴(stud_rotation) → 종마·번식 암말 사망(mortality) → 유산·제엽염·산통(breeding_health) → 종부료 연간 재산정(fee_review) → 연간 교체(population) → 시즌(season) → 세일 발표·정리(sales) → 내부거래 제안(private_trade) → 전속 계약 연초 갱신(contracts) → 목장 시설 완공·유지비(facilities, 시즌의 연말 정산 뒤라 새해 1주 유지비는 새해 장부) → 정기 비용(costs) → 자금 판정(solvency) → 관계·명성(relations).
 * 시스템 객체는 내부 상태가 없으므로 매번 새 배열을 만들어도 결과는 같다.
 */
export function createGameSystems(data: GameStaticData): WeeklySystem[] {
  return [
    calendarSystem,
    createFarmListingsSystem(),
    growthSystem,
    createBreedingSystem(data),
    createStudBooksSystem(),
    createStudLeaseSystem(),
    createStudFertilitySystem(),
    createStudRotationSystem(),
    createMortalitySystem(),
    createBreedingHealthSystem(),
    createFeeReviewSystem(),
    createPopulationSystem(data),
    createSeasonSystem(data),
    createSalesSystem(data),
    createPrivateTradeSystem(),
    createContractsSystem(),
    createFacilitiesSystem(),
    createCostsSystem(),
    createSolvencySystem(),
    createRelationsSystem(),
  ];
}
