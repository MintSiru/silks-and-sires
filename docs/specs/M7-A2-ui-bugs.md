# M7-A2 화면 버그 묶음

공통: docs/specs/M7-common.md. 근거: docs/feedback/2026-10-17-playtest.md A3~A6·D24.

## 허용 파일
src/ui/horse/horseDetailView.ts, src/ui/horse/HorseDetail.tsx(전적·출주 계획 표시 부분만), src/ui/horse/RacePlanPanel.tsx, src/ui/season/racePlanView.ts(있으면), src/ui/home/homeView.ts, src/ui/home/HomeScreen.tsx(주요 사건 부분만), src/ui/game/text.ts(상태 이름만), index.html, public/favicon.svg(신규), 관련 tests/ui/*.test.ts

## 내용
1. 전적 탭(자동 편성 레이스): 상금이 €0 으로 나온다(장부엔 입금됨 — 예: 미승리전 2착 €1,980). 결과 기록(state.raceResults·말의 경력 기록)에서 실제 상금을 찾아 쓴다. 레이스 이름도 '자동 편성 레이스' 대신 결과 표와 같은 실제 이름(예: 'Ardvarrow Park Maiden Stakes')을, 등급 배지는 클래스(예 '클래스 5')로.
   먼저 원인을 코드로 확인해 [명세와 다르게 한 점]에 적는다(보관 기록에 상금·이름이 없으면 그 사실과 대안).
2. 출주 계획: 날짜가 지났지만 status 가 proposed/approved 인 조건 목표 계획(엔진은 RACE_PLAN_TARGET_SLACK_WEEKS 주까지 맞는 레이스를 더 찾는다)은 상태 칸을 '맞는 레이스 찾는 중 (최대 N주)'로, 마구간 '다음 출주' 칸도 같은 뜻으로. 엔진 수정 금지.
3. 홈 '주요 사건': 플레이어 말·목장·플레이어 거래 사건만(남의 말 NH 스토어 세일 등 세계 사건 제외). 내 말 블랙타입 입상(그룹·리스티드 1~3착)·첫 승을 포함한다(이미 있는 이벤트에서 고른다). 최근 5건.
4. 상태 이름: status 'yearling' 은 나이에 따라 1세면 '1세', 2세 이상이면 '미입사'로(조교사에게 아직 안 간 말). text.ts 의 상태 표 두 곳(92·100행 근처)과 그것을 쓰는 곳 — 나이를 받는 함수로 바꾸거나 호출부에서 처리.
5. favicon: public/favicon.svg(말굽 또는 원판 모양 단순 도형, 실제 로고 금지) + index.html `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` — 콘솔 404 제거.

## 수용 기준
- 자동 편성 레이스 전적 행에 실제 상금·실제 레이스 이름(테스트로 확인).
- 지난 조건 목표 계획이 '찾는 중' 문구(테스트).
- 홈 주요 사건에 세계 NH 스토어 세일이 없고 내 말 입상·출산·세일 결과가 나온다(테스트).
- 2세 미입사 말 상태가 '미입사'(테스트).
- 빌드 결과물에 favicon.svg 가 있고 index.html 이 참조.
