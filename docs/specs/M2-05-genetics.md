# M2-05 유전 모델 + 닉스 조회 + 배합 미리보기

담당: haiku-coder · 선행: M2-02(generate·growthCurve), M2-03(pedigree·inbreeding), M2-04(nicks.json)

## 목적
부·모 말에서 망아지(Horse)를 만든다. 결과는 "이론으로 설명되게": 부모 평균 + 닉스 + 인브리드 + 모계 + 무작위.
플레이어용 미리보기는 숫자 없이(MatingPreview) 만든다.

## 생성할 파일
1. `src/engine/config/genetics.ts`
2. `src/engine/breeding/nicks.ts`
3. `src/engine/breeding/genetics.ts`
4. `src/engine/breeding/preview.ts`
5. `tests/engine/genetics.test.ts`

## 사용할 것 (수정 금지)
타입: `Horse, Abilities, Aptitudes, GrowthProfile, NickEntry, NickLabel, InbreedingCross, MatingPreview, AssessmentComment, SireLineId, HorseId, OwnerId, CountryCode, Rng`
함수: `abilityAtAge, sampleGrowthProfile` (horse/growthCurve.ts), `GROWTH_PEAK_AGE, GROWTH_DECLINE_RATE, STYLE_WEIGHTS, ABILITY_MIN, ABILITY_MAX` (config/horse.ts), `buildMatingPedigree, PedigreeLookup` (breeding/pedigree.ts), `findInbreeding, totalBloodPercent` (breeding/inbreeding.ts)

## config/genetics.ts (값 그대로)
```ts
export const SIRE_WEIGHT = 0.5;
export const GENETIC_SD = 7;
/** 집단 평균 회귀: mid = mid + (POP_MEAN - mid) × REGRESSION */
export const POPULATION_MEAN = 55;
export const REGRESSION_TO_MEAN = 0.15;
/** 닉스 값 1.0 당 잠재 능력 보정(점) */
export const NICK_EFFECT_MAX = 4;
/** 인브리드: 혈량 합계 bp(%) 에 대한 삼각형 보너스 (LOW 에서 0, PEAK 에서 최대, HIGH 에서 0) */
export const INBREED_LOW = 6.25;
export const INBREED_PEAK = 18.75;
export const INBREED_HIGH = 31.25;
export const INBREED_BONUS_MAX = 3;
/** bp 가 EXCESS_FROM 초과 시 초과 1% 당 잠재 감점, 건강도 감점 */
export const INBREED_EXCESS_FROM = 25;
export const INBREED_EXCESS_POTENTIAL_PENALTY = 0.4;
export const INBREED_EXCESS_SOUNDNESS_PENALTY = 1.0;
/** 모계 점수(0~1) 1.0 당 잠재 보정 */
export const FAMILY_BONUS_MAX = 2.5;
/** 적성 유전 */
export const DIST_INHERIT_SD = 200;
export const GOING_INHERIT_SD = 0.7;
export const SURFACE_INHERIT_KEEP = 0.7;
export const SURFACE_INHERIT_SD = 0.25;
export const SOUNDNESS_INHERIT_SD = 8;
export const MENTAL_INHERIT_SD = 10;
/** 성장형: 부 형 SIRE_P, 모 형 DAM_P, 나머지 무작위 */
export const GROWTH_FROM_SIRE_P = 0.4;
export const GROWTH_FROM_DAM_P = 0.4;
/** 작전 선호: 부 SIRE_P, 모 DAM_P, 나머지 STYLE_WEIGHTS */
export const STYLE_FROM_SIRE_P = 0.5;
export const STYLE_FROM_DAM_P = 0.3;
/** 닉스 라벨 경계 */
export const NICK_EXCELLENT = 0.5;
export const NICK_GOOD = 0.2;
export const NICK_POOR = -0.2;
/** 미리보기 거리 힌트 반폭(m), 반올림 단위 */
export const PREVIEW_DIST_HALF_WIDTH = 400;
export const PREVIEW_DIST_ROUND = 100;
/** 미리보기 코멘트 기준: 부모 잠재 평균이 이 이상/이하면 */
export const PREVIEW_TRAIT_HIGH = 70;
export const PREVIEW_TRAIT_LOW = 50;
```

