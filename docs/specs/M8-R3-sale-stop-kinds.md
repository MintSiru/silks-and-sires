# M8-R3 세일 정지를 고른 종류로 좁히기

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 2회차 남은 것 3 — 4주 진행으로 1년을 보내는 데 22번 눌러야 했고 절반 가까이가 세일 정지.
타입(Opus 추가): GameSettings.stopAtSaleKinds?: SaleKind[] — 없으면 기본 ['yearling','breeze_up','horses_in_training'].

## 허용 파일
src/ui/shell/decisionStop.ts((e) 판정만), src/ui/shell/SettingsModal.tsx·settingsView.ts(종류 체크박스), src/ui/game/useGame.ts(설정 저장 함수 하나), src/ui/home/homeView.ts(브리핑 줄이 같은 판정을 쓰게), 관련 tests/ui

## 내용
1. (e) 발표 정지: stopAtSales !== false 이고, 그 세일 종류가 stopAtSaleKinds(기본 값)에 있거나 플레이어가 그 세일에 위탁·출품했으면 멈춘다. (f) 입찰한 세일 거래 주 정지는 그대로.
2. 설정 '세일 발표·거래 주에 멈추기' 아래에 종류 체크박스 5개(이유마·1세·브리즈업·현역마·번식마), 기본 체크는 1세·브리즈업·현역마. 큰 정지 끄기 체크가 꺼지면 종류 체크는 비활성.
3. 측정: 새 게임(시드 20261011 기본값)에서 '4주 진행'만 눌러 1년을 보낼 때 누르는 횟수와 정지 사유 목록을 보고(Playwright 또는 advanceUntil 단위 테스트 시뮬레이션).

## 수용 기준
- 기본 설정에서 번식마 세일 발표 주는 멈추지 않고 1세 세일 발표 주는 멈춘다(테스트). 번식마 세일이라도 내 위탁이 있으면 멈춘다(테스트).
- 설정 저장·불러오기 왕복(테스트).
- 1년 누르는 횟수 측정값 보고(목표 14회 이하).
- 스모크 PASS. 전체 npm test 금지.
