# M4-D1c 연말 정산 제출·적용·전속 계약 갱신 선택

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D1 · 선행: D0 타입, D2a(stud/stand.ts·value.ts·config/stud.ts), D1a(stud/yearEnd.ts 의 yearEndPending·advanceWeekGated, GameState.yearEnd·stud 초기화·저장 v15)

목적: 연말 정산 화면(D1b)이 쓸 엔진 함수 — 대상 현역마와 고를 수 있는 진로, 갱신 대상 계약, 제출 검증·적용 — 를 만든다.

## 사용할 타입·함수 (수정 금지)
- types/stud.ts: `YearEndChoice`, `YearEndHorseDecision`, `YearEndRetainerDecision`, `YearEndSubmission`, `YearEndState`.
- types/game.ts: `GameState`, `GameEvent`('horse_status_changed', 'retainer_changed' 의 change 'released'), `Mare`, `RetainerContract`.
- stud/stand.ts: `canStandAtStud(state, horseId, year)`, `standPlayerStallion(draft, horseId, year)`, `freeStudSlots(state)`; stud/value.ts: `estimateStudFee`.
- stud/yearEnd.ts(D1a 가 만듦): `yearEndPending(state)` — 이 파일에 아래 함수를 **추가**한다(기존 함수 수정 금지).
- 상수: `POPULATION_RETIRE_AGE`(config/population.ts, 8), `MARE_MIN_BREEDING_AGE`(config/breedingSeason.ts, 3), `STUD_MIN_AGE`(config/stud.ts).

## 생성·수정할 파일 (4개)
1. `src/engine/config/stud.ts` — 추가: `YEAR_END_GELDING_MAX_AGE = 10`(거세마 현역 상한, stamina-and-nh.md 6장).
2. `src/engine/stud/yearEnd.ts` — 추가:
   - `export interface YearEndCandidate { horseId: HorseId; newAge: number; allowed: YearEndChoice[]; recommended: YearEndChoice; studFeeEstimate: Money | null }`
   - `yearEndCandidates(state: GameState): YearEndCandidate[]` — 플레이어 소유 + status in_training·resting, horseId 오름차순. year = state.date.year, newAge = year − birthYear.
     - continue: (거세마 ? newAge < YEAR_END_GELDING_MAX_AGE : newAge < POPULATION_RETIRE_AGE) 이고 위탁(sales.consignments 에 이 말)이 없을 때. 위탁 중이면 **continue 만** 허용.
     - geld: 수말·거세 안 함·newAge < YEAR_END_GELDING_MAX_AGE.
     - stud: canStandAtStud(state, id, year) === null (칸 경쟁은 제출 때 검사).
     - broodmare: 암말·newAge ≥ MARE_MIN_BREEDING_AGE.
     - retire: 항상.
     - recommended: continue 가 허용되면 continue. 아니면 stud(허용 시) → broodmare(허용 시) → retire.
     - studFeeEstimate: stud 가 allowed 에 있으면 estimateStudFee(...).fee, 아니면 null.
   - `retainerRenewalsDue(state: GameState): RetainerContract[]` — relations.contracts 중 endYear < state.date.year, kind·personId 순.
   - `export type YearEndError = 'not_pending' | 'wrong_year' | 'missing_horse' | 'duplicate_horse' | 'unknown_horse' | 'choice_not_allowed' | 'no_free_slot' | 'retainer_mismatch'`
   - `submitYearEnd(state: GameState, submission: YearEndSubmission): { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: YearEndError; horseId?: HorseId }` — 입력 state 는 바꾸지 않는다(structuredClone). 검사 순서: 대기 아님 / submission.year ≠ state.date.year / 후보 아닌 horseId / 중복 / 후보 누락 / 허용 안 된 진로 / stud 선택 수 > freeStudSlots / retainers 가 retainerRenewalsDue 와 (kind, personId) 집합이 정확히 같지 않음. 통과하면 horseId 오름차순으로 적용:
     - continue: 변화 없음. geld: gelded = true.
     - stud: standPlayerStallion(draft, id, year) 이벤트를 모은다.
     - broodmare: status 'broodmare', trainerId null, mares[id] = { horseId, coveredBy: null, coveredWeek: null, pregnant: false, dueWeek: null, foals: [], blackTypeProduce: 0 }, horse_status_changed 이벤트.
     - retire: status 'retired', trainerId null, ownerId null, 플레이어 owner.horseIds 에서 제거, horse_status_changed 이벤트.
     - stud·broodmare·retire 인 말의 'open' 레이스 플레이어 선언은 지운다(seasonState 개최의 declarations 에서 isPlayer 이고 그 horseId 인 것).
     - retainers 중 renew=false 는 draft.yearEnd.declinedRenewals 에 `${kind}:${personId}` 추가.
     - 마지막에 draft.yearEnd.lastSubmittedYear = year. 이벤트 date = { year, week: 1 }. eventLog 는 건드리지 않는다(호출자 몫, bookCovering 과 같음).
3. `src/engine/economy/contracts.ts` — 갱신 판정 때 `${kind}:${personId}` 가 draft.yearEnd.declinedRenewals 에 있으면 계약을 지우고 { change: 'released', fee: 0 } 이벤트(관계·자금 변화 없음). 판정을 마치면 declinedRenewals 를 빈 배열로. 그 밖은 그대로.
4. `tests/engine/yearEnd.test.ts`(신규)

## 수용 기준
1. 시드 20261011 새 게임 → 다음 해 1주까지 진행(advanceWeek 반복) → yearEndPending true, yearEndCandidates 가 플레이어 현역마 전부를 담는다(개수 일치).
2. 각 진로 적용 결과가 위 규칙과 같다(geld/stud/broodmare/retire 각 1건 이상을 테스트 상태로 만들어 확인). 제출 후 yearEndPending false, lastSubmittedYear = 그 해.
3. 나이 상한: 새해 8세 수말은 continue 불가(choice_not_allowed), 같은 나이 거세마는 가능. 10세 거세마는 불가.
4. 오류 8종을 각각 재현한다. 실패 시 입력 state 불변(깊은 비교).
5. renew=false 계약은 그 주 계약 시스템에서 'released' 이벤트로 끝나고 자금·관계 변화 없음, declinedRenewals 는 비워진다. renew=true 는 기존 규칙(renewed/declined/lapsed) 그대로.
6. 같은 입력 2회 동일. 엔진에 Math.random·Date.now 없음.
7. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. stud/stand.ts·stud/value.ts·time/advance.ts 수정 금지. 기존 rng 소비 순서 변경 금지. git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/yearEnd.test.ts && npm test && npm run typecheck && npm run lint
