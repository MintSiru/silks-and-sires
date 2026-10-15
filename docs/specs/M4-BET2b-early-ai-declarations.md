# M4-BET2b AI 출주 선언을 한 주 앞당기기

담당: Codex · 선행: d76e0f0(BET3) · 근거: BET3 검수에서 발견 — AI 출주 선언이 경주 실행 직전이라 진행 전에는 상대 말이 안 보이고 베팅할 수 없다. 플레이테스트 피드백 'AI 유력마 회피'(상대를 보고 레이스를 고르기)와도 같은 문제.

## 지금 흐름 (src/engine/season/system.ts)
`runThisWeek`: 이번 주 개최를 꺼내 `declareAiRunners(...)` 로 AI 를 선언하고 바로 `runMeetingInPlace`. `scheduleNextWeek` 는 다음 주 개최를 만들기만 한다(선언 없음). 플레이어는 진행 전에 'open' 레이스에 선언한다(season/player.ts declarePlayerHorse).

## 바꿀 흐름
1. **다음 주 AI 선언을 이번 주 끝에**: season 시스템 run 의 순서를 `startNewSeason? → runThisWeek → scheduleNextWeek → conditionWeek → declareNextWeek` 로. `declareNextWeek` 는 다음 주 개최들에 `declareAiRunners` 를 적용해 seasonState.meetings 에 저장한다. 레이스 status 는 플레이어가 계속 선언할 수 있게 **'open' 으로 둔다**(필드 부족으로 취소 판정만 그대로 — abandoned 는 지금처럼 선언 시점에). rng: `rng.fork('declare-next')`.
2. **실행 시점**: runThisWeek 는 AI 를 새로 선언하지 않는다. 'open' 레이스는 그대로 확정(closed)해 실행한다. 단, 선언이 MIN_FIELD_SIZE 미만이면 abandoned(플레이어 철회 등). **옛 저장본 호환**: 이번 주 개최에 AI 선언이 하나도 없는 개최(옛 흐름에서 만든 것)는 지금처럼 실행 직전에 declareAiRunners 를 적용한다.
3. **새 게임**: bootstrapGame 이 만든 첫 주 개최에도 AI 선언을 적용한다(rng: `createRng(seed).fork('season').fork('declare-first')` — 다른 단계 난수 불변).
4. **플레이어 선언이 꽉 찬 레이스에 들어갈 때**(season/player.ts declarePlayerHorse): 지금은 두수가 차면 실패한다. 바꿈: 선언 수 ≥ maxRunners 이고 AI 선언이 있으면, AI 선언 중 **평가값이 가장 낮은** 말(officialRating ?? ratingFromAbility(meanAbility(ability)), 동률은 horseId 큰 쪽)을 빼고 플레이어 말을 넣는다. AI 가 없으면(전부 플레이어) 지금처럼 실패. 빠진 말에 걸린 베팅은 기존 정산 규칙(출주 안 함 → 환불)으로 처리된다.
5. 플레이어 철회는 지금과 같다(빈자리를 AI 로 다시 채우지 않는다).
6. 베팅 화면(BET3)은 수정 없이 선언된 AI 말을 보여 주게 된다 — 확인만.

## 생성·수정할 파일
- src/engine/season/system.ts, src/engine/season/player.ts, src/engine/state/bootstrap.ts (+ 필요하면 src/engine/season/raceday.ts)
- tests/engine/earlyDeclarations.test.ts(신규)
- 고정값 테스트: 난수 소비 순서가 바뀌어 레이스 결과가 달라지는 것은 의도된 변화다. 깨지는 테스트는 **원인이 이 순서 변화뿐인지 확인한 뒤** 기대값만 고치고 목록·이유를 보고(밸런스 통계 테스트는 범위 검사라 통과해야 한다 — 실패하면 고치지 말고 보고).

## 수용 기준
1. 새 게임 직후 첫 주 개최의 레이스에 AI 선언이 있다(취소 레이스 제외 평균 두수 보고).
2. 1주 진행 뒤 다음 주 개최의 레이스에도 AI 선언이 있고, status 'open' 이라 플레이어가 선언할 수 있다.
3. 꽉 찬 레이스에 플레이어 말 선언 → 평가값 최저 AI 말이 빠지고 들어간다. 그 AI 말에 건 베팅은 경주 뒤 전액 환불.
4. 옛 흐름 호환: AI 선언 없는 개최를 넣은 상태로 진행하면 실행 직전에 선언되어 레이스가 열린다.
5. 같은 시드 2회 동일, 저장 왕복 동일. 52주 진행 밸런스 테스트(인기 1위 승률·평균 두수 등) 통과.
6. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. declareAiRunners 의 선택 규칙 변경 금지(호출 시점만 바꾼다). git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/earlyDeclarations.test.ts && npm test && npm run typecheck && npm run lint
