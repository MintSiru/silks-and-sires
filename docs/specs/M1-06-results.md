# M1-06 레이스 결과: 착순·동착·착차 라벨·구간 타임·성적 지수

담당: haiku-coder · 선행: M1-01 (`src/engine/config/going.ts` 의 LENGTHS_PER_SECOND)

## 목적
시뮬레이터의 원시 결승 기록(FinishRecord[])을 `RaceResult` 로 변환하고, 착차를 유럽식 라벨로 표기한다.

## 생성할 파일
1. `src/engine/config/results.ts`
2. `src/engine/race/results.ts`
3. `tests/engine/results.test.ts`

## 사용할 타입 (수정 금지, `src/engine/types`)
`Race, RaceEntry, FinishRecord, Margin, MarginLabel, RunnerResult, RaceResult, Going, GameDate`
config: `LENGTHS_PER_SECOND` (src/engine/config/going.ts), `FURLONG_M` 는 이 티켓 config 에 별도로 두지 말고 아래 값을 쓴다(중복 방지 위해 results config 에 `SECTIONAL_STEP_M = 201.168` 로 둔다).

## 구현 사양

### config/results.ts
```ts
/** 구간 표지 간격(m) = 1펄롱 */
export const SECTIONAL_STEP_M = 201.168;
/** 첫 구간이 이보다 짧으면 그 표지는 생략 */
export const MIN_FIRST_SECTION_M = 50;
/** 이 시간차(s) 이하이면 동착 */
export const DEAD_HEAT_SECONDS = 0.002;
/** 마신 기준 라벨 상한(미만) */
export const NOSE_MAX_L = 0.1;
export const SHORT_HEAD_MAX_L = 0.2;
export const HEAD_MAX_L = 0.3;
export const NECK_MAX_L = 0.45;
/** 3마신 미만은 ¼ 단위, 5마신 미만은 ½ 단위, 그 이상 1 단위 */
export const QUARTER_LENGTH_LIMIT_L = 3;
export const HALF_LENGTH_LIMIT_L = 5;
/** 이 이상이면 'distance' */
export const DISTANCE_MARGIN_L = 30;
export const MIN_LENGTH_MARGIN_L = 0.5;
/** 거리별 1마신당 lb [거리(m), lb], 선형 보간, 양끝 밖은 끝값 */
export const LB_PER_LENGTH_TABLE: readonly (readonly [number, number])[] = [
  [1006, 3], [1207, 2.5], [1408, 2.25], [1609, 2], [2012, 1.75], [2414, 1.5], [3219, 1.25],
];
/** 성적 지수 소수 자릿수 */
export const FIGURE_DECIMALS = 1;
```

