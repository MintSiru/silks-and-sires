# 경마장 검수 목록 (M3-A3a, 영국 9곳, 2차 수정본)

Opus 검수용. 실제 경마장 이름은 "모델" 칸(표 1의 3열)에만 쓴다. 가상 이름·미니맵 모양·거리 목록은 이 파일과 data/racecourses.json 을 기준으로 한다.
모든 레이아웃은 src/engine/course/load.ts 검증(폐합·각도·고도 합, 열린 레이아웃 총길이 >= 최대 거리)을 통과한다.
거리는 펄롱 기반 근사값(1f = 201.168m)이다. 같은 거리를 두 레이아웃이 나눠 쓰면 (distance, layoutId) 쌍으로 구분하며, 첫 항목이 기본(주) 레이아웃이다(Race.layoutId 생략 시).

## 1. 경마장별 설계

| id | 가상 이름 | 모델 | 레이아웃 (id · 회전 · 폐합 · 폭 · 총길이 m) | 설계 메모 (고저차·직선·반경) | 거리 목록 (m, 첫 항목이 기본 레이아웃) |
|---|---|---|---|---|---|
| ashcombe | Ashcombe | Epsom | ashcombe_main · left · 열림 · 26 · 2,467.9 | 말굽: 출발 직선 450m 오르막 +8m → 좌 엘보 20°(R500) → 정점 직선 400m → 내리막 좌커브 2단(60° R300, 50° R170, 합계 −12m) → 직선 150m → 좌 30°(R250) → 결승 직선 700m(캠버 +0.6, 마지막 200m 오르막 +3m). 총 회전 160°, 결승 방향은 출발과 약 20° 차이로 대략 반대 | 1006 · 1207 · 1408 · 1710 · 2012 · 2414 |
| marlow_downs | Marlow Downs | Newmarket (Rowley + July) | marlow_straight · straight · 열림 · 40 · 2,040 / marlow_july · straight · 열림 · 36 · 1,800 / marlow_round · right · 열림 · 30 · 4,019.3 | 직선(Rowley): 결승 400m 앞 딥(1,640~1,840m, −3m) 후 마지막 200m 오르막 +4m. 여름 직선(marlow_july): 평탄 1,000m + 800m 완만한 오르막 +2m. 라운드: 우회전 110° R300 → 엘보 20° R500 → 우회전 70° R220 (총 회전 200°) | 직선 1006 · 1207 · 1408 · 1609 · 1811 · 2012 / 여름 1006 · 1207 · 1609 (주는 직선) / 라운드 2414 · 2816 · 3219 · 3620 |
| kingsmere_heath | Kingsmere Heath | Ascot | kingsmere_triangle · right · **폐합** · 28 · 4,374.3 / kingsmere_straight · straight · 열림 · 30 · 1,800 | 우회전 삼각형(폐합 오차 0.05m): 모서리 115° R280, 150° R320(apex), 엘보 20° R500(백스트레치 중간), 75° R240. 백스트레치(직선 520.9m + 엘보 + 직선 400m) 내리막 −20m, 반대편 직선 1,064.9m 오르막 +14m, 결승 직선 500m 오르막 +6m. 직선 코스: 1,000m 내리막 −8m + 800m 오르막 +6m | 직선 1006 · 1207 · 1609 (주) / 라운드(삼각) 1609 · 2012 · 2414 · 3218 · 4023 |
| easterholm | Easterholm | York | easterholm_main · left · 열림 · 34 · 3,991.2 / easterholm_straight · straight · 열림 · 34 · 1,100 | 좌회전 말굽(평탄): 직선 1,100m → 좌 120° R350 → 직선 500m → 엘보 좌 25° R500 → 직선 300m → 좌 55° R250 → 결승 직선 900m. 총 회전 200°. 고저차 0 | 직선 1006 / 본 코스 1207 · 1408 · 1609 · 2072 · 2414 · 2816 · 3319 |
| selsworth_downs | Selsworth Downs | Goodwood | selsworth_main · right · 열림 · 30 · 4,063.0 / selsworth_straight · straight · 열림 · 30 · 1,250 | 우회전 고리(열린 곡선, 총 회전 295°): 고저차 +14 → −6 → 600m 내리막 −22 → 엘보 20° R500 → 500m 오르막 +20 → 75° R220 → 350m 내리막 −12 → 급커브 90° R160 → 결승 직선 500m(앞 200m 내리막 −4, 뒤 300m 평탄). 기복 범위 −14~+14m | 직선 1207 / 본 코스 1006 · 1408 · 1609 · 2012 · 2414 · 3218 |
| dunholme_moor | Dunholme Moor | Doncaster | dunholme_straight · straight · 열림 · 32 · 1,700 / dunholme_main · left · 열림 · 32 · 4,182.7 | 좌회전 서양배(평탄): 직선 1,400m → 좌 115° R320 → 직선 350m → 엘보 좌 25° R500 → 직선 300m → 좌 60° R260 → 결승 직선 1,000m. 총 회전 200° | 직선 1609 (주) / 본 코스 1006 · 1207 · 1408 · 1609 · 2012 · 2414 · 2921 · 3620 |
| ravensbridge_park | Ravensbridge Park | Sandown | ravensbridge_oval · right · **폐합** · 26 · 4,021.6 / ravensbridge_straight · straight · 열림 · 26 · 1,200 | 우회전 불규칙 고리(폐합 오차 0.04m, 스타디움 아님): 우 110° R320 → 백스트레치 804.3m 내리막 −8m → 우 120° R220 → 368.5m → 백스트레치 중간 엘보 20° R500 → 500m → 우 110° R260 → 결승 직선 600m 급오르막 +8m. 별도 직선 1,200m(마지막 600m 오르막 +8m) | 직선 1006 / 고리 1609 · 2012 · 2414 |
| aldermoor_park | Aldermoor Park | Haydock | aldermoor_main · left · 열림 · 28 · 3,982.6 / aldermoor_straight · straight · 열림 · 26 · 1,250 | 좌회전 평탄(±2m 이내): 직선 1,200m(+2m) → 좌 110° R280 → 500m → 엘보 좌 25° R500 → 400m → 좌 65° R200 → 결승 직선 900m. 총 회전 200° | 직선 1207 / 본 코스 1006 · 1609 · 2012 · 2816 |
| wexborough | Wexborough | Newbury | wexborough_main · left · 열림 · 32 · 4,007.3 / wexborough_straight · straight · 열림 · 30 · 1,700 | 좌회전 평탄·넓음: 직선 1,100m → 좌 120° R260 → 600m → 좌 25° R550(엘보) → 350m → 좌 55° R180 → 결승 직선 1,000m. 총 회전 200° | 직선 1609 / 본 코스 1006 · 1207 · 1408 · 2012 · 2414 |

