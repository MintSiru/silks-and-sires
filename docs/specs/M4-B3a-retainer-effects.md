# M4-B3a 전속 계약의 효과(관계·기승 우선·위탁 우선)

담당: haiku-coder · 선행: ffde262 · 근거: 사용자 결정(2026-10-12) "전속은 관계 고정이 아니라 특수 취급"
병행: M4-B3b(계약 체결·갱신·해지, contracts.ts)가 동시에 진행된다. 이 티켓은 `state.relations.contracts` 에 계약이 **이미 들어 있다고 보고** 효과만 만든다. 테스트는 계약을 직접 넣어서 만든다.

## 사용할 것 (수정 금지)
- 타입: `RetainerContract { kind: 'trainer' | 'jockey'; personId: string; startYear; endYear; annualFee }`, `RelationsState.contracts`, `Owner.retainedJockeyId`, `Jockey.retainedBy`
- `src/engine/economy/contractQuery.ts`: `contractFor(state, kind, personId)`, `isContractedKey(state, key)`
- `src/engine/config/economy.ts`: `RETAINER_RELATION_FLOOR`(50), `RETAINER_RELATION_GAIN_MULT`(1.5), `RETAINER_EXTRA_BOXES`(6)

## 규칙
1. **관계 상승 가속·하한** — `src/engine/economy/relations.ts` 의 `adjustRelation(draft, key, delta)`:
   - 계약 중 키(`isContractedKey`)면 delta > 0 일 때 delta × `RETAINER_RELATION_GAIN_MULT`.
   - 계약 중 키면 결과를 `RETAINER_RELATION_FLOOR` 아래로 내리지 않는다(clamp 뒤, 반올림 규칙 그대로).
   - 계약이 없는 키는 지금과 완전히 같다.
2. **감소 면제** — 관계 시스템(createRelationsSystem)의 주간 감소에서 계약 중 키는 면제한다(위탁 면제 Set 에 합친다). 하한 50 아래로 내려가 있으면(이론상 없음) 감소 단계에서 50 으로 올린다.
3. **기수 기승 우선** — `src/engine/season/field.ts` `buildRaceField`:
   - 지금: 선언 순서대로 기수를 고르고, 마주의 `retainedJockeyId` 가 아직 안 쓰였으면 그 기수. 그래서 앞 순서의 다른 마주 말이 무작위로 그 기수를 먼저 가져갈 수 있다.
   - 바꿈: 배정 전에 '예약 기수' 집합을 만든다 = 이 레이스에 선언한 마주들의 `retainedJockeyId` 중, 그 마주의 선언마 하나 이상에 `rideable`(은퇴 아님·최저 체중 조건)한 기수. 다른 마주의 말을 배정할 때 무작위 후보·과체중 대체 후보에서 예약 기수를 뺀다. 예약 기수는 그 마주의 첫 번째(선언 순서) rideable 선언마에 탄다.
   - **예약 기수 집합이 비면 난수 소비 순서·결과가 지금과 완전히 같아야 한다**(기존 재현성·고정값 테스트 그대로 통과).
4. **조교사 위탁 우선** — `src/engine/season/player.ts` `assignTrainer`: 그 조교사와 계약 중이면 수용 한도 = `capacity + RETAINER_EXTRA_BOXES`. 아니면 지금과 같다.

## 생성·수정할 파일
- src/engine/economy/relations.ts, src/engine/season/field.ts, src/engine/season/player.ts
- tests/engine/retainerEffects.test.ts(신규)

## 수용 기준 (테스트로)
1. 계약 중 조교사 키에 +10 → +15. 계약 없는 키 +10 → +10. 음수 delta 는 배수 없음.
2. 계약 중 키 관계 52 에 −30 → 50(하한). 계약 없으면 22.
3. 계약 중 키는 주간 감소 후에도 값이 그대로(advanceWeek 또는 relations 시스템 run 으로 확인), 계약 없는 키는 0.15 감소.
4. 플레이어 마주에 retainedJockeyId 를 넣고 같은 레이스에 AI 말이 여럿 앞 순서로 선언된 상황에서, 시드 20개 모두 플레이어 말 기수 = 전속 기수. (현재 코드에서는 일부 시드에서 실패함을 먼저 확인하고 보고.)
5. 전속 기수가 없을 때 같은 시드의 buildRaceField 결과가 변경 전과 같다(기존 테스트 통과로 확인 + 새 테스트에서 기수 id 목록 비교).
6. 계약 조교사는 capacity 가 차 있어도 +6두까지 assignTrainer 성공, 7두째는 'trainer_full'. 계약 없는 조교사는 지금처럼 실패.
7. `npm test && npm run typecheck && npm run lint` 통과. 엔진에 Math.random·Date.now 없음, 새 상수는 만들지 말고 config 의 것을 쓴다.

## 금지
src/engine/types·config·contractQuery.ts 수정 금지. 계약 체결·갱신·해지·계약금 지불 구현 금지(B3b). src/engine/economy/contracts.ts·src/engine/state/systems.ts 수정 금지(B3b 가 수정). 화면 수정 금지. git commit 금지.
다른 에이전트가 src/engine/world/population.ts·state/world.ts(M2-03b), economy/contracts.ts·state/systems.ts(B3b)를 동시에 수정한다. 그 파일에서 생긴 테스트·린트 실패는 보고만 하라.

## 테스트 명령
npx vitest run tests/engine/retainerEffects.test.ts tests/engine/relations.test.ts tests/engine/field*.test.ts && npm test && npm run typecheck && npm run lint
