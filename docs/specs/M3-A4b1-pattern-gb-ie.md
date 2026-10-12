# M3-A4b1 G2·G3·리스티드 + 헤리티지 핸디캡 — 영국·아일랜드 (+ 시리즈 보완)

담당: haiku-data · 선행: M3-A4a 승인, 873091c(G1 cardOrder 10 단위, pattern 파일 로더) · 근거: docs/race-calendar-plan.md 3·5장

## 목적
영국·아일랜드의 G1 아래 블랙타입 경주(G2·G3·리스티드)와 헤리티지 핸디캡을 고정 일정 데이터로 만든다. 영국 오크스 3관·유러피언 스테이어 시리즈의 빠진 G2 레그를 채운다.

## 공통 규칙 (M3-A4b2 도 같은 규칙을 쓴다)
1. 형식은 `RaceTemplate`(src/engine/types/season.ts), data/calendar/g1.json 레코드와 같은 필드. id 는 가상 이름 기반 snake_case, 전체 캘린더 파일(g1.json + pattern_*.json)에서 유일.
2. (racecourseId, distance, layoutId) 는 data/racecourses.json 의 distances 에 있는 값. 영·아는 펄롱 환산 미터(1006·1207·1408·1609·2012·2414 …) 그대로.
3. schedule 은 잔디 시즌(4월 1주 ~ 11월 4주). 그 경마장의 기존 G1 개최일이 있는 주에 넣는 경주(보조 경주)와, G1 이 없는 주의 단독 개최(트라이얼 등) 둘 다 가능. 한 경마장 한 주에 고정 일정 레이스는 최대 10개(G1 포함).
4. cardOrder: 같은 (경마장, 월, 주) 안에서 모든 캘린더 파일을 합쳐 서로 달라야 한다. G1 은 10 단위(10, 20, …)이고 **g1.json 은 수정하지 않는다**. 하위 등급은 10 의 배수가 아닌 값(예: 5, 15, 25)으로 G1 사이·앞에 끼운다. 국가 최고 위상(national_flagship) G1 보다 큰 값은 쓰지 않는다. G1 이 없는 개최일은 10, 20, … 을 써도 된다.
5. kind·grade·raceClass: G2/G3 는 kind 'group', L 은 kind 'listed', raceClass 1, weightSystem 'wfa', baseWeightLb 126, ratingMin/Max null. 헤리티지 핸디캡은 kind 'handicap', grade null, raceClass 2, weightSystem 'handicap', baseWeightLb 140, ratingMin 80, ratingMax 110, tags ['heritage_handicap'], maxRunners 20.
6. conditions: 계획의 약어 규칙과 같다(3c=3세 open, 3f=3세 fillies_mares, 2세 수말 경주도 open, 2f 만 fillies_mares, 3+ / 4+ 는 maxAge null).
7. 총상금(€, 6착까지 [0.57, 0.22, 0.11, 0.055, 0.03, 0.015], 정수, 합 = 총상금): 영·아·프 G2 150,000 / G3 80,000 / L 55,000, 독·이 G2 100,000 / G3 55,000 / L 30,000, 헤리티지 핸디캡 영국 200,000(가장 큰 1개 300,000) · 아·프 150,000.
8. maxRunners: 기본 14, 2세 12, 1,207m 이하 스프린트 16.
9. tags: G1 과 같은 기준('two_year_old', 'fillies_mares', 'stayers' ≥ 2,800m, 'sprint' ≤ 1,207m, 'trial' = 트라이얼). 'classic'·'national_flagship' 은 쓰지 않는다.
10. 이름: 전부 가상(CLAUDE.md 원칙 1). 실제 레이스 이름과 같거나 한 단어만 바꾼 이름 금지. 영국·아일랜드는 "<가상 지명/가상 고유어> Stakes / Trophy / Cup / Handicap", 트라이얼은 "<경마장> Guineas Trial", "<경마장> Derby Trial" 처럼 가상 경마장명 + 일반어 가능. 사람 이름 금지(역사 인물 예외 3 은 경주마 이름 전용이라 레이스명에는 쓰지 않는다). data/calendar/_review.md 에 레이스별 모델(실제 레이스) 대응을 적는다(실명은 그 파일에만).

