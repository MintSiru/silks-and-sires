# 세일 캘린더 검수표 (M4-C1)

Opus 검수용. 가상 이름 ↔ 모티브(실제 세일) 대응은 이 파일에만 적는다. `sales.json` 에는 실제 세일명·회사명이 없다.
근거 명세: docs/specs/M4-C1-sale-calendar-data.md. 테스트: tests/data/sales.test.ts.

## 1. 회사 5곳

| 회사 id | 가상 회사명 | 나라 | 가상 장소 | 위상 | 수수료율 | 모티브(설명용) |
|---|---|---|---|---|---|---|
| sco_ashcombe | Ashcombe Bloodstock Sales | GB | Kelsmoor Sales Park | 1 | 0.05 | Tattersalls (뉴마켓) |
| sco_ardcarrig | Ardcarrig Thoroughbred Sales | IE | Corrinvale Sales Grounds | 1 | 0.045 | Goffs / Tattersalls Ireland 계열 |
| sco_lorvaux | Lorvaux Enchères | FR | Vesserac Pavillon de Vente | 1 | 0.04 | Arqana (도빌) 계열 |
| sco_wolfsrode | Wolfsrode Auktionen | DE | Adlerhain Auktionshalle | 2 | 0.035 | BBAG (바덴바덴) 계열 |
| sco_quenmoor | Quenmoor Thoroughbred Sales | US | Halvard Sales Pavilion | 1 | 0.055 | Keeneland · Fasig-Tipton 계열 |

## 2. 세일 표 (게임 달력 주 기준)

| 회사 | 종류 | 주 | 월 | 세일 id | 북 수 | 총 출품 목표 | 북별 maxSireTier | 최소 입찰(€) | 모티브(설명용) |
|---|---|---|---|---|---|---|---|---|---|
| Ashcombe | yearling (대형) | 41 | 10 | sev_ashcombe_yearling_oct | 4 | 1420 | 1·2·3·5 | 3000 | Tattersalls October Yearling Sale |
| Ashcombe | yearling (2단계) | 34 | 8 | sev_ashcombe_yearling_aug | 1 | 200 | 5 | 2000 | 영국 여름 1세마 세일 계열 |
| Ardcarrig | yearling (대형) | 37 | 9 | sev_ardcarrig_yearling_sep | 3 | 900 | 1·2·5 | 3000 | Goffs Orby Sale 계열(아일랜드 9월) |
| Lorvaux | yearling (대형) | 33 | 8 | sev_lorvaux_yearling_aug | 3 | 760 | 1·2·5 | 3000 | Arqana August Yearling Sale |
| Wolfsrode | yearling | 38 | 9 | sev_wolfsrode_yearling_sep | 2 | 340 | 2·5 | 3000 | BBAG 9월 1세마 계열 |
| Quenmoor | yearling (초대형) | 36 | 9 | sev_quenmoor_yearling_sep | 5 | 1900 | 1·2·3·4·5 | 3000 | Keeneland September Yearling Sale |
| Ashcombe | foal | 49 | 12 | sev_ashcombe_foal_dec | 1 | 350 | 5 | 1000 | Tattersalls December Foal Sale 계열 |
| Ardcarrig | foal | 46 | 11 | sev_ardcarrig_foal_nov | 2 | 370 | 2·5 | 1000 | Tattersalls Ireland November Foal Sale 계열 |
| Ardcarrig | breeze_up | 16 | 4 | sev_ardcarrig_breeze_up_apr | 2 | 220 | 2·5 | 3000 | 아일랜드 봄 브리즈업 계열 |
| Quenmoor | breeze_up | 20 | 5 | sev_quenmoor_breeze_up_may | 2 | 260 | 3·5 | 3000 | Ocala Breeze Up 계열(미국 봄) |
| Ashcombe | horses_in_training | 43 | 10 | sev_ashcombe_horses_in_training_oct | 1 | 120 | 5 | 5000 | 영국 가을 현역마 세일 계열 |
| Lorvaux | horses_in_training | 41 | 10 | sev_lorvaux_horses_in_training_oct | 1 | 100 | 5 | 5000 | 프랑스 가을 현역마 세일 계열 |
| Ashcombe | breeding_stock | 51 | 12 | sev_ashcombe_breeding_stock_dec | 1 | 110 | 5 | 5000 | Tattersalls December Mares Sale 계열 |
| Lorvaux | breeding_stock | 50 | 12 | sev_lorvaux_breeding_stock_dec | 1 | 90 | 5 | 5000 | Arqana December Mares Sale 계열 |
| Quenmoor | breeding_stock | 47 | 11 | sev_quenmoor_breeding_stock_nov | 2 | 240 | 3·5 | 5000 | Fasig-Tipton November Breeding Stock Sale 계열 |

