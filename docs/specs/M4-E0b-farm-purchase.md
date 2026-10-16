# M4-E0b 목장 매물·구매·이전·번식 암말 수용 한도 (엔진)

담당: haiku-coder · 사용자 승인 2026-10-16(규모 3단계 수치안)
병행: Codex 가 M4-E1(src/engine/farm/facilities.ts, 성장·컨디션·부상·stud/health.ts·stud/stand.ts·정기 비용 등)을 다른 작업 트리에서 진행 — 그 파일과 src/ui, src/engine/types, src/engine/state/systems.ts 는 건드리지 말 것.

목적: 마주 시작 플레이어가 목장을 사서 오너브리더가 되고, 오너브리더는 더 큰 목장으로 옮길 수 있게 한다. 번식 암말 수는 목장 수용 한도를 넘지 못한다.

## 사용할 타입·상수 (수정 금지)
- types/farm.ts: `FarmState`, `FarmListing { id; country; size; name; price }`, `FarmSize`, `HomeCountry`; `GameState.farm`, `GameState.farmListings`
- GameEvent `'farm_purchased' { country; size; price; date }`, LedgerCategory `'farm_purchase'`
- config/farm.ts: `HOME_COUNTRIES`, `FARM_MARE_CAPACITY`, `FARM_BASE_PRICE`, `FARM_COUNTRY_PRICE_MULT`, `FARM_LISTING_PRICE_SPREAD`, `FARM_LISTINGS_PER_SLOT_MIN/MAX`, `FARM_RESALE_SHARE`, `STABLE_BLOCK_CAPACITY_BONUS`, `uniformFacilities`
- 가상 목장 이름: 기존 생산자·마주 목장 이름 생성(world/breeders.ts 또는 people 의 studName 생성 함수)을 재사용하고 기존 이름과 겹치지 않게(원칙 1: 가상 이름만).
- `recordMoney`, `canSpendDiscretionary`, `createRng`

## 생성·수정할 파일 (5개 이하 + 테스트)
1. `src/engine/farm/purchase.ts`(신규)
   - `mareCapacity(state): number` — 목장 없으면 0, 아니면 FARM_MARE_CAPACITY[size] + STABLE_BLOCK_CAPACITY_BONUS[stable_block 단계].
   - `playerBroodmareCount(state): number` — 플레이어 소유 status 'broodmare'.
   - `generateFarmListings(state, year): FarmListing[]` — 나라 5 × 규모 3 마다 `${initialSeed}:farm-listings:${year}:${country}:${size}` 스트림으로 MIN~MAX 개, 가격 = 기준가 × 나라 배수 × (1 ± SPREAD 균등) 를 €10,000 단위 반올림, id 는 `${year}-${country}-${size}-${n}`, 이름은 가상 목장명.
   - `createFarmListingsSystem(): WeeklySystem`(id 'farm_listings') — 매년 1주에 state.farmListings 를 그해 매물로 바꾼다(공용 rng 미사용).
   - `purchaseFarm(state, listingId): { ok: true; state; events } | { ok: false; error: 'not_found' | 'insufficient_funds' | 'too_small' }` — 플레이어만. 목장이 없으면 그대로 사고 settings.startType 은 바꾸지 않되 farm.owned true(시설은 모두 1단계, acquiredYear = 올해, name = 매물 이름, 플레이어 owner.studName = 매물 이름). 목장이 있으면 '이전': 기존 목장을 FARM_BASE_PRICE[기존 규모] × FARM_COUNTRY_PRICE_MULT[기존 나라] × FARM_RESALE_SHARE 에 팔고(장부 'farm_purchase' +), 새 매물값을 낸다(장부 −). 시설 단계는 그대로 옮긴다. 새 목장 수용 한도 < 현재 번식 암말 수면 'too_small'. 자금 검사는 순지출(새 값 − 매각가)로. 매물 목록에서 그 매물을 뺀다. 이벤트 'farm_purchased'(돌려주기만, eventLog 는 호출자). 원본 불변.
2. `src/engine/stud/yearEnd.ts` — 연말 정산 'broodmare' 진로: 목장이 없으면 허용하지 않고, 이번 제출로 번식 암말이 수용 한도를 넘으면 오류 `'mare_capacity'`(YearEndError 에 추가). yearEndCandidates 의 allowed 에서도 목장이 없으면 'broodmare' 를 뺀다.
3. 세일·개인 거래로 암말을 사서 번식 암말로 들이는 경로가 있으면(찾아서) 같은 수용 한도 검사를 넣고 보고. 없으면 보고만.
4. `src/ui/yearEnd/yearEndView.ts` 의 오류 문구 표(Record<YearEndError, string>)에 `mare_capacity: '목장 수용 한도를 넘어 번식 암말로 들일 수 없습니다.'` 한 줄만 추가(타입체크용, 화면 수정은 이 한 줄만 허용).
5. 테스트 `tests/engine/farmPurchase.test.ts`(신규).

## 수용 기준
1. generateFarmListings: 같은 시드·연도 2회 동일, 나라 5 × 규모 3 모두 1~2개, 가격이 기준가 × 나라 배수 ± 10% 안·€10,000 단위, 이름이 가상(기존 목장명과 안 겹침).
2. 마주 시작(목장 없음) 상태에서 소형 매물 구매 → farm.owned true·size small·시설 1단계·자금 감소·장부·매물 제거. 자금 부족 오류.
3. 이전: 중형(GB) → 대형(IE) 순지출이 (새 값 − 1,000,000 × 1 × 0.75) 와 같고 시설 단계 유지. 번식 암말 20두에서 소형으로 이전 → 'too_small'.
4. 연말 정산: 목장 없으면 broodmare 진로가 allowed 에 없다. 수용 한도 초과 제출 → 'mare_capacity'.
5. `npm test && npm run typecheck && npm run lint` 통과. 시스템은 등록하지 않으므로 기존 고정 해시 불변.

## 금지
src/engine/types 수정 금지. 화면은 위 한 줄 외 금지. E1 병행 파일·state/systems.ts 수정 금지. 공용 rng 사용 금지. git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/farmPurchase.test.ts && npm test && npm run typecheck && npm run lint
