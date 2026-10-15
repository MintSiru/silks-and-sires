# M4-BET3 베팅 화면

담당: Codex · 선행: 2bf3dc7(BET2 betting/betting.ts) · 확인: Opus 브라우저 · 근거: 사용자 결정 — 단승·연승, 초반 자금 수단

## 사용할 것 (수정 금지)
엔진: `placeBet`·`cancelBet`·`forecastOdds`·`eachWayTerms`·`bettingView`·`BetError`(betting/betting.ts), `getBookmakers()`(data/staticData.ts), `formatOdds`(race/odds.ts), config/betting.ts 상수(BET_MAX_OUTLAY_PER_RACE 등). UI: `applyPlayerResult` 패턴, text.ts `feeKo`·`formatDateKo`.

## 생성·수정할 파일 (6개)
1. `src/ui/game/useGame.ts` — GameApi 에 `placeBet(input)`, `cancelBet(betId)`(applyPlayerResult, bookmakers 는 getBookmakers()).
2. `src/ui/betting/bettingView.ts`(신규, 순수) —
   - `raceBettingView(state, meetingId, raceId)`: { raceName, dateKo, runners: { horseId, name, saddle?(없으면 선언 순), forecastKo('7/2'), isMine: boolean }[], eachWayKo('연승: 3착까지 배당 1/5' | '연승 불가(4두 이하)'), limitLeftKo(이 레이스에 더 걸 수 있는 금액) }.
   - `myBetsView(state)`: 미정산(말·레이스·종류·지출·회사·취소 가능 여부) / 최근 정산(말·레이스·SP·착순·지출·회수·손익, 최근 20건) + 올해 베팅 손익 합계(장부 'betting' 합).
3. `src/ui/betting/BettingPanel.tsx`(신규) — 레이스 하나의 베팅 패널: 예상 오즈 표(내 말 표시), 베팅 회사 선택, 단승/연승 선택, 금액 입력(빈칸·0 막음), '베팅' 버튼, 결과 문구(betErrorKo). 아래에 '내 베팅'(미정산 + 취소 버튼, 최근 정산). 맨 위 안내 한 줄: '예상 오즈는 참고용이며 실제 배당은 레이스 확정 오즈(SP)로 정산됩니다. 연승은 금액의 2배가 나갑니다.'
4. `src/ui/season/SeasonScreen.tsx` — 레이스 행마다 '베팅' 버튼(출주 접수 중·마감 전 레이스), 누르면 BettingPanel 이 열린다(한 번에 하나). locked(파산)이면 베팅 버튼 비활성.
5. `src/ui/game/text.ts` — 끝에 `betErrorKo`(8종), `betKindKo`.
6. `tests/ui/bettingView.test.ts`(신규) — 시드 20261011 상태의 다음 주 개최 레이스 하나로: 예상 오즈 행 수 = 선언 두수, 연승 문구, 남은 한도 계산, myBetsView 손익 합 = 장부 합.

## 수용 기준
1. `npm test && npm run typecheck && npm run lint && npm run build` 통과.
2. 브라우저 흐름(Opus 확인): 새 게임 → 시즌 탭 → 다음 주 레이스 '베팅' → 단승 €100 → '내 베팅'에 표시·자금 감소 → 1주 진행 → 정산 기록(SP·회수) 표시, 경제 탭 장부에 '베팅'.
3. 숫자 오즈는 엔진의 formatOdds 와 같은 표기('Evs', '7/2').

## 금지
src/engine 수정 금지. 새 의존성 금지. git commit 금지. 다른 작업자(Haiku)가 src/ui/staff/·src/engine/people·src/engine/season/system.ts·src/engine/config/people.ts 를 수정 중 — 건드리지 말 것.

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
npx vitest run tests/ui/bettingView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
