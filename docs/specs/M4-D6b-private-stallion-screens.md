# M4-D6b 비공개 종마 화면

담당: haiku-coder · 선행: M4-D6a(커밋)

목적: 종마 목록에 비공개 종마를 표시하고(예약 가능 여부 포함), 내 종마를 28~43주에 공개/비공개로 바꾸는 버튼을 단다.

## 사용할 엔진 함수 (수정 금지)
- `src/engine/stud/private.ts`: `privateAccess(state, stallionId, ownerId): 'public' | 'own' | 'allowed' | 'denied'`, `setStallionPrivate(state, horseId, makePrivate): { ok: true; state; events: [] } | { ok: false; error: 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased' | 'no_change' }`
- `Stallion.privateTo?: OwnerId | null`, `state.owners[id].name`·`studName`, config/stud.ts `PRIVATE_RELATION_MIN`

## 수정할 파일 (4개 + 테스트 1개)
1. `src/ui/breeding/bookView.ts`
   - `privateLabelKo(state, stallion): string | null` — 공개면 null. 플레이어 비공개면 '비공개(내 암말 전용)'. AI 비공개면 access 가 allowed 일 때 '비공개 — {마주 studName ?? name} 허가', denied 일 때 '비공개 — {마주 studName ?? name}, 관계 {PRIVATE_RELATION_MIN} 이상 필요'.
   - `MyStudStallionRow` 에 `isPrivate: boolean` 추가(privateTo === playerOwnerId). canDeal 조건에서 토글 가능.
   - `privateErrorKo(error)` — 5개 오류 문구.
2. `src/ui/breeding/BreedingScreen.tsx`
   - 종마 목록 행: privateLabelKo 가 있으면 이름 옆에 작은 배지(className 'badge')로 표시. access 가 denied 면 행 버튼을 disabled + title 에 그 문구(북 마감과 같은 방식).
   - 내 종마 표 거래 열에 canDeal 일 때 '비공개로 전환' / '공개로 전환' 버튼(확인 단계 없이 바로 적용, 실패 시 privateErrorKo 를 role="alert"). 표에 비공개면 '비공개' 표시.
3. `src/ui/app.css` — '.badge' 가 없으면 작은 둥근 배지 스타일 추가(기존 색 변수 사용).
4. `src/ui/game/useGame.ts` — GameApi 에 `setStallionPrivate(horseId, makePrivate)`(성공 시 상태 갱신, sellStallionWith 와 같은 방식, 이벤트 없음).
5. `tests/ui/bookView.test.ts` — 케이스 추가.

## 수용 기준
1. privateLabelKo: 공개 null, 플레이어 비공개 '비공개(내 암말 전용)', AI 비공개 관계 0 → '관계 40 이상 필요' 포함, 관계 40 → '허가' 포함.
2. 내 종마 뷰 isPrivate 가 privateTo 를 따른다. privateErrorKo 5개가 비지 않고 서로 다르다.
3. `npm run build` 성공. `npm test && npm run typecheck && npm run lint` 통과.

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
