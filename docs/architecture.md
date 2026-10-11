# Silks & Sires — 아키텍처 (v0.1, M0~M1 기준)

기획서: docs/plan.md · 결정 기록: docs/decisions.md · 공용 타입: src/engine/types/

## 0. 확정된 해석 (사용자 답변, 2026-10-11)
- 가상 경마장 4곳 = 잔디 3 + 올웨더(AW) 1.
- 레이스 변동성 = **현실형**. 인기 1위 승률 목표 약 30% (허용 범위 25~35%).
- 시작 연도 = 하나로 고정 (`START_YEAR = 2026`). 시나리오 선택 없음.

## 1. 설계 원칙
1. **엔진/UI 분리.** `src/engine` 은 순수 TypeScript. DOM·`window`·`Math.random()`·`Date.now()` 금지 (ESLint 규칙으로 강제).
2. **결정론.** 모든 난수는 `Rng`(시드 기반, 상태 직렬화 가능)에서 나온다. 같은 시드·같은 입력 = 비트 단위로 같은 결과.
3. **상태는 순수 데이터.** `GameState` 는 JSON 직렬화 가능한 평범한 객체(클래스·함수·Map 금지). 저장 = `JSON.stringify`.
4. **정적 데이터 분리.** 경마장·레이스 정의·이름 사전·실명 종마는 `data/*.json`. 저장 파일에는 ID만 남긴다.
5. **밸런스 상수는 `src/engine/config/*.ts`.** 코드에 매직 넘버를 박지 않는다. config 는 배럴(index) 없이 파일별로 직접 import.
6. **단위 (내부 표준).**
   | 양 | 내부 단위 | 표시 |
   |---|---|---|
   | 거리 | 미터(m, float) | 펄롱·미터 병기 (1f = 201.168 m) |
   | 시간 | 초(s) | mm:ss.ss |
   | 부담중량 | 파운드(lb, 정수) | 9-0 (stone-lb) |
   | 돈 | 유로 정수(`Money`) | € |
   | 능력치 | 0~100 실수(숨김) | 단서·등급으로만 노출 |
   | 날짜 | `{ year, week }` (주 1~52) | "2026년 6월 2주" 등 |

## 2. 폴더와 모듈

```
data/                     정적 JSON (경마장, 레이스 정의, 이름 사전, 실명 종마[M2])
src/engine/
  types/                  공용 타입 (Opus 소유. Haiku 수정 금지)
  config/                 밸런스 상수 (티켓별 파일)
  rng/                    시드 RNG (sfc32), 시드 해시, fork
  time/                   달력 유틸, advanceWeek, WeeklySystem 레지스트리
  state/                  새 게임 생성(createNewGame)
  save/                   직렬화·역직렬화·스키마 버전·마이그레이션 (순수)
  going/                  마장 7단계 + AW 3단계, 마장 적성, 당일 마장 추첨
  course/                 경마장 로더·검증, 레이아웃 → RacePath(경사·곡률·미니맵 좌표)
  race/                   출주 준비(게이트 추첨), 주자 모델, 틱 시뮬레이션, 결과·착차, 오즈
  (M2) breeding/ growth/  유전·배합 이론·성장
  (M3) season/ rating/    레이스 캘린더, 출주 등록, OR·핸디캡, AI 마주·조교사
  (M4) economy/ sales/    상금·종부료·유지비, 세일 경매, 종마 전환
src/ui/
  App.tsx                 화면 라우팅(초기엔 데모 화면)
  storage/                IndexedDB SaveStore, JSON 내보내기/불러오기 (브라우저 전용)
  race-viewer/            Canvas 2D 띠 뷰어 (렌더러 + React 래퍼)
tests/                    Vitest. engine/, ui/, data/, perf/ 하위 폴더
docs/specs/               티켓 명세 · docs/reports/ 테스트 리포트
```

### 모듈 의존 방향 (위 → 아래로만 import)
```
ui ──▶ engine/{race, course, going, time, save, state}
race ──▶ course, going, rng, config, types
course ──▶ config, types          going ──▶ rng, config, types
time ──▶ rng, config, types       save ──▶ types
state ──▶ rng, time, types        rng ──▶ types
```
엔진은 ui 를 import 하지 않는다. `types` 는 아무것도 import 하지 않는다(타입 간 import 만 허용).

## 3. 데이터 흐름

