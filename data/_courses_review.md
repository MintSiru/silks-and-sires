# 경마장 검수 목록 (M3-A3a 영국 9곳 · M3-A3b 아일랜드·독일·이탈리아 8곳 · M3-A3c 프랑스 6곳, 24곳 전체)

Opus 검수용. 실제 경마장·레이스 이름은 "모델" 칸(표 1의 3열)에만 쓴다. 가상 이름·실루엣·거리·커브는 이 파일과 data/racecourses.json 을 기준으로 한다.

## 0. 공통 규칙과 검증
- 레이아웃 검증: src/engine/course/load.ts 통과(닫힌 레이아웃 폐합 1m 이내, 고도 합 0, 커브 각도 합 2π±1%(절댓값 합), 열린 레이아웃 총길이 ≥ 최대 거리).
- 테스트 추가 검증: 폐합 오차 0.5m 이내, 둘레 범위(닫힌 고리 1,800~3,300m, 예외 2건 아래 5장), 열린 말굽 총길이 ≤ 4,200m, 형상 규칙(반경 2종 이상·비율 1.3↑, 비직각 커브, 15~35° 엘보 R400~700, 대칭 스타디움 금지), 커브 시퀀스(10° 반올림) 상호 상이, 실루엣 다양성(3장).
- 같은 거리를 두 레이아웃이 나눠 쓰면 (distance, layoutId) 쌍으로 구분하며, 배열의 첫 항목이 기본(주) 레이아웃이다.
- 직선 전용 레이아웃은 형상 검사에서 제외. AW(ardvarrow_park)도 제외.

## 1. 경마장별 설계 (19곳)

