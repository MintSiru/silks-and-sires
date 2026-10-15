# M4-D4a2 판매·교배권·임대를 교배·북·재산정에 연결

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D4 · 짝 티켓: M4-D4a(다른 작업자가 config/stud.ts, stud/stand.ts, stud/trade.ts, stud/yearEnd.ts 수정 중 — 그 파일과 state/systems.ts 는 건드리지 말 것)

목적: 장기 임대 중인 종마는 북반구 시즌에 쓸 수 없게 하고, 국내 판매 때 남긴 교배권으로 내 암말을 무료 교배하게 하며, 국내로 판 종마의 자마가 계속 세계에 들어오게 한다. 환불은 실제로 낸 종부료만 돌려준다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- `Stallion.leasedAwayUntil?: number | null` — 값이 있으면 그 시즌 전(season < leasedAwayUntil)에는 북반구에서 교배하지 않는다.
- `StudState.nominations: NominationRight[]`(`{ stallionId; perSeason; season; used }` — season 이 예약 시즌과 다르면 used 를 0 으로 본다), `StudState.sales: StallionSaleRecord[]`(mode 'domestic' 이 국내 판매).
- `Mare.bookedFor?: { stallionId; season; feePaid?: Money } | null`, `Mare.coveredFee?: Money | null` — 실제로 낸 종부료. 없으면(옛 저장본·AI) 종마의 현재 fee 로 본다.

## 수정할 파일 (5개 + 테스트)
1. `src/engine/breeding/season.ts`
   - bookCovering: (a) `leasedAwayUntil` 이 있고 season < leasedAwayUntil 이면 `'stallion_not_available'`. (b) 자기 종마가 아니고 ownerId === state.playerOwnerId 이고 그 종마의 NominationRight 가 있으며 그 시즌 남은 수(perSeason − (right.season === season ? used : 0)) > 0 이면 종부료 0(자금 검사 생략), 복제본의 권리를 season = season, used = (같은 시즌이면 used + 1, 아니면 1) 로 갱신. 이벤트 fee 0.
   - 교배·예약을 기록할 때 실제 낸 금액을 남긴다: 바로 교배면 `coveredFee = fee`, 사전 예약이면 `bookedFor.feePaid = fee`. processPrebookings 에서 예약이 교배로 바뀔 때 `coveredFee = bookedFor.feePaid ?? null`.
   - 시즌 끝 미배정 예약 환불: `bookedFor.feePaid ?? stallion.fee` 를 돌려주고, 0 이면 장부에 쓰지 않는다. 교배권으로 예약했던 것이면 그 시즌 used 를 1 줄인다(0 미만 금지).
   - coveredBy 를 비우는 곳에서 coveredFee 도 null 로.
2. `src/engine/stud/mortality.ts` — refundStudFee 가 금액 인자를 받아 `bookedFor.feePaid ?? stallion.fee`, `coveredFee ?? stallion.fee` 로 환불하고 0 이면 기록하지 않는다. coveredBy·bookedFor 를 지울 때 coveredFee 도 null. 나머지 동작(난수 스트림·판정 순서)은 그대로.
3. `src/engine/stud/books.ts`
   - AI 수요 누적: leasedAwayUntil 이 있고 예약 시즌 < leasedAwayUntil 이면 그 종마는 이번 시즌 누적을 하지 않는다(rollBookingSeason 만 하고 aiBooked·aiDemand 0 유지).
   - 정산(27주): 플레이어 소유 종마에 더해, StudState.sales 에서 mode 'domestic' 으로 판 종마(지금 status 'stud', ownerId null)도 시즌 기록을 남긴다 — 수태 판정은 같은 방식(같은 난수 스트림 이름), 단 income 은 0 으로 기록하고 장부·'stud_season_settled' 이벤트는 남기지 않는다. 그래야 3년 뒤 자마 편입(populationSystem 의 stud.seasons 사용)이 이어진다. 장기 임대로 북이 없는 시즌은 기록하지 않는다.
4. `src/engine/stud/market.ts` — createFeeReviewSystem: leasedAwayUntil 이 있고 (year + 1) < leasedAwayUntil 인 종마는 재산정하지 않는다(종부료·인기 유지, 이벤트 없음). 수태율 나이 감소는 그대로 적용.
5. `src/engine/horse/playerView.ts` — availableStallions: 그 예약 시즌에 leasedAwayUntil 로 쉬는 종마를 뺀다. 행에 교배권 정보가 필요하면 `nominationsLeft(state, stallionId, season): number` 를 breeding/season.ts 에 export 하고 화면은 다음 티켓에서 쓴다(이번엔 함수만).
6. `tests/engine/stallionTradeIntegration.test.ts`(신규)

## 수용 기준
1. 장기 임대(leasedAwayUntil = 2029) 종마는 2027·2028 시즌 예약이 'stallion_not_available', AI 수요·aiBooked 0, 재산정 없음(fee 유지). 2029 시즌부터 정상.
2. 교배권 perSeason 1: 같은 시즌 플레이어 암말 첫 예약은 fee 0·장부 기록 없음, 두 번째는 종부료를 낸다. 다음 시즌엔 다시 1개.
3. 교배권으로 예약한 뒤 시즌 끝 미배정 환불·종마 사망 환불이 0(장부 변화 없음). 돈 내고 예약한 것은 지금처럼 낸 금액을 돌려받는다(예약 뒤 종부료가 바뀌어도 낸 금액).
4. 국내로 판 종마(ownerId null)의 시즌 기록이 27주에 남고(income 0, 장부 변화 없음), 3년 뒤 populationSystem 이 그 종마 자마를 편입한다(테스트에서 시즌 기록을 넣고 확인해도 된다).
5. 기존 테스트 통과. 판매·임대·교배권이 없는 게임에서는 결과가 바뀌지 않는다: 시드 20261011 새 게임 52주 진행의 raceResults·종마 fee·장부가 변경 전과 같다(해시 비교).
6. 같은 시드 2회 동일. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 짝 티켓 파일(config/stud.ts, stud/stand.ts, stud/trade.ts, stud/yearEnd.ts)과 state/systems.ts 수정 금지 — 상수가 필요하면 파일 안 상수로 두지 말고 보고의 [질문]에 적는다(지금 명세에는 새 상수가 필요 없다). 공용 난수 소비 순서 변경 금지. git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/stallionTradeIntegration.test.ts && npm test && npm run typecheck && npm run lint
