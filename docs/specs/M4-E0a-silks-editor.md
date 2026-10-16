# M4-E0a 승부복(마주복) 편집기

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/m4-plan.md E0a(사용자 요청 2026-10-12, 첨부 도안 형식)
병행: Codex M4-E1(src/engine/farm/facilities.ts, horse/*, stud/health.ts, season/*)과 haiku M4-E0b(src/engine/farm/purchase.ts, stud/yearEnd.ts, sales/auction.ts)가 다른 작업 트리에서 진행 — 그 파일들과 src/engine/types, src/engine/state/systems.ts 는 건드리지 말 것.

목적: 플레이어가 몸통·소매·모자 세 부분을 '바탕색 + 무늬 층 최대 2개'로 꾸미고 SVG 로 미리 보며, 새 게임과 이후 화면에서 바꿀 수 있게 한다. AI 마주도 같은 세 부분 그림으로 보인다.

## 사용할 타입 (수정 금지, 이미 추가됨 — src/engine/types/common.ts)
- `SilksBodyPattern`(29종), `SilksSleevePattern`(13종), `SilksCapPattern`(11종)
- `SilksLayer<P> { pattern; colour }`, `SilksPart<P> { base; layers }`(층 0~2, 아래 → 위), `SilksDesign { body; sleeves; cap }`
- `Silks { primary; secondary; pattern; design? }` — design 이 있으면 primary = body.base, secondary = 몸통 첫 층 색(층이 없으면 sleeves.base), pattern = 몸통 첫 층의 원판 축약(아래 표). design 이 없으면 유도 함수로 만든다. **저장 마이그레이션·저장 버전 변경 없음.**
- 기존: `SilksPattern`(원판 8종), src/ui/race-viewer/silks.ts(원판 그리기), engine/people/generate.ts sampleSilks(AI 마주 — 바꾸지 않는다: 공용 rng 소비·고정 해시 불변), state/newGame.ts(`silks: { ...opts.silks }`), src/ui/game/useGame.ts PLAYER_SILKS·NewGameInput, src/ui/breeding/BreedingScreen.tsx 새 게임 폼(M4-E0ui)

## 범위
1. `src/engine/people/silks.ts`(신규, 순수):
   - `MAX_SILKS_LAYERS = 2`, 무늬 목록 상수 `SILKS_BODY_PATTERNS` 등 3개(타입과 같은 순서).
   - `silksDesignOf(silks: Silks, key: string): SilksDesign` — design 이 있으면 그대로. 없으면 유도: body = { base: primary, layers: 기존 pattern 을 몸통 무늬로 옮긴 층 1개(plain 이면 0개), 색 secondary }, sleeves·cap 은 primary/secondary 에서 유도. key(마주 id)의 결정적 문자열 해시로 일부(약 1/4)만 몸통 둘째 층 또는 소매 무늬·모자 무늬를 붙인다 — rng·상태 변경 없음(도안: 'AI 는 층 2개 일부만').
   - `discPatternOf(design): SilksPattern` — 몸통 첫 층을 원판 8종으로 축약(hoop/hoops→hoops, stripes/braces/seams→stripes, sash/cross_belts→sash, chevron(s)→chevrons, quartered/halves_*/check→quartered, *spots/disc→spots, star(s)→star, 그 밖 plain). 표는 상수로.
   - `silksFromDesign(design): Silks` — 위 규칙으로 primary·secondary·pattern 을 채우고 design 을 깊은 복사로 담는다.
   - `validateSilksDesign(design): SilksDesignError | null` — 층 수 0~2 초과, '#rrggbb' 소문자 아님, 목록에 없는 무늬. 오류 유형은 이 파일에 문자열 유니언으로.
   - `setPlayerSilks(state, design): { ok: true; state } | { ok: false; error }` — 플레이어 마주 silks 를 바꾼다(원본 불변). 이미 만든 레이스 출주표(race entries·결과)의 silks 는 바꾸지 않는다(다음 출주부터).
