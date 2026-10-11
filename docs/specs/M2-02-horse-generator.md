# M2-02 말 생성기 + 성장 곡선

담당: haiku-coder · 선행: 없음

## 목적
게임 세계의 가상 말(번식 암말, 라이벌 경주마, 망아지 기본값)을 만드는 생성기와, 나이·성장형에 따른 성숙도 곡선을 만든다.

## 생성할 파일
1. `src/engine/config/horse.ts`
2. `src/engine/horse/growthCurve.ts`
3. `src/engine/horse/generate.ts`
4. `tests/engine/horseGenerate.test.ts`

## 사용할 타입 (수정 금지, `src/engine/types`)
`Horse, Abilities, Aptitudes, GrowthProfile, Condition, CareerRecord, RunningStyle, Sex, HorseStatus, CountryCode, Surface, HorseId, OwnerId, Rng`
(Horse 에 `familyId: HorseId | null`, `soundness: number` 필드가 새로 있다)

## config/horse.ts (값 그대로)
```ts
import type { GrowthProfile, RunningStyle } from '../types';
export const ABILITY_MIN = 1;
export const ABILITY_MAX = 100;
export const DEFAULT_POTENTIAL_SPREAD = 10;
export const GROWTH_TYPE_WEIGHTS: Record<GrowthProfile['type'], number> = { precocious: 0.3, normal: 0.5, late: 0.2 };
export const GROWTH_PEAK_AGE: Record<GrowthProfile['type'], number> = { precocious: 3, normal: 4, late: 5 };
export const GROWTH_DECLINE_RATE: Record<GrowthProfile['type'], number> = { precocious: 0.12, normal: 0.08, late: 0.06 };
/** 성장 곡선 지수(작을수록 일찍 자란다) */
export const GROWTH_CURVE_EXP: Record<GrowthProfile['type'], number> = { precocious: 0.6, normal: 1.0, late: 1.5 };
/** 출생 시 성숙도 */
export const MATURITY_AT_BIRTH = 0.35;
/** 정점 유지 기간(년) */
export const MATURITY_PLATEAU_YEARS = 1;
/** 노화 하한 */
export const MATURITY_FLOOR = 0.5;
/** 거리 적성: opt = BASE + PER_STAMINA × stamina + N(0, SD), [MIN, MAX] */
export const DIST_OPT_BASE = 1000;
export const DIST_OPT_PER_STAMINA = 22;
export const DIST_OPT_SD = 200;
export const DIST_OPT_MIN = 1000;
export const DIST_OPT_MAX = 3600;
export const DIST_RANGE_MIN = 300;
export const DIST_RANGE_MAX = 600;
/** distanceBias(m) 가 주어지면 stamina 잠재에 (bias - BIAS_REF) / BIAS_DIVISOR 를 더한다 */
export const STAMINA_BIAS_REF = 2000;
export const STAMINA_BIAS_DIVISOR = 30;
export const GOING_PREF_MEAN = 2;
export const GOING_PREF_SD = 1;
export const GOING_TOL_MIN = 1.5;
export const GOING_TOL_MAX = 3;
export const SURFACE_APT_SD = 0.4;
/** surfaceBias 가 'aw'/'dirt' 면 해당 적성에 더하는 값 */
export const SURFACE_BIAS_BONUS = 0.5;
export const COURSE_APT_SD = 0.3;
export const STYLE_WEIGHTS: Record<RunningStyle, number> = { front: 0.15, prominent: 0.3, midfield: 0.35, held_up: 0.2 };
export const SOUNDNESS_MEAN = 70;
export const SOUNDNESS_SD = 12;
export const MENTAL_MEAN = 70;
export const MENTAL_SD = 10;
export const DEFAULT_FITNESS = 70;
export const NAME_MAX_LENGTH = 18;
export const NAME_MAX_ATTEMPTS = 50;
```

## horse/growthCurve.ts
```ts
/** ageYears(실수, 0 = 출생) 에서의 성숙도 0~1 */
export function maturity(ageYears: number, growth: GrowthProfile): number;
export function sampleGrowthProfile(rng: Rng): GrowthProfile;   // GROWTH_TYPE_WEIGHTS 로 type 선택(rng.next() 1회), peakAge·declineRate 는 표 값
export function abilityAtAge(potential: Abilities, ageYears: number, growth: GrowthProfile): Abilities;  // 각 능력 = potential × maturity, [ABILITY_MIN, ABILITY_MAX]
```
- `peak = growth.peakAge`. age ≤ 0 → MATURITY_AT_BIRTH. 0 < age ≤ peak → `MATURITY_AT_BIRTH + (1 - MATURITY_AT_BIRTH) × (age / peak) ^ GROWTH_CURVE_EXP[type]`. peak < age ≤ peak + PLATEAU → 1. 그 이후 → `max(MATURITY_FLOOR, 1 - growth.declineRate × (age - peak - PLATEAU))`.

