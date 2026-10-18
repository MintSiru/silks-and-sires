# AionUI 협업 킥스타트 (사용자 결정 2026-10-18)

역할:
- Claude Opus(클라우드 세션)가 총괄: 계획·명세(`docs/specs`)·공용 타입·검수·병합·보고.
- AionUI(사용자 PC)의 Codex·Antigravity 는 명세 한 장씩 구현한다. 결과는 git 브랜치로 주고받는다.

## 흐름
1. Opus 가 명세를 `claude/m0-m1-foundation` 에 커밋·푸시하고, 어느 에이전트에 줄지 알려 준다.
2. 사용자가 AionUI 에서 아래 프롬프트에 티켓 이름만 바꿔 넣는다.
3. 에이전트는 `agent/<이름>/<티켓>` 브랜치에 커밋·푸시한다.
4. 사용자가 이 세션에 "M8-R4 끝, 브랜치 agent/antigravity/M8-R4" 처럼 알려 준다.
5. Opus 가 브랜치를 받아 검수(테스트·타입체크·린트·직접 실행)한다. 승인하면 병합하고, 반려하면 고칠 항목 번호 목록을 돌려준다(그 목록을 그대로 다시 붙여 넣으면 된다).

## 준비 (한 번만)
- 사용자 PC 의 저장소 클론에서 `git fetch origin && git checkout claude/m0-m1-foundation && git pull`, 그리고 `npm install`.
- 루트의 `AGENTS.md`(Codex 가 자동으로 읽음)와 `GEMINI.md`(Gemini 계열이 읽음)에 작업 규칙이 있다. 둘은 같은 내용이다.
- Playwright 캡처가 필요한 티켓은 `npx playwright install chromium` 이 한 번 필요할 수 있다(클라우드 전용 경로 /opt/pw-browsers 는 PC 에 없다).

---

## 프롬프트 A — Codex (구현·리팩터링·엔진)

```
너는 Silks & Sires 저장소의 구현 담당이다. 총괄·검수는 다른 세션(Claude Opus)이 한다.
먼저 AGENTS.md 와 CLAUDE.md 를 읽고 규칙을 지켜라.

티켓: docs/specs/<티켓>.md  (같이 읽을 것: 명세 맨 위 '공통' 줄에 적힌 문서)

순서:
1. git fetch origin && git checkout -B agent/codex/<티켓> origin/claude/m0-m1-foundation
2. 명세를 끝까지 읽고, 허용 파일과 수용 기준을 목록으로 정리한 뒤 구현한다. 허용 파일 밖을 고쳐야 하면 멈추고 [질문]으로 남긴다.
3. AGENTS.md 3장의 검증을 직접 실행한다(전체 npm test 는 명세가 요구할 때만).
4. 고정 해시 테스트가 바뀌면 값을 고치지 말고 보고에 테스트 이름과 이유를 적는다.
5. 커밋(한국어 메시지, 모델 이름 금지) → git push -u origin agent/codex/<티켓>
6. AGENTS.md 4장 보고 양식으로 한국어 보고를 하고, 같은 내용을 docs/collab/reports/<티켓>-codex.md 로 커밋·푸시한다.
하지 말 것: claude/m0-m1-foundation 에 직접 커밋·병합·강제 푸시, 공용 타입(src/engine/types) 수정, 새 의존성, 실명(경마장·레이스·사람) 추가.
```

## 프롬프트 B — Antigravity (작문·문구·비전·화면 점검)

```
너는 Silks & Sires 저장소의 작문·화면 점검 담당이다. 총괄·검수는 다른 세션(Claude Opus)이 한다.
먼저 GEMINI.md 와 CLAUDE.md 를 읽고 규칙을 지켜라. 특히 실명 규칙: 국가명과 종마 이름만 실명, 경마장·레이스·사람·목장은 전부 가상.

티켓: docs/specs/<티켓>.md

순서:
1. git fetch origin && git checkout -B agent/antigravity/<티켓> origin/claude/m0-m1-foundation
2. 명세의 허용 파일만 고친다. 문구는 한국어, 경마 중계 톤의 짧은 문장. 과장·속어·실존 인물 이름 금지.
3. 검증: 명세의 테스트 명령 + npm run typecheck + npm run lint 를 직접 실행해 통과시킨다.
4. 커밋(한국어 메시지, 모델 이름 금지) → git push -u origin agent/antigravity/<티켓>
5. GEMINI.md 4장 보고 양식으로 한국어 보고, 같은 내용을 docs/collab/reports/<티켓>-antigravity.md 로 커밋·푸시.
하지 말 것: claude/m0-m1-foundation 에 직접 커밋, 엔진 로직(난수 소비 순서·규칙) 변경, 공용 타입 수정, 새 의존성.
```

## 프롬프트 C — Antigravity 화면 리뷰 (코드 수정 없음, 스크린숏 판독)

```
Silks & Sires 의 화면 스크린숏(첨부)을 보고 UI 리뷰를 해 줘. 코드는 고치지 마.
기준: 1440×900 한 화면에 핵심이 보이는가, 글자 잘림·겹침, 버튼처럼 보이는지, 색 대비, 한국어 문구 자연스러움, 처음 하는 플레이어가 다음에 뭘 할지 알 수 있는가.
출력: 화면별 [좋음]/[문제] 목록, 문제마다 심각도(상·중·하)와 고칠 방향 한 줄. 마지막에 우선순위 상위 5개.
실명(실제 경마장·레이스·인물)이 보이면 따로 표시해 줘.
```

## 첫 시범
- M8-R4 패독·코멘트 문구 다양화 → Antigravity(프롬프트 B, 티켓 이름 `M8-R4-paddock-text`).
- 잘 되면 이후 엔진·화면 티켓을 Codex(프롬프트 A)에도 나눠 준다. Opus 는 같은 파일을 만지는 티켓을 동시에 내보내지 않는다.
