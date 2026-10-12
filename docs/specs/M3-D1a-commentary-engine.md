# M3-D1a 레이스 실황 중계: 사건 추출 + 한국어 문장 (엔진)

담당: haiku-coder · 근거: docs/m3-plan.md D1

## 목적
레이스 리플레이(프레임)와 결과에서 사건을 뽑아, 같은 사건도 여러 표현으로 말하는 한국어 실황 자막과 레이스 후 말별 한 줄 평을 만든다. 화면 연결은 D1b(D2 와 함께).

## 사용할 것 (수정 금지)
- `RaceReplay`·`ReplayFrame`(progress[]·lane[]·speed[] — runner index 순), `RaceResult`·`RunnerResult`(position, margin, beatenLengths), `RacePath`(homeStraightLength 등), `Race`(distance), `createRng`(src/engine/rng), `SECTIONAL_STEP_M`(config/results.ts)

## 생성할 파일
1. `src/engine/config/commentary.ts` — 판정 상수 전부(아래 값)
2. `src/engine/commentary/events.ts` — `extractCommentaryEvents(args: { replay; result; path; distance }): CommentaryEvent[]`
   - `CommentaryEvent = { t: number; kind: CommentaryKind; horses: number[] /* runner index */; value?: number }`
   - kind 와 판정:
     - `start`: t = 0.
     - `slow_start`: 2.0초 시점 최하위이고 바로 앞 말과 3m 이상 뒤진 말(있으면).
     - `early_leader`: 진행 400m(또는 거리의 25% 중 작은 값) 시점 선두. 2위와 0.5m 이내면 `lead_battle`(두 말).
     - `pace`: 거리 50% 시점. 선두의 그 시점 시간 / (승리 시간 × 0.5) 이 `PACE_FAST 0.985` 미만이면 value = +1(빠름), `PACE_SLOW 1.015` 초과면 −1(느림), 그 사이는 사건 없음.
     - `turn_in`: 선두가 결승 직선 입구(distance − homeStraightLength)에 닿는 시점, 상위 3두.
     - `move`: 결승 직선에서 200m 구간 동안 순위를 3계단 이상 올린 말(가장 크게 올린 1두, 구간마다 최대 1회).
     - `lead_change`: 결승 직선에서 선두가 바뀐 시점(새 선두, 이전 선두).
     - `final_furlong`: 선두가 결승 201m 전에 닿는 시점, 선두와 2위 간격(m)을 value 로.
     - `photo`: 1·2착 착차가 'nose'·'short_head'·'head' 또는 동착이면 결승 시점에.
     - `finish`: 결승 시점, 승자. value = 승자와 2착 마신.
   - 사건은 t 오름차순, 같은 t 는 위 나열 순.
3. `src/engine/commentary/render.ts`
   - `renderCommentary(events, names: readonly string[], seed: number, lines: CommentaryLines): { t: number; text: string }[]` — kind 별 문장 후보 중 하나를 `createRng('commentary:' + seed)` 로 고른다. 같은 kind 가 연달아 나오면 직전과 다른 후보를 고른다.
   - `horseVerdicts(args: { replay; result; names; seed; lines }): Record<number, string>` — 말별 한 줄 평. 판정 키: `made_all`(400m 선두 → 1착), `came_from_back`(거리 50% 지점 하위 1/3 → 3착 이내), `faded`(직선 입구 3위 이내 → 6착 이하), `stayed_on`(직선 입구보다 3계단 이상 상승), `never_dangerous`(전 구간 중위 이하, 입상 못 함), `ran_to_form`(그 밖). 1착은 `winner_*` 계열 키를 우선한다(`winner_easy` 2마신 이상, `winner_narrow` 그 미만).
   - `CommentaryLines = Record<string, string[]>` — 문장 틀. 자리 표시: `{horse}`, `{horse2}`, `{n}`(숫자).
4. `data/text/commentary.ko.json` — kind 10개 + 한 줄 평 키 8개, 키마다 문장 후보 **5개 이상**. 말 이름이 영어라 조사(이/가, 을/를)가 맞지 않으므로 **이름 뒤에 조사를 붙이지 않는 문장**으로 쓴다(예: "선두로 나서는 {horse}", "{horse}, 바깥에서 따라붙습니다"). 실제 중계진 이름·방송사·레이스명 금지.
5. `src/engine/data/commentaryData.ts` (신규) — `getCommentaryLines()` 로더(staticData.ts 는 다른 에이전트가 수정 중이라 별도 파일)
6. `tests/engine/commentary.test.ts`

## 수용 기준
1. 같은 입력·시드 → 같은 사건·같은 문장.
2. 골든 설정 레이스(tests/engine/simGolden 의 설정 하나)로 실제 runRace(recordReplay true) → start·early_leader(또는 lead_battle)·turn_in·final_furlong·finish 가 각각 1회, 사건 t 오름차순, finish 의 승자 = result 1착.
3. 합성 리플레이로 각 kind 를 하나씩 발생시키는 테스트(slow_start, lead_battle, pace 빠름/느림, move, lead_change, photo).
4. horseVerdicts: 합성 리플레이로 made_all·came_from_back·faded·stayed_on 각각, 모든 출주마에 문장 1개.
5. commentary.ko.json: 모든 키에 후보 5개 이상, 자리 표시는 정의된 것만, `{horse}` 바로 뒤에 한글 조사(이·가·을·를·은·는·의)가 오지 않는다(정규식 검사).
6. 레이스 1개 처리 시간 ≤ 5ms(20두 3,000m 리플레이 기준, 측정값 보고).
7. 엔진에 Math.random·Date.now·DOM 없음, 매직 넘버는 config/commentary.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(사건 타입은 commentary 모듈 안에 둔다). 레이스 시뮬레이션 수정 금지. UI 수정 금지(D1b). git commit 금지.
