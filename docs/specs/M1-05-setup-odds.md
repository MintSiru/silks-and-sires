# M1-05 출주 준비(마번·게이트 추첨) + 분수 오즈 + 샘플 출주마 생성

담당: haiku-coder · 선행: M0-03(Rng)

## 목적
레이스 직전 단계: 마번 부여, 게이트 추첨, 시장 오즈(유럽식 분수) 계산, 그리고 M1 데모·테스트용 샘플 출주마 생성.

## 생성할 파일
1. `src/engine/config/raceday.ts`
2. `src/engine/race/setup.ts`
3. `src/engine/race/odds.ts`
4. `src/engine/race/sampleField.ts`
5. `tests/engine/raceday.test.ts`

## 사용할 타입 (수정 금지, `src/engine/types`)
`Rng, RaceEntry, FractionalOdds, RunnerInput, RunningStyle, Silks, SilksPattern, HexColor, Surface, HorseId, JockeyId`

## 구현 사양

### config/raceday.ts (값 그대로)
```ts
import type { HexColor, RunningStyle, SilksPattern } from '../types';
/** 시장 인식 오차 표준편차 (strength 단위 = 초) */
export const MARKET_NOISE_SD = 0.35;
/** softmax 온도 (초) */
export const MARKET_TEMPERATURE = 0.55;
/** 북메이커 오버라운드 */
export const MARKET_OVERROUND = 1.18;
/** 표준 분수 오즈 사다리 [num, den], 짧은 → 긴 순 */
export const ODDS_LADDER: readonly (readonly [number, number])[] = [
  [1,5],[2,9],[1,4],[2,7],[1,3],[4,11],[2,5],[4,9],[1,2],[8,15],[4,7],[8,13],[4,6],[8,11],[4,5],[5,6],[10,11],
  [1,1],[11,10],[6,5],[5,4],[11,8],[6,4],[13,8],[7,4],[15,8],[2,1],[9,4],[5,2],[11,4],[3,1],[10,3],[7,2],[4,1],
  [9,2],[5,1],[11,2],[6,1],[13,2],[7,1],[15,2],[8,1],[17,2],[9,1],[10,1],[11,1],[12,1],[14,1],[16,1],[18,1],
  [20,1],[25,1],[33,1],[40,1],[50,1],[66,1],[80,1],[100,1],[150,1],[200,1],
];
// --- 샘플 출주마 ---
export const SAMPLE_DEFAULT_LEVEL = 60;
export const SAMPLE_DEFAULT_LEVEL_SPREAD = 8;
export const SAMPLE_ABILITY_SD = 6;
export const SAMPLE_ABILITY_MIN = 1;
export const SAMPLE_ABILITY_MAX = 100;
/** 거리별 스태미나 목표: SAMPLE_STAMINA_AT_MIN_DIST(1000m) ~ SAMPLE_STAMINA_AT_MAX_DIST(3200m) 선형 */
export const SAMPLE_STAMINA_MIN_DIST = 1000;
export const SAMPLE_STAMINA_MAX_DIST = 3200;
export const SAMPLE_STAMINA_AT_MIN_DIST = 20;
export const SAMPLE_STAMINA_AT_MAX_DIST = 90;
export const SAMPLE_STAMINA_LEVEL_WEIGHT = 0.5;
export const SAMPLE_STAMINA_SD = 10;
export const SAMPLE_DISTANCE_OPT_SD = 300;
export const SAMPLE_DISTANCE_OPT_MIN = 1000;
export const SAMPLE_DISTANCE_OPT_MAX = 3600;
export const SAMPLE_DISTANCE_RANGE_MIN = 300;
export const SAMPLE_DISTANCE_RANGE_MAX = 600;
export const SAMPLE_GOING_PREF_MIN = 1;
export const SAMPLE_GOING_PREF_MAX = 5;
export const SAMPLE_GOING_TOL_MIN = 1;
export const SAMPLE_GOING_TOL_MAX = 2.5;
export const SAMPLE_AW_APT_SD = 0.4;
export const SAMPLE_COURSE_APT_SD = 0.3;
export const SAMPLE_STYLE_WEIGHTS: Record<RunningStyle, number> = { front: 0.15, prominent: 0.3, midfield: 0.35, held_up: 0.2 };
export const SAMPLE_FITNESS_RANGE = [85, 100] as const;
export const SAMPLE_FATIGUE_RANGE = [0, 10] as const;
export const SAMPLE_MENTAL_RANGE = [60, 90] as const;
export const SAMPLE_FEMALE_RATE = 0.3;
export const SAMPLE_GELDING_RATE = 0.25;
export const SAMPLE_AGE_RANGE = [3, 5] as const;
export const SAMPLE_GROWTH = { type: 'normal', peakAge: 4, declineRate: 0.1 } as const;
export const SAMPLE_BASE_WEIGHT_LB = 126;
export const SAMPLE_APPRENTICE_RATE = 0.1;
export const SAMPLE_APPRENTICE_ALLOWANCES_LB = [3, 5, 7] as const;
export const SAMPLE_JOCKEY_SKILL_MEAN = 60;
export const SAMPLE_JOCKEY_SKILL_SD = 12;
export const SILKS_PALETTE: readonly HexColor[] = [
  '#c8102e','#003da5','#ffd100','#00843d','#ffffff','#000000','#f28c28','#6a1b9a',
  '#87ceeb','#ff69b4','#8b4513','#808080','#006064','#b5e61d','#800000','#000080',
];
export const SILKS_PATTERNS: readonly SilksPattern[] = ['plain','hoops','stripes','quartered','sash','chevrons','spots','star'];
```

