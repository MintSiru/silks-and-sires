# M3-C7f2 명승고적·작품 제목을 이름 생성기에 연결

담당: haiku-coder · 선행: M3-C7e2 승인, M3-C7f1 승인(588c47e) · 근거: 사용자 요청(2026-10-12)

## 목적
data/naming/landmarks.json 의 명승고적·작품 제목이 실제 마명 후보로 나오게 한다(예: "Ponte Vecchio", "Swan Lake", 붙여 쓰기 "Treasureisland").

## 사용할 것
- `NamingData`·`NameCandidate`(src/engine/naming/types.ts), `getNamingData`(src/engine/data/staticData.ts), `sourceWord`·`buildName`·`sampleCandidate`(src/engine/naming/generate.ts), `validateHorseName`, `normalizeName`
- landmarks.json 형식: `{ version, landmarks: {name, kind, country}[], works: {name, kind, year, titleType, creatorDeathYear?}[] }`

## 생성·수정할 파일
1. `src/engine/naming/types.ts` — NamingData 에 `landmarks: string[]`, `workTitles: string[]` 추가(이름 문자열만).
2. `src/engine/data/staticData.ts` — getNamingData 가 landmarks.json 을 읽어 두 배열을 채운다. 정규화 이름이 protectedNames 에 있는 항목은 뺀다.
3. `src/engine/config/naming.ts` — `LANDMARK_SHARE = 0.25`(장소 출처 중 명승고적 비율), `WORK_TITLE_SHARE = 0.3`(문화 출처 중 작품 제목 비율), `TITLE_JOINED_CHANCE = 0.3`(제목을 붙여 쓰기로 만들 확률).
4. `src/engine/naming/generate.ts`
   - 'place' 출처: 먼저 `rng.chance(LANDMARK_SHARE)` 이고 landmarks 가 비어 있지 않으면 명승고적 이름을 고른다. 아니면 기존 로직(실제 지명/어휘 장소) 그대로.
   - 'culture' 출처: `rng.chance(WORK_TITLE_SHARE)` 이고 workTitles 가 있으면 작품 제목. 아니면 기존 로직.
   - 명승고적·작품 제목을 고른 경우(SourcePick 에 표시 필드 추가, 예 `title: true`) 템플릿은 무시하고: `rng.chance(TITLE_JOINED_CHANCE)` 이고 붙여 쓴 길이 ≤ NAME_MAX_LENGTH 면 joinWords 결과(예 "Treasureisland"), 아니면 제목 그대로. template 값은 각각 'joined' / 'single' 로 기록.
   - note(한국어): 명승고적 "명승고적 'Ponte Vecchio' 에서", 작품 "작품 제목 'Swan Lake' 에서".
   - 모국어 모드(언어 en 이 아닌 마주의 모국어 후보)는 바꾸지 않는다.
   - NamingData 에서만 파생되는 값은 C7e2 의 캐시(derivedOf) 방식을 따른다(이름마다 다시 만들지 않기).
5. 테스트: `tests/engine/namingLandmarks.test.ts` (신규) + 기존 naming 테스트에서 NamingData 를 직접 만드는 곳에 새 필드 추가.

## 수용 기준
1. 영어 모드·스타일 'world' 로 서로 다른 시드 2,000개 이름 중 명승고적 또는 작품 제목 출처(그대로 또는 붙여 쓰기)가 2% 이상 20% 이하, 그중 붙여 쓰기가 1개 이상.
2. 생성된 이름 전부 validateHorseName 통과, protectedNames·실명 종마 이름과 같은 것 0.
3. landmarks·workTitles 가 빈 배열이면 기존 동작과 같은 이름이 나온다(같은 시드 비교 — 빈 배열일 때는 추가 난수를 쓰지 않는다).
4. bootstrapGame(시드 20261011) 후 모든 말 이름 검증 통과·중복 0(C7e2 의 namingIntegration 테스트 통과), 같은 시드 2회 toEqual, 저장 왕복 통과.
5. bootstrapGame 시간이 C7e2 승인 시점 대비 +10% 이내(측정값 보고).
6. 엔진에 Math.random·Date.now 없음. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지. data/ 수정 금지. UI 수정 금지. git commit 금지.
