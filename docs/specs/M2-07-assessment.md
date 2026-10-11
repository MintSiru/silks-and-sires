# M2-07 단서 생성: 마체 평가 · 조교사 코멘트 · 거리/성장 힌트

담당: haiku-coder · 선행: 없음 (타입만)

## 목적
사용자 결정: 능력치는 비공개. 숨김 값에서 **오차가 섞인** 단서(등급·코멘트·힌트)를 만든다. 어릴수록, 평가자 능력이 낮을수록 부정확하다.

## 생성할 파일
1. `src/engine/config/assessment.ts`
2. `src/engine/horse/assessment.ts`
3. `tests/engine/assessment.test.ts`

## 사용할 타입 (수정 금지)
`Horse, Assessment, AssessmentStage, ConformationReport, AssessmentComment, CommentKey, Grade, GRADE_ORDER, GameDate, Rng`

## config/assessment.ts (값 그대로)
```ts
import type { AssessmentStage } from '../types';
/** 단계별 인식 오차 표준편차(능력치 단위) */
export const PERCEPTION_SD: Record<AssessmentStage, number> = { foal: 14, yearling: 10, two_year_old: 7, in_training: 4 };
/** 평가자 능력(0~100)에 따른 오차 감소: sd × (1 - RELIEF × skill/100) */
export const SKILL_NOISE_RELIEF = 0.5;
/** 등급 하한: 이상이면 그 등급 */
export const GRADE_THRESHOLDS = { S: 85, A: 75, B: 65, C: 55, D: 45 } as const;   // 그 미만 E
/** 거리 힌트 반폭(m) */
export const DISTANCE_HINT_HALF_WIDTH: Record<AssessmentStage, number> = { foal: 800, yearling: 600, two_year_old: 400, in_training: 250 };
export const DISTANCE_HINT_SD: Record<AssessmentStage, number> = { foal: 400, yearling: 300, two_year_old: 200, in_training: 120 };
export const DISTANCE_HINT_MIN = 1000;
export const DISTANCE_HINT_MAX = 3600;
export const DISTANCE_HINT_ROUND = 100;
/** 성장형을 맞힐 확률(그 외 'unknown') — foal 은 항상 unknown */
export const GROWTH_HINT_PROB: Record<AssessmentStage, number> = { foal: 0, yearling: 0.4, two_year_old: 0.7, in_training: 0.9 };
/** 조교 중 단계에서 현재 능력과 잠재의 혼합 비율(현재 능력 비중) */
export const IN_TRAINING_ABILITY_WEIGHT = 0.6;
/** 코멘트 최대 개수(종합 1 + 특징) */
export const MAX_COMMENTS = 3;
/** 특징 코멘트로 뽑을 최소 편차 |perceived - TRAIT_CENTER| */
export const TRAIT_CENTER = 60;
export const TRAIT_MIN_DEVIATION = 8;
/** 마장 선호 코멘트 기준(goingPreference): 이하면 fast, 이상이면 soft */
export const GOING_FAST_MAX = 1.5;
export const GOING_SOFT_MIN = 4;
```

