# M5-D2 라이벌 효과: 세일 경합 입찰 · 대레이스 출주 성향

담당: Codex(gpt-6.1-sol, high) · 설계: docs/m5-plan.md 설계 결정 5 · 선행: M5-D1(src/engine/legacy/rivals.ts, config/rivals.ts — 커밋됨, 상수 RIVAL_BID_BOOST·RIVAL_BIG_RACE_ENTRY_WEIGHT 정의만 있음)

목적: 라이벌이 실제로 플레이어를 견제하게 한다. 효과는 작게, 라이벌이 없으면 기존 결과와 완전히 같게.

## 범위
1. 세일(sales/auction.ts — computeAiBids·collectBidders·resolveLot 경로): 플레이어가 최대 입찰을 건 로트에서, 활성 라이벌 마주가 입찰자 후보이면 그 마주의 입찰 상한 × (1 + intensity/100 × RIVAL_BID_BOOST). 라이벌 마주가 후보가 아니면(세일에 오지 않는 마주) 효과 없음 — 억지로 끌어오지 않는다. 자금 한도 규칙은 그대로.
2. 대레이스 출주(season/declarations.ts declareAiRunners): 플레이어 말이 이미 신청한 G1 개최에서, 활성 라이벌의 자격 있는 말이 기존 AI 판단으로 후보에 오를 때 출주 확률(또는 가중)에 (1 + intensity/100 × RIVAL_BIG_RACE_ENTRY_WEIGHT) 를 곱한다. 새 후보를 만들지 않는다.
3. 난수: 공용 rng 소비 순서·횟수를 바꾸지 않는다. 가중은 기존 난수 비교의 문턱값에만 곱하거나, 필요하면 독립 스트림 `${initialSeed}:rival-effect:${...}`.
4. 테스트 `tests/engine/rivalEffects.test.ts`: 라이벌 없는 게임과 결과·공용 rng 동일, 라이벌 있을 때 입찰 상한이 정확히 가중되는 단위 테스트, 출주 가중 단위 테스트(라이벌 아님·G1 아님·플레이어 미신청이면 효과 없음).
5. 측정: 시드 20261011 3년 진행에서 플레이어가 입찰하도록 만든 시나리오(테스트에서 매 세일 상위 로트 몇 개에 최대 입찰을 넣는다)로 sale_battle 라이벌 발생 수·라이벌 G1 동반 출주 수를 파일로 보고.

## 수용 기준
1. 위 테스트 통과, 라이벌 0명일 때 기존 고정 해시 테스트 불변.
2. 측정 보고(파일).
3. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지. state/systems.ts 수정 금지. 실명 문구 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```
