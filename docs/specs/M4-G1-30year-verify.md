# M4-G1 30년 자동 진행 검증

담당: haiku-tester · 설계: docs/m4-plan.md G1, docs/plan.md M4 완료 기준("30년 자동 진행 시 자금 인플레 없음, 컵 프로필 종마의 70% 이상이 NH·겸용 진로")

목적: 시드 20261011 새 게임(보통·오너브리더, 플레이어 무입력 — 출주 계획·교배는 기본 '그대로 진행'으로 자동)을 30년 진행해 M4 경제가 발산하지 않는지 측정하고 리포트를 남긴다. 엔진은 바꾸지 않는다(측정만).

## 생성할 파일
- `tests/verify/g1ThirtyYears.test.ts` — `it.skipIf(!process.env.G1_OUT)` 로 평소 테스트에서는 건너뛴다(기존 `tests/verify/virtualDamPerformance.test.ts` 의 ST3_MEASURE_OUT 방식과 같게). 결과는 `process.env.G1_OUT` 경로에 JSON 으로 쓴다(vitest 는 통과 테스트의 console.log 를 숨긴다). 타임아웃 넉넉히(예: 3시간).
- `docs/reports/M4-G1-30year.json`(측정 결과 사본), `docs/reports/M4-G1-30year.md`(한국어 요약 리포트: 표 + 판정).

## 진행 방법
- 정적 데이터·부트스트랩은 `tests/verify/season.test.ts`·`tests/engine/racePlan.test.ts` 의 방식 그대로(`bootstrapGame`, `createGameSystems`, `advanceWeek`). 연말 정산 게이트가 진행을 막으면(연말 정산 제출 필요) 기존 테스트가 쓰는 방식으로 기본 제출(모두 continue 등)을 넣어 넘긴다 — 방법은 `tests/engine` 의 연말 정산 테스트(yearEnd 관련)를 찾아 따른다.
- 30년 = 30 × 52주(달력의 주 수 상수 WEEKS_PER_YEAR 를 쓴다). 해마다(1주차) 아래 지표를 모은다.

## 연별 지표
1. 자금: AI 마주 자금 중앙값·10%·90% 분위, 음수 AI 마주 수, 플레이어 자금, 레거시/캐주얼 여부와 빚.
2. 세일: 그해 세일 종류별(1세·2세 브리즈업·이유마·번식마·현역마) 상장 로트 수·낙찰 수·낙찰률·평균가·중앙값(세일 결과가 state 어디에 남는지 src/engine/sales 와 types/sales.ts 에서 찾는다). NH 스토어 판매 두수·평균가(Horse.nhSoldYear).
3. 종마 진로: 그해 새로 편입된 AI 종마(population 의 편입 — Stallion.firstSeasonYear === 다음 해 등)를 `horseProfile`(src/engine/stud/nh.ts) 별로 세고 studRole(flat/dual/nh) 분포. 30년 누적 표도.
4. 관계·명성: state.relations 의 분포(평균·분위) — 구조는 types 에서 찾는다.
5. 레이스: 그해 레이스 수, 인기 1위 승률(전체·G1)(계산 방식은 tests/verify/season.test.ts 와 같게).
6. 성능·크기: 그해 52주 진행 시간(ms), 말 레코드 수(state.horses), 저장 크기(`serializeGame(state, '2026-01-01T00:00:00Z').length` 바이트).

## 판정 기준(리포트에 ✅/❌)
1. 인플레 없음: AI 자금 중앙값의 30년차 / 5년차 비율이 0.67~1.5, 1세 세일 평균가의 30년차 / 5년차(3년 이동 평균) 비율이 0.67~1.5.
2. 컵 프로필 편입 종마 누적 중 NH·겸용 비율 ≥ 70%(컵 프로필 편입이 0두면 ❌ 가 아니라 '표본 없음'으로 적고 중장거리(middle) 비율을 함께 적는다). speed 프로필의 NH 비율 ≤ 10%.
3. 세일 낙찰률이 해마다 30%~95% 안.
4. 인기 1위 승률이 해마다 28%~38% 안(시즌 검증 기준과 같게 — 기준값은 tests/verify/season.test.ts 에서 확인해 그대로 쓴다).
5. 말 레코드 수·저장 크기가 30년 동안 단조 폭증하지 않는다(30년차 / 10년차 ≤ 1.5).
6. 예외(throw)·NaN·음수 두수 없음.

## 금지
src/ 수정 금지(측정만 — 버그를 찾으면 [질문]에 재현 방법과 함께 적는다). 새 의존성 금지. git commit 금지. 실명 문구 금지.

## 보고 양식 (CLAUDE.md Haiku 보고 양식)
[결과] / [변경 파일] / [수용 기준](위 판정 1~6 각각 ✅/❌ + 수치) / [테스트](실행 명령·소요 시간) / [명세와 다르게 한 점] / [질문]

## 테스트 명령
G1_OUT=docs/reports/M4-G1-30year.json npx vitest run tests/verify/g1ThirtyYears.test.ts
(먼저 2년짜리로 돌려 지표 수집이 맞는지 확인한 뒤 30년을 돌린다 — 연수를 환경 변수 G1_YEARS 로 받게 하면 좋다, 기본 30.)