2. state/newGame.ts: `opts.silks` 의 design 을 깊은 복사(공유 참조 금지). 그 밖 변경 금지.
3. `src/ui/silks/SilksSvg.tsx`(신규) — 도안 형식 SVG(몸통·양 소매·모자, 앞모습). 부분마다 바탕 → 층1 → 층2 순, 부분 모양으로 clip. 무늬 53종 모두 그린다(기하 비율은 파일 상단 상수). props: `design`, `size`.
4. `src/ui/silks/SilksEditor.tsx`(신규) — 부분 탭(몸통/소매/모자) × 바탕색 + 층 1·2(무늬 select + 색 선택, 층 추가·삭제), 팔레트(기존 SILK_PALETTE 를 쓰거나 같은 성격의 상수) + 자유 색 입력, 실시간 SilksSvg 미리보기, '무작위' 버튼(UI 에서만, 시드 없는 무작위 허용 — 엔진 아님). 무늬 이름 한글은 `src/ui/silks/silksText.ts`(신규) 표(도안 용어: 단색·가로띠 한 줄·가로띠 여러 줄·세로줄·멜빵·X띠·어깨띠·다이아몬드 하나/여러 개·트리플 다이아몬드·셰브런 하나/여러 개·견장·반반(세로/가로)·역삼각형·삼각형·큰 점·작은 점·4분할·이음선·별 하나/여러 개·체크·원판·로렌 십자·디아볼로·칼라색·테두리 / 소매: 단색·가로띠 여러 줄·세로줄·팔띠 하나·팔띠 두 줄·셰브런·다이아몬드·점·별·이음선·반반·체크·커프스 / 모자: 단색·가로띠·세로줄·4분할·점·별 하나·별 여러 개·다이아몬드·체크·챙색·방울색).
5. 새 게임 폼(BreedingScreen.tsx NewGamePanel): 승부복 편집기 추가, 기본값은 지금 PLAYER_SILKS 를 silksDesignOf 로 만든 설계. `NewGameInput` 에 `silks: Silks` 를 더하고 useGame.newGame 은 그 값을 bootstrapGame 에 넘긴다(PLAYER_SILKS 는 기본값으로만).
6. 게임 중 변경: useGame 에 `setSilks(design)` 추가(setPlayerSilks 호출, 저장). 플레이어가 찾기 쉬운 기존 화면(마주 정보·마구간 등 적당한 곳)에 '승부복 바꾸기' 버튼 → 편집기.
7. 다른 화면에서 승부복을 보여 주는 곳(출주표·마주 목록 등 지금 원판이나 색 칩을 쓰는 곳)이 있으면 작은 SilksSvg 로 바꿔도 된다(선택, 보고). 레이스 띠 원판은 지금처럼 primary·secondary·pattern 으로 그린다.
8. 테스트: `tests/engine/silksDesign.test.ts`(유도·축약·검증·setPlayerSilks 불변), `tests/ui/silksSvg.test.ts`(53종 무늬 모두 오류 없이 SVG 요소 생성, 층 순서).

## 수용 기준
1. silksDesignOf: design 없는 Silks 에서 같은 key 2회 동일, body.base = primary, 기존 pattern 이 몸통 첫 층으로 옮겨짐(plain 은 층 0), 시드 20261011 새 게임 AI 마주 중 둘째 층·소매/모자 무늬가 붙은 비율 15~35%(측정 보고). 게임 상태·rng 를 바꾸지 않는다.
2. silksFromDesign → discPatternOf 표대로 pattern, primary = body.base. validateSilksDesign 이 층 3개·대문자 색·잘못된 무늬를 거른다.
3. setPlayerSilks: 플레이어 마주만 바뀌고 원본 불변, 기존 레이스 결과의 silks 그대로.
4. 새 게임에서 고른 승부복이 플레이어 마주 silks.design 으로 들어가고 저장·불러오기 후 같다(저장 버전 그대로).
5. 기존 고정 해시 테스트 전부 그대로 통과(AI 생성·공용 rng 무변경). `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 병행 작업 파일 수정 금지. 엔진에 Math.random·Date.now 금지(UI 무작위 버튼만 예외). 실제 마주의 실존 승부복을 기본값·예시로 넣지 말 것(원칙 1). 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (1 은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/silksDesign.test.ts tests/ui/silksSvg.test.ts && npm test && npm run typecheck && npm run lint && npm run build
