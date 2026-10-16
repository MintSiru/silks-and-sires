# M4-E0ui 새 게임 설정 화면

담당: haiku-coder · 선행: M4-E0(커밋)

목적: 새 게임 폼에서 시작 유형·난이도·소재국·예후불량·현역마 지급 여부를 고르게 하고, 고른 난이도의 시작 조건을 미리 보여 준다.

## 사용할 것 (수정 금지)
- `bootstrapGame(opts, data)`의 opts(`NewGameOptions`, state/newGame.ts): `seed`, `playerName`, `silks`, `economyMode?`, `startType?: StartType`, `difficulty?: Difficulty`, `homeCountry?: HomeCountry`, `catastrophicInjuries?: boolean`, `grantRacehorses?: boolean`
- config/farm.ts: `STARTING_PACKAGES[difficulty] { funds; mares; breederRacehorses; ownerRacehorses; facilityLevel; farmSize }`, `HOME_COUNTRIES`, `STARTING_RACEHORSE_AGES`
- text.ts: `feeKo`, `FARM_SIZE_KO`, 나라 이름 함수(countryKo 등 기존 것)
- 지금 폼: src/ui/breeding/BreedingScreen.tsx 의 새 게임 폼(handleSubmit → game.newGame(seed, name, economyMode)), src/ui/game/useGame.ts 의 newGame

## 수정할 파일 (5개 이하 + 테스트)
1. `src/ui/game/useGame.ts` — `newGame(seed, playerName, economyMode)` 를 `newGame(options: { seed; playerName; economyMode; startType; difficulty; homeCountry; catastrophicInjuries; grantRacehorses })` 로 바꾸고 bootstrapGame 에 그대로 넘긴다(silks 는 지금처럼 PLAYER_SILKS). 호출하는 곳을 모두 고친다.
2. `src/ui/newGame/newGameView.ts`(신규) — 순수 함수:
   - `startSummaryKo(startType, difficulty, grantRacehorses): string[]` — 예: ['시작 자금 €600,000', '번식 암말 2두', '현역마 1두(3세)', '중형 목장 · 시설 1단계'] / 마주 시작은 ['시작 자금 …', '현역마 2두(3세·2세)', '목장 없음 — 목장을 사면 오너브리더'].
   - 선택지 목록 상수(시작 유형·난이도·예후불량 설명 문구).
3. `src/ui/breeding/BreedingScreen.tsx`(또는 새 게임 폼을 `src/ui/newGame/NewGameForm.tsx` 로 옮겨도 됨) — 폼에 추가: 시작 유형 라디오(오너브리더 기본) / 난이도 라디오(보통 기본) / 소재국 select(영국 기본) / '현역마 지급' 체크(오너브리더일 때만, 기본 켬) / '예후불량(경주 중 치명적 부상)' 체크(기본 켬, 설명: 경주 중 중증 골절의 약 40%가 사망). 고른 값의 startSummaryKo 를 폼 아래 목록으로.
4. 테스트 `tests/ui/newGameView.test.ts`(신규).

## 수용 기준
1. startSummaryKo: normal 오너브리더 현역마 지급 → 자금 €600,000·암말 2·현역마 1(3세)·중형·시설 1단계 문구; hard 오너브리더 → 현역마 0(현역마 줄 없음 또는 '현역마 없음'); easy 마주 → 현역마 3두(3세·2세·2세)·목장 없음.
2. 폼에서 고른 옵션이 bootstrapGame 에 그대로 전달된다(useGame 변경, 타입 오류 없음).
3. `npm run build` 성공. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine 수정 금지. 새 의존성 금지. git commit 금지. 화면 문구 실명 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/ui && npm test && npm run typecheck && npm run lint && npm run build
