# M3-D2b 레이스 띠: 승부복 무늬 · 사진 판정 컷 · 결과판

담당: haiku-coder · 선행: M3-D2a 승인(55d49d4) · 근거: docs/m3-plan.md D2, CLAUDE.md 원칙 2(2D Canvas 측면 띠 하나, 골자 유지, 3D·실사·실제 로고 금지)

## 목적
번호 원판과 순위 목록에 마주 승부복(주색·보조색·무늬)을 보이게 하고, 접전이면 결승선 확대 '사진 판정' 컷을, 결승 후에는 띠 우측을 결과판(착순·착차·SP 오즈·OR 변동)으로 바꾼다.

## 사용할 것 (수정 금지)
- `Silks`(primary, secondary, pattern: 'plain' | 'hoops' | 'stripes' | 'quartered' | 'sash' | 'chevrons' | 'spots' | 'star'), `RaceEntry.silks`, `RaceResult`(runners: position, margin, odds), `formatMarginKo`(engine/race/results.ts), 기존 `buildStripModel`·`drawStrip`·`RaceViewer`

## 생성·수정할 파일
1. `src/ui/race-viewer/silks.ts` (신규) — `drawSilksDisc(ctx, x, y, r, silks)`: 원 안을 무늬로 칠한다(원 밖으로 안 나가게 clip). hoops 가로 띠 3줄, stripes 세로 줄 3개, quartered 4분할 교차색, sash 대각선 띠, chevrons V자 2개, spots 점 4~5개, star 가운데 별, plain 단색. 테두리는 기존 discBorderFor 규칙. 번호 글자는 원판 위에 기존처럼(가독 위해 번호 뒤에 주색 작은 원).
2. `src/ui/race-viewer/stripRenderer.ts` — 원판과 우측 순위 행 아이콘을 drawSilksDisc 로. 사진 판정 컷: 레이스가 끝났고 photo(1·2착 착차 nose/short_head/head/동착) 이면, 결승 직후 2초 동안 중앙 영역 위에 확대 패널(결승선 세로선 + 1·2착 원판, 결승 통과 순간 위치 차이를 픽셀로 확대, '사진 판정' 글자). 2초 뒤 결과판.
3. `src/ui/race-viewer/viewModel.ts` — StripModel.right 에 `board: BoardRow[] | null`(결승 후): 착순·마번·마명·착차(formatMarginKo)·SP 분수 오즈·OR 변동(선택 정보, 없으면 생략). 결과판은 상위 6두. `ViewerInfo` 에 선택 필드 `ratingChanges?: Record<number /*runner index*/, { from: number | null; to: number }>`. StripModel.center 에 `photoCut: { t0: number; winner: number; second: number; gapM: number } | null`.
4. `src/ui/race-viewer/RaceViewer.tsx` — 결과판·사진 컷 시간 처리(필요한 최소 변경).
5. 테스트: `tests/ui/silks.test.ts`(무늬 8종이 각각 서로 다른 그리기 호출 패턴을 내고 clip 을 쓴다 — 모의 ctx), `tests/ui/viewModel.test.ts` 에 board·photoCut 계산 테스트.

## 수용 기준
1. 8가지 무늬가 모두 그려지고(모의 ctx 로 fill/stroke 호출 확인), 원판 밖으로 그리지 않는다(clip 사용).
2. photo 레이스에서 photoCut 이 만들어지고 gapM 은 1·2착 결승 시각 차 × 승자 속도와 ±0.1m 이내. photo 가 아니면 null.
3. 결과판: 상위 6두, 착차 문구가 formatMarginKo 와 같고, OR 변동이 주어지면 "+3", "−2", "첫 OR 98" 형식.
4. 브라우저(RaceDemo)에서 원판 무늬·결과판·사진 컷이 보인다(확인은 Opus. dev 서버 방법만 보고).
5. 원칙 2 준수, 성능: 60프레임 재생 중 프레임당 그리기 2ms 이하(모의 측정 또는 기존 테스트 방식).
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
엔진(src/engine) 수정 금지. 실제 방송사·경마 기구 로고·실사 이미지 금지. git commit 금지.
