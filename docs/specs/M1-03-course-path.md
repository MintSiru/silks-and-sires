# M1-03 경마장 로더·검증 + RacePath (경사·곡률·미니맵)

담당: haiku-coder · 선행: M0-01

## 목적
트랙 구간 데이터로 레이스 경로 `RacePath` 를 만든다. 시뮬레이터는 매 틱 `sample(s)` 로 경사·곡률을 얻고, 뷰어는 폴리라인으로 미니맵을 그린다.

## 생성할 파일
1. `src/engine/config/course.ts`
2. `src/engine/course/path.ts`
3. `src/engine/course/load.ts`
4. `tests/engine/course.test.ts`

## 사용할 타입 (수정 금지, `src/engine/types`)
`Racecourse, TrackLayout, TrackSegment, CourseDistance, RacePath, RacePathSample, PathPoint, Handedness`

## 구현 사양

### config/course.ts
```ts
/** 1펄롱(m) */
export const FURLONG_M = 201.168;
/** 폴리라인 샘플 간격(m) */
export const POLYLINE_STEP_M = 10;
/** 닫힌 레이아웃 폐합 허용 오차(m) */
export const CLOSURE_TOLERANCE_M = 1;
/** 각도·고도 합 검사 허용 오차 */
export const ANGLE_TOLERANCE_RATIO = 0.01;
export const RISE_TOLERANCE_M = 0.01;
```

### course/path.ts
```ts
export function layoutLength(layout: TrackLayout): number;
/** 끝에서부터 연속된 straight 구간 길이 합 */
export function homeStraightLength(layout: TrackLayout): number;
export function findCourseDistance(course: Racecourse, distance: number): CourseDistance | undefined;
export function buildRacePath(course: Racecourse, distance: number): RacePath;
```
- **레이아웃 좌표 u**: 레이아웃 시작 0 ~ 끝 L(=결승선). 레이스 출발점 `u0 = L - distance`.
  - closed: u0 가 음수면 L 의 배수를 더해 [0, L) 로. `sample(s)` 는 `u = (u0 + s)` 를 L 로 감싼다(결승 후에도 계속 감아 돈다).
  - closed=false: u0 < 0 이면 `buildRacePath` 가 Error. `u0 + s > L` (결승 후)이면 마지막 구간 끝에서 마지막 방향 그대로 직선 연장, gradient 0, curvature 0, turn null.
  - s < 0 은 0 으로 취급.
- **미니맵 기하**: 시작점 (0,0), 방향각 0(+x). y 위쪽이 + 인 수학 좌표.
  - straight: `x += len*cos h`, `y += len*sin h`.
  - bend: σ = left ? +1 : -1, φ = t/r (구간 시작부터 t 만큼 진행), `x = x0 + σ r (sin(h0+σφ) - sin h0)`, `y = y0 - σ r (cos(h0+σφ) - cos h0)`, 방향 `h0 + σφ`.
  - 구간 시작점 좌표·방향을 미리 계산해 두고 sample 에서는 해당 구간만 해석적으로 계산한다(누적 적분 금지).
- **RacePathSample**: `s`, `toFinish = distance - s`, `gradient = rise/length` (구간 내 일정), `curvature = bend ? 1/radius : 0`, `turn`, `isHomeStraight = toFinish <= homeStraightLength(layout)` (결승 후 포함 true), `point`.
- `layoutPolyline`: u = 0, STEP, 2·STEP … 마지막 L 까지(마지막 점 포함). `racePolyline`: s = 0 … distance (마지막 점 포함).
- RacePath 필드: racecourseId, layoutId, handedness(layout 것), surface(course 것), distance, homeStraightLength, width(layout 것).
- 해당 distance 가 course.distances 에 없으면 Error.
- **성능**: sample() 은 레이스 1회에 약 6만 번 불린다. 구간 탐색은 직전 탐색 구간부터 시작하는 캐시 또는 이분 탐색을 써라. 결과는 탐색 순서와 무관하게 같아야 한다.

### course/load.ts
```ts
export function validateRacecourse(c: Racecourse): string[];   // 문제 목록
export function loadRacecourses(raw: unknown): Racecourse[];    // 배열 아님/검증 실패 → Error (메시지에 경마장 id 와 문제 포함)
export function getRacecourse(list: readonly Racecourse[], id: string): Racecourse;  // 없으면 Error
```
validateRacecourse 검사: id·name 비어 있지 않음, surface ∈ {turf, aw}, layouts 1개 이상·id 중복 없음, 모든 구간 length>0, bend 는 radius>0·turn 이 layout.handedness 와 같음, straight 에는 radius/turn 없음, handedness 'straight' 레이아웃엔 bend 없음, distances 의 layoutId 존재, closed=false → 총길이 ≥ 그 레이아웃 최대 distance, closed=true → rise 합 |·| ≤ RISE_TOLERANCE_M, bend 각도 합 = 2π(상대 오차 ≤ ANGLE_TOLERANCE_RATIO), 끝점과 시작점 거리 ≤ CLOSURE_TOLERANCE_M.

## 수용 기준 (테스트 파일 안에 인라인 픽스처로 검증 — data/ 파일에 의존하지 말 것)
픽스처 A: 닫힌 우회전 오벌 — straight 150 / bend 691.150 r220 right / straight 750 / bend 691.150 r220 right / straight 600 (closed, width 30), distances 1600/3000.
픽스처 B: 열린 좌회전 — straight 450 rise 12 / bend 300 r250 left rise 6 / straight 500 rise -4 / bend 450 r280 left rise -18 / straight 350 rise -6 / straight 450 rise 4, distances 1006/2414.
1. 픽스처 A 의 layoutLength ≈ 2882.30 (±0.01), 폐합 오차 < 1m, validateRacecourse 가 빈 배열.
2. A·1600m: sample(0).toFinish = 1600, sample(1600).isHomeStraight = true, sample(1000).isHomeStraight = false, homeStraightLength = 600. A·3000m: u0 가 음수에서 감싸져도 sample(3000) 의 point 가 결승선 좌표(0,0)와 0.01m 이내.
3. B·2414m: 출발 지점의 gradient = 12/450, sample(2414 - 100) 의 gradient = 4/450, 2번째 bend 위의 curvature = 1/280, turn 'left'. homeStraightLength = 800.
4. B 로 3000m 를 요청하면 buildRacePath 가 throw. 없는 거리(1500)도 throw.
5. racePolyline 첫 점 = sample(0).point, 마지막 점 = sample(distance).point. 인접 점 간 거리 ≤ POLYLINE_STEP_M + 0.01.
6. 잘못된 데이터(bend 에 radius 없음, 폐합 안 되는 closed 레이아웃, 없는 layoutId 참조) 각각 validateRacecourse 가 문제를 1개 이상 반환하고 loadRacecourses 가 throw.
7. 성능: A·3000m 에서 sample() 을 s=0..3000 을 0.05 간격으로 3회 반복 호출(약 18만 회)하는 데 100ms 미만 (`performance.now()` 는 테스트 파일에서만 사용).

## 금지 사항
- 공용 타입 수정 금지. 목록 외 파일 금지. 새 패키지 금지. 엔진 코드에 DOM/시간 API 금지.
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/course.test.ts && npm run typecheck && npm run lint`
