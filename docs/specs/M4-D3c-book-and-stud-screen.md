# M4-D3c 북 현황·사전 예약·내 종마 정산 화면

담당: haiku-coder · 확인: Opus 브라우저 · 선행: D3a-1·D3a-2(커밋) · 병행: Codex 가 src/engine/world·config/stud.ts 를 수정 중 — 건드리지 말 것

목적: 목장·배합 화면에서 종마별 북 현황(예약 수/상한, 마감)과 예약 대상 시즌을 보여 주고, 11월부터 다음 시즌 사전 예약을 할 수 있게 하며, 내 종마의 시즌 정산 기록을 보여 준다.

## 사용할 것 (수정 금지)
- 엔진: `bookingSeasonOf(date)`(breeding/season.ts), `Stallion { bookingSeason; bookedThisSeason; bookLimit; aiBooked; fee; firstSeasonYear }`, `StudState.seasons`(types/stud.ts), `Mare.bookedFor?`, `freeStudSlots(state)`(stud/stand.ts).
- UI: text.ts `feeKo`, 기존 BreedingScreen 의 종마 표·교배 예약 흐름(game.book).

## 생성·수정할 파일 (4개)
1. `src/engine/horse/playerView.ts` — `availableStallions(state)` 변경:
   - season = bookingSeasonOf(state.date). null(예약 창 밖)이면 지금처럼 firstSeasonYear ≤ date.year 인 종마(목록은 보이되 예약 버튼은 화면에서 막힘).
   - season 이 있으면 firstSeasonYear ≤ season 인 종마.
   - 그 말의 status 가 'stud' 가 아닌 종마(사망·은퇴)는 뺀다.
   - 반환 타입은 그대로.
2. `src/ui/breeding/bookView.ts`(신규, 순수 함수)
   - `bookStatusOf(state, stallion): { season: number | null; booked: number; limit: number; full: boolean; labelKo: string }` — season = bookingSeasonOf. stallion.bookingSeason ≠ season 이면 booked 0 으로 본다. labelKo: '2027 시즌 북 132/180' 또는 '2027 시즌 북 마감' 또는 창 밖이면 '예약 창 닫힘(11월에 열림)'.
   - `bookingWindowKo(state)`: 예약 창이 열려 있으면 '지금 예약하면 {season} 시즌 교배입니다' + (사전 예약일 때) ' — 번식 시즌에 교배가 이루어지며, 교배하지 못하면 시즌 끝에 환불됩니다', 닫혀 있으면 '예약 창이 닫혀 있습니다. 11월 첫 주에 다음 시즌 예약이 열립니다.'
   - `myStudView(state)`: { slotsKo('종마사 1/1칸 사용'), stallions: { horseId, name, feeKo, bookKo, firstSeasonYear }[], seasons: { year, name, outsideCovers, conceptions, incomeKo }[] (최근 10건, 최신순) } — 플레이어 소유·status 'stud' 종마.
   - `mareBookingKo(mare, nameOf)`: 사전 예약 중이면 '{종마} 사전 예약({season} 시즌)', 교배 배정이면 기존 표시, 없으면 null.
3. `src/ui/breeding/BreedingScreen.tsx`
   - 종마 표에 '북' 열(bookStatusOf.labelKo). full 이면 그 행의 선택·예약 버튼 비활성(title 로 '북 마감').
   - 교배 상대 고르는 영역 위에 bookingWindowKo 한 줄. 예약 창 밖이면 예약 버튼 비활성.
   - 번식 암말 카드/행에 mareBookingKo 가 있으면 표시.
   - 화면 아래에 '내 종마' 섹션(myStudView): 종마사 칸, 내 종마 표(이름·종부료·북·첫 시즌), 최근 정산 표(연도·종마·외부 교배·수태·수입). 내 종마가 없으면 '아직 종마가 없습니다. 연말 정산에서 은퇴하는 수말을 종마로 세울 수 있습니다.'
4. `tests/ui/bookView.test.ts`(신규) — 시드 20261011 새 게임 상태로: 1주차 bookStatusOf 라벨 형식(시즌 2026), 44주로 날짜를 옮기면 season 2027·booked 0, full 판정, myStudView 빈 상태 문구, 플레이어 종마와 seasons 기록을 넣은 상태에서 정산 행.

## 수용 기준
1. `npm test && npm run typecheck && npm run lint && npm run build` 통과.
2. 화면 문구에 OR 숫자·실제 목장명이 없다.
3. 브라우저(Opus 확인): 새 게임 → 목장·배합 탭에 북 열 표시, 예약 창 안내 줄 표시, 1티어 종마 일부가 '마감'이면 예약 버튼 비활성.

## 금지
src/engine/types·src/engine/world·src/engine/config·src/engine/breeding·src/engine/stud 수정 금지(playerView.ts 만 예외). 새 의존성 금지. git commit 금지.

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
