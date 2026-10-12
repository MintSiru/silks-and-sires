# M3-D4 부담중량 단위 전환 (lb ↔ kg)

담당: haiku-coder · 근거: 사용자 요청(2026-10-12) — 파운드를 킬로그램으로 바꿔 볼 수 있게.

## 목적
화면에 나오는 부담중량을 lb 또는 kg 으로 볼 수 있게 한다. 엔진 값은 그대로 lb(정수)이고, 표시만 바꾼다.

## 규칙
- 변환: kg = lb × 0.45359237, **0.5kg 단위 반올림**(유럽·일본 경마 표기 관례). 정수면 "57kg", 아니면 "57.5kg". lb 는 "126lb".
- 설정은 UI 환경설정(게임 상태·저장 파일에 넣지 않음). localStorage 키 `silks.weightUnit`, 값 'lb' | 'kg', 기본 'lb'. localStorage 접근은 try/catch(실패하면 기본값, 화면은 정상).
- 바꾸면 모든 화면에 즉시 반영(React context).

## 생성·수정할 파일
1. `src/ui/game/units.ts` (신규, 순수 함수) — `export type WeightUnit = 'lb' | 'kg'`, `lbToKg(lb: number): number`(0.5 단위 반올림), `formatWeight(lb: number, unit: WeightUnit): string`, `weightUnitLabelKo(unit)`('파운드(lb)'·'킬로그램(kg)').
2. `src/ui/game/WeightUnitContext.tsx` (신규) — `WeightUnitProvider`, `useWeightUnit(): { unit; setUnit }`. localStorage 읽기·쓰기.
3. `src/ui/App.tsx` — Provider 로 감싸고, 상단 탭 줄 오른쪽에 단위 선택(작은 select 또는 토글 버튼 'lb / kg').
4. `src/ui/RaceDemo.tsx` — 결과 표의 '부담중량(lb)' 열을 단위에 맞게(머리글 '부담중량(kg)' 등, 값 formatWeight).
5. 그 밖에 부담중량이나 감량(lb)을 보여 주는 화면이 있으면 같은 방식으로(먼저 `grep -rn "weightLb\|lb" src/ui` 로 찾는다). 없으면 보고만.
6. `tests/ui/units.test.ts` (신규) — 126lb → 57kg, 133 → 60.5kg(60.33 → 60.5), 112 → 51kg, 9 → 4kg(4.08 → 4.0), formatWeight 문자열, 0.5 단위 확인.

## 수용 기준
1. 위 테스트 통과, lb 값은 바뀌지 않는다.
2. 단위를 kg 으로 바꾸면 RaceDemo 결과 표가 kg 으로 나오고, 새로고침 후에도 유지된다(localStorage). localStorage 가 막혀도 화면이 깨지지 않는다.
3. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 브라우저 확인은 Opus.

## 금지
src/engine 수정 금지. 저장 스키마 변경 금지. git commit 금지.
