# M3-F2c2 핸디캐퍼의 2·3세 성장 반영

담당: haiku-coder · 선행: M3-F2c(9df6797)·F2a·F2b·F2d 승인, F1 재측정(7b0288f) · 근거: docs/reports/2026-10-12-m3-f2c-rating.md, F1 재측정

## 문제
2·3세는 1년에 능력이 크게 오른다(3세 약 +6.7 → OR 환산 약 +14). 그런데 3세 한정 레이스는 출주마 전원이 같은 정도로 과소평가된 상태라서, 기준마(anchor)로 레이스 레벨을 잡아도 세대 전체가 함께 낮게 매겨진다. 결과: 연말 3세 OR 이 능력 환산보다 약 −16, 4세 −9, 그해 최고 OR 118~123(목표 124~132).

## 규칙 (src/engine/season/handicapper.ts — 레이스 결과로 OR 을 고치는 경로)
- **성장 보정(progression):** 레이스 레벨을 계산하기 **전에**, OR 이 있는 출주마 중 그해 나이가 `PROGRESSION_MAX_AGE`(3) 이하인 말의 '레이스 전 OR' 에 `round(PROGRESSION_LB_PER_WEEK[age] × min(지난 OR 변경 이후 주 수, PROGRESSION_MAX_WEEKS))` 를 더한다. 이 보정된 값을 기준마 레벨 계산과 nextRating 의 출발값으로 쓴다(보정분도 OR 변화로 기록).
- 지난 OR 변경 주는 ratingHistory 의 마지막 항목 날짜(없으면 OR 이 붙은 시점 — 데이터가 없으면 이번 레이스는 보정 없음).
- 상수는 config/rating.ts: `PROGRESSION_MAX_AGE`, `PROGRESSION_LB_PER_WEEK`(나이별: 2세·3세), `PROGRESSION_MAX_WEEKS`.
- 4세 이상은 바뀌지 않는다.

## 목표 (tests/verify/f2cRating.test.ts 의 측정 — 시드 20261011·7, 3시즌, 그리고 tests/verify/season.test.ts 기본 모드)
1. 연말 OR − ratingFromAbility 평균: 2세 −10~+6, 3·4·5세 −6~+6.
2. 4세 이상 평균 OR 시즌 간 변화 ±2.5.
3. 그해 최고 OR 124~134(시즌마다), 135 이상 시즌당 0~1두.
4. 같은 말 ΔOR − Δ능력×2.05: 4·5·6세 ±5(F2c 목표 ±4 에서 완화 — 5·6세 능력 감소는 이 티켓 범위 밖).
5. 인기 1위 승률·취소율 등 F1 지표가 F1 재측정 값에서 크게 바뀌지 않는다(인기 1위 ±3%p, 취소율 ±2%p).
6. 같은 시드 재현성·저장 왕복 유지.

## 생성·수정할 파일
- src/engine/season/handicapper.ts, src/engine/config/rating.ts
- tests/engine/handicapper.test.ts — 성장 보정 단위 테스트(3세는 보정, 4세는 없음, 상한 주 수) 추가. 기존 기대값이 바뀌면 그 값만 고치고 보고.
- tests/verify/f2cRating.test.ts — 목표 4 범위를 ±5 로(이 명세 기준), 측정 그대로.
- docs/reports/2026-10-12-m3-f2c-rating.md — 'F2c2' 절 추가: 시도 표, 고른 값, 목표별 측정값.

## 수용 기준
1. 목표 1~6 충족(VERIFY 측정값 보고).
2. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(ratingHistory 등 기존 필드만 사용). 다른 config 수정 금지. git commit 금지.
