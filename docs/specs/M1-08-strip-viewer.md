# M1-08 Canvas 2D 띠 뷰어

담당: haiku-coder · 선행: M1-03(RacePath), M1-06(margin 포맷), M1-05(formatOdds), M1-01(goingLabel)

## 목적
`RaceReplay` 를 가로 띠 한 줄로 재생한다. 좌측 미니맵+코스 정보, 중앙 번호 원판(승부복 주색) 이동, 우측 상위 3두+착차+분수 오즈. 3D·이미지·실제 로고 금지.

## 생성할 파일
1. `src/ui/race-viewer/viewModel.ts` — 순수 계산(DOM 없음)
2. `src/ui/race-viewer/stripRenderer.ts` — `CanvasRenderingContext2D` 에 그리기만 하는 순수 함수
3. `src/ui/race-viewer/RaceViewer.tsx` — React 래퍼(재생 제어)
4. `tests/ui/viewModel.test.ts`
5. `tests/ui/stripRenderer.test.ts` (기록용 가짜 ctx 사용)

## 사용할 타입·함수 (수정 금지)
- 타입: `RaceReplay, ReplayFrame, RaceResult, RaceEntry, RacePath, PathPoint, Going, Surface, RaceGrade, HexColor` (`src/engine/types`)
- `marginFromLengths, formatMarginKo` (`src/engine/race/results.ts`), `formatOdds` (`src/engine/race/odds.ts`), `goingLabel` (`src/engine/going/going.ts`)

## 구현 사양

### viewModel.ts
UI 상수는 파일 상단에 이름 붙인 상수로 둔다:
`LENGTH_M = 2.4`, `FURLONG_M = 201.168`, `CAMERA_MIN_SPAN_M = 30`, `CAMERA_PADDING_RATIO = 0.08`, `CAMERA_FINAL_ZOOM_M = 200`, `CAMERA_FINAL_GROUP = 4`, `DISC_RADIUS = 13`, `OVERLAP_ALPHA = 0.55`, `STRIP_BG = '#1d2733'`, `LOW_CONTRAST_RATIO = 1.6`, `LEFT_PANEL_W = 250`, `RIGHT_PANEL_W = 290`, `PHOTO_HOLD_S = 2`.

