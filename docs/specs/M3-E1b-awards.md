# M3-E1b 3개 단체 시상 + 리딩 확정 (연도 전환)

담당: haiku-coder · 선행: 5490ee0(SeasonAwards·awardsHistory 타입), 596232a(GameEvent 'awards_announced') · 병행: M3-E1a(기록 작성 — 이 티켓은 기록을 읽기만 한다)

## 목적
시즌이 끝나 연도가 바뀔 때, 올해 기록(performances·raceRatings·leading·leadingByCountry·series)으로 세 단체의 시상과 리딩 순위를 확정해 `awardsHistory` 에 남긴다. 세 단체는 선정 방식이 달라 수상마가 갈릴 수 있어야 한다.

## 척도 (사용자 결정, docs/m3-plan.md "레이팅 척도")
- 공식 OR 상한 140 / The Racing Ledger 150(그해 최강 130~138, 역대급 140~147, 최상위는 OR 보다 +3~10) / Global Turf Rankings 는 OR 척도의 시즌 최고 퍼포먼스.

## 사용할 것 (수정 금지)
`SeasonAwards`, `LaurelCategory`, `RatedHorse`, `LeadingTop`, `PerformanceEntry`, `RaceRatingEntry`, `SeriesProgress`(types/season.ts), `GameState.awardsHistory`, `GameEvent` 'awards_announced', `ageInYear`, `Rng`

## 생성·수정할 파일
1. `src/engine/config/awards.ts` (신규) — 상수 전부
   - Ledger: base = 올해 PR 상위 2개 평균(1개뿐이면 그 값 − `LEDGER_SINGLE_RUN_PENALTY 2`). ledger = round(base + clamp((base − `LEDGER_PIVOT 100`) × `LEDGER_TOP_BONUS_RATE 0.35`, 0, `LEDGER_TOP_BONUS_MAX 10`)), 상한 `LEDGER_MAX 150`. 목록 상위 `LEDGER_LIST_SIZE 50`.
   - Global: rating = 올해 PR 최고값(그룹·리스티드 레이스만). 상위 `GLOBAL_LIST_SIZE 50`. bestRace = raceRatings 중 G1 최고 rating.
   - Laurel: 점수 = 경주 점수 + `LAUREL_JURY_WEIGHT 0.6` × Ledger 레이팅 + N(0, `LAUREL_JURY_SD 3`) (심사위원 표 잡음, rng 는 `rng.fork('laurel:' + year)`). 경주 점수: G1 1착 30·2착 12·3착 8, G2 1착 15·2착 6, G3 1착 10, L 1착 5.
   - 부문 자격: horse_of_the_year = 전체(그룹 1승 이상), older_horse = 4세 이상, three_year_old_colt/filly = 3세 수/암, two_year_old_colt/filly = 2세 수/암, stayer = 올해 그룹·리스티드 출주 중 2,800m 이상이 절반 이상이고 그 거리에서 그룹 입상 1회 이상, sprinter = 같은 조건으로 1,300m 이하. 부문 점수는 그 부문 자격 레이스(stayer·sprinter 는 해당 거리 레이스)만으로 계산. 자격 말이 없으면 null.
   - 리딩 상위 `LEADING_TOP_N 20`(카테고리별, wins → earnings → runners 내림차순, 동률은 id 순).
2. `src/engine/season/awards.ts` (신규, 순수 함수)
   - `ledgerRating(prs: number[]): number | null`, `computeLedger(state, year)`, `computeGlobalRankings(state, year)`, `computeLaurel(state, year, ledger, rng)`, `leadingTop(tables)`, `computeSeasonAwards(state, year, rng): SeasonAwards` (seriesChampions = 그 해 SeriesProgress 중 champion 있는 것)
3. `src/engine/season/system.ts` — `startNewSeason` 에서 **기존 동작 전에**(points 시리즈 champion 확정 뒤, leading 초기화 전에) `computeSeasonAwards(draft, 지난해, rng.fork('awards'))` 를 `awardsHistory` 끝에 추가하고 'awards_announced' 이벤트. 그다음 leading·leadingByCountry·performances·raceRatings 를 비운다. 지난해에 레이스가 하나도 없었으면(첫 해 시작 등) 시상을 만들지 않는다. rng 는 기존 시즌 rng 를 더 소비하지 않도록 startNewSeason 에 별도 fork 를 넘기되, 기존 재현성 테스트가 깨지면 위치를 조정하고 보고한다.
4. `tests/engine/awards.test.ts` (신규) — 합성 SeasonState 로 단위 검사 + 52주 통합 1건(it 제한 시간 명시)

## 수용 기준
1. ledgerRating: [130, 128] → base 129 → 129 + 10 = 139. [110, 104] → 107 + 2.45 → 109. [95] → 93(보너스 0). 150 을 넘지 않는다.
2. 합성 시즌에서 세 단체 결과가 갈리는 사례를 테스트로 고정: (a) G1 을 많이 이긴 말이 Laurel 올해의 말, (b) 한 번 큰 퍼포먼스를 낸 말이 Global 1위, (c) 꾸준히 높은 말이 Ledger 1위.
3. 부문 자격: 2세 암말이 two_year_old_filly 에만, 4세 스테이어가 older_horse·stayer 후보에 들어간다. 자격 없는 부문은 null.
4. bestRace = G1 중 rating 최고.
5. 리딩 상위는 카테고리별 최대 20개, 정렬 규칙대로. 나라별도 같다.
6. 52주 통합(bootstrapGame + 테스트 템플릿, 2026년 1주 → 2027년 1주): awardsHistory 1건(year 2026), 'awards_announced' 이벤트 1건, 연도 전환 뒤 performances·raceRatings·leadingByCountry 가 비어 있다. 같은 시드 2회 결과 같다. 보고에 Ledger 1위 레이팅, Global 1위 레이팅, Laurel 올해의 말이 Ledger 1위와 같은지 적는다.
7. 엔진에 Math.random/Date.now 없음, 매직 넘버는 config/awards.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. season/apply.ts·handicapper.ts·raceday.ts 수정 금지(E1a 담당). data/ 수정 금지. git commit 금지.
