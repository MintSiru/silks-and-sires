# M4-C10a 세일·인맥 화면용 뷰 함수와 게임 API 연결

담당: haiku-coder · 선행: M4-C5(a3d6323) · 다음 티켓: C10b(화면 컴포넌트·탭, 브라우저 확인)

## 목적
세일(캘린더·카탈로그·로트·위탁·입찰)과 인맥(관계·전속 계약) 화면이 쓸 **순수 뷰 함수**와 **GameApi 행동**을 만든다. 화면 컴포넌트(JSX)는 C10b.

## 사용할 것 (수정 금지)
- 엔진: `consignToSale`·`withdrawConsignment`·`upcomingSales`(sales/player.ts), `setMaxBid`·`clearMaxBid`·`lotView`·`liveAuctionSteps`·`saleCalendarView`(sales/bidding.ts), `fitsKind`(sales/catalogue.ts), `getSalesData`, `retainerQuote`·`signRetainer`·`terminateRetainer`(economy/contracts.ts), `relationOf`·`relationKey`·`relationTier`(economy/relations.ts), `contractFor`(economy/contractQuery.ts)
- UI: `applyPlayerResult` 패턴(src/ui/game/useGame.ts), `feeKo`·`relationTierKo` 등 기존 text.ts 함수

## 생성·수정할 파일
1. `src/ui/game/useGame.ts` — GameApi 에 추가(전부 applyPlayerResult 로 state 갱신):
   `consignToSale(horseId, saleId, reserve: Money | null)`, `withdrawConsignment(horseId)`, `setMaxBid(saleId, year, lotNo, maxBid)`, `clearMaxBid(saleId, year, lotNo)`, `signRetainer(kind, personId)`, `terminateRetainer(kind, personId)`. 세일 데이터는 gameStaticData() 의 sales 를 넘긴다.
2. `src/ui/sales/salesView.ts`(신규, 순수):
   - `saleCalendarRows(state, data)`: { saleId, year, name, companyName, country, kindKo, monthKo('8월' 등, monthOfWeek), announceWeek, saleWeek, statusKo('발표 전'·'카탈로그 발표'·'마감'), lots: number | null, myBids, myConsignments }[]
   - `catalogueRows(state, saleId, year, data, filter?: { book?: number; sireQuery?: string; onlyMyBids?: boolean })`: { lotNo, book, horseId, horseName, sexAgeKo('수 1세' 등), sireName, vendorKo('상업 생산자 <이름>' | '마주 <이름>' | '내 위탁'), estimateKo('€70,000 ~ €140,000'), myBid: Money | null, resultKo: string | null }[] — sireQuery 는 부 이름 부분 일치(대소문자 무시).
   - `lotDetailView(state, saleId, year, lotNo, data)`: lotView 결과 + sireName·damName('—')·saleDateKo·vendorKo·reserveKo(내 위탁이면) + 이 로트에 걸린 내 입찰. **평가값·AI 상한은 절대 포함하지 않는다.**
   - `liveAuctionView(state, saleId, year, lotNo, playerMax, data)`: liveAuctionSteps 를 { priceKo, leaderKo('내 입찰'·'다른 구매자'·'—'), droppedKo } 로 바꾼 목록 + 최종 결과 문구.
   - `consignableRows(state, data)`: 플레이어 말마다 출품 가능한 올해 미발표 세일 목록(fitsKind 이고 발표 주가 지나지 않음) + 이미 위탁했으면 그 세일 이름.
3. `src/ui/staff/staffView.ts`(신규, 순수):
   - `staffRows(state, kind: 'trainer' | 'jockey', filter?: { onlyKnown?: boolean })`: { personId, name, country, age, relation(소수 1자리), tierKo, contractKo('전속 (2027년 말까지, 연 €92,000)' | null), quote: { ok: true; feeKo } | { ok: false; reasonKo } }[]. onlyKnown 이면 관계값이 있거나 전속인 사람만. 정렬: 전속 → 관계 내림차순 → 이름.
   - `reputationView(state)`: { reputation(소수 1자리), labelKo } — labelKo 구간: < 20 '무명', < 40 '신진', < 60 '중견', < 80 '유력', 그 이상 '명문'.
4. `src/ui/game/text.ts` — 끝에 추가: `saleKindKo`(5종), `consignErrorKo`(7종), `bidErrorKo`(7종), `retainerRefusalKo`(7종 + insufficient_funds), `saleStatusKo`.
5. `tests/ui/salesView.test.ts`, `tests/ui/staffView.test.ts`(신규).

## 수용 기준
1. 시드 20261011 상태에서 세일 캘린더 15행 이상, 1세마 세일 발표 후 catalogueRows 로트 수 = 카탈로그 로트 수, sireQuery·book 필터 동작.
2. lotDetailView·catalogueRows·liveAuctionView 결과 JSON 에 'valuation'·'aiBids' 문자열이 없다.
3. GameApi 새 행동은 실패 시 state 를 바꾸지 않고 오류를 돌려준다(엔진 함수 결과 그대로) — useGame 단위 테스트가 어려우면 엔진 결과 전달만 코드 검토로 보고.
4. staffRows: 전속 계약 1건을 넣은 상태에서 그 사람이 맨 위, contractKo 표시, quote 거절 사유 한국어.
5. text.ts 의 Record<…> 는 모든 키를 덮는다(타입으로 보장).
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine 수정 금지(읽기만). App.tsx·화면 컴포넌트(.tsx) 생성 금지(C10b). git commit 금지. 다른 에이전트(C6)가 src/engine/horse/playerView.ts·sales/inspection.ts·config 를 수정 중이다 — 그 파일은 읽기만.

## 테스트 명령
npx vitest run tests/ui/salesView.test.ts tests/ui/staffView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
