# M3-C7e1 아랍 계열(AE) 마주 추가

담당: haiku-coder · 선행: M3-C7c 승인(AE 인명 풀·목장 지명), M3-D3a2 승인 · 근거: 사용자 요청(2026-10-12) — 아랍 계열 마주는 아랍어 마명

## 목적
아랍에미리트(AE) 국적 AI 마주 30명을 만들고, 영국·아일랜드·프랑스 현역마 일부를 이들이 소유하게 한다(유럽 경마의 걸프 마주 비중 반영). 마명 언어 연결은 C7e2.

## 사용할 것 (수정 금지)
`Owner`, `OwnerTier`, `bootstrapPeople`·`generateOwner`(people/generate.ts), `PEOPLE_PER_COUNTRY`·`PEOPLE_COUNTRY_ORDER`·`OWNER_TIER_WEIGHTS`(config/people.ts), `buildMarket`·`pickOwner`·`spawnRacingHorse`(world/population.ts), 데이터 data/people/name_pools.json·places.json 의 AE

## 생성·수정할 파일
1. `src/engine/config/people.ts`
   - `PeopleCountry` 에 'AE'. `PEOPLE_PER_COUNTRY.AE = { jockeys: 0, trainers: 0, owners: 30 }`. `PEOPLE_COUNTRY_ORDER` 의 **맨 끝**에 AE(앞 나라들의 생성 결과가 바뀌지 않게).
   - `OWNER_TIER_WEIGHTS_BY_COUNTRY: Partial<Record<PeopleCountry, Record<OwnerTier, number>>>` — AE: { major: 0.3, mid: 0.5, small: 0.2 }. 없으면 기존 OWNER_TIER_WEIGHTS.
   - `FOREIGN_OWNER_SHARE: Partial<Record<PopulationCountry, { country: PeopleCountry; share: number }>>` — GB: AE 0.12, IE: AE 0.08, FR: AE 0.10. (말이 뛰는 나라는 그대로, 마주만 AE)
2. `src/engine/people/generate.ts` — 인원 0 인 역할은 건너뛴다. 마주 tier 는 나라별 가중치가 있으면 그것을 쓴다(AE 외 나라는 기존과 같은 결과).
3. `src/engine/world/population.ts` — `buildMarket` 에 AE 마주 풀 추가(현역마가 뛰는 나라 목록 PopulationCountry 에는 AE 를 넣지 않는다). `pickOwner` 는 spec.ownerId 가 없을 때 FOREIGN_OWNER_SHARE 확률로 외국(AE) 마주 풀에서 고른다. 조교사는 말이 뛰는 나라 조교사 그대로.
4. 테스트: `tests/engine/arabOwners.test.ts` (신규). 기존 people·population 테스트가 개수 기대값 때문에 깨지면 그 값만 고치고 보고.

## 수용 기준
1. bootstrapPeople 후 AE 마주 30명, AE 기수·조교사 0명. AE 마주 이름은 AE 인명 풀에서 나오고 차단 목록에 걸리지 않는다. 앞 6개 나라 인물은 변경 전과 같다(같은 시드 비교 테스트).
2. AE 마주 tier 분포가 가중치에 맞는다(30명이라 느슨하게: major ≥ 5).
3. bootstrapRacingPopulation 후 GB 현역마 중 AE 소유 비율 0.08~0.16, IE 0.04~0.12, FR 0.06~0.14. DE·IT 는 0.
4. AE 소유 말의 조교사는 그 말이 뛰는 나라 조교사다.
5. 같은 시드 재현, 저장 왕복 통과. 엔진에 Math.random·Date.now 없음, 매직 넘버는 config. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 이름 생성 연결 금지(C7e2). data/ 수정 금지. git commit 금지.
