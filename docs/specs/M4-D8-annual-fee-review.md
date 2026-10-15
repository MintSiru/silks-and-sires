# M4-D8 종부료 연간 재산정 (+ D5 일부: 나이에 따른 수태율 감소)

담당: Codex(한도 소진 시 haiku-coder) · 설계: m4-plan.md D8·D5, docs/m4-stud-design.md · 선행: D3a(커밋) · 병행: haiku-coder 가 D9(stud/mortality.ts, world/population.ts) 작업 중 — 그 파일과 src/engine/state/systems.ts 는 건드리지 말 것(시스템 등록은 Opus 가 한다)

목적: 모든 종마(실명·AI·플레이어)의 종부료를 매년 10월 말(예약 창이 열리기 직전 주)에 시장으로 다시 정한다 — 자마 성적·대기 수요·나이·수태율을 반영하고 연 ±50% 로 제한한다(사용자 요청 2026-10-12). 내 종마 초과 수요는 다음 해 인상으로 이어진다(사용자 결정 2026-10-15).

## 사용할 타입·함수 (수정 금지)
- `Stallion { fee; prevFee?; popularity; fertility; bookLimit; aiDemand; bookingSeason; firstSeasonYear }`, `OffspringStats { starters; winners; earnings; groupWinners }`(GameState.sireStats), GameEvent `'stud_fee_set'`.
- `roundStudFee`(stud/value.ts), `STUD_FEE_MIN`·`BOOKING_OPEN_WEEK`(config/stud.ts).

## 생성·수정할 파일 (3개)
1. `src/engine/config/stud.ts` — 추가(주석 근거 1줄씩):
   - `FEE_REVIEW_WEEK = BOOKING_OPEN_WEEK - 1`
   - `FEE_PROGENY_MIN_STARTERS = 5`, `FEE_PROGENY_EXPONENT = 0.5`, `FEE_PROGENY_MULT_MIN = 0.6`, `FEE_PROGENY_MULT_MAX = 1.8`, `FEE_GROUP_WINNER_BONUS = 0.05`(그룹 우승 자마 1두당, 상한은 PROGENY_MULT_MAX 안에서)
   - `FEE_DEMAND_SLOPE = 0.5`, `FEE_DEMAND_MULT_MIN = 0.75`, `FEE_DEMAND_MULT_MAX = 1.3`
   - `FEE_OLD_AGE = 20`, `FEE_OLD_MULT = 0.9`, `FEE_LOW_FERTILITY = 0.75`, `FEE_LOW_FERTILITY_MULT = 0.9`
   - `FEE_YEARLY_CHANGE_MAX = 0.5`(±50%)
   - `POPULARITY_FEE_SENSITIVITY = 20`, `POPULARITY_MIN = 10`, `POPULARITY_MAX = 95`
   - `FERTILITY_DECLINE_FROM_AGE = 16`, `FERTILITY_DECLINE_PER_YEAR = 0.01`, `FERTILITY_FLOOR = 0.5`
2. `src/engine/stud/market.ts`(신규)
   - `progenyMultiplier(state, stallionId): number` — 자마 출주수 starters < MIN 이면 1. 아니면 avg = 전체 종마(같은 기준 starters ≥ MIN) 의 earnings/starters 평균(산술). ratio = (earnings/starters)/avg. mult = clamp(ratio^EXPONENT + GROUP_WINNER_BONUS × groupWinners, MIN, MAX).
   - `demandMultiplier(stallion): number` — aiDemand ≤ 0 이면 1. d = aiDemand / bookLimit. clamp(1 + SLOPE × (d − 1), MIN, MAX). (내 종마가 북을 넘친 수요 = d > 1 → 인상)
   - `reviewFee(state, stallionId, year): { fee: Money; popularity: number; fertility: number }` — 순수 함수. 나이 = year − 출생 연도. raw = fee × progeny × demand × (나이 ≥ OLD_AGE ? OLD_MULT : 1) × (fertility < LOW_FERTILITY ? LOW_MULT : 1). raw 를 [fee × (1 − MAX), fee × (1 + MAX)] 로 자르고 roundStudFee, STUD_FEE_MIN 이상. popularity = clamp(round(popularity + SENSITIVITY × ln(newFee / fee)), MIN, MAX). fertility = 나이 ≥ DECLINE_FROM_AGE 면 max(FLOOR, fertility − PER_YEAR) 아니면 그대로(소수 3자리 반올림).
   - `createFeeReviewSystem(): WeeklySystem`(id 'fee_review') — week === FEE_REVIEW_WEEK 에만, 말의 status 가 'stud' 인 종마 id 오름차순으로 reviewFee 를 적용: prevFee = 기존 fee, fee·popularity·fertility 갱신. 플레이어 소유 종마는 'stud_fee_set' 이벤트(season = year + 1). 난수 미사용.
3. `tests/engine/feeReview.test.ts`(신규)

## 수용 기준
1. reviewFee 단위: (a) 자마 부족·수요 1.0·젊음 → fee 그대로, (b) 수요 1.6(북 넘침) → 인상(상한 +50% 이내), (c) 자마 성적 평균의 4배 → 인상 상한 +50%, (d) 평균의 1/4 → 인하 하한 −50%, (e) 결과는 500/1,000 단위.
2. 시드 20261011 새 게임을 10년(520주, 이 시스템만 추가한 createGameSystems 목록 — 테스트 안에서 직접 구성) 진행 후 측정·보고: 티어(데이터 marketTier)별 종부료 중앙값 시작 대비 비율. 기준: 모든 티어 중앙값 비율이 0.5~2.0 안(인플레·붕괴 없음), 종마 전체 종부료 합 비율 0.6~1.8.
3. 이 시스템이 없을 때와 레이스 결과·현역마가 같다(독립: 난수 미사용, 52주 진행 raceResults 동일).
4. 같은 시드 2회 동일. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. src/engine/state/systems.ts·stud/mortality.ts·world/ 수정 금지. 난수 사용 금지(이 시스템은 결정적). git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2번은 측정 표)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/feeReview.test.ts && npm test && npm run typecheck && npm run lint
