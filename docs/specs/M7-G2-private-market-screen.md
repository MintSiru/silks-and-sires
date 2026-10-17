# M7-G2 상시 구매 화면 (사용자 결정 2026-10-17)

공통: docs/specs/M7-common.md. 선행: M7-G1(privateMarket 엔진·enquirePrivatePurchase·privateOfferView 확장) 병합 뒤.

## 허용 파일
src/ui/sales/*(개인 거래 탭), src/ui/horse/HorseDetail.tsx(AI 소유 말의 '구매 문의' 버튼 한 곳만), src/ui/horse/horseDetailView.ts(문의 가능 여부 함수만), src/ui/game/useGame.ts(enquire 연결 함수만), src/ui/game/text.ts(오류 문구만), tests/ui/privateMarket*.test.ts(신규)

## 내용
1. 세일 화면에 '개인 거래' 탭(구매·판매 옆): 제안 목록 — 출처 배지(시장/문의/관계), 말(이름·나이·성별·종류), OR·최근 5전(현역), 산자 성적(암말), 추정 범위, 호가, 만료, [상세] [검사](기존 조교사 검사) [구매] [거절]. 비어 있으면 '다음 매물은 N주에 나옵니다'.
2. AI 소유 현역마·번식 암말 말 상세에 '구매 문의' 버튼 → 결과 토스트(호가 생성 또는 거절 사유 한국어). 생성되면 개인 거래 탭에 나온다.
3. 구매 확인창: 호가·현재 자금·구매 뒤 자금, 확인/취소.

## 수용 기준
- 목록 행 구성·빈 상태 문구(테스트).
- 문의 버튼은 AI 소유 대상 말에만(테스트).
- Playwright 로 구매 1건 흐름 확인, 캡처 2장 scratchpad/g2/.
