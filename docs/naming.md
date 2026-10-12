# 경주마 명명 규칙과 이름 생성 설계

작성: Opus · 2026-10-11 · 관련 명세: [M2-12](specs/M2-12-naming-data.md), [M2-13](specs/M2-13-name-generator.md)

## 1. 결론

유명 경주마의 이름은 **출처(어디서 따왔나)**와 **구조(어떻게 짰나)** 두 축으로 분류된다. 게임의 이름 생성기는 이 두 축을 그대로 `출처 어휘 사전 × 구조 템플릿`으로 구현하고, 실제 등록 규칙(18자·7음절·기호 금지·보호 명단)으로 걸러 낸다. 가장 중요한 기능은 부모 이름에서 단어를 이어받는 **혈통 연상 추천**이다.

## 2. 출처별 분류 (1990~2020년대 유명마 조사)

| 출처 | 실제 예시 | 특징 | 게임 내 처리 |
| --- | --- | --- | --- |
| 혈통 연상 | Urban Sea의 자식: Urban Ocean, Sea The Stars, Sea's Legacy, Born to Sea / Selection Board → Ouija Board → Voodoo Prince / 아비 Stay Gold → Orfevre(프랑스어 '금세공사') | 부모 이름의 단어·이미지를 이어받아 가계가 보임 | `pedigree`: 부모 이름 키워드 + 연상어 사전 |
| 인물 헌정 | Frankel(조교사 바비 프랭클), Galileo, Churchill, Auguste Rodin | 역사·업계 인물 | `tribute`: **게임 속 가상 인물만** 사용(은퇴한 명조교사·명기수) |
| 지명·명소 | Rock of Gibraltar, Giant's Causeway, Gleneagles, Australia | 웅장함·출신지 | `place`: 국가명 + 일반 지형어(Highland, Harbour 등), 가상 지명 |
| 대중문화 | Zenyatta(The Police 앨범명) | 마주 개인의 사연 | `culture`: 실제 작품명 금지, 일반적인 음악·문학 용어만 |
| 외국어 단어 | Orfevre(프), Treve(프 '휴전'), Duramente(이탈리아어 음악 용어) | 뜻보다 어감 | `foreign`: 프·이·독 단어 사전 |
| 추상어·동사 | Enable, Justify, Authentic, Workforce | 짧고 강한 한 단어 | `abstract` |
| 마주 고유 어감 | 아가 칸: Sinndar, Dalakhani, Zarkava, Harzand / 섀드웰: Baaeed, Battaash | 이름만 봐도 마주를 알 수 있음 | `ownerStyle`: 음절 조합 생성기(실존 단어 아님) |
| 관명(冠名) 접두 | 메이쇼〜, 사쿠라〜, 나리타〜, 기타산〜 | 일본식 마주 브랜드 | `prefix` 템플릿: 플레이어·AI 마주가 접두어 설정 가능 |

## 3. 구조별 분류 (템플릿)

| 템플릿 ID | 구조 | 실제 예시 | 생성 패턴 |
| --- | --- | --- | --- |
| `single` | 한 단어 | Frankel, Enable, Baaeed | `{abstract}` / `{foreign}` / `{syllables}` |
| `modifierNoun` | 수식어 + 명사 | Golden Horn, Deep Impact, Gold Ship | `{modifier} {noun}` |
| `possessive` | 소유격·전치사구 | Giant's Causeway, Rock of Gibraltar | `{noun}'s {noun}` / `{noun} of {place}` |
| `phrase` | 문장·구절 | Sea The Stars, So You Think, I'll Have Another | `{verb} The {noun}` / `Born to {noun}` |
| `prefix` | 접두어 + 단어 | 기타산 블랙 | `{ownerPrefix} {noun}` |
| `joined` | 3~4단어 구절을 띄어쓰기 없이 붙임(긴 이름 전용) | 붙여 쓰기 예: Ridetheopensea (가상 예시) | `{phrase}` 의 공백을 제거. 등록 규칙 18자 이내 검사 후 통과한 것만 쓴다 |

## 4. 등록 규칙 (검증기 기준)

영국 BHA 가이드라인을 기본으로 하고, 일본 JRA 규칙은 참고만 한다.

| 규칙 | 내용 | 거절 코드 |
| --- | --- | --- |
| 길이 | 공백·기호 포함 18자 이내 | `tooLong` |
| 음절 | 7음절 이내(모음 묶음 기준 근사 계산) | `tooManySyllables` |
| 문자 | 영문자·공백·아포스트로피만 허용. 숫자·하이픈·마침표 등 금지 | `invalidChars` |
| 이니셜 | 이니셜만으로 된 이름 금지(예: "J P R") | `initialsOnly` |
| 숫자 접미 | 이름 뒤 숫자 금지 | `endsWithNumber` |
| 보호 명단 | 국제 보호 명단 성격의 유명마 이름 금지(대소문자·공백 무시 비교) | `protected` |
| 중복 | 등록 중인 이름 금지. 재사용 대기: 일반마 사후 5년, 번식 암말 10년, 종마 15년 | `taken` |

참고: JRA는 로마자 18자 이내, 카타카나 표기 9자 이내다. 게임은 영문 이름만 쓰므로 카타카나 규칙은 적용하지 않는다.

## 5. 가상화 원칙과의 관계

- 실명 허용은 국가명과 종마 이름뿐이다. 생성기는 실존 인물·작품·회사·경주마 이름을 만들어서는 안 된다.
- `data/naming/protected.json`은 **실존 유명마 이름을 담을 수 있는 유일한 파일**이다. 용도는 차단 목록뿐이며, 이름 후보로 쓰지 않는다.
- 실명 종마 이름도 보호 명단과 같은 방식으로 차단해, 생성된 이름이 실명 종마와 겹치지 않게 한다.

## 6. 게임 기능

1. **이름 짓기 화면:** 망아지 등록 시 후보 5~8개를 보여 주고, 직접 입력도 허용. 직접 입력도 같은 검증기를 거친다.
2. **혈통 연상 추천:** 부모 이름에서 키워드를 뽑아(불용어 The·Of·A 제외) 연상어 사전과 조합. 추천 이유를 한 줄로 표시(예: "어미 Silver Tide의 'Tide'에서").
3. **AI 마주 개성:** 마주마다 출처·템플릿 가중치가 달라 이름만으로 마주를 짐작할 수 있다.
4. **관명 옵션:** 플레이어가 접두어를 정하면 `prefix` 템플릿 가중치가 올라간다. 접두어 포함 18자 제한은 그대로 적용.

## 출처

- [BHA Horse Naming Guidelines](https://media.britishhorseracing.com/bha/ownership/Horse_Naming_Guidelines.pdf)
- [JRA FAQ](https://japanracing.jp/_pdf/jpn-racing/jra/faq.pdf)
- [Urban Sea — Wikipedia](https://en.wikipedia.org/wiki/Urban_Sea)
- [Ouija Board — Wikipedia](https://en.wikipedia.org/wiki/Ouija_Board_(horse))
- [Frankel — Wikipedia](https://en.wikipedia.org/wiki/Frankel_(horse))
- [Zenyatta — Wikipedia](https://en.wikipedia.org/wiki/Zenyatta)
- [オルフェーヴル — Wikid](https://ja.wikid.org/%E3%82%AA%E3%83%AB%E3%83%95%E3%82%A7%E3%83%BC%E3%83%B4%E3%83%AB)

아가 칸·섀드웰·관명 사례와 Treve·Duramente의 뜻은 일반 지식에 근거한다.
