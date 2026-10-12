# M3-D3c 순위·시상 화면 (시리즈 · 리딩 · 3개 단체 시상 · 종마 산구 성적)

담당: haiku-coder · 선행: M3-E1a·E1b·C4 승인 · 근거: docs/m3-plan.md E2·E3

## 목적
'순위·시상' 탭을 만든다: 올해 시리즈 진행, 리딩 순위(유럽 합산·나라별), 지난 시즌 3개 단체 시상, 종마 산구(자마) 성적.

## 사용할 것 (수정 금지)
- `SeasonState.series`(SeriesProgress), `SeriesDefinition`(getSeriesDefinitions), `leading`·`leadingByCountry`(LeadingTables), `GameState.awardsHistory`(SeasonAwards: laurel, ledger, globalRankings, bestRace, leading, leadingByCountry, seriesChampions), `GameState.sireStats`(OffspringStats), `observedProfile`(breeding/offspring.ts), 인물·말 이름 조회(state.horses/jockeys/trainers/owners, 종마 이름표)
- 화면 원칙: Ledger·Global 레이팅 숫자는 '평가지·랭킹 발표 값'이므로 보여 준다(공식 OR 과 다른 척도). 공식 OR 숫자는 보여 주지 않는다.

## 생성·수정할 파일
1. `src/ui/standings/standingsView.ts` (신규, 순수 함수)
   - `seriesView(state, defs)`: 시리즈별 이름(text.ts 의 seriesNameKo — 없으면 추가, 가상 이름), 종류, 레그별 우승마, 포인트 상위 5, 달성마
   - `leadingView(state, category, country | 'EU', limit = 20)`: 순위·이름·출주·승·입상·그룹 승·상금(€)
   - `awardsView(state, year?)`: 가장 최근(또는 지정 연도) SeasonAwards 를 표시용으로(Laurel 부문명 한국어, Ledger·Global 상위 10, 최우수 레이스, 시리즈 챔피언)
   - `sireTable(state, limit = 30)`: 산구 성적 상위(승 수 순): 종마 이름, 출주 자마, 승 자마, 승, 그룹 승, 상금, 실제 성적 기준 거리 적성(observedProfile, 한국어 — 미정이면 '자료 부족')
2. `src/ui/game/text.ts` — `laurelCategoryKo`(8개), `leadingCategoryKo`(6개), `seriesNameKo`(15개, 가상 시리즈 이름 한국어: 예 gb_triple_crown "영국 3관"), `distanceProfileKo` 가 없으면 추가
3. `src/ui/standings/StandingsScreen.tsx` (신규) — 위 네 구역(하위 탭 또는 섹션), 리딩은 카테고리·나라 선택
4. `src/ui/App.tsx` — 탭 '순위·시상' 추가
5. `tests/ui/standingsView.test.ts` (신규)

## 수용 기준
1. 52주 진행 상태(테스트에서 bootstrapGame + advance, 시간 걸리면 제한 시간 명시)에서 awardsView 가 Laurel 8부문(없으면 '해당 없음')·Ledger 10·Global 10·최우수 레이스를 낸다.
2. leadingView 가 카테고리별 정렬(승 → 상금 → 출주)과 나라 필터를 지킨다.
3. seriesView 가 15개 시리즈를 모두 내고, crown 은 레그별 우승마, points 는 상위 5를 낸다.
4. sireTable 의 합계(승)가 sireStats 와 같고, 거리 적성 문구가 observedProfile 과 일치.
5. 공식 OR 숫자가 뷰 결과에 없다.
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 브라우저 확인은 Opus.

## 금지
src/engine 수정 금지. SeasonScreen·race-viewer 수정 금지. git commit 금지.