## horse/assessment.ts
```ts
export function gradeOf(value: number): Grade;
export function assessHorse(horse: Horse, stage: AssessmentStage, assessorSkill: number, date: GameDate, rng: Rng): Assessment;
```
1. **진짜 값 t(trait)**: foal/yearling/two_year_old → `potential`, in_training → `ability × W + potential × (1-W)` (W = IN_TRAINING_ABILITY_WEIGHT). 대상: speed, stamina, acceleration, guts, power, 그리고 soundness, mental(= condition.mental).
2. **인식값 p** = t + normal(0, sd), sd = PERCEPTION_SD[stage] × (1 - SKILL_NOISE_RELIEF × skill/100). 위 7개 순서대로 rng 사용.
3. **마체 평가**: frame = grade((p.power + p.stamina)/2), hindquarters = grade((p.speed + p.acceleration)/2), legs = grade(p.soundness), action = grade((p.speed + p.stamina)/2), temperament = grade((p.guts + p.mental)/2), overall = grade(평균(p.speed, p.stamina, p.acceleration, p.guts, p.power)).
4. **코멘트**: 첫 번째는 종합: overall S/A → overall_star(positive), B → overall_useful(positive), C → overall_moderate(neutral), D/E → overall_limited(negative).
   특징 후보(각 trait 의 인식 편차 d = p - TRAIT_CENTER, |d| ≥ TRAIT_MIN_DEVIATION 만):
   speed: d ≥ 25 → speed_exceptional(+), d ≥ 8 → speed_good(+), d ≤ -8 → speed_lacking(−) (ordinary 는 쓰지 않음)
   stamina: d ≥ 8 → stamina_stays_well(+), d ≤ -8 → stamina_sprinter(neutral)
   acceleration: d ≥ 8 → kick_sharp(+), d ≤ -8 → kick_one_paced(−)
   guts: d ≥ 8 → guts_battler(+), d ≤ -8 → guts_soft(−)
   power: d ≥ 8 → power_strong(+), d ≤ -8 → power_light(neutral)
   soundness: d ≥ 8 → legs_sound(+), d ≤ -8 → legs_fragile(−)
   mental: d ≥ 8 → temper_calm(+), d ≤ -8 → temper_keen(neutral)
   |d| 큰 순으로(같으면 위 나열 순서) 최대 MAX_COMMENTS-1 개.
   (마장 코멘트는 아래 6 에서 남는 자리가 있으면 추가)
5. **거리 힌트**: 중심 = aptitude.distanceOptimum + normal(0, DISTANCE_HINT_SD[stage]); min/max = 중심 ∓ HALF_WIDTH, [MIN, MAX] clamp, DISTANCE_HINT_ROUND 단위 반올림.
6. **마장 코멘트**(stage 가 two_year_old·in_training 이고 코멘트 수 < MAX 일 때): goingPreference ≤ GOING_FAST_MAX → going_likes_fast(neutral), ≥ GOING_SOFT_MIN → going_likes_soft(neutral).
7. **성장형 힌트**: rng.chance(GROWTH_HINT_PROB[stage]) 이면 진짜 growth.type, 아니면 'unknown' (foal 은 rng 사용 없이 unknown). 성장형 코멘트(growth_early / growth_needs_time)는 힌트가 precocious/late 이고 자리가 남으면 추가.
8. Assessment 의 year/week 는 date 에서.

## 수용 기준
1. gradeOf 경계: 85→S, 84.9→A, 45→D, 44.9→E.
2. 같은 입력·시드 → 같은 Assessment. 다른 시드에서는 등급이 흔들릴 수 있다.
3. 정확도: potential 이 모두 80 인 말 vs 모두 40 인 말을 각 500회 평가 → foal 단계에서도 overall 평균 등급 순위가 맞고, in_training·skill 100 에서 80 짜리 말의 overall 이 S/A 인 비율 ≥ 90%. foal·skill 0 에서는 그 비율이 in_training 보다 낮다.
4. 인식 오차: 같은 말 2,000회 평가 시 in_training 의 overall 등급 분산 < foal 의 분산.
5. 코멘트 수 1~3, 첫 번째는 항상 overall_* 키, 모든 키가 COMMENT_KEYS 안.
6. 거리 힌트가 [1000, 3600] 안, 100 단위, min ≤ max, foal 폭 ≥ in_training 폭.
7. 숫자 능력치가 Assessment 어디에도 없다(타입상 보장 — 추가 필드 금지). typecheck·lint 통과.

## 금지
- 공용 타입 수정 금지. 목록 외 파일 금지. 다른 티켓 진행 중 — 남의 파일 오류는 보고만.

## 테스트 명령
`npx vitest run tests/engine/assessment.test.ts && npm run typecheck && npm run lint`