### race/setup.ts
```ts
export interface EntryRequest {
  horseId: HorseId;
  jockeyId: JockeyId;
  tactic: RunningStyle;
  silks: Silks;
  isPlayer: boolean;
  /** 감량 전 부담중량(lb) */
  weightLb: number;
  /** 기수 견습 감량(lb) */
  jockeyAllowanceLb: number;
}
export function drawStalls(rng: Rng, fieldSize: number): number[];      // rng.shuffle([1..n]) 결과. n<1 이면 RangeError
export function buildEntries(rng: Rng, requests: readonly EntryRequest[]): RaceEntry[];
```
- buildEntries: 반환 배열은 **requests 와 같은 순서**(index i = runner index i).
  - saddleCloth: 감량 전 weightLb 내림차순(유럽 관행: 최고 중량 = 1번), 같으면 요청 index 오름차순으로 순위 → 순위+1.
  - draw: `drawStalls(rng, n)[i]` (이 함수 안에서 rng 사용은 이 shuffle 한 번뿐).
  - weightLb = 요청 weightLb - jockeyAllowanceLb. odds = null.
  - requests 가 비었거나 horseId 중복이면 Error.

### race/odds.ts
strength 는 "클수록 강함, 단위 ≈ 초" (M1-04 의 estimateStrength 가 -예상 주파 시간을 반환한다).
```ts
export function marketProbabilities(rng: Rng, strengths: readonly number[]): number[];
export function probabilityToOdds(p: number, overround?: number): FractionalOdds;  // 기본 MARKET_OVERROUND
export function priceField(rng: Rng, strengths: readonly number[]): FractionalOdds[];  // marketProbabilities → probabilityToOdds
export function formatOdds(o: FractionalOdds): string;       // {1,1} → 'Evs', 그 외 '5/2'
export function oddsToDecimal(o: FractionalOdds): number;    // 1 + num/den
export function impliedProbability(o: FractionalOdds): number; // den / (num + den)
```
- marketProbabilities: index 순서대로 `perceived[i] = strengths[i] + rng.normal(0, MARKET_NOISE_SD)`; `p[i] = exp((perceived[i] - max) / MARKET_TEMPERATURE)` 정규화(합 1). 빈 배열 → [].
- probabilityToOdds: `frac = 1 / (p * overround) - 1`. frac <= 0 이면 ODDS_LADDER[0]. 그 외 `|ln(frac) - ln(num/den)|` 이 최소인 사다리 칸(같으면 짧은 쪽). 반환은 새 객체 `{ num, den }`.

