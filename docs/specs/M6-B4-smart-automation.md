# M6-B4 자동 조교·판매를 똑똑하게 (사용자 결정 2026-10-17)

근거: docs/reports/M6-B3-fixed-costs.md — 보통 난이도 무입력에서 고정비를 0으로 해도 빚. 주원인은 자동 조교(M6-0 auto_training)가 수준 낮은 2세까지 모두 조교사에게 보내 조교료(연 13만~15만, 현역 3~4두)가 상금보다 큰 것. 사용자 결정: 조교료 규칙은 그대로, 자동 조교는 일정 수준 이상만, 나머지는 판매 담당이 제안. 담당 haiku-coder(측정 포함).

## 공통
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 엔진 규칙 판단은 플레이어가 볼 수 있는 정보만(assessForPlayer 의 종합 등급 등 — src/engine/horse/playerView.ts, 판매 담당 autoSell.ts 와 같은 원칙). 난수 쓰지 않음, 공용 rng 소비 순서 불변. 공용 타입 수정 금지(필요하면 [질문]). 새 의존성·git commit 금지. 상수는 src/engine/config(근거 주석).
- 검증: `npm test`(부하 때 `--testTimeout=120000 --hookTimeout=180000`), typecheck, lint, build. 고정 해시가 바뀌면 이유 보고(갱신은 Opus).
- 보고: CLAUDE.md 보고 양식 + docs/reports/M6-B4-smart-automation.md.

## 범위
허용: src/engine/season/autoTraining.ts, src/engine/sales/autoSell.ts, src/engine/config/autoSell.ts(또는 config/season.ts 에 자동 조교 상수 — 한 곳), tests/engine/autoTraining.test.ts, tests/engine/autoSell.test.ts, src/ui/home/homeView.ts·src/ui/shell/settingsView.ts(설명 문구만 — 필요하면), docs/reports/M6-B4-smart-automation.md
1. 자동 조교 기준: 2세 후보 중 플레이어용 종합 등급이 AUTO_TRAINING_MIN_GRADE(초기 'C' — 측정으로 조정) 이상만 자동으로 보낸다. 그리고 현역(조교 중) 두수가 AUTO_SELL_KEEP_RACERS(빚이면 _IN_DEBT) 이상이면 더 보내지 않는다. 기준 미달·자리 없음 2세는 남겨 둔다(플레이어가 직접 보낼 수 있음).
2. 판매 담당: 자동 조교에서 빠진 2세(기준 미달)를 다음 위탁 가능 세일(브리즈업 → 없으면 현역마 세일)에 판매 제안으로 낸다(기존 '빼지 않으면 위탁' 흐름 그대로). 우수마 보존 규칙(AUTO_SELL_PROTECT_*)은 그대로 우선.
3. 홈 브리핑·설정 '2세 자동 조교 보내기' 설명에 기준이 보이게 한 줄(예: 'C 등급 이상 2세만, 현역 6두까지').
4. 측정(무입력, 시드 20261011, 캐주얼): 보통 10년 빚 없음이 목표(못 맞추면 가장 가까운 값과 원인), 쉬움·어려움 10년 자금 추이, 현역 두수(시작 3년 뒤 해마다 1두 이상 유지 — M6-0b 기준), 판매 두수·판매 수입. AUTO_TRAINING_MIN_GRADE 는 C → B 순으로 시도해 목표를 맞추는 가장 낮은 등급.
5. 확정 값으로 30년 G1 1회(`G1_OUT=<파일> npx vitest run tests/verify/g1ThirtyYears.test.ts --testTimeout=7200000`) — M4 1·2·3·4·6, M5 (a)~(e) 유지, 30년차 주당 중앙값 ≤1,000ms, 플레이어 현역 해마다 ≥1(2029 이후).
6. 테스트: 기준 미달 2세는 자동 조교 안 함, 현역 상한에서 멈춤, 기준 미달 2세 판매 제안 생성, 결정성(같은 입력 같은 결과).
