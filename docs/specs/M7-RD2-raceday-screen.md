# M7-RD2 레이스 당일 화면 + 자동 재생 + 결과 (사용자 결정 2026-10-17)

공통: docs/specs/M7-common.md. 선행: M7-RD1(엔진: prepareRaceDay·pendingRaceDays·raceDayBrief·setRaceOrder), M7-R2(레이스 그리기), M7-E(decisionStop 세일 사유) 병합 뒤.
사용자 결정: '출주 주에 멈추고 자동 재생, 재생 전 출주표와 패독, 조교사 및 기수 코멘트, 작전 지시 등 내릴 수 있도록'.
설정 타입: `GameSettings.raceDayMode?: 'brief' | 'skip'`(없으면 brief).

## 허용 파일
src/ui/raceDay/*(신규: RaceDayScreen.tsx, raceDayView.ts, RaceDayResult.tsx, raceDay.css), src/ui/App.tsx(진행 흐름 연결만), src/ui/game/useGame.ts(레이스 당일 API 연결 함수만),
src/ui/shell/decisionStop.ts(레이스 당일 정지 사유만), src/ui/shell/SettingsModal.tsx·settingsView.ts(설정 한 줄), src/ui/season/replayView.ts(재사용 함수 export 만), tests/ui/raceDay*.test.ts(신규), tests/ui/ux2-shell.smoke.mjs(레이스 당일 화면이 뜨는 흐름에 맞게 — 기존 확인 항목은 유지)

## 흐름
1. 진행 버튼(1주·4주·다음 내 출주까지) 공통: 진행하려는 주(state.date)에 플레이어 말 출주가 있으면(raceDayMode !== 'skip') 진행하지 않고 레이스 당일 화면을 연다.
   - 판정: prepareRaceDay(state) 로 이번 주 신청을 확정한 상태를 저장한 뒤 pendingRaceDays 가 비어 있지 않으면.
   - 여러 주 진행(advanceUntil)은 주를 진행한 뒤 다음 주가 레이스 당일이면 멈춘다(decisionStop 에 사유 '내 말 출주 주입니다' 추가 — 정지 뒤 곧바로 레이스 당일 화면).
2. 레이스 당일 화면(전체 화면 대화상자, 내 말 레이스가 여러 개면 위쪽 탭):
   - 머리: 레이스 이름·등급/클래스·경마장(국가)·거리(m·f)·주로·마장(한국어)·상금(1착)·출주 두수.
   - 출주표: 마번, 게이트, 승부복 원판(작은 캔버스 또는 기존 승부복 컴포넌트), 말 이름, 나이·성별, 부담중량(무게 단위 설정 WeightUnitContext), 기수, 조교사, OR, 최근 5전, 예상 오즈. 내 말 행 강조. 정렬 기본 마번.
   - 패독: 내 말 먼저, 출주마별 관찰 한 줄(tone 색 — 토큰 색).
   - 코멘트: 조교사·기수 말풍선(이름 + 문장), 예상 페이스 한 줄.
   - 작전 지시: 선행·선입·중단·추입 4개 라디오(각 한 줄 설명), 조교사 추천 배지, 현재 지시. 바꾸면 setRaceOrder.
   - 버튼: '출주 — 레이스 보기'(기본), '결과만 보기'.
3. 출주를 누르면: 한 주 진행(기존 advance 1주) → 이번 주 내 말 레이스의 다시보기를 자동 재생(RaceViewer, 게이트부터). '결과만 보기'면 재생 없이 결과 화면.
4. 결과 화면(재생 끝나면 자동 전환, 재생 중 '결과로 건너뛰기'): 전체 착순표(착순·마번·말·착차·기수·오즈), 내 말 상금·OR 변화(있으면), 조교사 사후 코멘트 한 줄(착순과 예상 오즈 비교 규칙: 기대 이상/기대만큼/아쉬움 — raceDayView 의 순수 함수), 버튼 '다음 레이스'(있으면) 또는 '닫기'.
5. 설정: '레이스 당일' 선택 — '출주표·작전 뒤 레이스 보기(기본)' / '멈추지 않음(결과만 기록)'.

## 수용 기준
- 내 말 출주 주 상태에서 '1주 진행'을 누르면 주가 넘어가지 않고 레이스 당일 화면이 뜬다(스모크 또는 화면 테스트).
- 작전을 '추입'으로 바꾸고 출주하면 결과 기록의 내 말 작전이 held_up(테스트 — 엔진 API 호출 순서 확인).
- 출주 → 다시보기 자동 재생 → 결과 화면 전체 착순(Playwright 확인, 캡처 3장을 scratchpad/rd2/ 에).
- raceDayMode 'skip' 이면 멈추지 않는다(테스트).
- raceDayView 순수 함수(출주표 행 만들기, 사후 코멘트) 단위 테스트.
- 스모크 PASS(스모크가 레이스 당일 화면을 만나면 '출주'를 눌러 넘어가도록 고친다).