| id | 가상 이름 | 모델 | 실루엣 | 레이아웃 (id · 회전 · 폐합 · 폭 · 총길이 m) | 거리 목록 (m) |
|---|---|---|---|---|---|
| ashcombe | Ashcombe | Epsom | 말굽(열림): 오르막 출발 → 좌 엘보 → 내리막 2단 커브 → 결승 직선 | ashcombe_main · left · 열림 · 26 · 2,468 | 1006 · 1207 · 1408 · 1710 · 2012 · 2414 |
| marlow_downs | Marlow Downs | Newmarket (Rowley + July) | 직선 두 개와 우회전 라운드(열림) | marlow_straight · straight · 열림 · 40 · 2,040 / marlow_july · straight · 열림 · 36 · 1,800 / marlow_round · right · 열림 · 30 · 4,019 | 직선 1006 · 1207 · 1408 · 1609 · 1811 · 2012 / 여름 1006 · 1207 · 1609 / 라운드 2414 · 2816 · 3219 · 3620 |
| kingsmere_heath | Kingsmere Heath | Ascot | 우회전 삼각형(폐합, 3차 미변경) | kingsmere_triangle · right · 폐합 · 28 · 4,374 (예외) / kingsmere_straight · straight · 열림 · 30 · 1,800 | 직선 1006 · 1207 · 1609 / 삼각 1609 · 2012 · 2414 · 3218 · 4023 |
| easterholm | Easterholm | York | 좌회전 말굽(열림, 평탄, 3차 미변경) | easterholm_main · left · 열림 · 34 · 3,991 / easterholm_straight · straight · 열림 · 34 · 1,100 | 직선 1006 / 본 코스 1207 · 1408 · 1609 · 2072 · 2414 · 2816 · 3319 |
| selsworth_downs | Selsworth Downs | Goodwood | 우회전 열린 고리, 기복 ±14m, 급커브 | selsworth_main · right · 열림 · 30 · 4,063 / selsworth_straight · straight · 열림 · 30 · 1,250 | 직선 1207 / 본 코스 1006 · 1408 · 1609 · 2012 · 2414 · 3218 |
| dunholme_moor | Dunholme Moor | Doncaster | 좌회전 배(pear): 큰 커브 + 반대쪽 급커브 + 결승 직선 1,000m | dunholme_straight · straight · 열림 · 32 · 1,700 / dunholme_main · left · 폐합 · 32 · 3,245 | 직선 1609 (먼저) / 본 코스 1006 · 1207 · 1408 · 1609 · 2012 · 2414 · 2921 · 3620 |
| ravensbridge_park | Ravensbridge Park | Sandown | 우회전 불규칙 고리(폐합, 3차 미변경), 결승 600m 급오르막 | ravensbridge_oval · right · 폐합 · 26 · 4,022 (예외) / ravensbridge_straight · straight · 열림 · 26 · 1,200 | 직선 1006 / 고리 1609 · 2012 · 2414 |
| aldermoor_park | Aldermoor Park | Haydock | 좌회전 헤어핀 2개 + 엘보, 세로로 긴 작은 고리(폐합, 미변경) | aldermoor_main · left · 폐합 · 28 · 2,898 / aldermoor_straight · straight · 열림 · 26 · 1,250 | 직선 1207 / 본 코스 1006 · 1609 · 2012 · 2816 |
| wexborough | Wexborough | Newbury | 좌회전 넓은 고리(폐합), 커브 4개 반경 상이 | wexborough_main · left · 폐합 · 32 · 3,292 / wexborough_straight · straight · 열림 · 30 · 1,700 | 직선 1609 / 본 코스 1006 · 1207 · 1408 · 2012 · 2414 |
| kilcarrow_heath | Kilcarrow Heath | Curragh | 우회전 U자 말굽(열림), 큰 반경 | kilcarrow_straight · straight · 열림 · 36 · 1,450 / kilcarrow_main · right · 열림 · 36 · 3,306 | 직선 1408 / 본 코스 1006 · 1207 · 1609 · 2012 · 2414 · 2816 · 3218 |
| ballinvar | Ballinvar | Leopardstown | 좌회전 길쭉하지 않은 사다리꼴(폐합), 마지막 코너 급함 R165 | ballinvar_main · left · 폐합 · 30 · 3,193 | 1207 · 1408 · 1609 · 2012 · 2414 · 2816 |
| tullamere | Tullamere | Naas/Navan | 좌회전 둥근 사각형(폐합), 오르막 결승 | tullamere_main · left · 폐합 · 30 · 3,278 | 1006 · 1207 · 1609 · 2012 · 2414 |
| hohenmoor | Hohenmoor | Hamburg-Horn | 우회전 삼각형(폐합, 미변경), 급커브 R170 | hohenmoor_main · right · 폐합 · 30 · 3,259 | 1207 · 1609 · 2012 · 2414 |
| wesselfeld | Wesselfeld | Köln/Düsseldorf | 우회전 배(pear): 넓은 커브 R330 + 좁은 커브 R155 | wesselfeld_main · right · 폐합 · 30 · 3,164 | 1207 · 1609 · 2012 · 2213 · 2414 |
| lichtenau | Lichtenau | Baden-Baden | 좌회전 좁고 긴 고리(가로:세로 2.22), 백스트레치 도그레그 30° 2번 | lichtenau_main · left · 폐합 · 30 · 1,909 | 1207 · 1408 · 1609 · 2012 · 2414 · 2816 |
| torreverde | Torreverde | Roma Capannelle | 우회전 오각형 느낌(폐합, 커브 5개), 반경 265~325 | torreverde_main · right · 폐합 · 36 · 3,070 | 1207 · 1609 · 2012 · 2213 · 2414 |
| valmerano | Valmerano | Milano San Siro | 우회전 큰 고리(폐합), 결승 직선 700m | valmerano_main · right · 폐합 · 32 · 3,285 | 1207 · 1609 · 2012 · 2213 · 2414 · 2816 |

미변경: saint_ourens(FR, M3-A3c 에서 재설계 예정, 2,882m), ardvarrow_park(AW, features: tight_turns 만).

## 2. 커브 표 (커브 2개 이상인 레이아웃 전체)

회전각 = 커브 길이 / 반경(도). 총 회전각 = 모든 커브 회전각의 합(절댓값). 실루엣 비율 = 레이아웃 폴리라인 경계 상자의 긴 변/짧은 변.

