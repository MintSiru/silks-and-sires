# M4-C8b 후원 등급 카탈로그 사전 열람

담당: Codex · 선행: 1436962(C8a sales/patron.ts) · 근거: 사용자 결정 — 대량 구매 혜택 '상위 북 사전 열람(조교사 사전 검사 포함)'

## 규칙
1. 카탈로그는 모든 세일에서 **세일 주 − `SALE_CATALOGUE_BUILD_LEAD_WEEKS`(6)** 에 만든다(지금은 −4). AI 입찰 상한도 그때 정해진다(지금과 같은 함수·같은 rng 키).
2. 플레이어에게 보이는 주 = 세일 주 − (`SALE_CATALOGUE_LEAD_WEEKS`(4) + `SALE_PATRON_PREVIEW_WEEKS[tier]`), 미리보기 주 { none: 0, silver: 1, gold: 2 }. tier 는 **그 주의** patronView(state).tier.
   `catalogueVisibleWeek(event, tier): Week`, `isCatalogueVisible(state, event, year): boolean`(올해 세일이면 state.date.week ≥ 보이는 주, 지난 해 이전 세일이면 항상 true)를 sales/patron.ts 에 추가.
3. 보이지 않는 카탈로그는 플레이어 API 에서 '없는 것'으로 다룬다:
   - bidding.ts: setMaxBid → 'catalogue_not_found', lotView → null, liveAuctionSteps → [], saleCalendarView 는 아래 4번 upcomingSales 결과를 그대로 반영.
   - inspection.ts: inspectLot → 'catalogue_not_found'.
4. player.ts:
   - 위탁 마감 = **만드는 주**(세일 주 − 6). 그 주와 그 뒤는 'too_late'. (`announceWeekOf` 를 만드는 주로 바꾸고, 보이는 주는 patron.ts 함수를 쓴다.)
   - upcomingSales: status 'catalogued' 는 카탈로그가 있고 플레이어에게 보일 때만, 그 밖에는(카탈로그가 있어도 안 보이면) 'upcoming'. announceWeek 필드는 **플레이어에게 보이는 주**(현재 등급 기준)로 채운다. 마감 정리 판정(올해 발표 주가 지났는데 카탈로그 없음 → closed)은 만드는 주 기준으로 유지.
5. system.ts: 이벤트 `sale_catalogue_published` 는 플레이어에게 보이기 시작하는 주에 한 번 낸다 — 매주, 올해 catalogued 카탈로그마다 `이번 주 === catalogueVisibleWeek(event, 지금 등급)` 이면 이벤트. 만드는 주(−6)에는 이벤트를 내지 않되, 그 주에 이미 보이는 경우(gold)는 위 조건으로 자연히 나온다. 등급이 도중에 올라 보이는 주를 지나쳐 버린 경우 이벤트가 빠질 수 있는데, 이는 허용한다(state 에 기록하지 않는다).

## 생성·수정할 파일
- src/engine/config/sales.ts(상수 2개 추가), src/engine/sales/patron.ts, src/engine/sales/system.ts, src/engine/sales/player.ts, src/engine/sales/bidding.ts, src/engine/sales/inspection.ts
- tests/engine/saleCatalogueAccess.test.ts(신규). 기존 테스트 중 '발표 주 = 세일 주 − 4' 를 가정한 것은 새 규칙(만드는 주 −6, none 보이는 주 −4)에 맞게 기대값만 고치고 보고(tests/engine/salesSystem.test.ts, saleBidding.test.ts, saleInspection.test.ts, tests/ui/salesView.test.ts 등).

## 수용 기준
1. none: 세일 주 −6 에 카탈로그가 state 에 생기지만 −5 까지 setMaxBid·lotView·inspectLot 은 '없음', −4 부터 가능. silver −5 부터, gold −6 부터.
2. 위탁: −7 주까지 성공, −6 부터 too_late.
3. 이벤트: none 은 −4 주에 1회, gold 는 −6 주에 1회. 52주 진행에서 세일당 이벤트 정확히 1회(none 기준 15개).
4. AI 입찰 상한·낙찰 결과는 만드는 주만 바뀌었을 뿐 같은 rng 키를 쓴다. 26주 레이스 결과 불변 테스트 통과.
5. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수 config.

## 금지
src/engine/types 수정 금지. 화면(src/ui) 수정 금지(테스트 기대값 수정만 허용). sales/privateTrade.ts·state/systems.ts 는 다른 작업자가 만든다 — 건드리지 말 것. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/saleCatalogueAccess.test.ts && npm test && npm run typecheck && npm run lint
