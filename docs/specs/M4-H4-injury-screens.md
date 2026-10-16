# M4-H4 부상 화면: 이상 증세·검사·치료 선택·병력

담당: haiku-coder · 선행: M4-H12·H3(커밋)

목적: '내 말' 카드에서 부상 상태(확진 전 단서 / 확진된 종류·남은 기간·치료)를 보여 주고, 검사·치료 선택 버튼과 병력을 단다.

## 사용할 엔진 함수·타입 (수정 금지)
- `src/engine/horse/injury.ts`: `orderVetExam(state, horseId): InjuryActionResult`, `chooseTreatment(state, horseId, treatment): InjuryActionResult`, `InjuryActionResult = { ok: true; state; events } | { ok: false; error: InjuryError }`, `InjuryError = 'not_found' | 'not_player_horse' | 'no_injury' | 'already_diagnosed' | 'not_diagnosed' | 'not_allowed' | 'already_treated' | 'insufficient_funds'`
- `src/engine/config/injury.ts`: `INJURY_KINDS[kind] { region; treatments: Partial<Record<InjuryTreatment, { cost; weeksMult; successRate; ... }>> }`, `VET_EXAM_COST`
- `Horse.condition.injury: Injury | null`(`{ kind; weeksOut; diagnosed?; treatment?; since? }`, diagnosed 없음 = 확진), `Horse.injuryHistory?: InjuryRecord[]`(`{ kind; since; weeks; treatment; permanent? }`)
- `src/ui/game/text.ts`: `injuryKo(kind)`, `INJURY_REGION_HINT_KO`, `INJURY_TREATMENT_KO`, `feeKo`, `formatDateKo`

## 수정할 파일 (5개 이하 + 테스트)
1. `src/ui/season/seasonView.ts`(또는 '내 말' 카드 뷰가 있는 곳) — `PlayerHorseView` 에 `injury: InjuryView | null` 추가:
   - 확진 전: `{ kind: 'suspected', hintKo: INJURY_REGION_HINT_KO[region], examCostKo }`
   - 확진: `{ kind: 'diagnosed', nameKo: injuryKo(kind), weeksOut, treatmentKo: 치료 선택 전이면 null, options: [{ treatment, labelKo, costKo, noteKo }] }` — options 는 INJURY_KINDS[kind].treatments 중 rest 를 뺀 것(이미 medical/surgery 를 골랐으면 빈 배열). noteKo 는 '기간 ×0.7' 같은 배수·성공률 요약(성공률 < 1 이면 '성공률 80%').
   - `historyKo: string[]`(최근 5건, 최신 먼저: '{날짜} {부상명} {주}주 · {치료}' + 영구 영향 있으면 ' · 후유증').
2. `src/ui/season/SeasonScreen.tsx` — 말 카드에 부상 영역: 단서 문구 + '검사 받기 (€…)' 버튼 / 확진 정보 + 치료 버튼들(확인 단계 없이 실행, 실패하면 injuryErrorKo 를 role="alert") / 병력 접기(details).
3. `src/ui/game/text.ts` — `injuryErrorKo(error: InjuryError): string`(8개 문구).
4. `src/ui/game/useGame.ts` — GameApi 에 `orderVetExam(horseId)`, `chooseTreatment(horseId, treatment)` 추가(성공 시 상태 갱신 + 이벤트 eventLog 추가, sellStallionWith 와 같은 방식).
5. 테스트: 해당 뷰 테스트 파일(tests/ui/seasonView.test.ts 등)에 케이스 추가.

## 수용 기준
1. 확진 전 부상 말의 뷰: kind 'suspected', 단서 문구가 부위에 맞고, 검사 비용 문구가 VET_EXAM_COST 와 같다.
2. 확진된 tendon 말: options 에 medical 이 있고 비용이 config 와 같다. medical 을 고른 뒤에는 options 가 비고 treatmentKo 가 '치료'.
3. 병력 3건이면 historyKo 3줄, 최신 먼저.
4. injuryErrorKo 8개 모두 비지 않고 서로 다르다.
5. `npm run build` 성공. `npm test && npm run typecheck && npm run lint` 통과.

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
npx vitest run tests/ui && npm test && npm run typecheck && npm run lint && npm run build
