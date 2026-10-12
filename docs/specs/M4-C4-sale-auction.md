# M4-C4 AI 입찰·경매 처리·낙찰 후 처리·현역 편입

담당: haiku-coder · 선행: M4-C2b(sales/system.ts) · 설계: docs/m4-sales-design.md 1·2·4장

## 사용할 것 (수정 금지)
- 타입: `SaleLot`·`AiBid`·`SaleLotResult`·`SaleCatalogue`·`PlayerBid`·`SaleSummary`·`SaleEventDef`, GameEvent `sale_lot_result { saleId; year; lotNo; horseId; role: 'buyer'|'vendor'|'underbidder'; result; date }`, `horse_sold`
- `recordMoney`(economy/ledger.ts), `canSpendDiscretionary`(economy/solvency.ts), `buildMarket`·`isRacingHorse`·`racingHorseIds`(world/population.ts), `createRng`

## 생성·수정할 파일 (5개 + 허용 1)
1. `src/engine/sales/auction.ts`(신규) — 아래 함수.
2. `src/engine/sales/system.ts` — 발표 직후 로트마다 `computeAiBids`, 판매 주에 그 주 북의 로트 `resolveLot` 처리, 세일 마지막 북 처리 뒤 status 'closed'·`SaleSummary` 추가.
3. `src/engine/world/populationSystem.ts` — 세일 출신 현역 편입(아래 '현역 편입'), 나라 판정 `racingCountryOf`.
4. `src/engine/config/sales.ts` — 아래 상수(끝에 절 추가).
5. `tests/engine/saleAuction.test.ts`(신규).
- (허용) `src/engine/world/population.ts`: private `pickTrainer` 를 export 만.

## AI 입찰 `computeAiBids(state, lot, event, rng): AiBid[]`
- 후보: 플레이어가 아닌 마주 중 (세일 나라와 같은 나라) 또는 (tier 'major' 이고 나라가 유럽 5개국·AE 중 하나) — 미국 세일은 미국 마주 + 유럽·AE major.
- 예산 = funds × `SALE_BUDGET_SHARE[tier]`(major 0.25 · mid 0.15 · small 0.1). 예산 < valuation × `SALE_MIN_BUDGET_RATIO`(0.5)인 마주는 후보에서 뺀다.
- 관심 수 n = rng.int(`SALE_INTEREST_MIN`(2), `SALE_INTEREST_MAX`(8)), 북 1 이면 +2(최대 후보 수). 후보 중 가중(major 4 · mid 2 · small 1) 비복원 추첨.
- 상한 = valuation × exp(rng.normal(0, `SALE_BID_SPREAD`(0.35))) × (1 + (persona.prestige − 0.5) × `SALE_PRESTIGE_PULL`(0.4) × (북 1 이면 1, 아니면 0.3)), 예산으로 자르고 정수로.
- 높은 순 정렬(동률 ownerId 오름차순) 후 상위 `SALE_AI_BIDS_STORED`(3)개.
- rng: 로트마다 `createRng(`${initialSeed}:bids:${saleId}:${year}:${lotNo}`)`. ctx.rng 미사용.

## 경매 `resolveLot(state, lot, event, playerMax: Money | null)` → `{ result: SaleLotResult; buyerIsPlayer: boolean }`(순수)
- 호가 단위 `bidIncrement(price)`: < 10,000 → 500 / < 50,000 → 1,000 / < 200,000 → 5,000 / < 1,000,000 → 10,000 / 그 이상 25,000 (`SALE_BID_LADDER` 표).
- 유효 입찰자: aiBids 중 그 마주 자금이 상한 × (1 + buyerPremiumRate) 이상인 것 + 플레이어(playerMax 가 있고 `canSpendDiscretionary(state, playerMax × (1 + rate))` 일 때).
- 시작가 = event.minimumBid. 상한이 minimumBid 미만인 입찰자는 빠진다. 최고 상한 입찰자가 이긴다(동률은 AI 우선 — 먼저 낸 입찰). 낙찰가 = min(최고 상한, max(minimumBid, 두 번째 상한 + bidIncrement(두 번째 상한))), 두 번째가 없으면 minimumBid. 낙찰가를 호가 단위로 내림하지 않는다(정수).
- 유보가가 있고 낙찰가 < 유보가: 최고 상한 ≥ 유보가면 낙찰가 = 유보가로 판매, 아니면 `bought_back`(lastBid = 최고 상한, 입찰자 없으면 0).
- 입찰자가 없으면 bought_back(lastBid 0).
- 말이 없거나 dead·retired 로 바뀌었거나 소유자가 판매자와 달라졌으면 `withdrawn`.

