# M7-C1 연말 판매가 성적 반영 + 미승리마 종마 금지 (사용자 결정 2026-10-17)

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 A2 — 11전 0승 4세 수말의 연말 '국내 판매'가 €2,200,000(= 예상 종부료 €11,000 × STALLION_SALE_FEE_MULT). 미승리마도 '종마' 선택 가능.
사용자 결정: '승수·블랙타입 반영 + 미승리 종마 금지'.

## 허용 파일
src/engine/stud/yearEnd.ts, src/engine/stud/trade.ts, src/engine/stud/value.ts, src/engine/stud/stand.ts(canStandAtStud 가 있으면), src/engine/config/stud.ts, src/ui/yearEnd/yearEndView.ts, tests/engine/*yearEnd*.test.ts, tests/engine/*trade*.test.ts, tests/engine/studValue*.test.ts, tests/ui/yearEnd*.test.ts

## 내용
1. 플레이어 현역 수말의 '종마'(stud)·'국내/해외 판매'(sell_domestic/sell_overseas, 종마 후보로 파는 것) 선택은 통산 승수 ≥ STUD_MIN_WINS(=1)일 때만 허용. 미승리마는 현역 속행·거세·은퇴(그리고 기존 세일 위탁 경로)만.
   canStandAtStud 가 AI 은퇴·종마 편입에도 쓰이면 AI 동작은 바꾸지 말 것 — 플레이어 경로(yearEndCandidates·submitYearEnd 검증·applyStallionSale)에만 적용. 코드로 확인해 보고.
2. 종마 후보 판매가에 성적 배율: 최고 성적 기준 STALLION_SALE_RECORD_MULT = { g1Win: 1.0, groupWin: 0.7, blackType: 0.45, winner: 0.2 }.
   - g1Win: G1 우승 / groupWin: G2·G3 우승 / blackType: 리스티드 우승 또는 그룹·리스티드 1~3착 / winner: 그 밖의 1승 이상.
   - 이미 종마인 말(status 'stud')의 판매가는 그대로(성적 배율 적용 안 함).
   - 판단에 쓸 성적은 horse.record(groupWins 등)와 결과 기록 중 이미 있는 필드로. 필요한 값이 없으면 [질문].
3. 연말 정산 화면(yearEndView)의 판매가 표시가 같은 값을 쓰는지 확인(같은 함수 재사용).

## 수용 기준
- 미승리 4세 수말: allowed 에 stud·sell_domestic·sell_overseas 없음(테스트), submitYearEnd 로 그 선택을 내면 choice_not_allowed.
- 1승(블랙타입 없음) 수말 판매가 = 기존 값 × 0.2(반올림 규칙 그대로), G1 우승마 = 기존 값(테스트).
- AI 종마 편입·은퇴 결과 불변(관련 결정성 테스트 통과, 고정 해시가 바뀌면 이유 보고).
