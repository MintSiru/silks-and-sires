# M2-08 세계 초기화: 실명 종마 Horse 레코드 + 플레이어 기초 암말

담당: haiku-coder · 선행: M2-02(generate), M2-04(nicks·words), M2-05(nicks.ts), M2-01(stallions data)

## 목적
새 게임에 (1) 실명 종마 데이터로 종마 Horse/Stallion 레코드를, (2) 플레이어의 기초 번식 암말 3두(가상, 혈통 포함)를, (3) 시작 공개 닉스를 넣는다.

## 생성·수정할 파일
1. `src/engine/config/world.ts` (신규)
2. `src/engine/state/stallionHorses.ts` (신규)
3. `src/engine/state/world.ts` (신규)
4. `src/engine/data/staticData.ts` (수정: 아래 getter 추가만)
5. `tests/engine/world.test.ts` (신규)

## Opus 가 바꾼 공용 타입 (수정 금지)
- `GameState.breeding: BreedingState` — `{ revealedNicks: string[] }`
- `GameState.nextHorseNumber: number` — 가상 말 ID 발급용 일련번호(1부터)
- createNewGame 은 Opus 가 `breeding: { revealedNicks: [] }, nextHorseNumber: 1` 로 초기화하도록 이미 고쳤다.

## config/world.ts (값 그대로)
```ts
export const TIER_LEVEL = { 1: 82, 2: 76, 3: 70, 4: 64, 5: 58 } as const;
export const STALLION_SPREAD = 5;
export const PROFILE_DISTANCE = { sprint: 1200, mile: 1600, middle: 2200, staying: 2900 } as const;
export const TIER_FEE = { 1: 150_000, 2: 60_000, 3: 30_000, 4: 12_000, 5: 6_000 } as const;
export const TIER_BOOK_LIMIT = { 1: 180, 2: 160, 3: 140, 4: 120, 5: 100 } as const;
export const TIER_POPULARITY = { 1: 90, 2: 75, 3: 60, 4: 45, 5: 30 } as const;
export const FERTILITY_MEAN = 0.85;
export const FERTILITY_SD = 0.05;
export const FIRST_SEASON_AGE = 4;
export const PLAYER_START_MARES = 3;
export const MARE_LEVEL = 55;
export const MARE_LEVEL_SPREAD = 8;
export const MARE_AGE_MIN = 5;
export const MARE_AGE_MAX = 12;
/** 기초 암말의 어미(가상) 나이 차 범위 */
export const DAM_AGE_GAP_MIN = 6;
export const DAM_AGE_GAP_MAX = 12;
/** 종마가 교배 가능한 최소 나이 */
export const MIN_SIRE_AGE_AT_COVER = 4;
/** 암말의 부 선택 가중치(tier 별) — 기초 암말은 중하위권 혈통이 많다 */
export const MARE_SIRE_TIER_WEIGHT = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 } as const;
export const MARE_COUNTRIES = ['GB', 'IE', 'FR'] as const;
export const HORSE_ID_PREFIX = 'h-';
export const HORSE_ID_DIGITS = 6;
```
## data/staticData.ts 에 추가할 getter (기존 함수는 그대로)
`getStallionRecords(): RealStallionRecord[]`, `getStallionNames(): StallionNameTable`, `getSireLines(): SireLine[]`, `getNicks(): NickEntry[]`, `getHorseWords(): HorseWords` — 각각 data/stallions/stallions.json, names.json, sire_lines.json, data/breeding/nicks.json, data/names/horse_words.json.

