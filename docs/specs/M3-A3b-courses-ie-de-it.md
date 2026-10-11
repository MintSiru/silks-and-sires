# M3-A3b 아일랜드·독일·이탈리아 경마장 8곳 데이터

담당: haiku-data · 선행: M3-A3a 승인 · 근거: docs/race-calendar-plan.md 2-2, 2-4 · 형식·규칙은 M3-A3a 명세와 같다(features, camber, 실명은 data/_courses_review.md 의 "모델" 칸에만).

## 경마장별 설계 목표
| id | 이름 | 국 | 모델 | 레이아웃 | 필수 특징 | 필요한 거리(m) |
|---|---|---|---|---|---|---|
| kilcarrow_heath | Kilcarrow Heath | IE | Curragh | 우회전 넓은 말굽(폭 36), 완만한 기복(±6m), 결승 직선 900m. 직선 1,408 별도 | galloping, long_straight, straight_course, undulating | 1,006·1,207·1,408(직선)·1,609·2,012·2,414·2,816·3,218 |
| ballinvar | Ballinvar | IE | Leopardstown | 좌회전, 마지막 코너 급함(반경 170), 결승 직선 450m, 약간 오르막(+2m) | short_straight, tight_turns | 1,207·1,408·1,609·2,012·2,414·2,816 |
| tullamere | Tullamere | IE | Naas/Navan | 좌회전, 오르막 결승(+5m) | uphill_finish | 1,006·1,207·1,609·2,012·2,414 |
| ardvarrow_park (**유지**) | Ardvarrow Park | IE | Dundalk(AW) | 기존 그대로 두고 features 만 추가(galloping 아님: tight_turns) | tight_turns | 기존 유지 |
| hohenmoor | Hohenmoor | DE | Hamburg-Horn | 우회전, 결승 직선 오르막(+4m), 직선 500m | uphill_finish | 1,207·1,609·2,012·2,414 |
| wesselfeld | Wesselfeld | DE | Köln/Düsseldorf | 우회전, 기복(±5m) | undulating | 1,207·1,609·2,012·2,213·2,414 |
| lichtenau | Lichtenau | DE | Baden-Baden | 좌회전, 산간 기복(±10m), 결승 직선 500m | undulating, downhill_run | 1,207·1,408·1,609·2,012·2,414·2,816 |
| torreverde | Torreverde | IT | Roma Capannelle | 우회전, 넓음, 평탄 | galloping | 1,207·1,609·2,012·2,213·2,414 |
| valmerano | Valmerano | IT | Milano San Siro | 우회전, 긴 결승 직선(700m), 평탄 | long_straight, galloping | 1,207·1,609·2,012·2,213·2,414·2,816 |

## 생성·수정할 파일
1. `data/racecourses.json` — 위 8곳 추가(ardvarrow_park 는 features 만), 다른 경마장 건드리지 않음
2. `data/_courses_review.md` — 섹션 추가
3. `tests/data/data.test.ts`, `tests/engine/runRace.test.ts` — 경마장 수 갱신(11 → 19)

## 수용 기준
1. loadRacecourses 통과, 위 표의 거리·features 충족.
2. 실명 grep 0건: `grep -iE "curragh|leopardstown|naas|navan|dundalk|hamburg|horn|köln|koln|düsseldorf|dusseldorf|baden|capannelle|san siro|roma|milano" data/racecourses.json data/races.json`
3. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, git commit 금지.

## 추가 규칙 (A3a 검수 반영, 2026-10-11)
- A3a 에서 테스트로 만든 형상 규칙(반경 2종 이상·최대/최소 ≥ 1.3, 비직각 커브 1개 이상, 15~35° 엘보 1곳 이상, 대칭 스타디움 금지)을 이 묶음의 라운드 레이아웃에도 적용한다(Ardvarrow AW 제외). 테스트 대상 국가에 IE·DE·IT 추가.
- **코스끼리 닮지 않게:** 이 묶음의 라운드 레이아웃은 커브 시퀀스(회전각을 10° 단위로 반올림한 목록)가 서로 달라야 하고, 영국 9곳과도 달라야 한다. 테스트로 검사.
- 레이아웃 설계 후 data/_courses_review.md 에 커브 표(회전각·반경·총 회전각)를 남긴다.
