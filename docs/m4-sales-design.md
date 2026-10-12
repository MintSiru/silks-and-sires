# M4-C 세일 설계 (Opus, 2026-10-12)

## 1. 흐름
1. **카탈로그 발표**: 세일 시작 주 − `SALE_CATALOGUE_LEAD_WEEKS`(4) 주에 그 해 카탈로그를 만든다(sales 시스템).
   - 로트 수 = 북 `lotsTarget` × `SALE_LOT_SCALE`(초기 0.1, 반올림, 최소 1). 실제 규모 그대로면 세계 말 수가 감당되지 않는다.
   - 로트 말은 그때 만든다(종류별 아래 2장). 판매자(vendor)는 상업 생산자 또는 마주.
   - 플레이어 위탁 출품(consignment)은 발표 전까지 신청한 것만 들어간다.
2. **사전 검사**: 발표 뒤 플레이어는 로트를 보고, 맡긴 조교사와 '검사'를 한다(C6 — 조교사 상마안이 코멘트 정확도).
3. **판매 주**: 그 주에 열리는 북의 로트를 전부 경매 처리한다(sales 시스템, advanceWeek 안). 플레이어 상한가(maxBid)는 미리 넣어 두거나, 판매 주에 '실시간 보기'로 경매를 따라가며 올린다(실시간 = 상한가를 단계적으로 올리는 것과 같다 — AI 상한은 카탈로그 때 정해져 있으므로 결과가 같다).
4. **결과**: 낙찰가 = 영국식 경매(두 번째로 높은 상한 + 호가 단위, 유보가 이상). 돈은 recordMoney(구매자 sale_purchase·구매자 수수료 sale_commission / 판매자 sale_proceeds·판매 수수료 sale_commission).
5. **낙찰 후**: AI 마주가 산 어린 말은 세계에 남아 그 마주의 말이 된다. 2세가 되는 해 연간 교체(population, 주 1)에서 '세일 출신'으로 현역 편입되고, 그만큼 신규 생성(spawn)을 줄인다(나라별 두수 유지). 유보가 미달(바이백)·유찰 로트의 말은 상업 생산자 것이면 세계에서 뺀다(해외 개인 판매로 본다), 플레이어 것이면 돌려받는다.

## 2. 종류별 로트
| 종류 | 로트 말 | 판매자 | AI 낙찰 후 |
|---|---|---|---|
| yearling(1세) | 새로 생성(1세, 부 = 그 나라 계류 실명 종마 중 북 maxSireTier 이내, 어미 가상) | 같은 나라 상업 생산자(규모 가중) + 오너브리더 일부 + 플레이어 위탁 | AI 마주 소유 yearling → 다음 해 주 1 현역 편입 |
| foal(이유마, 0세) | 새로 생성(0세 weanling) | 상업 생산자·플레이어 | AI 소유 weanling → 2세 해에 현역 편입 |
| breeze_up(2세 봄) | 새로 생성(2세) | 상업 생산자(핀후커) | 즉시 현역 편입(조교사 배정) |
| horses_in_training | 기존 AI 현역마(나라·OR 하위~중위, 마주당 상한) + 플레이어 위탁 | 마주 | 마주 변경(조교사는 구매자 쪽에서 다시 배정) |
| breeding_stock | 새로 생성(번식 암말, 4~12세, 은퇴마) + 플레이어 위탁 | 상업 생산자·플레이어 | AI 번식 암말은 개별 모의하지 않으므로 세계에서 뺀다 |

미국 세일: 부 = 미국 계류 종마. AI 구매자는 유럽 마주(외국 원정 구매) + 미국 마주. 미국 마주가 사면 세계에서 뺀다(미국 경주는 모의하지 않음). 유럽 마주가 산 미국산은 그 마주 나라의 현역마로 친다(연간 교체의 나라 판정은 countryOfBirth 가 유럽 5개국이 아니면 마주 나라로 — C4 에서 population 수정).

## 3. 가치 평가(C3) — `valuation`
`value = 기준 × 혈통 × 체형 × 유행 × 시세`, 정수 반올림, 하한 `SALE_VALUE_FLOOR`.
- 기준: 종류별 — yearling·foal·breeze_up 은 부의 종부료 × `SALE_KIND_FEE_MULT[kind]`(초기 yearling 2.0, foal 1.3, breeze_up 2.2), horses_in_training 은 OR 기반 표(OR 60 → €8k … OR 100 → €250k), breeding_stock 은 (최근 종부한 종마 종부료·자신 성적·나이) 기반.
- 혈통: 부 sireStats(최근 3년 그룹 자마·상금 순위) 보정 ×0.8~1.5, 모계 blackTypeProduce 보정.
- 체형: 숨은 실제값(능력 잠재치 + 체형 지표)의 z 점수 → exp(z × `SALE_CONFORMATION_SD`). 시장은 실제값을 '대략' 본다: 시장 인식 오차 `SALE_MARKET_NOISE_SD` 를 섞는다(그래서 싸게 산 명마·비싸게 산 졸작이 생긴다).
- 유행: 부계(sireLine) 인기 순환(연도 기반 결정적 사인파 + 최근 G1 우승 부계 가산).
- 시세: 같은 종류 최근 2년 낙찰 중앙값 / 기준 중앙값(완만히, ×0.85~1.15).

## 4. AI 입찰(C4)
- 로트마다 관심 AI 마주 후보: 그 세일 나라 마주 + 외국 major(AE·US 포함). 관심 수 = 북·가치에 따라 2~8명.
- 각 관심 마주의 상한 = value × lognormal(0, `SALE_BID_SPREAD`) × 성향(commercial↑ 이면 가치 근처, prestige↑ 이면 혈통 좋은 로트에 높게) × 자금 제한(funds × `SALE_BUDGET_SHARE[tier]`, 올해 이미 쓴 돈 반영).
- 상한 상위 `SALE_AI_BIDS_STORED`(3)명만 로트에 저장(`aiBids`). 판매 주에 그 마주 자금이 모자라면 그 입찰은 빠진다.
- 상업 생산자 판매 로트의 유보가 = value × `SALE_RESERVE_SHARE`(0.6). 마주 판매·플레이어 위탁은 위탁자가 정한 유보가.

## 5. 플레이어(C5)
- `consignToSale(state, horseId, saleId, reserve)` — 발표 전, 종류에 맞는 말만.
- `setMaxBid(state, lotId, maxBid)` / `clearBid` — 발표 후 ~ 판매 주 처리 전. 자금 검사 canSpendDiscretionary(maxBid × (1 + 구매자 수수료)).
- `liveAuctionSteps(state, lotId)` — 화면 실시간 보기용: 호가 사다리(누가 언제 빠지는지)를 결정적으로 돌려준다.
- C8 혜택(사용자 결정): 최근 2년 세일 구매 총액 기준 등급 → 상위 북 사전 열람(발표 전 N주 미리), 구매 수수료 할인, 내 출품의 앞 북 배정.

## 6. 티켓 순서
C2a 타입(Opus) → C3 가치 평가(순수 함수) → C2 카탈로그 생성·위탁·sales 시스템 뼈대 → C4 AI 입찰·경매 처리·낙찰 후 처리·population 연동 → C5 플레이어 입찰 API → C6 조교사 검사 → C10 화면 → C8·C9.
