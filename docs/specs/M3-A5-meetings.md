# M3-A5 개최일 구성 + 자동 생성 경주

담당: haiku-coder · 선행: M3-A1(타입), Race.layoutId(c7ea087)

## 목적
한 주의 개최일(Meeting) 목록을 만든다: 고정 일정 레이스(RaceTemplate)를 경마장별로 묶고, 개최일마다 메이든·노비스·핸디캡을 자동 생성해 채우며, 일반 개최(소규모 경마장)를 추가한다. 순수 함수, 시드 재현.

## 사용할 타입 (수정 금지)
- `src/engine/types/season.ts`: ScheduleSlot, RaceTemplate, Meeting, ScheduledRace
- `src/engine/types/race.ts`: Race(layoutId 포함), RaceKind, RaceClass, RaceConditions
- `src/engine/types/course.ts`: Racecourse · `src/engine/types/time.ts`: GameDate, Week
- 달력: `src/engine/time/calendar.ts` 의 monthOfWeek, isInPhase

## 생성·수정할 파일
1. `src/engine/config/meetings.ts` — 상수:
   - `MEETING_RACES_TARGET = 7`, `MINOR_MEETINGS_PER_WEEK = { GB: 3, IE: 2, FR: 2, DE: 1, IT: 1 }`, `AW_MEETINGS_PER_WEEK = 2`
   - 생성 경주 종류 가중치(잔디 시즌): maiden 0.25, novice 0.15, handicap 0.60
   - 핸디캡 클래스별 OR 범위: 2: 86–105, 3: 76–95, 4: 66–85, 5: 56–75, 6: 46–65, 7: 0–50 · 클래스 가중치 2:0.08, 3:0.17, 4:0.25, 5:0.25, 6:0.17, 7:0.08
   - 클래스별 총상금(€): 1(리스티드 미만 conditions) 40,000 · 2: 30,000 · 3: 15,000 · 4: 9,000 · 5: 6,500 · 6: 5,000 · 7: 4,000 / 메이든 9,000 / 노비스 10,000. 착순 배분 [0.57, 0.22, 0.11, 0.055, 0.03, 0.015]
   - 2세 경주: 잔디 시즌에서 `TWO_YO_FROM_WEEK = 15`(4월 중순, 1,006~1,207m만), 9월 이전 2세 거리 상한 1,609, 이후 2,012
   - 거리 가중: 스프린트(≤1,408) 0.40, 마일(≤1,811) 0.30, 중거리(≤2,414) 0.22, 장거리 0.08
   - maxRunners: 메이든·노비스 14, 핸디캡 18(클래스 2·3 은 20)
2. `src/engine/season/schedule.ts` — `weekOfSlot(slot: ScheduleSlot): Week` (그 달 첫 주 + weekOfMonth − 1, 그 달을 넘으면 RangeError), `slotOfWeek(week: Week): ScheduleSlot`.
3. `src/engine/season/generateRace.ts` — `generateRace(rng, course, kind, raceClass, opts): Race`:
   - id: `gen-${year}-${seq}`(seq 6자리 0채움), name: `${course.name} ${라벨}` 라벨 = "Maiden Stakes" / "Novice Stakes" / "Class N Handicap" (가상 경마장 이름 + 일반어라 원칙 1 위반 아님)
   - distance: 그 경마장 distances 에서 거리 가중으로 고르고, 같은 거리가 여러 레이아웃에 있으면 첫 항목의 layoutId 를 쓴다(명시 저장).
   - conditions: 메이든 2세(2–2) / 3세 이상(3–null), 노비스 2세 또는 3세 이상, 핸디캡 3세 이상 + OR 범위, weightSystem: 핸디캡 'handicap', 나머지 'wfa', baseWeightLb 126(핸디캡 133, 상한 중량)
   - grade null, raceClass, prizeMoney(위 배분, 정수 €), maxRunners.
4. `src/engine/season/meetings.ts` — `buildWeekMeetings(args: { date: GameDate; templates: readonly RaceTemplate[]; courses: readonly Racecourse[]; rng: Rng; nextGeneratedRace: number }): { meetings: Meeting[]; nextGeneratedRace: number }`
   - 이번 주(weekOfSlot(t.schedule) === date.week) 템플릿을 racecourseId 별로 묶어 개최일 생성, cardOrder 순서.
   - 각 개최일을 MEETING_RACES_TARGET 까지 생성 경주로 채운다(템플릿이 이미 그보다 많으면 그대로).
   - 잔디 시즌(isInPhase(week, 'turf_flat'))이면 국가별 MINOR_MEETINGS_PER_WEEK 만큼, 이번 주 개최가 없는 그 나라 잔디 경마장에서 일반 개최를 추가(경마장 수가 모자라면 있는 만큼).
   - 올웨더 시즌이면 surface 'aw' 경마장만 AW_MEETINGS_PER_WEEK 개(잔디 템플릿 개최는 없음). AW 생성 경주는 클래스 3~7 핸디캡·메이든·노비스.
   - Meeting.id = `${racecourseId}:${year}-${week}`, going null, 각 ScheduledRace: status 'open', templateId(템플릿이면 그 id, 아니면 null), declarations [], simulated false.
   - 출력은 racecourseId 오름차순 정렬(재현성).
5. `tests/engine/meetings.test.ts` — 테스트용 템플릿·경마장은 테스트 안에서 만든다(data/races.json 은 다른 티켓이 바꾸는 중이라 의존하지 말 것). 경마장은 tests/engine/fixtures/m1-racecourses.json 사용 가능.

## 수용 기준
1. weekOfSlot/slotOfWeek 왕복: 모든 week 1~52 에서 weekOfSlot(slotOfWeek(w)) === w.
2. 같은 입력·시드 → buildWeekMeetings 결과 toEqual.
3. 템플릿 2개가 같은 주·같은 경마장이면 개최일 1개에 cardOrder 순서로 들어가고, 개최일 레이스 수 ≥ MEETING_RACES_TARGET.
4. 생성 경주의 distance(+layoutId)는 그 경마장의 유효한 (거리, 레이아웃) 쌍이다(buildRacePath 로 확인).
5. 잔디 시즌 주에는 일반 개최가 국가별 설정 수만큼(경마장이 있는 한) 생기고, 올웨더 시즌 주에는 surface 'aw' 개최만 생긴다.
6. 2세 경주는 TWO_YO_FROM_WEEK 이전에 생성되지 않고, 9월 이전 2세 거리 ≤ 1,609.
7. 엔진에 Math.random/Date.now 없음. typecheck·lint·npm test 통과.

## 금지
src/engine/types 수정 금지. data/ 수정 금지. GameState 연결(시스템 등록)은 하지 않는다(A6). git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
