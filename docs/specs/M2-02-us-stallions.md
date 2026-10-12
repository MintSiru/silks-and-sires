# M2-02 미국 종마 추가 (2026 북미 리딩 사이어 상위 50위 미수록분)

담당: haiku-data · 근거: 사용자 결정(2026-10-12) — 사용자 제공 2026 북미 리딩 사이어 화면의 상위 50위 중 미수록 종마를 위키백과로 채워 넣는다. BloodHorse 는 약관상 접속·수집하지 않는다.

## 추가할 현역 종마 23두 (부·생년은 사용자 화면 기준, 위키백과로 확인)
| 이름 | 부 | 생년 | 계류(standsIn) | marketTier |
| --- | --- | --- | --- | --- |
| Vekoma | Candy Ride | 2016 | US | 2 |
| Liam's Map | Unbridled's Song | 2011 | US | 3 |
| Omaha Beach | War Front | ? | AU | 2 |
| Twirling Candy | Candy Ride | 2007 | US | 2 |
| Maclean's Music | Distorted Humor | 2008 | US | 3 |
| Yaupon | Uncle Mo | 2017 | US | 2 |
| Oscar Performance | Kitten's Joy | 2014 | US | 2 |
| McKinzie | Street Sense | 2015 | US | 2 |
| Goldencents | Into Mischief | ? | US | 4 |
| Authentic | Into Mischief | 2017 | US | 4 |
| Mitole | Eskendereya | 2015 | US | 4 |
| Volatile | Violence | 2016 | US | 4 |
| Kantharos | Lion Heart | 2008 | US | 4 |
| Cairo Prince | Pioneerof the Nile | 2011 | US | 4 |
| Audible | Into Mischief | 2015 | US | 5 |
| Upstart | Flatter | 2012 | US | 4 |
| Dialed In | Mineshaft | 2008 | US | 4 |
| Maximus Mischief | Into Mischief | 2016 | US | 4 |
| Flameaway | Scat Daddy | 2015 | US | 4 |
| Collected | City Zip | 2013 | US | 5 |
| Tapiture | Tapit | 2011 | CA | 5 |
| The Factor | War Front | ? | US | 5 |
| American Pharoah | Pioneerof the Nile | 2012 | US | 2 |
- American Pharoah: 2025~2026 일본 단기 임대, 2027 미국 복귀(사용자 결정) → `"availableFromYear": 2027` (타입은 Opus 가 추가함).
- marketTier 는 2026 종부료 대역으로 Opus 가 정함(≥$150k 1, $60k~149k 2, $25k~59k 3, $10k~24k 4, <$10k 5). 바꾸지 않는다.

## 새로 필요한 조상 (부계 사슬을 기존 레코드에 잇기 위해)
- 데이터에 없는 부: War Front, Kitten's Joy, Eskendereya, Lion Heart, Pioneerof the Nile, Flatter, City Zip.
- 이 부들의 부를 위키백과로 따라 올라가 **기존 레코드에 닿을 때까지** 조상 레코드를 추가한다(예: Pioneerof the Nile → Empire Maker → …). 사슬마다 새 조상은 최소로. 새 조상은 status historical 또는 pensioned(위키백과 기준), standsIn null.
- 외조부(damsire): 23두와 새 조상 모두 위키백과 인포박스의 damsire 가 **기존 레코드나 이번에 추가하는 레코드에 있으면** 그 키를 넣고, 없으면 null(외조부만을 위해 새 레코드를 만들지 않는다). 단, 현역 종마 중 damsireKey 비율 ≥ 60% 기존 테스트를 지킨다.
- 기존 레코드 Not This Time·Quality Road·City of Light 의 외조부(Trippi·Strawberry Road·Dehere)는 이번에 그 말이 다른 이유로 추가될 때만 채운다.

## 필드 규칙 (기존 data/stallions/stallions.json 형식 그대로)
- key: `stl_` + snake_case. names.json 에 표시 이름. countryOfBirth: 위키백과 출생국.
- sireLineId: 기존 계통 규칙(부와 같은 계통이거나 자기 계통의 parentLineId 가 부의 계통). 새 계통은 꼭 필요할 때만, 하위 계통 총수 ≤ 35(테스트).
- distanceProfile(speed·classic·middle·cup): 위키백과의 주요 승리 거리로 — 1400m 이하 위주 speed, 1600~2000 classic, 2000~2400 middle, 2800 이상 cup. surfaceProfile: 주 출주 표면(dirt·turf·both).
- coatColour: 인포박스 colour(bay·brown·chestnut·grey·black·roan). 'dark bay or brown' 은 brown.
- confidence: 위키백과로 부·생년·외조부를 모두 확인하면 high, 일부면 medium.
- studRole: flat.

## 위키백과 조회 방법
- `https://en.wikipedia.org/w/index.php?title=<제목>&action=raw` 로 원문만 받는다. 요청 간격 3초 이상, 429 가 나면 30초 쉬고 재시도.
- 동명 말이 있으므로 출생연도로 같은 말인지 확인(예: "Kingman (horse)" 함정). 문서가 없거나 확인이 안 되는 값은 _review.md 의 '확인 필요' 표에 올린다(추측 금지).
- 스크립트·내려받은 원문은 저장소 밖(/tmp 아래)에 둔다.

## 생성·수정할 파일
- data/stallions/stallions.json, names.json, sire_lines.json(필요 시), _review.md(새 절: 추가 목록·출처·확인 필요 표)
- tests/data/stallions.test.ts — 새 종마 23두가 있고 availableFromYear 는 American Pharoah 만 2027 인지 검사 1개 추가

## 수용 기준
1. 23두와 필요한 조상이 추가되고, 기존 stallions·breedingData·naming 데이터 테스트가 통과한다(이름 보호 목록·종마 이름 충돌 포함).
2. 모든 새 레코드에 coatColour 가 있다(확인 불가면 확인 필요 표에 올리고 Opus 가 사용자에게 묻는다).
3. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지(테스트 파일 제외). 종부료 숫자·목장 이름·사람 이름 저장 금지. 기존 레코드의 status·marketTier 변경 금지(Opus 가 정정함). git commit 금지.