### race/results.ts
```ts
export function sectionalMarks(distance: number): number[];
export function lbPerLength(distance: number): number;
export function marginFromLengths(lengths: number, deadHeat?: boolean): Margin;
export function formatMargin(m: Margin): string;     // 영문 약어
export function formatMarginKo(m: Margin): string;   // 한국어
export function buildRaceResult(args: {
  race: Race; going: Going; date: GameDate; seed: number;
  entries: readonly RaceEntry[];        // index = runner index
  finishes: readonly FinishRecord[];    // 순서 무관, runner 당 정확히 1개
  marks: readonly number[];             // sectionalMarks(race.distance) 결과
}): RaceResult;
```
- **sectionalMarks**: `k = floor(distance / STEP)` 부터 1 까지 `m = distance - k*STEP`; `m >= MIN_FIRST_SECTION_M` 인 것만 포함하되 k=1 쪽(결승 가까운 쪽)은 항상 포함 조건을 만족한다. 오름차순 반환. 예) 1609 → 7개 표지(첫 표지 200.82…), 2012 → 9개(첫 표지 = 2012-9×201.168=201.488), 1006 → 4개.
- **marginFromLengths(L, deadHeat)**: deadHeat → `{dead_heat, 0}`. L < NOSE → nose, < SHORT_HEAD → short_head, < HEAD → head, < NECK → neck, L >= DISTANCE → `{distance, 0}`. 그 외 lengths: L < QUARTER 한도 → 0.25 단위 반올림, L < HALF 한도 → 0.5 단위, 그 외 1 단위; 결과가 MIN_LENGTH_MARGIN_L 보다 작으면 0.5.
- **formatMargin**: dead_heat 'dh', nose 'nse', short_head 'shd', head 'hd', neck 'nk', distance 'dist', lengths → 정수부 + 분수 문자(¼ ½ ¾), 정수부 0 이면 분수만: 0.5 → '½', 1.25 → '1¼', 3 → '3'.
- **formatMarginKo**: 동착 '동착', 코 '코', 짧은머리 '짧은머리', 머리 '머리', 목 '목', 대차 '대차', lengths → `${formatMargin}마신` (예 '1¼마신').
- **lbPerLength**: 표 선형 보간.
- **buildRaceResult**:
  1. finishes 의 runnerIndex 집합이 0..entries.length-1 과 정확히 같지 않으면 Error.
  2. finishTime 오름차순, 같으면 saddleCloth 오름차순으로 정렬.
  3. 순서대로: 첫 말 position 1, margin null. 이후 말은 직전 말과 시간차 Δ ≤ DEAD_HEAT_SECONDS 이면 직전 말과 같은 position, 직전 말의 margin 이 null 이면 이 말도 null, 아니면 `marginFromLengths(0, true)`. 그 외 position = 정렬 index + 1, margin = marginFromLengths(Δ × LENGTHS_PER_SECOND[going]).
  4. beatenLengths = (finishTime - winningTime) × LENGTHS_PER_SECOND[going].
  5. sectionals: markTimes 가 [t1..tk] 이면 `[t1, t2-t1, …, tk-t(k-1), finishTime - tk]`; marks 가 비면 `[finishTime]`.
  6. performanceFigure = round(-(beatenLengths × lbPerLength(distance)) + (weightLb - 1착마 weightLb), FIGURE_DECIMALS).
  7. 나머지 필드는 entries/args 에서 복사(odds 는 entry.odds). winningTime = 1착 finishTime. sectionalMarks = marks 복사본.

## 수용 기준
1. sectionalMarks(1609) 길이 7, 첫 값 ≈ 200.82, 마지막 값 ≈ 1407.83; sectionalMarks(2012) 첫 값 ≈ 201.49 (길이 9); 모든 결과 오름차순·distance 미만.
2. marginFromLengths: 0.05→nose, 0.15→short_head, 0.25→head, 0.4→neck, 0.6→½(0.5), 0.9→¾, 1.1→1, 2.9→3, 3.3→3.5, 4.8→5, 7.4→7, 31→distance. formatMargin/formatMarginKo 가 위 표기대로.
3. 5두 픽스처(finishTime 60.000, 60.001, 60.300, 61.000, 70.000 / going 'good' → LPS 5.5 / 마번 1~5):
   1·2번째 말 동착 → 둘 다 position 1, margin 둘 다 null. 3번째 말 position 3, Δ=0.299s → 1.6445L → `{ label: 'lengths', lengths: 1.75 }`.
   4번째 말 Δ=0.7s → 3.85L → `{ lengths, 4 }` (0.5 단위). 5번째 말 Δ=9s → 49.5L → `{ label: 'distance', lengths: 0 }`.
4. performanceFigure: 1착 0. 1마일·1마신 패배·동일 중량 → -2.0. 1착보다 5lb 무거운 말이 1마신 패배 → 3.0.
5. 구간 타임 합 = finishTime (±1e-9).
6. finishes 누락·중복 runnerIndex → throw.

## 금지 사항
- 공용 타입 수정 금지, `src/engine/config/going.ts` 수정 금지. 목록 외 파일 금지.
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/results.test.ts && npm run typecheck && npm run lint`
