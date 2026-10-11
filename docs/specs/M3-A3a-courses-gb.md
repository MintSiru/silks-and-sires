# M3-A3a 영국 경마장 9곳 데이터

담당: haiku-data · 선행: M3-A1 · 근거: docs/race-calendar-plan.md 2-1

## 목적
영국 경마장 9곳(기존 Ashcombe·Marlow Downs 재설계 + 신규 7곳)을 실제 영국 명문 경마장의 **코스 특성**을 본떠 만든다. 이름·미니맵 모양은 가상이다.

## 형식
기존 `data/racecourses.json` 의 Racecourse 스키마(src/engine/types/course.ts) 그대로. 새 선택 필드:
- `TrackSegment.camber`(−1~+1, + = 안쪽 레일 쪽으로 기움)
- `Racecourse.features`: 'uphill_finish' | 'downhill_run' | 'dip' | 'false_straight' | 'camber' | 'straight_course' | 'tight_turns' | 'galloping' | 'undulating' | 'long_straight' | 'short_straight'

## 경마장별 설계 목표 (모델 = 참고용 실제 경마장. 데이터에 실명 금지)
| id | 이름 | 모델 | 레이아웃 | 필수 특징 | 필요한 거리(m) |
|---|---|---|---|---|---|
| ashcombe (재설계) | Ashcombe | Epsom | 좌회전 말굽(closed=false). ① 출발 후 오르막(+40m 고도 상승 근사는 과하니 +12m) ② 정점 이후 급내리막(−15m) + 좌 급커브(반경 150~180) ③ 결승 직선 650~700m, camber +0.6, 마지막 200m 오르막 +3m | uphill_finish, downhill_run, camber, tight_turns, undulating | 1,006·1,408(직선 내리막 5f 별도 레이아웃 가능)·1,710·2,414 |
| marlow_downs (재설계) | Marlow Downs | Newmarket Rowley+July | ① 직선 2,012m 넓음(폭 40), 결승 400m 앞 딥(−3m 후 +4m) ② 여름 직선 레이아웃(폭 36, 1,609m) ③ 라운드 우회전(2,414 이상) | straight_course, dip, uphill_finish, galloping | 직선 1,006·1,207·1,408·1,609·1,811·2,012 / 여름 1,006·1,207·1,609 / 라운드 2,414·2,816·3,620 |
| kingsmere_heath | Kingsmere Heath | Ascot | 우회전 삼각(closed=true), 백스트레치 긴 내리막(−20m), 스윙 커브, 결승 직선 500m 오르막(+6m). 직선 1,609 별도 | uphill_finish, downhill_run, straight_course, undulating | 1,006·1,207(직선)·1,609(직선)·1,609(라운드)·2,012·2,414·3,218·4,023 |
| easterholm | Easterholm | York | 좌회전 L자, 평탄(고도 변화 ±1m 이내), 넓음(폭 34), 결승 직선 850~900m | galloping, long_straight | 1,006(직선)·1,207·1,408·1,609·2,072·2,414·2,816·3,319 |
| selsworth_downs | Selsworth Downs | Goodwood | 우회전 고리 + 직선 1,207. 큰 기복(±15m), 결승 2F 전 급내리막·급커브(반경 160) | undulating, downhill_run, tight_turns, straight_course | 1,006·1,207(직선)·1,408·1,609·2,012·2,414·3,218 |
| dunholme_moor | Dunholme Moor | Doncaster | 좌회전 서양배, 평탄, 결승 직선 1,000m, 직선 1,609 별도 | galloping, long_straight, straight_course | 1,006·1,207·1,408·1,609(직선)·1,609(라운드)·2,012·2,414·2,921·3,620 |
| ravensbridge_park | Ravensbridge Park | Sandown | 우회전 타원, 결승 직선 600m 급오르막(+8m) | uphill_finish, short_straight | 1,006(별도 직선)·1,609·2,012·2,414 |
| aldermoor_park | Aldermoor Park | Haydock | 좌회전 평탄, 직선 1,207 별도 | galloping, straight_course | 1,006·1,207(직선)·1,609·2,012·2,816 |
| wexborough | Wexborough | Newbury | 좌회전 평탄 넓음, 직선 1,609 별도 | galloping, straight_course, long_straight | 1,006·1,207·1,408·1,609(직선)·2,012·2,414 |

규칙:
- 모든 레이아웃은 기존 검증(load.ts)을 통과해야 한다: 마지막 구간 끝 = 결승선, closed=false 면 총길이 ≥ 최대 거리.
- 미니맵이 실제 경마장과 똑같아 보이지 않게 비율을 조금씩 바꾼다(반경·직선 길이 ±10~20%). 특징(오르막 결승·딥·급커브)은 유지.
- 좌우 회전(handedness)은 모델과 같게(경주 적성에 영향).
- drainage(0~1), undulation(0~1)도 모델 특성에 맞게.
- 거리는 펄롱 기반 근사값(1f = 201.168m)을 쓴다.

## 생성·수정할 파일
1. `data/racecourses.json` — 위 9곳(기존 saint_ourens, ardvarrow_park 는 건드리지 않는다)
2. `data/races.json` — 기존 12개 레이스가 바뀐 거리 목록과 맞지 않으면 거리만 가장 가까운 유효 거리로 고친다(이름·등급 유지)
3. `tests/data/data.test.ts`, `tests/engine/runRace.test.ts` — 경마장 수·이름 기대값 갱신(4 → 11)
4. `data/_courses_review.md` (신규) — 경마장별: 모델, 설계 메모(고저차·직선·반경), 거리 목록. 실명은 이 파일의 "모델" 칸에만.

## 수용 기준
1. loadRacecourses 가 11곳 전부 통과.
2. 9곳 모두 위 표의 "필요한 거리"를 distances 에 갖는다.
3. 각 경마장의 features 가 표의 필수 특징을 포함한다.
4. data/racecourses.json·data/races.json 에 실제 경마장·레이스 이름 없음: `grep -iE "epsom|newmarket|ascot|york|goodwood|doncaster|sandown|haydock|newbury|rowley|tattenham" data/racecourses.json data/races.json` 0건.
5. `npm test && npm run typecheck && npm run lint` 통과(골든은 tests/engine/fixtures/m1-racecourses.json 을 쓰므로 영향 없음). 단 typecheck 는 다른 티켓(A2)의 RacePathSample.camber 작업 중이면 그 오류만 남을 수 있다 — 보고에 적기.

## 금지
src/ 수정 금지. git commit 금지.
