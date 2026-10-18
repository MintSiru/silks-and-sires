# 인계 문서 — 클라우드 세션 → AionUI (2026-10-18)

작업 브랜치: `claude/m0-m1-foundation` (모든 진행이 여기에 커밋·푸시돼 있다). 이 문서를 처음 읽고 시작한다.

## 1. 지금까지
- M0~M6 완료(기획서 마일스톤 전부). M7 '플레이 경험' 완료: 레이스 당일(출주표·패독·코멘트·작전 → 자동 재생 → 결과), 레이스 그래픽(게이트 대기·주로·펄롱 표지·내 말 강조), 판매가·출주 계획·교배 첫 해 규칙, 세일 정지, 임신 상태, 한 해 돌아보기, 개인 거래.
- 계획·결정의 원본: `docs/plan.md`(기획서), `docs/m7-plan.md`, `docs/decisions.md`(모든 승인·사용자 결정이 날짜순 한 줄씩 — **결정 근거는 여기서 찾는다**).
- 최근 점검: `docs/feedback/2026-10-17-playtest.md`(1회차 24항목), `docs/feedback/2026-10-17-playtest-2.md`(2회차·남은 것 7개), `docs/reports/M7-G1-30year.md`(30년 검증).

## 2. 다음 할 일 (사용자 결정 2026-10-18 순서: 남은 위험 → 플레이 테스트 3회차 → 추가 기능)
| 순서 | 티켓 | 명세 | 권장 담당 | 상태 |
|---|---|---|---|---|
| 1 | M8-R1 레이스 기록 확장 사용 | docs/specs/M8-R1-result-records.md | Codex 또는 Haiku | 공용 타입 반영됨, 구현 전 |
| 1 | M8-R3 세일 정지 종류 | docs/specs/M8-R3-sale-stop-kinds.md | Haiku | 타입 반영됨, 구현 전 |
| 1 | M8-R5 재생 화면·해설 시각 | docs/specs/M8-R5-replay-dialog.md | Haiku | 구현 전 |
| 1 | M8-R4 패독·코멘트 문구 | docs/specs/M8-R4-paddock-text.md | **Antigravity 시범** | 구현 전 |
| 2 | M8-R2 초기 OR 측정 → 보정 | docs/specs/M8-R2-initial-or.md | Haiku(tester) | 1단계 측정부터 |
| 2 | M8-R6 무입력 장기 빚 | docs/specs/M8-R6-idle-debt.md | Codex | 30년 측정 포함 |
| 3 | 전체 테스트 + 30년 G1 + 플레이 테스트 3회차(3~5년) | — | 총괄 | |
| 4 | M9 미국·남반구(호주·뉴질랜드) | 설계부터(아래 4장) | 총괄 설계 → 분배 | |
같은 파일을 만지는 티켓은 동시에 내보내지 않는다(R1 은 horseDetailView·yearReviewView·trade.ts, R3 은 decisionStop·설정, R5 는 raceDay·race-viewer, R4 는 raceDayBrief — 서로 겹치지 않음. R6 은 autoSell, R2 는 world/rating).

## 3. 총괄 운영 요령 (클라우드 세션에서 배운 것)
- **동시 작업은 2~3개까지.** 2026-10-17 에 에이전트 7개가 동시에 전체 테스트를 돌려 CPU 4개가 과부하(부하 26)로 몇 시간 멈췄다. 에이전트는 관련 테스트만, 전체 `npm test`(약 15~25분)는 총괄이 병합 때 한 번.
- **검증 순서**(병합 뒤): `npm test -- --testTimeout=300000 --hookTimeout=300000` → `npm run typecheck` → `npm run lint` → `npm run build` → `node tests/ui/ux2-shell.smoke.mjs`(PASS).
  - 스모크·캡처 스크립트의 Playwright import 경로는 클라우드 전용(/opt/node-tools)이라 PC 에서는 파일 첫 줄 주석대로 'playwright' 로 바꾸고 `npx playwright install chromium`.
- **병합**: `scripts/dev/merge-branch.sh <작업트리|origin/agent/..브랜치> <기준커밋>` (3-way, 충돌 파일 출력, 커밋 안 함).
- **고정 해시**: 엔진 규칙이 바뀌면 결정성 해시 테스트(horseNaming·stallionTradeIntegration·newGameSettings 등)가 바뀐다. 의도된 변경이면 `python3 scripts/dev/repin-hashes.py` 로 다시 고정하고 decisions.md 에 이유 한 줄.
- **30년 검증**: `G1_OUT=<파일> npx vitest run tests/verify/g1ThirtyYears.test.ts --testTimeout=7200000` (약 16분, 다른 무거운 작업과 동시에 돌리지 않는다). 판정 5 는 '30년차 주당 중앙값 ≤ 1,000ms' 로 본다(비율 기준은 참고).
- **플레이 테스트**: `scripts/dev/playtest-driver.mjs`(원격 디버깅 브라우저에 붙어 한 단계씩 조작·캡처).
- **알려진 불안정 테스트**: 부하 중 저장 왕복 테스트(farmView·racePlanView)가 가끔 시간 초과 — 단독 실행으로 확인.
- 사용자 보고·질문은 한국어. 게임 디자인 갈림길은 선택지 2~3개로 묻고, 기술 판단은 총괄이 정해 decisions.md 에 기록.
- 스크린숏은 zip 으로 묶어 전달(사용자 선호).

## 4. M9 미국·남반구 — 사용자 결정(2026-10-18)
- 지역별 완전한 경마: 거점(목장)을 미국·호주·뉴질랜드에도 둘 수 있고, 지역마다 경마장·레이스 달력·세일·종마가 돌아간다. 지역 간 원정·이적 가능.
- 미국: 더트 주로·더트 혈통, 클레이밍 레이스, 가상 3관·연말 대축제(실제 이름 금지).
- 남반구(호주·뉴질랜드): 8월 1일 생일, 계절 반대(번식기 8~12월), 북반구 종마의 셔틀 교배 — 모두 반영.
- CLAUDE.md 원칙 3('유럽 시스템')을 지역별 시스템으로 넓히는 개정이 먼저 필요하다(사용자 확인).
- 설계 순서 제안: 공용 타입(지역·주로·생일 기준·셔틀) → 데이터(가상 경마장·달력, 실명 종마 목록 확장 — 실명 확인이 필요한 사실은 50개 내외면 사용자에게 목록으로 요청) → 엔진(시간·나이·번식 시즌 지역화 → 레이스 종류·클레이밍 → 세일 → 셔틀) → 화면 → 30년 검증. 여러 마일스톤 규모.

## 5. 남은 위험 (보고만, 아직 미착수)
- 무입력 15년차 이후 빚(R6), 초기 OR(R2), 세일 정지 빈도(R3), 기록 정보 부족(R1), 30년 판정 2건 '판정 불가'(컵 프로필 NH 편입 0·명문 모계 0 — 시드 편차로 추정, 다른 시드로 재확인 권장).
