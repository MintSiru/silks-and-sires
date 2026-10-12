# 경마장·레이스 캘린더 계획 (M3 기준안)

작성: Opus · 2026-10-11 · 상태: **사용자 검토용 초안** (확정 후 data/racecourses.json, data/races.json 로 옮긴다)

> 표기 원칙(CLAUDE.md 원칙 1): 경마장·레이스 이름은 전부 가상이다. 클래식 유형명(2000/1000 Guineas, Derby, Oaks, St Leger)만 가상 지명과 결합해 쓴다.
> "모델" 열의 실제 레이스·경마장 이름은 **이 설계 문서 안에서만** 참고로 쓰며, 코드·데이터·UI 에는 절대 들어가지 않는다.

## 1. 원칙

1. **시즌:** 잔디 평지 시즌은 4월 1주 ~ 11월 4주(32주). 12~3월은 비시즌(아래 Q2 결정에 따라 올웨더 하위 경주만 또는 완전 휴지).
2. **코스 설계:** 미국·일본·두바이·사우디·홍콩식 평탄 타원형을 피한다. 유럽 실제 명문 경마장처럼 **기복·급커브·내리막·오르막 결승·직선 코스·가짜 직선·딥(움푹 꺼진 구간)** 을 코스마다 다르게 준다. 같은 거리라도 코스마다 요구 능력이 달라야 한다(파워·근성·순발력·좌우 회전 적성).
3. **레이스 계층:** G1 → G2 → G3 → 리스티드 → 클래스 1~7 핸디캡·메이든·노비스. G1·G2·G3·리스티드는 고정 일정, 핸디캡·메이든은 개최일마다 자동 생성.
4. **시리즈:** 5개국 클래식 3관·티아라 3관, 유럽 더비 3관, 유럽 마일 3관, 영국 오크스 3관, 유러피언 스테이어 시리즈, 유러피언 스프린트 시리즈. 우승 보너스와 칭호.
5. **규모:** 유럽 G1 약 90, G2 약 70, G3 약 110, 리스티드 약 150 + 자동 생성 경주. 원정(미국 가을 챔피언십, 호주 컵)은 별도.

## 2. 경마장 (유럽 24 + 원정 2 = 26곳)

### 2-1. 영국 9곳
| 가상 이름 | 모델 | 레이아웃 핵심 | 주요 개최 |
|---|---|---|---|
| **Ashcombe** (기존) | Epsom | 좌회전 말굽. 오르막 출발 → 정점 후 급내리막 + 급커브(언덕 코너) → 캠버(안쪽으로 기운) 결승 직선 700m, 마지막 200m 오르막. 좌회전·기복 적성 극대 | 더비·오크스 |
| **Marlow Downs** (기존) | Newmarket (Rowley + July) | ① 직선 2,000m 넓은 직선 코스, 결승 400m 앞 **딥** 후 오르막 ② 여름용 별도 직선(July 코스) | 2000·1000 기니, 여름 스프린트, 가을 2세 G1 |
| **Kingsmere Heath** | Ascot | 우회전 삼각형, 긴 내리막 백스트레치 → 스윙 커브 → 오르막 결승 직선 500m. 별도 직선 1,600m | 여름 미팅(5일), 한여름 2,400m 최고 G1, 가을 챔피언스 데이 |
| **Easterholm** | York | 좌회전 L자, 완전 평탄·넓음, 결승 직선 900m. 갤러퍼 코스 | 8월 페스티벌(2,050m 최고 G1, 노던 오크스, 1,000m 스프린트) |
| **Selsworth Downs** | Goodwood | 우회전 고리 + 직선 1,200m. 큰 기복, 결승 전 급내리막·급커브. 안쪽 게이트 유리 | 8월 페스티벌(마일 G1, 장거리 컵, 빈마 G1) |
| **Dunholme Moor** | Doncaster | 좌회전 서양배 모양, 평탄, 결승 직선 1,000m + 직선 1,600m | 세인트레저, 2세 퓨처리티 |
| **Ravensbridge Park** | Sandown | 우회전 타원 + 급경사 오르막 결승 600m(전체 고저차 큼) | 7월 2,000m 최고 G1 |
| **Aldermoor Park** | Haydock | 좌회전 평탄, 직선 1,200m | 9월 스프린트 G1 |
| **Wexborough** | Newbury | 좌회전 평탄, 넓은 직선 1,600m | 5월 고마 마일 G1, 기니 트라이얼 |

