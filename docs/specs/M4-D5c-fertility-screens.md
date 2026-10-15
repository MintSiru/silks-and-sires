# M4-D5c 수태율 표시·내 종마 은퇴 버튼

담당: haiku-coder · 선행: M4-D5b(커밋 d041d6c)

목적: 종마 목록·교배 미리보기·내 종마 표에 공개 수태율을 보여 주고, 내 종마를 28~43주에 직접 은퇴시킬 수 있게 한다.

## 사용할 엔진 함수 (수정 금지)
- `src/engine/stud/fertility.ts`: `publicFertility(stallion): PublicFertility`(`{ kind: 'none' } | { kind: 'estimate'; rate } | { kind: 'range'; low; high } | { kind: 'exact'; rate }`), `retirePlayerStallion(state, horseId): { ok: true; state; events } | { ok: false; error: RetirePlayerError }`, `RetirePlayerError = 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased'`, `observedRate(history, seasons)`
- config/stud.ts: `FERTILITY_RETIRE_RATE`, `FERTILITY_RETIRE_SEASONS`, `FERTILITY_MIN_SAMPLE`
- `Stallion.fertilityHistory?: { year; covers; conceptions }[]`

## 수정할 파일 (5개 + 테스트 1개)
1. `src/ui/breeding/bookView.ts`
   - `fertilityKo(stallion: Stallion): string` — none → '—', estimate → '약 85%', range → '70~90%', exact → '84%'(정수 %).
   - `MyStudStallionRow` 에 `fertilityKo: string`, `fertilityWarning: boolean`(마지막 FERTILITY_RETIRE_SEASONS 개 기록이 모두 covers ≥ FERTILITY_MIN_SAMPLE 이고 비율 < FERTILITY_RETIRE_RATE), `canRetire: boolean`(canDeal 과 같은 조건 — 거래 창 안·임대 아님) 추가.
   - `retireErrorKo(error: RetirePlayerError): string` — 4개 오류 문구.
2. `src/ui/breeding/BreedingScreen.tsx`
   - 종마 목록 머리·행에 '수태율' 칸 추가(북 앞). 교배 미리보기 dl 에 '수태율' 항목(종부료 아래).
   - 내 종마 표에 '수태율' 열(경고면 뒤에 ' ⚠ 저수태' 를 notice--error 로), 거래 열에 '은퇴' 버튼(canRetire 일 때, 확인 단계 '확정'/'취소', 실패하면 retireErrorKo 를 role="alert").
3. `src/ui/app.css` — 종마 목록 그리드(.stallion-head·.stallion-row, 지금 5열 `minmax(0, 1.4fr) 56px 88px minmax(0, 1.4fr) minmax(0, 1.6fr)`)를 6열로: 수태율 칸 64px 를 북 앞에 넣는다. 좁은 화면 규칙(media query)이 이 그리드를 다루면 같이 맞춘다.
4. `src/ui/game/useGame.ts` — GameApi 에 `retireStallion(horseId)` 추가(sellStallion 과 같은 방식: 성공 시 상태 갱신, 이벤트 eventLog 에 추가).
5. `tests/ui/bookView.test.ts` — 케이스 추가.

## 수용 기준
1. fertilityKo: fertility 0.83·기록 없음 → '약 85%'; 기록 합 100/84 → '84%'; 20/14 → '~' 가 들어간 구간 문자열.
2. 내 종마 뷰: 0.5·0.5 두 시즌(각 covers 20) 기록 종마는 fertilityWarning true, 한 시즌만이면 false. 30주 canRetire true, 10주 false, 장기 임대 중 false.
3. retireErrorKo 4개 모두 비지 않고 서로 다르다.
4. `npm run build` 성공. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine 수정 금지. 새 의존성 금지. git commit 금지. 화면 문구 실명 금지.

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
npx vitest run tests/ui/bookView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
