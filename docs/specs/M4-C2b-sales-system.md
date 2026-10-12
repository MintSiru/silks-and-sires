# M4-C2b 세일 주간 시스템(발표·정리)과 위탁 출품 API

담당: haiku-coder · 선행: M4-C2a(sales/catalogue.ts buildCatalogue) · 설계: docs/m4-sales-design.md 1·5장

## 사용할 것 (수정 금지)
- 타입: `SalesState`·`SaleCatalogue`·`SaleConsignment`·`SaleEventDef`·`SalesDataFile`, GameEvent `{ type: 'sale_catalogue_published'; saleId; year; lots; date }`
- `buildCatalogue(draft, event, year, data, rng)`·`CatalogueStaticData`(sales/catalogue.ts), `getSalesData()`(data/staticData.ts), `PlayerResult`(season/player.ts), `createRng`

## 생성·수정할 파일 (5개)
1. `src/engine/sales/system.ts`(신규)
   - `export interface SalesStaticData { sales?: SalesDataFile }` — **선택 필드**: 없으면 세일 시스템은 아무것도 하지 않는다(기존 테스트의 GameStaticData 를 고치지 않기 위해).
   - `createSalesSystem(data: SalesStaticData & Omit<CatalogueStaticData, 'sales'>): WeeklySystem`(id 'sales'). 매주:
     a. **발표**: 이번 주 = `event.week − SALE_CATALOGUE_LEAD_WEEKS`(config/sales.ts, 4)인 세일마다(이벤트 id 오름차순), 그 해 카탈로그가 없으면 `buildCatalogue` → `draft.sales.catalogues` 에 추가, 그 세일·해의 consignments 를 지우고, 이벤트 `sale_catalogue_published`. 발표 주가 1보다 작아지는 세일은 없다고 보고 assert 로 막는다(데이터 테스트에서 확인).
     b. **정리**: status 'closed' 이고 그 세일의 마지막 북 주 + `SALE_CATALOGUE_KEEP_WEEKS`(8) 가 지난 카탈로그 삭제(같은 해 기준, 연도 넘김은 weeksBetween 사용), 함께 그 카탈로그의 playerBids 삭제. history 는 `SALE_HISTORY_YEARS`(3)년보다 오래된 것 삭제.
     c. (경매 처리는 C4 가 이 시스템에 붙인다 — 여기서는 만들지 않는다.)
   - **난수**: ctx.rng 를 쓰지 않는다(다른 시스템의 난수 경로 보존). 카탈로그마다 `createRng(`${draft.initialSeed}:catalogue:${event.id}:${year}`)` 를 넘긴다.
2. `src/engine/sales/player.ts`(신규) — 플레이어 API(입력 state 불변, structuredClone):
   - `consignToSale(state, horseId, saleId, reserve: Money | null, data: SalesStaticData): PlayerResult<ConsignError>`
     `ConsignError = 'sale_not_found' | 'not_found' | 'not_player_horse' | 'wrong_kind' | 'too_late' | 'already_consigned' | 'invalid_reserve'`
     - 대상 해 = 올해. 올해 발표 주가 이미 지났거나 이번 주면 'too_late'(다음 해 위탁은 받지 않는다).
     - 종류 조건(나이 = 올해 − birthYear): yearling = 1세·status yearling / foal = 0세·status foal 또는 weanling / breeze_up = 2세·status yearling 또는 in_training·`record.starts === 0`(필드 이름은 CareerRecord 확인) / horses_in_training = status in_training 또는 resting / breeding_stock = 암말·status broodmare.
     - 같은 말이 어떤 세일에든 이미 위탁 중이거나 진행 중 카탈로그의 미판매 로트면 'already_consigned'.
     - reserve 는 null 또는 정수 ≥ 0, 아니면 'invalid_reserve'.
   - `withdrawConsignment(state, horseId): PlayerResult<'not_consigned'>` — 발표 전 위탁만 취소.
   - `upcomingSales(state, data): { event: SaleEventDef; year: number; announceWeek: number; status: 'upcoming' | 'catalogued' | 'closed' }[]` — 화면용, 올해·다음 해 일정(발표 주 오름차순, 최대 `SALE_UPCOMING_LIMIT`(12)개).
3. `src/engine/state/systems.ts`: `GameStaticData` 에 `& SalesStaticData` 추가, sales 시스템을 season 다음·contracts 앞에. 시스템 순서 기대 테스트(tests/engine/playerView.test.ts)는 기대값만 고치고 보고.
4. `src/ui/game/useGame.ts`: gameStaticData 에 `sales: getSalesData()`.
5. `tests/engine/salesSystem.test.ts`(신규).
- config/sales.ts 끝에 새 상수 절 추가 허용(위 괄호 값).

## 수용 기준
1. 시드 20261011 bootstrapGame → 52주 진행: 15개 세일 모두 발표 주에 카탈로그 1개씩, 이벤트 15개, 발표 주 = 세일 주 − 4. sales 데이터 없이 만든 시스템 목록으로 진행하면 state.sales 불변.
2. 정리: 마감 처리(테스트에서 status 를 'closed' 로 바꿔 둠) 후 8주 지나면 카탈로그·관련 playerBids 삭제.
3. 위탁: 종류별 성공 1건 이상·실패 사유 전부 테스트. 위탁한 1세마가 그 세일 카탈로그 로트(vendor owner, reserve 그대로)로 들어가고 consignments 에서 빠짐.
4. **기존 결과 불변**: 세일 시스템을 넣은 뒤에도 같은 시드 26주 진행의 레이스 결과(우승마 id 목록)가 넣기 전과 같다(세일 시스템이 ctx.rng 를 안 쓰므로). 넣기 전 값을 먼저 기록해 비교.
5. 52주 진행 시간: 세일 시스템 추가 전·후 주당 중앙값 ms 보고(발표 주 최대값 포함).
6. 같은 시드 2회 → state 동일, 저장 왕복 후 sales 동일.
7. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. 경매·AI 입찰·낙찰 처리 구현 금지(C4). 화면 구현 금지(useGame 의 데이터 한 줄만). catalogue.ts·valuation.ts 수정 금지(문제는 보고). git commit 금지.

## 테스트 명령
npx vitest run tests/engine/salesSystem.test.ts && npm test && npm run typecheck && npm run lint && npm run build
