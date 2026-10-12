# G1 추가 24개 대응표 (M3-A4c) — Opus 검수용

가상 이름 ↔ 경마장 ↔ 실제 레이스 성격. 데이터(g1_extra.json)에는 실명이 없다.
"실제 모델" 열은 성격만 적는다(레이스명 없음). 이름은 모두 가상이며 아래 3장 목록을 검수한다.

## 1. 명세 해석 메모

- 명세의 거리 표기 → 경마장 실제 거리: 1000~1100 → 1006 / 1200~1210 → 1207 / 1200 → 1200(프랑스 Montvigne) 또는 1207(이탈리아) / 1400 → 1400 / 1600 → 1609(독·이 경마장에 1600m 없음) / 2000~2012 → 2012 / 2200 → 2213 / 2400~2414 → 2414 / 2400 → 2400(프랑스).
- 레이아웃은 경마장 distances 목록의 (거리, layoutId) 쌍을 그대로 쓴다. 잔디만 사용(Ardvarrow Park 올웨더 제외).
- 모든 슬롯은 turf_flat(13~45주) 안이다. 신규 G1 은 기존 레코드가 없는 빈 슬롯에만 넣었으므로 cardOrder 는 모두 10 이다.
- 상금 배분은 PRIZE_SHARES 로 계산(모두 정수, 합 = 총상금).
- maxRunners: 2세 14, 2세 제외 1,207m 이하 20, 나머지 16. (2세 스프린트는 2세 규칙을 우선. 기존 g1.json 의 2세 스프린트 대부분이 14 이다.)
- 명세 본문의 "1,400m 이하 8" 은 표 행을 세면 9(#1·2·4·7·9·10·13·14·15)다. 테스트는 표 기준 9 로 검사한다.

## 2. 대응표

| 번호 | 이름 | id | 경마장 (id) | 거리(m) · layoutId | 월/주 | 조건 | 총상금 € | 실제 모델 (성격) |
|---|---|---|---|---|---|---|---|---|
| 1 | Ravensbridge Juvenile Dash | ravensbridge_juvenile_dash | Ravensbridge Park (ravensbridge_park) | 1006 · ravensbridge_straight | 6월 2주 | 2세 open | 300,000 | 영국 초여름 2세 단거리 일반형 |
| 2 | Tullamere Lassies Stakes | tullamere_lassies_stakes | Tullamere (tullamere) | 1207 · tullamere_main | 8월 1주 | 2세 암말 | 300,000 | 아일랜드 여름 2세 암말 단거리 |
| 3 | Ballinvar Autumn Stakes | ballinvar_autumn_stakes | Ballinvar (ballinvar) | 2012 · ballinvar_main | 10월 2주 | 2세 open | 300,000 | 아일랜드 가을 2세 중거리 |
| 4 | Prix des Saulaies | prix_des_saulaies | Bellerive-le-Bois (bellerive_le_bois) | 1400 · bellerive_straight | 9월 2주 | 2세 암말 | 300,000 | 프랑스 가을 초 2세 암말 중거리 |
| 5 | Preis von Hohenmoor | preis_von_hohenmoor | Hohenmoor (hohenmoor) | 1609 · hohenmoor_main | 9월 1주 | 2세 open | 200,000 | 독일 2세 마일 일반형 |
| 6 | Premio della Rondine | premio_della_rondine | Valmerano (valmerano) | 1609 · valmerano_main | 10월 1주 | 2세 open | 200,000 | 이탈리아 가을 2세 마일 |
| 7 | Tullamere Sprint Cup | tullamere_sprint_cup | Tullamere (tullamere) | 1006 · tullamere_main | 6월 3주 | 3세 이상 open | 400,000 | 아일랜드 여름 스프린트 일반형 |
| 8 | Ballinvar Mile | ballinvar_mile | Ballinvar (ballinvar) | 1609 · ballinvar_main | 8월 1주 | 3세 이상 open | 400,000 | 아일랜드 여름 마일 일반형 |
| 9 | Prix du Genévrier | prix_du_genevrier | Montvigne (montvigne) | 1200 · montvigne_main | 7월 1주 | 3세 open | 300,000 | 프랑스 여름 3세 스프린트 |
| 10 | Prix des Ajoncs | prix_des_ajoncs | Clairval (clairval) | 1400 · clairval_main | 8월 1주 | 3세 이상 open | 400,000 | 프랑스 여름 중거리 일반형 |
| 11 | Eichenfeld-Rennen | eichenfeld_rennen | Lichtenau (lichtenau) | 1609 · lichtenau_main | 8월 1주 | 3세 이상 open | 250,000 | 독일 여름 마일 |
| 12 | Premio dei Cipressi | premio_dei_cipressi | Torreverde (torreverde) | 1609 · torreverde_main | 10월 3주 | 3세 이상 open | 250,000 | 이탈리아 가을 마일 |
| 13 | Premio Lanterna | premio_lanterna | Valmerano (valmerano) | 1207 · valmerano_main | 5월 2주 | 3세 이상 open | 200,000 | 이탈리아 봄 스프린트 |
| 14 | Wexborough Ladies' Dash | wexborough_ladies_dash | Wexborough (wexborough) | 1207 · wexborough_main | 8월 2주 | 3세 이상 암말 | 400,000 | 영국 여름 암말 스프린트 |
| 15 | Tullamere Mares' Trophy | tullamere_mares_trophy | Tullamere (tullamere) | 1207 · tullamere_main | 9월 2주 | 3세 이상 암말 | 300,000 | 아일랜드 가을 초 암말 스프린트 |
| 16 | Prix des Bruyères | prix_des_bruyeres | Bellerive-le-Bois (bellerive_le_bois) | 2400 · bellerive_round | 10월 2주 | 3세 이상 암말 | 250,000 | 프랑스 가을 암말 장거리 |
| 17 | Morgenfeld-Rennen | morgenfeld_rennen | Wesselfeld (wesselfeld) | 2213 · wesselfeld_main | 8월 2주 | 3세 이상 암말 | 200,000 | 독일 여름 암말 중장거리 |
| 18 | Premio Rosaspina | premio_rosaspina | Torreverde (torreverde) | 1609 · torreverde_main | 5월 2주 | 3세 이상 암말 | 200,000 | 이탈리아 봄 암말 마일 |
| 19 | Grauwald-Rennen | grauwald_rennen | Lichtenau (lichtenau) | 2012 · lichtenau_main | 6월 1주 | 3세 이상 open | 200,000 | 독일 초여름 중거리 |
| 20 | Preis von Wesselfeld | preis_von_wesselfeld | Wesselfeld (wesselfeld) | 2213 · wesselfeld_main | 10월 1주 | 3세 이상 open | 200,000 | 독일 가을 중장거리 |
| 21 | Tannenmoor-Rennen | tannenmoor_rennen | Hohenmoor (hohenmoor) | 2414 · hohenmoor_main | 7월 2주 | 4세 이상 open | 200,000 | 독일 여름 4세 이상 장거리 |
| 22 | Premio Ombrosa | premio_ombrosa | Valmerano (valmerano) | 2012 · valmerano_main | 10월 3주 | 3세 이상 open | 200,000 | 이탈리아 가을 중거리 |
| 23 | Prix du Tertre Rouge | prix_du_tertre_rouge | Montvigne (montvigne) | 2400 · montvigne_main | 6월 1주 | 3세 이상 open | 250,000 | 프랑스 초여름 장거리 |
| 24 | Ravensbridge Harvest Cup | ravensbridge_harvest_cup | Ravensbridge Park (ravensbridge_park) | 2414 · ravensbridge_oval | 9월 2주 | 3세 이상 open | 250,000 | 영국 가을 초 장거리 |

## 3. 개수 집계

| 구분 | 개수 |
|---|---|
| 나라: GB 3 · IE 5 · FR 5 · DE 6 · IT 5 | 24 |
| 2세 | 6 (#1~6) |
| 암말 한정 | 7 (#2·4·14·15·16·17·18) |
| 1,400m 이하 | 9 (#1·2·4·7·9·10·13·14·15) |
| 3세 한정 / 4세 이상 | 1 (#9) / 1 (#21) |
| 경마장 신규 사용 | 경마장별 기존 G1 이 적은 곳 우선: Tullamere 0 · Bellerive-le-Bois 0 · Montvigne 0 · Clairval 3 등 |

## 4. 검사

- tests/data/g1_extra.test.ts: 표 24행과 1:1 매칭(순서 무관), 조건별 개수, 경로·잔디·turf_flat, 상금, 태그, maxRunners, cardOrder·개최일, id·이름 중복, 금지어, 보호 목록·차단 지명.
- 신규 G1 은 같은 개최일에 다른 G1 이 없다. 기존 g1.json 에는 한 개최일 G1 이 2개인 슬롯이 17곳 있다(예: Ballinvar 9월 2주). 명세 규칙은 신규 레코드에만 적용했다.
