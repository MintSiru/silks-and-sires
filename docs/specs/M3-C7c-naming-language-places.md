# M3-C7c 이름 데이터 보강: 아랍어 어휘·실제 지명·아랍계 인명

담당: haiku-data · 선행: M3-C7a·C7b1 승인 · 근거: 사용자 요청(2026-10-12) — 마주 국적에 맞는 언어로 이름 짓기, 국가·지역·도시 이름도 마명에 쓰기

## 목적
1. 아랍 계열 마주가 쓸 아랍어(로마자 표기) 단어를 추가한다.
2. 실제 국가·지역(주·도)·도시·명소 이름을 마명 재료로 추가한다. 단 실제 경마장 이름과 같은 지명은 차단한다(원칙 1).
3. 아랍 계열 가상 인물(마주) 이름 풀을 추가한다.

## 생성·수정할 파일
1. `data/naming/lexicon.en.json` — `foreign` 에 `ar: string[]` 추가(최소 180). 아랍어 단어의 로마자 표기(뜻이 좋은 일반어: 빛·바람·별·사막·매·명예·용기 등). 한 단어 12자 이하, 영문자와 아포스트로피만.
2. `data/naming/real_places.json` (신규)
   ```ts
   interface RealPlacesFile {
     version: 1;
     countries: string[];   // 영어 국가명(Japan, Australia, Argentina …) 120 이상
     regions: string[];     // 주·도·지방·섬(Illinois, Bavaria, Tuscany, Normandy, Kentucky …) 120 이상
     cities: string[];      // 도시·명소·지형(Los Angeles, Gibraltar, Kilimanjaro …) 150 이상
     blockedTokens: string[]; // 실제 경마장·경마 중심지 이름(소문자). 이 토큰을 포함한 지명은 마명에 못 쓴다
   }
   ```
   - 모든 항목 18자 이하, 영문자·공백·아포스트로피만(악센트 제거).
   - `blockedTokens` 150 이상: 영국·아일랜드·프랑스·독일·이탈리아·미국·호주·일본·홍콩·두바이·사우디·캐나다의 실제 경마장 이름과 그 소재 마을(예: epsom, ascot, newmarket, york, goodwood, doncaster, chester, haydock, sandown, kempton, newbury, curragh, leopardstown, galway, punchestown, longchamp, chantilly, deauville, saint cloud, maisons laffitte, baden, hoppegarten, capannelle, san siro, churchill downs, belmont, saratoga, santa anita, keeneland, del mar, flemington, randwick, tokyo racecourse(→ 토큰은 경마장 고유어만), sha tin, happy valley, meydan, riyadh …). 도시 자체가 경마장과 같은 이름이면(예: Saratoga, Deauville, Chantilly) cities·regions 에 넣지 않는다.
   - 대도시가 경마장 이름 일부인 경우(예: Tokyo, Hong Kong, Dubai, Melbourne)는 도시 이름은 허용하고, 경마장 고유어(예: Fuchu, Sha Tin, Meydan)만 차단한다.
   - 실존 경주마 이름과 완전히 같은 지명(Australia, Los Angeles, Gleneagles, Galileo 같은 종마 이름 포함)은 목록에 있어도 된다 — 생성기가 보호 명단·종마 이름으로 걸러 낸다.
3. `data/people/name_pools.json` — 국가 키 `AE` 추가(기존 국가 형식과 동일: 남성 이름 ≥ 60, 여성 이름 ≥ 40, 성 ≥ 120). 성은 "Al ..." 형식의 가상 가문명 위주. **실존 왕족·마주 가문 금지**(Maktoum, Al Thani, Al Nahyan, Al Saud, Al Qasimi, Al Khalifa 등 걸프 왕가, 유명 마주 가문). 이름(given name)은 흔한 아랍 이름이어도 되지만, 이름+성 조합이 실존 유명인이 되지 않게 성을 가상으로.
4. `data/people/blocked_names.json` — 위 실존 왕가·마주 가문명과 유명 경마 관계자 아랍 인명을 추가.
5. `tests/data/naming.test.ts`·`tests/data/people.test.ts` — 새 데이터 검사 추가(수량, 문자 규칙, 중복, blockedTokens 를 포함한 지명이 countries·regions·cities 에 없음, AE 성에 차단 가문명 없음). 기존 people 테스트의 국가 목록에 AE 를 넣는다.
6. `data/_names_review.md` — "M3-C7c" 절: 아랍어 단어 목록(뜻 한국어 병기), 지명 수, 차단 토큰 목록, AE 성 목록.

## 수용 기준
1. 위 수량·형식 충족, 테스트 통과.
2. 아랍어 단어·지명이 data/naming/protected.json·data/stallions/names.json 의 이름과 대소문자 무시로 같지 않다(종마 이름과 같은 지명은 예외 — 위 2번 마지막 항목. 테스트에서 지명은 이 검사 제외).
3. 실명 금지 검사: real_places 의 어떤 항목도 blockedTokens 의 토큰을 단어 단위로 포함하지 않는다.
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지. 기존 lexicon 의 다른 배열·owner-styles·historical 수정 금지. git commit 금지.
