# M4-A4 경제 화면·자금 표시

담당: haiku-coder · 선행: M4-A3(7acddad)

## 목적
플레이어가 돈 흐름을 볼 수 있게 한다: 상단 자금·빚 표시, 손익표, 경고·파산 안내.

## 사용할 것 (수정 금지)
`GameState.economy`(mode·debt·negativeWeeks·bankrupt·playerLedger·currentYear·yearSummaries), `LedgerCategory`, `canSpendDiscretionary`(economy/solvency.ts), config/economy.ts 의 `LEGACY_BANKRUPT_WEEKS`

## 생성·수정할 파일
1. `src/ui/economy/economyView.ts`(신규, 순수 함수)
   - `fundsBanner(state)`: { funds, debt, mode, warning: null | { kind: 'debt' | 'negative' | 'bankrupt'; weeksLeft: number | null } }
   - `yearPnl(state, year?)`: 올해(currentYear.player) 또는 지난 해(yearSummaries)의 종류별 수입·지출 행(수입·지출 나눠 금액 내림차순), 합계·순익
   - `recentLedger(state, limit = 30)`: 최근 장부 항목(날짜·종류·금액·말 이름)
   - `pnlHistory(state)`: 연도별 순익·연말 자금·빚(표·간단한 막대용)
2. `src/ui/game/text.ts` — `ledgerCategoryKo`(15종), `economyModeKo`, 교배 실패 문구: 캐주얼 빚이 있을 때는 '빚을 갚기 전에는 종부료를 낼 수 없습니다' 가 나오게(bookingErrorKo 에 상태 인자를 더하거나 화면에서 분기).
3. `src/ui/economy/EconomyScreen.tsx`(신규) — 탭 '경제': 상단 요약(자금·빚·모드), 올해 손익표, 지난 해 선택, 최근 장부, 연도별 추이 표.
4. `src/ui/App.tsx` — 탭 '경제' 추가, 모든 탭 위에 자금 배너(자금 €, 빚이 있으면 빚 €, 경고 문구). 레거시 파산이면 붉은 배너 '파산 — 더 진행할 수 없습니다' 와 진행 버튼 비활성화(시즌 탭·목장 탭의 진행 버튼).
5. `tests/ui/economyView.test.ts`(신규) — 각 함수: 손익 합계 = 장부 합, 종류 정렬, 경고 종류(빚·음수 weeksLeft·파산), 지난 해 선택.

## 수용 기준
1. 위 테스트 통과.
2. 브라우저에서 경제 탭·배너 표시(확인은 Opus).
3. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine 수정 금지(읽기만). git commit 금지. 다른 에이전트가 src/engine/economy·season·state 와 src/ui/game/text.ts(relationTierKo 추가)를 동시에 수정할 수 있다 — text.ts 는 파일 끝에 추가하는 식으로 충돌을 피하고, 충돌이 나면 보고.
