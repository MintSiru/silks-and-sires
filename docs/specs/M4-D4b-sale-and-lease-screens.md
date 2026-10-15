# M4-D4b 종마 판매·임대 화면 (연말 정산 판매 진로 + 내 종마 판매·임대 버튼)

담당: haiku-coder · 설계: docs/m4-stud-design.md D4 · 선행: M4-D4a·D4a2(커밋 0b1dd26)

목적: 플레이어가 연말 정산에서 은퇴하는 수말을 국내·해외 스터드에 팔고(교배권 0~2개 선택), '내 종마' 섹션에서 번식 시즌 밖(28~43주)에 종마를 팔거나 셔틀·장기 임대할 수 있게 한다.

## 사용할 엔진 함수·타입 (수정 금지)
- `src/engine/stud/trade.ts`:
  - `sellStallion(state, horseId, mode: StallionSaleMode, nominations: number): { ok: true; state; events } | { ok: false; error: TradeError }`
  - `leaseStallion(state, horseId, kind: 'shuttle' | 'long', returnSeason?: number): 같은 결과형`
  - `salePriceQuote(state, horseId): { fee; domestic; overseas; nominationCost } | null`
  - `stallionSalePrice(fee, age, mode, nominations): Money`
  - `TradeError = 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased' | 'invalid_nominations' | 'already_leased' | 'invalid_return_season'`
- `src/engine/stud/yearEnd.ts`: `YearEndCandidate.salePrice: { domestic; overseas } | null`, `YearEndHorseDecision.nominations?: number`
- `src/engine/breeding/season.ts`: `nominationsLeft(state, stallionId, season): number`, `bookingSeasonOf(date)`
- config/stud.ts: `STUD_DEAL_FIRST_WEEK`, `STUD_DEAL_LAST_WEEK`, `NOMINATION_MAX_PER_SEASON`, `SHUTTLE_RENT_FEE_MULT`, `LONG_LEASE_RENT_FEE_MULT`, `LONG_LEASE_MAX_SEASONS`
- `GameState.stud.leases: StudLease[]`, `stud.nominations: NominationRight[]`, `stud.sales: StallionSaleRecord[]`

## 수정할 파일 (5개 + 테스트 2개)
1. `src/ui/yearEnd/yearEndView.ts`
   - 선택지 라벨: sell_domestic → `국내 판매 (${feeKo(salePrice.domestic)})`, sell_overseas → `해외 판매 (${feeKo(salePrice.overseas)})`.
   - 행에 `nominationCostKo: string | null`(국내 판매 가능할 때 '교배권 1개당 판매가 −{종부료×6}' — salePriceQuote 의 nominationCost) 추가.
   - `salePriceWithNominationsKo(state, horseId, nominations): string` — stallionSalePrice(quote.fee, 새해 나이, 'domestic', n) 를 feeKo 로. 순수 함수.
2. `src/ui/yearEnd/YearEndScreen.tsx`
   - 진로가 sell_domestic 인 행에만 '교배권' 선택(0·1·2, 기본 0, aria-label `${이름} 교배권`)과 그 수를 반영한 판매가 표시. 다른 진로로 바꾸면 그 말의 nominations 를 지운다(제출에 0 초과가 남지 않게).
3. `src/ui/breeding/bookView.ts`
   - `MyStudStallionRow` 에 추가: `leaseKo: string | null`(임대 중이면 '셔틀 임대 중({returnSeason} 시즌 복귀)' 또는 '장기 임대 중({returnSeason} 시즌 복귀)'), `salePrice: { domesticKo: string; overseasKo: string } | null`(salePriceQuote, 없으면 null), `canDeal: boolean`(state.date.week 가 STUD_DEAL_FIRST_WEEK~STUD_DEAL_LAST_WEEK 안이고 임대 중이 아님), `shuttleRentKo`(종부료×SHUTTLE_RENT_FEE_MULT, 천 유로 반올림), `longRentKo`(종부료×LONG_LEASE_RENT_FEE_MULT, 같은 반올림, '/년').
   - `MyStudView` 에 추가: `dealWindowKo: string`(창 안이면 '종마 거래 가능(43주까지)', 밖이면 '종마 판매·임대는 28~43주에만 할 수 있습니다'), `nominations: { name: string; leftKo: string }[]`(stud.nominations 의 종마 이름과 '이번 예약 시즌 남은 교배권 n/perSeason' — 예약 시즌은 bookingSeasonOf(date) ?? date.year + 1, 남은 수는 nominationsLeft), `soldRows: { year: number; name: string; modeKo: '국내' | '해외'; priceKo: string }[]`(stud.sales 최신순 최대 10건).
   - `tradeErrorKo(error: TradeError): string` — 7개 오류 한국어 문구.
4. `src/ui/breeding/BreedingScreen.tsx` — '내 종마' 표에 열 '임대', '거래' 추가. 거래 열: canDeal 이면 버튼 '국내 판매', '해외 판매', '셔틀 임대', '장기 임대'. 판매·임대는 확인 단계(같은 행에서 '확정'/'취소', 국내 판매는 교배권 0~2 선택과 그에 따른 가격, 장기 임대는 복귀 시즌 선택 year+2 ~ year+1+LONG_LEASE_MAX_SEASONS). 실패하면 tradeErrorKo 를 role="alert" 로. 섹션에 dealWindowKo, '남긴 교배권'·'판매 기록' 소표(비었으면 표시 안 함).
5. `src/ui/game/useGame.ts` — GameApi 에 `sellStallion(horseId, mode, nominations)`, `leaseStallion(horseId, kind, returnSeason?)` 추가. 성공하면 상태를 바꾸고 이벤트를 eventLog 에 붙인다(기존 `book` 과 같은 방식, 같은 상한).
6. 테스트: `tests/ui/yearEndView.test.ts`, `tests/ui/bookView.test.ts` 에 케이스 추가.

## 수용 기준
1. 연말 정산 뷰: 4세 거세 안 한 수말 행의 선택지에 국내·해외 판매가 가격과 함께 있고, 암말·거세마 행에는 없다. salePriceWithNominationsKo(…, 2) 가 stallionSalePrice 공식과 같다.
2. 내 종마 뷰: 30주에는 canDeal true·dealWindowKo 가 가능 문구, 10주에는 false. 장기 임대 중 종마는 leaseKo 가 '장기 임대 중(… 시즌 복귀)'이고 canDeal false.
3. 국내 판매(교배권 1) 뒤 상태로 만든 뷰: 종마가 stallions 목록에서 빠지고 soldRows 첫 줄이 국내·가격, nominations 에 '1/1' 이 보인다.
4. tradeErrorKo 가 7개 오류 모두 비지 않은 문구를 준다.
5. `npm run build` 성공. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine 수정 금지(엔진 함수가 부족하면 [질문]에 적는다). 새 의존성 금지. 화면 문구에 실명(사람·경마장·레이스) 금지. git commit 금지.

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
npx vitest run tests/ui/yearEndView.test.ts tests/ui/bookView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
