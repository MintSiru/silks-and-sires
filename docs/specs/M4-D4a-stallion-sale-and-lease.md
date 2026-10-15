# M4-D4a 종마 판매·교배권 보유·임대 (엔진 함수 + 임대 시스템 + 연말 정산 판매 진로)

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D4(사용자 결정 2026-10-15: 네 방식 모두, 국내 판매가 ≈ 예상 수입 3년치)
병행: 다른 작업자가 M4-D4a2(breeding/season.ts, stud/mortality.ts, stud/books.ts, stud/market.ts, horse/playerView.ts)를 수정 중 — 그 파일과 src/engine/state/systems.ts 는 건드리지 말 것(시스템 등록은 Opus)

목적: 플레이어가 종마(또는 종마로 은퇴하는 수말)를 국내·해외 스터드에 팔고, 국내 판매 때 교배권을 남기고, 종마를 셔틀·장기 임대해 수입을 얻게 한다.

## 사용할 타입 (src/engine/types — 수정 금지, 이미 추가됨)
- `YearEndChoice` 에 `'sell_domestic' | 'sell_overseas'`, `YearEndHorseDecision.nominations?: number`
- `StudState { slots; seasons; nominations: NominationRight[]; leases: StudLease[]; sales: StallionSaleRecord[] }`
- `StallionSaleMode = 'domestic' | 'overseas'`
- `NominationRight { stallionId; perSeason; season; used }`
- `StudLease { stallionId; kind: 'shuttle' | 'long'; year; returnSeason; rent; paidSeasons }`
- `StallionSaleRecord { stallionId; year; mode; price; buyerId: BreederId | null; nominations }`
- `Stallion.leasedAwayUntil?: number | null`
- LedgerCategory `'stallion_sale'`, `'stud_lease'`
- GameEvent `'stallion_sold' { horseId; mode; price; nominations; date }`, `'stallion_leased' { horseId; kind; returnSeason; rent; date }`, `'stud_lease_paid' { horseId; kind; rent; returned; date }`
- 기존 함수: `estimateStudFee`·`roundStudFee`(stud/value.ts), `standPlayerStallion`·`canStandAtStud`(stud/stand.ts), `submitYearEnd`·`yearEndCandidates`(stud/yearEnd.ts), `recordMoney`(economy/ledger.ts)

## 생성·수정할 파일 (5개)
1. `src/engine/config/stud.ts` — 추가(주석 근거 1줄씩):
   - `STALLION_SALE_FEE_MULT = 200`(종부료 × 200 ≈ 예상 수입 3년치)
   - `STALLION_SALE_FULL_AGE = 10`, `STALLION_SALE_AGE_DECAY = 0.08`, `STALLION_SALE_AGE_FLOOR = 0.3` — 나이 배수 = 나이 ≤ 10 이면 1, 아니면 max(0.3, 1 − 0.08 × (나이 − 10))
   - `STALLION_SALE_OVERSEAS_MULT = 0.65`
   - `NOMINATION_MAX_PER_SEASON = 2`, `NOMINATION_PRICE_FEE_MULT = 6`
   - `SHUTTLE_RENT_FEE_MULT = 20`, `LONG_LEASE_RENT_FEE_MULT = 50`, `LONG_LEASE_MAX_SEASONS = 5`
   - `STUD_DEAL_FIRST_WEEK = 28`(번식 시즌 정산 27주 다음), `STUD_DEAL_LAST_WEEK = BOOKING_OPEN_WEEK - 1`(예약 창 열기 전)
   - `SHUTTLE_RENT_PAY_WEEK = 52`(남반구 시즌 끝), `LONG_LEASE_PAY_WEEK = 27`(북반구 시즌 정산 주와 같음)
   - `STALLION_SALE_HISTORY_LIMIT = 60`
