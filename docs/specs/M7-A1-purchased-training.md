# M7-A1 산 말은 자동 조교 기준 면제

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 항목 A1 — 브리즈업에서 산 C 등급 2세가 M6-B4 기준(B 이상) 때문에 조교사에게 안 가고, 판매 담당이 다시 팔자고 제안할 수 있다.

## 허용 파일
src/engine/season/autoTraining.ts, src/engine/sales/autoSell.ts, tests/engine/autoTraining.test.ts, tests/engine/autoSell.test.ts

## 내용
1. `export function isHomebred(state: GameState, horse: Horse): boolean` — `horse.breederId === state.playerOwnerId`.
2. autoTrainingPicks: 자가 생산이 아닌 2세(세일·개인 거래로 산 말)는 등급 기준과 무관하게 대상에 넣는다. 정렬은 '산 말 먼저' → 등급 → id. 현역 상한(autoTrainingRacerCap)은 산 말에도 그대로 적용하되, 산 말이 상한에 막히면 남겨 둔다(판매 제안 대상 아님).
3. autoSell 의 브리즈업 집단(groupOf 의 breeze_up 필터)은 자가 생산 2세만(산 말 제외).
4. 기존 동작(자가 생산 2세의 B 기준·최소 현역 규칙)은 그대로.

## 수용 기준
- 산 C 등급 2세 1두 + 현역 1두 상태에서 auto_training 1주 실행 → 그 말이 in_training.
- 같은 말은 브리즈업 판매 제안 대상이 아니다(테스트).
- 자가 생산 C 등급 2세는 지금처럼 남고(현역 ≥1 일 때) 판매 제안 대상이다.
- 결정성: 같은 입력 같은 결과.

## 테스트 명령
`npx vitest run tests/engine/autoTraining.test.ts tests/engine/autoSell.test.ts` + 공통 검증.
