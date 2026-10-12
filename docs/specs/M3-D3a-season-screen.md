# M3-D3a 시즌 화면: 주 진행 · 내 말 · 개최와 출주 등록 · 최근 결과

담당: haiku-coder · 근거: docs/m3-plan.md D3

## 목적
'시즌' 탭을 새로 만든다. 플레이어가 주를 진행하고, 자기 말의 상태를 숫자 대신 단서로 보고, 이번 주·다음 주 개최의 레이스에 출주를 등록·취소하고, 최근 결과를 본다. (다시보기·순위·시상 화면은 D3b·D3c)

## 사용할 것 (수정 금지)
- `GameApi`(src/ui/game/useGame.ts): state, advance, advanceUntil, declarePlayerHorse, withdrawPlayerHorse, assignTrainer, lastEvents
- 엔진: `isEligible`(season/eligibility.ts), `trainerReport`(horse/conditioning.ts, TrainerReportKey), `personalityClues`(horse/personality.ts, PersonalityClueKey), `coatColour`(horse/coat.ts), `ageInYear`, `SeasonState.meetings`(이번 주·다음 주), `GameState.raceResults`, `eventKo`·`coatColourKo`·`formatDateKo` 등 기존 text.ts
- 원칙: OR 숫자는 플레이어에게 직접 보여 주지 않는다(types/horse.ts 주석). 대신 '레이팅 수준' 단서를 쓴다.

## 생성·수정할 파일
1. `src/ui/season/seasonView.ts` (신규, 순수 함수 — React 없이 테스트 가능)
   - `playerHorses(state)`: 플레이어 소유 in_training·resting 말과 2세 이상 미조교 말 목록(id, 이름, 나이, 성별 호칭, 털색, 조교사 이름 또는 null, 상태 단서 키, 성격 단서 키[])
   - `meetingsView(state)`: 이번 주·다음 주 개최별(경마장 이름, 날짜, 마장 또는 '미정') 레이스 목록(이름, 등급, 거리, 조건 요약, 총상금, 출주 두수/최대, 상태 open/closed/run, 플레이어 선언 말)
   - `eligiblePlayerHorses(state, meetingId, raceId)`: 그 레이스에 낼 수 있는 플레이어 말(isEligible + 그 주 다른 선언 없음)
   - `ratingHintKo(or: number | null): string` — OR 을 숫자 없이: null '아직 평가 전', <60 '하위 핸디캡 수준', 60~79 '중위 핸디캡 수준', 80~94 '상위 핸디캡 수준', 95~104 '리스티드 수준', 105~114 '그룹 수준', ≥115 'G1 수준'
   - `recentResults(state, n)`: 플레이어 말이 나온 레이스와 G1 결과 최근 n개(날짜·레이스·우승마·플레이어 말 착순)
2. `src/ui/game/text.ts` — `trainerReportKo(key)`(7개), `personalityClueKo(key)`(5개: 예 gate_nervous "게이트에서 예민합니다"), `raceConditionsKo(race)`(예: "3세 · 암말 · WFA", 핸디캡이면 "핸디캡 OR 66~85"). 조교사 코멘트는 조교사가 말하는 말투(예: "한 번 뛰어 봐야 감이 올 것 같습니다").
3. `src/ui/season/SeasonScreen.tsx` (신규) — 위 데이터를 표시. 주 진행 버튼(1주, 4주, '출주한 레이스 결과까지'), 내 말 카드(조교사 미배정이면 조교사 선택 → assignTrainer), 개최 목록(레이스마다 '출주' 선택 상자 + 버튼 / 선언된 말 '취소'), 실패 사유는 한국어(기존 사유 코드별 문구 함수가 없으면 text.ts 에 `declareErrorKo` 추가), 최근 결과 표, 마지막 진행 이벤트(eventKo).
4. `src/ui/App.tsx` — 탭 '시즌' 추가(첫 탭). 기존 탭 동작 유지.
5. `tests/ui/seasonView.test.ts` (신규)

## 수용 기준
1. bootstrapGame 상태(useGame 과 같은 데이터)에서 meetingsView 가 다음 주 개최를 1개 이상 돌려준다. 레이스마다 조건 요약·총상금이 있다.
2. 플레이어 말을 assignTrainer 한 뒤 eligiblePlayerHorses 가 그 말을 조건 맞는 레이스에서 돌려주고, 나이·성별·메이든 조건이 안 맞는 레이스에서는 돌려주지 않는다.
3. ratingHintKo 경계값 테스트, trainerReportKo·personalityClueKo 모든 키에 문구.
4. 화면에 OR 숫자가 나오지 않는다(seasonView 결과 객체에 officialRating 숫자 필드가 없다).
5. 브라우저: 새 게임 → 시즌 탭 → 1주 진행 → 레이스 출주 → 진행 후 결과 표에 그 레이스가 보인다(확인은 Opus, dev 서버 방법만 보고).
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine 수정 금지(필요한 엔진 함수가 없으면 [질문]). 기존 BreedingScreen·RaceDemo 동작 변경 금지. git commit 금지.
