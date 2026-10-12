# M3-F2a 승부 변동·오즈 오차 조정 (인기 1위 승률)

담당: haiku-tester(측정·조정) · 선행: M3-F1b(4d898ce) · 근거: 사용자 결정(2026-10-12) — "둘 다 조금씩": 레이스 당일 변동과 오즈 오차를 함께 늘린다.

## 목적
시즌 레이스의 인기 1위 승률을 실제 경마 수준(약 30%)으로 맞춘다. 현재 55.5%(F1b 3장).

## 손잡이 (상수만 바꾼다, 코드 구조는 바꾸지 않는다)
- `SUMMARY_NOISE_SD`(src/engine/config/season.ts, 현재 0.006): 요약 경로 레이스(G1~L 이외) 결과 노이즈
- `FORM_SD`(src/engine/config/runner.ts, 현재 0.010): 시뮬레이션 경로(G1·G2·G3·L, 플레이어 레이스) 당일 컨디션
- `MARKET_NOISE_SD`(src/engine/config/raceday.ts, 현재 0.7): 오즈(시장) 오차
- 출발점: F1b 격자에서 σ 0.015 / 시장 1.5 → 인기 1위 31.5%, 능력 1위 44.5%(요약 경로).

## 목표 (시드 20261011, 2시즌, tests/verify/f1bProbe.test.ts 의 측정 방식)
1. 인기 1위 승률: 전체 28~34%, 요약 경로·시뮬레이션 경로 각각 26~36%.
2. 능력 1위 승률: 두 경로 각각 38~50%(두 경로 차이 8%p 이내).
3. 인기 1위 평균 소수 오즈 2.3~3.2.
4. 동착 비율 ≤ 1.5%(노이즈 변경 후 다시 잼).
5. 같은 시드 재현성 유지.

## 방법
1. f1bProbe 의 측정(인기 1위·능력 1위 승률, 경로별)을 상수만 바꿔 다시 돌리는 격자 실험: SUMMARY_NOISE_SD ∈ {0.010, 0.012, 0.015, 0.018}, FORM_SD ∈ {0.010, 0.015, 0.020, 0.025}, MARKET_NOISE_SD ∈ {1.0, 1.5, 2.0}. 몬테카를로만으로 고르지 말고, 고른 조합은 실제 2시즌 진행으로 확인한다.
2. FORM_SD 를 바꾸면 tests/engine/simGolden.test.ts 의 골든 파일이 바뀐다. `GENERATE=1 npx vitest run tests/engine/simGolden.test.ts` 로 다시 만들고, 바뀐 이유를 보고에 적는다. tests/verify/balance.test.ts(M1 밸런스) 기본 모드도 통과해야 한다.
3. 측정 스크립트가 필요하면 `tests/verify/f2aVariance.test.ts`(VERIFY 전용)로 남긴다.

## 생성·수정할 파일
- src/engine/config/season.ts, src/engine/config/runner.ts, src/engine/config/raceday.ts (상수 값과 주석만)
- tests/engine/ 골든 파일(재생성), tests/verify/f2aVariance.test.ts(선택)
- docs/reports/2026-10-12-m3-f2a-variance.md — 격자 표, 고른 조합, 목표별 측정값

## 수용 기준
1. 목표 1~5 충족(측정값을 리포트와 보고에).
2. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
상수 외 엔진 코드 수정 금지(필요하면 보고하고 멈춘다). 다른 config 파일 수정 금지. git commit 금지.
