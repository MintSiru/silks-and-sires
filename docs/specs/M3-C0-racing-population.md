# M3-C0 현역마 집단(세계 경주마) 생성 + 연간 세대 교체

담당: haiku-coder · 선행: M3-B2(인물 생성기)

## 목적
시즌이 굴러가려면 AI 마주·조교사 소속 현역마가 필요하다. 새 게임 때 유럽 5개국 현역마 집단을 만들고, 매년 1월에 새 2세를 넣고 고령마를 은퇴시킨다.

## 사용할 것
- 타입: Horse, Owner, Trainer, GameState (수정 금지)
- `generateHorse`, `generateHorseName`(src/engine/horse/generate.ts), `allocateHorseId`(src/engine/state/world.ts), 실명 종마 데이터 getStallionRecords
- 인물은 이미 state 에 있다고 가정(테스트에서는 bootstrapPeople 로 만든다)

## 생성·수정할 파일
1. `src/engine/config/population.ts`:
   - `POPULATION_IN_TRAINING = { GB: 900, IE: 450, FR: 650, DE: 200, IT: 200 }`
   - 나이 분포 2세 0.30, 3세 0.30, 4세 0.18, 5세 0.11, 6세 0.07, 7세 0.04
   - 암말 비율 0.42, 4세 이상 수말 중 거세마 비율 0.35
   - 능력 수준: 부(父) 종마 marketTier 별 잠재 평균 {1: 66, 2: 63, 3: 60, 4: 57, 5: 54}, spread 9 — 엘리트는 드물게(상위 1% 가 잠재 평균 80 이상 정도가 되게 조정)
   - 부 선택 가중: 그 말 출생 연도에 교배 가능했던(foaled ≤ birthYear − MIN_SIRE_AGE_AT_COVER − 1) active/pensioned 종마, tier 가중 {1: 10, 2: 6, 3: 4, 4: 2.5, 5: 1.5}, 계류국이 같은 나라 ×2
   - 마주 배정 가중: major 6, mid 2, small 1 (같은 나라), 조교사: 같은 나라, capacity 남은 조교사 중 skill 가중
   - 연간 교체: 1월 1주에 나라별 POPULATION_IN_TRAINING × 0.30 만큼 새 2세 생성, 8세 이상 전부 은퇴, 4세 이상은 OR(없으면 잠재 기준) 하위 15% 를 은퇴. 은퇴한 수말은 status 'retired', 암말은 'broodmare' 아님 — 'retired' (번식 진입은 M4).
2. `src/engine/world/population.ts`:
   - `bootstrapRacingPopulation(state, data, rng): GameState` — 위 분포로 생성. Horse: status 'in_training', ownerId/trainerId/breederId(=ownerId), sireId(실명 종마 key), damId null, sireLineId(부 계통), countryOfBirth(그 나라, 단 FR 은 10% GB/IE 등 섞기 없이 단순하게 그 나라), distanceBias 는 부 프로필 거리(PROFILE_DISTANCE)와 기본 생성 중간값(가중 0.5).
   - 2세는 officialRating null. 3세 이상은 `initialOfficialRating(horse)`(아래)로.
   - Owner.horseIds 갱신.
   - 이미 AI 소속 현역마가 있으면 Error.
3. `src/engine/world/rating.ts` — `initialOfficialRating(horse: Horse): number`: 현재 능력 5종 평균 a 에 대해 OR = clamp(round((a − 38) × 2.2), 20, 130). (M3-C3 핸디캐퍼가 이후 갱신. 상수는 config/population.ts 에)
4. `src/engine/world/populationSystem.ts` — `createPopulationSystem(data): WeeklySystem` (id 'population'): week 1 에만 동작 — 연간 교체. 이벤트 `horse_status_changed`(은퇴) 발생.
5. `tests/engine/population.test.ts`

## 수용 기준
1. 같은 시드 → 결과 toEqual. 나라별 현역마 수 = 설정값.
2. 모든 현역마의 마주·조교사가 같은 나라 인물이고, Owner.horseIds 와 Horse.ownerId 가 일치. 조교사 capacity 초과 없음.
3. 부는 모두 존재하는 실명 종마이고 교배 가능 연도 조건을 만족.
4. 3세 이상 OR 분포: 평균 60~80, 상위 1% ≥ 110 (테스트에서 출력하고 범위 확인).
5. 연간 교체 10년 반복 후에도 나라별 현역마 수가 설정값 ±10% 안, 이름 중복 없음(생성 실패 없이).
6. bootstrap 후 serializeGame 결과 문자열 길이 < 8,000,000.
7. 엔진에 Math.random/Date.now 없음. typecheck·lint·npm test 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). data/ 수정 금지. newGame/useGame 연결 금지(A6). git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
