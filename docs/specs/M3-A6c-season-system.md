# M3-A6c 시즌 주간 시스템 + 새 게임 초기화 + 플레이어 출주 API

담당: haiku-coder · 선행: M3-A6b 승인

## 목적
주마다 (1) 이번 주 개최일의 AI 출주 확정 → 실행 → 결과 반영, (2) 다음 주 개최일 생성(플레이어 출주 접수용)을 돌리는 WeeklySystem 을 만들고, 새 게임 시작 시 인물·현역마까지 한 번에 만드는 초기화 함수와 플레이어 출주 API 를 만든다.

## 사용할 것 (수정 금지 타입)
GameState.seasonState(SeasonState: meetings, series, leading, lastRun, lastPopulationYear, replayable, nextGeneratedRace), SeriesDefinition, RaceTemplate, Meeting, Declaration · 함수: buildWeekMeetings(A5), declareAiRunners·buildRaceField·isEligible(A6a), runMeeting(A6b), bootstrapPeople(B2), bootstrapRacingPopulation·createPopulationSystem(C0), createEmptySeasonState, bootstrapWorld·createNewGame(M2)

## 생성·수정할 파일
1. `src/engine/season/system.ts` — `createSeasonSystem(data: SeasonStaticData): WeeklySystem` (id 'season'). `SeasonStaticData = { courses: Racecourse[]; templates: RaceTemplate[]; series: SeriesDefinition[] }`. run(draft, ctx):
   a. **연도 전환**(date.week === 1 이고 seasonState.year !== date.year): points 시리즈 champion 확정(전년 포인트 1위, 동점은 horseId 순) + bonus + series_completed 이벤트, leading 을 빈 표로, year 갱신, raceResults 중 (year − RESULTS_KEEP_SEASONS) 이전 결과 삭제.
   b. **이번 주 개최 실행**: seasonState.meetings 중 date 가 이번 주인 것 → declareAiRunners(코스 나라 lookup 필수) → runMeeting 각각 → 결과 반영된 state 사용. 실행한 개최일은 meetings 에서 뺀다.
   c. **다음 주 개최 생성**: buildWeekMeetings(다음 주 date, templates, courses, ctx.rng.fork('meetings'), nextGeneratedRace) → meetings 에 추가, nextGeneratedRace 갱신.
   d. **휴식 회복(임시, C1 이 대체)**: in_training·resting 말 전부 fatigue −10(최소 0), fitness +4(최대 85). 상수는 config/season.ts.
   e. 이벤트를 모아 반환.
   - rng 는 ctx.rng.fork('season') 하위로만.
2. `src/engine/state/bootstrap.ts` — `bootstrapGame(opts: { seed; playerName; silks; country?; studName? }, data: BootstrapData): GameState`: createNewGame → bootstrapWorld(rng fork 'world', 기존 useGame 과 같은 방식) → bootstrapPeople(fork 'people') → bootstrapRacingPopulation(fork 'population') → seasonState.lastPopulationYear = START_YEAR → 첫 주(week 1)의 다음 주(week 2) 개최일을 미리 생성.
3. `src/engine/season/player.ts` — 플레이어 API(순수 함수, 성공/실패 결과 반환):
   - `declarePlayerHorse(state, meetingId, raceId, horseId)`: 플레이어 말·in_training·trainerId 있음·isEligible·그 레이스 'open'·그 주에 다른 선언 없음·maxRunners 미만 → Declaration(isPlayer true) 추가. 실패 사유 코드: 'not_player_horse' | 'no_trainer' | 'not_eligible' | 'race_closed' | 'already_declared' | 'field_full' | 'not_found'.
   - `withdrawPlayerHorse(state, meetingId, raceId, horseId)`.
   - `assignTrainer(state, horseId, trainerId)`: 플레이어 말을 조교사에게 맡김(capacity 확인), status 가 yearling/weanling 이 아니고 2세 이상이면 'in_training' 으로. 실패 코드 'trainer_full' 등.
4. `src/engine/world/populationSystem.ts` — 중복 실행 방지를 seasonState.lastPopulationYear 로 바꾸고(TODO(M3-A6) 해소), 실행 후 갱신.
5. `src/engine/state/systems.ts` — `createGameSystems(data: GameStaticData)`: 순서 calendar → growth → breeding → population → season. `GameStaticData = BreedingStaticData & SeasonStaticData & RacingPopulationStaticData`.
6. `src/engine/data/staticData.ts` — `getRaceTemplates()`(data/calendar/g1.json, 없으면 빈 배열이 아니라 **빈 배열 JSON 파일을 만들어 둔다**), `getSeriesDefinitions()`(data/calendar/series.json, 마찬가지). `data/calendar/g1.json`, `data/calendar/series.json` 을 `[]` 로 생성(내용은 A4a 가 채운다).
7. `src/ui/game/useGame.ts` — newGame 이 bootstrapGame 을 쓰고, advance 류가 새 createGameSystems 데이터를 쓰도록 최소 수정. 플레이어 API 를 훅에 노출(declare/withdraw/assignTrainer).
8. 테스트 `tests/engine/seasonSystem.test.ts`.

(파일 수가 많지만 대부분 짧은 연결 수정이다)

## 수용 기준
1. bootstrapGame 같은 시드 → toEqual. 인물·현역마·다음 주 개최가 들어 있다.
2. 테스트용 템플릿(테스트 안에서 만든 G1 2개 + crown 시리즈 1개)으로 2026년 4월 1주부터 8주 진행: 매주 개최가 실행되고, 실행된 레이스 수 > 0, 결과 반영(어떤 AI 마주 funds 증가), meetings 에 지난 주 개최가 남지 않는다.
3. 같은 시드 8주 진행 2회 → 최종 state toEqual(재현성).
4. 플레이어 말을 assignTrainer → declarePlayerHorse 하면 다음 주 그 레이스에 출주하고 결과가 raceResults·replayable 에 남는다. 실패 사유 코드 각각 1개 이상 테스트.
5. 연도 전환 테스트: 52주 진행(성능 측정 포함, 테스트 시간 출력) 후 leading 이 새해 빈 표, points 시리즈 champion 확정.
6. 저장/불러오기: 8주 진행 상태를 serializeGame → deserializeGame 하면 같은 상태.
7. 엔진에 Math.random/Date.now 없음. typecheck·lint·npm test·build 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). data/ 는 calendar 의 빈 배열 파일 2개만 생성. git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint && npm run build`
