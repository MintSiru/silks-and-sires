# M3-F2d AI 현역마 은퇴 규칙 (조기 종마·번식 은퇴, 나이별 정리)

담당: haiku-coder · 선행: M3-F2c(9df6797) · 근거: F1b 5장, 사용자 결정(2026-10-12) — 실제처럼 조기 은퇴: 상위 수말 3~4세 종마, 상위 암말 4~5세 번식, 최근 경향대로 2세 시즌 뒤 종마로 가는 상위 수말도 일부.

## 목적
고령마 누적(7세 이상 4% → 17%)을 없애고, 스타가 해마다 바뀌게 한다.

## 규칙 (src/engine/world/populationSystem.ts, 연초 교체 주에 실행 — 나이는 새해 기준)
1. 8세 이상 전원 은퇴(기존 유지).
2. **상위마 조기 은퇴**(새 단계, 나이별 컷보다 먼저). 평가값 = 기존 selectionValue(OR, 없으면 능력 환산). 확률은 config/population.ts 의 표로:
   - 수말(거세 안 함):
     - 새 나이 3(2세 시즌 마침): 평가값 ≥ 110 → 0.25
     - 새 나이 4: ≥ 110 → 0.75, 100~109 → 0.40
     - 새 나이 5: ≥ 105 → 0.70, 95~104 → 0.35
     - 새 나이 6 이상: ≥ 100 → 0.80
   - 암말:
     - 새 나이 4: ≥ 100 → 0.35, 90~99 → 0.20
     - 새 나이 5: ≥ 95 → 0.60, 85~94 → 0.35, 그 밖 → 0.15
     - 새 나이 6: ≥ 90 → 0.80, 그 밖 → 0.50
     - 새 나이 7: 0.80
   - 거세마: 이 단계 없음.
   - 확률 판정은 말 ID 오름차순·나라 순서로 ctx.rng 를 쓴다.
3. **나이별 하위 정리**(기존 4세 이상 일괄 15% 를 바꾼다): 나라·나이별로 평가값 하위 비율 은퇴 — 3세 0.08, 4세 0.12, 5세 0.15, 6세 0.25, 7세 0.40(config 표 `POPULATION_CUT_SHARE_BY_AGE`).
4. 신규 2세 투입 = 그 나라 그 해 은퇴 두수(기존 유지).
5. 은퇴 이벤트에 사유를 담을 필드가 이미 있으면 'stud'·'broodmare'·'age'·'cut' 를 넣는다. 없으면 타입을 바꾸지 말고 보고만 한다.
- 표·확률은 전부 config/population.ts 의 상수(매직 넘버 금지). 기존 POPULATION_CUT_SHARE·CUT_MIN_AGE 는 쓰지 않게 되면 지운다.

## 목표 (시드 20261011·7, 각 5시즌 — tests/verify/season.test.ts 방식)
1. 시즌 종료 시 현역(in_training·resting) 중 7세 이상 비율 ≤ 8%(모든 시즌).
2. 나라별 현역마 두수 = 설정값 ±3%(모든 시즌).
3. 3~5시즌 사이 나이별 비율 변화 각 ≤ 3%p(정상 상태).
4. 시즌 종료 OR 상위 10두 중 5세 이하 ≥ 7두(시즌 평균).
5. 시즌당 종마 은퇴 수말 수·번식 은퇴 암말 수를 나라별로 보고(판정 없음, 참고: GB+IE+FR 종마 은퇴 15~40두가 자연스러움).
6. 같은 시드 재현성, 저장 왕복 통과.

## 생성·수정할 파일
- src/engine/config/population.ts, src/engine/world/populationSystem.ts, 관련 단위 테스트(tests/engine/population*.test.ts 등 — 은퇴 규칙에 묶인 기대값만 고치고 보고)
- `tests/verify/f2dRetirement.test.ts`(VERIFY 전용 측정)
- `docs/reports/2026-10-12-m3-f2d-retirement.md`

## 수용 기준
1. 목표 1~4·6 충족, 5 보고.
2. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. config/population.ts·world/populationSystem.ts 외 엔진 수정 금지(테스트 제외). git commit 금지.
