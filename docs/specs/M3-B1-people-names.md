# M3-B1 인물 이름 풀(기수·조교사·마주·야드·목장)

담당: haiku-data · 선행: 없음 · 근거: docs/m3-plan.md B1, CLAUDE.md 원칙 1(사람 이름은 전부 가상)

## 목적
국가별로 그럴듯한 가상 인명을 대량으로 만들 수 있는 이름 풀과, 실존 경마계 인물과 겹치지 않게 막는 차단 목록을 만든다.

## 생성할 파일
1. `data/people/name_pools.json`
   ```json
   {
     "GB": { "given_male": [...], "given_female": [...], "surnames": [...] },
     "IE": {...}, "FR": {...}, "DE": {...}, "IT": {...}, "US": {...}, "AU": {...},
     "JP": {...}, "BR": {...}, "ZA": {...}
   }
   ```
   - 국가마다 given_male ≥ 60, given_female ≥ 40, surnames ≥ 120. 그 나라에서 흔한 이름·성(일반 명사 수준). 특정 유명인을 떠올리게 하는 드문 조합은 피한다.
   - ZA·BR 은 CountryCode 에 없으므로 국적 표시용 키로만 쓴다(엔진은 문자열 키로 읽는다).
2. `data/people/blocked_names.json` — `{ "full_names": [...] }`: 실존 경마계 인물(현역·은퇴 유명 기수·조교사·마주·생산자) 성+이름 조합 최소 150개. 생성기가 이 조합을 만들면 다시 뽑는다. **이 파일은 차단 전용**이며 다른 곳에 쓰지 않는다.
3. `data/people/places.json` — 야드·목장·지역 가상 이름 재료:
   - `yard_words`: 야드 이름 단어(예: "Hollow", "Lodge", "Barn" 류 일반어) ≥ 60
   - `stud_suffixes`: "Stud", "Farm", "Haras", "Gestüt", "Allevamento" 등 국가별 일반어
   - `region_names`: 국가별 가상 지명 ≥ 25 (실제 도시명 금지, 가상 조어)
4. `data/people/_review.md` — 출처 성격(일반 이름 목록 수준), 차단 목록 작성 방식, 국가별 개수.
5. `tests/data/people.test.ts` — 개수 하한, 중복 없음, 각 이름 2~14자, 영문자·아포스트로피·하이픈·공백만(JP 는 로마자 표기), blocked 목록 비어 있지 않음.

## 수용 기준
1. 위 개수 하한 충족, 파일별 테스트 통과.
2. name_pools 의 given×surname 전 조합 중 blocked full_names 와 같은 조합이 생길 수 있음을 테스트에서 확인하고(= 차단이 필요한 이유), 생성기 쪽(B2)에서 걸러진다는 메모를 _review 에 남긴다.
3. places.json 의 region_names 에 실제 도시·마을 이름이 없다(_review 에 "가상 조어" 원칙 기록).
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지. 다른 data/ 파일 수정 금지(다른 티켓 작업 중). git commit 금지.