## 이번 티켓 범위 (영국·아일랜드)
- 파일: `data/calendar/pattern_gb_ie.json`(지금 `[]`), `data/calendar/series.json`(2개 시리즈만 수정), `data/calendar/_review.md`(5장 추가), `tests/data/pattern.test.ts`(신규, A4b2 도 이 테스트를 쓴다)
- 개수: 영국 G2 14 · G3 22 · L 22, 아일랜드 G2 5 · G3 10 · L 10, 헤리티지 핸디캡 영국 6 · 아일랜드 1 (합 90). ±10% 허용.
- 반드시 포함:
  - 클래식 트라이얼: 영국·아일랜드 2000/1000 Guineas 의 3~5주 전 트라이얼 각 2개(G3 또는 L), 더비·오크스 트라이얼 각 2개 이상, 세인트레저 트라이얼 1개 이상(8월).
  - `primrose_stakes`: 이름 "Primrose Stakes", Kingsmere Heath, 6월 3주, 2,414m(kingsmere_triangle), 3f, G2.
  - `easterholm_spring_cup`: "Easterholm Spring Cup", Easterholm, 5월 2주, 2,816m, 4+, G2, stayers.
  - `easterholm_cup`: "Easterholm Cup", Easterholm, 8월 3주, 3,319m, 3+, G2, stayers.
  - Kingsmere 6월 3주(G1 8개)에는 primrose_stakes 와 2세 경주 1개만 더 넣는다(10개).
  - 2세 G2·G3 각 4개 이상(여름 Kingsmere·Marlow·Easterholm·Ballinvar·Kilcarrow 등).
- `series.json` 수정:
  - `british_oaks_triple`: legs = [ashcombe_oaks, primrose_stakes, northern_oaks], winsRequired 3.
  - `european_stayers_series`: legs = [easterholm_spring_cup, kingsmere_cup, selsworth_cup, easterholm_cup, prix_du_long_chemin], winsRequired 3, requiredLegs [kingsmere_cup]. (id 는 g1.json 의 실제 id 를 확인해 쓴다)

## 테스트 `tests/data/pattern.test.ts` (모든 캘린더 파일 합쳐서 검사)
1. id 유일(전체 파일), 모든 레이스의 경로 유효(loadRacecourses + buildRacePath).
2. 잔디 시즌, weekOfSlot 변환 가능.
3. (경마장, 월, 주)별 고정 일정 ≤ 10, cardOrder 서로 다름, flagship 이 그 그룹 최대.
4. 상금 규칙(정수·6개·합·배분), 등급·kind·raceClass·weightSystem 조합 규칙, 헤리티지 핸디캡 ratingMin/Max.
5. series legs·requiredLegs 가 전체 템플릿에 존재, winsRequired ≤ legs 수.
6. 실명 금지어 정규식 0건(tests/data/calendar.test.ts 의 목록 + 다음 추가: ribblesdale|hardwicke|king edward|queen mary|norfolk|coventry|windsor castle|jersey|wolferton|duke of cambridge|chesham|queen's vase|gold cup|goodwood cup|lonsdale|yorkshire cup|dante|musidora|chester vase|lingfield|craven|greenham|nell gwyn|fred darling|feilden|prix du jockey|royal hunt|wokingham|stewards|cambridgeshire|cesarewitch|ebor|northumberland|lincoln|irish|curragh|leopardstown|galway|gallinule|derrinstown|ballysax|tetrarch|athasi|blandford|ballyroan|matron|flying five).
7. 파일별 개수 하한(이번 티켓: pattern_gb_ie.json 의 GB·IE 등급별 개수가 범위 안). A4b2 가 FR·DE·IT 개수를 같은 테스트에 추가한다.

## 수용 기준
1. 위 테스트와 기존 tests/data/calendar.test.ts 통과(g1.json 미수정).
2. 개수·필수 레이스·시리즈 수정이 명세대로.
3. 이름 실명 금지어 0건, _review.md 에 모델 대응표.
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, data/calendar/g1.json·data/racecourses.json·pattern_fr_de_it.json 수정 금지, git commit 금지.