2. `src/engine/stud/stand.ts` — standPlayerStallion 의 Stallion 레코드 생성 부분을 `export function buildStallionRecord(draft, horseId, year, standsIn): Stallion` 로 뽑아낸다(종부료·북 상한·인기·수태율 계산은 그대로, 난수 스트림 이름도 그대로). standPlayerStallion 은 이것을 써서 동작이 바이트 단위로 같아야 한다.
3. `src/engine/stud/trade.ts`(신규)
   - `saleAgeMultiplier(age: number): number`
   - `stallionSalePrice(fee: Money, age: number, mode: StallionSaleMode, nominations: number): Money` — 국내 = fee × 200 × 나이 배수 − nominations × fee × 6, 해외 = fee × 200 × 나이 배수 × 0.65(교배권 없음). €1,000 단위 반올림, 0 이상.
   - `salePriceQuote(state, horseId): { fee: Money; domestic: Money; overseas: Money; nominationCost: Money } | null` — 플레이어 종마(status 'stud')는 stallion.fee, 플레이어 현역 수말(거세 안 함)은 estimateStudFee(state, id).fee 를 기준으로, 나이 = state.date.year − 출생 연도. 그 밖에는 null. 순수 함수(화면 표시용).
   - `domesticBuyer(state, country): BreederId | null` — 같은 나라 상업 생산자 중 scale large → medium → small, 같은 규모는 id 오름차순 첫 번째. 그 나라에 없으면 전체에서 같은 규칙. 없으면 null. 난수 미사용.
   - `applyStallionSale(draft, horseId, mode, nominations, date): GameEvent[]` — draft 에 반영(검증은 호출자):
     - 아직 Stallion 레코드가 없으면(연말 정산 수말) 국내 판매일 때 buildStallionRecord(draft, id, date.year, 플레이어 마주 나라) 로 만든다(firstSeasonYear = 그해). 해외 판매면 만들지 않는다.
     - 공통: 말 ownerId = null, trainerId = null, 플레이어 마주 horseIds 에서 뺀다, 열린 레이스 출주 신청 제거(submitYearEnd 의 stud/retire 처리와 같은 방식).
     - 국내: status 'stud'. nominations > 0 이면 StudState.nominations 에 `{ stallionId, perSeason: nominations, season: 0, used: 0 }` 추가.
     - 해외: status 'retired'(Stallion 레코드가 있으면 그대로 둔다 — 'stud' 가 아니므로 교배·북·재산정에서 빠진다).
     - 장부 'stallion_sale' +price, StudState.sales 에 기록(최근 STALLION_SALE_HISTORY_LIMIT 개), buyerId = 국내면 domesticBuyer(플레이어 마주 나라), 해외면 null.
     - 이벤트: 'horse_status_changed'(from → 새 status) 와 'stallion_sold'.
   - `sellStallion(state, horseId, mode, nominations): { ok: true; state; events } | { ok: false; error: TradeError }` — 플레이어 종마(status 'stud') 판매. 검증: `not_found` / `not_player_stallion` / `outside_deal_window`(state.date.week 가 STUD_DEAL_FIRST_WEEK~STUD_DEAL_LAST_WEEK 밖) / `leased`(StudState.leases 에 이 종마가 있음) / `invalid_nominations`(정수 0~2 아님, 또는 해외인데 > 0). 통과하면 structuredClone 에 applyStallionSale. 원본 불변.
   - `leaseStallion(state, horseId, kind, returnSeason?): 같은 결과형` — 검증: not_found / not_player_stallion / outside_deal_window / `already_leased` / `invalid_return_season`(long: year + 2 ≤ returnSeason ≤ year + 1 + LONG_LEASE_MAX_SEASONS, 정수; shuttle 은 인자 무시). rent = roundStudFee(fee × MULT)가 아니라 €1,000 단위 반올림(종부료 사다리 아님). StudLease 추가(shuttle: returnSeason = year + 1, paidSeasons 0). long 이면 stallion.leasedAwayUntil = returnSeason. 이벤트 'stallion_leased'.
   - `createStudLeaseSystem(): WeeklySystem`(id 'stud_leases') — 난수 미사용, 리스 배열 순서대로:
     - shuttle: date.week === SHUTTLE_RENT_PAY_WEEK && date.year === lease.year 이면 끝낸다. 말이 살아 있고(status 'stud') 플레이어 소유면 장부 'stud_lease' +rent, paidSeasons = 1, 'stud_lease_paid'(returned true). 아니면 지급 없이 지운다.
     - long: date.week === LONG_LEASE_PAY_WEEK 이고 lease.year + 1 ≤ date.year ≤ returnSeason − 1 이면 같은 조건에서 rent 지급, paidSeasons += 1. date.year === returnSeason − 1 이면 returned true, 리스 삭제, leasedAwayUntil = null. 말이 죽었거나 플레이어 소유가 아니면 지급 없이 삭제하고 leasedAwayUntil = null.