| 레이아웃 | 폐합 | 둘레/총길이 m | 실루엣 비율 | 총 회전각 | 커브 (회전각 · 반경 · 방향) |
|---|---|---|---|---|---|
| ashcombe_main | 열림 | 2,468 | 1.24 | 160.0° | 20.0° R500 좌 (엘보) · 60.0° R300 좌 · 50.0° R170 좌 · 30.0° R250 좌 |
| marlow_round | 열림 | 4,019 | 1.12 | 200.0° | 110.0° R300 우 · 20.0° R500 우 (엘보) · 70.0° R220 우 |
| kingsmere_triangle | 폐합 | 4,374 (예외) | 1.37 | 360.0° | 115.0° R280 우 · 150.0° R320 우 · 20.0° R500 우 (엘보) · 75.0° R240 우 |
| easterholm_main | 열림 | 3,991 | 1.32 | 200.0° | 120.0° R350 좌 · 25.0° R500 좌 (엘보) · 55.0° R250 좌 |
| selsworth_main | 열림 | 4,063 | 1.17 | 295.0° | 110.0° R260 우 · 20.0° R500 우 (엘보) · 75.0° R220 우 · 90.0° R160 우 (급커브) |
| dunholme_main | 폐합 | 3,245 | 2.70 | 359.9° | 178.4° R255 좌 · 18.1° R445 좌 (엘보) · 163.4° R130 좌 |
| ravensbridge_oval | 폐합 | 4,022 (예외) | 1.13 | 360.0° | 110.0° R320 우 · 120.0° R220 우 · 20.0° R500 우 (엘보) · 110.0° R260 우 |
| aldermoor_main | 폐합 | 2,898 | 2.40 | 360.0° | 151.2° R150 좌 · 25.0° R520 좌 (엘보) · 183.8° R250 좌 |
| wexborough_main | 폐합 | 3,292 | 1.60 | 360.0° | 118.0° R305 좌 · 80.2° R185 좌 · 26.2° R480 좌 (엘보) · 135.6° R200 좌 |
| kilcarrow_main | 열림 | 3,306 | 1.51 | 190.3° | 100.9° R455 우 · 25.0° R590 우 (엘보) · 64.4° R425 우 |
| ballinvar_main | 폐합 | 3,193 | 1.16 | 360.0° | 78.0° R245 좌 · 108.1° R245 좌 · 83.5° R165 좌 (마지막 급커브) · 25.0° R485 좌 (엘보) · 65.4° R175 좌 |
| tullamere_main | 폐합 | 3,278 | 1.41 | 360.0° | 90.0° R120 좌 · 90.0° R135 좌 · 90.0° R140 좌 · 65.0° R155 좌 · 25.0° R485 좌 (엘보) |
| hohenmoor_main | 폐합 | 3,259 | 1.31 | 360.0° | 158.2° R295 우 · 119.4° R170 우 (급커브) · 20.0° R505 우 (엘보) · 62.4° R240 우 |
| wesselfeld_main | 폐합 | 3,164 | 1.92 | 360.0° | 188.8° R330 우 · 18.1° R515 우 (엘보) · 153.1° R155 우 |
| lichtenau_main | 폐합 | 1,909 | 2.22 | 359.9° | 148.2° R135 좌 · 31.4° R480 좌 (도그레그) · 29.6° R480 좌 (도그레그) · 150.7° R145 좌 |
| torreverde_main | 폐합 | 3,070 | 1.39 | 360.0° | 107.7° R325 우 · 81.2° R275 우 · 25.0° R480 우 (엘보) · 101.5° R285 우 · 44.6° R265 우 |
| valmerano_main | 폐합 | 3,285 | 1.21 | 360.0° | 116.1° R250 우 · 18.0° R595 우 (엘보) · 103.3° R210 우 · 122.6° R180 우 |

## 3. 미니맵 다양성 (실루엣 거리 d)

### 3-1. 측정 방법 (테스트 "미니맵 다양성 ..." 와 같은 계산)
1. 각 주 레이아웃(커브 2개 이상, GB·IE·DE·IT, AW 제외)의 layoutPolyline 을 둘레(호 길이) 기준 64점으로 리샘플.
2. 점 평균(중심)을 원점으로 옮기고, 둘레를 1로 정규화.
3. 두 실루엣 A, B 의 거리 d = min over {좌우 반전 여부, 방향(정·역), (둘 다 닫힌 고리일 때) 시작점 이동 64가지} 의 평균 점 간 거리.
4. 모든 쌍에 대해 d ≥ 0.010 을 요구.

