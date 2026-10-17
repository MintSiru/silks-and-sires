# M6-P 성능: 주간 진행 시간

담당: Codex(gpt-6.1-sol, high — 장기 시뮬레이션 분석·리팩터링) · 근거: docs/reports/M4-G2-30year.md(주당 중앙값 213ms → 658ms, 30/1년차 3.09 ❌), docs/reports/M5-G-30year.md(2.99), docs/m6-plan.md

목적: 웹 브라우저에서 '4주 진행'·'다음 출주까지'가 답답하지 않게, 30년차에도 주간 진행이 빠르게 한다.

## 목표
- 1년차 주당 진행 중앙값 ≤ 150ms, 30년차 ≤ 300ms(같은 기계, 30년 G1 측정 — `tests/verify/g1ThirtyYears.test.ts`의 perf 값). 30/1년차 비율 ≤ 2.
- 결과(레이스·자금·연대기 등 게임 상태)는 바꾸지 않는다 — 최적화 전후 같은 시드 5년 진행의 상태 해시가 같아야 한다(바뀌면 이유와 함께 보고, 의도된 경우만 허용).

## 범위
1. 프로파일: 30년 진행에서 시스템별(advanceWeek 의 각 WeeklySystem) 주당 시간과 연차별 증가를 측정해 표로 남긴다(docs/reports/M6-P-profile.md). 커지는 상태(말 기록·raceResults·sireStats·OR 이력·performances·eventLog·seasonState 이력·sales 기록·chronicle 등)와 O(n) 이상 반복(매주 전체 말 순회·structuredClone·정렬·JSON 등)을 찾는다.
2. 최적화(원인 순서대로): 매주 전체 순회를 색인·증분 계산으로, 불필요한 structuredClone 제거(advanceWeek 의 draft 는 이미 복제본 — 시스템 안 복제 금지), 연 1회면 되는 계산은 연 1회로, 보존 정책(최근 N 시즌)이 지켜지는지 확인. 공용 rng 소비 순서 불변.
3. 측정 테스트: `tests/verify/performance.test.ts` 또는 새 측정에 1년차·10년차 주당 중앙값 기록(환경 변수로 켜는 측정 — 평소 테스트는 빠르게).
4. 30년 G1 재측정(백그라운드 15~30분) → docs/reports/M6-P-30year.json·.md 에 이전 값과 비교.

## 수용 기준
1. 1년차 중앙값 ≤ 150ms, 30년차 ≤ 300ms(측정 3회 중앙값) 또는 달성 못하면 남은 병목과 이유 보고.
2. 같은 시드 5년 진행 상태 해시 최적화 전후 동일(또는 이유 보고).
3. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 전체 테스트 시간도 보고(이전 대비).

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 게임 규칙·밸런스 상수 변경 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거(측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```
