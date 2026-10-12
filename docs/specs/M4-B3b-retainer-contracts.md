# M4-B3b 전속 계약 체결·갱신·해지

담당: haiku-coder · 선행: ffde262 · 근거: 사용자 결정(2026-10-12) "전속은 특수 취급", m4-ideas "어리고 경력 낮을수록 전속 확률 높음"
병행: M4-B3a(계약 효과: relations.ts·field.ts·player.ts)가 동시에 진행된다. 이 티켓은 계약을 만들고·갱신하고·없애는 일과 돈만 맡는다.

## 사용할 것 (수정 금지)
- 타입: `RetainerContract`, `RelationsState.contracts`, `Owner.retainedJockeyId`, `Jockey.retainedBy`, `Trainer`/`Jockey`(skill·birthYear·retired — Trainer 에는 retired 가 없다: 조교사는 은퇴하지 않는 것으로 본다), LedgerCategory `'retainer_fee'`,
  GameEvent `{ type: 'retainer_changed'; kind; personId; change: 'signed'|'renewed'|'declined'|'lapsed'|'terminated'; fee; date }`
- `contractFor`, `isContractedKey`(economy/contractQuery.ts), `relationOf`·`relationKey`·`adjustRelation`(economy/relations.ts — B3a 가 내부를 바꾸지만 시그니처는 그대로), `recordMoney`(economy/ledger.ts), `canSpendDiscretionary`(economy/solvency.ts), `PlayerResult`(season/player.ts)
- 상수: config/economy.ts 의 `RETAINER_*` 전부(값은 파일 주석 참조). 새 상수가 필요하면 만들지 말고 보고.

## 함수 (src/engine/economy/contracts.ts 신규)
나이 = 현재 연도 − birthYear. 젊음 = 기수 나이 ≤ `RETAINER_YOUNG_JOCKEY_AGE`, 조교사 나이 ≤ `RETAINER_YOUNG_TRAINER_AGE`.
관계 = `relationOf(state, relationKey(kind, personId))`. 명성 = `state.relations.reputation`.

1. `retainerFee(state, kind, personId): Money`
   - 기본 = BASE_FEE + skill² × FEE_PER_SKILL_SQ (기수·조교사 상수 따로)
   - × (1 − clamp(관계, 0, `RETAINER_RELATION_DISCOUNT_CAP`) / `RETAINER_RELATION_DISCOUNT_DIVISOR`)
   - 젊으면 × `RETAINER_YOUTH_FEE_MULT`
   - `RETAINER_FEE_ROUND` 단위 반올림(정수).
2. `retainerQuote(state, kind, personId): { ok: true; fee: Money } | { ok: false; reason: RetainerRefusal }`
   - `RetainerRefusal = 'not_found' | 'retired' | 'already_contracted' | 'slot_full' | 'retained_elsewhere' | 'relation_too_low' | 'standing_too_low'` (이 파일에서 export)
   - 검사 순서: 없음 → 은퇴(기수 retired) → 이미 이 사람과 계약 → 같은 종류 계약 수 ≥ `RETAINER_MAX_PER_KIND` → (기수) retainedBy 가 플레이어가 아닌 다른 마주 → 관계 < `RETAINER_MIN_RELATION` → 위상 부족.
   - 위상: 플레이어 위상 = 명성 + 관계 × `RETAINER_STANDING_RELATION_WEIGHT` + `RETAINER_STANDING_BASE`, 요구 위상 = skill − (젊으면 `RETAINER_YOUTH_STATURE_DISCOUNT`). 플레이어 위상 < 요구 위상이면 거절.
   - 결정적(난수 없음). 화면이 '제의 가능/거절 사유/계약금'을 미리 보여 주는 데 쓴다.
3. `signRetainer(state, kind, personId): PlayerResult<RetainerRefusal | 'insufficient_funds'>`
   - quote 가 거절이면 그 사유로 실패. 첫 해 지불액 = round(fee × (53 − 현재 주) / 52) (주 1 이면 전액, 주 52 면 1/52). `canSpendDiscretionary(state, 지불액)` 거짓이면 'insufficient_funds'.
   - 성공: structuredClone 한 다음 상태에 `recordMoney(next, 플레이어, 'retainer_fee', −지불액, 오늘)`, contracts 에 `{ kind, personId, startYear: 올해, endYear: 올해, annualFee: fee }` 추가(정렬: kind, personId 오름차순), 관계를 max(현재, `RETAINER_RELATION_FLOOR`) 로 올림(직접 값 설정 — adjustRelation 로 올리면 배수가 걸리므로 values 에 직접 쓰고 소수 둘째 자리 반올림),
     기수면 `owner.retainedJockeyId = personId`, `jockey.retainedBy = 플레이어 id`. 이벤트 `retainer_changed`(signed, fee=지불액).
