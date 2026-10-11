# M3-C3 OR 핸디캐퍼 (결과 → 공식 레이팅 갱신, 첫 OR 부여)

담당: haiku-coder · 선행: M3-A6c 승인, 공용 타입 a2f73a8(SeasonState.unratedFigures, 저장 v3)

## 목적
레이스 결과마다 출주마의 퍼포먼스 레이팅(PR, OR 척도)을 계산한다. OR 이 있는 말은 OR 을 올리거나 내리고, OR 이 없는 말은 PR 을 모았다가 첫 OR 을 매긴다.

## 척도 (사용자 결정, docs/m3-plan.md "레이팅 척도")
공식 OR 상한 140. 일반 G1 우승마 115~122, 그해 최강마 125~130, 역대급 135+.

## 사용할 것 (수정 금지)
- 타입: `RaceResult`, `RunnerResult.performanceFigure`(승자 = 0, 패배 마신 × lb/마신 + 부담중량 차, 단위 lb), `RunnerResult.beatenLengths`, `Race`(kind, grade, raceClass, conditions), `RatingChange`, `SeasonState.ratingHistory`, `SeasonState.unratedFigures`, `Horse.officialRating`
- 상수: `RATING_MIN`, `RATING_MAX`(config/population.ts), `HANDICAP_OR_RANGE`(config/meetings.ts)
- `applyRaceResultInPlace`(season/apply.ts)는 결과 반영의 진입점이다. 여기에 한 줄로 연결한다.

## 생성·수정할 파일
1. `src/engine/config/rating.ts` (신규) — 아래 상수 전부
   - `ANCHOR_MAX_BEATEN_L = 10`: 기준마로 쓰는 말의 최대 패배 마신
   - `MIN_ANCHORS = 2`, `STANDARD_PRIOR_WEIGHT = 1`: 기준마가 적을 때 레이스 표준과 섞는 가중치
   - `RACE_STANDARD`: 레이스 표준 승자 레벨(OR 척도). G1 115, G2 108, G3 104, L 98, conditions 90, 핸디캡 = 그 클래스 HANDICAP_OR_RANGE 의 max − 3(클래스 7 은 50), 메이든 2세 70, 메이든 3세 이상 66, 노비스 74. 2세 그룹 레이스는 G1 105, G2 98, G3 94(2세 기준이 낮다).
   - `UP_RATE_WIN = 0.7`, `UP_RATE = 0.5`, `DOWN_RATE = 0.25`
   - `MAX_RISE = 12`, `MAX_DROP = 5`, `HANDICAP_WIN_MIN_RISE = 2`
   - `NO_DROP_BEATEN_L = 20`: 이보다 크게 진 말은 OR 을 내리지 않는다(사고·불운으로 본다)
   - `FIRST_OR_RUNS = 3`: 첫 OR 에 필요한 출주 수(우승하면 그 즉시)
   - `FIRST_OR_TOP_N = 2`: 첫 OR = 최고 PR N개 평균(반올림)
   - `RATING_HISTORY_MAX = 12`
