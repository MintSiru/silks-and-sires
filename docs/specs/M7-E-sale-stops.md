# M7-E 세일 발표·개최 주 정지 (사용자 결정 2026-10-17)

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 C12 — '4주 진행'이 1~7월 동안 한 번도 안 멈춰 4·5월 브리즈업 세일(구매 기회)이 알림 없이 지나갔다.
설정 타입: `GameSettings.stopAtSales?: boolean`(Opus 추가 — 없거나 true 면 정지).

## 허용 파일
src/ui/shell/decisionStop.ts, src/ui/shell/SettingsModal.tsx·settingsView.ts(체크 한 줄), src/ui/game/useGame.ts(설정 저장 함수 한 개만), src/ui/home/homeView.ts(브리핑 한 줄만), 관련 tests/ui/decisionStop*.test.ts·shellSettings.test.ts·homeView*.test.ts

## 내용
1. decisionStopReason 에 두 사유 추가(기존 a~d 뒤 순서, stopAtSales !== false 일 때만):
   (e) 이번 주에 카탈로그가 발표된 세일이 있다 → '<세일 이름> 카탈로그가 발표됐습니다(거래 <날짜>). 세일 화면에서 확인하세요.' 여러 개면 첫 번째 + '외 N건'.
   (f) 이번 주가 거래 주인 세일에 플레이어 입찰(상한)이 있다 → '<세일 이름> 거래 주입니다. 실시간 보기로 경매를 볼 수 있습니다.'
   발표 주·거래 주 계산은 엔진의 기존 함수(announceWeekOf 등)를 쓴다.
2. 설정 모달 '진행·자동화'에 체크 '세일 발표·거래 주에 멈추기'(기본 켜짐).
3. 홈 브리핑에 '이번 주 세일' 한 줄(발표·거래가 있을 때만 — 없으면 줄 없음). 기존 briefingItems 정확 비교 테스트는 '세일 없음' 상황에서 그대로 통과해야 한다.

## 수용 기준
- 카탈로그 발표 주 상태에서 decisionStopReason 이 (e) 문구(테스트), stopAtSales false 면 null.
- 입찰한 세일의 거래 주에 (f) 문구(테스트), 입찰 없으면 (f) 없음.
- 기존 (a)~(d) 우선순위 유지(테스트).
- 스모크 PASS(첫 '4주 진행'이 1월 2주에서 멈추는 기존 흐름 유지 — 세일 사유가 끼어들면 스모크 기대값을 바꾸지 말고 보고).