### 2-2. 아일랜드 4곳
| 가상 이름 | 모델 | 레이아웃 핵심 | 주요 개최 |
|---|---|---|---|
| **Kilcarrow Heath** | Curragh | 우회전 넓은 말굽, 완만한 기복, 결승 직선 900m + 직선 1,400m | 아일랜드 클래식 5개, 2세 G1 |
| **Ballinvar** | Leopardstown | 좌회전, 짧은 결승 직선 450m, 마지막 코너 급함 | 9월 아일랜드 최고 2,000m G1 |
| **Tullamere** | Naas/Navan | 좌회전, 오르막 결승 | 봄 트라이얼 |
| **Ardvarrow Park** (기존, AW) | Dundalk | 좌회전 올웨더 타원(유일하게 타원 허용) | 겨울 올웨더 |

### 2-3. 프랑스 6곳
| 가상 이름 | 모델 | 레이아웃 핵심 | 주요 개최 |
|---|---|---|---|
| **Saint-Ourens** (기존) | ParisLongchamp | 우회전 대형. 백스트레치 오르막 10m → 내리막 커브 → **가짜 직선**(커브 같은 직선 250m) → 결승 직선 530m | 가을 최고 2,400m G1 주말(7개 G1), 기니 |
| **Vallenaire** | Chantilly | 우회전, 숲 사이 넓은 코스, 결승 직선 600m, 완만한 오르막 | 프랑스 더비·오크스 |
| **Port-Aubray** | Deauville | 직선 1,600m(바닷바람) + 우회전 원형 | 8월 마일·스프린트·2세 G1 |
| **Clairval** | Saint-Cloud | 좌회전, 평탄, 결승 직선 550m | 7월 2,400m G1, 2세 크리테리움 |
| **Bellerive-le-Bois** | Maisons-Laffitte | 직선 2,000m(유럽 최장 직선 가운데 하나) | 스프린트·리스티드 |
| **Montvigne** | Lyon/Marseille | 좌회전 지방 코스 | 하위 경주 |

### 2-4. 독일 3곳 · 이탈리아 2곳
| 가상 이름 | 모델 | 레이아웃 핵심 | 주요 개최 |
|---|---|---|---|
| **Hohenmoor** (DE) | Hamburg-Horn | 우회전, 결승 직선 오르막 | 독일 더비 |
| **Wesselfeld** (DE) | Köln/Düsseldorf | 우회전, 기복 | 독일 기니·오크스 |
| **Lichtenau** (DE) | Baden-Baden | 좌회전, 산간 기복, 결승 직선 500m | 9월 독일 최고 G1, 세인트레저 |
| **Torreverde** (IT) | Roma Capannelle | 우회전, 넓음 | 이탈리아 기니·더비 |
| **Valmerano** (IT) | Milano San Siro | 우회전, 긴 결승 직선 | 이탈리아 오크스·6월 G1·세인트레저 |

### 2-5. 원정 2곳 (Q3 결정에 따라 M3 후반 또는 M5)
| 가상 이름 | 모델 | 특징 | 개최 |
|---|---|---|---|
| **Cedar Ridge** (US) | Keeneland/Churchill | 더트 타원 + 안쪽 잔디(미국은 타원 그대로) | 11월 1주 가을 챔피언십(5개 G1) |
| **Yarrabend** (AU) | Flemington | 좌회전 대형, 직선 1,200m | 11월 1주 3,200m 핸디캡 G1 |

## 3. 시리즈

