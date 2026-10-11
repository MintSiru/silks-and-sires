# M3-B2 기수·조교사·마주 생성기 + 세계 인물 초기화

담당: haiku-coder · 선행: M3-B1 승인, people 타입(커밋 51f803f)

## 목적
국가별 가상 인물(기수·조교사·마주)을 시드로 생성하고, 새 게임 시작 시 유럽·미국 인물 풀을 채운다.

## 사용할 타입 (src/engine/types/people.ts — 수정 금지)
Jockey(abilities, preferredStyle, retired 포함), Trainer(birthYear, staminaBias, juvenileFocus 포함), Owner(tier, persona, namePrefix 포함), JockeyAbilities, OwnerPersona, OwnerTier, Silks, SilksPattern(common.ts).

## 생성·수정할 파일
1. `src/engine/config/people.ts` — 모든 수치 상수(아래 값은 초기값):
   - `PEOPLE_PER_COUNTRY`: GB {jockeys 40, trainers 45, owners 70}, IE {30, 35, 50}, FR {35, 40, 60}, DE {12, 14, 22}, IT {12, 14, 22}, US {30, 30, 50}
   - 기수 능력 평균 55 SD 12(0~100 clamp), skill = 네 능력 평균. 견습(나이 < 22) 비율 20%, 감량 3/5/7 lb.
   - 기수 나이 18~45, 최저 기승 중량 112~130 lb. 국적 섞기: 자국 80%, 나머지 20%는 다른 국가 풀(BR/ZA/JP/AU 포함).
   - 조교사 나이 30~75, skill 평균 55 SD 12, capacity 20~180(skill 비례), facilityGrade 1~5, staminaBias N(0,0.4) clamp ±1, juvenileFocus U(0,1), weeklyFee = facilityGrade × 상수.
   - 마주 tier 비율 major 8% / mid 30% / small 62%, funds 범위(tier 별), persona 각 축 U(0,1), namePrefix 는 major 의 40% 에만(가상 접두어 단어 2~8자, places.json 의 yard_words 등에서 조합).
2. `src/engine/people/names.ts` — `generatePersonName(rng, pools, country, sex, used: Set<string>, blocked: Set<string>): string`: given + surname, 중복·차단 조합이면 다시 뽑기(최대 50회, 실패 시 오류). 차단 비교는 소문자·공백 정규화.
3. `src/engine/people/generate.ts` — `generateJockey(rng, ctx, id, country)`, `generateTrainer(rng, ctx, id, country)`, `generateOwner(rng, ctx, id, country)`. 야드 이름 = 지역명 + yard_words, 목장 이름(major/mid 일부) = 지역명/조어 + stud_suffixes(국가별). 승부복: 색 2개(서로 대비), 패턴 SilksPattern 중 무작위, 마주끼리 (primary, secondary, pattern) 중복 금지.
4. `src/engine/state/people.ts` — `bootstrapPeople(state, data, rng): GameState`: PEOPLE_PER_COUNTRY 만큼 생성해 state.jockeys/trainers/owners 에 넣는다. id 형식 `jk-000001`, `tr-000001`, `ow-000001`. 이미 AI 인물이 있으면 오류(이중 초기화 방지).
5. `src/engine/data/staticData.ts` — `getPeopleData()`: data/people/name_pools.json, blocked_names.json, places.json 를 읽어 반환(형식 검증 포함).
6. 테스트 `tests/engine/people.test.ts`.

(파일 6개 — 1개 초과 허용, 각 파일 짧게)

## 수용 기준
1. 같은 시드 → bootstrapPeople 결과가 깊은 비교로 같다(재현성).
2. 생성된 모든 인물 이름은 blocked_names 에 없고, 같은 역할 안에서 중복이 없다.
3. 국가별 인원이 PEOPLE_PER_COUNTRY 와 정확히 같다.
4. 마주 승부복 (primary, secondary, pattern) 조합이 전부 서로 다르다. primary ≠ secondary.
5. 기수 skill 은 abilities 네 값의 평균(±0.001). 능력 값은 0~100.
6. 엔진에 Math.random/Date.now 없음. typecheck·lint·npm test 통과.

## 금지
src/engine/types 수정 금지. data/ 수정 금지. 월드 초기화(state/world.ts) 연결은 하지 않는다(A6 에서 newGame 흐름에 붙인다). git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
