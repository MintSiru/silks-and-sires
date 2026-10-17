# M6-X UI 5차 마감 (아르곤 5차 검토 반영)

근거: 아르곤 5차 검토(사용자 중개, 2026-10-17 — 스크린숏 f7c2b98 24장). 담당 Haiku, X1~X5 병렬(파일 겹침 없음).

## 공통 (M6-W 공통 절과 같음 — docs/specs/M6-W-ui-round4.md)
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 허용 파일만. src/engine·app.css·공용 타입·package.json 금지. 토큰 색만, 실명 금지, 새 의존성 금지, git commit 금지.
- 1440×900 첫 화면 세로 스크롤 없음·목록은 완전한 행 단위로 끝남·390px 가로 넘침 없음. 알림은 useNotify.
- 검증: `npx vitest run tests/ui --testTimeout=180000 --hookTimeout=180000`, typecheck, lint, build, `node tests/ui/ux2-shell.smoke.mjs` PASS, `node tests/ui/capture-screens.mjs` 로 해당 번호 화면을 찍어 눈 확인(png 는 보고 뒤 `git checkout -- docs/feedback/screens` 로 원복).

## X1 홈 첫 시즌 안내 넘침 (02·23·24번)
허용: src/ui/tutorial/*, src/ui/home/home.css, src/ui/home/HomeScreen.tsx(카드 자리만), tests/ui/tutorialView.test.ts
1. '펼쳐 읽기' 풀이는 레이아웃을 밀지 않는 팝오버로: 카드 아래에 겹쳐 뜨는 상자(position absolute, z-index, 토큰 배경·테두리·그림자), 내용 전부 보이게(안쪽 스크롤·잘림 없음 — 지금 72px 스크롤 때문에 마장 문장이 끊겨 보였다), ESC·바깥 클릭·'접기'로 닫힘.
2. 카드가 보일 때(수준 질문·단계 목록 모두) 1440×900 홈 첫 화면 세로 스크롤 없음, 맨 아래 카드와 우하단 토스트(약 48px) 사이 여백 확보. 필요하면 카드 높이 축소(단계 설명 1~2줄 말줄임 + title), 홈 그리드 간격·패딩 축소.

## X2 설정 모달 높이 (15·22번)
허용: src/ui/shell/SettingsModal.tsx, src/ui/shell/shell.css, src/ui/shell/saveSlotsView.ts, tests/ui/shellSettings.test.ts, tests/ui/saveSlots.test.ts
1. 모달 본문 압축: 섹션 간격 12px, 저장 칸 표 셀 4px 8px, 출주 계획 필드셋 패딩 8px 12px, 설명 문구 12px/18px — 1440×900 에서 가능하면 모달 전체가 스크롤 없이 들어오게(모달 내부 스크롤은 허용하되 하단 padding-bottom 16px 로 마지막 버튼이 잘리지 않게).
2. '새 게임' 확인 단계가 열리면 그 영역을 scrollIntoView({ block: 'nearest' })로 보이게.

## X3 5대 혈통 (13·20번)
허용: src/ui/breeding/PedigreeView.tsx, src/ui/breeding/pedigreeLayout.ts, src/ui/breeding/pedigree.css, tests/ui/ux5View.test.ts
1. 5대 보기: 1~5대를 하나의 격자로 — grid-template-rows: repeat(32, 16px), row-gap 0(구분은 border-bottom 1px), 각 대 칸은 grid-row span 16/8/4/2/1 — 대 사이 가로 경계선 일치. 말단 글자 10.5px/15px, padding 0 6px. 32칸 전체가 1440×900 말 상세 창 안에서 보이게(창 세로 스크롤 없이 — 위 해설·범례 줄을 한 줄로 합쳐 높이 확보).
2. 3대 보기도 같은 격자 방식(행 32px)으로 일관.
3. 상단 요약 줄의 '니크'·'근친'을 `<Term id="nick">`·`<Term id="inbreeding">`(src/ui/common/Term.tsx — 수정 금지)로.

## X4 연대기·세일 (17·18·06번)
허용: src/ui/legacy/*, src/ui/sales/*, tests/ui/legacyView.test.ts, tests/ui/salesView.test.ts, tests/ui/salesLayoutView.test.ts
1. 연대기 펼친 목록 스크롤 영역 max-height 를 행 높이의 정수 배로(행 높이를 CSS 변수로 고정, 예 44px × 9) — 마지막 보이는 행이 온전히 끝나게.
2. 세일 '내 말 출품': 미출품 행은 [출품] 버튼만(비활성 '출품 취소'와 '아직 출품하지 않음' 문구 제거), 출품됨 행만 [출품 취소], 카탈로그 등록 뒤에는 취소 불가 사유만.
3. 후원 진행 막대: 트랙 배경을 눈에 띄는 토큰(--surface-raised 등)으로 채우고 높이 8px·둥근 끝, 오른쪽에 진행률 '0%' 보조 숫자.

## X5 OR 표기·용어·전적·기록 배지 (03·04·12·14번)
허용: src/ui/stable/StableScreen.tsx, src/ui/stable/stable.css, src/ui/breeding/MatingPlanPanel.tsx(표 머리글만), src/ui/horse/HorseDetail.tsx(전적·기록 탭만), src/ui/horse/horseDetailView.ts, src/ui/horse/horse.css, tests/ui/m6u4HorseView.test.ts, tests/ui/matingPlanView.test.ts(머리글 기대값만), tests/ui/glossary.test.ts
1. 마구간 OR 칸 '95 (상위권)'(괄호 — 말 상세와 같은 형식, orValueKo 재사용 가능하면 재사용).
2. 교배 제안 표 머리글 '종부료'에 `<Term id="stud_fee">`. 이에 따라 matingPlanView 테스트의 '>종부료</th>' 기대값을 새 마크업에 맞게.
3. 전적: 등급 없는 자동 편성 레이스의 '[—]' 배지는 숨김(또는 '일반'), 상금 0 은 모두 '€0'(— 대신).
4. 말 상세 기록 탭: 비경주 행(첫 출주 등)도 배지를 날짜 바로 오른쪽 배지 열에 — 경주 행과 같은 열 정렬, '주요 순간' 배지가 행 오른쪽 끝에 떨어지지 않게.
