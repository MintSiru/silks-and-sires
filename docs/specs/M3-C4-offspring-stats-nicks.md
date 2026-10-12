# M3-C4 자마 성적 누적 · 실제 성적 기준 거리 적성 · 성적으로 닉스 공개

담당: haiku-coder · 선행: e681015(OffspringStats, GameState.sireStats, GameEvent nick_revealed, 저장 v6)

## 목적
레이스 결과마다 아비별 자마 성적을 쌓고, 그 성적에서 '실제 성적 기준 거리 적성'을 낸다. 진짜 닉스 배합(nicks.json 에 값이 있는 부 계통 × 모부 계통)의 말이 그룹 레이스를 이기면 그 닉스를 공개한다.

## 사용할 것 (수정 금지)
- 타입: `OffspringStats`, `GameState.sireStats`, `GameEvent` 'nick_revealed', `NickEntry`, `DistanceProfile`
- `revealNick(state, sireLineId, damsireLineId)`(breeding/season.ts), `nickValue`·`nickKey`(breeding/nicks.ts), `damsireLineOf`(breeding/season.ts), `PROFILE_BOUNDS`(config — speed/classic/middle/cup 경계), `applyRaceResultInPlace`(season/apply.ts), `runMeetingInPlace`(season/raceday.ts), `SeasonStaticData`(season/system.ts)

## 생성·수정할 파일
1. `src/engine/config/offspring.ts` (신규) — `OBSERVED_PROFILE_MIN_WINS = 5`(이보다 적으면 실제 적성 미정), `NICK_REVEAL_MIN_VALUE`(nicks.json 값이 이 이상이면 '좋은 닉스'로 보고 공개 대상, 0.3), `NICK_REVEAL_GRADES = ['G1','G2','G3']`
2. `src/engine/breeding/offspring.ts` (신규, 순수 함수)
   - `emptyOffspringStats(): OffspringStats`
   - `recordOffspringRun(stats, args: { firstStart: boolean; becameWinner: boolean; won: boolean; groupWin: boolean; firstGroupWin: boolean; earnings: number; distance: number }): void`
   - `observedProfile(stats): DistanceProfile | null` — wins < MIN 이면 null, 아니면 평균 우승 거리를 PROFILE_BOUNDS 로 분류
3. `src/engine/season/apply.ts` — 레이스 반영 때(성적 반영 단계 근처) 출주마마다 sireId 가 있으면 `draft.sireStats[sireId]` 갱신(없으면 empty 로 만든다). firstStart = 이번이 그 말의 첫 출주(record.starts 가 이번 반영으로 1이 됨), becameWinner = 이번 우승으로 wins 가 1이 됨, firstGroupWin 도 같은 방식. earnings = 이번 레이스 그 말의 상금.
   - 그룹 레이스(G1~G3) 1착 말: 부 계통 = horse.sireLineId, 모부 계통 = damsireLineOf. nickValue ≥ NICK_REVEAL_MIN_VALUE 이고 revealNick 이 true(새로 공개)면 이벤트 'nick_revealed'.
   - ApplyRaceResultArgs 에 `nicks: readonly NickEntry[]` 추가(raceday 에서 전달).
4. `src/engine/season/raceday.ts`·`src/engine/season/system.ts` — SeasonStaticData 에 `nicks: NickEntry[]` 추가하고 runMeeting ctx 로 전달. `createGameSystems`(state/systems.ts)는 GameStaticData 가 이미 nicks 를 가지면 그대로 넘어간다(필요하면 1줄 수정).
5. 기존 테스트에서 applyRaceResult / createSeasonSystem / runMeeting 을 부르는 곳에 nicks(빈 배열 또는 테스트 표)를 넣는다(기대값은 바꾸지 않는다).
6. `tests/engine/offspring.test.ts` (신규)

## 수용 기준
1. 같은 아비의 자마 2두가 3레이스(1두가 2승, 그중 1승은 G2)를 뛰면: starters 2, winners 1, runs 3, wins 2, groupWins 1, groupWinners 1, earnings·winDistanceSum 이 결과와 일치.
2. observedProfile: 우승 4회면 null, 우승 5회 평균 1,400m → speed, 2,000m → classic, 2,400m → middle, 3,000m → cup(경계값은 PROFILE_BOUNDS 규칙대로).
3. 닉스: nickValue 0.5 배합의 말이 G3 1착 → revealedNicks 에 키 추가 + 'nick_revealed' 이벤트 1건. 같은 배합 두 번째 그룹 우승 → 이벤트 없음. 리스티드·핸디캡 우승, 값 0.1 배합, 이미 공개된 닉스 → 이벤트 없음.
4. 시즌 8주 통합(bootstrapGame + 테스트 템플릿): sireStats 의 runs 합 = 그 기간 출주 수 합, wins 합 = 우승 수 합. 같은 시드 재현·저장 왕복 통과.
5. 52주 진행 시간 +5% 이내(측정값 보고).
6. 엔진에 Math.random·Date.now 없음, 매직 넘버는 config/offspring.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. data/ 수정 금지. UI 수정 금지(산구 성적 화면은 D3). git commit 금지.
