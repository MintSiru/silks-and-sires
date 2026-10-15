# M4-D2a 종마 가치(첫 종부료)·내 목장 계류

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D2 · 선행: D0 타입(src/engine/types/stud.ts, GameState.yearEnd·stud)

목적: 은퇴한 내 수말을 내 목장 종마사에 세울 수 있게, 첫 종부료 추정 함수와 계류 함수를 만든다(연말 정산 D1a 가 호출한다).

## 사용할 타입·함수 (수정 금지)
- `GameState`(stallions, horses, owners, seasonState.ratingHistory, sireStats, stud: StudState), `Stallion`, `Horse`(record.groupWins, officialRating, sireId, sireLineId, gelded, sex), `StudState { slots; seasons }`, `GameEvent`('horse_status_changed').
- `createRng(label)`(rng/index.ts), `ratingFromAbility`·`meanAbility`(world/rating.ts), 설정 `FERTILITY_MEAN·FERTILITY_SD·FERTILITY_MIN·FERTILITY_MAX`(config/world.ts).
- `bookCovering`(breeding/season.ts) — 아래 4번만 수정.

## 생성·수정할 파일 (5개)
1. `src/engine/config/stud.ts`(신규) — 밸런스 상수. 아래 수치는 시작값(주석에 근거 1줄):
   - `STUD_BASE_SLOTS = 1`, `STUD_MIN_AGE = 3`(새해 나이)
   - 성적 기본 종부료 `STUD_FEE_BY_PEAK_OR`: 표 [[90, 2_000], [100, 4_000], [110, 9_000], [115, 15_000], [120, 25_000], [125, 40_000], [130, 60_000]] — 최고 OR 사이는 선형 보간, 90 미만은 €1,500 고정, 130 초과는 60,000 고정.
   - 그룹 우승 가산 `STUD_GROUP_WIN_MULT_PER = 0.08`, 상한 `STUD_GROUP_WIN_MULT_MAX = 1.4`(배수 = min(1 + 0.08 × groupWins, 1.4)).
   - 혈통 배수: 부 종부료 / `STUD_PEDIGREE_REF_FEE`(30_000) 의 0.25 제곱, [0.7, 1.4] 로 자름. 부가 없거나 종마 레코드가 없으면 1.
   - 유행 배수: 1 + (부계 인기 − 50) / 50 × `STUD_TREND_AMPLITUDE`(0.15). 부계 인기 = 같은 sireLineId 현역 종마들의 popularity 평균(없으면 50).
   - 종부료 하한 `STUD_FEE_MIN = 1_000`, 사다리: €10,000 미만은 €500 단위, 이상은 €1,000 단위 반올림.
   - 북 상한·인기: `STUD_BOOK_LIMIT_BY_FEE` [[0, 60], [5_000, 80], [15_000, 110], [40_000, 140]](계단식: 해당 이상 중 가장 큰 구간), 인기 = clamp(round(20 + 15 × log10(fee / 1_000)), 10, 80).
2. `src/engine/stud/value.ts`(신규, 순수·난수 없음)
   - `peakOfficialRating(state: GameState, horseId: HorseId): number | null` — ratingHistory 의 to 최댓값과 현재 officialRating 중 큰 값. 둘 다 없으면 null.
   - `export interface StudFeeEstimate { fee: Money; base: number; groupMult: number; pedigreeMult: number; trendMult: number }`
   - `estimateStudFee(state: GameState, horseId: HorseId): StudFeeEstimate` — fee = 사다리(max(STUD_FEE_MIN, base × groupMult × pedigreeMult × trendMult)). 최고 OR 이 null 이면 ratingFromAbility(meanAbility(ability)) 를 쓴다.
   - `roundStudFee(value: number): Money`
3. `src/engine/stud/stand.ts`(신규)
   - `export type StandError = 'not_found' | 'not_player_horse' | 'not_entire_colt' | 'too_young' | 'not_racing' | 'no_free_slot'`
   - `freeStudSlots(state: GameState): number` — state.stud.slots − (플레이어 소유·status 'stud' 인 말 수). 0 미만이면 0.
   - `canStandAtStud(state: GameState, horseId: HorseId, year: number): StandError | null` — 순서대로 검사: 없음 / 소유자가 플레이어 아님 / 수말이 아니거나 거세 / 새해 나이(year − birthYear) < STUD_MIN_AGE / status 가 in_training·resting 아님 / 빈 칸 없음.
   - `standPlayerStallion(draft: GameState, horseId: HorseId, year: number): GameEvent[]` — canStandAtStud 가 null 이 아니면 Error. draft 를 직접 바꾼다: status 'stud', trainerId null, `draft.stallions[horseId]` 생성 { horseId, realKey: null, sireLineId: horse.sireLineId ?? (부 종마의 sireLineId) ?? 'sl_phalaris', fee: estimateStudFee.fee, bookLimit·popularity: config 규칙, bookedThisSeason: 0, fertility: createRng(`${draft.initialSeed}:stud-fertility:${horseId}`) 의 normal(FERTILITY_MEAN, FERTILITY_SD) 을 [MIN, MAX] 로 자름, standsIn: 플레이어 마주의 country, firstSeasonYear: year }. horse_status_changed 이벤트 1개(date = { year, week: 1 })를 돌려준다.
4. `src/engine/breeding/season.ts` — 자기 종마 교배: bookCovering 에서 종마 말의 ownerId === 예약자 ownerId 면 종부료 0(장부 기록·자금 검사 없음, 이벤트 fee 0). judgeConceptions 의 불수태 환불도 암말 소유자 === 종마 소유자면 하지 않는다. 그 밖의 동작은 그대로.
5. `tests/engine/studStand.test.ts`(신규)

## 수용 기준
1. estimateStudFee: 같은 말·같은 state 2회 동일. 최고 OR 120·그룹 2승·부 종부료 30,000·부계 인기 50 이면 fee = 사다리(25,000 × 1.16) = 29,000.
2. 최고 OR 이 높을수록(다른 조건 같음) fee 가 줄지 않는다(90~135 를 5 간격으로 확인). 사다리 결과는 500/1,000 단위.
3. canStandAtStud 가 6가지 오류를 각각 낸다(테스트에서 상황을 만들어 확인). 빈 칸 1칸을 쓰면 두 번째 수말은 'no_free_slot'.
4. standPlayerStallion 후: status 'stud', trainerId null, stallions 에 레코드, realKey null, firstSeasonYear = year, fertility ∈ [0.5, 0.99], 같은 시드 2회 동일.
5. 자기 종마 교배: 번식 시즌에 플레이어 암말을 자기 종마에 예약하면 자금 변화 0·장부 'stud_fee_paid' 기록 없음. 불수태여도 환불 기록 없음. 남의 종마 예약은 지금과 같다(기존 breeding 테스트 통과).
6. `npm test && npm run typecheck && npm run lint` 통과 — 단 typecheck 는 D1a 전까지 newGame.ts·save.test.ts 의 yearEnd·stud 누락 오류 2건이 남는다(이 작업 범위 밖, 고치지 말 것). 새 오류는 없어야 한다.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. Math.random·Date.now 금지. 기존 rng 스트림 소비 순서 변경 금지(fertility 는 별도 createRng). git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/studStand.test.ts tests/engine/breedingSeason.test.ts && npm test && npm run typecheck && npm run lint