총 세일 15개, 총 출품 목표 7380두 (북별 lotsTarget 합). 세일 이름의 월 약칭은 주→월 대응표(monthOfWeek)와 일치한다.

### 종류별 개수

| 종류 | 개수 | 최소 | 비고 |
|---|---|---|---|
| yearling | 6 | 6 | 나라별 1 + GB 2단계(8월 소형) |
| foal | 2 | 2 | GB 12월 · IE 11월 |
| breeze_up | 2 | 2 | IE 4월 · US 5월 |
| horses_in_training | 2 | 2 | GB 10월 · FR 10월 |
| breeding_stock | 3 | 3 | GB 12월 · FR 12월 · US 11월 |

## 3. 북 설계 요약

- 대형 1세마 세일(북 3개 이상): 북 1 maxSireTier 는 모두 1, 북 1 lotsTarget 은 140~180(100~250 범위), 뒤 북은 250~580(250~600 범위). 북 사이 weekOffset 차이는 0 또는 1.
- 미국 9월 초대형 1세마(sev_quenmoor_yearling_sep): 북 5개, 주 오프셋 0·0·1·1·2, maxSireTier 1→5 단조 증가.
- 소형 세일(북 1개)은 maxSireTier 5.
- 수수료율은 회사별로 0.035~0.055, 최소 입찰은 이유마 1,000 · 1세마 2,000~3,000 · 브리즈업 3,000 · 현역마·번식마 5,000.

## 4. 가상 이름 목록 (Opus 검수 대상)

모든 이름은 가상 조어 또는 data/people/places.json 의 regionNames 재사용이다. 실제 세일 회사·세일·경마장과 같거나 한 글자만 다른 이름이 없는지 확인 필요.

- 회사명 5개: Ashcombe Bloodstock Sales · Ardcarrig Thoroughbred Sales · Lorvaux Enchères · Wolfsrode Auktionen · Quenmoor Thoroughbred Sales
- 장소 5개: Kelsmoor Sales Park · Corrinvale Sales Grounds · Vesserac Pavillon de Vente · Adlerhain Auktionshalle · Halvard Sales Pavilion
  - Kelsmoor, Corrinvale, Vesserac, Adlerhain 은 places.json regionNames 재사용(GB·IE·FR·DE).
  - Halvard 는 미국 지명 풀에 없는 신규 조어. 실제 지명·사람 이름과 겹치는지 확인 필요.
- 세일 이름 15개: 2장 표의 '세일 이름' 전체. 'Ashcombe …', 'Ardcarrig …', 'Lorvaux …', 'Wolfsrode …', 'Quenmoor …' 접두어에 회사명과 종류·월을 붙인 형태다.
- 'Ashcombe' 는 명세의 영국 가상 지명 예시이고, 프로젝트에서 'Ashcombe Derby' 등 가상 경마장으로도 쓰인다(docs/race-calendar-plan.md). 세일 회사명으로 쓰는 것이 경마장 이름과 혼동을 낳을 수 있으니 Opus 판단 필요.
- 'Quenmoor', 'Ardcarrig', 'Lorvaux', 'Wolfsrode', 'Halvard' 는 신규 조어로 실존 여부를 확인하지 못했다. 확신 없음 — 필요 시 교체.

## 5. 금지어 검사 결과

- 실제 세일 회사명 목록(Tattersalls, Goffs, Arqana, Keeneland, Fasig-Tipton, BBAG, Tattersalls Ireland, OBS, Inglis, Magic Millions, Book 1, Orby, Houghton, Arc Sale, 추가 Weatherbys·Brightwells·Ocala·Ballsbridge·Fasig) 단어 단위 일치 0건.
- real_places.json blockedTokens 239개 단어 단위 일치 0건 (회사명·장소·세일 이름 모두).
- 실제 레이스 전체 이름 조합(Epsom Derby, Irish Derby, Kentucky Derby, Irish Oaks, King George, Prix de l'Arc) 0건.

## 6. 모티브 확인 필요 항목

2장 '모티브' 열은 기억에 근거한 설명용 대응이다. 세부 연도·개최지·북 구성이 실제와 다를 수 있으니 Opus 가 필요하면 확인한다(게임 데이터에는 들어가지 않음).
- 'Goffs Orby Sale 계열', 'Ocala Breeze Up 계열', 'Arqana 10월 현역마 세일 계열'은 개최 시기가 불확실하다.
- 'Tattersalls December Foal Sale' 와 'Tattersalls December Mares Sale' 은 이름 자체를 확실히 하지 못했다.
