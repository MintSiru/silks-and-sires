# M4-A2b 정기 비용: 조교료·목장 유지비·등록료·운송비

담당: haiku-coder · 선행: M4-A2a(ff938bb) · 근거: docs/m4-plan.md M4-A

## 목적
돈이 나가는 정기 비용을 넣는다. 모든 마주(플레이어·AI)에 같은 규칙. 자금이 음수가 되어도 이 티켓에서는 그대로 둔다(빚·파산은 A3).

## 비용 규칙 (상수는 전부 src/engine/config/economy.ts)
1. **조교료(주마다):** 상태 in_training·resting 이고 trainerId·ownerId 가 있는 말마다, 그 조교사의 `weeklyFee` 를 말 주인이 낸다 → 'training_fee'(horseId = 그 말).
   - 조교료 수준 조정: `WEEKLY_FEE_PER_FACILITY_GRADE`(config/people.ts) 1500 → **180**(시설 1~5등급 → 주당 €180~900, 실제 경마의 말 1두당 조교료 수준). 기존 저장의 조교사 weeklyFee 는 저장 이주 v7 → v8 에서 `facilityGrade × 180` 으로 다시 계산한다(`SAVE_SCHEMA_VERSION` 8).
2. **목장 유지비(주마다):** ownerId 가 있는 말 중 상태별 두당 주간 비용 — broodmare `FARM_UPKEEP.broodmare`(200), foal 60, weanling 100, yearling 120, stud(소유 종마) 350, retired(목장에 남은 은퇴마) 40. 'farm_upkeep'.
   - 두수 체증: 마주별 목장 두수(위 상태 합)가 `FARM_SCALE_FREE_HEADS`(12)를 넘으면, 넘는 두수 1두마다 그 주 목장 유지비 전체에 `FARM_SCALE_STEP`(0.01) 씩 가산, 상한 `FARM_SCALE_MAX`(0.5). (기획서 5-4 '두수 증가에 따른 유지비 체증')
   - 마주별로 한 주 합계를 한 번에 기록한다(말마다 항목을 남기지 않는다 — horseId null).
3. **등록료(레이스마다):** 출주마마다 그 레이스 총상금 × `ENTRY_FEE_SHARE`(0.01), 최소 `ENTRY_FEE_MIN`(40), 정수 반올림. 레이스 결과를 반영할 때 'entry_fee'(horseId = 그 말).
4. **운송비(레이스마다):** 경마장 나라 ≠ 말의 조교사 나라이면, 영국↔아일랜드는 `TRANSPORT_FEE.near`(1500), 그 밖은 `TRANSPORT_FEE.far`(3500). 'transport'.
- 비용은 모두 정수 유로. recordMoney 로만 바꾼다.

## 구현 위치
1. `src/engine/economy/costs.ts` (신규)
   - `weeklyCosts(draft: GameState, date: GameDate): void` — 조교료·목장 유지비. 마주 ID 오름차순·말 ID 오름차순으로 결정적.
   - `createCostsSystem(): WeeklySystem` — 매주 weeklyCosts 실행(난수 사용 안 함).
   - `raceEntryCosts(...)` 또는 `chargeRaceCosts(draft, race, courseCountry, runners, date)` — 등록료·운송비.
2. `src/engine/state/systems.ts` — createGameSystems 에 비용 시스템 추가(season 시스템 뒤).
3. `src/engine/season/apply.ts` — 결과 반영 때 chargeRaceCosts 호출(상금 기록 바로 다음).
4. `src/engine/config/people.ts`(상수 1개), `src/engine/config/game.ts`(스키마 8), `src/engine/save/serialize.ts`(이주 7 → 8 — 조교사 weeklyFee 재계산만).
5. 테스트 `tests/engine/costs.test.ts` (신규)
   - 조교료: 현역마 2두 가진 마주가 한 주에 weeklyFee 합만큼 줄고 'training_fee' 로 기록.
   - 목장 유지비: 상태별 두당 비용, 체증(13두 → +1%, 62두 이상 → +50% 상한).
   - 등록료·운송비: 국내 레이스는 등록료만, IE 조교사 말이 GB 레이스 → near, FR 조교사 말이 GB → far.
   - 저장 이주 v7 → v8: weeklyFee 가 facilityGrade × 180 이 된다.
   - 같은 시드 2회 진행 toEqual, 저장 왕복.
   - 참고 측정(단언 아님, 출력): bootstrapGame 후 1시즌(53주) 플레이어·AI 종류별 합계 — 보고서에 붙인다.

## 수용 기준
1. 위 테스트 통과. 기존 테스트 통과(자금에 묶인 기대값이 있으면 그 값만 고치고 보고).
2. 1시즌 측정에서 AI 전체 조교료·유지비·상금 합계를 보고(밸런스 판단은 Opus).
3. 엔진에 Math.random·Date.now 없음, 매직 넘버는 config. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 빚·파산·AI 말 정리 구현 금지(A3). UI 수정 금지. git commit 금지.