## horse/generate.ts
```ts
export interface GenerateHorseOptions {
  id: HorseId; name: string; sex: Sex; birthYear: number; currentYear: number;
  countryOfBirth: CountryCode; status: HorseStatus;
  level: number;              // 잠재 능력 평균(0~100)
  spread?: number;            // 기본 DEFAULT_POTENTIAL_SPREAD
  sireId?: HorseId | null; damId?: HorseId | null; familyId?: HorseId | null;
  ownerId?: OwnerId | null; breederId?: OwnerId | null;
  distanceBias?: number;      // m. 주면 스태미나·거리 적성이 그쪽으로 기운다
  surfaceBias?: Surface;      // 'aw'/'dirt' 면 해당 적성 +SURFACE_BIAS_BONUS
}
export function generateHorse(rng: Rng, opts: GenerateHorseOptions): Horse;
export interface HorseWords { adjectives: readonly string[]; nouns: readonly string[]; }
/** "Adjective Noun" 형태, NAME_MAX_LENGTH 이하, used 에 없는 이름. NAME_MAX_ATTEMPTS 번 실패하면 끝에 " II", " III" … 를 붙여 해결. 반환 전 used 에 추가 */
export function generateHorseName(rng: Rng, words: HorseWords, used: Set<string>): string;
```
generateHorse 규칙 (rng 사용 순서는 아래 나열 순서):
1. 잠재(potential): speed, stamina, acceleration, guts, power 순서로 `clamp(normal(level, spread))`. stamina 는 distanceBias 가 있으면 `+ (distanceBias - STAMINA_BIAS_REF) / STAMINA_BIAS_DIVISOR`.
2. growth = sampleGrowthProfile(rng).
3. ability = abilityAtAge(potential, currentYear - birthYear, growth).
4. aptitude: distanceOptimum = clamp(DIST_OPT_BASE + DIST_OPT_PER_STAMINA × potential.stamina + normal(0, DIST_OPT_SD)); distanceRange = range(MIN, MAX); goingPreference = clamp(normal(MEAN, SD), 0, 6); goingTolerance = range(TOL_MIN, TOL_MAX); allWeather = clamp(normal(0, SURFACE_APT_SD) + (surfaceBias==='aw' ? BONUS : 0), -1, 1); dirt 동일(surfaceBias==='dirt'); leftHanded, rightHanded, undulation = clamp(normal(0, COURSE_APT_SD), -1, 1).
5. preferredStyle: STYLE_WEIGHTS 누적, next() 1회.
6. soundness = clamp(normal(SOUNDNESS_MEAN, SOUNDNESS_SD), 1, 100).
7. condition = { fitness: DEFAULT_FITNESS, fatigue: 0, mental: clamp(normal(MENTAL_MEAN, MENTAL_SD), 1, 100), injury: null }.
8. 나머지: gelded false, officialRating null, record 0 들, sireId/damId/familyId/ownerId/breederId 는 옵션 또는 null, trainerId null.
- name 이 NAME_MAX_LENGTH 초과면 RangeError.

## 수용 기준
1. maturity: precocious 는 age 2 에서 normal 보다 크고 late 보다 크다. 모든 type 이 peak 에서 1, peak+1 에서 1, peak+3 에서 1 - 2×declineRate, 매우 늙으면 MATURITY_FLOOR. age 0 → 0.35.
2. 같은 시드·옵션 → generateHorse 결과 깊은 비교 동일. 1,000마리 생성 시 모든 능력 1~100, 잠재 평균이 level ±1.5 (spread 10, level 60).
3. distanceBias 3200 으로 만든 1,000마리의 평균 distanceOptimum 이 distanceBias 1200 의 평균보다 600 이상 크다.
4. 3세(birthYear = currentYear - 3) normal 말의 ability 평균이 potential 평균의 80~95%.
5. generateHorseName: 10,000개 생성해도 중복 없음(작은 단어장 5×5 로도 " II" 접미사로 해결), 전부 18자 이하.
6. lint·typecheck 통과, 매직 넘버는 config.

## 금지
- 공용 타입 수정 금지. 목록 외 파일 금지. data/ import 금지(단어장은 인자로).
- 다른 티켓이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/horseGenerate.test.ts && npm run typecheck && npm run lint`