```ts
export interface ViewerInfo {
  raceName: string;
  grade: RaceGrade | null;
  courseName: string;
  surface: Surface;
  distance: number;
  going: Going;
  /** index = runner index */
  entries: RaceEntry[];
  /** index = runner index */
  horseNames: string[];
}
export function replayDuration(replay: RaceReplay): number;            // 마지막 프레임 t
export function frameAt(replay: RaceReplay, t: number): ReplayFrame;   // t 를 [0, duration] 로 clamp, 인접 두 프레임 선형 보간, 새 객체
export interface CameraWindow { from: number; to: number; }
export function cameraWindow(frame: ReplayFrame, distance: number): CameraWindow;
export interface StandingRow { runnerIndex: number; saddleCloth: number; silksPrimary: HexColor; horseName: string; marginText: string; oddsText: string; }
export function liveStandings(frame: ReplayFrame, info: ViewerInfo, count?: number): StandingRow[];   // 기본 3
export function finalStandings(result: RaceResult, info: ViewerInfo, count?: number): StandingRow[];
export function relativeLuminance(hex: HexColor): number;   // WCAG sRGB
export function contrastRatio(a: HexColor, b: HexColor): number;
export function textColorFor(bg: HexColor): '#000000' | '#ffffff';   // 흰 글자 대비 vs 검은 글자 대비 중 큰 쪽
export function discBorderFor(fill: HexColor): HexColor;            // contrastRatio(fill, STRIP_BG) < LOW_CONTRAST_RATIO 이면 '#ffffff', 아니면 '#000000'
export function formatDistanceLabel(surface: Surface, distance: number): string;  // 'TURF 1,600m (8f)', 'AW 1,207m (6f)'. 펄롱은 0.5 단위 반올림, ½ 은 '½' 문자: 1408 → '7f', 2012 → '10f', 1100 → '5½f'
export function formatRemaining(toFinish: number): string;   // toFinish <= 0 → '결승', 그 외 0.5f 단위 반올림 '2f', '1½f', 반올림 결과 0 이면 '½f'
export function speedKmh(mps: number): number;               // Math.round(mps × 3.6)
export interface DiscPlacement { runnerIndex: number; x: number; y: number; fill: HexColor; textColor: string; border: HexColor; label: string; isPlayer: boolean; alpha: number; }
export interface Rect { x: number; y: number; w: number; h: number; }
export function placeDiscs(frame: ReplayFrame, win: CameraWindow, info: ViewerInfo, rect: Rect, trackWidth: number): DiscPlacement[];
export interface StripModel {
  width: number; height: number;
  left: { layout: PathPoint[]; race: PathPoint[]; leader: PathPoint; distanceLabel: string; goingLabel: string; remainingLabel: string; speedLabel: string; };
  center: { rect: Rect; discs: DiscPlacement[]; poles: { x: number; label: string }[]; finishX: number | null; };
  right: { rows: StandingRow[]; raceName: string; gradeBadge: string | null; courseName: string; finished: boolean; photo: boolean; };
}
export function buildStripModel(args: { replay: RaceReplay; t: number; path: RacePath; info: ViewerInfo; result: RaceResult; width: number; height: number; }): StripModel;
```
- **cameraWindow**: leader = 최대 progress. 선두의 `distance - leader` 가 `0 < … <= CAMERA_FINAL_ZOOM_M` 이면 상위 CAMERA_FINAL_GROUP 두 중 최소 progress 를 trailer 로, 아니면 전체 최소 progress. `span = max(CAMERA_MIN_SPAN_M, leader - trailer)`, `pad = span × CAMERA_PADDING_RATIO + LENGTH_M`, `{ from: trailer - pad, to: leader + pad }`.
- **liveStandings**: progress 내림차순(같으면 saddleCloth 오름차순) 상위 count. 1위 marginText '선두', 이후는 직전 말과 progress 차 / LENGTH_M → `formatMarginKo(marginFromLengths(gap))`. oddsText = entry.odds 가 있으면 formatOdds, 없으면 '-'.
- **finalStandings**: result.runners 앞 count 개. 1착 marginText '1착'(동착이면 둘 다 '1착'), 이후 margin null 이면 '동착', 아니면 formatMarginKo(margin).
- **placeDiscs**: `x = rect.x + (progress - from)/(to - from) × rect.w`, `y = rect.y + rect.h - DISC_RADIUS - (lane / trackWidth) × (rect.h - 2·DISC_RADIUS)` (아래쪽이 내측 레일). progress 오름차순 정렬(뒤쪽 말을 먼저 그려 앞 말이 위에 오도록). 자기보다 progress 가 큰 원판과 중심 거리 < 2·DISC_RADIUS 이면 alpha = OVERLAP_ALPHA, 아니면 1. label = 마번 문자열. fill = entry.silks.primary, textColor = textColorFor(fill), border = discBorderFor(fill), isPlayer = entry.isPlayer.
- **buildStripModel**: frame = frameAt(replay, t). center.rect = `{ x: LEFT_PANEL_W, y: 0, w: width - LEFT_PANEL_W - RIGHT_PANEL_W, h: height }`. poles: 결승선에서 1펄롱 간격으로 거꾸로 잡은 지점 중 창 안에 있는 것, label = '1f','2f'…. finishX = 결승선이 창 안이면 그 x, 아니면 null. left.leader = path.sample(leaderProgress).point, remainingLabel = formatRemaining(distance - leaderProgress), speedLabel = `${speedKmh(leaderSpeed)} km/h`, goingLabel = goingLabel(info.going), distanceLabel = formatDistanceLabel. right: 3착마 finishTime 이 지나면(t >= result.runners[2]?.finishTime, 두수<3이면 마지막 말) finished = true, rows = finalStandings, 아니면 liveStandings. photo = finished 이고 2착 margin 이 null(동착)·nose·short_head 중 하나이며 t < 3착 finishTime + PHOTO_HOLD_S. gradeBadge = grade ('L' 은 'Listed').

