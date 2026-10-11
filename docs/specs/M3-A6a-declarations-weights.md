# M3-A6a 출주 결정(AI) · 부담중량 · 기수 배정

담당: haiku-coder · 선행: M3-A5(개최일), M3-C0(현역마), M3-B2(인물), GameState.seasonState(751ceea)

## 목적
한 주의 개최일 목록을 받아 (1) AI 마주의 출주를 정하고 (2) 확정 단계에서 기수·부담중량·작전·승부복을 붙여 runRace 에 넣을 SampleField 를 만든다. 순수 함수, 시드 재현.

## 사용할 타입·함수 (수정 금지)
- `Meeting`, `ScheduledRace`, `Declaration`, `SeasonState`(src/engine/types/season.ts) · `Race`, `RaceConditions`(race.ts) · `Horse`, `Jockey`, `Owner`, `Trainer`
- `SampleField`, `EntryRequest`(src/engine/race/sampleField.ts, setup.ts) — runRace 의 field 입력 형식 그대로
- `ageInYear`, `monthOfWeek`(time/calendar.ts), `weeksBetween`

## 생성·수정할 파일
1. `src/engine/config/entries.ts`
   - `MIN_WEEKS_BETWEEN_RUNS = 2`(그룹 레이스는 3), `MIN_FITNESS_TO_RUN = 55`
   - 거리 적합: |distanceOptimum − distance| ≤ distanceRange × `DISTANCE_TOLERANCE`(1.3)
   - 그룹·리스티드 후보 OR 하한: G1 100, G2 95, G3 90, L 82 (2세 그룹은 OR 없이 잠재 평균 상위 말 중에서)
   - 원정: 그룹 레이스는 다른 유럽 4개국 말도 `TRAVEL_CHANCE_GROUP = 0.15` 확률로 후보, 나머지는 같은 나라 말만
   - 목표 출주 두수(정수 균등): 그룹 8~14, 리스티드 8~12, 핸디캡 10~18, 메이든·노비스 8~14 (항상 ≤ maxRunners). 후보가 모자라면 있는 만큼, 2두 미만이면 그 레이스는 'abandoned'
   - WFA(3세가 4세 이상에게 받는 감량, lb) 표: 월(4~11) × 거리대(≤1,207 / ≤1,609 / ≤2,414 / 그 이상)
     4월 6·8·11·13, 5월 5·7·10·12, 6월 4·6·8·10, 7월 3·5·6·8, 8월 2·3·5·6, 9월 1·2·3·5, 10월 0·1·2·3, 11월 0·0·1·2 (12~3월은 4월 값)
   - 성별 감량: open 레이스에서 암말 3 lb. 핸디캡에는 적용하지 않는다(OR 에 반영된 것으로 본다)
   - 핸디캡: 상한 중량 = race.conditions.baseWeightLb, 최고 OR 말이 상한, 나머지는 상한 − (최고 OR − OR), 하한 `HANDICAP_MIN_WEIGHT_LB = 112`
   - 견습 감량은 그룹·리스티드 레이스에서 0
2. `src/engine/season/eligibility.ts` — `isEligible(horse, race, date, seasonState): boolean`:
   status 'in_training', 부상 없음, condition.fitness ≥ MIN_FITNESS_TO_RUN, 나이(ageInYear) 범위, 성별(fillies_mares 는 female, colts_geldings 는 male), 핸디캡 OR 범위(OR null 이면 불가), 메이든은 record.wins === 0, 노비스는 wins ≤ 1, 마지막 출주 후 최소 주 수.
3. `src/engine/season/declarations.ts` — `declareAiRunners(state: GameState, meetings: readonly Meeting[], rng: Rng): Meeting[]`:
   - 등급 높은 레이스부터(그룹 → 리스티드 → 핸디캡 클래스 오름 → 메이든·노비스) 전체 개최일을 훑으며 채운다. 한 말은 그 주에 한 레이스만.
   - 이미 있는 선언(플레이어)은 유지하고 그 수만큼 목표 두수에서 뺀다.
   - 후보 점수: 그룹·리스티드 = OR(2세는 잠재 평균) 내림차순 + 소량 잡음, 핸디캡 = 범위 안 무작위, 메이든·노비스 = 무작위(2세 경주는 조교사 juvenileFocus 가중).
   - Declaration: { horseId, ownerId, trainerId, jockeyId: null, weightLb: null, isPlayer: false }.
   - status 'open' 레이스만 채우고, 채운 뒤 'closed'. 2두 미만이면 'abandoned'.
4. `src/engine/season/field.ts` — `buildRaceField(state: GameState, sr: ScheduledRace, date: GameDate, rng: Rng): SampleField`:
   - 기수: 마주 retainedJockeyId(그 주 같은 레이스 중복 아니면) → 아니면 같은 나라 은퇴 안 한 기수 중 skill 가중 무작위(한 레이스에 같은 기수 금지; 체중: 부담중량 ≥ minRidingWeightLb 인 기수만).
   - 부담중량: 위 규칙(WFA·성별·핸디캡). EntryRequest.weightLb = 감량 전, jockeyAllowanceLb = 견습 감량(그룹·리스티드 0).
   - tactic = horse.preferredStyle, silks = owner.silks, isPlayer = declaration.isPlayer.
   - runners[i] = { horse(Pick 필드), jockey(Pick 필드) } — RunnerInput 에서 entry 를 뺀 형식.
   - ownerNames[i] = owner.name.
   - Declaration 의 jockeyId·weightLb 도 채운 새 ScheduledRace 를 함께 돌려줘도 된다(반환형 { field, race: ScheduledRace }).
5. `src/engine/season/weights.ts` — `wfaAllowanceLb(age, month, distance)`, `sexAllowanceLb(horse, race)`, `handicapWeights(ors: number[], top: number): number[]`
6. `tests/engine/declarations.test.ts` — 인물·현역마는 bootstrapPeople + bootstrapRacingPopulation, 개최일은 buildWeekMeetings 로 만든다(데이터는 tests/engine/fixtures/m1-racecourses.json 과 테스트 안 템플릿).

## 수용 기준
1. 같은 시드 → declareAiRunners·buildRaceField 결과 toEqual.
2. 한 주에 한 말이 두 레이스 이상 선언되지 않는다. 모든 선언 말이 isEligible 을 만족한다.
3. 6월 1주 같은 주의 그룹 레이스(테스트 템플릿) 출주마 평균 OR > 같은 주 핸디캡 클래스 4 출주마 평균 OR.
4. 핸디캡 부담중량: 최고 OR 말 = 상한, OR 이 5 낮으면 5 lb 가볍고, 하한 112 아래로 내려가지 않는다.
5. WFA: 4월 2,400m 에서 3세가 4세보다 11 lb 가볍고, 10월 1,200m 에서는 같다. 그룹 레이스에서 견습 감량 0.
6. 같은 레이스에 같은 기수 두 번 없음, 기수 체중 조건 충족.
7. buildRaceField 결과로 runRace 가 실행된다(테스트에서 1개 레이스 실제 실행).
8. 엔진에 Math.random/Date.now 없음. typecheck·lint·npm test 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). data/ 수정 금지. 시스템 등록·newGame 연결 금지(A6c). git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
