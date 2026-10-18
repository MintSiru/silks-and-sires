# M8-R1 레이스 기록 확장 사용 (이름·등급·내 말 여부·상금·G1 승수)

공통: docs/specs/M7-common.md(M8 에도 같은 규칙). 근거: docs/feedback/2026-10-17-playtest-2.md 남은 것 6·7.
공용 타입(Opus 추가, 바꾸지 말 것): RaceResult.name?·grade?·raceClass?·kind?, RunnerResult.isPlayer?: true·prize?: Money, CareerRecord.g1Wins?.

## 허용 파일
src/engine/season/apply.ts(결과 기록 시 채우기), src/engine/season/raceday.ts·src/engine/season/summary.ts(결과 만드는 곳에서 필요하면), src/engine/stud/trade.ts(saleRecordMult 의 G1 구분), src/ui/horse/horseDetailView.ts(전적 이름·상금), src/ui/yearEnd/yearReviewView.ts(내 말 판정), 관련 tests

## 내용
1. 결과를 기록할 때(apply 경로) RaceResult 에 name·grade·raceClass·kind 를, 각 RunnerResult 에 플레이어 소유면 isPlayer: true, 상금 받았으면 prize 를 채운다(0·false 는 키 생략 — 저장 크기). 우승 시 레이스 등급이 G1 이면 horse.record.g1Wins += 1(없으면 0 에서).
2. 전적 탭: 레이스 이름·등급/클래스·상금은 결과 기록 값을 먼저 쓰고, 없으면(옛 저장본) 지금 방식(보관 목록·장부).
3. 한 해 돌아보기: 내 말 판정은 isPlayer 를 먼저 쓰고, 없으면 지금 방식.
4. 연말 판매 배율(M7-C1): g1Wins > 0 이면 g1Win(1.0), groupWins > g1Wins 이면 groupWin(0.7) — 지금의 '그룹 우승 전체 1.0' 임시 규칙을 바꾼다.
5. 저장 크기: 30년 저장 증가를 측정해 보고(tests/verify/saveSize.test.ts SAVE_SIZE_OUT 방식 또는 짧은 측정). 1% 넘게 늘면 [질문].

## 수용 기준
- 플레이어 말이 뛴 레이스 결과에 name·kind·isPlayer·prize 가 채워진다(테스트), AI 만 뛴 레이스 runners 에는 isPlayer 키가 없다.
- G1 우승 시 g1Wins 1 증가(테스트), G2 우승 1승 말의 판매 배율 0.7(테스트).
- 보관 목록 밖 자동 편성 레이스 전적에도 실제 이름(테스트).
- 고정 해시가 바뀌면 이유 보고(값 갱신은 Opus). 전체 npm test 금지 — 관련 파일만.
