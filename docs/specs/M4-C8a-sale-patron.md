# M4-C8a 세일 후원 등급: 구매 수수료 할인·출품 우대

담당: Codex(외부 모델, Haiku 와 같은 사이클) · 선행: 9c39075 · 근거: 사용자 결정(2026-10-12) — 대량 구매 혜택 = 상위 북 사전 열람·구매 수수료 할인·출품 우대. 이 티켓은 앞의 '사전 열람'을 뺀 둘(사전 열람은 C8b).

## 사용할 것 (수정 금지)
`SalesState.playerSpendByYear`(연도별 플레이어 낙찰가 합), `SaleEventDef.buyerPremiumRate`, `SaleEventDef.books`, `bookForSire(event, sireTier)`(sales/catalogue.ts), `canSpendDiscretionary`

## 규칙
1. 후원 등급 `SalePatronTier = 'none' | 'silver' | 'gold'` (sales/patron.ts 에서 export, 타입 파일 아님):
   최근 2년(올해 + 지난해) 플레이어 세일 구매 합 ≥ `SALE_PATRON_GOLD_SPEND`(3,000,000) → gold, ≥ `SALE_PATRON_SILVER_SPEND`(1,000,000) → silver, 그 밖 none.
2. 구매 수수료 할인: 플레이어가 구매자일 때 실효 수수료율 = max(0, buyerPremiumRate − 할인). 할인 `SALE_PATRON_PREMIUM_DISCOUNT` = { none: 0, silver: 0.01, gold: 0.02 }.
   적용 지점 3곳 모두 같은 함수 `playerPremiumRate(state, event)` 로: auction.ts 의 playerBidValid(자금 판정), auction.ts 낙찰 정산의 구매자 수수료(구매자가 플레이어일 때만 — AI 구매자는 그대로), bidding.ts setMaxBid 의 자금 판정.
   등급은 **정산 시점** state 로 판정한다(같은 세일 안에서 등급이 올라가면 그 뒤 로트부터 할인).
3. 출품 우대: 플레이어 위탁 로트의 북 = bookForSire(event, 부 등급) − `SALE_PATRON_BOOK_BONUS[tier]`(none 0 · silver 1 · gold 1), 최소 1. 카탈로그 생성 시점 등급으로 판정(catalogue.ts 의 위탁 로트 북 배정 한 곳).
4. 화면용: `patronView(state): { tier; spendTwoYears: Money; nextTier: 'silver' | 'gold' | null; toNext: Money | null }`.

## 생성·수정할 파일
- src/engine/config/sales.ts(끝에 절 추가), src/engine/sales/patron.ts(신규), src/engine/sales/auction.ts, src/engine/sales/bidding.ts, src/engine/sales/catalogue.ts
- tests/engine/salePatron.test.ts(신규)

## 수용 기준
1. 등급 경계: 999,999 → none, 1,000,000 → silver, 3,000,000 → gold, 3년 전 구매는 셈하지 않음.
2. 할인: gold 플레이어가 수수료율 0.05 세일에서 €100,000 낙찰 → 장부 sale_commission −3,000. 같은 로트를 AI 가 사면 AI 수수료 5,000 그대로. silver 는 −4,000.
3. 자금 판정: gold 일 때 자금 103,000 으로 상한 100,000 입찰 가능, none 이면 insufficient_funds(105,000 필요).
4. 출품 우대: 부 등급 3 인 1세마 위탁이 none 이면 bookForSire 결과 북, gold 면 한 북 앞(최소 1).
5. 기존 테스트 전부 통과(플레이어 구매가 없는 기존 결과 불변). `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수는 config.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 사전 열람(카탈로그 공개 시점) 구현 금지(C8b). git commit 금지. 새 의존성 금지.

## 보고 양식 (CLAUDE.md 4장과 같음)
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/salePatron.test.ts && npm test && npm run typecheck && npm run lint
