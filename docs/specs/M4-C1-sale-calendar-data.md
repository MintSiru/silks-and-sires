# M4-C1 세일 캘린더 데이터

담당: haiku-data · 근거: docs/m4-plan.md C1, 사용자 아이디어(미국 대형 9월 1세마 세일 모티브 — 여러 날·여러 북)

## 목적
가상 세일 회사와 해마다 열리는 세일 일정을 `data/sales/sales.json` 으로 만든다(엔진 코드 없음).

## 스키마 (수정 금지 — src/engine/types/sales.ts)
`SalesDataFile { version: 1; companies: SaleCompanyDef[]; events: SaleEventDef[] }`
- `SaleCompanyDef { id; name; country; venue; prestige: 1|2|3 }`
- `SaleEventDef { id; companyId; name; kind: 'foal'|'yearling'|'breeze_up'|'horses_in_training'|'breeding_stock'; week; books: SaleBookDef[]; buyerPremiumRate; minimumBid }`
- `SaleBookDef { book; weekOffset; lotsTarget; maxSireTier: 1..5 }`
ID 규칙: 회사 `sco_<영문 소문자_밑줄>`, 세일 `sev_<회사 약칭>_<종류>[_<월>]`.

## 게임 달력 주 → 월 (monthOfWeek)
1월 1~5 · 2월 6~9 · 3월 10~13 · 4월 14~18 · 5월 19~22 · 6월 23~26 · 7월 27~31 · 8월 32~35 · 9월 36~39 · 10월 40~44 · 11월 45~48 · 12월 49~52

## 내용
1. **회사 5곳**(전부 가상 이름, 나라당 대표 회사 + 미국):
   - GB prestige 1(유럽 최대, 10월 대형 1세마·12월 번식마·가을 현역마·이유마)
   - IE prestige 1(9월 1세마, 11월 이유마, 봄 브리즈업)
   - FR prestige 1(8월 1세마, 12월 번식마, 가을 현역마)
   - DE prestige 2(9월 1세마)
   - US prestige 1(9월 초대형 1세마 — 북 5개 이상, 브리즈업, 11월 번식마). 미국 세일은 C9(미국 종마 자마 출품)에 쓰인다.
2. **세일 14~18개**, 종류별 최소: yearling 6(나라별 1 + GB·US 는 2단계 등급 세일 가능), foal 2, breeze_up 2, horses_in_training 2, breeding_stock 3.
3. **북**: 대형 1세마 세일은 북 3~6개. 앞 북일수록 `maxSireTier` 작음(1 → 2 → 3 …), `lotsTarget` 은 북 1 이 작고(100~250) 뒤로 갈수록 크다(250~600). 북 사이 `weekOffset` 은 0 또는 1(북 여러 개가 2주에 걸칠 수 있다). 소형 세일은 북 1개(maxSireTier 5).
4. **수치**: buyerPremiumRate 0.03~0.06(실제 관행 수준, 회사마다 조금씩 다르게), minimumBid 1,000~5,000(번식마·현역마 세일은 높게, 이유마는 낮게).
5. **이름 원칙 1(필수)**: 실제 세일 회사명(Tattersalls, Goffs, Arqana, Keeneland, Fasig-Tipton, BBAG, Tattersalls Ireland, OBS, Inglis, Magic Millions 등)과 그 일부 단어, 실제 세일명(Book 1 Sale 고유명, Orby, Houghton, Arc Sale 등) 금지. 장소(venue)에 실제 경마장 이름과 data/naming/real_places.json 의 blockedTokens 금지. 가상 지명은 data/people/places.json 의 regionNames 를 재사용해도 된다.
6. `data/sales/_review.md`: 세일 표(회사·종류·월·북 수·총 출품 목표) + 실제 세일과의 모티브 대응(설명용, 실제 이름은 이 파일에서만 '모티브' 열에 적어도 됨 — json 에는 금지).

## 테스트 (tests/data/sales.test.ts 신규)
- 스키마 필드·형식, ID 중복 없음, companyId 참조 유효, week 1~52, week+weekOffset ≤ 52, books 의 book 이 1부터 연속, maxSireTier 단조 비감소.
- 종류별 최소 개수, 회사 5곳(나라 GB·IE·FR·DE·US).
- 이름·venue 에 금지어 없음: 위 실제 회사명 목록 + real_places.json blockedTokens(소문자 비교, 단어 단위).

## 수용 기준
1. 위 테스트 통과. 2. `npm test && npm run typecheck && npm run lint` 통과. 3. _review.md 작성.

## 금지
src/ 수정 금지(테스트 파일만 생성). git commit 금지.
