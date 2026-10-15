# M4-BET2 베팅 엔진과 스폰서 레이스 적용

담당: Codex · 선행: 3139863(타입 betting.ts·GameState.betting·장부 'betting'·이벤트 bet_settled), M4-BET1(data/betting/bookmakers.json·data/calendar/sponsorships.json)
근거: 사용자 결정(2026-10-15) — 단승·연승만, 유럽식 분수 오즈, 누구 말에든, 레이스당 상한, 초반 자금 수단. 가상 회사 이름을 스폰서 레이스명에.

## 사용할 것 (수정 금지)
`Bet`·`SettledBet`·`BettingState`·`BookmakerDef`·`SponsorshipDef`·`BookmakersDataFile`·`SponsorshipsDataFile`(types/betting.ts), `FractionalOdds`, `RaceResult`(runners: position·odds·horseId), `Meeting`·`ScheduledRace`(seasonState.meetings), `recordMoney`(장부 'betting'), `canSpendDiscretionary`, `probabilityToOdds`·`formatOdds`(race/odds.ts), `MARKET_OVERROUND`, `ratingFromAbility`·`meanAbility`, `PlayerResult`

## 규칙
### 스폰서 레이스(데이터 적용)
- `applySponsorships(templates, sponsorships, bookmakers, saleCompanies): RaceTemplate[]`(src/engine/betting/sponsorship.ts): 해당 템플릿의 name = nameFormat 의 `{sponsor}`(베팅 회사 shortName ?? name, 세일 회사 name)·`{race}`(원래 이름) 치환, prizeMoney 각 칸 = round(원래 × prizeMultiplier / 50) × 50. 다른 필드·순서 불변. 순수 함수.
- `src/engine/data/staticData.ts`: `getBookmakers()`, `getSponsorships()` 추가, `getRaceTemplates()` 가 applySponsorships 를 적용한 목록을 돌려준다(한 번 계산해 캐시).
- 템플릿 이름·상금이 바뀌어 깨지는 고정값 테스트는 **원인이 스폰서 적용뿐인지 확인한 뒤** 기대값만 고치고 목록을 보고.
### 베팅(src/engine/betting/betting.ts)
- 연승 조건 `eachWayTerms(runners: number, isHandicap: boolean): { places: number; fraction: number } | null` — 4두 이하 null(연승 불가), 5~7두 {2, 1/4}, 8두 이상 비핸디캡 {3, 1/5}, 핸디캡 12~15두 {3, 1/4}, 핸디캡 16두 이상 {4, 1/4}, 핸디캡 8~11두 {3, 1/5}. 표는 config/betting.ts.
- `placeBet(state, { bookmakerId, meetingId, raceId, horseId, kind, stake }, data): PlayerResult<BetError>`
  `BetError = 'bookmaker_not_found' | 'race_not_found' | 'race_closed' | 'horse_not_declared' | 'invalid_stake' | 'each_way_unavailable' | 'over_limit' | 'insufficient_funds'`
  - 대상: state.seasonState.meetings 에 있고 아직 결과가 없는 레이스(status 가 실행 전), 선언된 말(declarations).
  - stake 정수 ≥ `BET_MIN_STAKE`(10). 총 지출 = win 이면 stake, each_way 면 stake × 2.
  - 그 레이스에 플레이어가 건 총 지출(기존 + 이번) ≤ `BET_MAX_OUTLAY_PER_RACE`(20,000), 아니면 over_limit.
  - each_way 는 지금 선언 두수로 eachWayTerms 가 null 이면 each_way_unavailable.
  - `canSpendDiscretionary(state, 총 지출)`. 성공: `recordMoney(…, 'betting', −총 지출, horseId)`, open 에 추가(id `bet_${year}_${nextBetNo}`).
- `cancelBet(state, betId): PlayerResult<'bet_not_found' | 'race_closed'>` — 실행 전 레이스만, 전액 환불(장부 'betting' +), open 에서 제거.
- 정산 `settleBetsForRace(draft, meetingId, raceId, result: RaceResult | null, isHandicap)`(경주 확정 뒤 또는 취소 시 호출):
  - 그 레이스의 open 베팅마다: 말이 result.runners 에 없거나 result 가 null(취소) → 전액 환불(startingPrice null).
  - win 부분: 1착(동착 포함)이면 stake × (1 + num/den), 아니면 0. 동착은 배당을 동착 수로 나눈다(stake/동착수 × (1+odds) + 나머지는 손실 — 영국식 dead heat rule).
  - place 부분(each_way): 실제 출주 두수로 eachWayTerms. null 이면 place 부분 환불. 착순 ≤ places 면 stake × (1 + num/den × fraction).
  - returned = floor(합). returned > 0 이면 `recordMoney(…, 'betting', +returned)`. history 앞에 추가, 최대 `BET_HISTORY_LIMIT`(50)건. 이벤트 `bet_settled`(outlay·returned).
- 호출 지점: src/engine/season/raceday.ts — applyRaceResultInPlace 직후 `settleBetsForRace`, 레이스가 abandoned 처리될 때(그 개최 처리 중) result null 로. isHandicap = race.kind === 'handicap'.
- `forecastOdds(state, meetingId, raceId): { horseId; odds: FractionalOdds }[]` — 화면용 '예상 오즈'. 선언 말의 평가값(officialRating ?? ratingFromAbility(meanAbility(ability)))을 확률로: softmax(rating / `BET_FORECAST_TEMPERATURE`(4)) → probabilityToOdds(p, MARKET_OVERROUND). 결정적(난수 없음). 실제 정산은 경주 확정 오즈(SP)라는 점을 함수 주석에 적는다.
- `bettingView(state)`: open·history 를 화면용으로(말 이름·레이스 이름·종류·지출·SP 문자열·회수액).

## 생성·수정할 파일
- src/engine/config/betting.ts(신규), src/engine/betting/sponsorship.ts(신규), src/engine/betting/betting.ts(신규), src/engine/data/staticData.ts, src/engine/season/raceday.ts
- tests/engine/betting.test.ts(신규) — 연승 조건 표 경계, placeBet 실패 8종, 상한, 정산(단승 적중·연승 입상만·완전 패·동착·출주 취소 환불·레이스 취소 환불·4두 연승 환불), 장부 합계 = −지출 + 회수, 시드 20261011 에서 실제 진행으로 1건 정산.
- tests/engine/sponsorship.test.ts(신규) — 이름 치환·상금 배수·다른 필드 불변·스폰서 없는 템플릿 불변.

## 수용 기준
1. 위 테스트 통과. 기존 테스트는 스폰서 이름·상금 때문에 바뀐 기대값만 고친다(보고).
2. 베팅이 없으면 26주 레이스 결과(우승마 목록)가 이 티켓 전과 같다(상금 배수는 결과 순위에 영향 없음 — 같은지 확인, 다르면 원인 보고).
3. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수 config.

## 금지
src/engine/types 수정 금지. 화면 구현 금지(BET3). 데이터 파일 수정 금지(문제는 보고). git commit 금지.

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
npx vitest run tests/engine/betting.test.ts tests/engine/sponsorship.test.ts && npm test && npm run typecheck && npm run lint
