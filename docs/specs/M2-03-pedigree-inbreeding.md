# M2-03 혈통표 + 인브리드 탐지

담당: haiku-coder · 선행: 없음

## 목적
말 기록(부·모 ID)으로 5대 혈통표를 만들고, 부측·모측에 모두 나오는 조상(인브리드)을 "4×3" 표기와 혈량(%)으로 찾는다. 가상 교배(아직 태어나지 않은 망아지)도 지원한다.

## 생성할 파일
1. `src/engine/breeding/pedigree.ts`
2. `src/engine/breeding/inbreeding.ts`
3. `tests/engine/pedigree.test.ts`

## 사용할 타입 (수정 금지)
`PedigreeNode, InbreedingCross, HorseId, Horse` (`src/engine/types`)

## 구현 사양
### breeding/pedigree.ts
```ts
export type PedigreeSource = Pick<Horse, 'id' | 'sireId' | 'damId'>;
export type PedigreeLookup = (id: HorseId) => PedigreeSource | undefined;
export const DEFAULT_PEDIGREE_DEPTH = 5;
/** 실존 말의 혈통표. root.generation = 0. depth 대까지(depth 대 노드의 sire/dam 은 null) */
export function buildPedigree(lookup: PedigreeLookup, id: HorseId, depth?: number): PedigreeNode;
/** 가상 교배 혈통표: root.horseId = null, root.sire = 부의 혈통(대 1부터), root.dam = 모의 혈통 */
export function buildMatingPedigree(lookup: PedigreeLookup, sireId: HorseId, damId: HorseId, depth?: number): PedigreeNode;
/** 대별 노드 목록(0..depth). 미상 노드는 horseId null 로 포함하지 않는다(실존 노드만) */
export function ancestorsByGeneration(root: PedigreeNode): Map<number, HorseId[]>;
```
- lookup 이 undefined 를 주거나 sireId/damId 가 null 이면 그 노드의 해당 부모는 null.
- 순환 데이터(잘못된 입력)에 대비해 depth 를 넘지 않으므로 무한 루프는 없다.

### breeding/inbreeding.ts
```ts
export function findInbreeding(root: PedigreeNode, maxGeneration?: number): InbreedingCross[];  // 기본 DEFAULT_PEDIGREE_DEPTH
export function inbreedingLabel(sireSide: readonly number[], damSide: readonly number[]): string;
export function totalBloodPercent(crosses: readonly InbreedingCross[]): number;   // 단순 합
```
- root.sire 쪽 부분 트리(대 1~max)에 나온 각 조상의 등장 대 목록, root.dam 쪽도 같은 방식. **양쪽 모두 등장한 조상**만 교차로 보고한다.
- root.sire / root.dam 자체도 조상 후보다(예: 부가 모의 부이기도 하면 1×2).
- label: 부측 대들을 오름차순으로 "×" 연결, 이어서 모측 대들 오름차순 "×" 연결. 예: 부측 [4], 모측 [3] → "4×3"; 부측 [4,5], 모측 [3] → "4×5×3".
- bloodPercent = Σ(모든 등장 대 g) 0.5^g × 100.
- 정렬: bloodPercent 내림차순, 같으면 ancestorId 오름차순.

## 수용 기준 (테스트에서 작은 가상 족보 Map 으로 검증)
1. 5대 혈통표의 노드 수: 부모가 모두 있는 완전한 족보에서 대 g 의 실존 노드 수 = 2^g (g ≤ 5).
2. 부의 부의 부(대 3)와 모의 부의 부의 부(대 4)가 같은 말 X → X 교차 1건, label "3×4", bloodPercent 18.75.
3. X 가 부측 대 4·5, 모측 대 3 에 등장 → label "4×5×3", bloodPercent = (0.0625+0.03125+0.125)×100.
4. 부 = 모의 부 → label "1×2", 75%.
5. 공통 조상이 없으면 빈 배열. maxGeneration 3 이면 대 4 이상 조상은 무시.
6. buildMatingPedigree 가 root.horseId null, generation 0, 부·모 노드 generation 1.
7. typecheck·lint 통과.

## 금지
- 공용 타입 수정 금지. 목록 외 파일 금지. 다른 티켓 진행 중 — 남의 파일 오류는 보고만.

## 테스트 명령
`npx vitest run tests/engine/pedigree.test.ts && npm run typecheck && npm run lint`