### 3-1. 주 단위 진행 (M0)
```
GameState ──advanceWeek()──▶ structuredClone(draft)
   │                            │ rng = rngFromState(draft.rng)
   │                            │ for system of WEEKLY_SYSTEMS (고정 순서):
   │                            │     events += system.run(draft, ctx)
   │                            │ draft.date = nextWeek(date); draft.rng = rng.getState()
   ▼                            ▼
(원본 불변)               { state: draft, events: GameEvent[] }
```
- 주 52 → 다음 해 1주. 새해에 `new_year` 이벤트. 나이는 `year - birthYear` 로 계산하므로 일괄 +1 처리가 필요 없다.
- 달력 단계(종부 시즌, 잔디 평지 시즌, AW 시즌, 출산 시즌)는 `config/calendar.ts` 의 주 범위로 정의하고, 경계 주에 `phase_started`/`phase_ended` 이벤트를 낸다.
- M3 이후 시스템(조교, 출주, 세일 등)은 `WeeklySystem` 을 레지스트리에 추가하는 방식으로 붙인다.

### 3-2. 저장/불러오기 (M0)
```
GameState ─serializeGame(state, savedAtIso)─▶ SaveEnvelope JSON 문자열 ─▶ SaveStore(IndexedDB) / 파일 내보내기
문자열 ─deserializeGame()─▶ 형식 검사 → schemaVersion 마이그레이션 → GameState | SaveError
```
`savedAtIso` 는 UI 가 넘긴다(엔진은 시계를 읽지 않는다).

### 3-3. 레이스 1회 (M1)
```
Race(정의) + Racecourse + Going + 출주마(Horse·Jockey·Owner 스냅샷) + seed
   │ race/setup: 마번 부여, 게이트 추첨(draw), 부담중량 → RaceEntry[]
   │ race/odds:  예상 전력 → 시장 확률 → 분수 오즈
   ▼
RaceSimInput ──simulateRace()──▶ RaceSimOutput
   │  course.buildRacePath(course, distance) → RacePath (경사·곡률·직선 여부·미니맵 좌표)
   │  runnerModel.prepareRunner() → 주자별 정적 파라미터 (마장·거리·코스 적성, 중량, 컨디션, 당일 폼 난수)
   │  0.1초 틱 루프: 기수 AI(포지션·스퍼트·레인) → 목표 속도 → 가속 제한 → 스태미나 소모 → 트래픽 → 이동
   │  결승선 통과 시각 보간 → FinishRecord[]
   │  race/results: 착순·동착·착차 라벨·구간 타임·성적 지수 → RaceResult
   ▼
RaceResult (저장·레이팅용)  +  RaceReplay (프레임 배열, 뷰어용; 옵션)
   ▼
ui/race-viewer: RaceReplay + RacePath + RaceResult + 표시 정보 → Canvas 띠 재생 (1×/2×/4×/결과만)
```
- 시드 하나에서 `rng.fork('draw')`, `rng.fork('odds')`, `rng.fork('sim')` 로 독립 스트림을 만든다. 오즈 계산 방식이 바뀌어도 레이스 결과는 바뀌지 않는다.
- 레이스 계산 예산: 20두·3,200m 기준 1회 50ms 이하 (리플레이 기록 포함).

## 4. 핵심 타입 (요약 — 정본은 src/engine/types/*.ts)

| 파일 | 타입 |
|---|---|
| common.ts | `HorseId` `OwnerId` `TrainerId` `JockeyId` `RacecourseId` `RaceId` `SireLineId`, `CountryCode`, `Money`, `Silks`, `HexColor` |
| rng.ts | `Rng`, `RngState` |
| time.ts | `Week`, `GameDate`, `CalendarPhaseId`, `CalendarWindow`, `Season` |
| going.ts | `TurfGoing`, `AwGoing`, `Going`, `TURF_GOING_ORDER`, `AW_GOING_ORDER` |
| horse.ts | `Sex`, `HorseStatus`, `Abilities`, `Aptitudes`, `GrowthProfile`, `Condition`, `RunningStyle`, `CareerRecord`, `Horse`, `Stallion`, `Mare` |
| people.ts | `Trainer`, `TrainerStyle`, `Jockey`, `Owner` |
| course.ts | `Surface`, `Handedness`, `TrackSegment`, `TrackLayout`, `CourseDistance`, `Racecourse`, `PathPoint`, `RacePathSample`, `RacePath` |
| race.ts | `RaceGrade`, `RaceKind`, `RaceClass`, `RaceConditions`, `Race`, `RaceEntry`, `RunnerInput`, `RaceSimInput`, `RaceSimOptions`, `FinishRecord`, `MarginLabel`, `FractionalOdds`, `RunnerResult`, `RaceResult`, `ReplayFrame`, `RaceReplay`, `RaceSimOutput` |
| game.ts | `GameEvent`, `GameState`, `WeekContext`, `WeeklySystem`, `SaveEnvelope`, `SaveError` |

핵심 시그니처 (발췌):

