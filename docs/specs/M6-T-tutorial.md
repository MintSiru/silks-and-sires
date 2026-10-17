# M6-T 처음 하는 플레이어 (튜토리얼·용어 도움말·결정 앞 정지)

근거: UI 검토 K(★) — 아르곤·아스트라 1~4차 공통(첫 시즌 체크리스트, 용어 점선 밑줄 + 한 줄 풀이, 'OR 95 (상위권)' 판정 병기, 진행 버튼이 중요 결정 앞에서 멈추고 요약). 담당 Haiku, T1~T3 병렬(파일 겹침 없음).

## 공용 타입 (Opus 가 추가 — 수정 금지)
- src/engine/types/farm.ts: `TutorialStepId = 'check_horse' | 'review_plans' | 'advance_week' | 'see_result' | 'review_matings'`, `TutorialProgress { dismissed: boolean; done: TutorialStepId[] }`, `GameSettings.tutorial?: TutorialProgress`(없으면 새 게임 — 옛 저장본도 체크리스트가 보일 수 있음).

## 공통
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 허용 파일만. src/engine(타입 포함)·app.css·package.json 수정 금지, 새 의존성·새 색 코드·실명 금지, git commit 금지. 화면 상수는 화면 파일(또는 해당 view.ts)에 근거 주석과 함께.
- 1440×900 각 메뉴 첫 화면 세로 스크롤 없음·390px 가로 넘침 없음 유지. 알림은 useNotify(src/ui/shell/notify.ts).
- 검증: `npx vitest run tests/ui --testTimeout=180000 --hookTimeout=180000`, typecheck, lint, build, `node tests/ui/ux2-shell.smoke.mjs` PASS, 바뀐 화면 1440×900 스크린숏(scratchpad) 눈 확인.
- 보고: CLAUDE.md 보고 양식.

## T1 용어 도움말·OR 판정
허용: src/ui/common/glossary.ts(신규), src/ui/common/Term.tsx(신규), src/ui/common/term.css(신규), src/ui/stable/StableScreen.tsx, src/ui/horse/HorseDetail.tsx(머리글 OR 부분만), src/ui/breeding/MatingPlanPanel.tsx(표 머리글만), tests/ui/glossary.test.ts(신규)
1. glossary.ts: 용어 → 한 줄 풀이(OR 공식 레이팅, 니크, 근친(인브리드), 블랙타입, 그룹(G1~G3), 리스티드, 핸디캡, 펄롱, 마장(Firm~Heavy), 게이트(draw), 종부료). 일반 경마 용어 설명만(실명 금지).
2. `orBandKo(or: number): string` — 110 이상 'G1급', 100 이상 '그룹급', 85 이상 '상위권', 70 이상 '중위권', 그 아래 '하위권'(경계 상수는 glossary.ts 에 근거 주석: 유럽 공식 레이팅 관례 — Opus 결정). 화면 표기 'OR 95 (상위권)'.
3. Term.tsx: `<Term id="or">OR</Term>` — 점선 밑줄(text-decoration: underline dotted, 토큰 색), title 과 aria-describedby(시각적으로 숨긴 풀이)로 한 줄 풀이, 키보드 포커스 가능(tabIndex 0), 포커스·호버 때 작은 말풍선(position absolute, 화면 밖으로 안 나가게 간단히).
4. 적용: 마구간 표 'OR' 머리글 Term + 값 옆 판정(작은 보조 글자), 말 상세 머리글 'OR 95 (상위권)' + Term, 교배 제안 표 머리글의 니크·근친 관련 용어(있는 곳만).
5. 테스트: orBandKo 경계값, glossary 항목 존재, Term 렌더(점선 클래스·풀이 텍스트·tabIndex).

