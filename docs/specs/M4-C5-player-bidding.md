# M4-C5 플레이어 입찰 API와 실시간 경매 보기

담당: haiku-coder · 선행: M4-C4(sales/auction.ts resolveLot·playerBidValid·bidIncrement) · 설계: docs/m4-sales-design.md 5장
근거: 사용자 결정(M4 시작) "상한 설정 + 보고 싶을 때만 실시간"

## 사용할 것 (수정 금지)
`PlayerBid`·`SaleLot`·`SaleCatalogue`·`SaleEventDef`·`SalesState`, `resolveLot`·`bidIncrement`·`playerBidValid`(sales/auction.ts), `canSpendDiscretionary`, `PlayerResult`, `estimateRange`(sales/valuation.ts), `SalesStaticData`(sales/system.ts)

## 생성·수정할 파일
- src/engine/sales/bidding.ts(신규)
- tests/engine/saleBidding.test.ts(신규)
- (허용) src/engine/config/sales.ts 끝에 상수 절

## 함수
1. `setMaxBid(state, saleId, year, lotNo, maxBid: Money, data): PlayerResult<BidError>`
   `BidError = 'catalogue_not_found' | 'lot_not_found' | 'lot_closed' | 'own_lot' | 'invalid_amount' | 'insufficient_funds' | 'too_late'`
   - 카탈로그가 'catalogued' 이고 그 로트 result 가 null 이어야 한다. 로트의 판매 주(세일 week + 북 weekOffset)가 이미 지났으면 'too_late'(같은 주는 허용 — 이번 주 진행 때 처리된다).
   - 플레이어 위탁 로트면 'own_lot'. maxBid 는 정수 ≥ event.minimumBid, 아니면 'invalid_amount'.
   - 자금: `canSpendDiscretionary(state, round(maxBid × (1 + buyerPremiumRate)))` 거짓이면 'insufficient_funds'.
   - 같은 로트 입찰은 덮어쓴다. playerBids 정렬(saleId, year, lotNo).
2. `clearMaxBid(state, saleId, year, lotNo): PlayerResult<'bid_not_found'>`
3. `lotView(state, saleId, year, lotNo, data)`: 화면용 — `{ lot 기본 정보(lotNo, book, horseId, horseName, sireId, vendorKind, reserveKnown: 플레이어 위탁이면 유보가, 아니면 null), estimate: estimateRange(valuation), saleWeek, myBid: Money | null, result }`. **valuation·aiBids 는 내보내지 않는다**(숨김 값).
4. `liveAuctionSteps(state, saleId, year, lotNo, playerMax: Money | null, data): AuctionStep[]`
   - 실시간 보기용 호가 사다리. `AuctionStep = { price: Money; leader: 'player' | 'ai' | 'none'; dropped: number /* 이 단계에서 빠진 AI 수 */ }`.
   - minimumBid 부터 bidIncrement 로 올라가며, 각 가격에서 그 가격 이상을 낼 수 있는 입찰자 수를 센다. 남은 입찰자가 1명이 되거나(그 사람이 선두) 0명이 되면 멈춘다. 마지막 단계의 가격·선두는 `resolveLot(state, lot, event, playerMax)` 의 결과(낙찰가·구매자)와 **반드시 같다**(바이백이면 leader 'none' 이고 마지막 가격 = lastBid).
   - 단계 수 상한 `SALE_LIVE_MAX_STEPS`(200). 넘으면 앞쪽을 건너뛰고(가격이 큰 쪽 단계만 남김) 마지막 결과는 그대로.
   - 순수 함수(상태 불변). 화면은 이 목록을 0.3~0.6초 간격으로 보여 주고, 플레이어가 '올리기'를 누르면 playerMax 를 올려 다시 부른 뒤 setMaxBid 로 저장한다(이 티켓은 엔진만).
5. `saleCalendarView(state, data)`: upcomingSales 결과에 각 세일의 내 입찰 수·내 위탁 수·발표 여부를 붙인 목록(화면 C10 용).

## 수용 기준
1. setMaxBid 실패 사유 7개 각각 테스트, 덮어쓰기·정렬·clear.
2. lotView 에 valuation·aiBids 키가 없다(Object.keys 검사).
3. liveAuctionSteps 의 마지막 단계 = resolveLot 결과: 무작위 로트 200개(시드 20261011 카탈로그, playerMax 를 null·낮게·높게 3가지) 모두 일치.
4. 단계 가격은 단조 증가, 첫 단계 = minimumBid(입찰자가 있으면), 상한 200 지킴.
5. 시드 20261011 진행 중 1세마 세일 판매 주에 setMaxBid 로 북 1 로트에 큰 상한 → 진행 후 플레이어 낙찰, 작은 상한 → underbidder.
6. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. auction.ts·system.ts·catalogue.ts 수정 금지(문제는 보고). 화면 구현 금지(C10). git commit 금지.

## 테스트 명령
npx vitest run tests/engine/saleBidding.test.ts && npm test && npm run typecheck && npm run lint
