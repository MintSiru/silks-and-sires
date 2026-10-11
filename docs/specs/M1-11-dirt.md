# M1-11 더트 주로 지원 (미국 대비)

담당: haiku-coder · 선행: M1-09 완료 후. **Opus 가 공용 타입을 먼저 바꾼 상태에서 시작한다.**

## 목적
사용자 결정(2026-10-11): 미국 경마장은 더트 주로까지 구현. 마장·적성·샘플 출주마에 더트를 추가한다.

## Opus 가 이미 바꾼 것 (수정 금지)
- `src/engine/types/course.ts`: `Surface = 'turf' | 'aw' | 'dirt'`
- `src/engine/types/going.ts`: `DIRT_GOING_ORDER = ['dirt_fast', 'dirt_good', 'dirt_muddy', 'dirt_sloppy'] as const`, `DirtGoing`, `Going = TurfGoing | AwGoing | DirtGoing`
- `src/engine/types/horse.ts`: `Aptitudes.dirt: AptitudeScore` (더트 적성 -1~+1)
- `src/engine/course/load.ts` 의 surface 검사에 'dirt' 허용, `tests/engine/runnerModel.test.ts` 픽스처에 `dirt: 0` 추가

## 수정할 파일
1. `src/engine/config/going.ts`
2. `src/engine/going/going.ts`
3. `src/engine/config/raceday.ts`
4. `src/engine/race/sampleField.ts`
5. `tests/engine/going.test.ts`

## 구현 사양
### config/going.ts — 기존 Record 5개에 더트 4개 키 추가 + 상수 2개
| 키 | LABEL | SPEED_FACTOR | STAMINA_DRAIN | POWER_WEIGHT | LENGTHS_PER_SECOND |
|---|---|---|---|---|---|
| dirt_fast | 'FAST' | 1.0 | 1.0 | 0.3 | 5.5 |
| dirt_good | 'GOOD' | 0.995 | 1.02 | 0.4 | 5.5 |
| dirt_muddy | 'MUDDY' | 0.985 | 1.05 | 0.6 | 5 |
| dirt_sloppy | 'SLOPPY' | 0.98 | 1.07 | 0.7 | 5 |
```ts
/** 더트 적성 1.0 당 속도 효과 (잔디마가 더트에서 고전하는 폭이 AW 보다 크다) */
export const DIRT_APTITUDE_EFFECT = 0.03;
/** 더트 마장 확률 [fast, good, muddy, sloppy] */
export const DIRT_GOING_WEIGHTS = [0.7, 0.15, 0.1, 0.05] as const;
```
### going/going.ts
- `export function isDirtGoing(g: Going): g is DirtGoing;`
- `isGoingValidForSurface`: turf → 잔디, aw → AW, dirt → 더트.
- `goingFit` 의 apt Pick 에 `'dirt'` 추가. 더트 마장이면 `1 + DIRT_APTITUDE_EFFECT × apt.dirt` (goingTolerance 검사는 기존처럼 먼저).
- `rollGoing`: surface 'dirt' 면 `rng.next()` 1회로 DIRT_GOING_WEIGHTS 누적 선택(AW 와 같은 방식, 공용 헬퍼로 묶어도 됨).
### config/raceday.ts
`export const SAMPLE_DIRT_APT_SD = 0.4;` 추가.
### race/sampleField.ts
aptitude 생성에서 `allWeather` 바로 **다음에** `dirt = clamp(normal(0, SAMPLE_DIRT_APT_SD), -1, 1)` 를 뽑는다(그 뒤 순서는 기존대로). opts.surface 가 'dirt' 일 때 별도 처리는 하지 않는다.

## 수용 기준
1. going.test: 더트 4단계 라벨, isDirtGoing, isGoingValidForSurface(dirt) 3면 모두, goingFit(dirt=1)=1.03 / (dirt=-1)=0.97, 더트 코스 rollGoing 1,000회가 모두 더트 마장이고 dirt_fast 비율 0.65~0.75, 모든 Going 키가 5개 Record 에 존재.
2. 기존 테스트 전부 통과(`npm test`). 단, 샘플 필드 RNG 순서가 바뀌므로 **값을 고정 비교하는 기존 테스트가 깨지면 고치지 말고 보고**하라(Opus 가 판단).
3. typecheck·lint 통과, 매직 넘버 없음.

## 금지 사항
- 공용 타입·load.ts·다른 모듈 수정 금지. 목록 외 파일 금지.

## 테스트 명령
`npx vitest run tests/engine/going.test.ts && npm test && npm run typecheck && npm run lint`