| 시리즈 | 구성 (일정) | 보상 |
|---|---|---|
| **영국 클래식 3관** | Marlow 2000 Guineas(5/1) → Ashcombe Derby(6/1) → Dunholme St Leger(9/2) | 3관 칭호·종마 가치 대폭↑ |
| **영국 티아라** | Marlow 1000 Guineas(5/1) → Ashcombe Oaks(6/1) → Dunholme St Leger(9/2) | 칭호 |
| **아일랜드 3관/티아라** | Kilcarrow 2000/1000 Guineas(5/4) → Kilcarrow Derby(6/4) / Kilcarrow Oaks(7/2) → Kilcarrow St Leger(9/2) | 칭호 |
| **프랑스 3관/티아라** | Saint-Ourens 2000/1000 Guineas(5/2) → Vallenaire Derby(6/2) / Vallenaire Oaks(6/3) → Saint-Ourens St Leger(10/4) / Prix des Glycines(9/3) | 칭호 |
| **독일 3관/티아라** | Wesselfeld 2000 Guineas(5/4) / 1000 Guineas(6/1) → Hohenmoor Derby(7/1) / Wesselfeld Oaks(8/1) → Lichtenau St Leger(9/3) | 칭호 |
| **이탈리아 3관/티아라** | Torreverde 2000/1000 Guineas(4/3) → Torreverde Derby(5/3) / Valmerano Oaks(5/4) → Valmerano St Leger(9/4) / Premio Dama di Torreverde(10/2) | 칭호 |
| **유럽 더비 3관** | Ashcombe Derby(6/1, 2,400) → Vallenaire Derby(6/2, 2,100) → Kilcarrow Derby(6/4, 2,400) | 큰 보너스(4주 3전 강행군 vs 보상) |
| **유럽 마일 3관** | Selsworth Mile(8/1) → Prix du Grand Phare(8/2) → Kingsmere Autumn Mile(10/3) | 보너스 |
| **영국 오크스 3관** | Ashcombe Oaks(G1 6/1) → Ladysmock Stakes(G2 6/3, 3세 암말 2,400) → Northern Oaks(G1 8/3) | 보너스 |
| **유러피언 스테이어 시리즈** | Easterholm Spring Cup(G2 5/2) → Kingsmere Cup(G1 6/3) → Selsworth Cup(G1 8/1) → Easterholm Cup(G2 8/3) → Prix du Long Chemin(G1 10/1) | Kingsmere Cup 포함 3승 시 보너스 |
| **유러피언 스프린트 시리즈** | 스프린트 G1 9개 포인트제(1위 10·2위 6·3위 4·4위 2) | 시즌 1위 보너스·"스프린트 챔피언" |

(일정 표기: 월/주. 예: 6/1 = 6월 1주)

## 4. 연간 G1 캘린더 (유럽)

등급·조건 약어: 3c = 3세 수말·암말, 3f = 3세 암말, 2c/2f = 2세, 3+ = 3세 이상, 4+ = 4세 이상, F&M = 암말 한정.

### 4월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 3 | Torreverde | Torreverde 2000 Guineas / 1000 Guineas | 1,600 | 3c / 3f | Parioli / Regina Elena |
| 4 | Saint-Ourens | Prix des Tilleuls | 2,100 | 4+ | Ganay |

### 5월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Marlow Downs | Marlow 2000 Guineas / Marlow 1000 Guineas | 1,600 | 3c / 3f | 2000/1000 Guineas |
| 2 | Saint-Ourens | Saint-Ourens 2000 Guineas / 1000 Guineas | 1,600 | 3c / 3f | Poulains / Pouliches |
| 3 | Wexborough | Wexborough Mile | 1,600 | 4+ | Lockinge |
| 3 | Torreverde | Torreverde Derby | 2,200 | 3c | Derby Italiano |
| 4 | Kilcarrow Heath | Kilcarrow 2000 Guineas / 1000 Guineas | 1,600 | 3c / 3f | Irish Guineas |
| 4 | Kilcarrow Heath | Kilcarrow Spring Crown | 2,100 | 4+ | Tattersalls Gold Cup |
| 4 | Vallenaire | Prix des Ormes | 2,000 | 3f | Saint-Alary |
| 4 | Wesselfeld | Wesselfeld 2000 Guineas | 1,600 | 3c | Mehl-Mülhens |
| 4 | Valmerano | Valmerano Oaks | 2,200 | 3f | Oaks d'Italia |

