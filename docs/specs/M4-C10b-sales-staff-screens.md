# M4-C10b 세일 탭·인맥 탭 화면

담당: haiku-coder · 선행: M4-C10a(1308baa), C6(53a733a) · 확인: Opus 가 브라우저로 직접 확인

## 목적
플레이어가 세일에 참가(일정 보기 → 카탈로그 → 로트 검사·입찰 → 실시간 보기 → 결과)하고, 내 말을 출품하고, 조교사·기수와 전속 계약을 맺을 수 있는 화면.
사용자 피드백(2026-10-12 플레이테스트): "UI 가 불친절" — 각 화면 맨 위에 한 줄 안내, 버튼에 결과 문구(성공·실패 사유)를 바로 보인다.

## 사용할 것 (수정 금지)
- 뷰: `saleCalendarRows`·`catalogueRows`·`lotDetailView`·`liveAuctionView`·`consignableRows`(ui/sales/salesView.ts), `staffRows`·`reputationView`(ui/staff/staffView.ts)
- 엔진: `eligibleInspectors`·`inspectLot`(sales/inspection.ts), `getSalesData`
- GameApi: `consignToSale`·`withdrawConsignment`·`setMaxBid`·`clearMaxBid`·`signRetainer`·`terminateRetainer`, 기존 `advance`
- 컴포넌트: `HorseCard`(ui/breeding/HorseCard.tsx — 검사 결과 표시에 재사용), text.ts 문구 함수들

## 생성·수정할 파일
1. `src/ui/sales/SalesScreen.tsx`(신규) — 탭 '세일'. 세 구역:
   a. **세일 일정**: saleCalendarRows 표(이름·종류·월·상태·로트 수·내 입찰·내 위탁). 행을 누르면 그 세일 카탈로그를 연다(발표 전이면 '발표 전 — N주에 발표' 안내).
   b. **카탈로그**: 북 선택·부 이름 검색·'내 입찰만' 필터, catalogueRows 표(로트 번호·북·말·성별 나이·부·판매자·추정가·내 입찰·결과). 행을 누르면 로트 상세.
   c. **로트 상세**(오른쪽 또는 아래 패널): lotDetailView(부·모·판매자·판매일·추정가·내 위탁이면 유보가), **조교사 검사**(eligibleInspectors 선택 상자 → '검사' 버튼 → inspectLot 결과를 HorseCard 로 표시; 동행 가능한 조교사가 없으면 '전속 조교사나 관계 10 이상 조교사가 있어야 검사할 수 있습니다' 안내), **입찰**(상한가 입력·'상한 설정'·'입찰 취소', 실패 시 bidErrorKo), **실시간 보기**(판매 주에만 활성: liveAuctionView 단계를 0.4초 간격으로 하나씩 보여 주고, 진행 중 '+ 한 호가 올리기' 를 누르면 상한을 (현재 가격 + 호가 단위)로 올려 setMaxBid 후 다시 계산해 이어 보여 준다. 마지막에 결과 문구. 실제 결과는 다음 주 진행 때 확정된다는 안내 한 줄).
   d. **내 말 출품**: consignableRows 표 — 말마다 출품 가능한 세일 선택·유보가 입력(빈칸 = 유보 없음)·'출품'/'출품 취소'.
2. `src/ui/staff/StaffScreen.tsx`(신규) — 탭 '인맥'. 맨 위 명성(reputationView). 조교사/기수 전환 버튼, '아는 사람만' 체크(기본 켬), staffRows 표(이름·나라·나이·관계 등급·전속 상태·제의 조건). 행마다 '전속 제의'(quote ok 면 계약금 표시하고 확인 대화 후 signRetainer) / '계약 해지'(위약금 안내 확인 후 terminateRetainer). 결과 문구 표시.
3. `src/ui/App.tsx` — 탭 '세일'·'인맥' 추가(경제 탭 옆). 파산이면 세일 탭의 입찰·출품 버튼 비활성.
4. `src/ui/app.css` — 필요한 최소 스타일(표 가로 스크롤, 상세 패널, 실시간 보기 강조). 기존 클래스 재사용 우선.
5. (허용) `src/ui/game/text.ts` 에 화면 문구 함수 추가(파일 끝).

## 수용 기준
1. `npm test && npm run typecheck && npm run lint && npm run build` 통과.
2. 화면이 평가값·AI 상한을 어디에도 표시하지 않는다(코드 검색: valuation·aiBids 를 .tsx 에서 참조하지 않음).
3. 다음 흐름이 코드상 가능함을 보고(Opus 가 브라우저로 확인): 새 게임 → 진행해서 첫 1세마 세일 발표 → 카탈로그 → 로트 상세 → (조교사 관계가 없으면 안내) → 상한 설정 → 판매 주까지 진행 → 결과에 낙찰/유찰 표시, 내 말 목록에 낙찰 말.
4. 실시간 보기 타이머는 컴포넌트 해제 시 정리한다(setInterval/clearInterval 또는 setTimeout 정리).
5. 인맥 탭: 전속 제의 성공 시 표 맨 위로 오고 전속 상태 표시, 해지 시 사라짐.

## 금지
src/engine 수정 금지. salesView.ts·staffView.ts 수정 금지(필요하면 보고). 새 npm 의존성 금지. git commit 금지.

## 테스트 명령
npm test && npm run typecheck && npm run lint && npm run build
