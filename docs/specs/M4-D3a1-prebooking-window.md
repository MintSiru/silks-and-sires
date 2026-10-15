# M4-D3a-1 예약 창(11월부터)·사전 예약·예약 시즌 전환

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D3 '북 마감' · 선행: D3a-0(커밋 — Stallion.bookingSeason·aiBooked·aiDemand, 저장 v16), Mare.bookedFor(선택 필드, 타입에 있음)

목적: 사용자 결정 '주간 점진 마감'의 바탕 — 플레이어가 전년 11월부터 다음 시즌 종마를 미리 예약할 수 있게 하고(임신 중인 암말도), 종마 예약 집계를 시즌 단위로 넘긴다. AI 예약 누적은 다음 티켓(D3a-2).

## 사용할 타입·함수 (수정 금지)
- `Stallion { bookedThisSeason; bookingSeason; aiBooked; aiDemand; bookLimit; fee; firstSeasonYear; horseId }`, `Mare { coveredBy; coveredWeek; pregnant; dueWeek; bookedFor?: { stallionId; season } | null }`, `GameDate`, `BookingResult`/`BookingError`(breeding/season.ts 기존).
- config/game.ts 의 달력 단계(breeding: startWeek 7, endWeek 26) — 숫자를 하드코딩하지 말고 이 설정에서 읽는다. `recordMoney`, `canSpendDiscretionary`, `isInPhase`.

## 생성·수정할 파일 (3개)
1. `src/engine/config/stud.ts` — 추가: `BOOKING_OPEN_WEEK = 44`(11월 첫 주: 다음 시즌 예약 창이 열림).
2. `src/engine/breeding/season.ts`
   - `export function bookingSeasonOf(date: GameDate): number | null` — week ≥ BOOKING_OPEN_WEEK → year + 1 / week ≤ 번식 단계 마지막 주 → year / 그 사이(27~43주) → null(예약 창 닫힘).
   - `export function rollBookingSeason(stallion: Stallion, season: number): void` — bookingSeason ≠ season 이면 bookingSeason = season, bookedThisSeason·aiBooked·aiDemand = 0.
   - `bookCovering` 변경:
     - 'not_breeding_season' 판정을 `bookingSeasonOf(date) === null` 로 바꾼다(오류 코드 이름은 그대로, 뜻은 '예약 창 밖').
     - season = bookingSeasonOf(date). season < stallion.firstSeasonYear 면 'stallion_not_available'. 북 상한 검사는 시즌을 맞춘 값으로(복제본에서 rollBookingSeason 후 bookedThisSeason ≥ bookLimit 면 'book_full').
     - **즉시 교배**: date 가 번식 단계 안이고 season === date.year 이고 암말이 임신 중이 아니고 coveredBy·bookedFor 가 비어 있으면 — 지금과 같게 coveredBy·coveredWeek(이번 주).
     - **사전 예약**: 그 밖(번식 단계 밖이거나 임신 중)이면 mare.bookedFor = { stallionId, season }. 단 임신 중이면 dueWeek 가 그 시즌 번식 단계 마지막 주보다 앞서야 한다(아니면 'already_pregnant'). 이미 bookedFor 가 있거나(같은 시즌) coveredBy 가 있고 임신 중이 아니면 'already_covered'.
     - 두 경우 모두 종부료는 예약 때 낸다(자기 종마면 0, 기존 규칙), nextStallion.bookedThisSeason += 1.
   - `createBreedingSystem` run 에 추가(기존 순서 앞에):
     - week === BOOKING_OPEN_WEEK 면 모든 종마 rollBookingSeason(s, year + 1).
     - 번식 단계 주마다(id 오름차순): bookedFor.season === year, 임신 중 아님, coveredBy === null 인 암말 → coveredBy = bookedFor.stallionId, coveredWeek = 이번 주, bookedFor = null(다음 주에 기존 규칙으로 수태 판정).
     - 번식 단계가 끝난 다음 주(endWeek + 1): bookedFor.season === year 로 남은 암말은 환불(기존 불수태 환불과 같은 규칙: 자기 종마면 환불 없음), 그 종마 bookingSeason === year 면 bookedThisSeason −1, bookedFor = null. 이벤트는 만들지 않는다.
   - `resetSeason`: 종마 bookedThisSeason 을 0 으로 만드는 부분을 없앤다(시즌 전환은 rollBookingSeason 이 맡는다). 지난 시즌의 남은 coveredBy(임신 아님, coveredWeek 가 이번 시즌 첫 주보다 이전)만 지운다.
   - 불수태 판정의 bookedThisSeason −1 은 그 종마 bookingSeason === 올해일 때만.
3. `tests/engine/prebooking.test.ts`(신규)

## 수용 기준
1. bookingSeasonOf: 2026-44주 → 2027, 2026-26주 → 2026, 2026-30주 → null, 2026-1주 → 2026.
2. 2026년 46주에 임신 중(2027년 10주 출산 예정)인 플레이어 암말로 사전 예약 성공 → bookedFor = { 종마, 2027 }, 종부료 지출 기록, 종마 bookingSeason 2027·bookedThisSeason 1. 2027년 출산 후 번식 주에 coveredBy 로 바뀌고 다음 주 수태 판정(같은 시드 2회 동일).
3. 출산 예정이 2027년 30주인 암말은 사전 예약 'already_pregnant'. 30주(창 닫힘)에는 'not_breeding_season'.
4. 시즌 끝까지 바뀌지 못한 사전 예약은 27주에 환불되고 bookedFor 가 지워진다.
5. 44주 진행 후 모든 종마 bookingSeason = 다음 해, 카운트 0.
6. 기존 breedingSeason·breeding 관련 테스트가 통과한다(동작이 바뀐 곳은 이유를 보고). `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 기존 rng 소비 순서 변경 금지(새 동작은 난수를 쓰지 않는다). git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/prebooking.test.ts tests/engine/breedingSeason.test.ts && npm test && npm run typecheck && npm run lint
