# M2-05b 인브리드 중복 합산 수정 + 건강도 평균 회귀

담당: haiku-coder · 선행: M2-11 발견 사항

## 배경 (M2-11 검증)
닫힌 집단 200두 무작위 교배 20세대에서 잠재 평균 55→35, 건강도 71→7 로 붕괴. 원인 2가지(Opus 진단):
1. **혈량 중복 합산**: 조상 A 가 3×3 이면 A 의 부·모도 4×4 로 교차 목록에 들어가 혈량이 2~3배로 부풀려진다 → 25% 초과 감점이 과도하게 걸린다.
2. **건강도에 평균 회귀 없음**: 감점이 세대마다 누적된다.

## 수정·생성할 파일
1. `src/engine/breeding/inbreeding.ts` — 함수 추가
2. `src/engine/breeding/season.ts` — 출산 시 breed 에 넘기는 inbreeding 을 지배 교차로 (1줄 수준)
3. `src/engine/breeding/genetics.ts` — 건강도 회귀
4. `src/engine/config/genetics.ts` — 상수 1개 추가
5. `tests/engine/pedigree.test.ts` — dominantCrosses 테스트 추가
6. `tests/engine/genetics.test.ts` — 건강도 회귀 테스트 추가
(파일 6개지만 각 변경이 작고 서로 묶여 있어 한 티켓으로 둔다)

## 구현
### inbreeding.ts
```ts
/**
 * 지배 교차만 남긴다: 교차 조상 X 가, 혈통표 안에서 다른 교차 조상 Y 의 조상으로 **모든 등장 위치에서** 설명되면 제외.
 * (X 의 각 등장 노드가 어떤 Y 노드의 하위 트리 안에 있으면 그 등장은 Y 로 설명된다. 모든 등장이 설명되면 X 제외)
 * 결과는 입력과 같은 정렬 규칙(bloodPercent 내림차순, 같으면 ancestorId 오름차순).
 */
export function dominantCrosses(root: PedigreeNode, crosses: readonly InbreedingCross[]): InbreedingCross[];
```
### season.ts
출산 시 `inbreeding = dominantCrosses(root, findInbreeding(root))` 를 BreedArgs.inbreeding 으로 넘긴다(root = buildMatingPedigree 결과).
(미리보기 preview.ts 는 표시용이므로 전체 교차 그대로 — 수정하지 않는다)
### genetics.ts / config/genetics.ts
`export const SOUNDNESS_REGRESSION = 0.15;` 추가. 건강도: `mid = 평균(부, 모)`, `mid += (SOUNDNESS_MEAN - mid) × SOUNDNESS_REGRESSION` (SOUNDNESS_MEAN 은 config/horse.ts), 이후 기존대로 `clamp(mid + normal(0, SOUNDNESS_INHERIT_SD) - 감점)`. rng 사용 순서 불변.

## 수용 기준
1. dominantCrosses: A 가 3×3 이고 A 의 부·모가 4×4 로 같이 잡히는 족보에서 결과는 A 하나뿐. A 의 부가 A 와 무관한 경로(예: 다른 자식을 통해)로도 등장하면 그 부는 남는다.
2. 서로 무관한 두 공통 조상은 둘 다 남는다. 교차가 없으면 빈 배열.
3. 건강도: 부모 건강도가 모두 10 인 1,000회 평균 > 10 + (70-10)×0.15 - 1, 모두 95 면 평균 < 95.
4. 기존 테스트(pedigree, genetics, breedingSeason, world 등) 전부 통과. typecheck·lint 통과.

## 금지
목록 외 파일 수정 금지. 공용 타입 수정 금지.

## 테스트 명령
`npx vitest run tests/engine/pedigree.test.ts tests/engine/genetics.test.ts tests/engine/breedingSeason.test.ts && npm test && npm run typecheck && npm run lint`
