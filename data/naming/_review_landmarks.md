# 명승고적·유명 작품 이름 검수 목록 (M3-C7f1)

대상: `data/naming/landmarks.json` (명승고적 481, 작품 256). 근거 명세: `docs/specs/M3-C7f1-landmarks-works-data.md`.
모든 이름은 실제 명칭이다(가상 이름 아님). 기억으로 작성했고 웹 조회는 하지 않았다.
검사 기준: 공백 포함 18자 이하, 영문자·공백·아포스트로피·하이픈·마침표만, 보호 명단(protected.json)·종마 이름(stallions/names.json)·real_places 국가·주·도시(단어열 포함)·blockedTokens 와 겹치지 않음, 금지어 정규식 0건. 정규화는 `normalizeName`(소문자, 영문자만)과 같은 방식.

## 1. 개수

| 구분 | 개수 |
|---|---|
| 명승고적 전체 | 481 |
| - natural (자연) | 260 |
| - built (건축·유적) | 221 |
| - 유럽 외 국가 | 273 |
| 작품 전체 | 256 |
| - phrase (일반 어구) | 178 |
| - proper (고유명·지어낸 단어) | 78 |
| - book / poem / play / painting / sculpture / music / opera / ballet / song / film | 66 / 15 / 31 / 27 / 10 / 24 / 29 / 10 / 15 / 29 |

## 2. 제외한 후보와 사유

### 2-1. 명세 예시 중 제외된 것
- Golden Horn: protected.json 에 있음 (제외).
- Giant's Causeway: data/stallions/names.json 에 종마로 있음 (제외). protected.json 정규화 비교로는 걸리지 않으므로 명세의 "보호 명단" 표기와 다르다.
- Rock of Gibraltar: protected.json 에 있음 (제외).
- Matterhorn: real_places.json 의 cities 에 있음 → 명세 규칙("real_places 와 겹치는 항목은 넣지 않는다")에 따라 제외. 명세 예시와 충돌하므로 Opus 확인 필요.
- Save the Last Dance: 19자 (18자 초과) → 제외.
- Paddington: 상표 보호 캐릭터 → 제외.
- Ponte Vecchio, Swan Lake, Hamlet 등 명세 예시 나머지는 포함.

### 2-2. 생성 검사에서 걸러진 후보
- 보호 명단: Rialto (landmark), Stardust, Summertime, Imagine (song)
- real_places 단어 포함: Tower of London ("London"), Gateway of India ("India")
- 아래는 기억 단계에서 목록에 넣지 않고 걸러낸 후보다(파일 생성 스크립트 밖의 판단).
  - 실제 지명과 겹침: Blue Danube (Danube), Brandenburg Gate (Brandenburg), Mount Kenya (Kenya), Lake Victoria (Victoria), Brazil (film, 국가명), Casablanca (도시), Sydney Opera House (Sydney), Lake Chad (Chad), Rhine Falls (Rhine), Dover Beach (Dover)
  - 종교 성지·종교 인물: Mount Athos, Western Wall, Angkor Wat, Potala Palace, Meteora, Montserrat, Skellig Michael, Godafoss, Lalibela, Pantheon(보호 명단), Messiah, Parsifal, Saint Joan, Amazing Grace, Hagia Sophia, Borobudur, Prambanan, Mount Tai, Kata Tjuta, Tongariro, Mauna Kea 등
  - 전쟁·재난·학살: Auschwitz, Chernobyl, Hiroshima, Nagasaki, Masada, Guernica, Port Arthur, Robben Island, Gorée, Chittorgarh, Troy (Trojan War), Bletchley Park, Cu Chi, Palmyra, Alamo, Gettysburg, Aokigahara
  - 정치인·군주·실존 인물 이름이 들어간 명칭: Burghley House, Caracalla, Hadrian's Wall, Burj Khalifa, Sforza Castle, Vauban, Umaid Bhawan, Victoria Memorial, Balmoral, Lake Louise, Mount Logan, Perito Moreno, Cabot Trail, Mount Whitney, Mount Hood, Christina's World, Mona Lisa, Macbeth, Julius Caesar, Coriolanus, Pericles, Kreutzer Sonata, Radetzky March, Battleship Potemkin, Rebecca(작가 1989 사망), Lolita(작가 1977 사망), Dracula(실존 인물 연결)
  - 상표·브랜드·회사: Space Needle, Chrysler Building, Little Mermaid, Belvedere, Tivoli, Petronas Towers, Marina Bay Sands, Firebird, La Mer, Moulin Rouge, Spirit of Ecstasy, Tatra, Byblos, Falstaff, Alcatraz(교도소 명칭이라 보류)
  - 금지어: Medina, Nike of Samothrace (Nike 포함), Coca, Lego, Disney 계열
  - 작품(작가 1956년 이후 사망인데 고유명 제목): Rashomon, Citizen Kane, Shane, Doctor Zhivago, Howards End, Dr No, Strangelove, Petrushka
  - 명목상 전쟁·학살 연관으로 뺀 것: Blenheim Palace (블레넘 전투 명칭), Lion Monument (1792 튈르리 학살 추모 기념물)
  - 기타: Venus de Milo, Winged Victory, Discobolus (기원전 연도라 정수 연도 형식에 맞지 않음), Finlandia (1956년 이후 사망 작곡가·고유명 제목), Biltmore 는 포함했으나 브랜드 혼동 여부 확인 필요
  - 18자 초과 제목: Pride and Prejudice, Crime and Punishment, Measure for Measure, A Tale of Two Cities, Lucia di Lammermoor, Impression, Sunrise (쉼표 포함), Waiting for Godot(검토 후 제외)