### 3-2. 임계값 0.010 의 근거 (보정 실측)
| 비교 (둘레 1로 정규화한 도형) | d |
|---|---|
| 정사각형 vs 정사각형 가로·세로 2% 차이 | 0.003 |
| 정사각형 vs 가로·세로 5% 차이 | 0.0065 |
| 정사각형 vs 가로·세로 10% 차이 | 0.0127 |
| 원 vs 정사각형 | 0.020 |
| 정사각형 vs 1.3:1 직사각형 | 0.0185 |
| 정사각형 vs 1.6:1 직사각형 | 0.028 |
| 정사각형 vs 2.0:1 직사각형 | 0.041 |
- 명세 초안의 0.035 는 "정사각형 vs 약 1.8:1 직사각형" 수준이라 기존 Kingsmere(삼각)·Ravensbridge(고리) 쌍(d = 0.0198)을 통과하지 못한다. 두 곳은 바꾸지 않는 결정이므로 0.035 는 적용할 수 없다.
- 0.010 ≈ "가로·세로 약 8% 이상 차이 또는 커브 구조가 다른 모양". 시각적으로 구별되는 최소 수준으로 잡았다. 실측 최소 쌍(0.0127)은 위 "10% 차이" 수준이다.

### 3-3. 경마장별 최소 거리 (주 레이아웃끼리)
| 레이아웃 | 폐합 | 둘레 m | 비율 | 최소 d | 가장 가까운 상대 |
|---|---|---|---|---|---|
| ashcombe_main | 열림 | 2,468 | 1.24 | 0.0702 | selsworth_main |
| marlow_round | 열림 | 4,019 | 1.12 | 0.0771 | selsworth_main |
| kingsmere_triangle | 폐합 | 4,374 | 1.37 | 0.0198 | ravensbridge_oval |
| easterholm_main | 열림 | 3,991 | 1.32 | 0.0857 | kilcarrow_main |
| selsworth_main | 열림 | 4,063 | 1.17 | 0.0702 | ashcombe_main |
| dunholme_main | 폐합 | 3,245 | 2.70 | 0.0130 | aldermoor_main |
| ravensbridge_oval | 폐합 | 4,022 | 1.13 | 0.0198 | kingsmere_triangle |
| aldermoor_main | 폐합 | 2,898 | 2.40 | 0.0127 | lichtenau_main |
| wexborough_main | 폐합 | 3,292 | 1.60 | 0.0200 | lichtenau_main |
| kilcarrow_main | 열림 | 3,306 | 1.51 | 0.0776 | ashcombe_main |
| ballinvar_main | 폐합 | 3,193 | 1.16 | 0.0146 | torreverde_main |
| tullamere_main | 폐합 | 3,278 | 1.41 | 0.0212 | ravensbridge_oval |
| hohenmoor_main | 폐합 | 3,259 | 1.31 | 0.0157 | torreverde_main |
| wesselfeld_main | 폐합 | 3,164 | 1.92 | 0.0197 | aldermoor_main |
| lichtenau_main | 폐합 | 1,909 | 2.22 | 0.0127 | aldermoor_main |
| torreverde_main | 폐합 | 3,070 | 1.39 | 0.0146 | ballinvar_main |
| valmerano_main | 폐합 | 3,285 | 1.21 | 0.0180 | ballinvar_main |

- 전체 최소 d = 0.0127 (Aldermoor ~ Lichtenau), 다음 0.0130 (Dunholme ~ Aldermoor). 둘 다 임계 0.010 을 넘는다.
- Aldermoor 는 "짧고 급한 커브 2개 + 엘보" 명세 때문에 세로로 긴 헤어핀 형태가 되었다. Dunholme(배, 비율 2.7)·Lichtenau(좁고 긴, 2.2)와 같은 세로로 긴 계열이라 d 가 작다. 셋 중 하나를 더 바꾸면 값은 올라가지만, 명세 형태를 깨기 때문에 그대로 두었다.

## 4. 형상·크기 점검 결과
- 형상 규칙: 17개 주 레이아웃 전부 통과.
- 커브 시퀀스(10° 반올림): GB·IE·DE·IT 주 레이아웃 17개 전부 서로 다름(테스트 통과).
- 폐합: 모든 닫힌 레이아웃 0.07m 이하(최대 Torreverde 0.070m, Lichtenau 0.043m).
- 둘레: 닫힌 고리 1,800~3,300m 범위 내(예외 Kingsmere 4,374m·Ravensbridge 4,022m). 열린 말굽 총길이 ≤ 4,200m (Kilcarrow 3,306m, Easterholm 3,991m, Marlow 4,019m, Selsworth 4,063m 모두 통과).

