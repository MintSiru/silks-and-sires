# M8-R6 무입력 장기 빚 줄이기 (번식 암말 정리)

공통: AGENTS.md / docs/specs/M7-common.md. 근거: docs/reports/M7-G1-30year.md — 무입력 30년에서 2044~2053 빚 최대 약 €55만. 자가 생산 번식 암말 5~6두의 목장 유지비(연 €6~10만)와 조교료가 상금보다 크다.

## 허용 파일
src/engine/sales/autoSell.ts(번식 암말 집단·할당), src/engine/config/autoSell.ts(상수), tests/engine/autoSell.test.ts, 측정은 scratchpad 또는 tests/verify(환경 변수 게이트)

## 내용
1. 판매 담당의 번식 암말 할당을 지금(집단 − 목장 수용 두수)에서: 지난 1년 플레이어 수지가 적자면 '남길 두수' = AUTO_SELL_KEEP_MARES_DEFICIT(초기 4, 측정으로 조정), 빚이면 AUTO_SELL_KEEP_MARES_IN_DEBT(초기 3). 남길 말은 번식 수준(mareQuality)·산자 성적 높은 순, 나머지 중 하위부터 번식마 세일 판매 제안. 우수마 보존 규칙은 그대로 우선.
2. 측정: 무입력 30년 G1(시드 20261011, 보통) — M4·M5 판정 유지 + 빚 최대값·빚 연수 보고, 플레이어 연말 현역 해마다 ≥1 유지. 목표: 빚 최대 €20만 이하 또는 빚 연수 절반 이하.
3. 수지 판정은 장부 연 요약(economy.yearSummaries)으로.

## 수용 기준
- 적자 해에 번식 암말 6두 → 판매 제안이 하위 2두(테스트), 흑자면 지금 규칙(테스트).
- 30년 측정 보고(전·후 표). 고정 해시 변경은 보고.
