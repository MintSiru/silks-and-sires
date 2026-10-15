# M4-BET1 가상 베팅 회사·스폰서 레이스 데이터

담당: haiku-data · 선행: 3139863(타입 src/engine/types/betting.ts) · 근거: 사용자 요청(2026-10-15) — 베팅 회사 이름을 큰 레이스 스폰서명으로, 세일 회사 이름도 중상급 레이스에 스폰서로(모티브: 세일 회사 이름이 붙은 실제 골드컵)

## 스키마 (수정 금지 — src/engine/types/betting.ts)
- `BookmakersDataFile { version: 1; bookmakers: BookmakerDef[] }`, `BookmakerDef { id; name; shortName | null }`
- `SponsorshipsDataFile { version: 1; sponsorships: SponsorshipDef[] }`, `SponsorshipDef { templateId; sponsor: { kind: 'bookmaker'; id } | { kind: 'sale_company'; id }; nameFormat; prizeMultiplier }`

## 만들 파일
1. `data/betting/bookmakers.json` — 가상 베팅 회사 **4곳**. id `bm_<영문 소문자_밑줄>`. 영국·아일랜드 풍 2곳, 프랑스 풍 1곳(장외 마권 회사 모티브), 범유럽 온라인 풍 1곳. shortName 은 스폰서명에 쓸 짧은 이름(없으면 null).
2. `data/calendar/sponsorships.json` — 스폰서 레이스 **24~30건**:
   - 대상: 기존 템플릿(data/calendar/g1.json·g1_extra.json·pattern_gb_ie.json·pattern_fr_de_it.json)의 G2·G3·리스티드·핸디캡 위주(G1 은 최대 4건). templateId 는 실제 존재하는 id 만.
   - 스폰서 분배: 베팅 회사 4곳이 각 3~5건, 세일 회사(data/sales/sales.json 의 companies id) 5곳이 각 2~3건. 세일 회사는 자기 나라 경마장 레이스에 붙인다(예: 영국 세일 회사 → 영국 경마장).
   - nameFormat: 대부분 `'{sponsor} {race}'`. 세일 회사 몇 건은 모티브처럼 `'{sponsor} Gold Cup'`·`'{sponsor} Sprint'`·`'{sponsor} Stakes'` 같은 새 이름(그 레이스 거리·성격에 맞게 — 예: 장거리면 Gold Cup·Cup, 단거리면 Sprint). 새 이름 결과에 실제 레이스명이 생기면 안 된다.
   - prizeMultiplier: G1 1.1, G2·G3 1.2~1.3, 리스티드·핸디캡 1.3~1.5.
   - {sponsor} 에는 bookmaker 의 shortName(없으면 name), 세일 회사는 name 그대로 들어간다고 가정하고 최종 이름 길이 60자 이하.
3. `data/betting/_review.md` — 회사 표, 스폰서 레이스 표(templateId·원래 이름·최종 이름·배수), 모티브 설명(실제 이름은 이 파일의 '모티브' 열에서만 허용).
4. `tests/data/betting.test.ts`(신규) — 스키마, id 중복 없음, templateId·세일 회사 id 참조 유효, 템플릿당 스폰서 최대 1건, 배수 범위, 최종 이름(자리표시자 치환) 60자 이하, 금지어 없음.

## 원칙 1 (필수)
- 실존 베팅 회사·브랜드명과 그 단어 금지: 예) bet365, William Hill, Ladbrokes, Coral, Paddy Power, Betfair, Sky Bet, Betfred, BoyleSports, Unibet, Betway, PMU, Tote, Betvictor, 888, BetMGM, DraftKings, FanDuel, Kindred, Entain, Flutter. 실존 스폰서·레이스명(예: Qipco, Longines, Coral-Eclipse 류, Arc, King George 등)과 data/naming/real_places.json blockedTokens 도 금지.
- 테스트에 위 금지 목록을 넣어 회사명·최종 레이스명을 단어 단위로 검사.
- 이름을 data/_names_review.md 에도 기록(기존 관행).

## 수용 기준
1. 테스트 통과, `npm test && npm run typecheck && npm run lint` 통과(src 는 건드리지 않으므로 기존 테스트 영향 없음).
2. _review.md 작성.

## 금지
src/ 수정 금지. 다른 에이전트가 data/stallions/ 를 수정 중이다 — 건드리지 말 것. git commit 금지.
