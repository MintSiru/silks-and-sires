# M3-A6b 개최일 실행 + 결과 반영

담당: haiku-coder · 선행: M3-A6a 승인

## 목적
출주가 확정된 개최일을 실행한다(마장 결정 → 필드 구성 → 시뮬레이션 또는 요약 모드 → 결과). 결과를 게임 상태에 반영한다(상금·성적·컨디션·리딩·시리즈·결과 보존·다시보기·이벤트). 순수 함수, 시드 재현.

## 사용할 타입·함수 (수정 금지)
- 타입: Meeting, ScheduledRace, SeasonState, SeriesDefinition, SeriesProgress, LeadingEntry, LeadingCategory, ReplayableRace(season.ts) · RaceResult, FinishRecord, Race(race.ts) · GameState, GameEvent(race_run, series_completed)
- `buildRaceField`(A6a), `runRace`(race/runRace.ts), `buildRaceResult`·`sectionalMarks`(race/results.ts), `estimateStrength`(race/runnerModel.ts), `rollGoing`(going/going.ts), `buildEntries`(race/setup.ts), `monthOfWeek`

## 생성·수정할 파일
1. `src/engine/config/season.ts`
   - `SIMULATE_GRADES`: 그룹·리스티드(grade !== null)와 플레이어 말 출주 레이스는 시뮬레이션, 나머지는 요약 모드
   - `SUMMARY_NOISE_SD = 0.006` (예상 시간 대비 표준편차 비율)
   - 출주 후 컨디션: fatigue += 거리대별 {≤1,207: 18, ≤1,609: 22, ≤2,414: 28, 그 이상: 35}, fitness −8 (0~100 clamp)
   - `REPLAYABLE_MAX = 30`, `RESULTS_KEEP_SEASONS = 2`(이보다 오래된 raceResults 는 시즌 바뀔 때 A6c 가 정리)
2. `src/engine/season/summary.ts` — `summarizeRace(args: { race, course, going, date, seed, field }): RaceResult`:
   - runRace 와 같은 시드 분기 규칙(fork('draw')로 게이트, fork('odds')로 오즈, fork('sim') 대신 fork('summary'))
   - 각 주자 예상 시간 = estimateStrength 의 −값(초), × (1 + N(0, SUMMARY_NOISE_SD)) → FinishRecord(markTimes 는 sectionalMarks 개수만큼 선형 비례)
   - buildRaceResult 로 RaceResult(착차·performanceFigure 포함). 출력 형식이 runRace 결과와 같아야 한다.
3. `src/engine/season/raceday.ts` — `runMeeting(state, meeting, ctx: { courses; series: readonly SeriesDefinition[] }, rng): { state: GameState; meeting: Meeting; results: RaceResult[]; events: GameEvent[] }`:
   - 개최일 마장: rollGoing(rng.fork('going:'+meeting.id), course, monthOfWeek(week)) — meeting.going 에 기록
   - 'closed' 레이스마다: 레이스 시드 = rng.fork('race:'+race.id) 에서 정수 하나. buildRaceField → 시뮬(runRace, recordReplay false) 또는 summarizeRace → applyRaceResult. status 'run', simulated 표시.
   - 'abandoned' 레이스는 건너뛴다.
4. `src/engine/season/apply.ts` — `applyRaceResult(state, args: { meeting, scheduled, result, field, series }): { state; events }` (state 는 복제본을 고쳐 반환):
   - 상금: race.prizeMoney[pos−1] 를 마주 funds 에 더함, horse.record.earnings 에도.
   - horse.record: starts, wins, seconds, thirds, blackTypePlacings(grade !== null && pos ≤ 3), groupWins(grade 가 G1~G3 이고 1착).
   - 컨디션: 위 config. seasonState.lastRun[horseId] = date.
   - 리딩(seasonState.leading): sire = horse.sireId, damsire = horses[damId]?.sireId(없으면 건너뜀), jockey, trainer, owner, breeder(breederId). runners+1, wins, places(pos ≤ 3), groupWins, earnings(그 말이 번 상금).
   - 시리즈: templateId 가 어떤 시리즈 legs 에 있으면 — crown: legWinners 기록, 우승 레그 수가 winsRequired 이상이고 requiredLegs 모두 포함이면 champion 설정 + bonus 를 그 말 마주에게 + 이벤트 series_completed. points: pointsByPosition 으로 누적(시즌 1위 결정은 A6c 의 시즌 종료). SeriesProgress 는 (seriesId, year) 단위로 없으면 만든다.
   - 결과 보존: grade !== null 이거나 플레이어 말이 있으면 state.raceResults 에 push.
   - 다시보기: 플레이어 말이 있거나 grade 'G1' 이면 ReplayableRace 를 seasonState.replayable 앞에 넣고 REPLAYABLE_MAX 로 자른다.
   - 이벤트 race_run: grade !== null 또는 플레이어 말 출주 레이스만.
5. `tests/engine/raceday.test.ts`

## 수용 기준
1. 같은 시드 → runMeeting 결과(state·results·events) toEqual.
2. summarizeRace 결과가 RaceResult 형식 검증을 통과하고, 강한 말(능력 +15) 이 200회 중 1착 비율 ≥ 60%.
3. ReplayableRace 로 runRace 를 다시 돌리면 저장된 RaceResult 와 착순·finishTime 이 같다(플레이어 레이스 1개로 검증).
4. 상금 합: 한 레이스의 마주 funds 증가 합 = prizeMoney 중 실제 출주 두수까지의 합.
5. 리딩 sire 표의 wins 합 = 그 주 레이스 수(동착 제외 기준), earnings 합 = 지급 상금 합.
6. crown 시리즈: 테스트 시리즈(레그 2개)에서 같은 말이 두 레그 우승 → champion, bonus 지급, series_completed 이벤트 1건.
7. 엔진에 Math.random/Date.now 없음. typecheck·lint·npm test 통과.

## 금지
src/engine/types 수정 금지. data/ 수정 금지. WeeklySystem 등록·newGame 연결 금지(A6c). git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
