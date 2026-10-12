# M4-C2a 세일 카탈로그 생성

담당: haiku-coder · 선행: M4-C3(sales/valuation.ts, config/sales.ts) · 설계: docs/m4-sales-design.md 1·2장

## 목적
세일 하나의 그 해 카탈로그(`SaleCatalogue`)를 만드는 함수. 로트 말 생성, 판매자, 북 배정, 가치 평가, 유보가까지. 시스템 연결·위탁 API·AI 입찰은 다음 티켓(C2b·C4).

## 사용할 것 (수정 금지)
- 타입: `SaleEventDef`·`SaleBookDef`·`SaleCompanyDef`·`SalesDataFile`·`SaleCatalogue`·`SaleLot`·`SaleVendor`·`SaleConsignment`, `CommercialBreeder`·`BreederScale`, `Horse`, `Stallion`, `RealStallionRecord`
- `valueLot(state, horse, kind, year, rng)`(sales/valuation.ts), `filterSiresForCover`·`coverYearForFoal`(world/sireWindow.ts), `generateHorse`(horse/generate.ts), 이름 짓기(population.ts 의 spawnRacingHorse 가 쓰는 makeNameRegistry·namingContextFor·nameForHorse 방식 그대로), `racingHorseIds`(world/population.ts), `ratingFromAbility`·`meanAbility`, `POPULATION_TIER_LEVEL`·`POPULATION_ABILITY_SPREAD`, `BREEDER_PICK_WEIGHT`(config/breeders.ts)

## 생성·수정할 파일
1. `src/engine/data/staticData.ts`: `getSalesData(): SalesDataFile`(data/sales/sales.json import, 기존 getter 와 같은 방식).
2. `src/engine/config/breeders.ts`·`src/engine/people/breeders.ts`: **미국 상업 생산자 12곳 추가**(미국 세일 판매자). 유럽 5개국 생성이 끝난 **뒤에** 이어서 만든다(유럽 생산자 ID·이름·순서 불변 — 기존 breeders 테스트 해시가 그대로 통과해야 함). 나라 순서 상수는 `BREEDER_COUNTRY_ORDER = [...POPULATION_COUNTRY_ORDER, 'US']` 로 config 에 둔다. pickBreederFor 동작은 그대로(유럽산 말은 같은 나라 생산자).
3. `src/engine/config/sales.ts`(C3 가 만든 파일 끝에 절을 추가): `SALE_LOT_SCALE`(0.1), `SALE_RESERVE_SHARE`(0.6), `SALE_HIT_OR_MIN`(50)·`SALE_HIT_OR_MAX`(95), `SALE_HIT_MIN_OWNER_HORSES`(3), `SALE_MARE_AGE_MIN`(4)·`SALE_MARE_AGE_MAX`(12), `SALE_VALUE_ROUND` 은 C3 것 사용.
4. `src/engine/sales/catalogue.ts`(신규) — 아래 함수.
5. `tests/engine/saleCatalogue.test.ts`(신규).

## 함수
```ts
export interface CatalogueStaticData { sales: SalesDataFile; stallionRecords: readonly RealStallionRecord[]; naming: NamingData; stallionNames: StallionNameTable }
/** draft 를 직접 바꾼다(로트 말을 state.horses 에 넣고 생산자 horseIds 갱신). 만든 카탈로그를 돌려준다(state.sales 에 넣는 일은 C2b) */
export function buildCatalogue(draft: GameState, event: SaleEventDef, year: number, data: CatalogueStaticData, rng: Rng): SaleCatalogue
/** 플레이어 말 → 들어갈 북 번호(부 시장 등급 ≤ maxSireTier 인 첫 북, 없으면 마지막 북) */
export function bookForSire(event: SaleEventDef, sireTier: number): number
```
(NamingData·StallionNameTable 은 현재 population/bootstrap 이 쓰는 타입 이름을 그대로 쓴다.)

### 규칙
- 회사 나라 = 세일 나라. 북마다 로트 수 = max(1, round(lotsTarget × SALE_LOT_SCALE)).
- **부 선택(생성 로트)**: 그 나라에 계류(`Stallion.standsIn`)하는 active 실명 종마 중, 교배 연도(`coverYearForFoal(출생 연도)`)에 교배 가능(`filterSiresForCover`)하고 `Stallion.firstSeasonYear ≤ 교배 연도` 이며, 시장 등급이 (앞 북 maxSireTier, 이 북 maxSireTier] 안(앞 북과 같으면 그 등급만, 북 1 은 [1, maxSireTier]). 가중치 = popularity + 1. 후보가 없으면 순서대로 완화: ① 그 나라 등급 ≤ 이 북 max → ② 모든 나라 같은 등급 범위 → ③ 모든 active.
  시장 등급 = 기록의 marketTier.
