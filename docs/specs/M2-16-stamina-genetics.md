# M2-16 거리 적성 유전 가중과 보완형 배합

담당: haiku-coder · 선행: M2-14 승인 · 근거: docs/stamina-and-nh.md 3·4-3·6장, 사용자 결정(2026-10-11) "보완형 보너스 1대 한정"

## 목적
(1) 망아지 거리 적성을 부 0.45 · 외조부(모의 부) 0.30 · 모 0.25 가중으로 유전한다. (2) 부마 스피드형 + 모계 스태미나형 배합(보완형)이면 망아지 잠재에 +8% 보너스를 주되, 그 보너스는 자손에게 유전되지 않는다. (3) 배합 미리보기에 역할 힌트를 넣는다.

## 정의 (모두 src/engine/config/genetics.ts 상수)
- `DIST_WEIGHT = { sire: 0.45, damsire: 0.30, dam: 0.25 }`. 외조부 말을 찾을 수 없으면 sire 0.45/(0.45+0.25), dam 0.25/(0.45+0.25) 로 재정규화.
- `PROFILE_STAMINA = { speed: 0.0, classic: 0.3, middle: 0.7, cup: 1.0 }` (말의 프로필 = `profileOfDistance(horse.aptitude.distanceOptimum)`, M2-14)
- 모계 스태미나 = `DAM_SIDE_DAMSIRE_W(0.5) × PROFILE_STAMINA[외조부] + (1 − 0.5) × PROFILE_STAMINA[모]`. 외조부 없으면 모 값만.
- **보완형** = 부 프로필이 speed 또는 classic 이고 모계 스태미나 ≥ `COMPLEMENT_DAM_STAMINA_MIN(0.6)`.
- 보완형 보너스: 능력 5종 각각 `mid × COMPLEMENT_BONUS(0.08)` 를 adj 에 더한다(mid = 기존 blendedPotential 결과).

## 생성·수정할 파일
1. `src/engine/config/genetics.ts` — 위 상수.
2. `src/engine/breeding/genetics.ts`
   - `BreedArgs` 에 선택 필드: `damsire?: Horse | null` (거리 가중·모계 스태미나용, 생략 시 null), `sireOwnComplement?: boolean`, `damOwnComplement?: boolean` (생략 시 false).
   - 새 export: `export function isComplementary(sire: Horse, dam: Horse, damsire: Horse | null): boolean`
   - 거리: `distanceOptimum = clamp(가중평균 + rng.normal(0, DIST_INHERIT_SD), …)` — rng 호출 수 불변.
   - 보완형 보너스: 망아지가 보완형이면 각 능력에 `mid × 0.08` 추가.
   - 1대 한정: 부모 유전 기준값을 만들 때 부모 자신이 보완형이었으면 `restoredPotential` 에서 과다 감점을 되돌린 **뒤** `÷ (1 + COMPLEMENT_BONUS)` 를 한다(근친 감점 복원과 같은 위치).
   - damsire·own 필드를 모두 생략하면 결과는 **거리 적성을 빼고** 지금과 같다(거리는 damsire 없음 → 재정규화 가중이므로 단순 평균과 다름. 이는 의도된 변경).
3. `src/engine/breeding/season.ts` — breed 호출에 `damsire: dam.sireId 로 찾은 말 ?? null`, `sireOwnComplement`, `damOwnComplement` 전달. own 판정 헬퍼: `ownComplement(lookup, horse) = sire·dam 이 있으면 isComplementary(sire, dam, dam의 sire)`, 없으면 false. (inbreeding.ts 의 ownBloodPercent 와 같은 패턴, genetics.ts 에 둔다)
4. `src/engine/breeding/preview.ts` — MatingPreview 새 필드 채우기(타입은 Opus 가 추가):
   ```ts
   /** 역할 힌트: 부마 = 부의 프로필 기준, 모계 = 외조부 프로필 기준(공개 정보만) */
   roles: { sire: 'speed' | 'stamina' | 'balanced'; damSide: 'speed' | 'stamina' | 'balanced' | 'unknown' };
   /** 보완형 가능성(공개 정보 기준): 부 speed/classic + 외조부 middle/cup 이면 'likely' */
   complement: 'likely' | 'unlikely' | 'unknown';
   ```
   - 역할: 프로필 speed → 'speed', classic → 'balanced', middle·cup → 'stamina'. 외조부를 모르면 damSide 'unknown', complement 'unknown'.
   - 미리보기는 모마 자신의 숨김 적성을 쓰지 않는다(공개 정보만).
5. `tests/engine/genetics.test.ts` — 수용 기준 1~5.

## 수용 기준
1. 거리 가중: 부 1400·외조부 3000·모 2000 (보완형 아님 조건 무관)에서 1,000두 평균 distanceOptimum 이 0.45·1400 + 0.30·3000 + 0.25·2000 = 2,030 ± 25.
2. `isComplementary`: 부 speed + 외조부 cup + 모 middle → true. 부 middle → false. 부 classic + 외조부 speed + 모 speed → false.
3. 같은 시드·같은 부모(잠재 60)에서 보완형 망아지의 잠재 평균이 비보완형보다 60 × 0.08 × (회귀 반영 mid) 만큼 크다: 1,000쌍 평균 차이 4.0 ~ 5.5.
4. 1대 한정: 잠재 전 항목 64.8 · 보완형 출신(own true) 부모 쌍과 잠재 60 · own false 부모 쌍(그 외 동일, 망아지 비보완형)의 망아지 잠재·건강도가 소수 9자리까지 같다(toBeCloseTo(…, 9); 64.8 / 1.08 = 60, 부동소수 오차 허용).
5. own 필드 생략 시 기존 근친 1대 한정 테스트(M2-05c) 그대로 통과.
6. typecheck·lint 통과, src/engine 에 Math.random/Date.now 없음.

## 금지
src/engine/types 수정 금지(Opus 가 MatingPreview 필드를 먼저 넣어 둔다). src/ui 수정 금지. git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
