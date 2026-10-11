# M2-04 배합 데이터: 닉스 표 · 말 이름 단어장 · 코멘트 문장(한국어)

담당: haiku-data · 선행: M2-01(sire_lines.json)

## 생성할 파일
1. `data/breeding/nicks.json` — `NickEntry[]` (src/engine/types/breeding.ts)
2. `data/names/horse_words.json` — `{ "adjectives": string[], "nouns": string[] }`
3. `data/text/comments.ko.json` — `Record<CommentKey, string[]>` (키마다 문장 2~3개)
4. `data/_names_review.md` — 기존 파일 맨 아래에 "## 말 이름 단어장" 절 추가(단어 목록과 검토 근거 요약)
5. `tests/data/breedingData.test.ts`

## 1) nicks.json
- sireLineId·damsireLineId 는 `data/stallions/sire_lines.json` 의 id 만. 같은 (sire, damsire) 쌍 중복 금지. 같은 계통끼리(sire = damsire)도 허용.
- **현역 종마가 있는 계통** 위주로 40~60개 쌍. 표에 없는 쌍은 엔진이 0(중립)으로 본다.
- value 분포(대략): +0.5 이상 15%, +0.2~0.5 25%, -0.2~+0.2 40%, -0.2 이하 20%. 범위 -1~+1, 소수 2자리.
- knownAtStart: 약 30% 를 true. **잘 알려진 실제 니크스 경향**은 true 로 두고 양수로: Sadler's Wells 계 × Danehill 계(+0.8), Sadler's Wells 계 × Danzig 계(+0.5), Dubawi 계 × Sadler's Wells 계(+0.5), Storm Cat 계 × Mr. Prospector 계(+0.4), A.P. Indy 계 × Mr. Prospector 계(+0.5). 나머지 값은 게임용 가상 값이다(_review.md 불필요).
## 2) horse_words.json
- adjectives 150개, nouns 200개, 영어, 각 단어 2~10자, 중복 없음. 조합 "Adj Noun" 이 경주마 이름처럼 들리게(색, 날씨, 자연, 금속, 문학적 어휘 등).
- 단어 자체가 유명 경주마·종마 이름이 되면 안 된다(예: Frankel, Galileo, Enable 금지). 조합 결과까지 전부 검사할 수는 없으므로 단어 단위로만 주의.
## 3) comments.ko.json
- 키: `COMMENT_KEYS` (src/engine/types/breeding.ts) 전부, 그 외 키 금지. 키마다 한국어 문장 2~3개.
- 말투: 조교사·평가자가 마주에게 말하는 자연스러운 존댓말, 1문장, 40자 이내, 숫자 금지(능력치 비공개 원칙). 예) speed_exceptional: "이 녀석 발이 정말 빠릅니다.", "스피드만큼은 동세대 최고 수준입니다."
- 실명(사람·목장·레이스) 금지.

## 5) tests/data/breedingData.test.ts
1. nicks: 모든 line id 존재, 쌍 중복 없음, value ∈ [-1, 1], 개수 40~60, knownAtStart 비율 20~40%, 위의 5개 유명 쌍이 knownAtStart true·value > 0.
2. words: 개수, 중복 없음, 길이 2~10, 영문자만(공백·숫자 없음, 하이픈·아포스트로피 허용).
3. comments: 키 집합 = COMMENT_KEYS, 문장 2~3개, 각 40자 이하, 숫자(0-9) 없음.

## 금지
- src/ 수정 금지. 다른 data 파일 수정 금지(_names_review.md 는 끝에 추가만).

## 테스트 명령
`npx vitest run tests/data/breedingData.test.ts && npm run typecheck && npm run lint`