### 6월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Ashcombe | **Ashcombe Derby** / Ashcombe Oaks | 2,400 | 3c / 3f | Derby / Oaks |
| 1 | Ashcombe | Ashcombe Coronet | 2,400 | 4+ | Coronation Cup |
| 1 | Wesselfeld | Wesselfeld 1000 Guineas | 1,600 | 3f | German 1000 Guineas |
| 2 | Vallenaire | **Vallenaire Derby** | 2,100 | 3c | Jockey Club |
| 2 | Saint-Ourens | Prix de Morvenne (기존 이름 승격) | 1,850 | 4+ | Ispahan |
| 2 | Valmerano | Gran Premio di Valmerano | 2,400 | 3+ | GP di Milano |
| 3 | Vallenaire | Vallenaire Oaks | 2,100 | 3f | Diane |
| 3 | Kingsmere Heath | **여름 미팅 5일**: Sovereign Mile / Crown Sprint / Heathland Mile / Kingsmere Midsummer Stakes / Bluebell Stakes / **Kingsmere Cup** / Hawthorn Sprint / Highcourt Sprint | 1,600 / 1,000 / 1,600 / 2,000 / 1,600 / 4,000 / 1,200 / 1,200 | 4+ / 3+ / 3c / 4+ / 3f / 4+ / 3 / 4+ | Queen Anne / King's Stand / St James's Palace / Prince of Wales's / Coronation / Gold Cup / Commonwealth Cup / Diamond Jubilee |
| 4 | Kilcarrow Heath | **Kilcarrow Derby** | 2,400 | 3c | Irish Derby |
| 4 | Kilcarrow Heath | Meadowsweet Stakes | 2,000 | F&M 3+ | Pretty Polly |

### 7월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Ravensbridge Park | **Ravensbridge Summer Cup** | 2,000 | 3+ | Eclipse |
| 1 | Hohenmoor | **Hohenmoor Derby** | 2,400 | 3c | Deutsches Derby |
| 1 | Clairval | Grand Prix de Clairval | 2,400 | 4+ | GP de Saint-Cloud |
| 2 | Marlow Downs (July) | **Midsummer Sprint** / Linden Stakes | 1,200 / 1,600 | 3+ / F&M 3+ | July Cup / Falmouth |
| 2 | Vallenaire | Prix de Vallenaire (기존 이름 승격) | 1,600 | 3c | Jean Prat |
| 2 | Kilcarrow Heath | Kilcarrow Oaks | 2,400 | 3f | Irish Oaks |
| 3 | Saint-Ourens | Grand Prix de Saint-Ourens (기존 이름) | 2,400 | 3c | Grand Prix de Paris |
| 4 | Kingsmere Heath | **Kingsmere Summer Crown** (영국 최고 위상) | 2,400 | 3+ | King George VI & QE |

### 8월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Selsworth Downs | **Selsworth Mile** / **Selsworth Cup** / Downland Stakes | 1,600 / 3,200 / 2,000 | 3+ / 3+ / F&M 3+ | Sussex / Goodwood Cup / Nassau |
| 1 | Port-Aubray | Prix de la Plage / Prix des Dunes | 1,600 / 1,300 | F&M 3+ / 3+ | Rothschild / Maurice de Gheest |
| 1 | Wesselfeld | Wesselfeld Oaks | 2,200 | 3f | Preis der Diana |
| 2 | Port-Aubray | **Prix du Grand Phare** | 1,600 | 3+ | Jacques le Marois |
| 2 | Kilcarrow Heath | Kilcarrow Juvenile Sprint | 1,200 | 2 | Phoenix |
| 3 | Easterholm | **Easterholm Grand Stakes** / **Northern Oaks** / Easterholm Dash | 2,050 / 2,400 / 1,000 | 3+ / F&M 3+ / 2+ | International / Yorkshire Oaks / Nunthorpe |
| 3 | Port-Aubray | Prix des Embruns / Prix des Mouettes | 1,200 / 2,000 | 2 / F&M 3+ | Morny / Jean Romanet |

