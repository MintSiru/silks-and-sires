# M7-R1 레이스 뷰 모델: 게이트 대기·출발, 레인 분산, 떨림·겹침 제거

공통: docs/specs/M7-common.md. 근거: 사용자 요청(2026-10-12) '게이트에서 2~3초 대기하고 있다가 팍 출발', '애들이 옹기종기 모여 비비적대면서 번쩍번쩍',
플레이 테스트(2026-10-17) 캡처: 출발 즉시 달리기 시작, 첫 코너 뒤 원판이 전부 아래 레일 선에 붙어 겹침(예 5·8·2), 띠 위쪽 2/3 가 빈 공간.
원칙 2(측면 띠·번호 원판·우측 상위 3두) 유지. 이번 티켓은 계산(viewModel)만 — 그리기는 R2.

## 허용 파일
src/ui/race-viewer/viewModel.ts, src/ui/race-viewer/RaceViewer.tsx(재생 시간에 게이트 대기 구간을 더하는 부분만), tests/ui/raceViewer*.test.ts(없으면 tests/ui/raceViewModel.test.ts 신규)

## 내용
1. 게이트 구간: 재생 시간 τ 를 −GATE_HOLD_S(=2.5s) 부터 시작. τ<0 동안 sim 프레임은 t=0 고정, StripModel.gate = { phase, remaining, x, stalls }:
   - phase: τ<−1.0 'loading'(말이 게이트에 들어가는 중 — 원판이 게이트 칸 안으로 미끄러져 들어감, 칸 순서는 draw), −1.0≤τ<0 'ready', 0≤τ<GATE_OPEN_FLASH_S(=0.35) 'open'(그리기에서 문이 열리는 표시), 그 뒤 null.
   - stalls: draw 1..N 의 칸 y 좌표(draw 1 = 내측 = 아래). 출발 순간 원판 y 는 자기 칸 y 에서 시작해 레이스 레인으로 부드럽게 이어져야 한다(첫 1.5s 보간).
   - '결과만'·'처음부터' 동작: 결과만은 게이트도 건너뛰고, 처음부터는 게이트부터.
2. 레인 분산(y 매핑): 지금은 lane/트랙 폭으로 써서 레일 근처 말이 모두 바닥에 붙는다. 이렇게 바꾼다:
   - 그 순간 필드가 실제로 쓰는 폭 W = max(FIELD_MIN_SPREAD_M(=6m), 최대 lane + 1m) 를 띠 사용 높이에 맞춘다. W 는 τ±1.5s 구간 프레임들의 최대값으로 정해(순수 함수) 확대·축소가 출렁이지 않게.
   - 원판끼리 거의 같은 자리(|dx| < 1.4r 그리고 |dy| < 1.4r)면 바깥 레인 원판을 위로 밀어 겹침을 줄인다(결정적 — 레인·runnerIndex 순).
3. 떨림·번쩍임 제거: 그리는 순서는 레인 바깥 → 안쪽(안쪽이 위), 같은 레인이면 runnerIndex — 프레임마다 순서가 뒤바뀌지 않게. 레인 값은 프레임 사이 선형 보간 + 0.3s 이동 평균으로 매끄럽게(순수 함수, τ 기준).
4. R2 가 그릴 데이터를 StripModel 에 추가(이름 그대로 export):
   - `gate: GateView | null` (위 1),
   - `poles: { x: number; label: string }[]` — 카메라 창 안의 펄롱 표지(결승까지 남은 거리 '5f' 식, 결승선은 label 'F'),
   - `playerTags: { x: number; y: number; name: string }[]` — 플레이어 말 원판 위 이름표 자리,
   - `myStanding: { position: number; behind: string | null } | null` — 내 말 현재 순위와 선두와의 차(마신 표기, 기존 착차 함수 재사용). 플레이어 말이 없으면 null.
   - `surface: Surface`.
5. 상수는 viewModel.ts 위쪽 상수 블록(UI 상수라 engine/config 아님)에 근거 주석과 함께.

## 수용 기준
- τ=−2.0 에서 gate.phase 'loading', −0.5 'ready', 0.1 'open', 1.0 null(테스트).
- 레일 근처(lane 0~3m) 10두 프레임에서 원판 y 범위가 사용 높이의 60% 이상에 퍼진다(테스트).
- 같은 τ 두 번 계산하면 같은 모델(결정성), 연속 τ 에서 그리기 순서 배열이 레인 순서와 일치(테스트).
- 플레이어 말이 있는 레이스에서 playerTags·myStanding 이 채워진다(테스트).
- 기존 viewer 테스트 통과(기대값이 바뀌면 이유 적고 갱신). 화면은 지금 그리기 코드로도 깨지지 않는다(새 필드는 R2 전까지 안 그려도 됨).
