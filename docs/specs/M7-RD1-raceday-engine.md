# M7-RD1 레이스 당일 엔진 (Codex)

공통: docs/specs/M7-common.md(단 이 티켓은 Codex — 한 기능 단위, 세부 설계 판단 허용, 결과는 Opus 검수). 계획: docs/m7-plan.md.
사용자 결정(2026-10-17): 내 말 출주 주에 진행을 멈추고 출주표·패독·조교사/기수 코멘트·작전 지시를 보여 준 뒤 레이스를 자동 재생한다.
이 티켓은 엔진만(화면은 RD2). 공용 타입은 Opus 가 이미 추가했다 — 바꾸지 말 것:
- types/season.ts `Declaration.tactic?: RunningStyle`, `Meeting.seed?: number`
- types/raceDay.ts RaceCardRunner·RaceCard·PaddockNote·RaceDayComment·PaceOutlook·RaceDayBrief
- types/farm.ts `GameSettings.raceDayMode?: 'brief' | 'skip'`

## 문제
지금은 플레이어 신청(race_plans 시스템)·게이트 추첨·기수 배정·마장이 레이스를 실행하는 같은 진행 안에서 공용 rng 흐름(fork 는 부모를 소비)으로 정해진다.
그래서 진행 전에 '출주표'를 보여 주면 실제와 달라진다.

## 허용 파일
src/engine/season/meetings.ts, src/engine/season/raceday.ts, src/engine/season/field.ts, src/engine/season/system.ts, src/engine/season/racePlan.ts,
src/engine/season/raceDayBrief.ts(신규), src/engine/config/raceDay.ts(신규), src/engine/race/odds.ts(필요하면 순수 함수 추가만),
src/engine/state/*(저장 버전 마이그레이션이 필요하면), tests/engine/raceDay*.test.ts(신규), 기존 테스트의 기대값(고정 해시는 갱신하지 말고 보고)

## 내용
1. 개최 확정 시드: 개최를 만들 때(buildWeekMeetings) `meeting.seed` 를 정한다(그 시점 rng 에서 정수 하나 — 이미 쓰는 rng 흐름 안). 그리고
   - 마장: `createRng(`${seed}:going`)` 로 rollGoing(지금 rng.fork('going:'+id) 대신). 마장은 개최 주가 되면(플레이어가 볼 수 있는 시점) 정해진 값과 실제가 같다.
   - 게이트 추첨·기수 배정(buildRaceField): `createRng(`${seed}:field:${raceId}`)`. 레이스 결과 시드(race seed)는 지금처럼 공용 흐름(raceRng)에서 — 결과는 미리 알 수 없게.
   - seed 가 없는 개최(옛 저장본)는 지금 흐름 그대로.
2. 작전 지시: buildRaceField 가 플레이어 선언의 `tactic` 이 있으면 그 값을 EntryRequest.tactic 으로(없으면 horse.preferredStyle).
   `export function setRaceOrder(state, raceId, horseId, tactic): { ok: true; state } | { ok: false; error }` — 이번 주 개최에 선언된 플레이어 말만, 상태는 복제해 반환.
3. 진행 전 신청: `export function prepareRaceDay(state, data: RaceCalendarData): { state; events }` — race_plans 시스템이 이번 주에 할 플레이어 신청을
   지금 한다(같은 함수 재사용, 공용 rng 소비 없음). 이미 declared 면 그대로. race_plans 시스템이 나중에 같은 주를 돌 때 중복 신청하지 않음(지금도 declared 는 건너뜀 — 확인).
   `export function pendingRaceDays(state): { meetingId; raceId; horseId }[]` — 이번 주 개최에 플레이어 말이 선언된 레이스(prepareRaceDay 뒤에 부르는 용도).
4. 출주표: `export function raceDayBrief(state, raceId, horseId, data): RaceDayBrief` — 순수 함수(상태·공용 rng 불변).
   - card: buildRaceField 와 같은 스트림으로 게이트·기수·부담중량을 계산(실제 실행과 같은 값 — 테스트로 보장). morningOdds 는 odds.ts 로 `createRng(`${seed}:ml:${raceId}`)` 에서(실제 SP 와 다를 수 있음).
   - recentForm: 최근 5전 착순(결과 기록에서). or, preferredStyle, 소유주·조교사 이름.
   - paddock: 출주마마다 1줄. 컨디션(준비도·피로)·기질(personality)·나이·최근 휴양 기간에서 규칙으로 문장(예 '윤기가 흐르고 걸음이 가볍습니다', '땀을 많이 흘립니다', '오랜만이라 몸이 덜 풀린 듯'). 약간의 잡음은 `createRng(`${seed}:paddock:${horseId}`)`. tone 은 good/neutral/bad.
   - comments: 조교사 1~2줄(거리 적성·마장 선호·코스 특징·게이트·컨디션 중 해당하는 것), 기수 1~2줄(기수 능력 등급·작전 상성·게이트). 공개 정보와 플레이어용 평가(assessForPlayer)만 쓴다(숨은 능력치 직접 노출 금지).
   - paceOutlook: 출주마 preferredStyle 중 'front' 두수(≥3 fast, ≤1 slow, 그 외 even). recommendedTactic: 페이스·게이트·말 선호 작전으로 규칙 추천(fast 면 한 단계 뒤, slow 면 한 단계 앞, 선호 작전이 기준).
   - 문장 표·임계값은 config/raceDay.ts 와 raceDayBrief.ts 상단 표로. 실명 금지(사람 이름은 데이터의 가상 이름).
5. 저장: Meeting.seed·Declaration.tactic 은 선택 필드라 옛 저장본도 그대로 읽힌다. 저장 버전 변경이 필요 없으면 하지 말 것.

## 수용 기준
- prepareRaceDay → raceDayBrief 의 게이트·기수·부담중량·마장이, 같은 상태에서 advanceWeek 로 실제 실행한 결과(결과 기록의 entries)와 같다(테스트, 여러 시드).
- setRaceOrder 로 'held_up' 을 지시하면 실제 실행 EntryRequest.tactic 이 'held_up'(테스트). 지시 안 하면 선호 작전.
- raceDayBrief 는 상태·rng 를 바꾸지 않는다(깊은 비교 테스트). 같은 입력 같은 결과.
- seed 없는 개최(옛 저장본 모양)는 지금 흐름 그대로 실행(테스트).
- 전체 테스트·typecheck·lint·build 통과. 결과가 바뀌는 고정 해시 테스트는 목록과 이유를 보고(Opus 가 갱신).
- 성능: 30년 진행 주당 시간에 눈에 띄는 증가 없음(raceDayBrief 는 화면 호출 때만).

## 금지
git commit, 새 의존성, 공용 타입 변경, UI 파일 수정.
