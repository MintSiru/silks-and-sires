import { createMatingPlansSystem } from '../breeding/matingPlan';
import { createChronicleSystem } from '../legacy/chronicleSystem';
import { createRivalsSystem } from '../legacy/rivals';
import { createLegacySystem } from '../legacy/lines';
import { createBreedingSystem, type BreedingStaticData } from '../breeding/season';
import { createContractsSystem } from '../economy/contracts';
import { createCapitalSystem } from '../economy/capital';
import { createRetentionSystem } from '../world/retention';
import { createCostsSystem } from '../economy/costs';
import { createRelationsSystem } from '../economy/relations';
import { createSolvencySystem } from '../economy/solvency';
import { createFacilitiesSystem } from '../farm/facilities';
import { createFarmListingsSystem } from '../farm/purchase';
import { growthSystem } from '../horse/growth';
import { createPrivateTradeSystem } from '../sales/privateTrade';
import { createPrivateMarketSystem } from '../sales/privateMarket';
import { createNhStoreSystem } from '../sales/nhStore';
import { createSalesSystem, type SalesStaticData } from '../sales/system';
import { createAutoSellSystem } from '../sales/autoSell';
import { createRacePlansSystem } from '../season/racePlan';
import { createAutoTrainingSystem } from '../season/autoTraining';
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
 * 게임 주 시스템 목록. 실행 순서: 달력 → 목장 매물(farm_listings) → 성장 → 교배 → 종마 예약·정산 → 교배 담당 제안·자동 예약(mating_plans, UX4) → 종마 임대료(stud_leases) → 관측 수태율·저수태 은퇴(stud_fertility) → 고령 은퇴(stud_rotation) → 종마·번식 암말 사망(mortality) → 유산·제엽염·산통(breeding_health) → 종부료 연간 재산정(fee_review) → 연간 교체(population) → NH 스토어 세일(nh_store, 32주 — 그 주 레이스 전에 팔려 출주 신청이 빠진다) → 2세 자동 입사(auto_training) → 조교사 출주 계획 제안·자동 신청(race_plans — 이번 주 개최는 전주에 생성됨) → 시즌(season) → 판매 담당 자동 판매 제안·위탁(auto_sell, M6-0b — 위탁 마감 직전 주 위탁이 세일 발표 전이라 sales 앞) → 세일 발표·정리(sales) → 라이벌 선정·맞대결(rivals, M5 — 같은 주 세일 결과를 읽으므로 sales 뒤) → 연대기·연말 시상식 보상(chronicle, M5) → 부계 확립·명문 모계(legacy, M5 — 연초 시상 확정 뒤) → 내부거래 제안(private_trade) → 개인 거래 시장·구매 문의(private_market, M7-G1) → 전속 계약 연초 갱신(contracts) → 은퇴 소유 해제·연초 기록 정리(retention) → 목장 시설 완공·유지비(facilities, 시즌의 연말 정산 뒤라 새해 1주 유지비는 새해 장부) → 정기 비용(costs) → 연말 외부 자본·생산자 운영 정산(capital) → 자금 판정(solvency) → 관계·명성(relations).
 * 시스템 객체는 내부 상태가 없으므로 매번 새 배열을 만들어도 결과는 같다.
 */
export function createGameSystems(data: GameStaticData): WeeklySystem[] {
  return [
    calendarSystem,
    createFarmListingsSystem(),
    growthSystem,
    createBreedingSystem(data),
    createStudBooksSystem(),
    createMatingPlansSystem(data),
    createStudLeaseSystem(),
    createStudFertilitySystem(),
    createStudRotationSystem(),
    createMortalitySystem(),
    createBreedingHealthSystem(),
    createFeeReviewSystem(),
    createPopulationSystem(data),
    createNhStoreSystem(),
    createAutoTrainingSystem(), // 2세 자동 입사 뒤 같은 주 출주 계획을 만든다.
    createRacePlansSystem(data),
    createSeasonSystem(data),
    createAutoSellSystem(data),
    createSalesSystem(data),
    createRivalsSystem(),
    createChronicleSystem(data),
    createLegacySystem(),
    createPrivateTradeSystem(),
    // 시장 매물 가격은 세일 평가(valueLot)를 쓰므로 세일 데이터가 있을 때만(세일 시스템과 같은 조건)
    ...(data.sales === undefined ? [] : [createPrivateMarketSystem()]),
    createContractsSystem(),
    createRetentionSystem(),
    createFacilitiesSystem(),
    createCostsSystem(),
    createCapitalSystem(),
    createSolvencySystem(),
    createRelationsSystem(),
  ];
}
