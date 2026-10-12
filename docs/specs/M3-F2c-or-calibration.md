# M3-F2c OR 보정 (드리프트·초기 OR)

담당: haiku-tester(측정·조정) · 선행: M3-F1b(4d898ce) · 근거: F1b 4장

## 목적
공식 레이팅(OR)이 실제 능력을 따라가게 한다. 지금은 4세 이상 평균 OR 이 해마다 4~6 내려가고(능력은 그대로), 2·3세 OR 이 능력 환산값보다 17~27 낮다.

## 손잡이
- src/engine/config/rating.ts: `DOWN_RATE`(0.25), `MAX_DROP`(5), `NO_DROP_BEATEN_L`(20), `UP_RATE`(0.5), `UP_RATE_WIN`(0.7), `RACE_STANDARD`(무레이팅 레이스 기준 레벨), `FIRST_OR_TOP_N`(2)
- 능력 → OR 환산(기준): `ratingFromAbility`(src/engine/world/rating.ts, OR_ANCHOR 72 · OR_ANCHOR_ABILITY 56 · OR_PER_ABILITY 2.05, config/population.ts — 이 셋은 바꾸지 않는다)
- 상수로 안 되면 src/engine/season/handicapper.ts 의 규칙 수정을 제안만 하고(코드 변경 금지) 보고한다.

## 목표 (시드 20261011·7, 각 3시즌)
1. 4세 이상 평균 OR 의 시즌 간 변화 ±2 이내(모든 전환).
2. 연말 'OR − ratingFromAbility' 평균: 3·4·5세 각각 −6~+6. 2세(OR 있는 말)는 −10~+6.
3. 같은 말 연초→연말 OR 변화와 능력 변화(×OR_PER_ABILITY)의 차이 평균: 4·5·6세 각각 ±4 이내.
4. 그해 최고 OR 120~134(시즌마다). 135 이상은 시즌당 0~1두.
5. OR 이 있는 3세 이상 중 OR≥100 비율 6~12%(현재 약 4~6%) — 참고 목표, 1~4 가 우선.
6. 같은 시드 재현성 유지.

## 방법
1. tests/verify/f1bProbe.test.ts 4장 측정(레이스당 ΔOR, 연령별, 패배 구간별, OR − 능력 환산)을 상수만 바꿔 반복. F1b 반사실(DOWN_RATE 0.10 → 4세+ 연 +0.5)은 1차 근사이니 실제 진행으로 확인한다.
2. 초기 OR(2세 첫 OR, 3세 부여)이 낮은 원인이 RACE_STANDARD(메이든·노비스 기준 레벨)인지 측정해 함께 맞춘다.
3. 측정 스크립트는 `tests/verify/f2cRating.test.ts`(VERIFY 전용)로 남긴다.

## 생성·수정할 파일
- src/engine/config/rating.ts (상수 값과 주석만)
- tests/verify/f2cRating.test.ts
- docs/reports/2026-10-12-m3-f2c-rating.md — 시도한 조합 표, 고른 값, 목표별 측정값, (필요하면) 핸디캐퍼 규칙 수정 제안

## 수용 기준
1. 목표 1~4·6 충족, 5 는 측정값 보고.
2. `npm test && npm run typecheck && npm run lint` 통과(핸디캐퍼 단위 테스트가 상수 값에 묶여 깨지면 그 기대값만 고치고 보고).

## 금지
rating.ts 외 엔진 코드·config 수정 금지. git commit 금지.
