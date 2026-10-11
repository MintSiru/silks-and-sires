# M0-04 주 단위 시간 진행 + 새 게임 생성

담당: haiku-coder · 선행: M0-01, M0-03 (createRng, rngFromState 사용)

## 목적
`advanceWeek(state)` 로 게임 시간을 1주씩 진행하고, 달력 단계 경계에서 이벤트를 낸다. `createNewGame()` 으로 초기 상태를 만든다.

## 생성할 파일
1. `src/engine/time/calendar.ts`
2. `src/engine/time/advance.ts`
3. `src/engine/state/newGame.ts`
4. `tests/engine/time.test.ts`

이미 있는 파일(Opus 작성, 수정 금지): `src/engine/config/game.ts` — 아래 상수를 import 해서 쓴다.

## 사용할 타입 (수정 금지, `../types` 에서 import)
`GameDate, Week, CalendarPhaseId, CalendarWindow, Season, GameState, GameEvent, WeeklySystem, WeekContext, AdvanceResult, Silks, CountryCode, Owner`

## 구현 사양

### config/game.ts (이미 존재 — 참고용, 수정 금지. PHASE_WINDOWS 는 readonly 배열)
```ts
export const START_YEAR = 2026;
export const WEEKS_PER_YEAR = 52;
export const SAVE_SCHEMA_VERSION = 1;
export const EVENT_LOG_LIMIT = 200;
export const STARTING_FUNDS = 500_000;          // €
export const PLAYER_OWNER_ID = 'owner-player';
/** 단계별 주 범위 (양끝 포함). 연말을 넘는 단계는 창 2개 */
export const PHASE_WINDOWS: Record<CalendarPhaseId, CalendarWindow[]> = {
  foaling:   [{ startWeek: 1,  endWeek: 22 }],                                // 1~5월
  breeding:  [{ startWeek: 7,  endWeek: 26 }],                                // 2월 중순~6월
  turf_flat: [{ startWeek: 13, endWeek: 45 }],                                // 3월 말~11월 초
  aw_winter: [{ startWeek: 1,  endWeek: 12 }, { startWeek: 46, endWeek: 52 }],
};
```

### time/calendar.ts
```ts
export function nextDate(d: GameDate): GameDate;                 // 52주 다음은 {year+1, week:1}
export function addWeeks(d: GameDate, n: number): GameDate;      // n >= 0 정수
export function compareDates(a: GameDate, b: GameDate): number;  // 음수/0/양수
export function weeksBetween(a: GameDate, b: GameDate): number;  // b - a (주 수, 음수 가능)
export function monthOfWeek(week: Week): number;                 // Math.min(12, Math.floor((week-1)*12/52)+1)
export function isInWindows(week: Week, windows: readonly CalendarWindow[]): boolean;
export function isInPhase(week: Week, phase: CalendarPhaseId): boolean;  // PHASE_WINDOWS 사용
export function seasonForYear(year: number): Season;             // phases 는 PHASE_WINDOWS 깊은 복사(가변 배열로)
export function ageInYear(birthYear: number, year: number): number;     // year - birthYear
export function formatDateKo(d: GameDate): string;               // 예: "2026년 6월 2주" — 그 달에 속한 주 중 몇 번째인지
```
- week 가 1~52 정수가 아니면 nextDate/addWeeks/monthOfWeek/formatDateKo 는 RangeError.

### time/advance.ts
```ts
export const calendarSystem: WeeklySystem;   // id 'calendar'
export const DEFAULT_SYSTEMS: readonly WeeklySystem[];  // [calendarSystem]
export function advanceWeek(state: GameState, systems?: readonly WeeklySystem[]): AdvanceResult;
```
- 처리 순서:
  1. `draft = structuredClone(state)`; `rng = rngFromState(draft.rng)`; `ctx = { date: draft.date, rng }`.
  2. 각 system 을 배열 순서대로 실행, 반환 이벤트를 순서대로 모은다.
  3. `next = nextDate(draft.date)`. 연도가 바뀌면 `draft.season = seasonForYear(next.year)` 그리고 이벤트 끝에 `{ type: 'new_year', year: next.year }` 추가.
  4. `draft.date = next`, `draft.rng = rng.getState()`.
  5. `draft.eventLog` 뒤에 이번 이벤트들을 붙이고 마지막 `EVENT_LOG_LIMIT` 개만 남긴다.
  6. `{ state: draft, events }` 반환. **입력 state 는 절대 변형하지 않는다.**
- calendarSystem.run(draft, ctx):
  - 첫 이벤트 `{ type: 'week_started', date: ctx.date }`.
  - 단계별(`foaling, breeding, turf_flat, aw_winter` 순서): 이번 주가 단계 안이고 **이전 주**(1주의 이전 = 52주)가 단계 밖이면 `phase_started`.
  - 그 다음 단계별 같은 순서로: 이번 주가 단계 안이고 **다음 주**(52주의 다음 = 1주)가 단계 밖이면 `phase_ended`.
  - 난수를 쓰지 않는다.

### state/newGame.ts
```ts
export interface NewGameOptions {
  seed: number;
  playerName: string;
  silks: Silks;
  country?: CountryCode;   // 기본 'GB'
  studName?: string | null;
}
export function createNewGame(opts: NewGameOptions): GameState;
```
- `schemaVersion = SAVE_SCHEMA_VERSION`, `initialSeed = seed`, `rng = createRng(seed).getState()`, `date = { year: START_YEAR, week: 1 }`, `season = seasonForYear(START_YEAR)`.
- 플레이어 Owner 1명(`id = PLAYER_OWNER_ID`, isPlayer true, funds STARTING_FUNDS, horseIds [], retainedJockeyId null, studName 기본 null). `playerOwnerId` 같은 값.
- 나머지 레코드는 빈 객체/배열.
- playerName 이 빈 문자열(trim 후)이면 RangeError.

## 수용 기준
1. 새 게임(2026년 1주)에서 52회 advanceWeek 하면 date 가 {2027, 1} 이고, 52번째 호출의 events 마지막이 `new_year`(2027) 이다.
2. 1년(52주) 동안 각 단계의 phase_started / phase_ended 가 정확히 1회씩 나온다(aw_winter 포함 — 1주는 시작이 아니며 46주가 시작, 12주가 끝). turf_flat 은 13주에 started, 45주에 ended.
3. advanceWeek 호출 전후로 입력 state 의 `JSON.stringify` 값이 같다(불변성).
4. 같은 시드로 만든 두 게임을 각각 104주 진행하면 최종 state 의 JSON 이 완전히 같다.
5. eventLog 길이가 EVENT_LOG_LIMIT 를 넘지 않는다(300주 진행 후 확인).
6. `monthOfWeek(1)=1, monthOfWeek(52)=12`, 모든 1~52 주가 1~12 월에 매핑되고 단조 증가한다. `formatDateKo({year:2026, week:1}) === '2026년 1월 1주'`.
7. 커스텀 WeeklySystem(rng.next() 를 1회 호출) 을 넘기면 rng 상태가 바뀌고, 같은 입력이면 결과가 같다.

## 금지 사항
- `src/engine/types/`, `src/engine/rng/` 수정 금지. 새 패키지 금지.
- 다른 티켓이 동시에 진행 중일 수 있다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/time.test.ts && npm run typecheck && npm run lint`
