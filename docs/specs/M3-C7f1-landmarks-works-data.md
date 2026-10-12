# M3-C7f1 명승고적·유명 작품 이름 데이터

담당: haiku-data · 근거: 사용자 요청(2026-10-12) — 마명에 명승고적·유명한 작품 이름을 쓸 수 있게(현실 예: Rock of Gibraltar, Golden Horn, Giant's Causeway, Savethelastdance, Paddington, Real Steel). 생성기 연결은 C7f2(C7e2 뒤).

## 목적
`data/naming/landmarks.json` 을 새로 만든다: 실제 명승고적(자연·건축) 이름과 유명 작품 제목 목록. 마명 후보로만 쓰인다.

## 허용 기준 (Opus 결정, docs/decisions.md 기록)
- 명승고적: 시대 무관. 자연(산·바위·폭포·곶·호수·해협·만·사막 등)과 건축·유적(다리·탑·성·궁전·신전 유적·성문·운하 등). 예: Golden Horn, Giant's Causeway, Matterhorn, Ponte Vecchio.
- 작품 제목: 책·시·희곡·그림·조각·클래식 음악·오페라·발레·민요·노래·영화.
  - 제목이 **일반 어구**(사전 단어로 된 구, 예: Save the Last Dance, Real Steel, Starry Night, Swan Lake, Moonlight Sonata)면 시대 무관 허용.
  - 제목이 **고유 인물명·캐릭터명·지어낸 단어**(예: Hamlet, Ivanhoe, Don Quixote, Peer Gynt)면 작가 사망 후 70년 이상 지난 작품만(1956년 이전 사망).
- 금지: 상표·회사·제품·브랜드 이름(Coca, Lego, iPhone 등), 상표로 보호되는 현대 캐릭터(Mickey Mouse, Harry Potter, Paddington Bear, Superman 등 — 단 Paddington 처럼 실제 지명과 같은 단어는 지명으로서 real_places 쪽 문제이므로 여기 넣지 않는다), 실존 인물 이름이 그대로 들어간 제목, 정치·종교 성지·종교 인물 이름(예: Mecca, Vatican, Temple Mount, Sistine), 전쟁·재난·학살 관련 지명(Auschwitz, Chernobyl, Ground Zero 등), 실제 경마장 이름과 그 소재 지명(data/naming/real_places.json 의 blockedTokens 를 포함하는 이름), 실제 레이스 이름.
- 마명 형식: 공백 포함 18자 이하, 영문자·공백·아포스트로피(')·하이픈(-)·마침표만. 악센트 문자는 기본 라틴으로 바꾼다(é→e). 실제 이름이 18자를 넘으면 넣지 않는다.
- data/naming/protected.json 의 이름(정규화 후 같은 것)은 넣지 않는다 — 실존 유명마 이름이라 생성돼도 거절된다. Rock of Gibraltar·Golden Horn·Giant's Causeway 는 보호 명단에 있어 제외된다(_review 에 제외 사유로 기록).
- data/stallions/names.json 의 종마 이름, real_places.json 의 countries·regions·cities 와 겹치는 항목은 넣지 않는다(중복 출처 방지).

## 파일 형식
```json
{
  "version": 1,
  "landmarks": [ { "name": "Matterhorn", "kind": "natural", "country": "CH" } ],
  "works": [ { "name": "Swan Lake", "kind": "ballet", "year": 1877, "titleType": "phrase" } ]
}
```
- landmarks.kind: "natural" | "built". country: ISO 3166-1 alpha-2.
- works.kind: "book" | "poem" | "play" | "painting" | "sculpture" | "music" | "opera" | "ballet" | "song" | "film". year: 발표 연도. titleType: "phrase"(일반 어구) | "proper"(고유명·지어낸 단어). titleType "proper" 는 `creatorDeathYear`(≤ 1956) 필드 필수.

## 개수
- landmarks ≥ 150 (natural ≥ 60, built ≥ 60, 유럽 외 ≥ 40)
- works ≥ 150 (phrase ≥ 90, proper ≥ 30, 장르 6가지 이상 각 ≥ 8)

## 생성·수정할 파일
1. `data/naming/landmarks.json`
2. `data/naming/_review_landmarks.md` — 제외한 후보와 사유(보호 명단·18자 초과·상표·종교 등), 사실 확인이 불확실한 항목 목록(작가 사망 연도 등 — 50개 이하면 Opus 가 사용자에게 확인을 요청한다. 직접 웹 조회하지 말 것).
3. `tests/data/landmarks.test.ts` (신규) — 개수, 형식(18자·문자 집합), 중복 0, protected·종마 이름·real_places 와 겹침 0, blockedTokens 포함 0, proper 의 creatorDeathYear ≤ 1956, 금지어 정규식 0건(`mecca|medina|vatican|sistine|temple mount|auschwitz|chernobyl|ground zero|hiroshima|nagasaki|disney|marvel|pixar|potter|mickey|superman|batman|coca|lego|nike`).

## 수용 기준
1. 위 테스트 통과, 개수·형식 기준 충족.
2. 금지 범주 0건, _review_landmarks.md 작성.
3. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
기존 data/naming/*.json 수정 금지. src/ 수정 금지. 웹 조회 금지(기억으로 작성하고 불확실한 것은 _review 에 표시). git commit 금지.
다른 에이전트가 동시에 src/engine/naming·world·state·breeding·data/staticData.ts 와 data/calendar 를 수정 중이다. 그쪽 작업 때문에 깨지는 테스트는 보고만 한다.

## 추가 (사용자 결정 2026-10-12) — 18자 초과 제목
- 공백 포함 18자를 넘는 제목도 **공백을 뺀 길이가 18자 이하**면 넣는다(예: Save the Last Dance → 생성기에서는 항상 붙여 쓰기 "Savethelastdance"). 이런 항목에는 `"joinedOnly": true` 를 붙인다.
- 형식 검사: 공백을 뺀 길이 ≤ 18. joinedOnly 는 공백 포함 길이 > 18 인 항목에만 있어야 한다.
- 보호 명단·종마·real_places 겹침 검사는 정규화(공백 제거) 기준이므로 그대로 적용된다.
- 앞서 18자 때문에 뺀 후보(Save the Last Dance 등)와 축약한 제목은 원제로 되돌릴 수 있으면 되돌린다(붙여 쓴 길이 ≤ 18 일 때만). 추가 개수 목표: 30개 이상.
