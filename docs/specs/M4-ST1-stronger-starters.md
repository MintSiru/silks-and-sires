# M4-ST1 새 게임 지급마 능력 상향 (사용자 친화)

담당: haiku-coder · 근거: 사용자 요청 2026-10-15 — "초기 지급받는 현역마/2세마가 중상급 경주를 우승할 정도의 능력" · 측정 근거: G2·G3 우승마 최고 OR 중앙값 ≈ 105(decisions.md 2026-10-15)
병행: Codex 가 src/engine/stud/market.ts·config/stud.ts·tests/engine/feeReview.test.ts 수정 중 — 건드리지 말 것

목적: 지급마 3두(3세 1·2세 2)가 리스티드~G3 를 이길 수 있는 능력을 갖게 한다. 혈통(부 3티어)은 그대로 두고 능력 수준만 올린다.

## 사용할 것 (수정 금지)
- world/population.ts `spawnRacingHorse`, `RacingHorseSpec`, `grantStarterHorses`; config/population.ts `POPULATION_TIER_LEVEL`, `POPULATION_ABILITY_SPREAD`; world/rating.ts `ratingFromAbility`·`meanAbility`·`initialOfficialRating`.

## 생성·수정할 파일 (3개)
1. `src/engine/config/starter.ts` — 추가: `STARTER_ABILITY_LEVEL`(시작값 = POPULATION_TIER_LEVEL[1] 과 [2] 사이에서 아래 기준을 맞추도록 측정으로 정함, 주석에 측정값), `STARTER_ABILITY_SPREAD`(시작값 POPULATION_ABILITY_SPREAD 의 절반 — 지급마끼리 편차를 줄임).
2. `src/engine/world/population.ts`
   - `RacingHorseSpec` 에 선택 필드 `levelOverride?: number`, `spreadOverride?: number`. 있으면 generateHorse 의 level·spread 로 쓰고, 없으면 지금과 바이트 단위 같은 동작.
   - grantStarterHorses 가 levelOverride = STARTER_ABILITY_LEVEL, spreadOverride = STARTER_ABILITY_SPREAD 를 넘긴다. 부 선택(sireTier 3)과 rng 소비 순서·횟수는 그대로(level 은 평균만 바꾸고 난수 사용 횟수는 같아야 한다 — generateHorse 를 확인해 보고).
3. `tests/engine/starterStrength.test.ts`(신규)

## 수용 기준 (시드 1~40 의 새 게임으로 측정·보고)
1. 3세 지급마: 시작 OR(officialRating) 중앙값 98~106, 최솟값 ≥ 92.
2. 2세 지급마: 잠재 레이팅 ratingFromAbility(meanAbility(potential)) 중앙값 100~110, 최솟값 ≥ 92.
3. 지급마 외 세계(AI 현역마·종마·마주)는 지금과 같다: 시드 20261011 bootstrapGame 결과에서 플레이어 소유가 아닌 말들의 JSON 이 변경 전과 같다(해시 비교).
4. 같은 시드 2회 동일. `npm test && npm run typecheck && npm run lint` 통과. 깨지는 고정값 테스트가 있으면 원인이 지급마 능력 변화뿐인지 확인 후 기대값만 고치고 목록 보고.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 부 티어·지급 두수·나라 변경 금지. git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (1·2 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/starterStrength.test.ts && npm test && npm run typecheck && npm run lint
