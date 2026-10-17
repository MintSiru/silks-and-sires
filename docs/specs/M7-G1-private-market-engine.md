# M7-G1 상시 구매 엔진: 개인 거래 시장 + 구매 문의 (사용자 결정 2026-10-17)

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 C13 — 첫 세일이 4월이라 1~3월에 살 수 있는 말이 없고 자금이 논다.
기존 기능: src/engine/sales/privateTrade.ts(M4-C7 내부거래 — 관계 좋은 오너브리더의 미출주 2세). 이것을 넓힌다.
타입: `PrivateOffer.source?: 'relation' | 'market' | 'enquiry'`(Opus 추가). 다른 공용 타입 변경 금지.

## 허용 파일
src/engine/sales/privateTrade.ts, src/engine/sales/privateMarket.ts(신규), src/engine/config/sales.ts(상수 추가만), src/engine/state/systems.ts(시스템 등록이 필요하면 한 줄), tests/engine/privateMarket.test.ts(신규), tests/engine/privateTrade*.test.ts

## 내용
1. 개인 거래 시장(source 'market'): 4주마다(PRIVATE_MARKET_INTERVAL_WEEKS=4) AI 마주·생산자 말 중 최대 PRIVATE_MARKET_SIZE(=6)두를 매물로 낸다.
   - 후보: 현역마(3~6세, OR 있음, 앞으로 4주 안에 G1 선언 없음, 올해 G1 우승 없음) 4두 이내 + 번식 암말(4~12세) 2두 이내. 플레이어 말·종마 제외.
   - 가격: valuation.ts valueLot(현역은 'horses_in_training', 암말은 'breeding_stock') × 할증 PRIVATE_MARKET_PREMIUM 범위(1.15~1.35, 말마다 결정적).
   - 만료: PRIVATE_MARKET_OFFER_WEEKS(=8)주. 그 사이 말이 팔리거나 출주 선언·은퇴·사망하면 무효로 정리.
   - 난수: 기존 내부거래와 같은 방식 — `${initialSeed}:market:${year}:${week}` 스트림, ctx.rng 미사용(공용 rng 흐름 불변).
2. 구매 문의(source 'enquiry'): `export function enquirePrivatePurchase(state, horseId): PlayerResult<EnquiryError>`
   - 대상: AI 소유 현역마(3세 이상) 또는 번식 암말. 거절(오류 반환, 상태 불변): 올해 G1 우승마, OR ≥ PRIVATE_ENQUIRY_REFUSE_OR(=115), 이번 주에 이미 문의한 말, 같은 주 문의 PRIVATE_ENQUIRY_PER_WEEK(=3)회 초과.
   - 수락하면 호가 offer(source 'enquiry', 가격 = valueLot × PRIVATE_ENQUIRY_PREMIUM 1.3~1.5 결정적, 만료 2주)를 privateOffers 에 넣는다. 문의 기록은 상태에 남겨야 하면 기존 필드로 표현(offer 자체가 기록) — 새 필드가 필요하면 [질문].
3. 구매: 기존 acceptPrivateOffer 가 source 와 무관하게 처리하도록(현역마는 원래 조교사 유지, 장부 종류는 기존 내부거래와 같게, 자금 검사 canSpendDiscretionary 그대로). 현역마를 사면 그 말의 출주 계획은 다음 주 조교사가 새로 짠다.
4. privateOfferView 에 source·말 종류(현역/번식 암말/2세)·OR·최근 성적 요약을 더한다(화면용, 추정 범위만 — 원값 노출 금지).

## 수용 기준
- 4주째에 market 제안이 1~6건 생기고 대상 조건을 지킨다(테스트).
- market 제안 생성 전후 state.rng 가 같다(공용 rng 불변, 테스트).
- enquire: 올해 G1 우승마는 거절, 일반 현역마는 offer 생성, 같은 주 4번째 문의는 거절(테스트).
- 수락하면 소유주가 플레이어, 자금 차감·장부 기록, 다른 제안에서 사라짐(테스트).
- 결정성. 고정 해시가 바뀌면 이유 보고(시장은 플레이어가 수락하지 않으면 세계를 바꾸지 않아야 하므로 해시 불변이 기대값).
