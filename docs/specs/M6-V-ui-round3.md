# M6-V UI 3차 다듬기 (아스트라·아르곤 재검토 반영)

근거: docs/feedback/2026-10-17-ui-review-2.md(번호 = 그 문서의 합친 목록 번호). 담당: Haiku(haiku-coder), 티켓 V1~V8 병렬, 작업 트리 분리.

## 공통 (모든 티켓)
- **작업 트리 준비**: 작업 트리가 옛 커밋일 수 있다. 시작 전 `git status` 가 깨끗하면 `git checkout --detach <기준 커밋>`(위임 메시지에 적힌 커밋) 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- **허용 파일만** 수정(티켓별 목록). 그 밖이 필요하면 [질문]. src/engine·src/ui/app.css·공용 타입·package.json 수정 금지. 화면 CSS 는 각 화면 폴더의 .css(이미 있는 파일)에.
- 원칙: 1440×900 각 메뉴 첫 화면 세로 스크롤 없음, **첫 화면의 목록은 완전한 행 단위로 끝남(반쪽 잘림 없음)** — 넘치면 목록 내부 스크롤 + `padding-bottom: 12px`. 상태 색 3가지(app.css 토큰 --good/--warn/--danger, 등급 --grade-*), 새 색 코드 금지(토큰 사용). 390px 가로 넘침 없음.
- 실명 금지(CLAUDE.md 원칙 1), 새 의존성 금지, git commit 금지, 엔진 문자열(메모 원문 등) 변경 금지.
- 검증: `npx vitest run tests/ui --testTimeout=180000 --hookTimeout=180000`(부하 때 기본 타임아웃은 흔들림), `npm run typecheck`, `npm run lint`, `npm run build`, `node tests/ui/ux2-shell.smoke.mjs`(PASS). 바뀐 화면은 Playwright 로 1440×900 스크린숏을 scratchpad 에 찍어 눈으로 확인.
- 보고: CLAUDE.md 보고 양식.