## 2. 커브 목록 (회전각·반경·총 회전각)

회전각 = 커브 길이 / 반경 (도). 총 회전각 = 레이아웃의 모든 커브 회전각 합. 폐합 레이아웃은 360°.

| 레이아웃 | 커브 (순서대로: 회전각 · 반경 · 방향 · 길이) | 커브 수 | 총 회전각 |
|---|---|---|---|
| ashcombe_main | 20.0° R500 좌 (174.5m, 엘보) · 60.0° R300 좌 (314.2m) · 50.0° R170 좌 (148.3m) · 30.0° R250 좌 (130.9m) | 4 | 160.0° |
| marlow_round | 110.0° R300 우 (576.0m) · 20.0° R500 우 (174.5m, 엘보) · 70.0° R220 우 (268.8m) | 3 | 200.0° |
| kingsmere_triangle (폐합) | 115.0° R280 우 (562.0m) · 150.0° R320 우 (837.8m) · 20.0° R500 우 (174.5m, 엘보) · 75.0° R240 우 (314.2m) | 4 | 360.0° |
| easterholm_main | 120.0° R350 좌 (733.0m) · 25.0° R500 좌 (218.2m, 엘보) · 55.0° R250 좌 (240.0m) | 3 | 200.0° |
| selsworth_main | 110.0° R260 우 (499.2m) · 20.0° R500 우 (174.5m, 엘보) · 75.0° R220 우 (288.0m) · 90.0° R160 우 (251.3m, 급커브) | 4 | 295.0° |
| dunholme_main | 115.0° R320 좌 (642.3m) · 25.0° R500 좌 (218.2m, 엘보) · 60.0° R260 좌 (272.3m) | 3 | 200.0° |
| ravensbridge_oval (폐합) | 110.0° R320 우 (614.4m) · 120.0° R220 우 (460.8m) · 20.0° R500 우 (174.5m, 엘보) · 110.0° R260 우 (499.2m) | 4 | 360.0° |
| aldermoor_main | 110.0° R280 좌 (537.6m) · 25.0° R500 좌 (218.2m, 엘보) · 65.0° R200 좌 (226.9m) | 3 | 200.0° |
| wexborough_main | 120.0° R260 좌 (544.5m) · 25.0° R550 좌 (240.0m, 엘보) · 55.0° R180 좌 (172.8m) | 3 | 200.0° |

