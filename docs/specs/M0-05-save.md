# M0-05 저장/불러오기

담당: haiku-coder · 선행: M0-01. `src/engine/config/game.ts`(SAVE_SCHEMA_VERSION)는 이미 존재(수정 금지)

## 목적
GameState 를 버전이 붙은 JSON 으로 저장/복원하고, 브라우저 IndexedDB 슬롯과 파일 내보내기를 제공한다.

## 생성할 파일
1. `src/engine/save/serialize.ts` (순수 엔진)
2. `src/ui/storage/saveStore.ts` (브라우저: IndexedDB + 메모리 구현)
3. `src/ui/storage/fileTransfer.ts` (브라우저: 파일 다운로드/읽기)
4. `tests/engine/save.test.ts`
5. `tests/ui/saveStore.test.ts`

## 사용할 타입 (수정 금지)
`GameState, SaveEnvelope, SAVE_FORMAT, SaveError, SaveErrorCode, LoadResult, GameDate` (`src/engine/types`), `SAVE_SCHEMA_VERSION` (`src/engine/config/game.ts`)

## 구현 사양

### save/serialize.ts
```ts
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;
/** key n = 버전 n → n+1 변환. 현재는 비어 있음 */
export const MIGRATIONS: Readonly<Record<number, Migration>>;
export function serializeGame(state: GameState, savedAtIso: string): string;  // SaveEnvelope 를 JSON.stringify (들여쓰기 없음)
export function deserializeGame(json: string, migrations?: Readonly<Record<number, Migration>>): LoadResult;
export function validateGameState(value: unknown): string[];   // 문제 목록(빈 배열 = 정상)
```
- deserializeGame 순서:
  1. JSON.parse 실패 → `invalid_json`.
  2. 객체가 아니거나 `format !== SAVE_FORMAT` → `wrong_format`.
  3. `schemaVersion` 이 정수가 아니거나 `> SAVE_SCHEMA_VERSION` 이거나 `< 1` → `unsupported_version`.
  4. `schemaVersion < SAVE_SCHEMA_VERSION` 이면 migrations[v] 를 차례로 적용 (중간에 함수가 없으면 `unsupported_version`). 적용 후 `state.schemaVersion = SAVE_SCHEMA_VERSION`.
  5. validateGameState 가 문제를 반환하면 `invalid_state` (message 에 첫 문제 3개를 '; ' 로 연결).
  6. 성공 → `{ ok: true, state }`.
- validateGameState 검사(최소): 객체 여부; `schemaVersion`, `initialSeed` 숫자; `rng.algo === 'sfc32'` 이고 `rng.s` 가 길이 4 의 0~4294967295 정수 배열; `date.year` 정수, `date.week` 1~52 정수; `season.year` 정수, `season.phases` 객체; `playerOwnerId` 문자열이고 `owners[playerOwnerId]` 존재; `horses, stallions, mares, owners, trainers, jockeys` 는 배열이 아닌 객체; `raceResults, eventLog` 배열.
- 예외를 밖으로 던지지 않는다(모든 실패는 LoadResult).

### ui/storage/saveStore.ts
```ts
export interface SaveSlotMeta { id: string; name: string; savedAt: string; date: GameDate; playerName: string; }
export interface SaveStore {
  list(): Promise<SaveSlotMeta[]>;                           // savedAt 내림차순
  save(meta: SaveSlotMeta, json: string): Promise<void>;     // 같은 id 는 덮어쓰기
  load(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}
export function createMemorySaveStore(): SaveStore;
export function createIndexedDbSaveStore(factory?: IDBFactory, dbName?: string): SaveStore;  // 기본 globalThis.indexedDB, 'silks-and-sires'
```
- IndexedDB: DB 버전 1, object store 2개 — `meta`(keyPath 'id'), `data`(keyPath 'id', 값 `{ id, json }`). save 는 두 store 를 한 readwrite 트랜잭션으로 기록. remove 도 둘 다 삭제.
- 요청/트랜잭션 콜백을 Promise 로 감싸는 작은 헬퍼 사용. 외부 라이브러리 금지.

### ui/storage/fileTransfer.ts
```ts
export function downloadSaveFile(json: string, fileName: string): void;   // Blob + URL.createObjectURL + <a download> 클릭 후 revoke
export function readSaveFile(file: File): Promise<string>;                // file.text()
export function suggestSaveFileName(playerName: string, date: GameDate): string; // "silks-and-sires_<영숫자만 남긴 이름>_<year>-w<2자리 주>.json"
```

## 수용 기준
1. 손으로 만든 최소 GameState 픽스처(테스트 파일 안에 정의) → serialize → deserialize 결과가 원본과 `toEqual` 이다.
2. 잘못된 JSON, 다른 format, schemaVersion 99, schemaVersion 0, `date.week = 53`, 플레이어 owner 누락 각각이 올바른 오류 코드를 반환하고 throw 하지 않는다.
3. 가짜 마이그레이션 `{ 1: s => ({ ...s, foo: 1 }) }` 과 SAVE_SCHEMA_VERSION 보다 낮은 버전 시나리오를 테스트하기 위해, deserializeGame 의 두 번째 인자로 마이그레이션을 주입해 버전 0→1 같은 경로가 아니라 **"버전 v 에서 v+1 함수가 없으면 unsupported_version"** 과 **"함수가 있으면 적용된다"** 를 검증한다 (필요하면 envelope 의 schemaVersion 을 SAVE_SCHEMA_VERSION-1 로, SAVE_SCHEMA_VERSION 이 1 이면 이 테스트는 `it.skipIf` 로 건너뛰지 말고 validate 이전 단계 동작만 단위 검증할 수 있도록 내부 함수 `applyMigrations(state, from, to, migrations)` 를 export 해서 직접 테스트).
4. `tests/ui/saveStore.test.ts` 는 `import 'fake-indexeddb/auto'` 후 IndexedDB 구현과 메모리 구현 **둘 다** 같은 시나리오(save 2개 → list 정렬 확인 → load → 덮어쓰기 → remove → load null)를 통과한다.
5. `suggestSaveFileName('Siru O\'Neil', {year:2026, week:7}) === 'silks-and-sires_SiruONeil_2026-w07.json'`.
6. `src/engine/save/serialize.ts` 에 DOM·Date·Math.random 사용 없음(lint 통과).

## 금지 사항
- `src/engine/types/` 수정 금지. 목록 외 파일 금지. 새 패키지 금지(fake-indexeddb 는 이미 설치됨).
- 다른 티켓이 동시에 진행 중일 수 있다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/save.test.ts tests/ui/saveStore.test.ts && npm run typecheck && npm run lint`
