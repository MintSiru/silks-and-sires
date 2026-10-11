# 인물 이름 풀 검수 메모 (M3-B1)

Opus 검수용. 이 파일의 근거는 모델 지식에 따른 판단이며, 이름 데이터베이스나 지명 사전과 오프라인으로 대조하지 않았다.

## 1. 출처 성격

- `name_pools.json`: 각 국가에서 흔한 이름·성을 일반 지식으로 나열했다. 특정 유명인을 떠올리게 하는 드문 조합은 피했다. 실존 인물의 목록을 옮겨 적은 것이 아니다.
- 표기: 영문자·아포스트로피·하이픈·공백만 쓴다. 독일어 움라우트는 ue/oe/ae 로, 프랑스어 악센트는 제거해 썼다. 일본은 로마자 표기다.
- ZA·BR 은 CountryCode(src/engine/types/common.ts)에 없으므로 국적 표시용 문자열 키로만 쓴다.
- 일부 성은 전 세계에서 흔해 실존 인물과 겹칠 수 있다(예: Moore, Murphy, Thomas). 인물 특정이 목적이 아니므로 허용한다. 실제 경마계 인물과 겹치는 조합은 차단 목록으로 막는다(2장).

## 2. 차단 목록 작성 방식 (`blocked_names.json`)

- 현역·은퇴 유명 기수, 조교사, 마주·생산자의 성+이름 조합 171개를 모델 지식으로 적었다. 기수·조교사·마주가 섞여 있다.
- 이 파일은 차단 전용이다. 다른 데이터·코드가 이 목록을 이름 후보로 쓰면 안 된다.
- 목록의 정확성은 보장하지 않는다. 오기나 누락이 있으면 Opus가 추가·삭제한다. 실존 여부가 불확실한 이름은 넣지 않았다.
- 생성기(B2)는 `given × surname` 조합이 이 목록에 있으면 다시 뽑는다. 테스트 `name_pools` 블록의 충돌 테스트는 현재 풀에서 이런 조합이 실제로 생긴다는 것을 고정한다(현재 13건).
  - 국가별 충돌 수: GB 2, IE 4, FR 1, US 3, AU 3 (합계 13). 실제 이름은 차단 목록에만 두고 여기에는 옮기지 않았다.
  - B2 에서 이 조합을 걸러야 한다. 풀을 바꾸면 충돌 테스트 값이 0이 될 수 있다. 그때는 차단 목록과 이 메모를 함께 검토한다.

## 3. 국가별 개수

| 국가 | 남성 이름 | 여성 이름 | 성 | 지명(region_names) |
| --- | --- | --- | --- | --- |
| GB | 74 | 57 | 149 | 25 |
| IE | 64 | 48 | 136 | 27 |
| FR | 69 | 50 | 125 | 25 |
| DE | 70 | 54 | 133 | 26 |
| IT | 69 | 55 | 132 | 26 |
| US | 64 | 85 | 151 | 25 |
| AU | 65 | 51 | 137 | 27 |
| JP | 64 | 53 | 154 | 27 |
| BR | 68 | 55 | 124 | 26 |
| ZA | 64 | 52 | 141 | 28 |

- 야드 단어(`yard_words`): 81개
- 목장 접미어(`stud_suffixes`): 국가별 2~3개 (FR Haras, DE Gestüt, IT Allevamento, BR Haras·Coudelaria, JP Bokujo 등)
- 차단 목록(`blocked_names.json`): 171개

## 4. 가상 지명 원칙 (places.json)

- `region_names` 의 지명은 전부 가상 조어다. 실제 도시·마을 이름을 쓰지 않았다는 원칙을 따른다.
- 조어 방식: 국가별 지명 어미(영국 -mere/-moor, 프랑스 -ac/-ne 류, 독일 -rode/-hain, 일본 -mori/-kage, 브라질 포르투갈어 조합, 남아공 -kloof/-vlei 등)를 붙여 만들었다.
- 한계: 이 작업에서는 지명 사전과 대조하지 못했다. 드문 조어라도 실제 소도시·농장 이름과 우연히 같을 수 있다. 특히 IE·FR·ZA·DE 의 조어는 실제 지명과 겹칠 가능성이 있어 확인이 필요하다.
- 테스트는 주요 도시·경마 소재지 이름을 담은 소규모 대조 목록(`tests/data/people.test.ts`)과의 전체 단어 일치만 검사한다.
- 이 작업 중 실제 이름일 가능성이 있다고 판단해 뺀 후보: Hellbrunn Park, Nooitgedacht Park, Wallangarra Vale, Tomisato Vale, Shiraoka Heights, Carrowmore Vale, Drumcarra Glen, Brightwater Flats, Kanowna Ridge, Montaubrac, Hainfeld, Bellomonte, Ayanami, Brisbourne, Kilmoran Park, Murrumbee Flats, Kiepersol Vlei, Riverbend Stud Road, Serraglio.
- 확인 필요 목록(실제 지명과 겹칠 수 있어 Opus 확인 권장): Cahernoe, Dromalin, Lisnabrack, Cloonmara, Killeahan, Brevalle, Rivanel, Sablaunes, Falkendorf, Lindenfeld, Sternwalde, Bergenfeld, Kaltenhain, Weidental, Lucerano, Santarenza, Glenwick, Haverly, Stormlake, Larkspur Ridge, Cobalt Ridge, Campina Alta, Monte Rubi, Vale Esmeralda, Doringkloof, Klipdraai, Rietkloof, Witrand, Kareehoek, Bindarra, Gunnabeck, Coorabin, Barrambi.

## 5. 야드·목장 재료

- 야드 단어는 영어 일반명사(Hollow, Lodge, Barn 등)와 자연어(Willow, Heron 등)만 썼다. 실제 유명 야드 이름(Warren Place 류)은 넣지 않았다.
- 목장 접미어는 Stud, Farm, Haras, Gestüt, Allevamento 처럼 국가별 일반어다. 실제 목장 이름은 쓰지 않았다.

## 6. 남은 위험

- 실존 인물 차단 목록은 모델 지식으로 만들었다. 누락이 있을 수 있다.
- 지명 조어는 실제 지명과 대조하지 못했다.
- JP 성 Fukushima 는 실제 지명과 같은 철자지만 일본에서 흔한 성이므로 유지했다. 문제가 되면 Opus가 뺀다.