## T2 첫 시즌 체크리스트
허용: src/ui/tutorial/tutorialView.ts(신규), src/ui/tutorial/TutorialCard.tsx(신규), src/ui/tutorial/tutorial.css(신규), src/ui/home/HomeScreen.tsx(카드 자리만), src/ui/game/useGame.ts(`setTutorial` 하나 추가), tests/ui/tutorialView.test.ts(신규)
1. tutorialView.ts(순수): 단계 목록(순서·제목·한 줄 설명·이동할 화면), `tutorialSteps(state)` — 저장된 done + 상태로 자동 판정 가능한 단계 보정(예: 시작 뒤 1주 이상 지났으면 advance_week, 내 말 경주 결과가 1건 이상이면 see_result는 '결과 화면을 연 적'이므로 자동 판정하지 않음 — 자동 판정은 확실한 것만), `showTutorial(state)`(dismissed 아니고 미완료 단계가 있을 때).
2. useGame `setTutorial(progress: TutorialProgress)`: 상태의 settings.tutorial 을 바꾼다(원본 불변, 저장되도록 기존 상태 갱신 경로 사용).
3. TutorialCard: 홈 맨 위(또는 브리핑 카드 자리 위) 작은 카드 '첫 시즌 안내 — 3/5' + 단계 체크리스트(완료 체크·이동 버튼 — 누르면 해당 화면 열고 그 단계 완료 표시), '닫기'(dismissed). 1440×900 홈 첫 화면 스크롤 없음 유지(필요하면 카드가 브리핑 카드를 대신하거나 접기).
4. 이동: 말 상태 확인 → 마구간, 출주 계획 검토 → 첫 현역마 말 상세 '출주 계획' 탭, 진행 → (설명만, 진행하면 자동 완료), 결과 확인 → 경주 '결과' 탭, 교배 제안 확인 → 번식. HomeScreen 의 onNavigate·말 상세 열기(HorseNavigation)를 재사용.
5. 테스트: 단계 판정, showTutorial, 진행률 문구, 카드 렌더.

## T3 중요 결정 앞 정지
허용: src/ui/shell/decisionStop.ts(신규), src/ui/App.tsx(진행 버튼 부분만), tests/ui/decisionStop.test.ts(신규)
1. decisionStop.ts(순수): `decisionStopReason(state): string | null` — 이번 주에 플레이어가 확인해야 할 결정이 있으면 한국어 사유: (a) 판매 제안이 이번 주 위탁 마감(자동 위탁 직전), (b) 교배 자동 예약 주(MATING_AUTO_BOOK_WEEK)이고 빼지 않은 제안이 있음, (c) 승인제(autoApproveRacePlans === false)에서 이번 주 출주 대상 계획이 승인 대기, (d) 연말 정산 대기. 엔진 상수·함수(upcoming 판매 제안·matingPlan·racePlans·yearEndPending)를 import 해 판정, 엔진 수정 금지.
2. App: '4주 진행'·'다음 내 출주까지' 는 `game.advanceUntil(s => decisionStopReason(s) !== null, weeks)` 로 — 멈추면 토스트 '중요 결정 앞에서 멈췄습니다: <사유>'. '1주 진행'은 그대로. 진행 전에 현재 주에 이미 사유가 있으면 첫 주는 진행(같은 사유로 영원히 막히지 않게 — 시작 주의 사유는 무시하고 다음 주부터 판정).
3. 테스트: 각 사유 판정, 사유 없을 때 null, 시작 주 무시 로직(작은 헬퍼로 분리해 테스트).

## 추가: 경험 수준별 튜토리얼 (사용자 결정 2026-10-17)
공용 타입(Opus): `TutorialLevel = 'racing_new' | 'game_new' | 'veteran'`, `TutorialProgress.level?`, 단계 `'learn_basics'`·`'automation_rules'` 추가.
- 카드가 처음 뜰 때(level 없음) '어떤 플레이어인가요?' 세 버튼: '경마를 몰라요' / '경마는 알지만 이런 게임은 처음이에요' / '이런 류의 게임을 해 봤어요'. 고르면 level 저장. 카드에 '수준 바꾸기'(작은 링크).
- 수준별 단계(T2 tutorialView 의 표 — 화면 상수):
  - racing_new: learn_basics(경마 기초 — 그룹·OR·마장·핸디캡·블랙타입을 한 줄씩, T1 glossary 재사용, 카드 안 펼침으로 읽으면 완료) → check_horse → review_plans → advance_week → see_result → review_matings. 각 단계 설명을 더 친절하게(경마 용어 풀이 포함).
  - game_new: check_horse → review_plans → advance_week → see_result → review_matings(지금 5단계, 게임 조작 위주 설명).
  - veteran: automation_rules(제안은 빼지 않으면 그대로 진행 — 출주 계획·교배·판매·2세 조교, 설정에서 바꿈, 진행이 중요 결정 앞에서 멈춤 — 읽으면 완료) → review_plans → review_matings. 짧은 설명.
- 용어 점선 도움말(T1)·결정 앞 정지(T3)는 모든 수준에 그대로.
