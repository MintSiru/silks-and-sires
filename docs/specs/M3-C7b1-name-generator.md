# M3-C7b1 이름 검증기·생성기 모듈 (M2-13 개정)

담당: haiku-coder · 선행: M3-C7a 승인(4d2e999) · 근거: docs/naming.md

## 목적
경주마 이름 검증기와, 혈통 연상·마주 스타일·역사 인물·붙여 쓰기를 반영한 시드 기반 이름 후보 생성기를 만든다. 게임 연결(세계 생성·현역마·망아지)은 C7b2.

## 사용할 것 (수정 금지)
- `Rng`(src/engine/types/rng.ts: next, int, range, normal, chance, pick, shuffle, fork)
- 데이터 스키마: docs/specs/M3-C7a-naming-data.md (lexicon·owner-styles·protected·historical). templateWeights 키 7개: single, modifierNoun, possessive, phrase, verb, prefix, joined. sourceWeights 키 8개: pedigree, tribute, historical, place, culture, foreign, abstract, ownerStyle.

## 생성할 파일 (5개)
1. `src/engine/naming/types.ts` — NamingLexicon, OwnerNamingStyle, HistoricalPerson, NamingData(lexicon, styles, protectedNames, historical), NameSource, NameTemplate, NamingContext, NameCandidate, NameRejectReason, NameValidation, NameRegistry(아래)
   - `NamingContext = { sireName: string | null; damName: string | null; style: OwnerNamingStyle; tributeNames: readonly string[] }` (tributeNames = 게임 속 가상 인물의 성. 엔진이 넘긴다)
   - `NameCandidate = { name; template; source; note }` (note = 한국어 한 줄 이유, 예: "어미 Silver Tide 의 'Tide' 에서")
   - `NameRejectReason = 'tooLong' | 'tooManySyllables' | 'invalidChars' | 'initialsOnly' | 'endsWithNumber' | 'protected' | 'taken'`
   - `NameRegistry = { isTaken(normalizedName: string): boolean }`
2. `src/engine/naming/syllables.ts` — `countSyllables(name)`: 단어별 모음(a e i o u y) 연속 묶음 수, 단어 끝 묵음 e 제외, 단어당 최소 1. **붙여 쓴 이름도 같은 규칙**(Savethelastdance 를 한 단어로 셈). `makeSyllableWord(lex, rng)`: 2~3음절, 첫 글자 대문자.
3. `src/engine/naming/validate.ts` — `normalizeName`(소문자 + 공백·아포스트로피 제거), `validateHorseName(name, registry, protectedNames)` (protectedNames 는 normalizeName 적용 Set): 18자 초과(공백 포함), 7음절 초과, 영문자·공백·아포스트로피 외 문자, 이니셜만("J P R"), 끝 숫자, 보호 명단, 등록됨.
4. `src/engine/naming/generate.ts`
   - `extractKeywords(name, lex)`: 단어 분리, stopwords 제외
   - `suggestNames(ctx, data, rng, count, registry): NameCandidate[]`
   - 템플릿: single = `{abstract|foreign|syllableWord|historical}`, modifierNoun = `{modifier} {noun}`, possessive = `{noun}'s {noun}` 또는 `{noun} of {place}`, phrase = lexicon.phrases 틀 채우기, verb = `{verb}` 한 단어 또는 `{verb} {noun}`, prefix = `{style.prefix} {noun}`(prefix 없으면 가중치 0), **joined** = phrases 틀(3단어 이상) 또는 `{historical 성/이름} The {noun}` 을 채운 뒤 공백 제거, 첫 글자만 대문자, 나머지 소문자(예: "Save The Last Dance" → "Savethelastdance").
   - 출처: pedigree = 부모 키워드를 직접 또는 associations 연상어로 템플릿 자리에 넣고 note 에 어느 부모의 어느 단어인지, tribute = ctx.tributeNames 의 성을 single 또는 possessive 에, historical = data.historical 의 이름(단일 또는 성만)을 single·possessive·joined 에, 나머지는 해당 어휘.
   - 후보는 모두 validateHorseName 통과, 서로 중복 없음, 후보당 최대 50회 시도.
   - `nameForHorse(ctx, data, rng, registry): string` — suggestNames(count 1)의 첫 후보. 실패하면 makeSyllableWord 를 검증될 때까지(최대 200회) 시도, 그래도 실패하면 throw.
   - `pickOwnerStyle(ownerId, prefix: string | null, styles): OwnerNamingStyle` — 마주 id 를 해시(src/engine/rng 의 cyrb128 등 기존 함수)해 스타일을 고른다. prefix 가 있으면 prefix 를 가진 스타일 중에서 고르고 그 스타일의 prefix 를 owner 의 prefix 로 바꾼 복사본을 돌려준다. 같은 마주는 항상 같은 스타일.
5. `src/engine/data/staticData.ts` — `getNamingData(): NamingData`(data/naming/*.json 로드, protectedNames 에는 protected.json + data/stallions/names.json 의 종마 이름을 normalizeName 해서 합친다)
6. `tests/engine/naming.test.ts`

## 수용 기준
1. 같은 시드·같은 입력 → suggestNames 결과 완전히 같다.
2. count 8 로 1,000번(시드 1~1000, 실제 getNamingData) 호출: 모든 후보가 validateHorseName 통과, 호출당 평균 길이 ≥ 7.5.
3. 부모 이름 중 하나에 associations 키가 있으면, pedigree 가중치 > 0 인 스타일에서 1,000번 중 95% 이상 pedigree 후보 1개 이상.
4. joined: joined 가중치 0.35 스타일로 1,000번 생성 시 joined 후보가 나오고, 모두 공백 없음·첫 글자만 대문자·18자 이하·7음절 이하.
5. validateHorseName 이 각각 올바른 사유로 거절: 19자 이름, 8음절 이름, 숫자·하이픈·마침표, "J P R", "Storm 2", 보호 명단 이름(대소문자·공백만 다른 경우 포함), 종마 이름(예: "Sea The Stars"), 등록된 이름.
6. prefix 스타일 후보는 접두어로 시작하고 18자 이하. pickOwnerStyle 은 같은 마주에 같은 스타일.
7. 10만 개 생성(시드 고정) 이름 중 생성 결과의 고유 비율 ≥ 0.9(다양성), historical 출처 이름은 historical.json 에 있는 인물에서만.
8. naming 폴더에 Math.random·Date.now·DOM 없음. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. data/ 수정 금지(테스트용 작은 픽스처는 테스트 안에). horse/generate.ts·world·breeding 연결 금지(C7b2). 새 패키지 금지. git commit 금지.
