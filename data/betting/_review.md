# 베팅 회사·스폰서 레이스 검수표 (M4-BET1)

Opus 검수용. 가상 이름 ↔ 모티브 대응은 이 파일에만 적는다. `bookmakers.json`·`sponsorships.json` 에는 실제 회사명·레이스명이 없다.
근거 명세: docs/specs/M4-BET1-bookmakers-sponsorships-data.md. 테스트: tests/data/betting.test.ts.
스키마: src/engine/types/betting.ts (BookmakersDataFile · SponsorshipsDataFile).

## 1. 베팅 회사 4곳

| id | 가상 회사명 | shortName (스폰서명에 쓰는 이름) | 나라·성격 | 모티브 (설명용) |
|---|---|---|---|---|
| bm_holmgrave_turf | Holmgrave Turf Accounts | Holmgrave | 영국, 지점형 장외 마권 체인 | 영국 대형 지점 체인 계열 |
| bm_ardmorrow_racing | Ardmorrow Racing Accounts | Ardmorrow | 아일랜드, 지점형 장외 마권 | 아일랜드 지역 장외 마권 계열 |
| bm_lauvrac_comptoir | Comptoir Hippique de Lauvrac | (없음 → name 사용) | 프랑스, 장외 마권 회사 | 프랑스 장외 마권(PMU 류) 계열 |
| bm_vantor_odds | Vantor Odds Europe | Vantor | 범유럽 온라인 | 범유럽 온라인 베팅 계열 |

## 2. 스폰서 레이스 (27건)

스폰서 분포: 베팅 회사 4곳 × 4건 = 16건, 세일 회사 Ashcombe 3 · Ardcarrig 3 · Lorvaux 3 · Wolfsrode 2 = 11건, Quenmoor 0건(3장 참고).
G1 2건(상한 4건). 템플릿당 스폰서 1건. 최종 이름은 모두 60자 이하.

| templateId | 원래 이름 | 최종 이름 | 배수 | 스폰서 | 등급 | 길이 | 나라 |
|---|---|---|---|---|---|---|---|
| selsworth_cup | Selsworth Cup | Holmgrave Selsworth Cup | 1.1 | 베팅 bm_holmgrave_turf | G1 | 23 | GB |
| dunholme_spring_stakes | Dunholme Spring Stakes | Holmgrave Dunholme Spring Stakes | 1.25 | 베팅 bm_holmgrave_turf | G2 | 32 | GB |
| kingsmere_summer_handicap | Kingsmere Summer Handicap | Holmgrave Kingsmere Summer Handicap | 1.4 | 베팅 bm_holmgrave_turf | 핸디캡 | 35 | GB |
| wexborough_cup | Wexborough Cup | Holmgrave Wexborough Cup | 1.3 | 베팅 bm_holmgrave_turf | G2 | 24 | GB |
| kilcarrow_autumn_cup | Kilcarrow Autumn Cup | Ardmorrow Kilcarrow Autumn Cup | 1.2 | 베팅 bm_ardmorrow_racing | G3 | 30 | IE |
| ballinvar_spring_stakes | Ballinvar Spring Stakes | Ardmorrow Ballinvar Spring Stakes | 1.25 | 베팅 bm_ardmorrow_racing | G2 | 33 | IE |
| tullamere_autumn_stakes | Tullamere Autumn Stakes | Ardmorrow Tullamere Autumn Stakes | 1.2 | 베팅 bm_ardmorrow_racing | G3 | 33 | IE |
| ballinvar_autumn_handicap | Ballinvar Autumn Handicap | Ardmorrow Ballinvar Autumn Handicap | 1.4 | 베팅 bm_ardmorrow_racing | 핸디캡 | 35 | IE |
| prix_de_hauteroche | Prix de Hauteroche | Comptoir Hippique de Lauvrac Prix de Hauteroche | 1.25 | 베팅 bm_lauvrac_comptoir | G2 | 47 | FR |
| prix_de_lisierevent | Prix de Lisièrevent | Comptoir Hippique de Lauvrac Prix de Lisièrevent | 1.25 | 베팅 bm_lauvrac_comptoir | G2 | 48 | FR |
| prix_de_vergerval | Prix de Vergerval | Comptoir Hippique de Lauvrac Prix de Vergerval | 1.4 | 베팅 bm_lauvrac_comptoir | 핸디캡 | 46 | FR |
| prix_de_ruisselac | Prix de Ruisselac | Comptoir Hippique de Lauvrac Prix de Ruisselac | 1.3 | 베팅 bm_lauvrac_comptoir | G2 | 46 | FR |
| premio_fonte_alba | Premio Fonte Alba | Vantor Premio Fonte Alba | 1.25 | 베팅 bm_vantor_odds | G2 | 24 | IT |
| preis_von_morgenbruch | Preis von Morgenbruch | Vantor Preis von Morgenbruch | 1.25 | 베팅 bm_vantor_odds | G2 | 28 | DE |
| prix_de_clos_fleurel | Prix de Clos-Fleurel | Vantor Prix de Clos-Fleurel | 1.3 | 베팅 bm_vantor_odds | G2 | 27 | FR |
| prix_de_morvenne | Prix de Morvenne | Vantor Prix de Morvenne | 1.1 | 베팅 bm_vantor_odds | G1 | 23 | FR |
| easterholm_cup | Easterholm Cup | Ashcombe Bloodstock Sales Gold Cup | 1.3 | 세일 sco_ashcombe | G2 | 34 | GB |
| marlow_sprint_trophy | Marlow Sprint Trophy | Ashcombe Bloodstock Sales Sprint | 1.2 | 세일 sco_ashcombe | G3 | 32 | GB |
| dunholme_ladies_cup | Dunholme Ladies Cup | Ashcombe Bloodstock Sales Dunholme Ladies Cup | 1.25 | 세일 sco_ashcombe | G2 | 45 | GB |
| kilcarrow_cup | Kilcarrow Cup | Ardcarrig Thoroughbred Sales Gold Cup | 1.3 | 세일 sco_ardcarrig | G2 | 37 | IE |
| ballinvar_sprint_trophy | Ballinvar Sprint Trophy | Ardcarrig Thoroughbred Sales Ballinvar Sprint Trophy | 1.2 | 세일 sco_ardcarrig | G3 | 52 | IE |
| kilcarrow_fillies_plate | Kilcarrow Fillies Plate | Ardcarrig Thoroughbred Sales Kilcarrow Fillies Plate | 1.2 | 세일 sco_ardcarrig | G3 | 52 | IE |
| prix_de_clairebrume | Prix de Clairebrume | Lorvaux Enchères Sprint | 1.2 | 세일 sco_lorvaux | G3 | 23 | FR |
| prix_de_brunelande | Prix de Brunelande | Lorvaux Enchères Prix de Brunelande | 1.25 | 세일 sco_lorvaux | G2 | 35 | FR |
| prix_de_fontclaire | Prix de Fontclaire | Lorvaux Enchères Prix de Fontclaire | 1.25 | 세일 sco_lorvaux | G2 | 35 | FR |
| silberstrand_rennen | Silberstrand-Rennen | Wolfsrode Auktionen Cup | 1.25 | 세일 sco_wolfsrode | G2 | 23 | DE |
| preis_von_waldgrund | Preis von Waldgrund | Wolfsrode Auktionen Preis von Waldgrund | 1.3 | 세일 sco_wolfsrode | G2 | 39 | DE |