### stripRenderer.ts
```ts
export function drawStrip(ctx: CanvasRenderingContext2D, model: StripModel): void;
```
그리는 것(이 순서): ① 전체 배경 ② 좌측 패널: 미니맵(레이아웃 폴리라인을 패널 상단 정사각형 영역에 bbox 맞춤·균등 축척·y 뒤집기, 가는 회색 선 / race 폴리라인 굵은 흰 선 / leader 노란 점), 그 아래 4줄 텍스트(distanceLabel, '마장 ' + goingLabel, '남은 거리 ' + remainingLabel, '선두 ' + speedLabel) ③ 중앙: STRIP_BG 배경, 아래쪽 내측 레일 선, 펄롱 표지 세로 점선+라벨, 결승선(finishX) 빨간 세로선, 우상단 진행 방향 '→' ④ 원판: 각 disc 를 globalAlpha 로 원(arc) 채우기 + border 1px, isPlayer 면 금색(#f5c518) 3px 링 추가, 중앙에 label(굵게, textColor) ⑤ 우측 패널: rows 마다 작은 원판(silksPrimary) + 마번 + marginText + oddsText, 하단에 raceName, gradeBadge(있으면 둥근 사각 배지), courseName. photo 면 중앙 상단에 'PHOTO' 텍스트.
- ctx.save()/restore() 로 상태 누수 방지. 외부 이미지·폰트 로드 금지(system-ui).

### RaceViewer.tsx
```tsx
export interface RaceViewerProps { replay: RaceReplay; result: RaceResult; path: RacePath; info: ViewerInfo; width?: number; height?: number; }
export default function RaceViewer(props: RaceViewerProps): JSX.Element;
```
- 기본 width 1200, height 200. canvas 는 devicePixelRatio 로 스케일.
- 상태: playing(기본 true), speed 1|2|4, t. requestAnimationFrame 루프에서 `t += 실시간 경과(s) × speed`, duration 에 도달하면 정지. 언마운트 시 rAF 취소.
- 컨트롤 버튼: 재생/일시정지, 1×, 2×, 4×(현재 배속 강조), '결과만'(t = duration, 정지), '처음부터'(t = 0, 재생).
- t 또는 props 가 바뀔 때 buildStripModel → drawStrip.
- 시간은 `performance.now()` 사용(UI 는 허용).

## 수용 기준
1. frameAt: t=0 → 첫 프레임 값, t=0.05 → 첫 두 프레임 중간값, t > duration → 마지막 프레임. 반환값 수정이 replay 를 바꾸지 않는다.
2. cameraWindow: 선두가 결승 150m 전이면 상위 4두만 창에 넣고(5위 이하 progress 가 from 보다 작을 수 있음), 모든 경우 to - from >= CAMERA_MIN_SPAN_M.
3. liveStandings: 3두 순서·'선두'·착차 문자열(예: 1.2m 차 → '½마신', 0.1m → '코'). finalStandings 가 result 순서를 따른다.
4. textColorFor('#ffffff') = '#000000', textColorFor('#000080') = '#ffffff', textColorFor('#ffd100') = '#000000'. discBorderFor(STRIP_BG 와 비슷한 '#1f2a36') = '#ffffff'.
5. formatDistanceLabel('turf', 1600) = 'TURF 1,600m (8f)', ('aw', 1207) = 'AW 1,207m (6f)', ('turf', 1100) = 'TURF 1,100m (5½f)'. formatRemaining(402) = '2f', (300) = '1½f', (-1) = '결승'.
6. placeDiscs: 겹치는 두 원판 중 뒤쪽 alpha 0.55, 앞쪽 1. lane 0 인 원판 y 가 lane 이 큰 원판보다 아래(값이 큼).
7. drawStrip 을 기록용 가짜 ctx(모든 메서드 호출을 배열에 기록하는 객체)로 호출: arc 호출 수 >= 출주 두수, fillText 에 raceName·goingLabel 이 포함, save/restore 호출 수가 같다.
8. `npm run build` 성공(TSX 타입 포함).

## 금지 사항
- 엔진 파일·공용 타입 수정 금지. 목록 외 파일 금지. 새 패키지 금지(테스트는 jsdom 없이 node 환경 + 가짜 ctx).
- 다른 티켓(M1-07)이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/ui/viewModel.test.ts tests/ui/stripRenderer.test.ts && npm run typecheck && npm run lint && npm run build`
