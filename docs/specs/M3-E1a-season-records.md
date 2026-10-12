# M3-E1a 시즌 기록: 퍼포먼스·레이스 레이팅·나라별 리딩

담당: haiku-coder · 선행: 5490ee0(SeasonState.performances·raceRatings·leadingByCountry, 저장 v5)

## 목적
레이스 결과를 반영할 때 시상(E1b)의 입력이 될 기록을 남긴다: 출주마별 퍼포먼스 레이팅(PR), 그룹 레이스 레이팅(상위 4두 PR 평균), 레이스 개최국 기준 나라별 리딩.

## 사용할 것 (수정 금지)
- 타입: `PerformanceEntry`, `RaceRatingEntry`, `LeadingTables`, `SeasonState`(types/season.ts), `CountryCode`
- `applyRatingsInPlace`·`performanceRatings`(season/handicapper.ts), `applyRaceResultInPlace`(season/apply.ts), `runMeetingInPlace`(season/raceday.ts), `emptyLeadingTables()`(season/state.ts)

## 생성·수정할 파일
1. `src/engine/season/handicapper.ts` — `applyRatingsInPlace` 가 계산한 PR 맵을 **반환**하도록 바꾼다(`Map<HorseId, number>`). OR 갱신 동작은 그대로.
2. `src/engine/season/apply.ts`
   - `ApplyRaceResultArgs` 에 `country: CountryCode` 추가(레이스 개최국).
   - 리딩 반영을 유럽 합산(`leading`)과 같은 규칙으로 `leadingByCountry[country]` 에도 한다(없으면 `emptyLeadingTables()` 로 만든다).
   - applyRatingsInPlace 가 돌려준 PR 로 출주마 전원에 `PerformanceEntry` 를 `performances[horseId]` 끝에 추가(raceId, templateId = scheduled.templateId, date, grade, distance, country, position, pr).
   - grade 가 null 이 아니면 `RaceRatingEntry` 를 `raceRatings` 에 추가: rating = 착순 상위 4두 PR 평균(출주 4두 미만이면 있는 만큼), 소수 첫째 자리 반올림. name = race.name.
   - 레이스 반영 순서: 성적·리딩 → OR(PR) → 퍼포먼스·레이스 레이팅 → 시리즈 … (기존 순서 유지, 새 단계는 OR 바로 뒤)
3. `src/engine/season/raceday.ts` — applyRaceResult 호출에 개최국 전달(이미 있는 courseCountry 조회 사용).
4. 기존에 applyRaceResult / applyRaceResultInPlace 를 직접 부르는 테스트가 있으면 `country` 인자를 넣어 고친다(기대값은 바꾸지 않는다).
5. `tests/engine/seasonRecords.test.ts` (신규)

## 수용 기준
1. 레이스 1개 반영 후: 출주마 수만큼 PerformanceEntry 가 생기고 pr 이 handicapper 의 PR 과 같다.
2. 그룹 레이스는 raceRatings 에 1건, rating = 상위 4두 PR 평균. 비그룹 레이스는 0건.
3. leadingByCountry[개최국] 의 합계(runners·wins·earnings)가 그 레이스분 leading 증가량과 같다. 다른 나라 표는 변하지 않는다.
4. 시즌 8주 통합(bootstrapGame + 테스트 템플릿, seasonSystem.test.ts 방식): 모든 나라 leadingByCountry 의 sire wins 합 = leading 의 sire wins 합. performances 의 전체 건수 = 그 기간 출주 수 합.
5. 같은 시드 재현성(기존 seasonSystem 재현 테스트 통과), 저장/불러오기 테스트 통과.
6. 엔진에 Math.random/Date.now 없음. `npm test && npm run typecheck && npm run lint` 통과. 52주 진행 시간이 기존 대비 +10% 이내(측정값 보고).

## 금지
src/engine/types 수정 금지. src/engine/season/system.ts 수정 금지(E1b 담당 — 연도 전환 시 비우기는 E1b 가 한다). data/ 수정 금지. git commit 금지.
