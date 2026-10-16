# M4-E0 새 게임 설정 엔진: 시작 유형·난이도·소재국·예후불량

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/m4-plan.md E0
사용자 결정: 시작 유형 마주/오너브리더, 난이도 안 A(2026-10-12), 예후불량 기본 켬·현실 수준(경주 중 중증 골절의 약 40%), 소재국 유럽 5개국(2026-10-16), 목장 소재국에 따라 지급마·기초 암말 혈통이 달라짐(2026-10-12 피드백).

목적: 새 게임을 설정값으로 만들고(자금·지급 두수·목장·시설 단계·소재국 혈통), 예후불량을 넣는다. 화면은 다음 티켓(E0-UI).

## 사용할 타입·상수 (수정 금지, 이미 추가됨)
- `src/engine/types/farm.ts`: `StartType`, `Difficulty`, `HomeCountry`, `GameSettings { startType; difficulty; catastrophicInjuries }`, `FacilityKind`, `FarmSize`, `FarmState { owned; country; size; name; facilities; acquiredYear }`, `FarmListing`
- `GameState.settings`, `GameState.farm`, `GameState.farmListings`(저장 v18 마이그레이션 완료)
- GameEvent `'horse_fatally_injured' { horseId; raceId; date }`, `'horse_died'`, `'horse_status_changed'`
- `src/engine/config/farm.ts`: `FACILITY_KINDS`, `FACILITY_MAX_LEVEL`, `HOME_COUNTRIES`, `DEFAULT_GAME_SETTINGS`, `uniformFacilities(level)`, `emptyFarm()`
- 지금 코드: state/newGame.ts(createNewGame — 기본 settings·farm 이미 채움), state/bootstrap.ts(bootstrapGame), state/world.ts(기초 암말 PLAYER_START_MARES·MARE_COUNTRIES·pickWeightedSire), world/population.ts(grantStarterHorses — STARTER_HORSES·STARTER_COUNTRY, M4-ST1 능력·ST2 모마), config/starter.ts, config/game.ts STARTING_FUNDS, horse/conditioning.ts·horse/injury.ts(M4-H12 부상 — 출주 중 부상 발생 경로), season/system.ts

## 범위 (파일 10개 내외)
1. `NewGameOptions`(newGame.ts)에 선택 필드 추가: `startType?: StartType`, `difficulty?: Difficulty`, `homeCountry?: HomeCountry`, `catastrophicInjuries?: boolean`, `grantRacehorses?: boolean`(오너브리더만 의미, 기본 true).
   - **difficulty 가 없으면 지금과 바이트 단위로 같은 게임**(자금 STARTING_FUNDS, 기초 암말 3, 지급마 2세 2·3세 1, GB, 시설 1단계)을 만든다 — 기존 고정 해시 테스트가 바뀌지 않게. settings 는 DEFAULT_GAME_SETTINGS.
2. `src/engine/config/farm.ts` 에 난이도 표(안 A) 추가 — 근거 주석:
   | 난이도 | 자금 | 오너브리더: 기초 암말 | 오너브리더: 지급 현역마 | 마주: 지급 현역마 | 시설 단계 | 목장 규모 |
   |---|---|---|---|---|---|---|
   | easy | €1,500,000 | 3 | 2 | 3 | 2 | medium |
   | normal | €600,000 | 2 | 1 | 2 | 1 | medium |
   | hard | €250,000 | 1 | 0 | 1 | 1 | small |
   지급 현역마 n 두의 나이: [3세, 2세, 2세] 앞에서 n 두(능력은 M4-ST1 그대로, 모마는 M4-ST2 그대로). 오너브리더가 grantRacehorses false 면 0두.
3. 오너브리더: farm = { owned true, country = homeCountry, size = 표, name = 플레이어 studName(없으면 null), facilities = uniformFacilities(표 단계), acquiredYear = 시작 연도 }. 마주: farm = emptyFarm(), 기초 암말 없음, 플레이어 owner.studName null.
4. 소재국 혈통: 플레이어 마주 country = homeCountry. 기초 암말의 출생국 = homeCountry(지금 MARE_COUNTRIES 무작위 대신, difficulty 가 있을 때만), 부 선택 가중치에 계류국 === homeCountry 이면 × `HOME_SIRE_WEIGHT_MULT = 3`(config, 근거 주석). 지급 현역마의 나라(STARTER_COUNTRY 대신)·조교사 나라 = homeCountry, 부 선택은 spawnRacingHorse 의 기존 같은 나라 배수(POPULATION_SIRE_SAME_COUNTRY_MULT)로 자연히 그 나라 위주가 된다. 모마(ST2)의 부도 같은 가중을 쓴다.
5. 예후불량: `CATASTROPHIC_FRACTURE_SHARE = 0.4`(config/injury.ts, 근거: 사용자 결정 '현실 수준'). settings.catastrophicInjuries 가 true 이고 **출주 중** 생긴 부상이 'fracture' 면 `${initialSeed}:catastrophic:${horseId}:${raceId}` 독립 스트림으로 이 확률에 걸리면 즉사: status 'dead', diedYear, trainerId null, 소유 목록에서 제거, 열린 레이스 출주 신청 제거. 플레이어 말이면 'horse_fatally_injured'(raceId 포함) 이벤트(그 말의 'horse_injured' 는 내지 않는다). 설정이 false 면 지금과 같다(골절 부상으로 휴양). AI 말도 같은 규칙(이벤트 없음).
6. settings 는 createNewGame 에서 옵션으로 채운다(catastrophicInjuries 기본 true).
7. 테스트 `tests/engine/newGameSettings.test.ts`(신규).

## 수용 기준
1. difficulty 를 주지 않은 bootstrapGame 결과가 지금과 같다(기존 고정 해시 테스트 전부 그대로 통과).
2. 3 난이도 × 2 시작 유형 × 소재국 5개 조합(시드 고정)에서: 자금·기초 암말 수·지급마 수·나이·farm(owned·country·size·facilities)·owner.country 가 표와 같다. 마주 시작은 기초 암말 0·목장 없음.
3. 소재국 혈통: 시드 1~20 의 IE 오너브리더 기초 암말 부 중 IE 계류 종마 비율이 GB 소재 게임의 IE 계류 비율보다 뚜렷이 높다(측정 보고), 지급마 조교사 나라 = 소재국.
4. 예후불량: 설정 true 에서 출주 중 fracture 의 약 40%(표본 측정 35~45%)가 사망, false 에서 0%. 사망한 플레이어 말은 소유 목록·출주 신청에서 빠지고 이벤트가 하나. 같은 시드 2회 동일, 공용 rng 상태는 설정에 따라 달라지지 않는다(예후불량 판정은 독립 스트림).
5. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 화면(src/ui) 수정 금지. 공용 rng 소비 순서 변경 금지(새 판정은 독립 스트림). git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (3·4 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/newGameSettings.test.ts && npm test && npm run typecheck && npm run lint
