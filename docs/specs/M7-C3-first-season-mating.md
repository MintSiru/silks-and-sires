# M7-C3 첫 해 교배 자동 예약 늦춤 + 근친 '주의' 배합은 승인 대기

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 B9 — 교배 자동 예약이 1월 2주(게임 시작 다음 주)라 새 플레이어가 제안을 보기 전에 예약되고, 근친 18.75%(4×3) 배합도 자동 예약됐다.

## 허용 파일
src/engine/breeding/matingPlan.ts(자동 예약 부분), src/engine/config/mating.ts, src/ui/shell/decisionStop.ts((b) 교배 자동 예약 주 판정만), src/ui/breeding/MatingPlanPanel.tsx·matingPlanView.ts(승인 필요 표시만), 관련 tests/engine/matingPlan*.test.ts·tests/ui/decisionStop*.test.ts·tests/ui/matingPlanView.test.ts

## 내용
1. 자동 예약 주: 게임을 시작한 해(첫 시즌)는 MATING_FIRST_SEASON_AUTO_BOOK_WEEK(=6, 근거: 시작 뒤 4주 이상 검토 시간)에, 그 뒤 해는 지금처럼 MATING_AUTO_BOOK_WEEK.
   첫 시즌 판정은 상태에 있는 정보로(예: 게임 시작 연도 — 없으면 [질문]). `export function matingAutoBookWeek(state): number` 를 만들어 엔진·decisionStop 이 같이 쓴다.
2. 근친 상한: 제안 종마와 암말 사이 예상 자마 근친 계수(혈통 계산 함수 재사용)가 MATING_AUTO_BOOK_MAX_INBREEDING(=0.125) 이상이면 자동 예약하지 않고 proposed 로 남긴다(플레이어 승인 대기). 'autoApproveMatings: true'(즉시 예약)여도 같은 규칙.
3. 화면: 그런 제안 행의 상태 칸에 '승인 필요 — 근친 12.5% 이상'(값은 상수에서). decisionStop (b) 문구는 그대로 쓰되 주 판정만 1번 함수로.

## 수용 기준
- 새 게임 1월 2주 진행에 교배 예약이 생기지 않고, 6주에 예약된다(테스트). 다음 해는 2주.
- 근친 18.75% 제안은 자동 예약 주가 지나도 proposed(테스트), 승인하면 예약된다.
- 결정성. 고정 해시가 바뀌면 이유 보고.