### 9월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Aldermoor Park | Aldermoor Sprint | 1,200 | 3+ | Haydock Sprint Cup |
| 1 | Saint-Ourens | Prix de la Butte | 1,600 | 3+ | Moulin |
| 1 | Lichtenau | **Großer Preis von Lichtenau** (독일 최고 위상) | 2,400 | 3+ | Grosser Preis von Baden |
| 2 | Ballinvar | **Ballinvar Crown** (아일랜드 최고 위상) / Hollyhock Stakes | 2,000 / 1,600 | 3+ / F&M 3+ | Irish Champion / Matron |
| 2 | Kilcarrow Heath | Kilcarrow St Leger / Kilcarrow Juvenile Stakes / Kilcarrow Fillies' Stakes | 2,800 / 1,400 / 1,400 | 3+ / 2c / 2f | Irish St Leger / National / Moyglare |
| 2 | Dunholme Moor | **Dunholme St Leger** | 2,900 | 3c | St Leger |
| 3 | Saint-Ourens | Prix des Glycines | 2,400 | 3f | Vermeille |
| 3 | Lichtenau | Lichtenau St Leger | 2,800 | 3c | Deutsches St Leger |
| 4 | Marlow Downs | Marlow Juvenile Cup / Marlow Fillies' Sprint / Silverbirch Stakes | 1,200 / 1,200 / 1,600 | 2c / 2f / F&M 3+ | Middle Park / Cheveley Park / Sun Chariot |
| 4 | Valmerano | Valmerano St Leger | 2,800 | 3c | St Leger Italiano |

### 10월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Saint-Ourens | **Prix de l'Étoile d'Automne** (유럽 최고 위상) / Prix de la Rotonde / Prix de la Cascade / Prix des Jeunes Espoirs / Prix des Demoiselles / Prix du Bois-Doré / Prix du Long Chemin | 2,400 / 2,000 / 1,000 / 1,400 / 1,600 / 1,400 / 4,000 | 3+ / F&M 3+ / 2+ / 2c / 2f / 3+ / 4+ | Arc / Opéra / Abbaye / Jean-Luc Lagardère / Marcel Boussac / Forêt / Cadran |
| 2 | Marlow Downs | Chalkpit Stakes / Bramblewood Fillies' Stakes | 1,400 / 1,600 | 2c / 2f | Dewhurst / Fillies' Mile |
| 2 | Torreverde | Premio Dama di Torreverde | 2,000 | F&M 3+ | Lydia Tesio |
| 3 | Kingsmere Heath | **챔피언스 데이**: Kingsmere Autumn Crown / Kingsmere Autumn Mile / Kingsmere Ladies' Crown / Kingsmere Autumn Sprint | 2,000 / 1,600 / 2,400 / 1,200 | 3+ / 3+ / F&M 3+ / 3+ | Champion / QEII / Champion F&M / Champion Sprint |
| 4 | Dunholme Moor | Dunholme Futurity | 1,600 | 2 | Futurity Trophy |
| 4 | Clairval | Critérium d'Automne | 1,400 | 2 | Critérium International |
| 4 | Saint-Ourens | Saint-Ourens St Leger | 3,100 | 3c | Royal-Oak(프랑스 3관 마지막) |

### 11월
| 주 | 경마장 | 가상 이름 | 거리 | 조건 | 모델 |
|---|---|---|---|---|---|
| 1 | Clairval | Critérium de Clairval | 2,000 | 2 | Critérium de Saint-Cloud |
| 1 | Cedar Ridge (원정) | 가을 챔피언십: Championship Classic(더트) / Championship Turf / Championship Mile / Championship Fillies' Turf / Championship Juvenile Turf | 2,000 / 2,400 / 1,600 / 2,200 / 1,600 | 3+ / 3+ / 3+ / F&M / 2 | Breeders' Cup |
| 1 | Yarrabend (원정) | Yarrabend Cup (핸디캡) | 3,200 | 3+ | Melbourne Cup |
| 2~4 | 각국 | G3·리스티드·핸디캡으로 시즌 마감 | | | |

