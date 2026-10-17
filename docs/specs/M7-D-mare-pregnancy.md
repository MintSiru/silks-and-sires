# M7-D 임신 상태·번식 암말 표

공통: docs/specs/M7-common.md. 근거: 플레이 테스트 C11 — 수태 여부·출산 예정이 어디에도 안 보이고, 번식 암말 표가 현역마 열(컨디션·최근 5전·OR·조교사)을 그대로 쓴다. 같은 암말 등급이 번식 화면 D·마구간 E 로 다르다. 망아지 컨디션 '주의' 이유 없음.
엔진 데이터: state.mares[horseId](types/horse.ts Mare — coveredBy, coveredWeek, pregnant, dueWeek, foals, bookedFor).

## 허용 파일
src/ui/stable/StableScreen.tsx, src/ui/stable/stableView.ts, src/ui/stable/stable.css, src/ui/horse/HorseDetail.tsx('임신/교배'·'산자 목록' 탭만), src/ui/horse/horseDetailView.ts, src/ui/horse/horse.css, tests/ui/stable*.test.ts, tests/ui/*HorseView*.test.ts·tests/ui/horseDetail*.test.ts

## 내용
1. 마구간 '번식 암말' 탭 열: 이름(등급 배지), 나이, 번식 상태, 출산 예정, 교배 종마/다음 계획, 최근 산자(이름·나이·성적 한 줄), 산자 블랙타입 수. 현역마용 열(컨디션·최근 5전·OR·조교사)은 이 탭에서 뺀다.
   번식 상태 문구: '임신 중'(pregnant) / '교배 완료 · 수태 확인 대기'(coveredBy 있고 아직 판정 전) / '공태'(빈 상태) / '예약: <종마>'(bookedFor). 출산 예정은 dueWeek → 'YYYY년 M월 N주'(기존 날짜 표기 함수).
2. 말 상세 '임신/교배' 탭: 위 번식 상태·출산 예정·이번 시즌 교배 종마·예약(다음 시즌)·지난 3시즌 교배 이력(있으면). '번식 화면에서 배합하기' 링크는 유지.
3. 등급 불일치 확인: 번식 화면과 마구간의 암말 종합 등급이 같은 함수(assessForPlayer 의 같은 평가자)를 쓰는지 코드로 확인. 다르면 마구간 쪽을 번식 화면과 같게(엔진 수정 금지 — 안 되면 [질문]).
4. 육성마 탭: 컨디션 '주의' 배지에 이유 한 줄(title 과 화면 문구 — 예 '이유기 스트레스', '성장기 피로' 등 컨디션 필드에서 실제 원인).

## 수용 기준
- 임신 중 암말 행에 '임신 중'·출산 예정 날짜(테스트, 픽스처로).
- 번식 암말 탭에 컨디션·최근 5전·OR 열이 없다(테스트).
- 말 상세 '임신/교배' 탭에 출산 예정이 나온다(테스트).
- 1440×900 마구간 번식 암말 탭 가로 스크롤 없음(스모크 또는 캡처로 눈 확인 — 보고에 적기).
