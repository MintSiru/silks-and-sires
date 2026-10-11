# M1-09 통합: runRace 파사드 + 정적 데이터 로더 + 레이스 데모 화면

담당: haiku-coder · 선행: M1-02, M1-05, M1-07, M1-08

## 목적
시드 하나로 "출주 준비 → 오즈 → 시뮬레이션" 을 한 번에 돌리는 엔진 파사드와, 브라우저에서 레이스를 골라 띠 뷰어로 재생하는 데모 화면을 만든다. **M1 완료 기준 "띠 뷰어로 레이스 1회 재생 가능"을 이 티켓이 충족한다.**

## 생성·수정할 파일
1. `src/engine/data/staticData.ts` (신규)
2. `src/engine/race/runRace.ts` (신규)
3. `src/ui/RaceDemo.tsx` (신규)
4. `src/ui/App.tsx` (수정)
5. `tests/engine/runRace.test.ts` (신규)

## 사용할 타입·함수 (수정 금지)
- `createRng` · `loadRacecourses` · `buildRacePath` · `buildEntries` · `generateSampleField, SampleField, NamePool` · `priceField` · `estimateStrength, RaceContext` · `simulateRace` · `rollGoing, isGoingValidForSurface, goingLabel` · `monthOfWeek` · `formatMarginKo` · `formatOdds`
- UI: `RaceViewer, ViewerInfo` (`src/ui/race-viewer/*`)
- 타입: `Race, Racecourse, Going, GameDate, RaceEntry, RacePath, RaceSimOutput, RunnerInput, TURF_GOING_ORDER, AW_GOING_ORDER`

## 구현 사양

### engine/data/staticData.ts
```ts
export function getRacecourses(): Racecourse[];      // data/racecourses.json → loadRacecourses (모듈 안에서 1회만 파싱·캐시)
export function getRacecourse(id: string): Racecourse;
export function getRaces(): Race[];                 // data/races.json (as Race[])
export function getRace(id: string): Race;          // 없으면 Error
export function getNamePool(): NamePool;            // data/names.json
```
JSON 은 `import racecoursesJson from '../../../data/racecourses.json'` 형태로 가져온다.

### engine/race/runRace.ts
```ts
export interface RunRaceInput {
  race: Race; course: Racecourse; going: Going; date: GameDate; seed: number;
  field: SampleField;          // runners[i] ↔ requests[i]
  recordReplay?: boolean;      // 기본 true
}
export interface RunRaceOutput {
  entries: RaceEntry[];        // odds 채워진 것, index = runner index
  path: RacePath;
  strengths: number[];
  sim: RaceSimOutput;
}
export function runRace(input: RunRaceInput): RunRaceOutput;
```
순서(고정):
1. `entries = buildEntries(createRng(seed).fork('draw'), field.requests)`
2. `path = buildRacePath(course, race.distance)`; `ctx: RaceContext = { distance: race.distance, going, surface: path.surface, handedness: path.handedness, undulation: course.undulation, trackWidth: path.width }`
3. `runners: RunnerInput[] = field.runners.map((r, i) => ({ ...r, entry: entries[i] }))`
4. `strengths = runners.map(r => estimateStrength(r, ctx))`; `odds = priceField(createRng(seed).fork('odds'), strengths)`; 각 entries[i].odds = odds[i] (runners[i].entry 도 같은 객체이므로 함께 반영되게).
5. `sim = simulateRace({ race, course, going, date, runners, seed, options: { recordReplay } })`.
- race.racecourseId !== course.id 이거나 field 길이가 race.maxRunners 초과면 Error.

### ui/RaceDemo.tsx (기본 export 함수 컴포넌트)
- 컨트롤: 레이스 선택(`getRaces()` 목록, 표시 "레이스명 · 경마장명 · 등급/클래스 · 거리"), 마장 선택('자동' + 해당 경마장 surface 에 맞는 마장 목록, goingLabel 표기), 시드 숫자 입력(기본 20261011), 출주 두수(4 ~ race.maxRunners, 기본 min(10, maxRunners)), '레이스 시작' 버튼.
- '자동' 마장: `rollGoing(createRng(seed).fork('going'), course, monthOfWeek(DEMO_DATE.week))`. `DEMO_DATE = { year: 2026, week: 24 }` (파일 상수).
- 출주마: `generateSampleField(createRng(seed).fork('field'), { size, distance, surface, year: DEMO_DATE.year, namePool: getNamePool(), level, playerIndex: 0 })`. level 은 파일 상수 `DEMO_LEVEL: Record<RaceKind, number> = { group: 72, listed: 64, conditions: 60, handicap: 56, novice: 50, maiden: 48 }`, G1 이면 +4.
- 실행 결과로 `<RaceViewer>` 표시(ViewerInfo 는 race·course·going·entries·말 이름에서 구성), 그 아래 결과 표: 착순 / 마번 / 게이트 / 마명(내 말 굵게) / 기수 / 부담중량(lb) / 착차(formatMarginKo, 1착은 '-') / 타임(mm:ss.ss) / 오즈(formatOdds).
- 계산 시간 표시: `레이스 계산 N ms` (performance.now 로 runRace 만 측정).
- 문구는 한국어. 실제 경마장·레이스·인물 이름 금지(데이터의 가상 이름만 사용).

### ui/App.tsx
기존 제목/설명 아래에 `<RaceDemo />` 를 렌더.

## 수용 기준
1. staticData: 경마장 4, 레이스 12, 이름 풀 크기(80/30/30). 모든 레이스에 대해 getRacecourse(race.racecourseId) 와 buildRacePath 가 성공.
2. runRace: 같은 입력 두 번 → `toEqual`. 시드만 다르면(5개) 적어도 하나는 우승마가 다르다. 모든 entries.odds 가 null 이 아니다.
3. 데이터의 12개 레이스 각각을 출주 min(10, maxRunners) 두로 돌려 모든 말이 결승하고 position 1 이 존재한다.
4. draw 스트림 독립성: 같은 seed 에서 `field.requests` 의 jockeyAllowanceLb 만 바꿔도 entries 의 draw 는 같다.
5. `npm run build` 성공, `npm run dev` 후 화면에서 레이스 1회 재생 가능(보고서에 dev 서버 기동 확인만 적으면 됨 — 브라우저 조작은 하지 않아도 된다).
6. typecheck·lint·전체 테스트 통과.

## 금지 사항
- 목록 외 파일·다른 엔진 모듈·공용 타입 수정 금지. 새 패키지 금지.

## 테스트 명령
`npx vitest run tests/engine/runRace.test.ts && npm test && npm run typecheck && npm run lint && npm run build`
