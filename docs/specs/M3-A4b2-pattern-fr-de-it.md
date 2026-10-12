# M3-A4b2 G2·G3·리스티드 + 헤리티지 핸디캡 — 프랑스·독일·이탈리아

담당: haiku-data · 선행: M3-A4a 승인, 873091c · 근거: docs/race-calendar-plan.md 5장

## 목적
프랑스·독일·이탈리아의 G1 아래 블랙타입 경주와 헤리티지 핸디캡을 고정 일정 데이터로 만든다.

## 공통 규칙
docs/specs/M3-A4b1-pattern-gb-ie.md 의 "공통 규칙" 1~10 을 그대로 따른다(형식, 경로, 잔디 시즌, 한 개최일 최대 10개, cardOrder 규칙 — g1.json 은 수정하지 않고 10 의 배수가 아닌 값으로 끼움, kind·등급, 상금, maxRunners, tags, 이름). 프랑스 거리는 경마장 distances 의 미터 정수.

## 이번 티켓 범위
- 파일: `data/calendar/pattern_fr_de_it.json`(지금 `[]`), `data/calendar/_review_fr_de_it.md`(신규, 레이스별 모델 대응표 — 실명은 이 파일에만), `tests/data/pattern_fr_de_it.test.ts`(신규, 이 파일의 개수·필수 레이스·금지어 검사)
- 개수(이 파일에 새로 넣는 것): 프랑스 G2 12 · G3 16 · L 14, 독일 G2 4 · G3 6 · L 6, 이탈리아 G2 2 · G3 4 · L 4, 헤리티지 핸디캡 프랑스 1 (합 69). ±10% 허용. 독·이 클래식(이미 g1.json 에 G2·G3 로 있음)은 세지 않는다.
- 반드시 포함:
  - 가을 최고 위상 G1(Saint-Ourens 10월 1주, national_flagship)의 트라이얼 3개: Saint-Ourens 9월 2주, 모두 G2, 2,400m — 3세 open 1개, 4+ 1개, 3세 이상 암말 1개. tags ['trial'].
  - 프랑스 클래식 트라이얼: Saint-Ourens 2000/1000 Guineas 의 3~5주 전 트라이얼 각 1개 이상, Vallenaire Derby·Oaks 트라이얼 각 1개 이상(5월).
  - 프랑스 2세 G2·G3 각 3개 이상(여름 Port-Aubray, 가을 Saint-Ourens·Clairval).
  - 독일 Hohenmoor Derby 트라이얼 1개 이상(5~6월), 이탈리아 Torreverde Derby 트라이얼 1개 이상(4~5월).
  - Montvigne·Bellerive-le-Bois 에 G3 또는 L 각 2개 이상(지방 경마장도 블랙타입이 있게).
- 이름: 프랑스 "Prix <가상 고유어/자연·지명 어휘>", 독일 "Preis von <가상 지명>" 또는 "<가상어>-Rennen", 이탈리아 "Premio <가상 어휘>". 실제 레이스 이름과 같거나 한 단어만 바꾼 이름 금지, 사람 이름 금지. g1.json·pattern_gb_ie.json 과 이름 중복 금지.

## 테스트 `tests/data/pattern_fr_de_it.test.ts`
1. 이 파일의 나라·등급별 개수가 범위 안, 필수 레이스(트라이얼 3개 등) 존재.
2. 이 파일의 id·이름이 다른 캘린더 파일과 겹치지 않음.
3. 실명 금지어 정규식 0건(이 파일): longchamp|chantilly|deauville|saint-cloud|maisons|laffitte|lyon|marseille|diane|jockey club|ganay|ispahan|lupin|greffulhe|hocquart|noailles|niel|\bfoy\b|vermeille|royallieu|chaudenay|wildenstein|dollar|\bforet\b|forêt|abbaye|gheest|marois|rothschild|morny|salamandre|boussac|lagard|saint-alary|harcourt|gladiateur|kergorlay|gontaut|guiche|cadran|royal-oak|calvados|\bdu pin\b|europa|bayerisch|dallmayr|union-rennen|baden|hamburg|köln|koln|düsseldorf|dusseldorf|hoppegarten|münchen|munchen|presidente|tesio|roma|milano|ribot|capua|capannelle|san siro|italiano|deutsch|german|french|italian|derby italiano.
4. 공통 검사(경로·시즌·cardOrder·상금·조합)는 A4b1 의 tests/data/pattern.test.ts 가 모든 파일을 합쳐 검사한다. 그 테스트 파일이 아직 없으면 이 티켓의 테스트에 같은 공통 검사를 이 파일 대상으로 넣는다.

## 수용 기준
1. 위 테스트, tests/data/calendar.test.ts 통과(g1.json 미수정).
2. 개수·필수 레이스가 명세대로.
3. 실명 금지어 0건, _review_fr_de_it.md 모델 대응표.
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, data/calendar/g1.json·series.json·pattern_gb_ie.json·_review.md·data/racecourses.json 수정 금지, tests/data/pattern.test.ts 수정 금지(다른 에이전트 담당), git commit 금지.
