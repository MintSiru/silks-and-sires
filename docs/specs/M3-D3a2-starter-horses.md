# M3-D3a2 새 게임 시작 현역마 지급

담당: haiku-coder · 근거: 사용자 결정(2026-10-12) — 번식 암말 3두 + 보통 수준 2세마 2두·3세마 1두를 조교사 위탁 상태로 지급, 첫 시즌부터 출주

## 목적
새 게임 직후 시즌 탭에서 바로 출주를 등록할 수 있게, 플레이어에게 현역마 3두를 준다.

## 사용할 것 (수정 금지)
`spawnRacingHorse`·`RacingHorseSpec`·`buildMarket`·`drawSexAndGelding`(world/population.ts), `initialOfficialRating`(world/rating.ts), `bootstrapGame`(state/bootstrap.ts), `GameState.playerOwnerId`, `START_YEAR`

## 생성·수정할 파일
1. `src/engine/config/starter.ts` (신규) — `STARTER_HORSES: { age: number; count: number }[] = [{ age: 2, count: 2 }, { age: 3, count: 1 }]`, `STARTER_SIRE_TIER = 3`(보통 수준 = 종마 시장 등급 3), `STARTER_COUNTRY = 'GB'`(플레이어 기본 나라와 같게), `STARTER_FITNESS = 70`
2. `src/engine/world/population.ts`
   - `RacingHorseSpec` 에 선택 필드 `ownerId?: OwnerId`, `sireTier?: 1 | 2 | 3 | 4 | 5` 추가. ownerId 가 있으면 pickOwner 대신 그 마주(플레이어)를 쓴다(이 경우 pickOwner 의 난수 소비가 없어지는 것은 허용). sireTier 가 있으면 부 후보를 그 marketTier 로 한정(후보가 없으면 제한 없이).
   - **ownerId·sireTier 가 없을 때의 동작·난수 소비는 지금과 완전히 같아야 한다**(기존 재현성 테스트 기대값 불변).
   - `grantStarterHorses(state, data, rng): HorseId[]` (export) — STARTER_HORSES 대로 spawnRacingHorse(ownerId = playerOwnerId, sireTier = STARTER_SIRE_TIER, country = STARTER_COUNTRY). breederId 는 null 로 바꾼다(플레이어가 생산한 말이 아님). 3세마에는 initialOfficialRating, condition.fitness = STARTER_FITNESS. 조교사는 spawnRacingHorse 가 고른 GB 조교사 그대로.
3. `src/engine/state/bootstrap.ts` — 현역마 집단 생성 뒤 `grantStarterHorses(population, data, createRng(seed).fork('starter'))` 1줄(+ import). 그 뒤 기존 단계 그대로.
4. 테스트: `tests/engine/starterHorses.test.ts` (신규) — 아래 기준. 기존 bootstrap 재현성 테스트가 지급 말 때문에 개수 기대값이 바뀌면, 그 기대값만 고치고 보고한다.

## 수용 기준
1. bootstrapGame 직후 플레이어 소유 in_training 말이 3두(2세 2, 3세 1), 모두 trainerId 있음, 플레이어 마주 horseIds 에 있음, 3세마만 OR 있음.
2. 같은 시드 → 같은 말(이름·능력), 다른 시드 → 다름.
3. 지급 말의 부는 marketTier 3 종마(후보가 있으면).
4. 지급 말이 isEligible 로 4월 1주 날짜의 2세 메이든(2세마)·3세 이상 핸디캡 또는 조건 레이스(3세마) 합성 레이스에 출주 가능하다(1월은 올웨더 하위 경주뿐이라 날짜를 4월로 둔다).
5. 기존 테스트 통과(population 재현성 포함). 엔진에 Math.random·Date.now 없음, 매직 넘버는 config/starter.ts. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지. 이름 생성 방식 변경 금지(C7e 담당 — 지금은 기존 generateHorseName). UI 수정 금지. git commit 금지.