4. `terminateRetainer(state, kind, personId): PlayerResult<'not_contracted'>`
   - 위약금 = round(annualFee × `RETAINER_TERMINATION_PENALTY_RATE`), `recordMoney(..., 'retainer_fee', −위약금)` — 자금이 모자라도 진행(음수는 solvency 가 처리).
   - 계약 삭제 → 그 다음 `adjustRelation(next, key, −RETAINER_TERMINATION_RELATION_HIT)`(계약이 지워진 뒤라 하한 없음). 기수면 retainedJockeyId·retainedBy 를 null 로. 이벤트 terminated(fee=위약금).
5. `createContractsSystem(): WeeklySystem`(id 'contracts') — 주 1(연초)에만 동작. `endYear < 올해` 인 계약마다(kind, personId 오름차순):
   - 사람이 없거나 은퇴 → 계약 삭제, lapsed(fee 0).
   - 관계 < `RETAINER_RENEW_MIN_RELATION` → 계약 삭제, declined(fee 0).
   - 새 계약금 = retainerFee(그때 관계·나이로 다시 계산). `canSpendDiscretionary` 거짓 → 삭제, lapsed(fee 0).
   - 그 밖: 전액 지불(retainer_fee), endYear = 올해, annualFee = 새 계약금, renewed(fee).
   - 삭제할 때 기수 링크(retainedJockeyId·retainedBy)도 null 로. 난수 미사용.
   - 위상(명성) 조건은 갱신에 쓰지 않는다(갱신은 관계로만 판정 — 사용자 결정).
6. `src/engine/state/systems.ts`: contracts 시스템을 season 다음, costs 앞에 넣는다(연초 계약금이 그 주 자금 판정에 들어가게). 시스템 순서를 기대하는 테스트가 있으면 기대값만 고치고 보고.

## 생성·수정할 파일
- src/engine/economy/contracts.ts(신규), src/engine/state/systems.ts
- tests/engine/contracts.test.ts(신규)

## 수용 기준 (테스트로)
1. retainerFee: skill 80 기수·관계 0·나이 30 → 15,000 + 6,400×12 = 91,800 → 92,000(500 단위). 같은 기수 관계 60 → ×0.75 → 69,000(68,850 반올림). 나이 22 면 추가 ×0.8.
2. quote 거절 사유가 검사 순서대로 나온다(사유마다 1개 이상 테스트). 명성 10·관계 0 이면 skill 45 기수 수락, skill 46 거절(standing_too_low), 나이 22 skill 60 수락.
3. sign: 주 1 전액·주 27 절반(26/52) 지불, 장부 'retainer_fee' 기록, 관계 하한 50 적용(관계 70 이면 70 유지), 기수 링크 양쪽 설정, 두 번째 기수 계약은 slot_full, 캐주얼 빚 있으면 insufficient_funds.
4. terminate: 위약금 25%, 관계 −40(계약 삭제 뒤라 50 하한 없음 → 50 이면 10), 링크 해제.
5. 연초 시스템: 관계 60 → renewed(전액, endYear 갱신), 관계 54 → declined, 자금 부족 → lapsed, 은퇴 기수 → lapsed. 주 2~52 에는 아무것도 안 함. 같은 해 두 번 돌려도 두 번 갱신하지 않는다.
6. 계약 1개 넣고 bootstrapGame + 시즌 넘김 2회 진행 → 저장 왕복(serialize/deserialize) 후 contracts 동일. 같은 시드 2회 결과 동일.
7. `npm test && npm run typecheck && npm run lint` 통과. 엔진에 Math.random·Date.now 없음.

## 금지
src/engine/types·config·contractQuery.ts 수정 금지. relations.ts·field.ts·player.ts 수정 금지(B3a). 화면 수정 금지. git commit 금지.
다른 에이전트가 relations.ts·season/field.ts·season/player.ts(B3a), world/population.ts·state/world.ts(M2-03b)를 동시에 수정한다. 그쪽 실패는 보고만 하라.

## 테스트 명령
npx vitest run tests/engine/contracts.test.ts && npm test && npm run typecheck && npm run lint
