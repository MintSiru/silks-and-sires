# M4-C0 상업 생산자 분리

담당: haiku-coder · 선행: 0c9b2f4(공용 타입) · 근거: 사용자 피드백(2026-10-12) "리딩 마주와 리딩 생산자 랭킹이 거의 동일함"

## 문제
지금 AI 현역마는 전부 `breederId = ownerId`(world/population.ts spawnRacingHorse). 그래서 리딩 생산자 = 리딩 마주.
현실처럼 대부분은 상업 생산자(경주에 출주하지 않고 생산·판매하는 목장)가 생산하고, 목장을 가진 큰 마주 일부만 직접 생산(오너브리더)하게 바꾼다.

## 사용할 것 (수정 금지)
- 타입: `BreederId`, `BreederScale = 'large'|'medium'|'small'`, `CommercialBreeder { id; name; country; scale; funds; horseIds }`, `GameState.breeders: Record<BreederId, CommercialBreeder>`, `Horse.breederId: OwnerId | BreederId | null`, `GameState.initialSeed`
- 사람 생성 문맥: `createPeopleContext`, 목장명 규칙(people/generate.ts 의 makeStudName — 필요하면 export 만 추가 가능, 규칙은 그대로)
- 난수: `createRng(seed)`, `rng.fork(label)`

## 규칙
1. **생성(새 게임)** — `bootstrapGame` 에서 bootstrapPeople 다음, bootstrapRacingPopulation 앞에서 `generateBreeders(state, data, createRng(seed).fork('breeders'))`.
   - 다른 단계는 각자 `createRng(seed).fork(...)` 를 쓰므로 이 단계를 넣어도 기존 단계의 난수는 바뀌지 않아야 한다.
   - 나라별 수(config): GB 12, IE 16, FR 12, DE 5, IT 5. ID `brd_` + 6자리 일련번호(예 brd_000001), 나라 순서 → 번호 순.
   - 이름: 그 나라 목장명 규칙(makeStudName). 마주의 studName·다른 생산자 이름과 겹치면 다시 뽑는다(최대 횟수 config, 넘으면 에러).
   - 규모 비율(config): large 0.2 · medium 0.4 · small 0.4(나라별 allocateCounts 같은 결정적 배분 또는 가중 추첨 — 같은 시드 같은 결과면 된다).
   - 자금(config 범위, 정수): large 2,000,000~5,000,000 · medium 500,000~2,000,000 · small 100,000~500,000. horseIds = [].
2. **생산자 배정** — `spawnRacingHorse`(현역마 집단 생성·연간 교체 공통)에서 `breederId` 를 정한다.
   - **난수는 집단 rng 에서 뽑지 않는다**: 말마다 독립 스트림 `createRng(`${state.initialSeed}:breeder:${horse.id}`)` 를 쓴다(기존 말 능력·이름·두수 결과 불변이 목표).
   - 오너브리더: 마주가 `studName !== null` 이면 확률 `OWNER_BREEDER_SHARE[tier]`(목장 보유 마주 기준 조건부 확률, 초기값 major 0.8 · mid 0.6 · small 0)로 `breederId = owner.id`.
   - 그 밖: 말의 `countryOfBirth` 와 같은 나라의 상업 생산자 중 규모 가중치(config, 초기값 large 5 · medium 2 · small 1)로 추첨. 그 나라에 생산자가 없으면 전체 생산자에서. 생산자가 하나도 없으면(옛 저장본) 지금처럼 `breederId = owner.id`.
3. **플레이어 지급 현역마**(`grantStarterHorses`, 지금 breederId = null): 규칙 2의 '그 밖'과 같은 방법으로 상업 생산자를 배정한다(같은 독립 스트림 방식).
4. **목표 비율**: 부트스트랩 직후 AI 현역마 중 오너브리더 생산 비율이 전체 25~35% 가 되게 `OWNER_BREEDER_SHARE` 를 조정한다(조정했으면 값과 측정값 보고). 순서 major > mid > small=0 은 유지.

## 생성·수정할 파일 (5개)
- src/engine/config/breeders.ts(신규): 위 상수 전부
- src/engine/people/breeders.ts(신규): `generateBreeders`, `pickBreederFor(state, horse, owner)`(규칙 2·3, 독립 스트림 사용)
- src/engine/state/bootstrap.ts, src/engine/world/population.ts
- tests/engine/breeders.test.ts(신규)
- (허용) people/generate.ts 에서 makeStudName 을 export 만 하는 한 줄 수정.

## 수용 기준
1. 시드 20261011·7: 생산자 수 나라별 일치, 이름 중복 0(마주 studName 포함), 이름에 실제 목장명 없음(원칙 1 — 규칙상 가상 지역명+접미어).
2. 오너브리더 비율 25~35%(두 시드), 상업 생산자 생산 말은 모두 같은 나라 생산자(그 나라 생산자가 있을 때).
3. **기존 결과 불변**: 같은 시드에서 현역마의 id·이름·능력·마주·조교사는 변경 전과 같다(breederId 만 다르다). 변경 전 값을 먼저 저장해 비교하는 테스트를 만들거나, 기존 고정 해시 테스트가 그대로 통과하는 것으로 보인다. 깨지는 고정값이 있으면 이유와 함께 보고(임의로 고치지 말 것).
4. 1시즌 진행 후 리딩 생산자(유럽 합산) 상위 10 과 리딩 마주 상위 10 의 겹치는 수(변경 전·후) 보고. 목표: 후 ≤ 4.
5. 같은 시드 2회 결과 동일, 저장 왕복 후 breeders 동일.
6. `npm test && npm run typecheck && npm run lint` 통과. 엔진에 Math.random·Date.now 없음, 상수는 config.

## 금지
src/engine/types 수정 금지. 세일·출품·생산자 자금 이동 구현 금지(C2 이후). 화면 수정 금지(리딩 생산자 이름 표시는 이미 연결됨). git commit 금지.
다른 에이전트가 src/engine/economy/·season/field.ts·season/player.ts·state/systems.ts(B3a·B3b)를 동시에 수정한다. 그쪽 실패는 보고만 하라.

## 테스트 명령
npx vitest run tests/engine/breeders.test.ts && npm test && npm run typecheck && npm run lint