## 5. 결정·명세와 다른 점 (Opus 확인 요청)

### 5-1. 기존 두 곳 예외
- **Kingsmere 둘레 4,374m, Ravensbridge 둘레 4,022m** 은 "바꾸지 않는다"는 결정에 따라 둘레 상한 테스트에서 예외 처리했다(코드 상수 PERIMETER_EXEMPT). 상한을 적용하려면 두 레이아웃을 줄여야 한다.

### 5-2. 실루엣 수치 조정
1. **Torreverde 반경:** 명세 초안의 R500~650 은 둘레 3,300m 상한과 맞지 않는다(360° 커브 호 길이 합 ≈ 2π × 평균 반경 → R500 이상이면 둘레 3,140m 이상). 그래서 반경 265~325(엘보 R480)로 낮췄다.
2. **Tullamere 비율 1.41**(명세 ≈ 1.6 미달): 둘레 3,300m 안에서 비율 1.6 을 얻으려면 긴 변이 둘레를 넘는다. 모서리 반경 120~155 도 서로 비슷해 "모서리 반경 상이"가 약하다.
3. **Wexborough 비율 1.60**: 허용 범위(1.68 이하) 안이다. 탐색(허용 대역 1.6~1.75)에서 다양성 최대 조건을 주는 값이 1.60 이었다.
4. **Dunholme 비율 2.70**: 다양성 확보를 위해 2.6~3.4 구간에서 선택. 결승 직선 1,000m 는 유지. 커브는 명세 "한쪽 큰 커브 + 반대쪽 급커브"를 178°·163° 두 개 + 엘보 18°로 구성.
5. **Lichtenau 비율 2.22 · 둘레 1,909m**: 명세 "≥2.2 로 완화" 충족. 도그레그 2개는 둘 다 좌회전(혼합 방향은 검증기가 거부한다).
6. **Kilcarrow**: 총길이 3,306m(≥ 최대 거리 3,218m 필요). 커브 반경 425~590(명세 R450~600 에서 425 한 곳이 벗어남). 결승 직선은 명세 초안의 900m 가 아니라 마지막 직선 315m 다(둘레 상한 4,200m 와 최대 거리 3,218m 를 맞추느라 짧게 잡았다).
7. **Ballinvar 비율 1.16**: 명세 "길쭉하지 않은 사다리꼴" 충족.

### 5-3. 명세 기준 임계값
- 다양성 임계값 d ≥ 0.010 (3-2 근거). 명세 초안의 0.035 는 기존 Kingsmere·Ravensbridge 쌍(0.0198)과 양립하지 않는다. 더 엄격하게 하려면 Kingsmere 또는 Ravensbridge 중 하나의 형상 변경이 필요하다.

## 6. 가상 이름 목록 (Opus 검수용)

| 구분 | 이름 | 근거 |
|---|---|---|
| 경마장 | Ashcombe · Marlow Downs | 기존 이름 유지 (기존 검수 항목) |
| 경마장 | Kingsmere Heath | 가상 지명 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Easterholm | 가상 지명 조합(East + holm). 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Selsworth Downs | 가상 지명 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Dunholme Moor · Ravensbridge Park · Aldermoor Park · Wexborough | 영국 지명 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Kilcarrow Heath | 아일랜드 지명 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Ballinvar | 아일랜드 지명 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Tullamere | 명세 지정 이름. 실존 아일랜드 소도시 Tullamore 와 한 글자 차이(지명이라 금지 대상 아님). 확인 필요 |
| 경마장 | Hohenmoor · Wesselfeld · Torreverde · Valmerano | 독일·이탈리아 지명 형태 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Lichtenau | 명세 지정 이름. 실존 독일 지자체 이름과 같음(지명이라 금지 대상 아님). 확인 필요 |
| 레이아웃 | Main Course · Straight Course · Summer Straight Course · Round Course · Triangle Course · Oval Course | 일반어 표시명 |

## 7. M3-A3c 프랑스 6곳 (Saint-Ourens 재설계 포함, 3차 반려 반영)

