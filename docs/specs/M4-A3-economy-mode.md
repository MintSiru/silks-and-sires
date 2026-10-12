# M4-A3 경제 모드: 빚(캐주얼)·파산(레거시)·AI 급매

담당: haiku-coder · 선행: M4-A2b(19567cb) · 근거: 사용자 결정(2026-10-12) — 두 모드를 새 게임 때 선택

## 사용할 것 (수정 금지)
`EconomyState`(mode·debt·negativeWeeks·bankrupt), `GameEvent` 의 'economy_warning'·'bankrupt'·'horse_sold'(Opus 추가), `recordMoney`(economy/ledger.ts), `createCostsSystem`(economy/costs.ts), `advanceWeek`(time/advance.ts)

## 규칙 (상수는 config/economy.ts)
1. **판정 시점:** 매주 비용 시스템 다음에 도는 `createSolvencySystem()`(새 WeeklySystem, systems.ts 에서 costs 뒤).
2. **캐주얼(플레이어):**
   - 자금이 음수면 그만큼을 빚으로 옮긴다: `debt += −funds`, 자금은 0(이 이동은 장부에 남기지 않는다 — 빚 잔액 변화일 뿐). 빚이 0 에서 처음 생기면 'economy_warning'(debt_started, weeksLeft null).
   - 이자: 빚이 있으면 매주 `round(debt × DEBT_INTEREST_WEEKLY)`(0.001) 를 빚에 더하고 장부에 'interest' 로 −이자 기록(자금은 0 그대로이므로 recordMoney 로 자금을 줄였다가 바로 빚으로 옮기는 방식이 아니라, 장부 항목만 남기는 보조 함수를 ledger.ts 에 추가해도 된다 — `recordLedgerOnly`).
   - 자동 상환: 자금 > `DEBT_REPAY_BUFFER`(50,000) 이면 `min(debt, funds − buffer)` 를 갚는다(자금 감소, 장부 'other' 가 아니라 빚 상환은 장부에 남기지 않는다 — 자산 이동).
   - 기능 제한: `canSpendDiscretionary(state, amount): boolean` — 빚이 있으면 false, 없으면 funds ≥ amount. 교배 예약(bookCovering)은 이 함수를 쓰도록 바꾼다(빚 있으면 'insufficient_funds'). 이후 세일 구매(M4-C)도 이 함수를 쓴다.
3. **레거시(플레이어):**
   - 자금이 음수인 주마다 negativeWeeks += 1, 0 이상이면 0 으로. 음수가 된 첫 주에 'economy_warning'(negative_funds, weeksLeft = LEGACY_BANKRUPT_WEEKS − negativeWeeks), 그 뒤 4주마다 같은 경고.
   - negativeWeeks ≥ `LEGACY_BANKRUPT_WEEKS`(12) → bankrupt = true, 'bankrupt' 이벤트.
   - 파산 뒤 advanceWeek 는 상태를 바꾸지 않고(날짜도 그대로) 빈 이벤트로 돌려준다(time/advance.ts 에 한 줄 검사).
   - canSpendDiscretionary: 레거시는 funds ≥ amount(음수면 false).
4. **AI 마주(모드 무관):** 자금이 음수인 AI 마주는 그 주에 보유 현역마 중 평가값(OR, 없으면 능력 환산 — populationSystem 의 selectionValue 와 같은 방식) 가장 낮은 말 1두를 **같은 나라에서 자금이 가장 많은 AI 마주**에게 급매한다.
   - 가격 = `max(DISTRESS_PRICE_MIN, (평가값 − DISTRESS_PRICE_BASE_OR) × DISTRESS_PRICE_PER_OR)`(10,000 / 40 / 1,500). 구매자 'private_sale' −가격, 판매자 +가격. horse.ownerId·두 마주 horseIds 갱신, 'horse_sold' 이벤트(AI 끼리는 이벤트 로그에 남기지 않아도 된다 — eventLog 크기 고려, 플레이어 관련만 남긴다).
   - 조교사는 그대로. 마주 ID·말 ID 오름차순으로 결정적.
5. 새 게임: `NewGameOptions.economyMode` 를 UI 새 게임 화면에서 고를 수 있게(라디오 2개, 기본 캐주얼, 짧은 설명). `src/ui/breeding/BreedingScreen.tsx` 의 새 게임 패널 + `useGame` 의 newGame 인자.

## 생성·수정할 파일
- src/engine/economy/solvency.ts(신규), src/engine/economy/ledger.ts(보조 함수), src/engine/config/economy.ts, src/engine/state/systems.ts, src/engine/time/advance.ts, src/engine/breeding/season.ts(canSpendDiscretionary)
- src/ui/breeding/BreedingScreen.tsx, src/ui/game/useGame.ts (모드 선택만)
- tests/engine/solvency.test.ts(신규): 캐주얼 빚 전환·이자·상환·경고 1회·교배 예약 거절, 레거시 경고·12주 파산·파산 후 진행 멈춤·회복 시 리셋, AI 급매(가격·소유 이전·결정성), 같은 시드 재현·저장 왕복.
- 기존 테스트가 흐름 변경으로 깨지면 그 기대값만 고치고 보고(파일 5개 초과는 테스트·UI 포함 허용).

## 수용 기준
1. 위 테스트 통과.
2. bootstrapGame 후 플레이어가 아무것도 안 하고 3시즌 진행: 캐주얼은 빚이 생겨도 진행, 레거시는 파산 시점이 결정적(측정값 보고: 자금 음수 시작 주, 파산 주).
3. AI 3시즌: 급매 횟수·AI 자금 음수 마주 수(시즌 말) 보고.
4. 엔진에 Math.random·Date.now 없음, 상수는 config. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지. 세일 시장 구현 금지(M4-C). git commit 금지.
