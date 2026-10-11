# M1-01 마장 7단계 + AW 3단계

담당: haiku-coder · 선행: M0-03(Rng)

## 목적
마장 표기·순서·적성 계산·당일 마장 추첨을 순수 함수로 제공한다.

## 생성할 파일
1. `src/engine/config/going.ts`
2. `src/engine/going/going.ts`
3. `tests/engine/going.test.ts`

## 사용할 타입 (수정 금지, `src/engine/types`)
`Going, TurfGoing, AwGoing, TURF_GOING_ORDER, AW_GOING_ORDER, Aptitudes, Surface, Racecourse, Rng`

## 구현 사양

### config/going.ts (값 그대로)
```ts
import type { Going } from '../types';
/** 띠 뷰어·UI 표기 (영문 대문자) */
export const GOING_LABELS: Record<Going, string> = {
  firm: 'FIRM', good_to_firm: 'GOOD TO FIRM', good: 'GOOD', good_to_soft: 'GOOD TO SOFT',
  soft: 'SOFT', soft_to_heavy: 'SOFT TO HEAVY', heavy: 'HEAVY',
  standard_to_fast: 'STANDARD TO FAST', standard: 'STANDARD', standard_to_slow: 'STANDARD TO SLOW',
};
/** 기본 속도 배수 */
export const GOING_SPEED_FACTOR: Record<Going, number> = {
  firm: 1.015, good_to_firm: 1.008, good: 1.0, good_to_soft: 0.985, soft: 0.965, soft_to_heavy: 0.945, heavy: 0.925,
  standard_to_fast: 1.004, standard: 1.0, standard_to_slow: 0.994,
};
/** 스태미나 소모 배수 */
export const GOING_STAMINA_DRAIN: Record<Going, number> = {
  firm: 0.97, good_to_firm: 0.985, good: 1.0, good_to_soft: 1.03, soft: 1.07, soft_to_heavy: 1.11, heavy: 1.16,
  standard_to_fast: 0.99, standard: 1.0, standard_to_slow: 1.02,
};
/** 파워 능력치가 속도에 영향을 주는 정도 0~1 (무거울수록 큼) */
export const GOING_POWER_WEIGHT: Record<Going, number> = {
  firm: 0, good_to_firm: 0.1, good: 0.2, good_to_soft: 0.4, soft: 0.6, soft_to_heavy: 0.8, heavy: 1.0,
  standard_to_fast: 0.1, standard: 0.15, standard_to_slow: 0.25,
};
/** 착차 환산 (마신/초) */
export const LENGTHS_PER_SECOND: Record<Going, number> = {
  firm: 6, good_to_firm: 6, good: 5.5, good_to_soft: 5.5, soft: 5, soft_to_heavy: 5, heavy: 4.5,
  standard_to_fast: 6, standard: 6, standard_to_slow: 5.5,
};
/** 마장 적성: 최적일 때 보너스, 완전히 벗어났을 때 최대 감점 (속도 비율) */
export const GOING_FIT_BONUS = 0.005;
export const GOING_FIT_MAX_PENALTY = 0.03;
/** AW 적성 1.0 당 속도 효과 */
export const AW_APTITUDE_EFFECT = 0.02;
/** 월별(1~12) 잔디 마장 기준 인덱스 (0=firm ~ 6=heavy) */
export const GOING_MONTH_BASE = [4.5, 4.5, 4.0, 3.0, 2.5, 2.0, 1.8, 2.0, 2.5, 3.2, 4.0, 4.5] as const;
/** 당일 변동 표준편차(인덱스) */
export const GOING_DAILY_SD = 1.0;
/** 배수(drainage) 효과: index += (0.5 - drainage) * 이 값 */
export const GOING_DRAINAGE_EFFECT = 1.0;
/** AW 마장 확률 [standard_to_fast, standard, standard_to_slow] */
export const AW_GOING_WEIGHTS = [0.15, 0.75, 0.1] as const;
```

### going/going.ts
```ts
export function isTurfGoing(g: Going): g is TurfGoing;
export function isAwGoing(g: Going): g is AwGoing;
export function goingLabel(g: Going): string;                       // GOING_LABELS
export function turfGoingIndex(g: TurfGoing): number;               // TURF_GOING_ORDER 인덱스 0~6
export function turfGoingFromIndex(i: number): TurfGoing;           // Math.round 후 0~6 으로 clamp
export function isGoingValidForSurface(g: Going, surface: Surface): boolean;
/** 마장 적성 배수 (1 근처) */
export function goingFit(apt: Pick<Aptitudes, 'goingPreference' | 'goingTolerance' | 'allWeather'>, g: Going): number;
/** 당일 마장 추첨 */
export function rollGoing(rng: Rng, course: Pick<Racecourse, 'surface' | 'drainage'>, month: number): Going;
```
- goingFit:
  - 잔디: `d = |turfGoingIndex(g) - goingPreference|`, `w = Math.exp(-((d / goingTolerance) ** 2))`, 반환 `1 + GOING_FIT_BONUS * w - GOING_FIT_MAX_PENALTY * (1 - w)`.
  - AW: `1 + AW_APTITUDE_EFFECT * allWeather`.
  - goingTolerance <= 0 이면 RangeError.
- rollGoing:
  - month 가 1~12 정수가 아니면 RangeError.
  - AW: `u = rng.next()` 한 번으로 AW_GOING_WEIGHTS 누적 확률에서 선택.
  - 잔디: `idx = GOING_MONTH_BASE[month-1] + rng.normal(0, GOING_DAILY_SD) + (0.5 - drainage) * GOING_DRAINAGE_EFFECT` → `turfGoingFromIndex(idx)`.

## 수용 기준
1. `turfGoingIndex` / `turfGoingFromIndex` 가 7단계 전부 왕복 일치. `turfGoingFromIndex(-3) === 'firm'`, `(9) === 'heavy'`.
2. goingFit: 선호 마장(d=0)에서 `1.005`, d 가 커질수록 단조 감소, d=6·tolerance=1 에서 0.97 에 근접(±0.001). AW 에서 allWeather=1 → 1.02, -1 → 0.98.
3. rollGoing: AW 코스는 AW 마장만, 잔디 코스는 잔디 마장만 반환 (각 1,000회).
4. 같은 시드 Rng 두 개로 rollGoing 100회 결과가 같다.
5. 잔디·drainage 0.5 에서 7월 10,000회 평균 인덱스가 1월 평균보다 2 이상 낮다(7월이 더 빠른 마장).
6. 모든 Going 키가 config 의 6개 Record 에 빠짐없이 있다(테스트로 TURF/AW 순서 배열 순회 확인).

## 금지 사항
- 공용 타입 수정 금지. 목록 외 파일 금지. 코드 안에 위 상수 외의 매직 넘버 금지(0, 1, 0.5 같은 자명한 값 제외).
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/going.test.ts && npm run typecheck && npm run lint`
