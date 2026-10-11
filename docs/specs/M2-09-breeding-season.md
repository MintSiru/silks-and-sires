# M2-09 교배 시즌: 교배 예약 → 수태 판정 → 출산(망아지 생성)

담당: haiku-coder · 선행: M2-05(genetics·nicks), M2-06(growth), M2-08(world)

## 목적
플레이어가 종부 시즌(2~6월)에 암말을 종마에 예약하면 종부료를 내고, 수태 판정을 거쳐 이듬해 출산 시즌에 망아지가 태어난다. 유럽 관행대로 **불수태 시 종부료 환불(No Foal No Fee 를 단순화: 수태 실패 시 즉시 환불)**.

## 생성할 파일
1. `src/engine/config/breedingSeason.ts`
2. `src/engine/breeding/season.ts`
3. `tests/engine/breedingSeason.test.ts`

## 사용할 것 (수정 금지)
타입: `GameState, Horse, Stallion, Mare, NickEntry, WeeklySystem, WeekContext, GameEvent, HorseId, OwnerId, Rng`
함수: `breed, BreedArgs` (breeding/genetics.ts), `nickValue, nickKey` (breeding/nicks.ts), `buildMatingPedigree, PedigreeLookup` (breeding/pedigree.ts), `findInbreeding` (breeding/inbreeding.ts), `generateHorseName, HorseWords` (horse/generate.ts), `allocateHorseId` (state/world.ts), `isInPhase` (time/calendar.ts)

## Opus 가 추가하는 공용 타입 (위임 전에 반영됨)
GameEvent 에 추가:
`{ type: 'covering_booked'; mareId; stallionId; fee: Money; date }`, `{ type: 'conception'; mareId; stallionId; success: boolean; date }`, `{ type: 'foal_born'; foalId; mareId; stallionId; date }`.

## config/breedingSeason.ts (값 그대로)
```ts
/** 임신 기간(주) */
export const GESTATION_WEEKS = 48;
/** 암말 나이별 수태율 배수: 이 나이 이하 1.0, 이후 매년 DECLINE 감소, 하한 FLOOR */
export const MARE_FERTILE_PEAK_AGE = 12;
export const MARE_FERTILITY_DECLINE = 0.04;
export const MARE_FERTILITY_FLOOR = 0.4;
/** 교배 가능한 암말 최소 나이 */
export const MARE_MIN_BREEDING_AGE = 3;
/** 모계 점수: min(1, blackTypeProduce / FAMILY_SCORE_DIVISOR) */
export const FAMILY_SCORE_DIVISOR = 3;
/** 망아지 출생국: 암말 출생국을 따른다 */
```
## breeding/season.ts
```ts
export type BookingError = 'not_breeding_season' | 'not_your_mare' | 'not_a_broodmare' | 'mare_too_young' | 'already_pregnant' | 'already_covered' | 'stallion_not_available' | 'book_full' | 'insufficient_funds';
export type BookingResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: BookingError };
/** 플레이어 행동. 원본 불변(structuredClone) */
export function bookCovering(state: GameState, ownerId: OwnerId, mareId: HorseId, stallionId: HorseId): BookingResult;
export function damsireLineOf(state: GameState, dam: Horse): SireLineId | null;   // dam.sireId 말의 sireLineId
export function familyScore(state: GameState, mareId: HorseId): number;           // min(1, mares[mareId].blackTypeProduce / DIVISOR), 없으면 0
export function mareFertility(ageYears: number): number;
export function revealNick(state: GameState, sireLineId: SireLineId, damsireLineId: SireLineId): boolean;  // 새로 공개되면 true (state 직접 수정, 정렬 유지)
export interface BreedingStaticData { nicks: readonly NickEntry[]; words: HorseWords; }
export function createBreedingSystem(data: BreedingStaticData): WeeklySystem;     // id 'breeding'
```
bookCovering 검사 순서: 현재 주가 'breeding' 단계 → 암말 owner 일치 → status 'broodmare' 이고 mares 레코드 있음 → 나이 ≥ MIN → pregnant 아님 → coveredBy null → stallions[stallionId] 존재 → bookedThisSeason < bookLimit → owner.funds ≥ fee. 성공 시 funds -= fee, mare.coveredBy = stallionId, stallion.bookedThisSeason += 1, 이벤트 covering_booked.

createBreedingSystem 의 run(draft, ctx) — 마주 id·말 id 오름차순 등 결정론적 순서:
1. **새 시즌 리셋**: 이번 주가 'breeding' 단계의 첫 주면(이전 주는 아님) 모든 stallion.bookedThisSeason = 0, pregnant 가 아닌 mare.coveredBy = null.
2. **수태 판정**: coveredBy 가 있고 pregnant false 인 암말(mareId 오름차순)마다 `p = stallion.fertility × mareFertility(나이)`, `rng.chance(p)`. 성공 → pregnant true, dueWeek = 위 3 의 형식, 이벤트 conception success. 실패 → coveredBy null, owner.funds += fee(환불), stallion.bookedThisSeason -= 1, conception 실패 이벤트.
   (판정은 예약 다음 주 run 에서 일어난다 — 예약 주에는 bookCovering 만 실행됨)
3. **출산**: Mare.dueWeek 는 `연도 × 100 + 주` 형식으로 저장한다(2단계 수태 성공 시 계산: 현재 주 + GESTATION_WEEKS 가 52 를 넘으면 다음 해로 넘김. 예: 2026년 11주 + 48 → 2027년 7주 → 202707). 이번 주의 `연도 × 100 + 주` 가 dueWeek 와 같은 암말(mareId 오름차순):
   → 출산: sire = horses[coveredBy], dam = 암말, inbreeding = findInbreeding(buildMatingPedigree(lookup, sire, dam)), foal = breed(rng, {...}) — id = allocateHorseId(draft), name = generateHorseName(rng, words, used(모든 말 이름)), birthYear = 현재 연도, countryOfBirth = 암말 출생국, ownerId = 암말 owner, breederId = 암말 owner.
   horses 에 추가, owner.horseIds 추가, mare.foals 추가, pregnant false, coveredBy null, dueWeek null, 이벤트 foal_born.

## 수용 기준
1. bookCovering: 각 오류 코드가 맞는 조건에서 나온다(9종). 성공 시 자금·예약 수·coveredBy 변화, 원본 불변.
2. 수태율 1.0(fertility 1, 젊은 암말)이면 다음 주 수태, 0.0 이면 실패 + 환불(자금 원복).
3. 2026년 10주 예약 → 11주 수태(dueWeek = 202707) → 2027년 7주에 망아지 출생, 망아지 birthYear 2027, status 'foal', sire/dam/familyId/sireLineId 정확, 이름 중복 없음.
4. 같은 시드로 2년 진행 두 번 → 같은 JSON.
5. 새 시즌 첫 주에 bookedThisSeason 리셋.
6. revealNick 은 중복 추가하지 않고 정렬을 유지한다.
7. typecheck·lint 통과, 매직 넘버 config.

## 금지
- 공용 타입·다른 모듈 수정 금지. 목록 외 파일 금지.

## 테스트 명령
`npx vitest run tests/engine/breedingSeason.test.ts && npm test && npm run typecheck && npm run lint`