### 새 형식 이름 (세일 회사, 모티브 설명)

| 최종 이름 | 형식 | 거리·성격 근거 | 모티브 (설명용) |
|---|---|---|---|
| Ashcombe Bloodstock Sales Gold Cup | `{sponsor} Gold Cup` | 3319m 장거리 컵 | 세일 회사 이름을 단 장거리 골드컵 계열 |
| Ardcarrig Thoroughbred Sales Gold Cup | `{sponsor} Gold Cup` | 2816m 장거리 컵 | 세일 회사 이름을 단 장거리 골드컵 계열 |
| Ashcombe Bloodstock Sales Sprint | `{sponsor} Sprint` | 1207m 스프린트 | 세일 회사 이름을 단 단거리 계열 |
| Lorvaux Enchères Sprint | `{sponsor} Sprint` | 1000m 스프린트 | 세일 회사 이름을 단 단거리 계열 |
| Wolfsrode Auktionen Cup | `{sponsor} Cup` | 2414m 중장거리 컵 | 세일 회사 이름을 단 컵 계열 |

## 3. 명세와 다르게 한 점 (Opus 판단 필요)

- **Quenmoor Thoroughbred Sales (sco_quenmoor, 미국) 0건.** 명세는 "세일 회사는 자기 나라 경마장 레이스에 붙인다"이고 세일 회사 5곳이 각 2~3건이다. 그런데 템플릿 4개 파일(g1·g1_extra·pattern_gb_ie·pattern_fr_de_it)에는 미국 경마장이 없어 자기 나라 레이스가 0개다. 선택지는 (a) 0건 유지(현재), (b) 미국 경마장 레이스 템플릿 추가 후 2~3건(템플릿 파일 추가 필요), (c) 다른 나라 레이스에 붙이기(명세 원칙 위반). 현재 테스트는 (a)를 검사한다.
- 세일 회사 4곳은 자기 나라 경마장 레이스에만 붙었다(테스트에서 검사).

## 4. 금지어·차단 검사 결과

- 원칙 1 금지 목록(명세 원칙 1 전체 + 테스트에서 보강한 베팅 회사명 목록)과 실제 레이스명 목록(테스트 파일 REAL_RACE_NAMES, 실제 이름은 이 파일에 적지 않는다) 단어 단위 검사: 회사명·shortName·최종 이름·nameFormat 0건.
- data/naming/real_places.json blockedTokens 단어 단위 검사: 0건.
- tests/data/sales.test.ts 의 REAL_SALE_NAMES 검사: 0건.
- 최종 이름 중복 없음, 60자 이하.

## 5. 가상 이름 검수 대상

실존 여부를 확신하지 못하는 이름은 data/_names_review.md 의 "M4-BET1" 절에도 같은 목록으로 기록했다. 특히 Holmgrave·Ardmorrow·Vantor·Comptoir Hippique de Lauvrac 는 Opus 확인 권장.
