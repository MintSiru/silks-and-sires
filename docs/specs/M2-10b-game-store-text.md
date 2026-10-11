# M2-10b UI 게임 상태 훅 + 한국어 표시 문구

담당: haiku-coder · 선행: M2-10a

## 생성할 파일
1. `src/ui/game/useGame.ts`
2. `src/ui/game/text.ts`
3. `tests/ui/gameText.test.ts`

## ui/game/useGame.ts (React 훅, 로직은 엔진 호출만)
```ts
export interface GameApi {
  state: GameState | null;
  lastEvents: GameEvent[];          // 마지막 진행에서 나온 이벤트
  newGame(seed: number, playerName: string): void;   // createNewGame → bootstrapWorld(createRng(seed).fork('world'))
  advance(weeks: number): void;     // createGameSystems(data) 로 advanceWeek 반복, 이벤트 누적
  advanceToPhase(phase: CalendarPhaseId): void;  // 그 단계가 시작되는 주까지(최대 52주)
  book(mareId: HorseId, stallionId: HorseId): BookingResult;   // 성공 시 state 갱신
  save(): Promise<void>;            // createIndexedDbSaveStore, 슬롯 id 'autosave'
  load(): Promise<boolean>;
}
export function useGame(): GameApi;
```
정적 데이터는 `src/engine/data/staticData.ts` 의 getter 로 가져온다. 플레이어 승부복은 고정값 `{ primary: '#1f4e9c', secondary: '#f5c518', pattern: 'hoops' }`.

## ui/game/text.ts (순수 함수)
```ts
export function commentText(c: AssessmentComment, seedKey: string): string;  // comments.ko.json 의 문장 중 seedKey 해시로 하나 선택(결정론)
export function gradeColor(g: Grade): string;          // S 금색, A 초록, B 청록, C 회색, D 주황, E 빨강 (hex)
export function nickLabelKo(l: NickLabel): string;     // excellent '최상' / good '좋음' / neutral '보통' / poor '나쁨' / unknown '미확인'
export function growthKo(g: GrowthProfile['type'] | 'unknown'): string;  // 조숙 / 보통 / 만성 / 미상
export function distanceHintKo(h: { min: number; max: number }): string; // "1,400m ~ 2,000m (7f ~ 10f)" 펄롱 0.5 단위 ½ 표기
export function feeKo(money: Money): string;          // "€60,000"
export function stageKo(s: AssessmentStage): string;   // 망아지 / 1세 / 2세 / 조교 중
export function statusKo(s: HorseStatus): string;      // 각 상태 한국어
export function eventKo(e: GameEvent, nameOf: (id: HorseId) => string): string;  // 이벤트 한 줄 요약(교배 예약·수태·출산·상태 변화·새해·단계 시작/종료)
```
## 수용 기준
1. commentText 가 같은 seedKey 에 같은 문장, 모든 COMMENT_KEYS 에 문장 반환. 숫자 능력치를 출력하는 함수가 없다.
2. distanceHintKo({min:1400,max:2000}) === '1,400m ~ 2,000m (7f ~ 10f)'.
3. 모든 함수 단위 테스트, typecheck·lint·build 통과.

## 테스트 명령
`npx vitest run tests/ui/gameText.test.ts && npm run typecheck && npm run lint && npm run build`