### 등급 결정 (사용자 2026-10-11: 현실 반영)
- 독일: Hohenmoor Derby·Wesselfeld Oaks 는 G1, Wesselfeld 2000/1000 Guineas 는 G2, Lichtenau St Leger 는 G3.
- 이탈리아: Torreverde Derby·Valmerano Oaks 는 G2, Torreverde 2000/1000 Guineas·Valmerano St Leger 는 G3. Gran Premio di Valmerano·Premio Dama di Torreverde 는 G1 유지.
- 비시즌(12~3월): 올웨더 리스티드 이하 경주만 개최.
- 경마장: M3 에서 유럽 24곳 전부 구축, 원정 2곳은 M5.

### 집계 (위 등급 결정 반영 전 원안 기준)
- 원안 88개 → 등급 결정 반영 후 **G1 80개**: 영국 36 · 아일랜드 12 · 프랑스 27 · 독일 3 · 이탈리아 2 + 독·이 하위 등급 클래식 8개(독 G2 2·G3 1, 이 G2 2·G3 3) (A4a 검수 때 정정)
- **2세 G1 13개**: Kilcarrow Juvenile Sprint, Prix des Embruns, Kilcarrow Juvenile Stakes, Kilcarrow Fillies' Stakes, Marlow Juvenile Cup, Marlow Fillies' Sprint, Prix des Jeunes Espoirs, Prix des Demoiselles, Chalkpit Stakes, Bramblewood Fillies' Stakes, Dunholme Futurity, Critérium d'Automne, Critérium de Clairval
- **빈마(암말) 한정 G1 24개**(2세 암말 G1 4개 별도): 3세 암말 클래식 10(5개국 1000 Guineas·Oaks) + Prix des Ormes, Bluebell, Meadowsweet, Linden, Downland, Prix de la Plage, Northern Oaks, Prix des Mouettes, Hollyhock, Prix des Glycines, Silverbirch, Prix de la Rotonde, Premio Dama di Torreverde, Kingsmere Ladies' Crown
- **국가별 최고 위상**: 영국 Kingsmere Summer Crown · 아일랜드 Ballinvar Crown · 프랑스 Prix de l'Étoile d'Automne · 독일 Großer Preis von Lichtenau · 이탈리아 Gran Premio di Valmerano

## 5. G1 아래 채우기

- **G2·G3·리스티드:** 각 G1 의 3~5주 전 트라이얼(기니 트라이얼, 더비 트라이얼, 아크 트라이얼 3개 등)과 같은 개최일의 보조 경주. 데이터는 G1 과 같은 형식으로 고정 일정.
- **헤리티지 핸디캡(이름 있는 큰 핸디캡) 8개:** 봄 마일, 여름 미팅 핸디캡 2, Easterholm 장거리 핸디캡(8월), 가을 9f 핸디캡(9월), 가을 장거리 핸디캡(10월) 등. 클래스 2, 상금 큼.
- **자동 생성:** 개최일마다 메이든·노비스·클래스 3~7 핸디캡을 OR 분포에 맞춰 생성(이름은 가상 어휘 조합). 주당 개최일 3~6곳 × 6~8경주.
- **성능 예산:** 시즌 약 900~1,100경주 × 레이스당 30ms ≈ 30초/시즌(주당 1초 안팎). 플레이어가 출주하지 않은 하위 경주는 시뮬레이션을 생략하고 결과만 추첨하는 "요약 모드"를 둔다(OR 갱신은 동일 규칙).

## 6. 엔진·데이터 작업

1. 레이아웃 확장: 이미 지원하는 직선/커브 구간 + 고도(rise)로 대부분 표현 가능. 추가할 것: **캠버(코너 안쪽 쏠림)** 를 레인 보정으로, **딥** 은 짧은 내리막+오르막 구간으로, **직선 코스와 라운드 코스의 합류** 는 별도 레이아웃으로.
2. 경마장 데이터: 레이아웃 실측 비율(직선 길이·고저차·커브 반경)을 모델 경마장 공개 수치에서 가져오되 이름·모양은 가상으로 바꾼다. 미니맵 실루엣이 실제 경마장과 똑같지 않게 좌우 반전·비율 변형.
3. 레이스 데이터: `RaceTemplate`(이름, 등급, 거리, 조건, 상금, 개최 월/주, 경마장, 시리즈 소속).
4. 시리즈 데이터: `SeriesDefinition`(레그 목록, 보상 규칙).
