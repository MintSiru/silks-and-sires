# M6-B3 밸런스 조정 (사용자 결정 2026-10-17)

근거: docs/reports/M6-B-seeds.md·M6-B-activeBot.md, 사용자 결정 — (1) 중반 빚은 고정비 완화, (2) 어려움 시작 현역 1두(이미 반영 59afeb2), (3) 세일 추정 범위를 시장에 맞춤. 담당 haiku-coder, B3a·B3b 병렬(파일 겹침 없음).

## 공통
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 바꾸는 것은 허용 파일의 밸런스 상수(근거 주석 필수 — 측정값·날짜)와 그 테스트 기대값뿐. 로직 변경·새 의존성·git commit 금지. 고정 해시가 바뀌면 이유를 보고(값 갱신은 Opus).
- 측정 테스트는 기존 것을 환경 변수로 돌리거나(tests/verify/activeBot.test.ts — BOT_OUT, tests/verify/g1ThirtyYears.test.ts — G1_OUT/G1_SEED/G1_YEARS) 보고서에 명령을 적는다. 긴 실행은 백그라운드, 원자료는 scratchpad.
- 검증: `npm test`(부하 때 `--testTimeout=120000 --hookTimeout=180000`), typecheck, lint, build.
- 보고: CLAUDE.md 보고 양식 + 보고서.

## B3a 세일 추정 범위 (표시 전용)
허용: src/engine/config/sales.ts(SALE_RANGE_LOW·SALE_RANGE_HIGH 만), tests/verify/saleEstimate.test.ts(신규, SALE_EST_OUT 있을 때만), docs/reports/M6-B3-sale-estimate.md(신규), 이 상수를 기대하는 기존 테스트
1. 측정: 시드 20261011·7 각 5년 무입력 진행에서 팔린 로트의 (낙찰가 ÷ lot.valuation) 비를 세일 종류별(1세·브리즈업·현역·번식마)로 모아 분위수(10·25·50·75·90%) 기록. 바이백·패찰은 제외(별도 개수만).
2. SALE_RANGE_LOW = 전체 15% 분위, SALE_RANGE_HIGH = 85% 분위(0.05 단위 반올림) — 낙찰가의 약 70% 가 범위 안에 들도록. 종류별 차이가 크면(중앙값이 0.2 이상 차이) 보고서에 적고 [질문](종류별 배율은 이번에 하지 않음).
3. 이 상수는 화면 추정(estimateRange)에만 쓰인다 — 게임 결과·해시가 바뀌지 않아야 한다(확인해 보고).

## B3b 고정비 완화
허용: src/engine/config/farm.ts(FACILITY_UPKEEP_PER_LEVEL_YEAR), src/engine/config/economy.ts(FARM_UPKEEP·FARM_SCALE_FREE_HEADS 등 목장 유지비 상수), 이 상수를 기대하는 기존 테스트, docs/reports/M6-B3-fixed-costs.md(신규)
1. 먼저 이 상수들이 플레이어에게만 적용되는지 AI 마주에도 적용되는지 코드로 확인해 보고서에 적는다(AI 경제에 닿으면 M4 판정 영향).
2. 목표(무입력, 시드 20261011, 캐주얼): 보통 난이도 10년 동안 빚 없음(자금 ≥ 0), 쉬움 10년차 자금 ≥ 시작의 80%, 어려움은 3년 안 빚 없음(그 뒤는 허용). 같은 능동 봇(activeBot) 보통 10년도 빚 없음이면 좋음(필수 아님).
3. 줄이는 순서: 시설 유지비(현재 단계당 연 €8,000) → 목장 유지비(두당 주간). 목표를 맞추는 가장 작은 조정(예: 시설 유지비 절반부터 시도). 조정 전·후 표(연말 자금 10년, 빚 시점, 장부 종류별 연 지출)를 보고서에.
4. 확정 값으로 30년 G1(`G1_OUT=<파일> npx vitest run tests/verify/g1ThirtyYears.test.ts --testTimeout=7200000`) 1회 — M4 판정 1·2·3·4·6, M5 (a)~(e) 유지 확인(판정 5 는 Opus 결정으로 '30년차 주당 중앙값 ≤1,000ms'로 본다).