직선 전용 레이아웃(marlow_straight, marlow_july, kingsmere_straight, easterholm_straight, selsworth_straight, dunholme_straight, ravensbridge_straight, aldermoor_straight, wexborough_straight)은 커브가 없어 표에서 뺐다.

## 3. 형상 규칙 충족 (CLAUDE 2차 검수 반려 1번)

영국 9곳의 커브 2개 이상 레이아웃(위 표 9개) 전부가 tests/data/data.test.ts "영국 9곳 라운드 레이아웃 형상 규칙" 테스트를 통과한다.
- 규칙 1: 반경 종류 ≥ 2, 최대/최소 ≥ 1.3. 최대/최소 비율은 Ashcombe 500/170 = 2.9, Marlow 500/220 = 2.3, Kingsmere 500/240 = 2.1, Easterholm 500/250 = 2.0, Selsworth 500/160 = 3.1, Dunholme 500/260 = 1.9, Ravensbridge 500/220 = 2.3, Aldermoor 500/200 = 2.5, Wexborough 550/180 = 3.1.
- 규칙 2: 90°의 정수배(±10°)가 아닌 커브 1개 이상. 모든 레이아웃에 있다(예: 20°, 25°, 110°, 115°, 120°, 150°, 75°).
- 규칙 3: 직선 사이 15~35° 엘보(R400~700). 모든 레이아웃에 엘보 R500 이 있다. Ashcombe 20°, Marlow 20°, Kingsmere 20°, Easterholm 25°, Selsworth 20°, Dunholme 25°, Ravensbridge 20°, Aldermoor 25°, Wexborough 25°(R550).
- 규칙 4: 좌우 대칭 스타디움 없음. Ravensbridge 는 스타디움이 아닌 불규칙 고리다(반경 320/220/500/260, 직선 804/368/500/600).

## 4. 특징 태그 (features)

| id | 태그 |
|---|---|
| ashcombe | uphill_finish, downhill_run, camber, tight_turns, undulating |
| marlow_downs | straight_course, dip, uphill_finish, galloping |
| kingsmere_heath | uphill_finish, downhill_run, straight_course, undulating |
| easterholm | galloping, long_straight |
| selsworth_downs | undulating, downhill_run, tight_turns, straight_course |
| dunholme_moor | galloping, long_straight, straight_course |
| ravensbridge_park | uphill_finish, short_straight |
| aldermoor_park | galloping, straight_course |
| wexborough | galloping, straight_course, long_straight |

## 5. 밸런스 참고값 (undulation · drainage · 대표 회전)

