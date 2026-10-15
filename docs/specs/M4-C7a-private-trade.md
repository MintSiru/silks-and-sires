# M4-C7a 내부거래(오너브리더의 유망주 개인 제안) — 엔진

담당: haiku-coder · 선행: 9436dcb(타입 PrivateOffer·SalesState.privateOffers·nextPrivateOfferNo·이벤트 private_offer), 1436962 · 근거: 사용자 아이디어(M4) "내부거래: 관계 높은 오너브리더의 유망주를 프라이빗으로 제안·구매"
병행: Codex 가 C8b(sales/system.ts·player.ts·bidding.ts·inspection.ts·patron.ts·config/sales.ts)를 동시에 수정한다 — 그 파일은 건드리지 말 것.

## 사용할 것 (수정 금지)
- 타입: `PrivateOffer`, `SalesState.privateOffers`·`nextPrivateOfferNo`, GameEvent `{ type: 'private_offer'; offerId; ownerId; horseId; price; change: 'offered'|'accepted'|'declined'|'expired'; date }`, `Owner`(studName·tier), `Horse`(breederId·record·status·birthYear)
- `relationOf`·`adjustRelation`·`relationKey('owner', id)`(economy/relations.ts), `recordMoney`(ledger, 장부 종류 'private_sale'), `canSpendDiscretionary`, `valueLot`·`estimateRange`(sales/valuation.ts), `eligibleInspectors`(sales/inspection.ts — 읽기만), `trainerAssessorSkill`·`stageFor`(horse/playerView.ts), `assessHorse`, `createRng`, `PlayerResult`

## 생성·수정할 파일 (5개)
1. `src/engine/config/privateTrade.ts`(신규) — 아래 상수(괄호 = 초기값).
2. `src/engine/sales/privateTrade.ts`(신규)
3. `src/engine/state/systems.ts` — `createPrivateTradeSystem()` 을 sales 다음·contracts 앞에. 시스템 순서 기대 테스트(tests/engine/playerView.test.ts)는 기대값만 고치고 보고.
4. `src/engine/season/apply.ts` — `applyPlayerRunRelations` 끝에: 플레이어 말이 1착이고 그 말의 breederId 가 **AI 마주**(state.owners 에 있고 플레이어 아님)면 그 마주 관계 +`OWNER_RELATION_BRED_WIN`(2), G1 이면 +`OWNER_RELATION_BRED_G1_WIN`(5).
5. `tests/engine/privateTrade.test.ts`(신규)

## 규칙
### 제안 생성 — 주간 시스템 `createPrivateTradeSystem()`(id 'private_trade')
- 매주: 만료 주가 지난 제안(올해·주 비교) 삭제 + 이벤트 expired. 말이 더 이상 그 마주 소유가 아니거나 출주했거나(record.starts > 0) 없어졌으면 그 제안도 조용히 삭제.
- `PRIVATE_OFFER_WEEKS`([3, 6, 9]) 에만 새 제안:
  - 자격 마주: AI 마주, studName ≠ null, tier major 또는 mid, 그리고 (관계 ≥ `PRIVATE_OFFER_MIN_RELATION`(20) 또는 플레이어 명성 ≥ `PRIVATE_OFFER_MIN_REPUTATION`(35)). 이미 진행 중 제안이 있는 마주는 제외.
  - 후보 말(마주별): 그 마주 소유, breederId === 그 마주, 올해 2세, status in_training, record.starts === 0. 후보가 없는 마주는 제외.
  - 진행 중 제안 수가 `PRIVATE_OFFER_MAX_ACTIVE`(3) 미만일 때만, 이번 주 최대 `PRIVATE_OFFER_PER_RUN`(2)건: 마주를 가중(1 + max(0, 관계) + 명성/2) 비복원 추첨 → 그 마주 후보 중 균등 추첨 1두.
  - 가격 = round(valueLot(state, horse, 'breeze_up', year, createRng(`${initialSeed}:privval:${horse.id}`)) × `PRIVATE_OFFER_PREMIUM`(1.25) × (1 − min(max(관계, 0), 60) / 400) / 500) × 500, 최소 `PRIVATE_OFFER_MIN_PRICE`(5,000).
  - id = `po_${year}_${nextPrivateOfferNo}`(번호 증가), 만료 = 생성 주 + `PRIVATE_OFFER_VALID_WEEKS`(4)(연도 넘김 없음 — 9주 + 4 = 13주). 이벤트 offered.
  - rng: `createRng(`${initialSeed}:private:${year}:${week}`)` — ctx.rng 미사용.
### 플레이어 API(입력 state 불변)
- `acceptPrivateOffer(state, offerId): PlayerResult<'offer_not_found' | 'offer_invalid' | 'insufficient_funds'>` — 말·소유·미출주 확인(아니면 제안 삭제 없이 'offer_invalid' — 다음 주 시스템이 정리), `canSpendDiscretionary(price)`. 성공: 플레이어 `recordMoney(…, 'private_sale', −price, horseId)`, 판매 마주 `+price`, 소유 이전(마주 horseIds·horse.ownerId, 조교사는 유지), 판매 마주 관계 +`OWNER_RELATION_PRIVATE_PURCHASE`(8), 제안 삭제, 이벤트 accepted, 이벤트 `horse_sold`(from 마주, to 플레이어).
- `declinePrivateOffer(state, offerId): PlayerResult<'offer_not_found'>` — 제안 삭제, 이벤트 declined(관계 변화 없음).
- `privateOfferView(state)`: 화면용 { offerId, horseId, horseName, sexAgeKo 대신 sex·age, sireId, ownerId, ownerName, price, estimate: estimateRange(가치), expiresYear, expiresWeek }[] — **가치 원값은 넣지 않는다**(estimate 범위만).
- `inspectOfferHorse(state, offerId, trainerId)`: inspectLot 과 같은 규칙(eligibleInspectors 에 있어야 함, skill = trainerAssessorSkill, rng `inspect-po:${offerId}:${trainerId}`), 오류 'offer_not_found' | 'not_eligible'.

## 수용 기준
1. 자격·후보 조건 단위 테스트(관계 19.99 제외·20 포함, 명성 35 경로, small 마주 제외, 출주한 말 제외, 진행 중 제안 있는 마주 제외).
2. 시드 20261011 상태에서 테스트로 한 마주 관계를 30 으로 올리고 3주차 진행 → 그 마주 제안 1건 이상, 가격 = 규칙식, 13주 지나면 expired 이벤트·삭제.
3. 수락: 장부 private_sale 양쪽, 소유 이전, 관계 +8, 이벤트 accepted + horse_sold. 자금 부족·없는 제안·이미 출주한 말 각 오류.
4. 플레이어 말이 AI 마주 생산마로 우승 → 그 마주 관계 +2(G1 +5). 생산자가 상업 생산자·플레이어면 변화 없음.
5. 제안 없는 기본 진행(관계 0·명성 10)에서는 26주 레이스 결과가 이 티켓 전과 같다(시스템이 ctx.rng 를 안 쓰고 제안도 안 생김).
6. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음, 상수 config.

## 금지
src/engine/types 수정 금지. 화면 구현 금지(C7b). Codex 담당 파일(위 '병행') 수정 금지. git commit 금지.

## 테스트 명령
npx vitest run tests/engine/privateTrade.test.ts && npm test && npm run typecheck && npm run lint
