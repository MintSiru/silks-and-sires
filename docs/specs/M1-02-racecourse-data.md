# M1-02 가상 경마장 4곳 + 샘플 레이스 + 이름 사전 (데이터)

담당: haiku-data · 선행: 없음 (타입만 사용)

## 목적
M1 레이스 데모에 필요한 정적 데이터(JSON)를 만든다. 경마장 지오메트리는 아래 수치를 **그대로** 옮긴다(Opus 설계). 이름은 가상화 규칙을 지킨다.

## 생성할 파일
1. `data/racecourses.json` — `Racecourse[]` (src/engine/types/course.ts)
2. `data/races.json` — `Race[]` (src/engine/types/race.ts)
3. `data/names.json` — 이름 사전 (아래 스키마)
4. `data/_names_review.md` — 만든 고유명사 전체 목록 + 실명과 겹치지 않는다고 판단한 근거 1줄씩
5. `tests/data/data.test.ts` — 아래 수용 기준을 검사하는 Vitest

## 1) data/racecourses.json (4곳, 수치 그대로)
공통: 모든 `rise` 단위 m, `length` 단위 m. 곡선 길이 345.575 = π×110, 691.150 = π×220.

### (1) `ashcombe` — "Ashcombe", GB, turf, handedness "left", undulation 0.9, drainage 0.6
- layout `ashcombe_main`: label "Main Course", handedness "left", closed false, width 26
  segments (순서대로, 마지막 끝 = 결승선):
  1. straight 450, rise 12
  2. bend 300, radius 250, turn left, rise 6
  3. straight 500, rise -4
  4. bend 450, radius 280, turn left, rise -18
  5. straight 350, rise -6
  6. straight 450, rise 4
- distances (모두 ashcombe_main): 1006, 1207, 1609, 2012, 2414

### (2) `marlow_downs` — "Marlow Downs", GB, turf, handedness "straight", undulation 0.4, drainage 0.8
- layout `marlow_straight`: label "Straight Course", handedness "straight", closed false, width 36
  segments: straight 800 rise -6 / straight 700 rise 2 / straight 312 rise -6 / straight 200 rise 5
- layout `marlow_round`: label "Round Course", handedness "right", closed false, width 30
  segments: straight 600 rise 0 / bend 500 radius 300 turn right rise 0 / straight 1000 rise -3 / bend 400 radius 260 turn right rise 2 / straight 900 rise 1
- distances: 1006, 1207, 1408, 1609, 2012 → marlow_straight / 2414, 3219 → marlow_round

### (3) `saint_ourens` — "Saint-Ourens", FR, turf, handedness "right", undulation 0.1, drainage 0.5
- layout `saint_ourens_grande`: label "Grande Piste", handedness "right", closed **true**, width 30
  segments: straight 150 rise 0 / bend 691.150 radius 220 turn right rise 2 / straight 750 rise 0 / bend 691.150 radius 220 turn right rise -2 / straight 600 rise 0
- distances (프랑스식 미터 단위): 1600, 2000, 2400, 3000 → 모두 saint_ourens_grande

### (4) 아일랜드 올웨더 코스 — 이름은 네가 만든다
- id 는 이름을 snake_case 로. country IE, surface "aw", handedness "left", undulation 0, drainage 1
- 이름 규칙: 아일랜드 지명 형태의 **가상** 이름 + " Park" (예시 형태만 참고: "Ballinvar Park"). 실제 아일랜드 경마장(Dundalk, Leopardstown, Curragh, Fairyhouse, Punchestown, Galway, Navan, Naas, Cork, Limerick, Tipperary, Gowran Park, Killarney, Listowel, Tramore, Wexford, Down Royal, Downpatrick, Sligo, Roscommon, Ballinrobe, Bellewstown, Clonmel, Kilbeggan, Laytown, Thurles 등)과 같거나 비슷한 이름 금지. 실제 아일랜드 마을 이름 그대로도 피한다.
- layout `<id>_oval`: label "Tapeta Oval", handedness "left", closed **true**, width 22
  segments: straight 50 rise 0 / bend 345.575 radius 110 turn left rise 0 / straight 400 rise 0 / bend 345.575 radius 110 turn left rise 0 / straight 350 rise 0
- distances: 1006, 1207, 1408, 1609, 2012, 2816 → 모두 `<id>_oval`

