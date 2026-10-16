# UX1 레이스 캘린더 미리보기 · 조교사 출주 계획

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/ux-plan.md (사용자 피드백 2026-10-16: "조교사가 자동으로 레이스 캘린더를 짜고 그걸 검토할 수 있게")

목적: 플레이어가 앞으로 어떤 레이스가 있는지 보고, 조교사가 말마다 출주 계획(앞으로 12주)을 제안하면 검토·승인해서, 그 주가 오면 자동으로 출주 신청되게 한다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- season.ts: `SeasonState.racePlans?: Record<HorseId, PlannedRace[]>`, `PlannedRace { id; date; templateId; target; status; note; raceId? }`, `RacePlanTarget { kinds; minDistance; maxDistance; country?; minClass?; maxClass? }`
- farm.ts: `GameSettings.autoApproveRacePlans?: boolean`
- game.ts: GameEvent `'race_plan_declared' { horseId; raceId; date }`, `'race_plan_skipped' { horseId; planId; reason; date }` (text.ts 문구 있음)
- 기존: season/meetings.ts `buildWeekMeetings`(개최는 그 주에만 만들어진다 — 자동 생성 레이스는 미리 모름), data/races.json 고정 일정 템플릿(RaceTemplate.schedule), 경마장 개최 요일·패턴(meetings 의 개최 경마장 선택 규칙), season/eligibility.ts `isEligible`, season/player.ts `declarePlayerHorse`(오류 유니언 포함 'unnamed'), 말 거리 적성(distanceBias 등)·OR·컨디션(fitness·fatigue)·부상, config/season(연속 출주 제한 등)

## 범위
1. `src/engine/season/lookahead.ts`(신규, 순수): `upcomingRaces(state, data, fromDate, weeks)` → 주별 목록: 고정 일정 레이스(템플릿 — 이름·등급·거리·조건·경마장) + 그 주 개최 예정 경마장과 '예상 레이스 종류'(자동 생성 규칙의 분포를 요약: 종류·거리대·클래스대). 공용 rng 를 쓰지 않는다(결정적 요약만).
2. `src/engine/season/racePlan.ts`(신규, 순수):
   - `proposeRacePlan(state, data, horseId, weeks = 12): PlannedRace[]` — 조교사 판단: 말의 자격(나이·성별·OR·미승리 등)·거리 적성·OR 대비 클래스·출주 간격(config 최소 주 수)·현재 체력/피로·부상 휴양 기간을 고려해 출주 2~4회를 고른다. 맞는 고정 일정 레이스가 있으면 templateId, 없으면 target(종류·거리대·클래스대). note 는 이유 한 줄(한국어, 가상 이름만). status 는 settings.autoApproveRacePlans 면 'approved', 아니면 'proposed'. 결정적(같은 상태 → 같은 결과, rng 미사용).
   - `setRacePlan(state, horseId, plans)` / `approvePlan(state, horseId, planId)` / `removePlan(...)` / `replanHorse(state, data, horseId)` — 원본 불변, 플레이어 말만, 오류 유니언.
3. 주간 시스템 `createRacePlansSystem(data)`(id 'race_plans', 등록은 Opus — 이 티켓에서는 테스트에서 넣어 확인. 위치는 개최가 만들어진 뒤·출주 마감 전 — season 시스템 안의 순서를 보고 제안):
   - approved 계획의 주가 되면: templateId 면 그 레이스, target 이면 그 주 open 레이스 중 조건에 맞고 말에게 가장 맞는 레이스(적성·클래스)로 `declarePlayerHorse`. 성공 → status 'declared'·raceId·이벤트 race_plan_declared. 실패(부상·체력 부족·자격·맞는 레이스 없음·미등록 이름 등) → 'skipped'·사유 한글·이벤트 race_plan_skipped.
   - 레이스가 끝나면 declared → 'run'. 지난 주의 proposed 는 skipped('검토하지 않아 지나감').
   - 계획이 비었거나 마지막 계획이 4주 안이면 조교사가 다음 계획을 다시 제안(autoApprove 설정에 따름), 이벤트는 내지 않는다(화면이 '새 제안' 표시).
   - 공용 rng 를 쓰지 않는다. 플레이어 말 계획이 없으면 기존 결과와 완전히 같다.
4. useGame: `racePlan(horseId)`, `proposeRacePlan(horseId)`, `approvePlan`, `removePlan`, `setRacePlan`, `upcomingRaces(weeks)`, 설정 토글 `setAutoApproveRacePlans(boolean)`.
5. 화면은 최소만(다음 티켓 UX2 가 말 상세에 붙인다): SeasonScreen 내 말 카드 아래 '출주 계획' 간단 목록 + 승인/빼기 버튼, '앞으로 12주 레이스' 접이식 목록. 순수 함수는 `src/ui/season/racePlanView.ts` 로.
6. 테스트: `tests/engine/racePlan.test.ts`, `tests/engine/lookahead.test.ts`.

## 수용 기준
1. upcomingRaces: 시드 고정 새 게임에서 앞으로 12주 고정 일정 레이스가 data 의 일정과 같고, 결정적, 공용 rng 불변.
2. proposeRacePlan: 기본 새 게임의 3세 현역마에게 12주 안 출주 2~4회 계획(간격 ≥ config 최소), 자격 없는 레이스는 제안하지 않음(예: OR 없는 말에 핸디캡 X), 부상 휴양 중이면 회복 뒤부터. 결정적.
3. 시스템: approved 계획이 그 주에 자동 신청되고 이벤트·status 갱신, 실패 시 skipped·사유. 시드 20261011 26주 진행(플레이어 말 계획 승인 상태)에서 플레이어 말이 실제로 출주한다(측정: 출주 수 > 0). 계획이 없는 게임은 기존 고정 해시 테스트와 같은 결과.
4. 원본 불변·오류 유니언·플레이어 말만 테스트.
5. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 공용 rng 사용·소비 순서 변경 금지. state/systems.ts 수정 금지(등록은 Opus). 실명 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (3 은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용 (시스템 등록 위치 제안 포함)
```

## 테스트 명령
npx vitest run tests/engine/racePlan.test.ts tests/engine/lookahead.test.ts && npm test && npm run typecheck && npm run lint && npm run build