2. `src/engine/season/handicapper.ts` (신규)
   - `raceLevel(race: Race, result: RaceResult, ratings: ReadonlyMap<HorseId, number | null>, ages: ReadonlyMap<HorseId, number>): number` — 승자 레벨 L
     - 기준마 = 레이스 전 OR 이 있고 beatenLengths ≤ ANCHOR_MAX_BEATEN_L 인 말. 각 기준마의 승자 레벨 = OR − performanceFigure.
     - 기준마 n ≥ MIN_ANCHORS 면 L = 중앙값(짝수면 가운데 둘 평균). n < MIN_ANCHORS 면 L = (기준마 승자 레벨 합 + 표준 × STANDARD_PRIOR_WEIGHT) / (n + STANDARD_PRIOR_WEIGHT).
     - 표준: RACE_STANDARD(레이스 등급·종류·클래스와 2세 레이스(conditions.maxAge === 2) 여부로 고른다)
   - `performanceRatings(race, result, ratings, ages): Map<HorseId, number>` — PR = clamp(round(L + performanceFigure), RATING_MIN, RATING_MAX)
   - `nextRating(prev: number, pr: number, position: number, beatenLengths: number, race: Race): number` — 아래 규칙. 결과는 clamp(RATING_MIN, RATING_MAX).
     - d = pr − prev
     - 1착: 변화 = clamp(round(d × UP_RATE_WIN), 0, MAX_RISE). 핸디캡 우승이면 최소 HANDICAP_WIN_MIN_RISE.
     - 1착 아님, d > 0: clamp(round(d × UP_RATE), 0, MAX_RISE)
     - d < 0: beatenLengths > NO_DROP_BEATEN_L 이면 0, 아니면 max(round(d × DOWN_RATE), −MAX_DROP)
   - `applyRatingsInPlace(draft: GameState, race: Race, result: RaceResult, date: GameDate): void`
     - 레이스 전 OR 을 먼저 모두 읽어 PR 을 계산한 뒤 갱신한다(갱신된 OR 이 같은 레이스의 다른 말 계산에 쓰이면 안 된다).
     - OR 있는 말: nextRating. 값이 바뀌면 ratingHistory[horseId] 맨 뒤에 RatingChange{date, raceId, from, to} 추가, RATING_HISTORY_MAX 개로 앞쪽을 자른다.
     - OR 없는 말: unratedFigures[horseId] 에 PR push. (출주 수 ≥ FIRST_OR_RUNS 또는 이번에 1착)이면 첫 OR = 최고 PR FIRST_OR_TOP_N 개 평균(반올림, clamp), RatingChange{from: null}, unratedFigures 항목 삭제.
     - 나이는 ageInYear(horse, date.year) 등 기존 함수.
3. `src/engine/season/apply.ts` — applyRaceResultInPlace 안에서 성적·리딩 반영 뒤 `applyRatingsInPlace` 호출 1줄(+ import). 다른 동작은 바꾸지 않는다.
4. `tests/engine/handicapper.test.ts`
5. (필요하면) `tests/engine/seasonSystem.test.ts` 에 52주 분포 검사 추가 — 또는 handicapper.test.ts 안에 둔다.

## 수용 기준
1. 기준마 4두(OR 100·95·90·85)가 정확히 OR 대로 들어온 conditions 레이스(performanceFigure 0·−5·−10·−15): L = 100, 모든 PR = OR, OR 변화 없음.
2. 같은 필드에서 승자가 기대보다 6 lb 더 이긴 경우(2·3·4착 PR 이 각자 OR 과 같고 승자의 기준 레벨 106): 승자 OR 100 → 104(round(6 × 0.7)). 기대보다 20 lb 이긴 승자는 +12(MAX_RISE).
3. 핸디캡 우승마는 d ≤ 0 이어도 +2. 21마신 이상 진 말은 내려가지 않고, 크게 부진한 말도 한 번에 −5 까지만 내려간다.
4. OR 없는 말: 1·2번째 출주 후 OR null, 3번째 출주 후 OR = 최고 PR 2개 평균. 첫 출주에서 우승하면 바로 OR 이 붙는다. unratedFigures 항목이 지워지고 ratingHistory 에 from null 기록이 남는다.
5. 기준마 0두(2세 메이든): L = RACE_STANDARD 메이든 2세 = 70.
6. ratingHistory 는 말마다 최대 12건.
7. 통합: bootstrapGame + 테스트 템플릿(seasonSystem.test.ts 와 같은 방식)으로 52주 진행 → (a) 같은 시드 2회 결과 같음, (b) OR 변동 기록 > 0, 첫 OR 부여 > 0, (c) 시즌 시작 때 OR 있던 말들의 OR 평균 변화가 −3 ~ +3(인플레이션·디플레이션 없음), (d) 최고 OR ≤ 140. 보고에 시즌 끝 OR 분포(3세 이상 p50·p90·p99·최고, 그리고 OR ≥ 125 두수)와 52주 실행 시간을 적는다.
8. 엔진에 Math.random/Date.now 없음, 매직 넘버는 config/rating.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). data/ 수정 금지. git commit 금지. 다른 에이전트가 data/racecourses.json·data/calendar/*·tests/data/* 를 고치는 중이니 건드리지 않는다. 그 파일 때문에 npm test 가 실패하면 실패 내용만 보고한다.

## 테스트 명령
`npx vitest run tests/engine/handicapper.test.ts tests/engine/seasonSystem.test.ts tests/engine/raceday.test.ts && npm run typecheck && npm run lint`, 마지막에 `npm test`
