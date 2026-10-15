# M4-C7b 내부거래 제안·후원 등급 화면

담당: Codex · 선행: 3a021c7(C7a sales/privateTrade.ts), 975e55f(C8b patron.ts) · 확인: Opus 브라우저

## 사용할 것 (수정 금지)
- 엔진: `privateOfferView`·`acceptPrivateOffer`·`declinePrivateOffer`·`inspectOfferHorse`(sales/privateTrade.ts), `patronView`(sales/patron.ts), `eligibleInspectors`(sales/inspection.ts)
- UI: `applyPlayerResult` 패턴(useGame.ts), `HorseCard`(검사 결과 표시), text.ts 의 `feeKo`·`formatDateKo` 등

## 생성·수정할 파일 (5개)
1. `src/ui/game/useGame.ts` — GameApi 에 `acceptPrivateOffer(offerId)`, `declinePrivateOffer(offerId)` 추가(applyPlayerResult).
2. `src/ui/sales/salesView.ts` — 끝에 추가:
   - `privateOfferRows(state)`: { offerId, horseId, horseName, sexAgeKo, sireName, ownerName, priceKo, estimateKo, expiresKo('2026년 3월 1주까지' — formatDateKo) }[] — **가치 원값 미포함**.
   - `patronBadge(state)`: { tierKo('일반'·'실버'·'골드'), spendKo(최근 2년 구매액), nextKo('실버까지 €…' | '최고 등급' ), benefitsKo: string[] (등급별 혜택 문구: 공개 주 N주 앞당김·구매 수수료 −N%p·출품 북 우대) }.
3. `src/ui/sales/SalesScreen.tsx` — (a) 맨 위 안내 줄 옆에 후원 등급 배지(patronBadge), (b) '개인 거래 제안' 구역(세일 일정 위): 제안이 없으면 '관계가 좋은 오너브리더가 1~3월에 유망주를 개인적으로 제안합니다(관계 20 이상 또는 명성 35 이상)' 안내. 있으면 표(말·성별 나이·부·제안 마주·가격·추정가·기한) + 행마다 '조교사 검사'(eligibleInspectors 선택 → inspectOfferHorse → HorseCard), '구매'(확인 대화 후 accept, 실패 문구), '거절'. 파산(locked)이면 구매 버튼 비활성.
4. `src/ui/game/text.ts` — 끝에 `privateOfferErrorKo`(offer_not_found·offer_invalid·insufficient_funds·not_eligible), `patronTierKo`.
5. `tests/ui/privateOfferView.test.ts`(신규) — privateOfferRows(제안 1건을 state 에 직접 넣어), patronBadge 등급 경계, 결과 JSON 에 'valuation' 문자열 없음.

## 수용 기준
1. `npm test && npm run typecheck && npm run lint && npm run build` 통과.
2. .tsx 에서 valuation·aiBids 참조 0건.
3. 검사 결과 표시는 기존 세일 로트 검사와 같은 컴포넌트·문구를 쓴다.

## 금지
src/engine 수정 금지. 새 의존성 금지. git commit 금지. src/engine/horse/playerView.ts 는 Opus 가 동시에 수정한다 — 건드리지 말 것.

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
npx vitest run tests/ui/privateOfferView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
