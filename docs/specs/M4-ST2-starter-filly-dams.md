# M4-ST2 지급 현역마에 가상 모마 기재(수정: 성별 무관)

담당: haiku-coder · 사용자 요청 2026-10-16: "지급되는 말의 모마도 기재"(지급 현역 2·3세 전부 — 처음엔 암말만이었으나 사용자가 범위를 넓힘)

목적: 새 게임 지급 현역마는 지금 모마가 없다(damId null). 시작 번식 암말(state/world.ts 4번 블록)과 같은 방식으로 가상 모마(그 부는 실명 종마)를 만들어 연결해, 은퇴 후 번식 암말이 되면 혈통표 모계가 채워지게 한다.

## 사용할 것 (수정 금지)
- `src/engine/state/world.ts` 의 기초 암말 모마 생성 블록(c 단계)을 그대로 본뜬다: `DAM_AGE_GAP_MIN/MAX`, `MARE_LEVEL`, `MARE_LEVEL_SPREAD`(config/world.ts), `filterSiresForCover`·`coverYearForFoal`(world/sireWindow.ts), 가중 종마 선택(world.ts 의 pickWeightedSire 또는 같은 규칙 — 같은 함수가 export 돼 있으면 쓰고, 아니면 world/population.ts 안에 같은 규칙의 작은 함수), `allocateHorseId`, `namingContextFor`·`nameForHorse`, `generateHorse`(status 'historical', sex 'female', familyId = 자기 id).
- `grantStarterHorses`(world/population.ts).

## 수정할 파일 (2개 + 테스트)
1. `src/engine/world/population.ts` — grantStarterHorses 에서 지급마 전부(성별 무관)에 대해, 모든 지급을 마친 뒤(지급 순서대로) 모마를 만든다:
   - 난수는 공용 rng 를 쓰지 말고 `createRng(\`${state.initialSeed}:starter-dam:${horse.id}\`)` 독립 스트림(기존 지급마·AI 세계 생성 결과를 바꾸지 않게).
   - 모마 출생 연도 = 지급마 출생 연도 − gap(DAM_AGE_GAP_MIN~MAX), 모마의 부 = 그 출생 연도의 교배 연도에 교배 가능한 실명 종마 중 가중 선택(전체 기록, historical 포함 — world.ts c 단계와 같다), 이름은 nameForHorse(registry 등록), countryOfBirth = 지급마 출생국.
   - 지급마 damId = 모마 id, familyId = 모마 id. 모마는 owner 없음(ownerId null), status 'historical'.
2. 필요하면 `src/engine/state/world.ts` 의 가중 선택 함수를 export(동작 변경 금지).
3. 테스트 `tests/engine/starterHorses.test.ts` 에 케이스 추가.

## 수용 기준
1. 시드 1~20 새 게임에서 지급 현역마는 모두(수말·거세마 포함) damId 가 있고, 그 모마는 status 'historical'·sex 'female'·이름 있음·sireId 가 실명 종마 키, 출생 연도 차 6~12, 모마의 부는 그 교배 연도에 교배 가능(canSireIn).
2. 지급마 외 말(AI 현역마 등)의 damId 는 지금과 같다.
3. 지급마의 능력·OR·부·이름은 이 변경 전과 같다(tests/engine/starterStrength.test.ts 통과, AI 세계 해시 포함). 같은 시드 2회 동일.
4. 다른 고정 해시 테스트(breeders·playerSireCrops·stallionTradeIntegration 등)가 모마 ID 할당 때문에 바뀌면, 원인이 이것뿐인지 확인한 뒤 값만 바꾸고 목록 보고.
5. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면 수정 금지(다른 작업자가 src/ui 를 수정 중). 공용 rng 사용 금지. git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/starterHorses.test.ts tests/engine/starterStrength.test.ts && npm test && npm run typecheck && npm run lint