모델 칸(표 7-1의 3열)에만 실제 경마장 이름을 쓴다. Saint-Ourens 는 기존 id 를 유지하고 대칭 스타디움을 버린 재설계다.
Kilcarrow Heath 는 결승 직선을 315m 에서 800m 로 늘렸다(명세 추가 규칙).
3차 반려 반영: Montvigne 마지막 세그먼트를 결승 직선 300m 로 바꿔 고리를 다시 닫았다. Port-Aubray 라운드는 결승 직선 465m 이고 긴 변 2개를 가진 D형 고리(우회전)로 바꿨다. Bellerive-le-Bois 라운드는 길쭉한 배 모양(비율 2.99, 한쪽 끝 크게 · 다른 쪽 좁게)으로 바꿨다.

### 7-1. 경마장별 설계

| id | 가상 이름 | 모델 | 실루엣 | 레이아웃 (id · 회전 · 폐합 · 폭 · 총길이 m) | 거리 목록 (m) |
|---|---|---|---|---|---|
| saint_ourens | Saint-Ourens | ParisLongchamp | 우회전 대형 고리: 백스트레치 오르막 +10m → 정점 → 내리막 커브 −10m → 가짜 직선(250m 뒤 짧은 커브 R645) → 결승 직선 530m 평탄 | saint_ourens_grande · right · 폐합 · 34 · 3,277 / saint_ourens_straight · straight · 열림 · 34 · 1,100 | 직선 1000 / 대형 1400 · 1600 · 1850 · 2000 · 2100 · 2400 · 3000(성능 테스트용 추가) · 3100 · 4000 |
| vallenaire | Vallenaire | Chantilly | 넓은 둥근 삼각형(폐합), 결승 직선 600m 완만한 오르막 +3m | vallenaire_main · right · 폐합 · 30 · 3,213 | 1200 · 1400 · 1600 · 2000 · 2100 · 2400 |
| port_aubray | Port-Aubray | Deauville | 직선 1,600m + 우회전 D형 고리(폐합, 긴 변 2개: 685m 와 결승 465m) | port_aubray_straight · straight · 열림 · 40 · 1,600 / port_aubray_round · right · 폐합 · 30 · 2,229 | 직선 1000 · 1200 · 1300 · 1400 · 1500 · 1600 / 고리 2000 · 2500 (둘레보다 길어 한 바퀴 넘게 돈다) |
| clairval | Clairval | Saint-Cloud | 길쭉한 사다리꼴(폐합, 비율 2.18), 좌회전, 평탄, 결승 직선 550m | clairval_main · left · 폐합 · 30 · 3,132 | 1400 · 1600 · 2000 · 2100 · 2400 |
| bellerive_le_bois | Bellerive-le-Bois | Maisons-Laffitte | 직선 2,000m + 좌회전 배(pear) 고리(폐합, 비율 2.99): 한쪽 끝 크게 돌고(183° R225) 다른 쪽 좁게 돈다(152° R100) | bellerive_straight · straight · 열림 · 40 · 2,000 / bellerive_round · left · 폐합 · 32 · 3,107 | 직선 1000 · 1200 · 1400 · 1600 · 2000 / 고리 2400 |
| montvigne | Montvigne | Lyon/Marseille | 작은 불규칙 고리(폐합, 둘레 2,179m), 좌회전 5개 커브, 결승 직선 300m | montvigne_main · left · 폐합 · 28 · 2,179 | 1200 · 1600 · 2000 · 2400 (둘레보다 길어 한 바퀴 넘게 돈다) |

### 7-2. 커브 표 (프랑스 주 레이아웃 + Kilcarrow 변경)

