# M6-0b 판매 담당(자동 판매 제안 · 세일 위탁)

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 근거: docs/reports/M6-0-30year.md(무입력 30년 — 생산마를 팔지 않아 2030년 빚 → 유료 교배 차단 → 2045년 이후 현역 0두), 사용자 결정 2026-10-17 "자동 판매 담당 추가" · 흐름: 출주 계획(UX1)·교배 제안(UX4)과 같은 '제안 → 빼지 않으면 그대로 진행'

목적: 목장 매니저가 수준이 낮거나 남는 말을 세일 위탁으로 제안해 돈이 돌게 한다. 플레이어는 검토해 뺄 수 있다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- sales.ts: `SellProposal { horseId; saleId; year; reserve; note; status }`, `SellProposalStatus`('proposed' | 'consigned' | 'skipped'), `SalesState.sellProposals?`
- farm.ts: `GameSettings.autoSell?: boolean`(없거나 true = 빼지 않으면 위탁, false = 제안만)
- game.ts: 이벤트 `sell_proposals_ready { count; date }`(text.ts 문구 있음)
- 기존: sales/player.ts `consignToSale`·`withdrawConsignment`·`upcomingSales`(위탁 가능한 세일·마감), sales/valuation.ts(말 가치 추정), 평가(Assessment 등급)·OR·나이·성별, 목장 수용 한도(번식 암말 수 등), economy(자금·빚 — canSpendDiscretionary), 연말 정산(yearEnd) 결정과의 충돌(세일 위탁 중이면 'continue' 만 허용되는 기존 규칙)

## 범위
1. `src/engine/config/autoSell.ts`(근거 주석): 남길 두수 목표(현역 '핵심' 두수 — 목장 규모·자금에 따라, 예: 기본 6, 자금 부족·빚이면 4), 판매 대상 기준(1세: 평가 하위 비율·혈통 가치 하위, 현역: 3세 이상 OR 하위·최근 성적 부진·유지비 대비 상금 낮음), 유보가 비율(가치 추정 × 0.7), 빚이 있을 때 판매 강도 상향, 한 해 최대 제안 두수.
2. `src/engine/sales/autoSell.ts`:
   - `proposeSales(state, data): SellProposal[]` — 다가오는 위탁 가능 세일(1세 → 1세 세일, 2세 → 브리즈업, 현역 → 현역마 세일, 남는 번식 암말 → 번식마 세일)마다 대상 말을 고른다. 결정적(난수 미사용), 플레이어 말만, 이미 위탁·제안된 말 제외. 우수마(평가 상위·그룹 입상·혈통 가치 상위)는 남긴다.
   - `removeSellProposal(state, horseId)`(빼기 — 이번 세일 제외), `consignProposal(state, horseId)`(지금 위탁), `setAutoSell(state, boolean)`. 원본 불변·오류 유니언.
   - 주간 시스템 `createAutoSellSystem(data)`(id 'auto_sell', 이 티켓에서 state/systems.ts 에 등록 — 세일 시스템과의 순서를 보고 위치 결정, playerView 순서 테스트 갱신): 세일 위탁 마감 N주 전(config)에 제안 생성·이벤트, settings.autoSell !== false 면 마감 직전 주에 남은 proposed 를 consignToSale 로 위탁(실패하면 skipped·사유). 지난 세일 제안은 정리.
3. useGame: `sellProposals()`, `removeSellProposal`, `consignProposal`, `setAutoSell`.
4. 화면: 세일 메뉴 맨 위 '판매 제안' 칸(말 · 세일 · 유보가 · 이유 · 상태, 빼기/지금 위탁), 홈 '이번 주 할 일'에 판매 제안 도착 알림(빼지 않으면 진행된다는 안내), 설정 메뉴 '판매 제안 자동 위탁' 체크(기본 켬). 화면 스크롤 최소화 원칙(docs/ux-plan.md) 지킬 것.
5. 테스트 `tests/engine/autoSell.test.ts`: 우수마 보존·하위마 제안, 빚 있을 때 강도, 결정성·공용 rng 불변, autoSell=false 면 위탁 안 함, 빼기·지금 위탁, 연말 정산 충돌 없음.
6. 측정: 30년 G1(`G1_OUT=<파일> npx vitest run tests/verify/g1ThirtyYears.test.ts`, 15~30분 — 백그라운드) → docs/reports/M6-0b-30year.json·.md 에 M6-0 값과 비교: 플레이어 현역 두수·자금·빚·판매 두수·판매 수입·생산 두수.

## 수용 기준
1. 30년 무입력에서 플레이어 현역마가 시작 3년 이후 해마다 1두 이상, 빚이 30년 동안 발산하지 않음(30년차 빚 ≤ 연간 비용 1년분 또는 0) — 측정 보고.
2. M4·M5 판정 유지(인플레·낙찰률·승률·기록 수·연대기 등).
3. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 바뀐 고정 해시는 이유 보고 후 값만 갱신.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 공용 rng 소비 순서 변경 금지. 실명 문구 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거(측정값, M6-0 과 비교)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```
