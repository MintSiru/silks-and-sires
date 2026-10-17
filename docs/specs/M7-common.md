# M7 공통 규칙 (모든 M7 명세에 적용)

- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 허용 파일만 수정. 공용 타입(src/engine/types) 수정 금지 — 필요하면 [질문]. 새 의존성·git commit 금지.
- 엔진: Math.random·Date.now·DOM 금지, 공용 rng 소비 순서는 명세가 허락한 곳만 바꾼다. 매직 넘버는 src/engine/config 상수(근거 주석).
- 원칙 1(실명): 사람·경마장·레이스·목장 이름 새로 만들지 말 것(기존 데이터 사용). UI 문구는 한국어.
- UI: 토큰 색(app.css 의 CSS 변수)만, 알림은 useNotify(src/ui/shell/notify.ts). 1440×900 첫 화면 세로 스크롤 최소, 390px 가로 넘침 없음.
- 검증: `npm test -- --testTimeout=180000 --hookTimeout=180000`, `npm run typecheck`, `npm run lint`, `npm run build`. 화면 티켓은 `node tests/ui/ux2-shell.smoke.mjs` PASS 도.
- 고정 해시 테스트가 바뀌면 값은 고치지 말고 [명세와 다르게 한 점]에 파일·이유를 적는다(갱신은 Opus).
- 보고: CLAUDE.md 보고 양식.
