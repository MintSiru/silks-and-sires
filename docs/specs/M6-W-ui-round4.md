# M6-W UI 4차 다듬기 (아르곤 3차 검토 반영)

근거: 아르곤 3차 검토(사용자 중개, 2026-10-17 — 스크린숏 c3050de 22장). 1~27 중 개선됨 22, 부분 개선 4(16 세일 판매 빈 칸, 17 목장 좌측 여백, 20 G1 우승 본문 중복, 24 혈통 칸 높이), 그대로 1(14 캘린더 ▸), 28 은 M6-T. 이번 티켓은 남은 항목 + 새 캡처(16~22)에서 드러난 문제. 담당 Haiku, W1~W6 병렬·작업 트리 분리.

## 공통 (M6-V 공통 절과 같음 — docs/specs/M6-V-ui-round3.md)
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>`(위임 메시지) 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 허용 파일만. src/engine·app.css·공용 타입·package.json 금지. 토큰 색만(새 색 코드 금지), 실명 금지, 새 의존성 금지, git commit 금지.
- 1440×900 첫 화면 세로 스크롤 없음, 목록은 완전한 행 단위로 끝남, 390px 가로 넘침 없음.
- **알림 통일(새 규칙)**: 화면 위·표 위에 끼어드는 인라인 알림(성공·실패, 예: '교배 담당이 제안을 다시 짰습니다', '공사를 시작했습니다')은 `useNotify()`(src/ui/shell/notify.ts — 이미 있음)로 토스트에 보낸다. 실패는 `notify(text, 'error')`. 대화상자 안 입력 검증 문구(입찰가 등)는 그대로. 지속 상태(공사 중·연말 정산 필요)는 알림이 아니라 상태 표시로 둔다.
- **한글 줄바꿈**: 새로 손대는 표의 머리글·이름 칸은 `white-space: nowrap`, 긴 문장 칸은 `word-break: keep-all`.
- 검증: `npx vitest run tests/ui --testTimeout=180000 --hookTimeout=180000`, typecheck, lint, build, `node tests/ui/ux2-shell.smoke.mjs` PASS, 바뀐 화면 1440×900 스크린숏(scratchpad) 눈 확인. `node tests/ui/capture-screens.mjs` 로 해당 번호 화면을 찍어 봐도 좋다(png 는 커밋 대상 아님 — 보고 뒤 원복).
- 보고: CLAUDE.md 보고 양식.

## W1 목장 공사 중 (19번)
허용: src/ui/farm/*, tests/ui/farmView.test.ts
1. 공사 중일 때 행마다 반복되는 2줄 비활성 사유 제거 → 비활성 버튼 라벨 '공사 중 대기'(사유는 title), 공사 상태는 '시설 공사' 카드 제목 오른쪽 한 줄 배지(시설·다음 단계·완료 예정 주)로 합침(기존 고정 배너와 중복이면 하나만).
2. '공사를 시작했습니다' 등 인라인 알림 → useNotify.
3. 시설·단계·다음 단계 비용·공사 열 nowrap(한 글자 줄바꿈 '언덕 코/스' 해소), 효과 칸만 줄바꿈 keep-all.
4. 공사 중에도 9개 시설 전부 첫 화면에 온전히(19번), 평상시(07번)도 그대로.

## W2 혈통 칸 높이 (13·20번)
허용: src/ui/breeding/PedigreeView.tsx, src/ui/breeding/pedigreeLayout.ts, src/ui/breeding/pedigree.css, tests/ui/ux5View.test.ts
1. 말단 대(3대 보기의 3대, 5대 보기의 5대) 모든 칸 — 이름 있든 빈 칸('—')이든 — 같은 고정 높이(3대 32px). 상위 칸은 자손 묶음 높이 합에 맞춰 경계선이 일직선.
2. 5대 보기: 말단 칸 17px·11px/16px·padding 0 6px 로 압축해 32칸 전체(부측·모측)가 말 상세 창 안에서 스크롤 없이 보이게(1440×900). 상위 대 글자도 이에 맞춰 축소 가능.

## W3 세일 판매 탭 (18번)
허용: src/ui/sales/*, tests/ui/salesView.test.ts, tests/ui/salesLayoutView.test.ts, tests/ui/sellProposalView.test.ts
1. 판매 탭 배치: 위에 '판매 제안'·'개인 거래 제안' 두 칸 나란히(내용 높이, align-items: start), 아래 '내 말 출품' 전체 폭(grid-column 1 / -1), 세일 선택 드롭다운 min-width 260px — 세일 이름 잘림 해소.
2. 세일 화면의 인라인 성공·실패 알림 → useNotify(로트 상세 대화상자 안 입찰 검증 문구는 그대로).

## W4 기록 연대기 (16·17번)
허용: src/ui/legacy/*, tests/ui/legacyView.test.ts
1. 종류 배지와 본문 중복 제거를 모든 종류에 적용: 'G1 우승' 배지 행 본문 'Corvane Haven — 구름들 컵'(끝의 'G1 우승' 제거) 등. CHRONICLE_BODY_KO 전 종류 점검, 테스트로 배지 문구가 본문에 다시 나오지 않음을 확인.
2. '전체 N건 보기'로 펼친 뒤 연도 머리줄 오른쪽에 '주요 5건만 보기' 버튼(다시 접기). 연대기 목록 영역은 내부 스크롤(max-height calc(100dvh - 300px) 안팎, padding-bottom 12px)로 첫 화면에 행 단위로 끝나게.

## W5 확인창 상태 색·번식 알림 (21·22번)
허용: src/ui/breeding/MatingPlanPanel.tsx, src/ui/breeding/matingPlan.css, src/ui/breeding/BreedingScreen.tsx, src/ui/breeding/HorseNamingPanel.tsx, src/ui/shell/SettingsModal.tsx, src/ui/shell/shell.css, tests/ui/matingPlanView.test.ts, tests/ui/shellSettings.test.ts
1. '모두 승인' 확인창: 주의 배합 수가 1 이상이면 주의 색(--warn-fg)·600, 위험이면 --danger-fg.
2. 설정 새 게임 확인 단계: '새 게임으로 이동' 버튼을 위험 버튼(토큰 --danger 계열 배경·테두리, 흰/밝은 글자), '취소'는 기본.
3. 번식 화면(교배 제안·이름 짓기 등) 인라인 성공·실패 알림 → useNotify.

## W6 작은 것 모음 (14번·11·12번·02번)
허용: src/ui/season/calendar.css, src/ui/season/SeasonScreen.tsx, src/ui/horse/RacePlanPanel.tsx, src/ui/horse/racePlan.css, src/ui/horse/HorseDetail.tsx, src/ui/horse/horse.css, src/ui/home/HomeScreen.tsx, src/ui/home/home.css, tests/ui/calendarView.test.ts, tests/ui/ux5View.test.ts, tests/ui/m6u4HorseView.test.ts, tests/ui/homeView.test.ts
1. 캘린더 주 행 펼침 표시: 글리프 '▸' 대신 눈에 띄는 크기(시각 높이 약 12~14px — CSS 삼각형 또는 인라인 SVG chevron, currentColor·--text-muted)로, 하단 '이번 주·다음 주 개최' 의 ▸ 와 같은 크기 이상.
2. 출주 계획 조교사 메모·메모 칸 word-break: keep-all(한 글자 줄바꿈 '간/격' 해소).
3. 전적 '자세히': 상금 열과 간격(padding-left 20px), 작은 아웃라인 버튼 모양(밑줄 없는 .btn 보조 크기).
4. 홈 '최근 결과' 카드 아래 세계 주요 결과(G1) 줄은 점선 구분선+'세계 주요 결과' 라벨로 내 결과와 구분.
5. 경주 화면·출주 계획 패널의 인라인 성공·실패 알림 → useNotify.
