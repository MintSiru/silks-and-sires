# M2-10 독일 계류 현역 종마 추가

담당: haiku-data · 근거: 사용자 요청·제공 목록(2026-10-15, 2025 종부료) — 지금 DE·IT 계류 active 0두

## 사용자 제공 목록 (이름 · 부 · 외조부 · 2025 종부료) — 이 값은 바꾸지 말 것
| 이름 | 부 | 외조부 | 종부료 |
|---|---|---|---|
| Torquator Tasso | Adlerflug | Toylsome | €20,000 |
| Japan | Galileo | Danehill | €9,500 |
| Fantastic Moon | Sea The Moon | Jukebox Jury | €9,000 |
| Isfahan | Lord of England | Polar Falcon | €7,500 |
| Counterattack | Redoute's Choice | Snippets | €7,500 |
| Waldgeist | Galileo | Monsun | €6,000 |
| Iquitos | Adlerflug | Areion | €6,000 |
| Alson | Areion | Galileo | €5,500 |
| Best Solution | Kodiac | Kingmambo | €5,000 |
| Rubaiyat | Areion | Lomitas | €4,500 |
| Assistent | Sea The Moon | Kallisto | €4,500 |
| Amaron | Shamardal | Bertolini | €4,500 |
| Best of Lips | The Gurkha | Silver Frost | €4,500 |
| Guiliani | Tertullian | Monsun | €4,500 |
| Destino | Soldier Hollow | Platini | €4,000 |
| Windstoss | Shirocco | Sternkönig | €4,000 |
| Earl of Tinsdal | Black Sam Bellamy | Dashing Blade | €4,000 |
| Nerik | Ruler of the World | High Chaparral | €3,999 |
| Amarillo | Holy Roman Emperor | Royal Academy | €3,000 |
| Waldpfad | Shamardal | Mark of Esteem | €3,000 |
| Alter Adler | Adlerflug | Peintre Celebre | €2,500 |
| Lucky Lion | High Chaparral | Big Shuffle | €2,500 |
| Northern Ruler | Ruler of the World | Monsun | €2,200 |
(이름 미확인 2행 — Medicean × Sadler's Wells €3,000, Camelot × Dubawi €2,500 — 은 사용자 답을 받은 뒤 따로 추가한다. 이번엔 넣지 않는다.)

## 할 일
1. **새 종마 23두** — data/stallions/stallions.json 에 기존 스키마 그대로(예: stl_sea_the_moon 레코드). 고정값: status 'active', standsIn 'DE', studRole 'flat', surfaceProfile 'turf'.
   - marketTier: 종부료를 TIER_FEE{1:150,000, 2:60,000, 3:30,000, 4:12,000, 5:6,000} 중 **로그 거리가 가장 가까운 등급**으로(예: 20,000 → 3, 9,500 → 4, 7,500 → 5, 2,200 → 5). 표에 종부료와 정한 등급을 남긴다.
   - foaled, countryOfBirth, coatColour, distanceProfile 은 위키백과(영어·독일어)로 채운다. distanceProfile 은 기존 값 체계(speed·mile·middle·classic·staying 등 — 파일의 실제 값 목록을 확인해 그 안에서)로, 대표 우승 거리 기준. 확인 못 한 값은 confidence 'low' 로 두고 _review.md 확인 필요 표에 올린다.
   - sireKey·damsireKey: 위 표의 부·외조부. key 규칙은 기존과 같다(stl_ + 소문자 영문·밑줄, 움라우트는 ae/oe/ue 가 아니라 기존 파일 규칙 확인 — 예: Sternkönig).
   - sireLineId: 부의 sireLineId 를 따른다(부가 새로 추가되는 조상이면 그 조상의 부계를 따라 기존 계통에 잇는다).
2. **조상 레코드** — 부·외조부 중 데이터에 없는 말을 status 'historical'(사망) 또는 'pensioned'(생존·은퇴)로 추가: Adlerflug, Toylsome, Jukebox Jury, Lord of England, Redoute's Choice, Snippets, Areion, Lomitas, Kallisto, Bertolini, The Gurkha, Silver Frost, Tertullian, Soldier Hollow, Platini, Shirocco, Sternkönig, Black Sam Bellamy, Dashing Blade, Ruler of the World, High Chaparral, Royal Academy, Peintre Celebre, Big Shuffle.
   - 부계 사슬이 기존 레코드에 닿을 때까지 그 조상의 부도 추가(예: Adlerflug → In the Wings → Sadler's Wells, Areion → Big Shuffle → Super Concorde …). 사슬이 너무 길면(4대 이상 새 레코드) _review.md 에 적고 가장 가까운 기존 계통에 sireLineId 로만 잇는다.
   - 조상의 damsireKey 는 데이터에 있으면 연결, 없으면 null(조상의 외조부까지 새로 만들지 않는다).
   - 비현역 조상은 M2-03 규칙대로 lastCoverYear(은퇴 연도가 분명하면 은퇴 연도, 아니면 사망 연도)도 넣는다. 모르면 생략.
3. **이름** — data/stallions/names.json 에 새 레코드 이름 추가(기존 형식).
4. **계통** — 새 계통이 꼭 필요하면 sire_lines.json 에 추가(기존 형식, parentLineId 연결). 가능하면 기존 계통 사용.
5. data/stallions/_review.md 에 'M2-10' 절: 추가 표(이름·생년·털색·거리·등급·근거), 확인 필요 목록.

## 수용 기준
1. tests/data/stallions.test.ts 통과(키 참조 무결성·스키마·부계 사슬). 새 검사 추가: DE 계류 active ≥ 23두, 새 23두의 sireKey·damsireKey 가 표와 일치(이름 → key 대조).
2. `npm test && npm run typecheck && npm run lint` 통과. 깨지는 고정 해시 테스트(부트스트랩 결과가 종마 목록에 따라 바뀌는 것)가 있으면 **고치지 말고** 목록만 보고(Opus 가 재고정).
3. 원칙 1: 실명은 종마 이름만. 다른 실명(목장·사람) 추가 금지.

## 금지
src/ 수정 금지. 위 표의 이름·부·외조부·종부료 변경 금지. git commit 금지.