- **종류별 로트**(설계 2장 표):
  - yearling: 1세(출생 연도 = year − 1), status 'yearling'. foal: 0세(year), status 'weanling'. breeze_up: 2세, status 'yearling'(아직 미출주). 수준 = POPULATION_TIER_LEVEL[부 등급], spread = POPULATION_ABILITY_SPREAD, damId·familyId null, ownerId null, trainerId null, countryOfBirth = 세일 나라, breederId = 판매 생산자 id.
    판매자 = 그 나라 상업 생산자 중 BREEDER_PICK_WEIGHT 가중 추첨. 말 id 를 생산자 horseIds 에 넣는다.
  - horses_in_training: 새로 만들지 않는다. 그 나라(countryOfBirth) AI 현역마 중 3세 이상, OR SALE_HIT_OR_MIN~MAX, 그 마주가 현역마 SALE_HIT_MIN_OWNER_HORSES 두 이상인 말에서 로트 수만큼 무작위(마주당 최대 2두). 판매자 = 그 마주(`{kind:'owner'}`), 북 1개. 후보가 모자라면 있는 만큼만.
  - breeding_stock: 암말(sex female) SALE_MARE_AGE_MIN~MAX 세, status 'broodmare', 부 선택은 위와 같되 교배 연도는 그 암말 출생 연도 기준, officialRating = ratingFromAbility(meanAbility(ability)) 를 정수로. ownerId null, 판매자 생산자. (임신 로트는 이번 티켓에서 만들지 않는다)
- **플레이어 위탁**: `draft.sales.consignments` 중 이 세일·이 해 것을 로트로 넣는다(판매자 `{kind:'owner', id: playerOwnerId}`, 유보가 = 위탁 값, 북 = bookForSire). 위탁 말이 없거나 종류에 맞지 않으면 건너뛴다(검사는 C2b 의 위탁 API 가 주로 한다).
- **순서·번호**: 북 순서대로, 북 안에서는 rng.shuffle. lotNo 1부터 이어서.
- **가치·유보가**: 로트마다 `valueLot(draft, horse, kind, year, createRng(`${draft.initialSeed}:value:${event.id}:${year}:${lotNo}`))`. 생산자 로트 유보가 = round(valuation × SALE_RESERVE_SHARE / 100) × 100, 마주(AI) 로트 유보가 = 같은 식, 플레이어 위탁 = 위탁 값.
- aiBids = [], result = null, status 'catalogued'. horseName·sireId 사본.
- rng 는 인자로 받은 것만 쓴다(가치 평가 rng 제외). 같은 draft·같은 rng → 같은 카탈로그.

## 수용 기준 (테스트로, 시드 20261011 bootstrapGame 상태 사용)
1. sales.json 의 15개 세일 각각 buildCatalogue 성공, 로트 수 = Σ round(lotsTarget × 0.1)(horses_in_training 은 후보 부족 시 ≤).
2. 생성 로트: 나이·status·성별(번식마 암말)·ownerId null·breederId 가 그 나라 생산자·부가 교배 가능 기간 안. 1세마 북 1 로트의 부는 모두 등급 1 이하(완화가 일어났으면 보고).
3. 미국 세일 로트 판매자는 미국 생산자, 유럽 세일은 그 나라 생산자. 미국 생산자 12곳 추가 후 기존 유럽 생산자 50곳 id·이름 불변(기존 breeders 테스트 통과).
4. 플레이어 위탁 1두(1세 말을 테스트에서 만들어 consignments 에 넣음) → 로트에 들어가고 vendor owner·reserve 가 위탁 값.
5. 같은 시드 2회 → 카탈로그 JSON 동일. 로트마다 valuation ≥ 1,000.
6. 보고: 세일별 로트 수, 1세마 세일 북별 valuation 중앙값, 카탈로그 1개 만드는 시간(최대값 ms).
7. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수 config.

## 금지
src/engine/types 수정 금지. sales 시스템(주간)·state.sales 갱신·위탁 API·AI 입찰·경매 구현 금지. valuation.ts 수정 금지(문제 있으면 보고). git commit 금지.

## 테스트 명령
npx vitest run tests/engine/saleCatalogue.test.ts tests/engine/breeders.test.ts && npm test && npm run typecheck && npm run lint