## 3. 사실 확인이 필요한 항목 (기억 기반, 50개 이하)

작가 사망 연도·발표 연도 중 확신이 낮은 것:
1. The Birth of Venus (Botticelli) — 1485 로 기록. 제작 연도가 1484~1486 사이로 알려져 있음.
2. The Card Players (Cézanne) — 1892 로 기록. 제작 기간이 1890년대 초로 넓음.
3. Toccata and Fugue (Bach) — 1704 로 기록. 작곡 연도 불확실.
4. Balloon Dog (Koons) — 1994 로 기록. 시리즈 첫 제작 연도.
5. Water Lilies (Monet) — 1906 으로 기록. 시리즈 제작 기간(1897~1926) 중 대표 연도.
6. The Scream (Munch) — 1893 으로 기록. 여러 버전이 있음.
7. Giselle — creatorDeathYear 1856 (Adolphe Adam 사망 연도). 확인 필요.
8. Clair de Lune — 1905 (악보 출판 연도) 로 기록.
9. Sea Pictures — 1899 (초연 연도) 로 기록.
10. Walden — proper 로 분류했다(지명·호수 이름). 사망 연도 1862(Thoreau). 분류가 phrase 로 바뀔 수 있음.
11. Pilgrim's Progress — 1678 (1부 출판) 로 기록.
12. Creator death year 전반: Millais 1896, Shaw 1950, Wilde 1900, Joyce 1941, Woolf 1941 등은 확신이 높지만 Opus 가 한 번 확인하면 좋다.
13. Hanging Gardens (IQ) — 전설 속 구조물. 존재 자체가 불확실하므로 명승고적 목록에서 빼도 된다.

제목 축약 (원제와 다름, 18자 제한 때문):
14. Ancient Mariner (원제 The Rime of the Ancient Mariner)
15. Three Musketeers (원제 The Three Musketeers)
16. Jungle Book (원제 The Jungle Book)
17. Lady of Shalott (원제 The Lady of Shalott)
18. Glass Menagerie (원제 The Glass Menagerie)
19. Thirty-Nine Steps (원제 The Thirty-Nine Steps, 1935 영화)
20. La Boheme (원제 La Bohème), Gymnopedies (Gymnopédies), La Bayadere (La Bayadère), Cosi fan tutte (Così fan tutte), Besame Mucho (Bésame Mucho), Elixir of Love (L'elisir d'amore 의 영문 제목), Night Cafe (Café de nuit)
21. Die Fledermaus, Les Miserables (Les Misérables), Les Sylphides, Le Corsaire — 프랑스어·독일어 제목 원문 표기 (악센트 제거).

분류 판단:
22. Gulliver's Travels, Robinson Crusoe, Frankenstein, Candide 등 (고유명 제목 proper). 작품 제목이 인물명 또는 지어낸 이름인지 확인 필요.
23. Scheherazade (proper, 인물명). Peter and the Wolf (proper, 인물명 포함).
24. Lycidas, Evangeline, Christabel, Lucy Gray 등 시의 인물명 제목.

## 4. 기타 메모
- 이 목록의 이름은 실명(실제 명승고적·작품)이다. 가상 이름 목록(data/_names_review.md)에는 추가하지 않았다. 명세 예외(사용자 결정 2026-10-11, 2026-10-12)에 따라 경주마 이름으로만 쓰인다.
- 역사 인물 사망 연도 규칙: 사망 연도 기준 1956 이하(70년 이상 경과)만 proper 로 쓴다. 이 기준을 적용하지 않은 작품 제목은 phrase 로만 두었다.
- 종마 이름과 겹치는 제목은 제외했다(예: Giant's Causeway, Golden Horn, Ulysses, Caro, Paddington, Halo 등 stallions/names.json 기준).
- 생성기(M3-C7f2) 연결 전이므로 landmarks.json 은 아직 엔진에서 읽지 않는다.

## 5. Opus 검수 (2026-10-12)
- Porgy and Bess 제거: 공동 작사가 Ira Gershwin(1983 사망)이 70년 기준에 걸림.
- Matterhorn 은 real_places.json 에 이미 있어 장소 출처로 쓰인다 — 제외 그대로.
- Hanging Gardens 유지(일반 어구 성격). 확인 필요 목록(§3)은 연도·분류 표기 수준이라 70년 규칙 판정에 영향 없음 — 사용자 확인 생략.
- 실명 항목이라 data/_names_review.md(가상 이름 목록)에는 올리지 않는다.
