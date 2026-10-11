# M2-06 주간 성장 시스템 (WeeklySystem)

담당: haiku-coder · 선행: M2-02(growthCurve)

## 목적
매주 살아 있는 말의 현재 능력(ability)을 나이·성장형에 맞춰 잠재(potential)로 수렴시키고, 망아지 → 이유마 → 1세마 단계 전환을 처리한다.

## 생성·수정할 파일
1. `src/engine/config/growth.ts` (신규)
2. `src/engine/horse/growth.ts` (신규)
3. `src/engine/time/advance.ts` (수정: DEFAULT_SYSTEMS 에 growthSystem 추가 — calendarSystem 다음)
4. `tests/engine/growth.test.ts` (신규)

## Opus 가 바꾼 공용 타입 (수정 금지)
`GameEvent` 에 `{ type: 'horse_status_changed'; horseId: HorseId; from: HorseStatus; to: HorseStatus; date: GameDate }` 추가.

## config/growth.ts (값 그대로)
```ts
import type { HorseStatus } from '../types';
/** 이 주(週)부터 출생 연도의 망아지는 이유마가 된다 (9월 초) */
export const WEANING_WEEK = 36;
/** 성장 계산 대상 상태 */
export const GROWING_STATUSES: readonly HorseStatus[] = ['foal', 'weanling', 'yearling', 'in_training', 'resting', 'retired', 'stud', 'broodmare'];
```
## horse/growth.ts
```ts
export function ageInYearsAt(birthYear: number, date: GameDate): number;   // (year - birthYear) + (week - 1) / WEEKS_PER_YEAR
export const growthSystem: WeeklySystem;   // id 'growth'
```
- run(draft, ctx): horseId 오름차순으로 순회(결정론). GROWING_STATUSES 인 말만:
  1. `ability = abilityAtAge(potential, ageInYearsAt(birthYear, ctx.date), growth)`.
  2. 상태 전환: status 'foal' 이고 (ctx.date.year > birthYear 또는 week ≥ WEANING_WEEK) → 'weanling'. status 'weanling' 이고 ctx.date.year ≥ birthYear + 1 → 'yearling'. 전환마다 horse_status_changed 이벤트. (한 주에 foal → yearling 두 단계가 필요하면 두 이벤트 모두)
  3. 'yearling' → 'in_training' 은 M3(조교사 입사)에서 처리 — 여기서는 하지 않는다.
- rng 사용 금지.

## 수용 기준
1. 2026년 출생 foal 을 2026년 1주부터 진행: 36주에 weanling, 2027년 1주에 yearling 이벤트, 이후 상태 변화 없음.
2. normal 성장형 말의 ability.speed 가 2세→4세 동안 단조 증가하고 4~5세에 potential 과 같다(부동소수 오차 1e-9).
3. historical·dead 상태 말은 변경되지 않는다.
4. advanceWeek 재현성: 같은 상태로 52주 두 번 → 같은 JSON. 기존 time.test 전부 통과.
5. typecheck·lint 통과.

## 금지
- 공용 타입 수정 금지. advance.ts 는 DEFAULT_SYSTEMS 한 줄(+import)만 수정.

## 테스트 명령
`npx vitest run tests/engine/growth.test.ts tests/engine/time.test.ts && npm run typecheck && npm run lint`
