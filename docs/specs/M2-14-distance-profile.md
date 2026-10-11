# M2-14 거리 프로필 4단계 전환

담당: haiku-coder · 선행: M2-01b 승인 · 근거: docs/stamina-and-nh.md 3·4-1장, 사용자 결정(2026-10-11) "유전 부분만 M2"

## 목적
거리 프로필을 `sprint/mile/middle/staying` 에서 기획 문서의 `speed/classic/middle/cup` 4단계로 바꾸고, 실명 종마의 거리 적성(distanceOptimum)이 데이터 프로필과 일치하게 만든다.

## 공용 타입 (Opus 가 먼저 수정해 둔다 — 에이전트는 수정 금지)
```ts
// src/engine/types/bloodline.ts
export type DistanceProfile = 'speed' | 'classic' | 'middle' | 'cup';
```

## 생성·수정할 파일
1. `src/engine/config/world.ts` — `PROFILE_DISTANCE = { speed: 1400, classic: 2000, middle: 2400, cup: 3000 } as const`
2. `src/engine/config/horse.ts` — 새 상수
   - `PROFILE_BOUNDS = { speedMax: 1800, classicMax: 2200, middleMax: 2700 } as const` (m, 이하 포함. 1800 이하 speed, 2200 이하 classic, 2700 이하 middle, 초과 cup)
   - `DIST_BIAS_SD = 150` (distanceBias 가 있을 때 distanceOptimum 편차)
3. `src/engine/horse/generate.ts`
   - `distanceBias` 가 주어지면 `distanceOptimum = clamp(distanceBias + rng.normal(0, DIST_BIAS_SD), DIST_OPT_MIN, DIST_OPT_MAX)`. 없으면 지금 식 그대로.
   - **rng 호출 횟수·순서는 바꾸지 않는다**(같은 위치의 normal 한 번을 공유: 평균·SD 만 분기).
   - 새 export: `export function profileOfDistance(distanceOptimum: number): DistanceProfile` (PROFILE_BOUNDS 사용)
4. `data/stallions/stallions.json` — 기계적 변환: sprint→speed, mile→speed, middle→middle, staying→cup. (실제 재분류는 M2-15 에서 한다)
5. `tests/engine/generate.test.ts`, `tests/data/stallions.test.ts` — 아래 수용 기준 테스트. 기존 enum 검사는 새 값으로 바꾼다.

## 수용 기준
1. `profileOfDistance(1800)='speed'`, `1801→'classic'`, `2200→'classic'`, `2201→'middle'`, `2700→'middle'`, `2701→'cup'`.
2. distanceBias 를 준 말 1,000두(같은 bias 2400)의 distanceOptimum 평균이 2,400 ± 20, 표준편차 150 ± 15.
3. 세계 초기화 후 현역 실명 종마 중 `profileOfDistance(horse.aptitude.distanceOptimum)` 가 데이터 프로필과 같은 비율 ≥ 80%.
4. distanceBias 를 주지 않은 생성은 결과가 비트 단위로 그대로다(기존 generate 테스트 통과).
5. stallions.json 에 옛 값(sprint/mile/staying)이 남아 있지 않다.
6. `npm test`, typecheck, lint 통과. 골든 픽스처(tests/engine/fixtures/sim-golden.json)가 바뀌면 **멈추고 질문**(다시 만들지 말 것).

## 금지
- src/engine/types 수정 금지. src/ui 수정 금지. 새 의존성 금지. git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
