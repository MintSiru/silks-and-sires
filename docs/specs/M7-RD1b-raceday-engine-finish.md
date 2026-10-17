# M7-RD1b 레이스 당일 엔진 마무리 (Codex 중단분 인계)

공통: docs/specs/M7-common.md. 원 명세: docs/specs/M7-RD1-raceday-engine.md(수용 기준 그대로).
Codex 가 사용 한도로 중단(2026-10-17 16:26 UTC). 미완성 작업이 /home/user/wt-rd1 에 있다(커밋 없음, 기준 44582b9):
- 수정: src/engine/season/field.ts, meetings.ts, racePlan.ts(applyRacePlansInPlace 로 분리), raceday.ts
- 신규: src/engine/season/raceDayBrief.ts, tests/engine/raceDayEngine.test.ts, tests/engine/raceDayPerformance.test.ts
- Codex 마지막 보고: 당일 엔진 테스트 20개 통과, typecheck·lint 통과. 남은 문제 — 다시보기(replay)가 결과 시드로 게이트를 다시 추첨해 실제 경주(개최 시드로 확정한 게이트)와 달라진다.
  newGameSettings.test.ts·stallionTradeIntegration.test.ts 고정 해시 변경(개최 시드 저장·개최 생성 난수 소비 변경 때문 — 예상된 변경, 값 갱신은 Opus).

## 할 일
1. /home/user/wt-rd1 의 변경(diff 44582b9 + 새 파일)을 현재 기준 커밋 위로 옮긴다. 그 사이 src/engine/season/racePlan.ts 가 M7-C2(미승리 우선·OR 하한·거리 제한, planRaceAllowed)로 바뀌었다 — 두 변경을 모두 살려 합친다(C2 의 tests/engine/racePlanRules.test.ts 통과 유지).
2. Opus 승인: src/engine/race/setup.ts 수정 허용 — EntryRequest 에 선택 필드 `draw?: number` 를 더하고 buildEntries 가 있으면 그 게이트를 쓴다. 개최 시드로 확정한 게이트를 실제 실행과 다시보기(src/ui/season/replayView.ts 가 runRace 를 다시 부르는 경로)가 같이 쓰게 한다. 다시보기 쪽이 게이트를 어디서 얻는지(결과 기록·보관 목록)를 코드로 확인해 맞춘다 — 공용 타입 변경이 필요하면 [질문].
3. config 파일 이름: 기존 src/engine/config/raceday.ts 와 대소문자만 다른 raceDay.ts 를 만들지 말 것(Codex 가 겪은 충돌). 새 상수는 기존 raceday.ts 에 넣거나 config/raceDayBrief.ts 로.
4. 원 명세 수용 기준 전부 + 다시보기 게이트 = 실제 게이트(테스트).

## 허용 파일
원 명세의 허용 파일 + src/engine/race/setup.ts + src/ui/season/replayView.ts(게이트 전달만) + 관련 tests.

## 검증 (부하 주의 — 전체 npm test 는 돌리지 말 것, Opus 가 병합 때 돌린다)
`npx vitest run tests/engine/raceDayEngine.test.ts tests/engine/raceDayPerformance.test.ts tests/engine/racePlan.test.ts tests/engine/racePlanRules.test.ts tests/engine/raceday.test.ts tests/engine/meetings.test.ts tests/ui/replay*.test.ts`(있는 것만), typecheck, lint, build. 바뀐 고정 해시 테스트 목록은 보고.
