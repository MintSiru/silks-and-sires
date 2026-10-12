# M3-D2a 레이스 띠: 고저 단면·구간 기록 + 실황 자막 연결(D1b)

담당: haiku-coder · 선행: M3-D1a 승인(ead11a8) · 근거: docs/m3-plan.md D1·D2, CLAUDE.md 원칙 2(2D Canvas 측면 띠 하나, 골자 유지)

## 목적
레이스 띠의 골자(좌 미니맵+코스 정보 / 중앙 번호 원판 / 우 상위 3두+착차+분수 오즈)는 그대로 두고, 좌측 패널에 고저 단면을, 중앙에 펄롱 구간 기록을 더한다. 띠 아래에 실황 자막을 띄우고, 레이스 후 말별 한 줄 평을 보여 준다. D1a 의 착차 문구를 착차 표기로 고친다.

## 사용할 것 (수정 금지)
- `RacePath.sample(s)`(gradient), `RaceReplay`, `RaceResult`(runners[].margin: Margin, sectionals), `Margin`·`MarginLabel`(types/race.ts)
- `extractCommentaryEvents`·`renderCommentary`·`horseVerdicts`(engine/commentary), `getCommentaryLines()`(engine/data/commentaryData.ts)
- 기존 `buildStripModel`·`drawStrip`·`RaceViewer` 구조

## 생성·수정할 파일
1. `src/ui/race-viewer/viewModel.ts`
   - `elevationProfile(path, distance, stepM = 20): { s: number; h: number }[]` — gradient 를 적분한 상대 높이(m), 출발점 h = 0.
   - StripModel.left 에 `profile: { points: {x;y}[]; marker: {x;y} }`(좌측 패널 하단 띠 안 좌표로 정규화, marker = 선두 위치).
   - StripModel.center 에 `split: string | null` — 선두가 지난 마지막 펄롱 구간 시간("12.4s", 첫 구간 전 null). 리플레이 프레임에서 선두가 펄롱 표지(SECTIONAL_STEP_M 간격, 결승 기준)를 지난 시각 차로 계산.
2. `src/ui/race-viewer/stripRenderer.ts` — 좌측 패널 아래쪽(텍스트 줄과 겹치지 않게)에 고저 단면 선과 선두 점, 중앙 상단 오른쪽에 구간 기록 작은 글씨. 색·크기 상수는 파일 상단 상수로.
3. `src/ui/race-viewer/RaceViewer.tsx` — props 에 `commentary?: { t: number; text: string }[]`, `verdicts?: { name: string; text: string }[]` 추가. 캔버스 아래 DOM 한 줄에 현재 시각 이하의 마지막 자막(없으면 빈 줄 높이 유지, `aria-live="polite"`). 레이스가 끝나면(t ≥ duration) 착순대로 한 줄 평 목록.
4. `src/ui/RaceDemo.tsx` — runRace 결과(replay·result·path)로 extractCommentaryEvents → renderCommentary(seed = 레이스 시드) → RaceViewer 에 전달, horseVerdicts 도 착순으로.
5. `src/engine/commentary/render.ts` — 문장 자리 표시 `{margin}` 추가: 승자와 2착의 Margin 을 한국어로(nose 코, short_head 짧은 머리, head 머리, neck 목, lengths "N마신"(0.25 단위는 "1¼마신"처럼 분수 기호), distance 대차, 동착 "동착"). `formatMarginKo(margin): string` export. finish·photo 사건 문장은 {n} 대신 {margin} 을 쓴다.
6. `data/text/commentary.ko.json` — finish 문장의 "{n}마신" 을 "{margin}"/"{margin} 차이" 로 고치고, 경마에 맞지 않는 표현(테이프 등)을 고친다. 5문장 이상·조사 규칙 유지.
7. 테스트: `tests/ui/raceViewModel.test.ts`(또는 기존 viewModel 테스트 파일)에 elevationProfile(평탄 코스 h 전부 0, 오르막 구간 h 증가)·split 계산 테스트, `tests/engine/commentary.test.ts` 에 formatMarginKo 테스트(모든 라벨) 추가.

## 수용 기준
1. 평탄 경로는 고저 단면이 수평, 오르막 +10m 구간이 있는 경로(예: saint_ourens 2,400m)는 최고점이 출발 대비 +8m 이상.
2. split: 합성 리플레이(선두가 일정 속도 16m/s)에서 펄롱 구간 시간 12.6±0.1s.
3. formatMarginKo: nose·short_head·head·neck·distance·동착·0.75·1.25·2·5.5 마신이 각각 정해진 문구.
4. RaceDemo 에서 자막이 레이스 진행에 맞춰 바뀌고, 결승 후 한 줄 평이 착순대로 나온다(브라우저 확인은 Opus 가 한다 — 화면 캡처용 dev 서버 실행 방법만 보고).
5. 띠의 기존 요소(미니맵, 원판, 상위 3두·착차·오즈, 사진 판정 표시)는 그대로 그려진다. 3D·실사 이미지·실제 방송사·기구 로고 없음(원칙 2).
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지. 레이스 시뮬레이션 수정 금지. 승부복 무늬·결과판·사진 판정 컷은 D2b(이번에 하지 않는다). git commit 금지.