## V1 홈·설정 (항목 3·4·5·25)
허용: src/ui/home/*, src/ui/shell/*, tests/ui/homeView.test.ts, tests/ui/shellSettings.test.ts, tests/ui/ux2View.test.ts·ux3View.test.ts(홈 기대값만)
1. 브리핑 카드 제목 옆 숫자 제거(할 일 수는 상단 '이번 주 할 일' 배지에만).
2. '최근 이벤트 N건' → 제목 '주요 사건', 보조 문구 '최근 5건까지'.
3. '출주 예정' 카드: 등급 배지(GradeBadge — 클래스 N 회색 포함)·거리 천 단위 쉼표(마구간 다음 출주와 같은 포맷 함수 재사용).
4. 최근 결과 카드: 3건이 모두 온전히 보이게(보조 줄 날짜·우승마를 첫 줄 오른쪽 끝 12px 로 올리거나 행 패딩 축소).
5. 설정 모달: 판매 체크박스 아래 붙은 교배 자동 예약 설명을 별도 '교배 예약' 항목(제목+설명)으로 분리, 항목 간격 16px. 부담중량 라벨 바로 옆에 드롭다운(gap 16px).

## V2 경주 캘린더 (12·13·14)
허용: src/ui/season/SeasonScreen.tsx(캘린더 부분), src/ui/season/calendarView.ts, src/ui/season/calendar.css, tests/ui/calendarView.test.ts
1. 접힌 주 행은 **한 줄**(주차 · 대표 경주 등급 배지+이름 · '외 N' · 내 말 칩), 높이 40~44px → 12주가 첫 화면에 다 보이거나 거의 다 보이게.
2. ▸/▾ 14px 보조색, 행 호버 배경(토큰 --surface-raised 등).
3. 하단 섹션 제목 '이번 주·다음 주 개최'(출주 신청 문구 빼기), 말 이름은 출주 계획 탭 연결 유지, 신청·취소 버튼은 보조 버튼 크기.

## V3 목장·경영 (17·18)
허용: src/ui/farm/*, src/ui/economy/*, tests/ui/farmView.test.ts, tests/ui/economyView.test.ts
1. 경영 주별 장부 헤더 한 줄: `grid-template-columns: 20px minmax(0,1fr) auto auto` 로 ▸ · 날짜 · 건수 · 합계. 
2. 손익 표·장부가 첫 화면에서 완전한 행으로 끝나게(셀 패딩 6px 10px, KPI 타일 패딩 축소, 필요하면 내부 스크롤).
3. 목장 단계 칸 ■ 좋음 색·□ 흐린 색, 14px·letter-spacing 3px. 시설 표 td vertical-align: middle 통일. 왼쪽 열 아래 빈 공간 줄이기(좌우 높이 맞춤 — 목장 매물 접기를 열 높이에 맞춰 늘리는 식).

## V4 마구간·말 상세(개요·전적·기록) (6·7·8·21·22·24의 기록 배지)
허용: src/ui/stable/*, src/ui/horse/HorseDetail.tsx, src/ui/horse/horseDetailView.ts, src/ui/horse/horse.css, tests/ui/m6u4HorseView.test.ts, tests/ui/ux2View.test.ts(말 상세 기대값만)
1. 마구간 탭+검색을 감싸는 헤더 전체에 하단선(탭 아래 선이 검색창 앞에서 끊기지 않게).
2. 빈 '확인' 열: 모든 행에 내용이 없으면 열 숨김.
3. 조교사 글자 13px·보조색(기준선 맞춤).
4. 개요: 세부 등급 5개(체격·후구·다리·걸음·기질)를 가로 한 줄 등급 칩(GradeBadge)으로, 코멘트 불릿은 그 아래.
5. 전적: 행은 2줄(1줄 날짜·착순 배지·경주(등급 배지+이름)·상금, 2줄 조건 보조), 기수·중량·OR·착차·다시보기는 행 펼침(`<details>` 또는 행 클릭) — 5전이 첫 화면에 온전히.
6. 기록 탭 경주 항목에도 등급 배지.
(혈통 탭은 V5, RacePlanPanel 은 V5 — 건드리지 않음)

## V5 출주 계획·혈통 (23·24)
허용: src/ui/horse/RacePlanPanel.tsx, src/ui/horse/racePlan.css, src/ui/season/racePlanView.ts, src/ui/breeding/PedigreeView.tsx, src/ui/breeding/pedigreeLayout.ts, src/ui/breeding/pedigree.css, tests/ui/ux5View.test.ts, tests/ui/racePlanView.test.ts
1. 레이스 칸: 등급 배지와 레이스명을 `grid-template-columns: 72px minmax(0,1fr); align-items: start`, 조건은 둘째 줄.
2. 메모 판단 하나: 거리 힌트 밖이면 화면 주 문구는 '거리 연장 도전 — 적성 상한보다 Nm 김'(단축이면 '거리 단축 — 적성 하한보다 Nm 짧음')만, 엔진 메모 원문은 '조교사 메모' 펼침 안으로. 힌트 안이면 원문 그대로.
3. 표 가로선은 tr 단위(border-collapse)로 '조작' 열까지 일직선.
4. 혈통 3대: 말단 칸 최소 28px·이름 14/20, 상위 칸은 자손 묶음 세로 가운데, 빈 칸도 같은 높이. 혈통 안 링크 밑줄은 호버 때만.

## V6 번식·기록 (2·9·10·11·19·20)
허용: src/ui/breeding/MatingPlanPanel.tsx, src/ui/breeding/matingPlanView.ts, src/ui/breeding/matingPlan.css, src/ui/legacy/*, tests/ui/matingPlanView.test.ts, tests/ui/legacyView.test.ts
1. 교배 제안 표 td vertical-align: top, '근거' 펼침은 암말 셀 안 하위 블록(margin-top 6px) — 행 하단선 일직선.
2. 종합 판단: 주의 요소가 있으면 '주의 — 근친 검토 필요' 같은 주의 문구를 첫 배지로, 긍정 요소는 그 뒤 1개까지(나머지는 근거).
3. 상단 조작 줄: 버튼·드롭다운·입력 높이 36px, align-items: flex-end.
4. 기록(연대기): 링크 밑줄이 글자 폭에서 끝나게(width: fit-content / 인라인 요소). 종류 배지가 있으면 본문에서 같은 종류 단어 반복 제거(본문은 대상·경주·결과). '최신순' 은 목록 도구 줄에만(목적 문장에서 뺌).

## V7 세일·시작 화면 (15·16·26)
허용: src/ui/sales/*, src/ui/newGame/*, tests/ui/salesView.test.ts, tests/ui/salesLayoutView.test.ts, tests/ui/sellProposalView.test.ts, tests/ui/newGameView.test.ts, tests/ui/newGameScreen.test.ts
1. 발표 전 세일 버튼 '발표 일정 보기', 공개 뒤 '카탈로그 보기'.
2. 후원 진행 막대 트랙: 배경 --surface-raised·테두리 --border·높이 8px·폭 160px·둥근 끝. 오른쪽 카탈로그 칸은 발표 전 안내만 있을 때 내용 높이만(height: fit-content) — 로트 목록이 있을 땐 기존 채움 유지.
3. 시작 화면 '추천 조건' 안내: 버튼처럼 보이는 테두리 대신 왼쪽 3px 강조선 콜아웃(토큰 색), 경제 모드는 '캐주얼(고급 설정)' 처럼 위치 표기. 오른쪽 열 아래 빈 공간에 고른 조건의 규칙 요약 3~4줄(경제 모드 한 줄 설명 재사용 등).

## V8 스크린숏 자료 (27)
허용: tests/ui/capture-screens.mjs, docs/feedback/ui-review-request.md(파일 목록 안내 줄만)
1. 기존 01~15 순서·이름 유지. 추가: `16-기록-연대기-예시`(다건 저장본 — tests/ui/ux2-shell.smoke.mjs 의 legacy-fixture 주입 코드를 가져와 연대기 90여 건·라이벌·부계/모계를 넣고 불러오기 → 기록 → 연대기, 기본 접힘), `17-기록-연대기-전체`('전체 N건 보기' 펼친 상태), `18-세일-판매`(판매 탭), `19-목장-공사-중`(시설 공사 시작 뒤 — 자금이 되는 첫 시설), `20-말상세-혈통-5대`('5대 보기'), `21-번식-모두-승인-확인`(승인 대기 제안이 있으면 '모두 승인' 눌러 확인창, 없으면 건너뜀), `22-메뉴-새-게임-확인`(설정 → 새 게임 → 확인 단계).
2. 상태가 바뀌는 촬영(공사 시작·legacy 주입)은 01~15 촬영 뒤에. 실패하는 단계는 건너뛰고 콘솔에 사유를 남긴다(스크립트 전체는 끝까지).
3. 이 티켓은 `npm run build && node tests/ui/capture-screens.mjs` 를 작업 트리에서 실행해 22장 안팎이 나오는지 확인하고, **docs/feedback/screens 의 png 는 커밋 대상이 아니므로 작업 트리에서 만든 png 는 보고 뒤 지워도 된다**(Opus 가 본 트리에서 다시 찍는다).
