# M3-A4c G1 추가 (2세·단거리/마일·암말 한정·저위상 중장거리)

담당: haiku-data · 근거: 사용자 요청(2026-10-12) — 2세 G1, 스프린트·마일 G1, 빈마(암말) 한정 G1, 명성값이 낮은 중장거리 G1 을 늘린다.

## 목적
`data/calendar/g1_extra.json`(Opus 가 빈 배열 `[]` 로 만들고 로더에 연결해 둠)에 가상 G1 24개를 넣는다. 기존 g1.json(88)·pattern_*.json 은 수정하지 않는다.

## 현재 G1 분포 (g1.json, G1 80개)
- 나라: GB 36 · FR 27 · IE 12 · DE 3 · IT 2
- 2세 13 / 암말 한정 25 / 거리: ≤1400 16, ≤1900 26, ≤2200 16, ≤2800 16, 그 이상 6
- 1착 상금(€): 114,000(총 200k) · 142,500(250k) · 171,000(300k) · 228,000(400k) · 285,000(500k) · 342,000(600k) · 855,000(1.5M) · 2,850,000(5M). 배분 비율 PRIZE_SHARES = [0.57, 0.22, 0.11, 0.055, 0.03, 0.015], 모두 정수.

## 추가할 24개 (나라·조건·거리대·시기·총상금)
레코드 형식은 g1.json 과 똑같다(id, name, racecourseId, distance, layoutId, kind "group", grade "G1", raceClass 1, conditions{minAge,maxAge,sex,ratingMin null,ratingMax null,weightSystem "wfa",baseWeightLb 126}, prizeMoney 6개, maxRunners, schedule{month,weekOfMonth}, cardOrder, tags).

| # | 나라 | 연령 | 성별 | 거리대 | 시기(월) | 총상금 € |
|---|---|---|---|---|---|---|
| 1 | GB | 2세 | open | 1000~1100 | 6~7 | 300,000 |
| 2 | IE | 2세 | 암말 | 1200~1210 | 8 | 300,000 |
| 3 | IE | 2세 | open | 2000~2012 | 10 | 300,000 |
| 4 | FR | 2세 | 암말 | 1400 | 9 | 300,000 |
| 5 | DE | 2세 | open | 1600 | 9~10 | 200,000 |
| 6 | IT | 2세 | open | 1600 | 10 | 200,000 |
| 7 | IE | 3세 이상 | open | 1000~1006 | 6~7 | 400,000 |
| 8 | IE | 3세 이상 | open | 1600~1609 | 8 | 400,000 |
| 9 | FR | 3세 | open | 1200 | 7 | 300,000 |
| 10 | FR | 3세 이상 | open | 1400 | 7~8 | 400,000 |
| 11 | DE | 3세 이상 | open | 1600 | 8 | 250,000 |
| 12 | IT | 3세 이상 | open | 1600 | 10 | 250,000 |
| 13 | IT | 3세 이상 | open | 1200 | 5~6 | 200,000 |
| 14 | GB | 3세 이상 | 암말 | 1200~1207 | 8 | 400,000 |
| 15 | IE | 3세 이상 | 암말 | 1200~1207 | 9 | 300,000 |
| 16 | FR | 3세 이상 | 암말 | 2400 | 10 | 250,000 |
| 17 | DE | 3세 이상 | 암말 | 2200 | 8 | 200,000 |
| 18 | IT | 3세 이상 | 암말 | 1600 | 5 | 200,000 |
| 19 | DE | 3세 이상 | open | 2000 | 6 | 200,000 |
| 20 | DE | 3세 이상 | open | 2200 | 10 | 200,000 |
| 21 | DE | 4세 이상 | open | 2400 | 7 | 200,000 |
| 22 | IT | 3세 이상 | open | 2000 | 10~11 | 200,000 |
| 23 | FR | 3세 이상 | open | 2400 | 6 | 250,000 |
| 24 | GB | 3세 이상 | open | 2400~2414 | 9 | 250,000 |

