# M4-E3 경주마 이름 등록 · 목장 이름 짓기

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 사용자 결정 2026-10-16: 경주마 '무명 → 2세 조교 전 등록', 목장 이름 '새 게임 + 목장 화면에서 변경'. 여러 나라 목장 동시 소유(최대 3)는 호주·미국 등 추가 때로 보류(이 티켓 범위 아님).

목적: 플레이어 생산마는 태어날 때 이름 없이(무명 표기) 지내다가 플레이어가 후보에서 고르거나 직접 입력해 등록하고, 2세 조교 전까지 안 지으면 자동 등록된다. 목장 이름은 새 게임·목장 화면·목장 구매/이전 때 정할 수 있다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- `Horse.nameRegistered?: false` — false 면 미등록(이름 후보를 name 에 갖고 있음). 없으면 등록됨(기존·AI 말 전부, 저장 마이그레이션 없음).
- GameEvent `'horse_named' { horseId; name; auto: boolean; date }` (text.ts 문구는 이미 있음)
- 이름 엔진: naming/generate.ts `suggestNames(ctx, data, rng, count, …)`·`nameForHorse`, naming/validate.ts `validateHorseName(name, registry, protectedNames, blockedPlaceTokens)`, naming/context.ts `namingContextFor`·`makeNameRegistry`
- 기존: breeding/season.ts 망아지 출산(nameForHorse 로 이름), season/player.ts `assignTrainer`(yearling → in_training 전환, PLAYER_TRAINING_START_AGE), state/newGame.ts `NewGameOptions.studName`, farm/purchase.ts `purchaseFarm`, state.farm.name, owner.studName

## 범위
1. 망아지 출산: 플레이어 소유 망아지는 지금처럼 nameForHorse 로 이름을 정하되(공용 rng 소비 순서 그대로) `nameRegistered: false` 를 붙인다. AI 망아지는 그대로.
2. `src/engine/naming/register.ts`(신규, 순수):
   - `unnamedLabel(state, horse): string` — 무명 표기 '어미명 + 출생 연도 뒤 두 자리'(예: "Silver Tide 27", 사용자 결정 2026-10-16 — 성별 없음; 어미 없으면 "무명 27"). 화면은 이 함수로만 무명 이름을 보인다.
   - `displayName(state, horse)` — 등록됐으면 name, 아니면 unnamedLabel.
   - `nameSuggestions(state, horseId, count = 8): string[]` — 그 말의 혈통 문맥으로 suggestNames, 독립 스트림 `${initialSeed}:name-suggest:${horseId}:${round}`(round = 같은 말에서 '다른 후보' 누른 횟수 — 인자로 받는다), 현재 name 후보는 첫 줄에 포함.
   - `registerHorseName(state, horseId, name): { ok: true; state; events } | { ok: false; error: 'not_found' | 'not_player' | 'already_registered' | NameRejectReason }` — 미등록 플레이어 말만, validateHorseName(지금 자기 자신의 후보 이름은 중복에서 제외) 통과 시 name 교체·nameRegistered 삭제·이벤트(auto false). 원본 불변, eventLog 는 호출자.
   - 자동 등록: 플레이어 말이 yearling → in_training 으로 바뀌는 곳(assignTrainer)과, 3세 이상이 되도록 미등록인 말(안전장치, 연초 1주)을 시스템 없이 처리할 수 있는 기존 지점 하나에서 nameRegistered 를 지우고 'horse_named'(auto true). 출주 신청은 미등록 말이면 거절(오류 'unnamed' — 경주 출주 API 의 오류 유니언에 추가, 화면 문구 포함).
3. 화면 전반: 말 이름을 보이는 곳(번식·배합, 시즌, 세일 위탁, 연말 정산, 목장 등)에서 플레이어 말은 displayName 을 쓴다(AI 말은 그대로 name). 다 바꾸기 어려우면 주요 목록(번식·배합 내 말 목록, 시즌 내 말, 연말 정산, 세일 위탁)만 하고 나머지 보고.
4. 이름 짓기 화면: 번식·배합 화면의 내 말 목록에서 미등록 말 옆 '이름 짓기' → 패널(후보 8개 버튼 + '다른 후보' + 직접 입력 + 검증 오류 한글 문구 + 등록 버튼). '2세 조교 전까지 등록, 안 하면 자동 등록' 안내. useGame 에 `registerHorseName(horseId, name)`·`nameSuggestions(horseId, round)` 추가.
5. 목장 이름:
   - `NewGameOptions.farmName?: string` — 오너브리더는 farm.name = owner.studName = farmName(비우면 지금처럼 자동 가상 이름 또는 기존 규칙). difficulty 생략 시 기존 결과 불변(고정 해시).
   - `src/engine/farm/naming.ts`(신규): `validateFarmName(state, name): FarmNameError | null` — 앞뒤 공백 제거 2~30자, 글자·공백·하이픈·아포스트로피·마침표만, 다른 마주 studName·생산자 이름과 중복 금지, 보호 명단(data/naming/protected.json)·경마장 지명 차단 토큰 포함 금지(원칙 1 보조 장치). `renameFarm(state, name)` — 목장이 있을 때 farm.name·owner.studName 변경, 원본 불변.
   - `purchaseFarm(state, listingId, name?)` 선택 인자 — 주면 검증 후 그 이름, 없으면 매물 이름(기존 그대로).
   - 화면: 새 게임 폼에 '목장 이름'(오너브리더일 때, 빈칸 = 자동), 목장 화면 머리에 이름 바꾸기, 매물 구매/이전 확인 단계에 이름 입력(기본값 매물 이름).
6. 테스트: `tests/engine/horseNaming.test.ts`(출산 시 미등록·AI 영향 없음·등록 검증 오류·자동 등록·출주 거절·무명 표기·후보 결정성), `tests/engine/farmNaming.test.ts`, UI 순수 함수 테스트 필요 시.

## 수용 기준
1. 시드 고정 2년 진행: 플레이어 망아지는 nameRegistered false 로 태어나고 AI 말에는 필드가 없다. 공용 rng 상태·레이스 결과·AI 말은 이 티켓 전과 같다(고정 해시 중 플레이어 말 JSON 을 포함하는 것만 바뀔 수 있음 — 바뀐 테스트와 이유 보고).
2. registerHorseName: 정상 등록·이벤트, 18자 초과·보호 명단·중복·이미 등록 → 각 오류. 자기 후보 이름 그대로 등록 가능.
3. yearling → in_training 시 미등록이면 자동 등록 + auto true 이벤트. 미등록 말 출주 신청 → 'unnamed'.
4. unnamedLabel 형식 테스트, nameSuggestions 같은 인자 2회 동일·round 가 다르면 다른 목록.
5. farmName: 새 게임 지정 이름 반영, validateFarmName 오류 유형별 테스트, renameFarm·purchaseFarm(name) 반영.
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 공용 rng 소비 순서 변경 금지(후보 생성은 독립 스트림). 실명 예시·기본값 금지. 새 의존성 금지. git commit 금지.

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
npx vitest run tests/engine/horseNaming.test.ts tests/engine/farmNaming.test.ts && npm test && npm run typecheck && npm run lint && npm run build