## breeding/nicks.ts
```ts
export function nickKey(sireLineId: SireLineId, damsireLineId: SireLineId): string;   // `${a}|${b}`
export function nickValue(table: readonly NickEntry[], sireLineId: SireLineId | null, damsireLineId: SireLineId | null): number; // 없으면 0
export function nickLabel(value: number, known: boolean): NickLabel;   // known false → 'unknown', ≥EXCELLENT excellent, ≥GOOD good, ≤POOR poor, 그 외 neutral
export function initialRevealedNicks(table: readonly NickEntry[]): string[];  // knownAtStart 인 키, 정렬
```
## breeding/genetics.ts
```ts
export interface BreedArgs {
  sire: Horse; dam: Horse;
  /** 모의 부(모부)의 sireLineId — 닉스 조회용. 모르면 null */
  damsireLineId: SireLineId | null;
  nicks: readonly NickEntry[];
  inbreeding: readonly InbreedingCross[];
  /** 0~1. 모계 명성(호출자가 계산) */
  damFamilyScore: number;
  id: HorseId; name: string; birthYear: number; currentYear: number;
  countryOfBirth: CountryCode; ownerId: OwnerId | null; breederId: OwnerId | null;
}
export function inbreedingEffect(bloodPercent: number): { potential: number; soundness: number };
export function breed(rng: Rng, args: BreedArgs): Horse;
```
breed 규칙 (rng 순서 = 나열 순서):
1. 성별: chance(0.5) ? 'male' : 'female'.
2. 보정 합 `adj = NICK_EFFECT_MAX × nickValue(sire.sireLineId, damsireLineId) + inbreedingEffect(bp).potential + FAMILY_BONUS_MAX × damFamilyScore` (bp = totalBloodPercent(inbreeding)).
3. 잠재: 능력별(speed, stamina, acceleration, guts, power 순) `mid = SIRE_WEIGHT × sire.potential + (1-SIRE_WEIGHT) × dam.potential`, `mid += (POPULATION_MEAN - mid) × REGRESSION_TO_MEAN`, `value = clamp(mid + adj + normal(0, GENETIC_SD))`.
4. 성장형: u = next(); u < SIRE_P → sire.growth.type, < SIRE_P+DAM_P → dam.growth.type, 그 외 sampleGrowthProfile(rng).type. peakAge·declineRate 는 config/horse 표 값.
5. 적성: distanceOptimum = clamp(평균 + normal(0, DIST_INHERIT_SD), 1000, 3600); distanceRange = 평균; goingPreference = clamp(평균 + normal(0, GOING_INHERIT_SD), 0, 6); goingTolerance = 평균; allWeather·dirt·leftHanded·rightHanded·undulation 각각 clamp(평균 × KEEP + normal(0, SD), -1, 1).
6. 작전: u = next(); < SIRE_P → sire.preferredStyle, < SIRE_P+DAM_P → dam, 그 외 STYLE_WEIGHTS 누적(next() 1회 더).
7. soundness = clamp(평균 + normal(0, SOUNDNESS_INHERIT_SD) - inbreedingEffect(bp).soundness, 1, 100); mental = clamp(평균 + normal(0, MENTAL_INHERIT_SD), 1, 100).
8. ability = abilityAtAge(potential, currentYear - birthYear, growth). status 'foal', sireId/damId, sireLineId = sire.sireLineId, familyId = dam.familyId ?? dam.id, condition {fitness: 50, fatigue 0, mental, injury null}, record 0, officialRating null, gelded false, trainerId null.
inbreedingEffect: bp ≤ LOW 또는 ≥ HIGH → 보너스 0, 그 사이 삼각형(PEAK 에서 INBREED_BONUS_MAX). bp > EXCESS_FROM → 보너스에서 (bp - EXCESS_FROM) × POTENTIAL_PENALTY 를 빼고, soundness 감점 = (bp - EXCESS_FROM) × SOUNDNESS_PENALTY. 그 외 soundness 0.

## breeding/preview.ts
```ts
export function buildMatingPreview(args: {
  sire: Horse; dam: Horse; damsireLineId: SireLineId | null;
  lookup: PedigreeLookup; nicks: readonly NickEntry[]; revealedNicks: ReadonlySet<string>;
}): MatingPreview;
```
- inbreeding = findInbreeding(buildMatingPedigree(lookup, sire.id, dam.id)).
- nick: known = sire.sireLineId 와 damsireLineId 가 있고 revealedNicks 에 키가 있음. label = nickLabel(값, known). **미공개면 값 노출 금지**.
- distanceHint: 부모 distanceOptimum 평균 ∓ PREVIEW_DIST_HALF_WIDTH, [1000,3600], 100 단위.
- precocityHint: 부모 growth.type 이 같으면 그 값, 다르면 'unknown'.
- comments(최대 3): 부모 잠재 평균(SIRE_WEIGHT 가중)으로 speed ≥ HIGH → speed_good(+), stamina ≥ HIGH → stamina_stays_well(+), stamina ≤ LOW → stamina_sprinter(neutral), soundness 평균 ≤ LOW → legs_fragile(−). 이 순서로 앞에서부터.
- rng 사용 없음(결정론, 순수).

## 수용 기준
1. 같은 시드·입력 → 같은 망아지. 망아지 잠재 평균이 부모 중간값 근처(1,000회 평균 오차 ±1, 보정 0 조건).
2. 닉스 +1 조합의 1,000마리 잠재 평균이 닉스 0 조합보다 약 NICK_EFFECT_MAX(±0.8) 높다. 닉스 미공개 미리보기는 label 'unknown'.
3. inbreedingEffect(18.75).potential = 3, (6.25) = 0, (40) 의 potential < 0 이고 soundness 감점 = 15.
4. 회귀: 부모 잠재가 모두 95 이면 망아지 평균 < 95, 모두 30 이면 > 30.
5. 성장형 유전 비율(10,000회): 부 normal·모 late 일 때 망아지 normal 비율 0.47~0.53 (= 0.4 + 0.2×0.5).
6. 미리보기에 능력치 숫자가 없다(타입상), rng 를 쓰지 않는다. typecheck·lint 통과.

## 금지
- 공용 타입·다른 모듈 수정 금지. 목록 외 파일 금지.

## 테스트 명령
`npx vitest run tests/engine/genetics.test.ts && npm run typecheck && npm run lint`
