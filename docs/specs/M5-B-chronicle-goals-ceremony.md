# M5-B 연대기 기록 · 왕조 목표 · 연말 시상식 보상

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/m5-plan.md (설계 결정 6~8)

목적: 플레이어 마주의 역사(첫 승부터 클래식·타이틀까지)와 세계 역사(그해 클래식 우승마)를 연대기로 남기고, 왕조 목표 진행을 계산하며, 연말 시상에서 플레이어 수상에 명성 보상을 준다.

## 사용할 타입·함수 (수정 금지, 이미 있음)
- types/legacy.ts: `ChronicleKind`, `ChronicleEntry`, `DynastyGoalProgress`; `GameState.chronicle?`
- legacy/chronicle.ts: `appendChronicle(draft, entry)`(id 자동·세계 항목 보존 연수 정리), `hasChronicle(state, kind, horseId?, raceId?)`
- config/legacy.ts: `CHRONICLE_WORLD_YEARS` (이 파일에 상수를 더해도 된다)
- 기존: `state.raceResults`(보존 정책상 그룹·리스티드·플레이어 출주만 남는다 — 이번 주 결과는 season 시스템이 그 주에 추가), RaceTemplate.tags('classic'), Race.grade, `awardsHistory`·이벤트 `awards_announced`(SeasonAwards: laurel·leading·leadingByCountry·seriesChampions), Horse.breederId(플레이어 생산 판정 — 플레이어 마주/목장의 생산자 id 는 기존 코드에서 찾는다), 세일 결과(sales 상태, 이벤트 sale_lot_result), 종마 전환(연말 정산 'stud' — Stallion 생성), relations.reputation(economy/relations.ts 의 명성 변경 함수)

## 범위
1. `src/engine/legacy/chronicleSystem.ts`: 주간 시스템 `createChronicleSystem(data)`(id 'chronicle', 등록은 Opus — season·sales 뒤를 제안), 그 주에 생긴 결과·이벤트를 보고 기록:
   - 플레이어 마주의 첫 출주(first_runner)·첫 승(first_win)·첫 그룹 우승(first_group_win) — 각각 한 번만.
   - 플레이어 소유 또는 플레이어 생산마의 그룹 우승(group_win, label=레이스 이름, count=그 말의 통산 그룹 승수), G1 우승(g1_win), 클래식 우승(classic_win, templateId).
   - 세계: 그해 클래식 우승마(world_classic, player=false, templateId·label) — 플레이어 말이면 classic_win 만 적고 world_classic 은 적지 않는다.
   - 연말 시상(awards_announced 가 나온 주): 플레이어 소유·생산마의 Laurel 수상(laurel_award, label=부문 키), 리딩 타이틀(leading_title: 마주·생산자·종마 범주에서 유럽 1~3위 또는 나라 1위 — label 에 범위와 순위를 'europe:1' 'GB:1' 형식으로), 시리즈 달성(series_champion).
   - 플레이어 생산마가 종마가 됨(homebred_stallion — 플레이어 종마든 AI 종마 편입이든), 세일 최고가(record_sale: 플레이어가 산 말 또는 플레이어가 판 말이 그해 그 세일 최고가일 때, amount).
   - 같은 사건을 두 번 적지 않는다(hasChronicle). 난수 미사용.
2. 연말 시상식 보상(같은 시스템 또는 별도 함수, 연말 시상 주): 위 laurel_award·leading_title·series_champion 각각에 명성 보상(config: 올해의 말 +8, 다른 Laurel +4, 유럽 리딩 1위 +6·2~3위 +3, 나라 리딩 1위 +3, 시리즈 +3, 한 해 합계 상한 +15). 명성 변경은 기존 relations 함수 사용(상한·하한 그대로).
3. `src/engine/legacy/goals.ts`(순수): `dynastyGoals(state, data): DynastyGoalProgress[]` — docs/m5-plan.md 설계 결정 7 의 12개 목표(목표 id·목표치는 config/legacy.ts 의 목록). progress/target 은 연대기·sireStats·awardsHistory·legacy(없으면 0)로 계산, doneYear 는 처음 달성한 연대기 항목의 해. 부계·모계 목표는 `state.legacy`(M5-C 가 채움)가 없으면 0/1.
4. useGame: `chronicle()`(복제본), `dynastyGoals()`.
5. 화면은 이 티켓에서 만들지 않는다(M5-E). text.ts 에 kind 별 한국어 문구 함수 `chronicleKo(entry, nameOf, ownerNameOf)` 만 추가(원칙 1: 가상 이름·종마 실명만).
6. 테스트: `tests/engine/chronicle.test.ts`, `tests/engine/dynastyGoals.test.ts`.

## 수용 기준
1. 결정성·공용 rng 불변·원본 불변(goals). 시스템 없는 게임과 레이스 결과 동일.
2. 고정 시드 2시즌 진행(시스템 등록 상태를 테스트에서 구성): 첫 출주·첫 승이 정확히 한 번씩, 플레이어 그룹 우승마다 group_win 한 줄, 그해 클래식 우승마가 world_classic(또는 플레이어 말이면 classic_win)으로 모두 기록(측정 보고: 2시즌 연대기 항목 수·종류별 수).
3. 연말 시상 보상이 수상 항목과 정확히 대응하고 한 해 상한을 지킨다(단위 테스트 — 수상 상황을 만들어서).
4. dynastyGoals: 12개 목표, 진행값이 연대기·통계와 일치(단위 테스트).
5. 세계 항목 보존 연수 정리 동작(appendChronicle 경유).
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). state/systems.ts 수정 금지(등록은 Opus). 공용 rng 사용 금지. 실명 문구 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용 (시스템 등록 위치 제안 포함)
```

## 테스트 명령
npx vitest run tests/engine/chronicle.test.ts tests/engine/dynastyGoals.test.ts && npm test && npm run typecheck && npm run lint && npm run build