- #19~24 가 '저위상 중장거리' 이다(상금이 낮고 지방·2급 경마장).
- 암말 한정은 `sex: "fillies_mares"`, 2세는 minAge = maxAge = 2, 3세 한정은 minAge = maxAge = 3, 3세 이상은 minAge 3·maxAge null, 4세 이상은 minAge 4·maxAge null (g1.json 의 기존 레코드와 같은 표기를 따른다 — 먼저 확인).
- 경마장은 그 나라의 가상 경마장(data/racecourses.json)에서 고른다. 같은 나라 안에서 고르게 퍼뜨리고, 기존 G1 이 적은 경마장을 우선한다. **거리는 그 경마장의 distances 목록에 있는 값**, layoutId 는 그 거리에 맞는 레이아웃, 잔디(turf)만.
- 시기는 그 주가 turf_flat 단계 안이어야 한다(tests/data/calendar.test.ts 의 isInPhase 검사와 같은 방식). weekOfMonth 1~4.
- cardOrder: 10 단위, 같은 경마장·같은 주의 모든 레이스(g1·g1_extra·pattern_*)와 겹치지 않게. 같은 개최일에 G1 이 이미 있으면 다른 주를 고른다(한 개최일 G1 1개).
- maxRunners: 2세 14~16, 단거리 18~20, 나머지 14~16.
- 태그: 2세는 "two_year_old", 거리 ≤1207 이면 "sprint", ≥2800 이면 "stayers", 암말 한정은 "fillies_mares". 기존 g1.json 에 쓰는 태그 이름만 쓴다(먼저 확인).

## 이름 규칙
- GB/IE: "<가상 지명 또는 일반 영어 어휘> Stakes / Sprint / Mile / Cup / Trophy" 등. 경마장 이름을 앞에 붙여도 된다(예: "Kilcarrow ..."). 
- FR: "Prix <가상 고유어·자연 어휘>", DE: "Preis von <가상 지명>" 또는 "<가상어>-Rennen", IT: "Premio <가상 어휘>".
- 실제 레이스 이름과 같거나 한 단어만 바꾼 이름 금지, 사람 이름 금지, 후원사 금지. g1.json·pattern_*.json 과 이름·id 중복 금지.
- 금지어 정규식(대소문자 무시) 0건: tests/data/calendar.test.ts 의 FORBIDDEN, tests/data/pattern_fr_de_it.test.ts 의 금지어 목록, 그리고 `phoenix|railway|futurity|national stakes|flying five|cheveley|sun chariot|prix de la foret|jean-luc|criterium international|marcel boussac|preis der diana|grosser preis von baden|bayerisches|premio vittorio|lydia tesio|jockey club|gran criterio`.

## 생성·수정할 파일
1. `data/calendar/g1_extra.json` — 24개 레코드.
2. `data/calendar/_review_g1_extra.md` — 표: 번호 · 이름 · 경마장 · 거리 · 월/주 · 총상금 · 실제 모델(참고한 실제 레이스 성격만, 이름은 쓰지 않아도 됨).
3. `tests/data/g1_extra.test.ts` (신규)
   - 24개, 모두 grade G1·kind group·raceClass 1·wfa·126lb
   - 위 표의 나라·연령·성별·거리대·월 범위를 각 행이 만족(행 순서대로 레코드가 있다고 가정하지 말고, 조건별 개수로 검사: 2세 6, 암말 한정 7(#2·#4·#14~18), 1,400m 이하 8, DE 6, IT 5 등)
   - 경마장 distances 에 거리가 있고 buildRacePath 가 성공, 잔디, turf_flat 주
   - 상금 6개 정수, 합계가 표의 총상금, PRIZE_SHARES 비율(±1)
   - 태그 규칙
   - id·이름이 g1.json·pattern_*.json 과 겹치지 않음, 금지어 0건
4. `tests/data/pattern.test.ts` — 합쳐 검사하는 레코드 목록에 g1_extra.json 을 더한다(import 1줄 + 배열 1곳). 그 밖의 기대값은 바꾸지 않는다.

## 수용 기준
1. tests/data/g1_extra.test.ts · tests/data/calendar.test.ts · tests/data/pattern.test.ts · tests/data/pattern_fr_de_it.test.ts 통과.
2. getRaceTemplates() 의 G1 이 80 → 104.
3. 같은 경마장·같은 주 cardOrder 겹침 0, 한 개최일 G1 1개.
4. 금지어 0건, _review_g1_extra.md 작성.
5. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
g1.json·pattern_*.json·series.json·racecourses.json 수정 금지. src/ 수정 금지(테스트 파일 제외). git commit 금지.
다른 에이전트가 동시에 src/engine/naming·world·state·breeding·data/staticData.ts 를 수정 중이다. 그 파일은 건드리지 말고, 그쪽 작업 때문에 깨지는 테스트는 보고만 한다.