4. `src/engine/stud/yearEnd.ts`
   - yearEndCandidates: 거세 안 한 수말이고 새해 나이 ≥ STUD_MIN_AGE 이고 위탁(consignment) 중이 아니면 allowed 에 'sell_domestic', 'sell_overseas' 추가(종마사 칸과 무관). 추천 기본값 순서는 그대로(판매는 추천하지 않음). 후보에 `salePrice: { domestic: Money; overseas: Money } | null` 추가(교배권 0 기준, 판매 가능할 때만).
   - submitYearEnd: YearEndError 에 'invalid_nominations' 추가 — nominations 가 sell_domestic 이 아닌데 0 초과이거나, 정수 0~2 가 아니면 오류. 적용 시 sell_* 는 applyStallionSale(draft, id, mode, nominations ?? 0, { year, week: 1 }).
5. `tests/engine/stallionTrade.test.ts`(신규)

## 수용 기준
1. stallionSalePrice: fee €20,000·5세 국내 교배권 0 → €4,000,000, 교배권 2 → €3,760,000, 해외 → €2,600,000; 15세 국내 → €2,400,000(배수 0.6); 25세 → 배수 하한 0.3.
2. sellStallion 국내: 말은 ownerId null·status 'stud' 로 Stallion 레코드·종부료가 그대로, 플레이어 마주 horseIds 에서 빠지고, 장부 stallion_sale +가격, StudState.sales·nominations 기록. 해외: status 'retired'. 각 오류 코드(5종)가 단위 테스트로 확인된다. 원본 state 불변.
3. 연말 정산: 4세 수말을 sell_domestic(교배권 1)로 제출하면 Stallion 레코드가 생기고(firstSeasonYear = 그해, standsIn = 플레이어 나라) 종마사 칸을 쓰지 않으며(빈 칸 0 이어도 가능), 가격은 estimateStudFee 기준 공식과 같다. 거세마·암말엔 판매 진로가 없다. nominations 오류 검증.
4. 임대: shuttle 은 그해 52주 처리 때 종부료 × 20 을 받고 끝난다. long(returnSeason = year + 3)은 year+1, year+2 의 27주에 각각 종부료 × 50 을 받고 마지막에 leasedAwayUntil 이 null 이 된다. 임대 중 판매·재임대는 오류. 임대 중 종마가 죽으면(status 'dead') 지급 없이 정리.
5. buildStallionRecord 추출 뒤 기존 테스트(studStand·yearEnd 등)가 그대로 통과하고 standPlayerStallion 결과가 같다.
6. 같은 시드 2회 동일. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면(src/ui) 수정 금지. 병행 작업 파일(breeding/season.ts, stud/mortality.ts, stud/books.ts, stud/market.ts, horse/playerView.ts)과 state/systems.ts 수정 금지. trade.ts 에서 공용 난수(ctx.rng) 사용 금지. git commit 금지. 새 의존성 금지. 매직 넘버는 config/stud.ts 로.

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
npx vitest run tests/engine/stallionTrade.test.ts && npm test && npm run typecheck && npm run lint
