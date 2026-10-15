# M4-D1b 연말 정산 화면 + 진행 게이트(UI)

담당: Codex(한도 소진 시 haiku-coder) · 확인: Opus 브라우저 · 설계: docs/m4-stud-design.md '화면 (D1b)' · 선행: D1a·D1c(커밋됨)

목적: 새해 1주에 연말 정산이 대기 중이면 어느 탭에서든 탭 내용 대신 연말 정산 화면을 띄우고, 제출해야 진행이 다시 된다(사용자 결정: 의무).

## 사용할 것 (수정 금지)
- 엔진 stud/yearEnd.ts: `yearEndPending(state)`, `advanceWeekGated(state, systems)`(반환에 `blocked: 'year_end' | null`), `yearEndCandidates(state): YearEndCandidate[]`, `retainerRenewalsDue(state): RetainerContract[]`, `submitYearEnd(state, submission)` → `{ ok: true; state; events } | { ok: false; error: YearEndError; horseId? }`.
- 타입: `YearEndChoice`, `YearEndSubmission`(types/stud.ts), `GameState`, `GameEvent`.
- stud/stand.ts `freeStudSlots(state)`. economy/relations.ts `relationOf`·`relationKey`. UI text.ts: `feeKo`, `relationTierKo`. 기존 `EVENT_LOG_LIMIT` 로그 자르기 방식(useGame.ts `book` 과 같게).

## 생성·수정할 파일 (5개)
1. `src/ui/game/useGame.ts`
   - advance / advanceToPhase / advanceUntil: advanceWeek 대신 advanceWeekGated 를 쓰고, blocked 가 나오면 그 자리에서 반복을 멈춘다(그때까지의 state·이벤트는 반영).
   - GameApi 에 `submitYearEnd(submission: YearEndSubmission): ReturnType<typeof submitYearEnd>` 추가 — 성공 시 이벤트를 eventLog 에 붙이고(EVENT_LOG_LIMIT 로 자름) state 갱신, lastEvents = 이벤트.
2. `src/ui/yearEnd/yearEndView.ts`(신규, 순수 함수·한국어 문구 포함)
   - `yearEndView(state)`: { year, freeSlotsKo('종마사 빈 칸 1/1'), horses: { horseId, name, sexKo('수말'|'암말'|'거세마'), newAge, careerKo('12전 4승 · 그룹 1승 · 상금 €310,000'), options: { choice, labelKo }[] (allowed 순서 그대로), recommended }[], retainers: { kind, personId, nameKo, roleKo('조교사'|'기수'), feeKo(현재 annualFee), relationKo(relationTierKo) }[] }.
   - 진로 문구: continue '현역 속행' / geld '거세 후 현역 속행' / stud '종마 (예상 첫 종부료 €29,000)'(studFeeEstimate) / broodmare '번식 암말' / retire '은퇴 (목장을 떠남)'.
   - `yearEndErrorKo(error)`: 8종 한국어 문구.
   - `defaultSubmission(state)`: 말은 recommended, 계약은 전부 renew: true.
   - OR 숫자는 보여 주지 않는다(Horse.officialRating 은 플레이어에게 숫자 노출 금지).
3. `src/ui/yearEnd/YearEndScreen.tsx`(신규)
   - 제목 '{year}년 연말 정산', 안내 한 줄 '모든 현역마의 진로와 전속 계약 갱신을 정해야 새해로 진행합니다.'
   - 현역마 표: 이름·성별·새해 나이·통산 성적·진로 선택(select, 기본 추천값). 종마사 빈 칸 표시. 현역마가 없으면 '현역마가 없습니다'.
   - 전속 계약 표: 이름·역할·연간 계약금·관계·'갱신' 체크박스(기본 체크). 대상이 없으면 표 대신 '갱신할 계약이 없습니다'.
   - '제출' 버튼 → 같은 자리에 '이대로 확정' / '취소' 두 버튼(확인 단계, window.confirm 금지) → submitYearEnd. 실패면 yearEndErrorKo 문구(말 이름이 있으면 함께)를 role="alert" 로.
4. `src/ui/App.tsx` — state 가 있고 yearEndPending(state) 이면 탭 줄 아래에 탭 내용 대신 `<YearEndScreen game={game} />` 만 그린다(탭 버튼은 보이되 내용은 바뀌지 않음). 자금 배너는 그대로.
5. `tests/ui/yearEndView.test.ts`(신규) — 시드 20261011 새 게임을 다음 해 1주까지 진행(엔진 advanceWeek 반복)한 state 로: horses 행 수 = yearEndCandidates 수, 각 행 options 가 allowed 와 같은 순서, defaultSubmission 을 submitYearEnd 에 넣으면 ok, 문구에 OR 숫자 없음(행 문자열에 'OR' 미포함).

## 수용 기준
1. `npm test && npm run typecheck && npm run lint && npm run build` 통과.
2. 진행 버튼(1주·단계·조건 진행)은 연말 정산 대기 주에서 멈춘다(그 전 주까지는 정상 진행).
3. 브라우저(Opus 확인): 새 게임 → 다음 해 1주까지 진행 → 어느 탭이든 연말 정산 화면 → 기본값 제출 → 탭 화면이 돌아오고 1주 진행이 된다. 진로를 '은퇴'로 바꿔 제출하면 그 말이 목장 목록에서 빠진다.
4. 엔진(src/engine) 수정 없음.

## 금지
src/engine 수정 금지. 새 의존성 금지. window.confirm·alert 금지. git commit 금지.

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
npx vitest run tests/ui/yearEndView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
