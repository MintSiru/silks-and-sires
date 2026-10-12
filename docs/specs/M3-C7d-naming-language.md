# M3-C7d 이름 생성기: 마주 국적별 언어 + 실제 지명

담당: haiku-coder · 선행: M3-C7b1 승인(4561ec4), M3-C7c 승인(데이터: foreign.ar, data/naming/real_places.json) · 근거: 사용자 요청(2026-10-12)

## 목적
1. 마주 국적에 따라 이름에 쓰는 언어를 바꾼다: 영국·아일랜드(와 미국·호주 등 영어권)는 영어, 프랑스는 프랑스어, 독일은 독일어, 이탈리아는 이탈리아어, 아랍 계열(AE)은 아랍어(로마자).
2. 실제 국가·지역·도시 이름(Japan, Australia, Los Angeles, Illinois …)도 마명 재료로 쓴다. 실제 경마장 이름이 들어간 지명은 막는다(원칙 1).

## 사용할 것 (수정 금지)
`NamingLexicon`(foreign 에 ar 추가됨), `data/naming/real_places.json`(countries, regions, cities, blockedTokens), C7b1 의 `suggestNames`·`nameForHorse`·`validateHorseName`·`pickOwnerStyle`, `CountryCode`

## 생성·수정할 파일
1. `src/engine/naming/types.ts` — `NameLanguage = 'en' | 'fr' | 'de' | 'it' | 'ar'`. `NamingContext` 에 `language: NameLanguage` 추가(필수). `NamingData` 에 `realPlaces: { countries; regions; cities }`, `blockedPlaceTokens: ReadonlySet<string>` 추가. NamingLexicon.foreign 에 ar.
2. `src/engine/config/naming.ts`
   - `LANGUAGE_BY_COUNTRY: Record<CountryCode, NameLanguage>`: FR → fr, DE → de, IT → it, AE → ar, 그 밖(GB, IE, US, AU, CA, NZ, JP, HK, AR 등) → en
   - `NATIVE_SHARE: Record<NameLanguage, number>`: en 0(영어 모드만), fr 0.7, de 0.65, it 0.7, ar 0.85 — 후보 하나를 '모국어 모드'로 만들 확률
   - 모국어 모드 템플릿 가중치(single, pair, connector): fr {0.45, 0.25, 0.30}, de {0.5, 0.3, 0.2}, it {0.45, 0.25, 0.30}, ar {0.75, 0.10, 0.15}
   - 연결어: fr "de", it "di", de "von", ar "Al"(ar 는 `Al {word}` 형태)
   - `REAL_PLACE_SHARE 0.5`: place 출처에서 실제 지명(countries·regions·cities)을 쓸 확률(나머지는 lexicon.places)
3. `src/engine/naming/generate.ts`
   - 후보마다 rng 로 모국어 모드 여부 결정(NATIVE_SHARE[ctx.language]). 모국어 모드: single = `{native}`, pair = `{native} {native}`, connector = `{native} {연결어} {native}` (ar: `Al {native}` 또는 `{native} Al {native}`), 단어는 foreign[language]. 출처 표시는 'foreign', note 에 "프랑스어 단어 'Etoile'" 형식. 모국어 모드에서는 pedigree·prefix·joined 를 쓰지 않는다(영어 모드에서 기존 규칙대로).
   - 영어 모드: 기존 C7b1 동작. 단 place 출처는 REAL_PLACE_SHARE 확률로 실제 지명. single 템플릿에서 지명 단독("Japan", "Illinois")도 허용. possessive `{noun} of {place}` 에도 실제 지명 사용.
   - 혈통 보충(C7b1)은 언어와 무관하게 유지(혈통 후보는 영어 모드로 만든다).
4. `src/engine/naming/validate.ts` — 이름의 단어 묶음(연속 1~3단어, 소문자)이 blockedPlaceTokens 에 있으면 'protected' 로 거절. (예: "Ascot Lady", "Santa Anita Dream" 거절)
5. `src/engine/data/staticData.ts` — getNamingData 에 real_places 로드, foreign.ar 검증.
6. `tests/engine/naming.test.ts` — 아래 수용 기준. 기존 테스트의 NamingContext 생성 부분에 language 'en' 추가.

## 수용 기준
1. 같은 시드·같은 입력 → 같은 결과(언어별).
2. 언어별 1,000번(count 8): fr 마주 후보 중 프랑스어 단어만으로 된 후보 비율 0.55~0.85, de 0.5~0.8, it 0.55~0.85, ar 0.7~0.95(아랍어 단어 또는 'Al' 만으로 된 후보). en 마주는 foreign 모국어 모드 후보 0.
3. 실제 지명: en 마주 1,000번 중 real_places 의 지명을 포함한 후보가 1개 이상 나온 비율 ≥ 0.3, 지명 단독 이름(예: "Illinois")이 나온다.
4. blockedPlaceTokens: "Ascot Lady", "Lady Of Longchamp", "Santa Anita Dream" 이 'protected' 로 거절된다. 생성 결과 10만 개에 차단 토큰 포함 이름 0.
5. 모든 후보가 validateHorseName 통과, 평균 길이 ≥ 7.5, 기존 C7b1 테스트(혈통 95%, joined, prefix, 고유 비율 기준) 통과(en 기준).
6. 엔진에 Math.random·Date.now·DOM 없음, 매직 넘버는 config/naming.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
data/ 수정 금지. world·population·breeding·people 연결 금지(C7e). git commit 금지.
