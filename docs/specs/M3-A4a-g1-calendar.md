# M3-A4a G1 캘린더 + 시리즈 정의 데이터

담당: haiku-data · 선행: M3-A3c 승인(경마장 24곳) · 근거: docs/race-calendar-plan.md 3·4장(등급 결정 반영)

## 목적
유럽 G1 80개와 시리즈 13개를 데이터로 만든다. 기존 data/races.json 의 M1 레이스 12개는 그대로 두고, G1 은 새 파일에 둔다.

## 형식
1. `data/calendar/g1.json` — RaceTemplate[] (src/engine/types/season.ts)
   - id: 가상 이름 기반 snake_case (예: `ashcombe_derby`, `prix_de_letoile_dautomne`)
   - name: race-calendar-plan.md 4장의 가상 이름 그대로
   - racecourseId, distance(그 경마장 distances 에 있는 값; 계획의 거리와 가장 가까운 유효 거리), layoutId(직선/라운드 둘 다 있는 거리면 명시)
   - kind 'group', grade: 계획대로(독일 기니 G2, 독일 세인트레저 G3, 이탈리아 더비·오크스 G2, 이탈리아 기니·세인트레저 G3 — 이 파일 이름은 g1 이지만 이 클래식들도 여기 함께 둔다)
   - raceClass 1, conditions: minAge/maxAge/sex 는 계획 약어대로(3c = 3세 open, 3f = 3세 fillies_mares, 2c = 2세 colts_geldings… 단 2세 수말 경주도 'open' 으로 두고 2f 만 fillies_mares), weightSystem 'wfa', baseWeightLb 126, ratingMin/Max null
   - prizeMoney(€, 정수, 6착까지, 배분 [0.57, 0.22, 0.11, 0.055, 0.03, 0.015] 합 = 총상금):
     - 국가 최고 위상(tags national_flagship): 영국 Kingsmere Summer Crown 1,500,000 · 프랑스 Prix de l'Étoile d'Automne 5,000,000 · 아일랜드 Ballinvar Crown 1,500,000 · 독일 Großer Preis von Lichtenau 250,000 · 이탈리아 Gran Premio di Valmerano 250,000
     - 더비(영·아·프) 1,500,000 / 오크스(영·아·프) 600,000 / 기니(영·아·프) 500,000 / 세인트레저(영·아) 600,000, 프랑스 세인트레저 300,000
     - 그 밖의 G1: 영·아·프 400,000, 2세 G1 300,000, 독일·이탈리아 G1 200,000, G2 150,000, G3 80,000
   - maxRunners: 기본 16, 더비·기니 20, 스프린트 G1 20, 2세 G1 14
   - schedule: 계획의 월/주. cardOrder: 같은 개최일 안에서 낮은 등급·짧은 거리 먼저, 메인(G1 최고 위상)은 마지막 근처
   - tags: 'classic'(5개국 기니·더비·오크스·세인트레저), 'two_year_old', 'fillies_mares', 'national_flagship', 'stayers'(≥ 2,800m), 'sprint'(≤ 1,207m), 'champions_day'(Kingsmere 10월 3주)
2. `data/calendar/series.json` — SeriesDefinition[] 13개:
   - crown 10개: 5개국 3관(gb/ie/fr/de/it_triple_crown), 5개국 티아라(…_tiara) — legs 는 계획 3장, winsRequired = legs 수
   - european_derby_triple, european_mile_triple, british_oaks_triple(crown, 오크스 3관의 G2 레그 Primrose Stakes 는 A4b 에서 추가될 id `primrose_stakes` 를 미리 참조해도 된다 — 테스트는 A4b 이후 통과 조건으로 skip 처리하지 말고, 이번엔 legs 에서 빼고 _review 에 남긴다)
   - european_stayers_series: crown, legs 계획대로(G2 레그 id 는 A4b 에서 생기므로 이번엔 G1 레그만: Kingsmere Cup, Selsworth Cup, Prix du Long Chemin), winsRequired 2, requiredLegs [kingsmere_cup]
   - european_sprint_series: points, legs = 스프린트 G1 9개, pointsByPosition [10, 6, 4, 2]
   - bonus(€): 3관 1,000,000, 티아라 500,000, 유럽 더비 3관 2,000,000, 마일 3관 1,000,000, 오크스 3관 500,000, 스테이어 500,000, 스프린트 300,000
   - nameKey: `series.<id>`
3. `src/engine/data/staticData.ts` 는 수정하지 않는다(로더는 A6 에서). 대신 `tests/data/calendar.test.ts` 에서 JSON 을 직접 읽어 검증.
4. `data/calendar/_review.md` — 레이스별 모델(실제 레이스) 대응표. 실명은 이 파일에만.

## 수용 기준
1. G1 80개(등급 결정 후 실제 G1 수 = 80) + 독·이 클래식 하위 등급 9개 = 89개 레코드. 계획 4장 표의 모든 레이스가 있다.
2. 모든 레이스의 (racecourseId, distance, layoutId) 가 loadRacecourses 결과에서 유효(buildRacePath 성공).
3. schedule 은 잔디 시즌(4월 1주 ~ 11월 4주)이고 weekOfSlot 로 변환 가능. 올웨더 주에 잔디 레이스 없음.
4. 같은 경마장·같은 주 레이스의 cardOrder 가 1부터 겹치지 않는다.
5. prizeMoney 합 = 계획 총상금, 배분 6개, 정수.
6. series legs 의 id 가 모두 g1.json 에 존재.
7. 실명 grep 0건(data/calendar/*.json): epsom|ascot|newmarket|york|goodwood|longchamp|chantilly|deauville|curragh|leopardstown|\barc\b|king george|eclipse|sussex|juddmonte|coronation|queen anne|st james|nunthorpe|haydock|doncaster|marois|vermeille|ganay|ispahan|morny|abbaye|cadran|royal-oak|tattersalls|pretty polly|nassau|falmouth|matron|moyglare|phoenix|dewhurst|middle park|cheveley|lockinge
8. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, data/races.json·racecourses.json 수정 금지, git commit 금지.