### race/sampleField.ts
```ts
export interface NamePool { horses: readonly string[]; jockeys: readonly string[]; owners: readonly string[]; }
export interface SampleFieldOptions {
  size: number;
  distance: number;
  surface: Surface;
  year: number;
  namePool: NamePool;
  level?: number;          // 기본 SAMPLE_DEFAULT_LEVEL
  levelSpread?: number;    // 기본 SAMPLE_DEFAULT_LEVEL_SPREAD
  playerIndex?: number | null;  // 기본 null. 지정 시 그 index 의 isPlayer = true
}
export interface SampleField {
  /** index = runner index */
  runners: Omit<RunnerInput, 'entry'>[];
  requests: EntryRequest[];
  /** index = runner index */
  ownerNames: string[];
}
export function generateSampleField(rng: Rng, opts: SampleFieldOptions): SampleField;
```
- size < 1 이거나 이름 풀(horses/jockeys/owners) 중 하나라도 size 보다 작으면 RangeError.
- 이름: `rng.shuffle(pool)` 앞에서 size 개 (horses → jockeys → owners 순서로 shuffle).
- 말 i (0..size-1), id `sample-h-${i+1}`, 기수 id `sample-j-${i+1}`:
  - `lv = rng.normal(level, levelSpread)`.
  - speed/acceleration/guts/power = clamp(lv + normal(0, SAMPLE_ABILITY_SD), MIN, MAX).
  - stamina = clamp(target + (lv - level) * SAMPLE_STAMINA_LEVEL_WEIGHT + normal(0, SAMPLE_STAMINA_SD)), target = 거리로 선형 보간(MIN_DIST~MAX_DIST 밖은 끝값).
  - potential = ability 복사본. growth = SAMPLE_GROWTH 복사본.
  - aptitude: distanceOptimum = clamp(distance + normal(0, SAMPLE_DISTANCE_OPT_SD), OPT_MIN, OPT_MAX); distanceRange = range(RANGE_MIN, RANGE_MAX); goingPreference = range(PREF_MIN, PREF_MAX); goingTolerance = range(TOL_MIN, TOL_MAX); allWeather = clamp(normal(0, AW_SD), -1, 1); leftHanded/rightHanded/undulation = clamp(normal(0, COURSE_SD), -1, 1).
  - preferredStyle: SAMPLE_STYLE_WEIGHTS 누적 확률로 `rng.next()` 1회 선택. 요청 tactic = preferredStyle.
  - condition: fitness/fatigue/mental = range(각 RANGE), injury null.
  - sex: chance(FEMALE_RATE) ? 'female' : 'male'; gelded = male && chance(GELDING_RATE). birthYear = year - int(AGE_RANGE).
  - jockey: `{ id, name, skill: clamp(normal(MEAN, SD), 1, 100) }`; jockeyAllowanceLb = chance(APPRENTICE_RATE) ? pick(ALLOWANCES) : 0.
  - silks: primary = shuffle 한 SILKS_PALETTE 의 `[i % len]`, secondary = 같은 shuffle 배열의 `[(i + 1 + int(0, len-2)) % len]` 이되 primary 와 같으면 다음 칸, pattern = pick(SILKS_PATTERNS). (팔레트 shuffle 은 말 루프 전에 1회)
  - weightLb = SAMPLE_BASE_WEIGHT_LB.
- 같은 rng 상태 + 같은 opts → 깊은 비교로 같은 결과.

## 수용 기준
1. drawStalls(rng, 20) 은 1..20 의 순열. buildEntries: 반환 순서 = 요청 순서, 마번 1..n 순열, 감량 전 중량이 가장 무거운 요청이 마번 1, weightLb 에 감량 반영, odds null, 중복 horseId → throw.
2. 같은 시드로 buildEntries 두 번 → 같은 draw. 다른 시드 10개 중 적어도 하나는 draw 가 다르다.
3. marketProbabilities 합 = 1 (±1e-9), strength 가 크게 높은 말(+3초)의 확률이 가장 높다(노이즈 포함 100회 중 95회 이상).
4. probabilityToOdds: p=0.5/overround 1 → 1/1 ('Evs'), p=0.2857/overround 1 → 5/2, p=0.001 → 200/1 근처(사다리 마지막 3칸 안), p=0.99 → 1/5. 모든 결과가 ODDS_LADDER 안의 값.
5. 10두 필드 priceField 의 impliedProbability 합이 1.0~1.4 범위.
6. generateSampleField(size 20): 모든 능력치 1~100, 이름 중복 없음, ids 고유, 3000m 필드의 평균 stamina 가 1200m 필드보다 25 이상 높다(같은 시드 쌍 20회 평균), 이름 풀이 부족하면 RangeError.
7. 엔진 파일에 Math.random/Date 없음, 매직 넘버는 config 사용.

## 금지 사항
- 공용 타입 수정 금지. 목록 외 파일 금지. 새 패키지 금지. data/ 파일 import 금지(이름 풀은 인자로 받는다; 테스트에서는 인라인 이름 배열 사용).
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/raceday.test.ts && npm run typecheck && npm run lint`
