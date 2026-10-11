# M1-07b 시뮬레이션 성능 최적화 (결과 불변)

담당: haiku-coder · 선행: M1-11(더트) 승인 후

## 목적
변동성 보정 후 20두·3,000m·리플레이 포함 레이스가 평균 약 58ms 로 M1 기준(50ms)을 넘는다. **결과를 바꾸지 않고** 평균 40ms 이하(여유 포함)로 줄인다.

## 프로파일 (Opus 측정, 20두 3000m)
| 함수 | 비중 |
|---|---|
| simulateRace 본문 | 22% |
| isLaneFree + findBlocker (틱마다 O(n²)) | 20% |
| staminaDrainPerSecond (`**` 거듭제곱) | 8% |
| path.sample / advance / localAt | 8% |
| shouldStartSpurt + baseTargetSpeed + earlyPhaseLimit | 5% |
| 리플레이 기록 | 약 10ms/회 |

## 수정·생성할 파일
1. `src/engine/race/simulate.ts`
2. `src/engine/race/tactics.ts` (기존 export 함수와 시그니처는 유지 — 테스트가 쓴다. 새 함수 추가 가능)
3. `src/engine/race/runnerModel.ts` (staminaDrainPerSecond 내부 최적화만, 시그니처 유지)
4. `tests/engine/simGolden.test.ts` (신규)
5. `tests/engine/fixtures/sim-golden.json` (신규, **코드를 고치기 전에** 생성)

## 절차 (순서 엄수)
1. **최적화 전에** 현재 구현으로 골든 데이터를 만든다: 아래 8개 설정 × `simulateRace` 의 `result` 전체를 JSON 으로 저장(`sim-golden.json`). 생성 스크립트는 simGolden.test.ts 안에 `GENERATE` 환경변수로 켜는 분기로 둔다(`GENERATE=1 npx vitest run tests/engine/simGolden.test.ts`).
   설정: (saint_ourens 3000 20두 seed 99) (saint_ourens 1600 10두 seed 1) (ashcombe 2414 14두 seed 7) (ashcombe 1006 8두 seed 3) (marlow_downs 1006 20두 seed 11) (marlow_downs 3219 12두 seed 5) (ardvarrow_park 1207 14두 seed 21) (ardvarrow_park 2816 10두 seed 8). 출주마는 `generateSampleField(createRng(seed).fork('field'), …)` + `buildEntries(createRng(seed).fork('entries'), …)`, going 은 잔디 'good' / AW 'standard'.
2. 최적화한다(아래 허용 기법).
3. simGolden.test.ts 의 비교 테스트: 각 설정에서 runners 의 (runnerIndex, position) 순서가 골든과 **완전히 같고**, finishTime·sectionals·beatenLengths 차이 ≤ 1e-6, margin 라벨 동일.
4. 성능 테스트(같은 파일): 20두 saint_ourens 3000m 리플레이 포함, 워밍업 5회 후 30회 평균 < 40ms.

## 허용 기법
- **정렬된 이웃 탐색:** 틱마다 progress 오름차순 순서 배열(`Int32Array`, 직전 틱 순서를 삽입 정렬로 갱신 — 거의 정렬돼 있어 O(n))을 유지하고, findBlocker / isLaneFree / 경합(battling) 판정은 자기 위치에서 앞뒤로 |Δprogress| 가 범위(BLOCK_DISTANCE_M, LANE_CLEARANCE_M, BATTLE_RANGE_M)를 넘으면 멈추는 방식으로 스캔. **판정 결과(어떤 말이 걸리는지, findBlocker 의 '가장 가까운 것, 같으면 작은 index' 규칙)는 기존과 같아야 한다.** 기존 export 함수는 그대로 두고 `findBlockerSorted` 같은 새 함수를 추가해 simulate 에서 사용.
- **staminaDrainPerSecond:** `DRAIN_EXPONENT === 3` 이면 `x * x * x` 사용(골든 허용 오차 1e-6 안).
- **러너별 상수 사전 계산:** 레이스 시작 시 earlyPhaseLimit(distance), 스퍼트 판정에 쓰는 '1m 당 스퍼트 소모량' 등을 배열에 미리 계산하고 shouldStartSpurt 와 같은 판정을 하는 내부 함수 사용.
- **할당 줄이기:** baseTargetSpeed 의 인자 객체 대신 위치 인자 내부 함수 사용(export 함수는 유지), 리플레이 프레임은 필요한 배열만 복사.
- path.ts 는 수정 금지(sample 할당은 감수).

## 금지
- 시뮬레이션 규칙·상수(config) 변경 금지. 결과가 골든과 달라지면 그 최적화는 되돌린다.
- 목록 외 파일 수정 금지. 기존 테스트 수정 금지.

## 수용 기준
1. 골든 비교 8개 설정 모두 통과.
2. 성능 테스트 평균 < 40ms (단독 실행 기준), 기존 simulate.test.ts 의 50ms 테스트도 `npm test` 전체 실행에서 통과.
3. `npm test`, typecheck, lint 통과.

## 테스트 명령
`npx vitest run tests/engine/simGolden.test.ts && npm test && npm run typecheck && npm run lint`