## 2) data/races.json (12개 = 경마장당 3개)
- 각 경마장의 distances 목록에 있는 거리만 사용.
- 경마장마다: 그룹 레이스 1개(G1/G2/G3 중) + 리스티드 또는 클래스 2~3 핸디캡 1개 + 메이든(클래스 4~5) 1개. AW 코스는 그룹 대신 리스티드("L") 1개.
- 필드 규칙: `kind` 와 `grade` 일치(group→G1~G3, listed→"L", 그 외 grade null). group/listed 는 raceClass 1. handicap 은 ratingMin/ratingMax 지정(예: 0~85, 0~95), weightSystem "handicap". 그 외 ratingMin/Max null, group/listed/maiden 은 weightSystem "wfa". baseWeightLb: 126(3세 이상) 또는 129(고마령 그룹). minAge 2~4, maxAge null 또는 같은 값. sex 는 대부분 "open", 2개 이상 "fillies_mares".
- prizeMoney: 유로 정수 배열, 길이 4~6, 내림차순. 대략 G1 300,000+ / G2 150,000 / G3 80,000 / L 50,000 / 핸디캡 20,000~40,000 / 메이든 8,000~12,000 (1착 기준).
- maxRunners: 10~20 (AW 는 14 이하).
- id: `<racecourseId>_<snake>` 형태. 
- **이름 규칙:** 경마장 이름 또는 가상 지명/가상 인물·가상 후원 없는 일반어 + Stakes/Handicap/Maiden Stakes/Mile/Cup/Trophy/Prix 등. 프랑스는 "Prix de/du/des …" 형태 가능(가상 지명·일반 명사로). 
  **금지 단어:** Derby, Oaks, Guineas, Leger, Arc, Triomphe, Jockey Club, Diane, Eclipse, Sussex, Coronation, King George, Queen Elizabeth, Queen Anne, St James, Ascot, Epsom, Newmarket, Goodwood, York, Doncaster, Longchamp, Chantilly, Deauville, Curragh, Leopardstown, Irish Champion, Nunthorpe, July Cup, Ebor, Cesarewitch, Cambridgeshire, Lincoln, Gold Cup, Breeders, Juddmonte, Coolmore, Godolphin, Darley, Tattersalls, Goffs, Arqana, Qipco, 기타 실제 후원사·인물명.

## 3) data/names.json
```json
{
  "horses": ["…80개…"],
  "jockeys": ["…30개…"],
  "owners": ["…30개…"]
}
```
- horses: 18자 이내(공백 포함), 영어 단어 조합의 경주마 이름. 서로 중복 없음. 유명 실제 경주마·종마 이름과 같으면 안 된다(예: Frankel, Galileo, Sea The Stars, Enable, Dubawi, Nijinsky 등은 금지 — 종마 실명은 M2 별도 데이터로만).
- jockeys: "이름 성" 형태, 영국·아일랜드·프랑스 이름 혼합. 실제 기수 이름 금지(확신 없으면 다른 조합).
- owners: 가상 인명 또는 가상 법인/목장명(예 형태: "Hollowmere Racing", "Kilbeggan Vale Stud" 같은 구조 — 그러나 이 두 예시는 기획서에 있는 이름이므로 사용 가능). 실제 마주·목장·회사명 금지.

## 4) data/_names_review.md
표: `| 구분 | 이름 | 근거 |`. 경마장 4, 레이스 12, 말 80, 기수 30, 마주 30 전부.

## 5) tests/data/data.test.ts (Vitest, node 환경)
`import racecourses from '../../data/racecourses.json'` 처럼 JSON import 사용. 타입 단언 `as Racecourse[]`.
검사:
1. 경마장 4곳, id 중복 없음, 잔디 3·AW 1.
2. 모든 distances 의 layoutId 가 그 경마장 layouts 에 존재. closed=false 레이아웃은 segments 길이 합 >= 그 레이아웃을 쓰는 최대 거리.
3. bend 는 radius>0 이고 turn 이 레이아웃 handedness 와 같음. straight 에는 radius/turn 키가 없음. handedness "straight" 레이아웃에는 bend 없음.
4. closed=true 레이아웃: rise 합 = 0(±0.01), bend 각도 합(length/radius) = 2π (±1%).
5. 레이스 12개, id 중복 없음, racecourseId 존재, distance 가 그 경마장 distances 에 있음, kind/grade/raceClass 규칙 준수, prizeMoney 내림차순 정수.
6. names: horses 80/jockeys 30/owners 30 개, 각 목록 중복 없음, horses 는 18자 이하.
7. 금지 단어 검사: races·racecourses·names JSON 전체 문자열에 위 금지 단어 목록(대소문자 무시)이 하나도 없다. 금지 목록은 테스트 파일 안 배열로 정의.

## 금지 사항
- src/ 아래 파일 수정·생성 금지. 공용 타입 수정 금지. 새 패키지 금지.
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/data/data.test.ts && npm run typecheck && npm run lint`
