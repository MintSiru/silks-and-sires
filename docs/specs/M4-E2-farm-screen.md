# M4-E2 목장 화면: 매물 구매·이전, 시설 공사, 수용 한도·유지비

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 선행: M4-E0b·E1·E0a(커밋 ffa3768)

목적: 플레이어가 목장 상태(소재국·규모·번식 암말 수용·시설 단계·공사·유지비)를 보고, 시설 공사를 시작하고, 목장 매물을 사거나 옮길 수 있는 '목장' 화면을 만든다. 번식마 세일 입찰이 수용 한도에 막히면 입찰할 때 이유를 보여 준다.

## 사용할 것 (수정 금지)
- 엔진: `farm/facilities.ts` — `facilityLevel(state, kind)`, `upgradeCost(kind, targetLevel)`, `startFacilityUpgrade(state, kind)` → `{ ok, state, events } | { ok: false, error: 'no_farm' | 'max_level' | 'under_construction' | 'insufficient_funds' }`
- `farm/purchase.ts` — `mareCapacity(state)`, `playerBroodmareCount(state)`, `purchaseFarm(state, listingId)` → `{ ok, state, events } | { ok: false, error: 'not_found' | 'insufficient_funds' | 'too_small' }`
- config/farm.ts: `FACILITY_KINDS`, `FACILITY_MAX_LEVEL`, `FACILITY_UPKEEP_PER_LEVEL_YEAR`, `FACILITY_BUILD_WEEKS`, `FARM_MARE_CAPACITY`, `STABLE_BLOCK_CAPACITY_BONUS`, `FARM_BASE_PRICE`, `FARM_COUNTRY_PRICE_MULT`, `FARM_RESALE_SHARE`, 시설 효과 계수(PADDOCK_GROWTH_PER_LEVEL 등)
- 상태: `state.farm`(owned·country·size·name·facilities·acquiredYear·construction{facility, level, readyWeekKey}), `state.farmListings`, `state.settings.startType`
- text.ts: `FACILITY_KO`, `FARM_SIZE_KO`, `COUNTRY_KO`, `feeKo`, `formatDateKo`
- useGame 관례: 플레이어 API 는 이벤트만 돌려주고 훅이 `appendEvents` 로 eventLog 에 붙인 뒤 저장(다른 API 와 같게)
- 승부복: '승부복 바꾸기' 버튼은 지금 BreedingScreen 목장 머리에 있다 — 새 목장 화면으로 옮겨도 된다(보고).

## 범위
1. `src/ui/game/useGame.ts`: `purchaseFarm(listingId)`, `startFacilityUpgrade(kind)` 추가(PlayerResult 형식, 기존 API 와 같은 방식으로 상태 갱신·이벤트 누적·저장).
2. `src/ui/farm/farmView.ts`(신규, 순수 함수) — 화면 값 계산:
   - `farmSummary(state)`: 목장 없음 / 이름·나라·규모·취득 연도·번식 암말 `n / 한도`(마방 증축 보너스 표시)·연 유지비(단계 합 × €8,000)·종마 칸.
   - `facilityRows(state)`: 9종 각각 이름·현재 단계/3·효과 한 줄(단계 L 기준 수치, 예: '망아지·1세 성장 +8%')·다음 단계 비용(최대면 null)·공사 중이면 '공사 중 → L단계, 완공 예정 날짜'.
   - `listingRows(state)`: 매물 이름·나라·규모·수용 한도·값·(목장이 있으면) 순지출 = 값 − 지금 목장 매각가·살 수 있는지(자금·수용 한도) 이유.
   - 효과 문구 표는 이 파일 상수로(시설 효과 계수는 config 에서 읽어 % 로 만든다 — 숫자를 다시 적지 말 것).
3. `src/ui/farm/FarmScreen.tsx`(신규) + App.tsx 탭 '목장'(TabId 'farm', 목장 탭은 '번식' 옆): 위 세 구역. 공사 버튼(한 번에 하나, 공사 중이면 모두 비활성 + 이유), 매물 구매/이전 버튼(확인 단계 하나: 순지출·시설 유지 안내), 오류 문구 한글. 목장이 없는 마주 시작이면 '목장을 사면 오너브리더가 됩니다' 안내와 매물 목록만.
4. 번식마 세일 수용 한도: `sales/bidding.ts` 의 `setMaxBid` 에서 번식마 세일(event.kind === 'breeding_stock') 로트에 입찰할 때 `playerBroodmareCount(state) >= mareCapacity(state)` 이면 `'mare_capacity'` 오류(BidError 에 추가). SalesScreen 의 `bidErrorKo` 에 문구 '번식 암말이 목장 수용 한도에 찼습니다. 목장 화면에서 마방을 늘리거나 더 큰 목장으로 옮기세요.' 추가. (auction.ts playerBidValid 의 기존 검사는 그대로 둔다.)
5. 이벤트 문구는 text.ts 에 이미 있다(farm_purchased, facility_upgraded). 없는 것만 추가.
6. 테스트: `tests/ui/farmView.test.ts`(요약·행·순지출·공사 중·목장 없음), `tests/engine/salesMareCapacity.test.ts`(setMaxBid mare_capacity, 한도 미만이면 기존과 같음).

## 수용 기준
1. farmView: 기본 새 게임(오너브리더 normal) 요약이 중형·한도 15(+마방 1단계 3 = 18)·연 유지비 €72,000; 마주 시작은 목장 없음.
2. facilityRows 의 효과 문구 수치가 config 계수 × 단계와 같다(대표 3종 테스트). 공사 중이면 그 행에 완공 예정 날짜, 다른 행 버튼 비활성 이유.
3. listingRows: 이전 순지출 = 매물 값 − 기존 목장 매각가(기준가 × 나라 배수 × 0.75), 한도 부족이면 '너무 작음' 이유.
4. useGame.purchaseFarm / startFacilityUpgrade 가 상태·eventLog·장부를 갱신한다(훅 테스트 또는 기존 useGame 테스트 방식).
5. setMaxBid: 한도가 찬 상태의 번식마 세일 로트 → 'mare_capacity', 다른 세일·한도 미만은 기존 결과와 같음.
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 기존 고정 해시 불변(엔진 변경은 bidding.ts 한 곳뿐).

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 엔진 변경은 bidding.ts 의 오류 추가뿐. 화면 문구에 실명(사람·목장·기관) 금지. 새 의존성 금지. git commit 금지.

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
npx vitest run tests/ui/farmView.test.ts tests/engine/salesMareCapacity.test.ts && npm test && npm run typecheck && npm run lint && npm run build
