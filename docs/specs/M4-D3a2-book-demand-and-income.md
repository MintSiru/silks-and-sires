# M4-D3a-2 AI 예약 수요·주간 점진 마감·내 종마 종부 수입

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D3 · 선행: D3a-0·D3a-1(커밋) · 근거 측정(decisions.md 2026-10-15): G1 우승 수말 상금 중앙 €0.57~0.72M, 연간 2세 유입 ≈ 635두(실제 규모의 약 1/30)

목적: 모든 종마의 북이 11월부터 AI(가상) 예약으로 매주 차오르게 하고(인기 종마는 1~2월에 마감), 시즌이 끝나면 플레이어 종마의 외부 교배 종부료를 정산한다. 사용자 결정: 주간 점진 마감, G1 종마 연 수입 ≈ 현역 상금의 2~4배.

## 사용할 타입·함수 (수정 금지)
- `Stallion { horseId; fee; bookLimit; bookedThisSeason; bookingSeason; aiBooked; aiDemand; fertility; popularity; firstSeasonYear }` — bookedThisSeason = AI + 플레이어. 플레이어 예약 수 = bookedThisSeason − aiBooked.
- `StudState.seasons: StudSeasonRecord[]`(types/stud.ts), GameEvent `'stud_season_settled'`(types/game.ts).
- breeding/season.ts: `bookingSeasonOf`, `rollBookingSeason`(D3a-1). config/stud.ts: `BOOKING_OPEN_WEEK`. config/game.ts `PHASE_WINDOWS.breeding`.
- `recordMoney`(장부 'stud_fee_received'), `createRng(label)`.

## 생성·수정할 파일 (5개)
1. `src/engine/config/stud.ts` — 추가(주석에 근거 1줄씩):
   - `BOOK_DEMAND_RATIO_AT_POP30 = 0.65`, `BOOK_DEMAND_RATIO_AT_POP90 = 1.3`(인기 30→북의 65%, 90→130% 수요, 사이는 선형), `BOOK_DEMAND_RATIO_MIN = 0.3`, `BOOK_DEMAND_RATIO_MAX = 1.6`
   - `BOOK_FRESHMAN_SEASONS = 3`, `BOOK_FRESHMAN_MULT = 1.15`(첫 3시즌 신인 종마 가산), `BOOK_OLD_AGE = 20`, `BOOK_OLD_MULT = 0.85`
   - `BOOK_DEMAND_NOISE_SD = 0.15`(로그정규)
   - `BOOK_ACCRUAL_END_WEEK = 16`(그해 4월 중순까지 AI 예약이 쌓인다), `BOOK_ACCRUAL_SHAPE = 2`(누적 비율 = 1 − (1 − 진행률)^2, 앞쪽에 몰림)
2. `src/engine/stud/books.ts`(신규)
   - `seasonDemand(state: GameState, stallionId: HorseId, season: number): number` — 정수(가상 두수). ratio = clamp(선형(popularity), MIN, MAX) × (season − firstSeasonYear < FRESHMAN_SEASONS ? FRESHMAN_MULT : 1) × (season − 출생 연도 ≥ OLD_AGE ? OLD_MULT : 1) × exp(normal(0, NOISE_SD)). 난수 = `createRng(\`${state.initialSeed}:book-demand:${stallionId}:${season}\`)` 한 번. 결과 = round(bookLimit × ratio). 출생 연도는 horses[stallionId].birthYear.
   - `accrualProgress(date: GameDate, season: number): number` — 0~1. 예약 창 시작(season−1 년 BOOKING_OPEN_WEEK)부터 season 년 BOOKING_ACCRUAL_END_WEEK 까지 주 단위 진행률(시작 주 = 1/총주수, 끝 주 이후 = 1).
   - `createStudBooksSystem(): WeeklySystem`(id 'stud_books'). 매주(id 오름차순):
     a. season = bookingSeasonOf(date). null 이면 b 로.
        대상 종마: horses[id].status === 'stud' 이고 season ≥ firstSeasonYear.
        rollBookingSeason(s, season). aiDemand === 0 이면 seasonDemand 로 정한다(0 이 나오면 1).
        target = floor(aiDemand × (1 − (1 − progress)^SHAPE)). playerBooked = bookedThisSeason − aiBooked.
        newAi = min(target, max(0, bookLimit − playerBooked)). aiBooked 가 newAi 보다 작을 때만 올린다(줄이지 않음). bookedThisSeason = newAi + playerBooked.
     b. date.week === 번식 단계 마지막 주 + 1 이면, 플레이어 소유 종마(status 'stud', bookingSeason === date.year)마다 정산:
        conceptions = AI 교배 수(aiBooked)를 수태율로 판정 — `createRng(\`${state.initialSeed}:stud-settle:${id}:${year}\`)` 로 aiBooked 번 chance(fertility).
        income = conceptions × fee. income > 0 이면 recordMoney(플레이어, 'stud_fee_received', +income).
        StudState.seasons 에 { stallionId, year, fee, outsideCovers: aiBooked, ownCovers: bookedThisSeason − aiBooked, conceptions, income } 추가(최근 기록 STUD_SEASON_HISTORY_LIMIT = 60 건 유지, config 에 추가).
        이벤트 'stud_season_settled' 하나.
3. `src/engine/state/systems.ts` — createStudBooksSystem() 를 breeding 시스템 바로 다음에 넣는다.
4. `tests/engine/studBooks.test.ts`(신규)
5. (필요하면) 깨지는 고정값 테스트 — 원인이 이 시스템 추가뿐인지 확인한 뒤 기대값만 고치고 보고.

## 수용 기준
1. 같은 시드 2회 동일. 기존 rng 스트림 소비 순서 불변(새 난수는 독립 createRng 만) — 이 시스템을 빼고 돌린 경우와 레이스 결과·현역마가 같다(테스트로 확인: 52주 진행 후 raceResults 동일).
2. 시드 20261011 새 게임을 2026년 44주 → 2027년 26주까지 진행하며 측정·보고: 티어(데이터 marketTier)별로 '마감(bookedThisSeason ≥ bookLimit)된 종마 비율'과 '마감된 주의 중앙값'. 기준: 1티어 마감 비율 ≥ 60%, 5티어 ≤ 25%, 1티어 마감 주 중앙값이 2027년 1~10주 안.
3. 1티어 종마를 2027년 20주에 플레이어가 예약하면 대부분 'book_full'(마감된 종마에서 확인), 2026년 45주에는 성공.
4. 플레이어 종마(종부료 €17,000·수태율 0.85·북 110·인기 38·신인 시즌)를 세워 한 시즌 진행 → 정산 수입이 €0.9M~€2.0M 범위, 장부 'stud_fee_received' 합 = StudState.seasons 의 income, 이벤트 1개.
5. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. breeding/season.ts 수정 금지(사용만). 기존 rng 소비 순서 변경 금지. git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2번은 측정 표)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/studBooks.test.ts && npm test && npm run typecheck && npm run lint