## 낙찰 후 처리(시스템)
- 돈: 구매자 `recordMoney(buyer, 'sale_purchase', −price, horseId)`, `recordMoney(buyer, 'sale_commission', −round(price × buyerPremiumRate))`. 판매자가 마주면 `sale_proceeds +price`, `sale_commission −round(price × SALE_VENDOR_COMMISSION)`(0.05). 판매자가 상업 생산자면 breeder.funds 에 (price − 판매 수수료) 를 직접 더한다(장부 없음).
- 플레이어 낙찰가는 `sales.playerSpendByYear[year]` 에 더한다.
- 말 이전(종류별, 설계 2장):
  - yearling·foal: ownerId = 구매자, 구매자 horseIds 추가, 생산자 horseIds 에서 제거, status·trainer 그대로(null). 구매자가 플레이어면 플레이어 말(목장 1세·이유마로 기존 화면에 보인다).
  - breeze_up: 위와 같고, AI 구매자면 status 'in_training' + `pickTrainer`(구매자의 경주 나라). 플레이어면 status 그대로·trainer null(플레이어가 맡긴다).
  - horses_in_training: 소유 이전(solvency 의 transferHorse 와 같은 방식). AI 구매자면 조교사 나라가 구매자 경주 나라와 다를 때만 pickTrainer, 플레이어 구매면 trainer 를 그대로 두되 플레이어가 바꿀 수 있다.
  - breeding_stock: 플레이어 구매면 ownerId·horseIds, `state.mares[horseId]` 가 없으면 빈 Mare 레코드(coveredBy null, pregnant false, foals [], blackTypeProduce 0 등 기존 생성 함수가 있으면 그것) 추가. AI 구매면 말을 세계에서 뺀다(아래).
  - 구매자 나라가 유럽 5개국·AE 가 아니면(예: 미국 마주) 말을 세계에서 뺀다(수출).
- 바이백·유찰: 생산자 로트 → 말을 세계에서 뺀다. 마주 로트(AI·플레이어) → 그대로 남는다.
- **세계에서 빼기**: state.horses 에서 삭제, 생산자·마주 horseIds 에서 제거. 그 말을 가리키는 다른 참조가 없는지(로트 생성마는 자손·레이스 기록이 없다) 테스트로 확인. 로트의 horseName·sireId 사본은 남는다.
- 이벤트: 플레이어가 구매자·판매자·낙찰 못 한 입찰자일 때만 `sale_lot_result`. 소유 이전이 생기면(플레이어 관련만) `horse_sold`.
- 요약: 세일의 모든 북이 끝나면 `SaleSummary`(offered = 로트 수, sold, turnover, median(낙찰가), top) 를 history 에 넣고 status 'closed'.

## 현역 편입(populationSystem, 연간 교체 주)
- `racingCountryOf(state, horse)`: countryOfBirth 가 유럽 5개국이면 그것, 아니면 마주 나라가 유럽 5개국이면 그것, 아니면 'GB'. 연간 교체의 나라별 루프(조기 은퇴·하위 정리·은퇴 집계)를 countryOfBirth 대신 이 함수로 바꾼다(지금 말은 모두 유럽산이라 결과 불변이어야 한다 — 고정 해시 테스트 통과).
- 5단계(신규 투입) 앞에: AI 마주 소유·status foal/weanling/yearling·올해 2세 이상인 말을 '세일 출신'으로 status 'in_training' + pickTrainer(racingCountryOf), 나라별로 센다(id 오름차순). 그 나라 신규 투입 수 = max(0, 은퇴 수 − 세일 출신 수).

## 수용 기준
1. resolveLot 표 테스트: 입찰자 0·1·2·3명, 유보가 위·아래, 플레이어가 최고·두 번째·동률, 자금 부족 입찰 제외, 호가 단위 경계(9,999·10,000·49,999 …).
2. 시드 20261011 bootstrapGame → 2년(104주) 진행: 세일 15개×2년 모두 closed·요약 생성, 판매율(sold/offered) 세일 종류별 보고(목표 1세마 70~90%), 1세마 낙찰가 중앙값 ÷ valuation 중앙값 비율 보고(목표 0.8~1.3).
3. 돈 보존: 한 세일 처리 전후 (모든 마주 funds + 모든 생산자 funds + 수수료 합) 이 같다(수수료는 세계 밖으로 나가는 돈으로 따로 합산).
4. 현역 편입: 2년째 주 1 에 세일 출신 수 > 0, 나라별 현역마 수가 목표(POPULATION_IN_TRAINING) ±3% 안. 세일 출신·신규 투입 두수 보고.
5. 플레이어: 1세마 로트에 상한가를 넣고 진행 → 낙찰이면 플레이어 말·장부 sale_purchase·sale_commission·이벤트 buyer, 못 사면 underbidder 이벤트.
6. 성능: 104주 진행 주당 중앙값·최대 ms(세일 주 포함) 보고. 세일 주 최대 1,500 ms 이하 목표.
7. 같은 시드 2회 동일, 저장 왕복 동일. 기존 고정 해시·재현성 테스트 통과(세일이 레이스 결과를 바꾸는 것은 2년째부터 허용 — 1년째 26주 이전 레이스 결과는 불변).
8. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수 config.

## 금지
src/engine/types 수정 금지. 플레이어 입찰 API(setMaxBid 등)·실시간 보기·화면은 C5(테스트에서는 state.sales.playerBids 에 직접 넣는다). catalogue.ts·valuation.ts 수정 금지. git commit 금지.

## 테스트 명령
npx vitest run tests/engine/saleAuction.test.ts tests/engine/salesSystem.test.ts && npm test && npm run typecheck && npm run lint