```ts
export interface Rng {
  next(): number;                       // [0,1)
  int(min: number, max: number): number; // 양끝 포함
  range(min: number, max: number): number;
  normal(mean?: number, sd?: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  fork(label: string): Rng;
  getState(): RngState;
}

export interface Horse {
  id: HorseId; name: string; sex: Sex; gelded: boolean; birthYear: number;
  countryOfBirth: CountryCode; status: HorseStatus;
  sireId: HorseId | null; damId: HorseId | null;
  ownerId: OwnerId | null; breederId: OwnerId | null; trainerId: TrainerId | null;
  ability: Abilities; potential: Abilities; growth: GrowthProfile; aptitude: Aptitudes;
  preferredStyle: RunningStyle; condition: Condition;
  officialRating: number | null; record: CareerRecord;
}

export interface Racecourse {
  id: RacecourseId; name: string; country: CountryCode; surface: Surface;
  handedness: Handedness; undulation: number; drainage: number;
  layouts: TrackLayout[]; distances: CourseDistance[];
}

export interface Race {
  id: RaceId; name: string; racecourseId: RacecourseId; distance: number;
  kind: RaceKind; grade: RaceGrade | null; raceClass: RaceClass;
  conditions: RaceConditions; prizeMoney: Money[]; maxRunners: number;
}

export function simulateRace(input: RaceSimInput): RaceSimOutput; // race/simulate.ts
```

## 5. 레이스 시뮬레이션 모델 (M1)

- **틱:** `dt = 0.1 s` 고정. 위치 `progress`(출발점부터 내측 레일 기준 진행 m), `lane`(내측 레일에서 바깥으로 m), `speed`(m/s), `stamina`(0~1 정규화 잔량).
- **곡선 손실:** 곡률 `κ = 1/R` 구간에서 레인 `y` 를 달리는 말은 실제 이동 `ds` 중 `ds / (1 + y·|κ|)` 만큼만 진행한다 → 바깥 게이트·외곽 우회의 비용이 자연스럽게 생긴다.
- **구간:** 출발(게이트 반응 지연 + 가속) → 포지션 다툼(작전별 목표 속도) → 순항 → 스퍼트(기수 AI가 남은 거리·잔여 스태미나로 개시 지점 결정) → 결승 후 감속.
- **입력:** 능력치(스피드·스태미나·순발력·근성·파워), 거리·마장·코스(좌우·기복) 적성, 게이트, 부담중량, 컨디션, 기수 능력, 당일 폼 난수(현실형 → 폭을 넓게).
- **트래픽:** 같은 레인대 앞 1마신 이내에 더 느린 말이 있으면 바깥으로 비키거나(공간 있을 때) 그 속도로 감속.
- **결과:** 결승 통과 시각 선형 보간, 착차 = 시간차 × 마신/초(config), 라벨(nose/short head/head/neck/½…/dist), 펄롱 구간 타임, 성적 지수(승자 대비 lb).

## 6. 2D 띠 뷰어 (M1)

| 구역 | 내용 |
|---|---|
| 좌측 | RacePath 미니맵(레이아웃 폴리라인 + 선두 점), `TURF 1,600m (8f)`, 마장 라벨, 남은 거리(f), 선두 속도(km/h) |
| 중앙 | 가로 = 진행 거리, 세로 = 레인(아래쪽이 내측 레일). 지름 고정 번호 원판, 색 = 승부복 주색, 번호 글자색은 명도 대비로 자동, 내 말은 굵은 링, 겹치면 뒤쪽 말 반투명. 카메라는 선두~최후미 자동 줌, 결승 200m 전부터 상위권 확대 |
| 우측 | 상위 3두 마번 + 승부복 + 착차 + 분수 오즈, 가상 레이스명 + 등급 배지, 경마장명 |

재생: 1× / 2× / 4× / 결과만. 렌더러(`StripRenderer`)는 `CanvasRenderingContext2D` 와 프레임만 받는 순수 그리기 함수라 목(mock) 컨텍스트로 테스트한다.

## 7. 저장 형식

```json
{ "format": "silks-and-sires-save", "schemaVersion": 1, "savedAt": "2026-10-11T12:00:00.000Z", "state": { ...GameState } }
```
`schemaVersion` 이 오르면 `save/migrations` 에 `n → n+1` 함수를 추가한다. 알 수 없는 상위 버전은 거부.

## 8. 테스트 전략
- 단위: 모듈별 `tests/engine/<module>.test.ts`.
- 재현성: 같은 시드로 레이스 1,000회 × 2 실행, `RaceResult`·`RaceReplay` 깊은 비교 100% 일치.
- 성능: `tests/perf/race.perf.test.ts` — 20두 3,200m 레이스 평균·최대 계산 시간.
- 밸런스: `tests/balance/*.test.ts` + `docs/reports/<날짜>-<주제>.md` (인기 1위 승률, 게이트별·작전별 승률, 마장별 착차 분포).
- 가상화 검사: `tests/data/` 에서 금지 이름 목록(실제 경마장·레이스명) 검색.
