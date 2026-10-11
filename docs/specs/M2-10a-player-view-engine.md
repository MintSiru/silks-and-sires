# M2-10a 플레이어 시점 엔진 연결부 (시스템 구성 · 단서 조회)

담당: haiku-coder · 선행: M2-06, M2-07, M2-09

## 생성할 파일
1. `src/engine/config/playerView.ts`
2. `src/engine/state/systems.ts`
3. `src/engine/horse/playerView.ts`
4. `tests/engine/playerView.test.ts`

## config/playerView.ts
```ts
/** 플레이어 목장 평가자 능력(0~100). M3 에서 고용 인력으로 대체 */
export const PLAYER_ASSESSOR_SKILL = 50;
/** 단계 판정: 나이(년, 실수) 경계 */
export const STAGE_FOAL_MAX_AGE = 1;
export const STAGE_YEARLING_MAX_AGE = 2;
```
## state/systems.ts
```ts
export function createGameSystems(data: BreedingStaticData): WeeklySystem[];   // [calendarSystem, growthSystem, createBreedingSystem(data)] 순서
```
## horse/playerView.ts
```ts
export function stageFor(horse: Horse, date: GameDate): AssessmentStage;
// status 'in_training' → in_training. 그 외 나이 < STAGE_FOAL_MAX_AGE → foal, < YEARLING_MAX → yearling, 그 외 two_year_old
export function assessForPlayer(state: GameState, horseId: HorseId, assessorSkill?: number): Assessment;
// rng = createRng(`assess:${horseId}:${date.year}:${date.week}`) — 게임 메인 RNG 를 소비하지 않는다(같은 주에 다시 봐도 같은 단서)
export function playerHorses(state: GameState): Horse[];       // 플레이어 owner.horseIds 의 말, id 오름차순
export function availableStallions(state: GameState): { horse: Horse; stallion: Stallion }[];  // stallions 전부, fee 내림차순 → 이름 오름차순
```
## 수용 기준
1. createGameSystems 로 advanceWeek 52주 → 이벤트에 phase/성장/교배 시스템이 모두 동작(기존 테스트 재사용 불필요, 시스템 id 순서 확인).
2. assessForPlayer: 같은 주 두 번 → 같은 결과, 그리고 state.rng 가 바뀌지 않는다. 다음 주에는 달라질 수 있다.
3. stageFor 경계값 테스트. availableStallions 정렬.
4. typecheck·lint 통과.

## 테스트 명령
`npx vitest run tests/engine/playerView.test.ts && npm run typecheck && npm run lint`
