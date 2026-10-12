# M3-F2b 레이스 공급·출주 조정 (취소·두수·2세 출주·그룹 출주)

담당: haiku-coder(측정·조정·규칙 수정) · 선행: M3-F2c(9df6797) · 근거: F1b 1·2·6장, 사용자 결정(2026-10-12) — 자동 생성 레이스를 줄여 맞춘다(말 1두 연 6~8회)

## 목적
예정 레이스 취소(현재 25~32%)를 없애고, 그룹 레이스 두수를 채우고, 2세마가 실제처럼 출주하게 한다.

## 손잡이 (먼저 상수, 모자라면 규칙)
- config/meetings.ts: `MEETING_RACES_TARGET`(7), `MINOR_MEETINGS_PER_WEEK`, `AW_MEETINGS_PER_WEEK`(2), `GENERATED_KIND_WEIGHTS`, `HANDICAP_OR_RANGE`(대역 — 겹쳐도 됨), `HANDICAP_CLASS_WEIGHTS`, `TWO_YO_SHARE`, `TWO_YO_FROM_WEEK`(15 — 실제 시즌과 같아 유지 권장)
- config/entries.ts: `GROUP_OR_FLOOR`(G1 100 → 95 후보), `TRAVEL_CHANCE_GROUP`(0.15), `MIN_WEEKS_BETWEEN_GROUP_RUNS`(3), `MIN_WEEKS_BETWEEN_RUNS`(2), `FIELD_SIZE_*`, `MAIDEN_MAX_WINS`(0 유지 — 메이든 정의)
- 규칙(src/engine/season/declarations.ts·meetings.ts·eligibility.ts, 필요한 만큼만):
  - 상위마 그룹 우선: OR 이 GROUP_OR_FLOOR.L 이상인 말은 앞으로 GROUP_TARGET_WEEKS 주 안에 출주 가능한 그룹·리스티드 레이스가 있으면 핸디캡·조건 레이스 선발에서 뺀다(새 상수, config/entries.ts).
  - 2세 출주가 적은 원인(F1b: 2세 연 0.3~1.05회)을 찾아 고친다 — 2세 레이스 수, 2세 거리 상한, fitness·조교사 juvenileFocus 등. 원인과 수정 내용을 리포트에 적는다.
  - 자동 생성 레이스가 그 주 출주 가능 말 수에 맞게 만들어지도록(예: 개최 레이스 수를 고정 7 대신 나라 현역마 수에 비례) 바꿔도 된다.

## 목표 (시드 20261011·7, 각 2시즌, F1·F1b 측정 방식)
1. 취소율: 전체 ≤ 5%, G1~G3 ≤ 10%.
2. 3세 이상 말 1두 시즌 출주 평균 6~9회. 2세: 15주 이후 현역인 2세 중 1회 이상 출주 ≥ 70%, 평균 2.5~5회.
3. G1 평균 두수 ≥ 8, G2·G3 ≥ 7, 5두 미만 레이스 ≤ 5%.
4. 핸디캡 평균 두수 10~14.
5. 주당 진행 시간 중앙값이 지금보다 늘지 않는다(측정값 보고).
6. 같은 시드 재현성 유지. 기존 테스트 통과(레이스 수·개최 수 기대값에 묶인 테스트는 그 값만 고치고 보고).

## 생성·수정할 파일
- 위 config·season 파일, 관련 단위 테스트
- `tests/verify/f2bSupply.test.ts`(VERIFY 전용 측정)
- `docs/reports/2026-10-12-m3-f2b-supply.md` — 시도 표, 고른 값·규칙, 목표별 측정값

## 수용 기준
1. 목표 1~6 충족(측정값 리포트·보고).
2. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. config/rating.ts·population.ts·season.ts·runner.ts·raceday.ts 와 world/ 수정 금지(다른 티켓). 데이터(data/) 수정 금지. git commit 금지.
