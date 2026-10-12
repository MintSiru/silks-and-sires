# M4-C6 조교사 상마안 적용: 세일 동행 검사 + 내 말 소견 정확도

담당: haiku-coder · 선행: a3d6323 · 근거: 사용자 아이디어(M4) "전속/관계 좋은 조교사와 세일 동행, 상마안에 따라 코멘트 정확도", M4-B2(Trainer.eye), B3a(전속 계약)

## 사용할 것 (수정 금지)
`Trainer.eye`(0~100 숨김), `contractFor`(economy/contractQuery.ts), `relationOf`·`relationKey`(economy/relations.ts), `assessHorse(horse, stage, assessorSkill, date, rng)`·`Assessment`(horse/assessment.ts), `stageFor`(horse/playerView.ts), `SaleCatalogue`·`SaleLot`, `createRng`, `PLAYER_ASSESSOR_SKILL`

## 생성·수정할 파일 (5개)
1. `src/engine/config/economy.ts` — `RETAINER_EYE_BONUS = 15`(전속 조교사의 상마안 가산, 최대 100) 를 전속 계약 절 끝에 추가.
2. `src/engine/config/sales.ts` — `SALE_INSPECT_MIN_RELATION = 10`(세일 동행 가능 관계 하한, 전속이면 무관).
3. `src/engine/horse/playerView.ts`
   - `export function assessorSkillFor(state, horse): number` — 말에 조교사가 있으면 그 조교사 eye(+ 전속이면 RETAINER_EYE_BONUS, 최대 100), 없으면 PLAYER_ASSESSOR_SKILL.
   - `assessForPlayer(state, horseId, assessorSkill?)`: 세 번째 인자를 주지 않으면 `assessorSkillFor(state, horse)` 를 쓴다(주면 그 값). rng 규칙은 그대로.
4. `src/engine/sales/inspection.ts`(신규)
   - `export interface InspectorOption { trainerId: TrainerId; name: string; reason: 'retained' | 'relation' }`
   - `eligibleInspectors(state): InspectorOption[]` — 전속 조교사 + 관계 ≥ SALE_INSPECT_MIN_RELATION 인 조교사. 이름 오름차순(전속이 먼저). **eye 값은 내보내지 않는다.**
   - `inspectLot(state, saleId, year, lotNo, trainerId): { ok: true; assessment: Assessment } | { ok: false; error: 'catalogue_not_found' | 'lot_not_found' | 'lot_closed' | 'horse_missing' | 'not_eligible' }`
     - skill = 그 조교사 eye(+전속 보너스, 최대 100). stage = stageFor(로트 말, state.date). rng = `createRng(`inspect:${saleId}:${year}:${lotNo}:${trainerId}`)` — 같은 조교사가 같은 로트를 다시 보면 같은 결과, 다른 조교사는 다른 결과.
     - 상태를 바꾸지 않는다(검사 비용 없음).
5. `tests/engine/saleInspection.test.ts`(신규)

## 수용 기준
1. assessorSkillFor: 조교사 없음 → 50, eye 40 조교사 → 40, 전속 eye 90 → 100(상한), 전속 eye 40 → 55.
2. assessForPlayer 인자 생략 시 assessorSkillFor 값을 쓰고, 인자를 주면 그 값(기존 호출 결과 불변 — 기존 테스트 통과).
3. eligibleInspectors: 전속 조교사·관계 10 이상만, 관계 9.99 는 제외, 결과에 eye 키 없음.
4. inspectLot 실패 사유 5개 각각. 같은 입력 2회 동일.
5. **정확도**: 시드 20261011 1세마 카탈로그 로트 100개를, 테스트에서 eye 를 20 과 90 으로 바꾼 같은 조교사(전속 아님, 관계 50)로 검사 → 종합 등급(overall)의 '실제 등급'(assessHorse 를 skill 100·노이즈 0 대신, 로트 말의 trueTraits 평균으로 gradeOf 계산 — assessment.ts 에 export 된 gradeOf·meanAbility 사용) 과의 평균 등급 차가 eye 90 쪽이 더 작다. 두 평균값 보고.
6. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. assessment.ts 수정 금지(필요한 함수가 export 안 돼 있으면 보고). 화면 구현 금지. git commit 금지.

## 테스트 명령
npx vitest run tests/engine/saleInspection.test.ts tests/engine/playerView.test.ts && npm test && npm run typecheck && npm run lint
