# M4-C3 세일 가치 평가 (순수 함수)

담당: haiku-coder · 선행: 24a2537(세일 타입) · 설계: docs/m4-sales-design.md 3장

## 목적
로트 말의 시장 평가값(€)을 정하는 순수 함수. C2(카탈로그)가 로트마다 한 번 부르고 `SaleLot.valuation` 에 저장한다. AI 입찰(C4)·유보가·화면 추정 범위의 기준이 된다.

## 사용할 것 (수정 금지)
`Horse`(potential·ability·soundness·sex·birthYear·sireId·damId·officialRating), `Stallion`(fee·popularity, `state.stallions[horseId]`), `Mare`(coveredBy·pregnant·blackTypeProduce, `state.mares`), `OffspringStats`(`state.sireStats[sireId]`), `SalesState.history`(`SaleSummary`), `SaleKind`, `Rng`, `meanAbility`·`ratingFromAbility`(world/rating.ts), `POPULATION_TIER_LEVEL`·`POPULATION_ABILITY_SPREAD`(config/population.ts), `TIER_FEE`(config/world.ts)

## 생성할 파일
- src/engine/config/sales.ts(신규): 아래 상수 전부(초기값 표기)
- src/engine/sales/valuation.ts(신규)
- tests/engine/saleValuation.test.ts(신규)

## 함수
```ts
export function valueLot(state: GameState, horse: Horse, kind: SaleKind, year: number, rng: Rng): Money
export function estimateRange(valuation: Money): { low: Money; high: Money }
export function marketTrend(state: GameState, kind: SaleKind, year: number): number
```
rng 사용 규칙: `valueLot` 은 종류와 상관없이 **rng.normal 을 정확히 1회** 쓴다(시장 인식 오차). 호출자가 로트마다 독립 rng 를 넘긴다.

### 공통
- 결과 = round(값 / `SALE_VALUE_ROUND`(100)) × 100, 최소 `SALE_VALUE_FLOOR`(1,000).
- 시세 `marketTrend`: history 중 같은 kind·year−2 ~ year−1 의 median 들의 중앙값 ÷ `SALE_BASE_MEDIAN[kind]` 를 0.85~1.15 로 자른다. 기록이 없으면 1. 초기 기준 중앙값: yearling 40,000 · foal 20,000 · breeze_up 45,000 · horses_in_training 25,000 · breeding_stock 30,000.
- 부 종부료 `sireFee` = state.stallions[horse.sireId]?.fee, 없으면 `SALE_FALLBACK_SIRE_FEE`(5,000).

### yearling · foal · breeze_up
값 = sireFee × `SALE_KIND_FEE_MULT[kind]`(yearling 2.0 · foal 1.3 · breeze_up 2.2) × 부 성적 × 체형 × 유행 × 시세
- 부 성적 = clamp(1 + `SALE_SIRE_GROUP_WINNER_BONUS`(0.05) × groupWinners − (starters ≥ `SALE_SIRE_FLOP_MIN_STARTERS`(20) 이고 winners/starters < `SALE_SIRE_FLOP_RATE`(0.3) 이면 `SALE_SIRE_FLOP_PENALTY`(0.15) 아니면 0), 0.8, 1.5). sireStats 없으면 1.
- 체형: 품질 z = (meanAbility(potential) − 기대치) / `SALE_QUALITY_SD` + rng.normal(0, `SALE_MARKET_NOISE_SD`(0.6)).
  기대치 = 부 시장 등급의 POPULATION_TIER_LEVEL(등급은 sireFee 에 가장 가까운 TIER_FEE 의 등급), `SALE_QUALITY_SD` 는 **측정해서 정한다**(아래 수용 기준 4). 체형 = exp(z × `SALE_CONFORMATION_SD`(0.45)), 단 soundness < `SALE_UNSOUND_THRESHOLD`(35) 이면 × `SALE_UNSOUND_MULT`(0.6).
- 유행 = 1 + (popularity − 50) / 50 × `SALE_FASHION_AMPLITUDE`(0.2). popularity 없으면 1.

### horses_in_training
값 = 표 보간(OR → €): `SALE_HIT_VALUE_BY_OR` = [[40, 3,000], [60, 8,000], [75, 20,000], [85, 50,000], [95, 120,000], [105, 300,000], [115, 800,000]] (구간 선형 보간, 양끝 밖은 끝값) × 나이 배수(2·3세 1.2, 4세 1.0, 5세 0.8, 6세 이상 0.5 — `SALE_HIT_AGE_MULT`) × exp(rng.normal(0, `SALE_HIT_NOISE_SD`(0.3))) × 시세.
OR 이 null 이면 ratingFromAbility(meanAbility(ability)).

### breeding_stock
값 = (`SALE_MARE_BASE`(4,000) + 그 암말의 부 종부료 × `SALE_MARE_SIRE_MULT`(0.6)) × OR 배수 × 나이 배수 × 모계 배수 + 임신 가산, 전체 × exp(rng.normal(0, `SALE_MARE_NOISE_SD`(0.3))) × 시세
- OR 배수: 암말 officialRating(없으면 ratingFromAbility(meanAbility(ability))) 60 이하 1.0, 그 위로 1점당 +0.03, 최대 3.0.
- 나이 배수: ≤ 8세 1.0, 9~12세 0.7, 13세 이상 0.4.
- 모계 배수 = 1 + 0.15 × blackTypeProduce(최대 2.0). mares 레코드 없으면 1.
- 임신 가산 = pregnant 이면 coveredBy 종마 fee × `SALE_IN_FOAL_SHARE`(0.5).

### estimateRange
low = round(valuation × 0.7, 100 단위), high = round(valuation × 1.4, 100 단위). (화면은 이 범위만 보여 준다)

## 수용 기준
1. 같은 입력·같은 rng 상태 → 같은 값. rng.normal 1회만 쓰는지 테스트(가짜 rng 로 호출 수 확인).
2. 단조성: sireFee 가 크면 값이 크다(다른 조건 같음, 노이즈 고정), popularity 80 > 50 > 20, soundness 30 은 × 0.6, OR 95 > OR 75, 나이 4세 > 6세, 임신 > 비임신.
3. 하한 1,000, 100 단위 반올림, 시세 0.85~1.15 자르기, 기록 없으면 1.
4. **분포 측정·보고**(시드 20261011 bootstrapGame 의 2세 현역마를 yearling 로 보고 valueLot 을 시드 고정 rng 로 계산): 부 등급별(1~5) 중앙값과 10·90 백분위. `SALE_QUALITY_SD` 는 그 집단의 (meanAbility(potential) − 등급 기대치) 표준편차로 정하고 값 보고. 목표 중앙값: 등급 1 €200k~€400k, 등급 3 €40k~€80k, 등급 5 €8k~€16k. 벗어나면 `SALE_KIND_FEE_MULT.yearling` 만 조정하고 보고.
5. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수 전부 config/sales.ts.

## 금지
src/engine/types 수정 금지. 카탈로그 생성·입찰·sales 시스템 구현 금지(C2·C4). state 를 바꾸지 않는다(읽기만). git commit 금지.

## 테스트 명령
npx vitest run tests/engine/saleValuation.test.ts && npm test && npm run typecheck && npm run lint