## state/stallionHorses.ts
```ts
export function createRealStallionHorses(rng: Rng, records: readonly RealStallionRecord[], names: StallionNameTable, currentYear: number): { horses: Horse[]; stallions: Stallion[] };
```
- records 를 key 오름차순으로 처리. 각 레코드 → `generateHorse(rng, { id: key, name: names[key], sex: 'male', birthYear: foaled, currentYear, countryOfBirth, status: active → 'stud' / pensioned → 'retired' / historical → 'historical', level: TIER_LEVEL[tier], spread: STALLION_SPREAD, sireId: sireKey, damId: null, familyId: null, sireLineId, distanceBias: PROFILE_DISTANCE[distanceProfile], surfaceBias: surfaceProfile === 'dirt' ? 'dirt' : undefined })`.
- 이름이 names 에 없으면 Error. 이름은 18자 제한을 넘을 수 있으므로(실명) **NAME_MAX_LENGTH 검사를 우회하지 말고**, 18자 초과 실명이 있으면 Error 로 알린다(현재 데이터는 모두 18자 이하여야 함 — 테스트로 확인).
- active 인 레코드만 Stallion 생성: `{ horseId: key, realKey: key, sireLineId, fee: TIER_FEE[tier], bookLimit: TIER_BOOK_LIMIT[tier], bookedThisSeason: 0, fertility: clamp(normal(FERTILITY_MEAN, FERTILITY_SD), 0.5, 0.99), popularity: TIER_POPULARITY[tier], standsIn: standsIn!, firstSeasonYear: foaled + FIRST_SEASON_AGE }`.
## state/world.ts
```ts
export interface WorldStaticData { stallionRecords: readonly RealStallionRecord[]; stallionNames: StallionNameTable; nicks: readonly NickEntry[]; words: HorseWords; }
export function allocateHorseId(state: GameState): HorseId;   // `${PREFIX}${번호 0채움 DIGITS}` 반환 후 state.nextHorseNumber += 1 (state 를 직접 수정)
export function bootstrapWorld(state: GameState, data: WorldStaticData, rng: Rng): GameState;   // structuredClone 후 추가, 원본 불변
```
bootstrapWorld 순서:
1. createRealStallionHorses → state.horses / state.stallions 에 추가.
2. `state.breeding.revealedNicks = initialRevealedNicks(data.nicks)`.
3. used = 기존 모든 말 이름 Set.
4. 플레이어 기초 암말 PLAYER_START_MARES 두, i 순서대로:
   a. 암말 나이 = int(MARE_AGE_MIN, MARE_AGE_MAX), birthYear = 현재 연도 - 나이, country = pick(MARE_COUNTRIES).
   b. 암말의 부: status 가 active/pensioned 이고 foaled ≤ birthYear - 1 - MIN_SIRE_AGE_AT_COVER 인 종마 중 MARE_SIRE_TIER_WEIGHT 가중 선택(key 오름차순 목록에서 누적 가중, next() 1회).
   c. 어미(가상): 나이 차 = int(GAP_MIN, GAP_MAX), damBirth = birthYear - 나이 차. 어미의 부: 모든 종마(historical 포함) 중 foaled ≤ damBirth - 1 - MIN_SIRE_AGE_AT_COVER, 같은 가중 선택. 어미 = generateHorse(id = allocateHorseId, name = generateHorseName, sex female, status 'historical', level MARE_LEVEL, spread MARE_LEVEL_SPREAD, sireId = 어미의 부, damId null, familyId = 자기 id, sireLineId = 부의 sireLineId).
   d. 암말 = generateHorse(id 발급, 이름 생성, female, status 'broodmare', level MARE_LEVEL, spread MARE_LEVEL_SPREAD, sireId = b, damId = 어미 id, familyId = 어미 id, sireLineId = b 의 sireLineId, ownerId = breederId = playerOwnerId).
   e. state.mares[암말 id] = `{ horseId, coveredBy: null, pregnant: false, dueWeek: null, foals: [], blackTypeProduce: 0 }`, 플레이어 owner.horseIds 에 추가.
5. 반환.

## 수용 기준
1. createRealStallionHorses: 데이터 종마 수 = horses 수, active 수 = stallions 수, 모든 이름 ≤ 18자, sire 사슬 id 가 전부 horses 안에 존재.
2. bootstrapWorld: 같은 시드 → 같은 상태(JSON 동일). 원본 state 불변. 플레이어 암말 3두(broodmare, owner = player, Mare 레코드 존재), 각 암말의 부·어미·어미의 부가 state.horses 에 있고 부의 나이 조건 충족. nextHorseNumber = 7 (어미 3 + 암말 3 + 1).
3. 플레이어 암말로 buildPedigree(5대) 를 만들면 부측은 종마 데이터 사슬로 채워진다(대 2~5 중 실존 노드 ≥ 4).
4. revealedNicks = knownAtStart 키와 같다.
5. 저장 왕복: serializeGame → deserializeGame 후 toEqual (state/validate 가 새 필드를 막지 않음).
6. typecheck·lint 통과.

## 금지
- 공용 타입·다른 모듈 수정 금지(staticData.ts 는 getter 추가만). 목록 외 파일 금지.

## 테스트 명령
`npx vitest run tests/engine/world.test.ts && npm test && npm run typecheck && npm run lint`
