# M4-A2a 장부: 모든 돈의 흐름을 한 함수로

담당: haiku-coder · 선행: M4-A1(29648ef) · 근거: docs/m4-plan.md M4-A

## 목적
마주 자금을 바꾸는 모든 곳이 `recordMoney` 하나를 거치게 해서, 플레이어 장부와 AI 연간 합계가 남게 한다. 연말에 그해 요약을 만든다. (정기 비용·등록료·운송비는 A2b)

## 사용할 것 (수정 금지)
`EconomyState`·`LedgerEntry`·`LedgerCategory`·`LedgerTotals`·`EconomyYearSummary`(src/engine/types/economy.ts), `GameState.economy`, `createEmptyEconomyState`(economy/state.ts)

## 생성·수정할 파일
1. `src/engine/economy/ledger.ts` (신규)
   - `recordMoney(draft: GameState, ownerId: OwnerId, category: LedgerCategory, amount: Money, date: GameDate, horseId: HorseId | null = null): void`
     - amount 는 정수(아니면 RangeError). owner.funds += amount.
     - 플레이어(ownerId === draft.playerOwnerId)면 `economy.playerLedger` 에 항목 추가, `currentYear.player[category]` 누적. AI 면 `currentYear.aiTotals[category]` 누적만(항목은 남기지 않는다).
     - amount 0 이면 아무것도 하지 않는다.
   - `prunePlayerLedger(draft, date)`: `PLAYER_LEDGER_KEEP_WEEKS`(config/economy.ts, 104) 보다 오래된 항목 삭제.
   - `closeEconomyYear(draft, year)`: currentYear 를 `EconomyYearSummary` 로 만들어 yearSummaries 끝에 붙이고 currentYear 를 비운다. aiFundsMedian·aiFundsTotal = 플레이어를 뺀 모든 마주의 funds(중앙값은 정렬 후 가운데, 짝수면 두 값의 평균을 내림), playerFunds·playerDebt = 플레이어 funds·economy.debt. 같은 year 를 두 번 닫으면 아무것도 하지 않는다.
   - `ledgerTotalsSum(t: LedgerTotals): Money` 등 필요한 보조 함수.
2. 기존 자금 변경 지점을 recordMoney 로 바꾼다(동작·금액·난수 소비는 그대로):
   - `src/engine/season/apply.ts`: 상금 → 'prize'(horseId = 그 말), 시리즈 보너스 → 'series_bonus'.
   - `src/engine/season/system.ts`: 시리즈 보너스 → 'series_bonus'.
   - `src/engine/breeding/season.ts`: 교배 예약 종부료 → 'stud_fee_paid'(−fee, horseId = 암말), 불수태 환불 → 'stud_fee_paid'(+fee). creditOwner 는 recordMoney 로 대체.
3. 연말 처리: 연도 전환 주(seasonState 의 새해 처리, startNewSeason 이 도는 곳)에서 `closeEconomyYear(draft, 지난 해)` 와 `prunePlayerLedger` 를 부른다. 위치는 기존 연도 전환 처리 함수 안(새 시스템을 만들지 않는다).
4. `tests/engine/ledger.test.ts` (신규)
   - recordMoney: 플레이어는 항목·합계 둘 다, AI 는 합계만, funds 반영, 정수 아님 → 에러, 0 → 무변화.
   - 상금·시리즈 보너스·종부료·환불이 각각 맞는 종류로 기록된다(작은 상태로 applyRaceResult·bookCovering 호출 또는 bootstrapGame 후 몇 주 진행).
   - 한 해 진행(53주) 후 yearSummaries 1건, 플레이어 합계 = 그해 플레이어 장부 항목 합, prize 합계가 그해 플레이어 말 상금 합과 같다.
   - prune: 104주보다 오래된 항목이 지워진다.
   - 같은 시드 2회 진행 결과 toEqual(재현성), 저장 왕복.

## 수용 기준
1. 엔진에서 `owner.funds +=`·`-=` 직접 변경이 ledger.ts 밖에 남지 않는다(grep 으로 확인, 세계 생성 시 초기 자금 배정은 예외).
2. 기존 테스트 전부 통과(자금 값은 이전과 같아야 한다 — 기록만 추가).
3. 위 테스트 통과. 엔진에 Math.random·Date.now 없음. 매직 넘버는 config/economy.ts.
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 정기 비용·등록료 구현 금지(A2b). UI 수정 금지. git commit 금지.