| 레이아웃 | 폐합 | 둘레/총길이 m | 실루엣 비율 | 결승 직선 m | 총 회전각 | 커브 (회전각 · 반경 · 방향) |
|---|---|---|---|---|---|---|
| saint_ourens_grande | 폐합 | 3,277 | 2.10 | 530 | 360.0° | 76.2° R210 우 · 89.9° R210 우 · 105.2° R250 우 · 66.3° R190 우 · 22.4° R645 우 (가짜 직선 뒤 짧은 커브) |
| vallenaire_main | 폐합 | 3,213 | 1.26 | 600 | 360.0° | 138.1° R160 우 · 113.6° R160 우 · 83.3° R180 우 · 25.0° R505 우 (엘보) |
| port_aubray_round | 폐합 | 2,229 | 3.17 | 465 | 360.0° | 179.9° R150 우 (U턴, 긴 변 685m 앞) · 155.1° R120 우 · 25.0° R520 우 (엘보) |
| clairval_main | 폐합 | 3,132 | 2.18 | 550 | 360.0° | 25.0° R490 좌 (엘보) · 65.1° R260 좌 · 86.2° R235 좌 · 98.9° R160 좌 · 84.8° R330 좌 |
| bellerive_round | 폐합 | 3,107 | 2.99 | 520 | 360.0° | 183.3° R225 좌 (큰 끝) · 151.7° R100 좌 (좁은 끝) · 25.0° R515 좌 (엘보) |
| montvigne_main | 폐합 | 2,179 | 1.06 | 300 | 360.0° | 79.4° R125 좌 · 94.1° R190 좌 · 76.5° R220 좌 · 25.0° R510 좌 (엘보) · 85.0° R145 좌 |
| kilcarrow_main (변경) | 열림 | 3,791 | 1.06 | 800 | 190.3° | 100.9° R455 우 · 25.0° R590 우 (엘보) · 64.4° R425 우 |

### 7-3. 다양성 최소 거리 (정규화 실루엣, 전 경마장 주 레이아웃)
d 임계값은 0.010 으로 유지했다(3-2 근거). 프랑스 6곳 최소 d: Saint-Ourens 0.0112(~Wesselfeld), Vallenaire 0.0185(~Hohenmoor), Port-Aubray 0.0108(~Bellerive), Clairval 0.0110(~Lichtenau), Bellerive 0.0108(~Port-Aubray), Montvigne 0.0175(~Tullamere). 전체 최소 쌍은 0.0108(Port-Aubray ~ Bellerive)이다. 두 곳은 둘 다 세로로 긴 계열이라 여유가 적다.

### 7-4. 결정·명세와 다른 점
1. **결승 직선 규칙 (반려 4):** 모든 레이아웃의 마지막 세그먼트는 직선이다. 라운드 레이아웃은 모든 거리에서 결승 직선 ≥250m 다. Montvigne 300m, Port-Aubray 465m, Bellerive 520m 로 모두 충족한다. 기존 경마장 중 이 검사에 걸리는 곳은 없었다.
2. **Port-Aubray 형상:** 명세 "직선 코스와 나란한 긴 변 2개의 비대칭 D형/사다리꼴" 을 U턴 1개(R150 179.9°) + 긴 변 685m + 짧은 곡선(R120 155°) + 엘보 + 결승 직선 465m 로 구현했다. 긴 변 2개는 U턴 반대편(685m)과 결승 직선(465m)이다. 우회전이다(명세 handedness). 처음엔 좌회전으로 만들었다가 우회전으로 뒤집었다(거울상이라 형상·다양성 값은 같다).
3. **Bellerive 배 모양:** 명세 "긴 축:짧은 축 ≥1.8, 한쪽 끝 크게 · 다른 쪽 좁게" 대로다(비율 2.99). 결승 직선 520m 는 명세 500m 를 유지했다(검색 범위 안).
4. **Montvigne 결승 직선:** 명세 300~380m 범위 하한 300m 다. 둘레 2,179m 로 상한 2,300m 에서 여유가 있다.
5. **Vallenaire 삼각형 유지(명세대로).** Valmerano 는 반려 항목에 없어 이전 형상(큰 고리, 비율 1.26)을 그대로 두었다. 삼각형 실루엣 계열은 Vallenaire·Valmerano 두 곳이다.
6. **Saint-Ourens 거리 3000m 추가:** tests/verify/performance.test.ts 의 3,000m 성능 테스트 때문에 추가했다(명세 목록의 상위집합).
7. **Kilcarrow:** 결승 직선 800m 로 늘렸다. 실루엣 비율은 1.06 이다.
8. **races.json:** 기존 프랑스 레이스 3개(2400·2000·1600)가 새 목록에 있으므로 변경하지 않았다.
9. **둘레 예외:** Kingsmere·Ravensbridge 는 기존 예외 유지(2차 결정).

### 7-5. 가상 이름 목록 (프랑스)
| 구분 | 이름 | 근거 |
|---|---|---|
| 경마장 | Vallenaire · Port-Aubray · Clairval · Bellerive-le-Bois · Montvigne | 프랑스 지명 형태 조합. 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Saint-Ourens | 기존 가상 이름 유지 |
| 레이아웃 | Sprint Straight | 일반어 표시명 |
