# M2-05c 근친 약세 1대 한정

담당: haiku-coder · 선행: M2-05b · 사용자 결정(2026-10-11): "약세는 1대 한정"

## 목적
근친 과다 감점(혈량 > INBREED_EXCESS_FROM 일 때의 잠재·건강도 감점)은 그 말 자신에게만 적용하고, 자손에게는 감점 전 값으로 유전되게 한다. 닉스 보너스와 적정 인브리드 보너스(INBREED_LOW~HIGH 삼각형)는 지금처럼 유전된다.

## 원리
부모의 "유전 기준값" = 부모의 현재 잠재(또는 건강도) + 부모 자신이 태어날 때 받은 과다 감점.
부모 자신의 감점은 부모의 혈통표로 다시 계산한다(혈통은 불변이므로 결정적). Horse 타입은 바꾸지 않는다.

## 생성·수정할 파일
1. `src/engine/breeding/genetics.ts`
   - 새 export: `export function inbreedingPenalty(bloodPercent: number): { potential: number; soundness: number }`
     - bp ≤ INBREED_EXCESS_FROM 이면 `{0, 0}`, 아니면 `excess = bp - INBREED_EXCESS_FROM` 으로 `{ potential: excess × INBREED_EXCESS_POTENTIAL_PENALTY, soundness: excess × INBREED_EXCESS_SOUNDNESS_PENALTY }` (둘 다 ≥ 0).
     - `inbreedingEffect` 는 결과가 바뀌지 않게 이 함수를 써서 다시 쓴다(보너스 − penalty.potential, soundness = penalty.soundness).
   - `BreedArgs` 에 선택 필드 2개 추가:
     ```ts
     /** 부 자신의 근친 혈량(%) — 부의 과다 감점을 되돌려 유전 기준값을 만든다. 생략 시 0 */
     sireOwnBloodPercent?: number;
     /** 모 자신의 근친 혈량(%). 생략 시 0 */
     damOwnBloodPercent?: number;
     ```
   - 잠재 유전: 각 능력 키에서 부 값 = `min(ABILITY_MAX, sire.potential[key] + inbreedingPenalty(sireOwn).potential)`, 모도 같은 방식. 그 뒤 기존 blendedPotential → adj → 노이즈 → clamp 그대로.
   - 건강도 유전: 부·모 soundness 에 각자의 `inbreedingPenalty(own).soundness` 를 더하고(ABILITY_MAX 로 상한) 평균 → soundnessRegressed → 노이즈 → 자신의 감점 → clamp. 기존 순서 그대로.
   - **rng 호출 순서·횟수는 바꾸지 않는다.** 두 필드가 0(또는 생략)이면 결과가 지금과 비트 단위로 같아야 한다.
2. `src/engine/breeding/inbreeding.ts`
   - 새 export:
     ```ts
     /** 말 자신의 근친 혈량(%). 부·모 중 하나라도 null 이면 0. dominantCrosses 기준 totalBloodPercent */
     export function ownBloodPercent(lookup: PedigreeLookup, horse: Horse): number
     ```
     구현: `buildMatingPedigree(lookup, horse.sireId, horse.damId)` → `dominantCrosses(root, findInbreeding(root))` → `totalBloodPercent`. (pedigree.ts 에서 PedigreeLookup·buildMatingPedigree import. 순환 import 없음 확인)
3. `src/engine/breeding/season.ts` — 출산 시 breed 호출에 `sireOwnBloodPercent: ownBloodPercent(lookup, sire)`, `damOwnBloodPercent: ownBloodPercent(lookup, dam)` 전달.
4. `tests/engine/genetics.test.ts` — 아래 수용 기준 2~4 테스트 추가.
5. `tests/engine/pedigree.test.ts` — 수용 기준 5 테스트 추가.

## 수용 기준
1. 기존 테스트 전부 통과(골든·재현성 포함). own 필드 생략 시 결과 불변.
2. 같은 시드에서, 잠재 전 항목 40·건강도 60·own 혈량 50%(감점 잠재 10, 건강도 25)인 부모 쌍과, 잠재 50·건강도 85·own 혈량 0 인 부모 쌍(그 외 필드 동일, 망아지 inbreeding 빈 배열)의 망아지 잠재·건강도가 **완전히 같다**.
3. `inbreedingPenalty(25)` = {0,0}, `inbreedingPenalty(35)` = {4, 10}. `inbreedingEffect` 의 기존 테스트 값 불변.
4. 유전 기준값 상한: own 혈량이 커도 부모 값 + 감점은 ABILITY_MAX 를 넘지 않는다(잠재 95, own 100% 부모로 망아지 잠재 ≤ ABILITY_MAX 확인).
5. `ownBloodPercent`: 부모 미상 말은 0. 전형제(같은 부·모) 사이의 자식은 25 이상.
6. typecheck·lint 통과. src/engine 에 Math.random/Date.now 없음.

## 금지
- src/engine/types 수정 금지(Horse 필드 추가 금지).
- src/ui/ 수정 금지(다른 티켓이 작업 중). tests/verify/ 수정 금지(다음 티켓).
- 새 의존성 금지. git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
