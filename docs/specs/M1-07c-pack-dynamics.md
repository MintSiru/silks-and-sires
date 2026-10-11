# M1-07c 무리(페이스 추종) 동역학

담당: haiku-coder · 선행: M1-07b

## 목적 (Opus 진단)
현재는 모든 말이 출발부터 **자기 순항 속도로 혼자** 달린다. 순항 속도가 0.3 m/s 차이 나면 150초 동안 45m(약 19마신)가 벌어져,
1·2착 착차 중앙값 5.65마신, 10마신 이상 31% 라는 비현실적인 결과가 나온다(실제는 중앙값 1~1.5마신, 10마신 이상 수 %).
실제 레이스는 **선두가 페이스를 만들고 나머지는 작전 위치를 지키며 따라가고**, 약한 말은 따라가느라 스태미나를 더 써서 직선에서 처진다.
이 동작을 넣는다.

## 수정·생성할 파일
1. `src/engine/config/sim.ts` (상수 추가만. 기존 상수 값 변경 금지)
2. `src/engine/race/tactics.ts` (함수 추가. 기존 export 시그니처 유지)
3. `src/engine/race/simulate.ts`
4. `tests/engine/pack.test.ts` (신규)
5. `tests/engine/fixtures/sim-golden.json` (동작이 바뀌므로 **구현 후** `GENERATE=1 npx vitest run tests/engine/simGolden.test.ts` 로 재생성)

## 추가 상수 (config/sim.ts, 초기값 — 수용 기준을 맞추기 위해 **이 새 상수들만** 조정 가능)
```ts
/** 선두와의 최대 허용 간격(m). 이보다 뒤처지면 따라붙는다 */
export const PACK_MAX_GAP_M: Record<RunningStyle, number> = { front: 2, prominent: 6, midfield: 12, held_up: 20 };
/** 선두와의 최소 간격(m). 이보다 가까우면 페이스를 넘지 않는다(작전 위치 유지) */
export const PACK_MIN_GAP_M: Record<RunningStyle, number> = { front: 0, prominent: 2, midfield: 6, held_up: 12 };
/** 따라붙을 때 목표 = 선두 속도 × (1 + 이 값) */
export const PACK_CATCHUP_FRACTION = 0.01;
/** 따라가기 비용을 감당할 수 있는지 판단할 때의 여유 배수 */
export const PACK_AFFORD_SAFETY = 1.0;
/** 바로 앞(같은 레인대, DRAFT_DISTANCE_M 이내)에 말이 있으면 스태미나 소모 배수 */
export const DRAFT_DISTANCE_M = 3;
export const DRAFT_DRAIN_FACTOR = 0.95;
```

## 동작 사양 (매 틱, 스냅샷 기준 — 기존 2단계 갱신 규칙 유지)
1. 틱 시작 스냅샷에서 **미결승 말 중 progress 최대인 말 = 선두** L, `leaderProg`, `leaderSpeed`.
2. 말 i 가 (미결승) 이고 (스퍼트 전) 이고 (i ≠ L) 이고 (출발 구간이 끝났을 때 — `s >= earlyPhaseLimit` 가 아니라 **속도가 cruise × START_PHASE_SPEED_FRACTION 이상**이 된 뒤):
   - `gap = leaderProg - prog[i]`
   - **감당 가능 판단:** `need = staminaDrainPerSecond(leaderSpeed, cruise_i, 0, going, power_i) × toFinish_i / leaderSpeed`. `stamina_i >= need × PACK_AFFORD_SAFETY` 이면 감당 가능.
   - `gap > PACK_MAX_GAP_M[style]` 이고 감당 가능 → `target = max(target, leaderSpeed × (1 + PACK_CATCHUP_FRACTION))` (단, topSpeed 를 넘지 않음).
   - `gap < PACK_MIN_GAP_M[style]` → `target = min(target, leaderSpeed)`.
   - 감당 불가면 따라붙기는 하지 않는다(무리에서 처짐).
3. 순서: baseTargetSpeed(기존) → **무리 보정(위)** → 트래픽(기존). 탈진 상한(stamina ≤ 0 → exhaustedSpeed)은 무리 보정 뒤에도 유지되도록 마지막에 다시 `min` 적용.
4. **드래프팅:** 스태미나 소모 계산 시, 같은 레인대(|Δlane| < HORSE_WIDTH_M)에서 0 < 앞말 progress − 내 progress < DRAFT_DISTANCE_M 인 말이 있으면 소모 × DRAFT_DRAIN_FACTOR. (정렬 이웃 탐색 재사용)
5. 선두 말 자신은 기존 규칙대로(자기 작전 속도) 달린다 → 선두의 작전/능력이 페이스를 만든다.
6. 난수 사용 추가 금지(결정론 유지).

## 수용 기준 (pack.test.ts — 출주마는 generateSampleField(level 60) + buildEntries, 레이스는 data 의 12개 레이스를 시드별로 순환, 두수 `4 + (s % (maxRunners-3))`, 잔디 'good' / AW 'standard')
1. **무리 응집:** 400 레이스에서, 선두가 거리의 60% 지점을 처음 지나는 프레임의 (선두 − 최후미) 간격을 (두수−1) 로 나눈 값의 중앙값 ≤ 2.4m × 1.5 (= 1.5마신/두).
2. **착차:** 600 레이스에서 1·2착 beatenLengths 중앙값 ≤ 2.5 (Opus 완화: 현실형 변동성과 양립하는 값), 10마신 이상 비율 ≤ 5%.
3. 기존 테스트 전부 통과: 현실 시간(simulate.test), 능력 차(+25 ≥15/50, +40 ≥32/50), 재현성, 리플레이 규격, 성능(simGolden 40ms·simulate 50ms, 단독 실행 기준).
4. 골든 재생성 후 simGolden 통과. typecheck·lint 통과.
- 기준 1·2 가 안 맞으면 PACK_* / DRAFT_* 상수만 조정하고 최종값과 측정치를 보고한다. 그래도 안 되면 측정치와 함께 실패로 보고(다른 상수·모듈 수정 금지).

## 금지
- 목록 외 파일 수정 금지. runnerModel.ts·config/runner.ts·config/raceday.ts 수정 금지.

## 테스트 명령
`npx vitest run tests/engine/pack.test.ts && npm test && npm run typecheck && npm run lint`