| id | undulation | drainage | handedness |
|---|---|---|---|
| ashcombe | 0.9 | 0.6 | left |
| marlow_downs | 0.3 | 0.8 | straight |
| kingsmere_heath | 0.6 | 0.9 | right |
| easterholm | 0.1 | 0.7 | left |
| selsworth_downs | 0.9 | 0.7 | right |
| dunholme_moor | 0.1 | 0.5 | left |
| ravensbridge_park | 0.5 | 0.7 | right |
| aldermoor_park | 0.2 | 0.6 | left |
| wexborough | 0.1 | 0.7 | left |

## 6. 설계 결정·명세와 다른 점 (Opus 확인 요청)

1. **같은 거리 두 레이아웃 (엔진 지원 반영).** Marlow 여름 직선(marlow_july, 1006·1207·1609)과 Kingsmere·Dunholme 라운드 1609 를 다시 넣었다. 각 경우 직선 레이아웃을 distances 배열에서 먼저 적어 기본 레이아웃으로 삼았다. 테스트는 (distance, layoutId) 쌍 중복만 막는다.
2. **기존 레이스(races.json)는 바꾸지 않았다.** 명세 필수 거리 목록은 최소 요구로 보고, 기존 레이스 거리를 경마장 거리 목록에 추가로 넣었다: Ashcombe 1207·2012, Marlow Downs 라운드 3219. races.json 은 HEAD 와 동일하다. 거리를 바꾸면 tests/engine/pack.test.ts 가 깨진다(그 테스트는 고정 M1 fixture 코스와 data/races.json 을 함께 쓴다).
3. **1,006 m 전용 "직선 내리막 5f" 레이아웃은 만들지 않았다.** Ashcombe 1006 은 본 코스 끝 1,006m 로 처리했다.
4. **Ravensbridge Park 의 "급오르막 +8m" 은 600m 에 걸쳐 1.3% 경사**다. 명세 값을 그대로 썼다.
5. **Ashcombe 의 "정점 후 −15m 급내리막"은 2차 수정에서 "내리막 좌커브 2단 −12m"(명세 2차 지시)로 바꿨다.** 짧은 구간에 넣으면 경사가 과하기 때문이다.
6. **Selsworth 고리는 폐합하지 않은 열린 곡선**이다(명세 2차 지시: 고리 반경 다른 커브 3개 이상, 결승 직선 ≥450m). 총 회전 295°.
7. **Easterholm 의 엘보(좌 25° R500)는 말굽 규칙(커브 2개 R350·R250)에 추가한 것**이다. 형상 규칙 3(엘보)을 맞추기 위해서다.
8. **Kingsmere 삼각형의 엘보는 백스트레치 중간에 넣었다.** 폐합 유지를 위해 해당 백스트레치를 두 직선으로 나누고 두 미지 직선 길이를 풀이했다. 명세 "직선 500m 결승 오르막·백스트레치 내리막 −20m" 는 유지했다.

## 7. 가상 이름 목록 (Opus 검수용)

| 구분 | 이름 | 근거 |
|---|---|---|
| 경마장 | Ashcombe | 영국 지명 형태. 기존 이름 유지 (기존 검수 항목) |
| 경마장 | Marlow Downs | 기존 이름 유지 (기존 검수 항목) |
| 경마장 | Kingsmere Heath | 영국 지명 조합(Kingsmere: 가상 지명, Heath: 황무지). 실존 경마장·목장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Easterholm | 영국 지명 조합(East + holm). 실존 경마장·목장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Selsworth Downs | 영국 지명 조합(Selsworth: 가상 지명, Downs: 구릉지). 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Dunholme Moor | 영국 지명 조합(Dunholme: 가상 지명, Moor: 황야). 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Ravensbridge Park | 영국 지명 조합(Ravensbridge: 가상 지명). 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Aldermoor Park | 영국 지명 조합(Aldermoor: 가상 지명). 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 경마장 | Wexborough | 영국 지명 조합(Wex + borough). 실존 경마장으로 알려진 바 없음. 확인 필요 |
| 레이아웃 | Main Course, Straight Course, Summer Straight Course, Round Course, Triangle Course, Oval Course | 일반어 표시명 |
