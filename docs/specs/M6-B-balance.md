# M6-B 밸런스 최종 점검

근거: docs/m6-plan.md M6-B(시드 3개 × 30년, 능동 플레이 봇, 난이도별 시작 1~3년 체감). 담당 haiku-tester, B1·B2 병렬. 게임 규칙·밸런스 상수는 바꾸지 않는다 — 측정·보고만(바꿀 거리는 [질문]으로).

## 공통
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- src 수정 금지(테스트·보고서만), 새 의존성 금지, git commit 금지. 측정 테스트는 환경 변수가 있을 때만 돌게(없으면 skip — 기본 npm test 시간 늘리지 않음).
- 긴 실행은 백그라운드(한 작업 2시간 제한 안), 원자료 JSON 은 scratchpad(/tmp/claude-0/-home-user-silks-and-sires/6246f0fa-fd99-5d13-ac89-fa1a963daca9/scratchpad/)에.
- 보고: CLAUDE.md 보고 양식 + 보고서 파일.

## B1 시드 3개 × 30년 무입력 (haiku-tester)
허용: docs/reports/M6-B-seeds.md(신규)
1. `G1_SEED=<시드> G1_OUT=<파일> npx vitest run tests/verify/g1ThirtyYears.test.ts --testTimeout=7200000` 로 시드 20261011·7·424242 세 번(동시에 둘 이상 돌리지 말 것 — 부하로 시간 측정이 왜곡된다. 순서대로).
2. 보고서: 시드별 M4 판정 1~6·M5 판정 (a)~(e) 통과 여부 표, 플레이어 지표(현역 두수 최소·평균, 빚 최대·30년차, 그룹 우승 합계, 자가 생산 번식 암말, 명성 바닥), 주당 시간(1년차·10년차·30년차 중앙값, 비 30/1). 시드 간 편차가 큰 지표와 어느 판정이든 실패한 시드는 원인 후보(연도별 데이터 근거) 정리.

## B2 능동 플레이 봇·난이도별 시작 (haiku-tester)
허용: tests/verify/activeBot.test.ts(신규), docs/reports/M6-B-activeBot.md(신규)
1. `BOT_OUT=<파일>` 있을 때만 도는 테스트. 공개 엔진 API(useGame 이 쓰는 것과 같은 엔진 함수 — 세일 입찰·출주 계획 승인·교배 예약·판매 위탁·연말 정산 제출)로 간단한 규칙 봇: 매년 1세 세일에서 예산(자금의 20%) 안 최저가 상위 평가 1~2두 입찰, 출주 계획 제안은 모두 승인, 교배 제안 승인(빚이면 4~5티어만 — 엔진 규칙 그대로), 판매 제안 그대로, 연말 정산 기본값.
2. 시나리오: (a) 봇 10년 × 난이도 easy/normal/hard (시드 20261011), (b) 무입력 3년 × 난이도 3종 — 시작 1~3년 체감 지표: 자금 추이(분기별), 첫 승 주, 첫 그룹 입상 연도, 현역 두수, 빚 발생 시점, 파산·음수 주.
3. 보고서: 난이도별 표와 무입력 대비 봇의 차이, '난이도 차이가 체감되는가'(자금·첫 승·빚 시점이 easy < normal < hard 순으로 갈리는지) 판정, 이상 징후(봇이 빚에 빠짐, 너무 쉽게 G1 등) 목록.
