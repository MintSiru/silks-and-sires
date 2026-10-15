# M4-D7b 부(父) 후보 풀: 은퇴 종마 제외 + AI 편입 종마

담당: Codex(gpt-6.1-sol, high) · 설계: m4-plan.md D7 · 병행: 다른 작업자가 M4-D7a(config/stud.ts, stud/rotation.ts, stud/fertility.ts, stud/trade.ts)를 수정 중 — 그 파일과 src/engine/state/systems.ts 는 건드리지 말 것

목적: 세계 현역마·세일 생산마의 부 선택이 (1) 그 교배 연도에 실제로 계류 중인 종마만 쓰고, (2) AI 현역마에서 종마로 편입된 종마도 쓰게 해 30년 동안 부 후보가 마르지 않게 한다.

## 사용할 타입·함수 (수정 금지)
- `Stallion.lastSeasonYear?: number`(이 시즌 뒤로 부 후보 아님), `Stallion.aiEntrant?: boolean`, `Horse.diedYear?`, `Stallion.firstSeasonYear`, `Stallion.fee`, `Stallion.standsIn`, `Stallion.sireLineId`
- `RealStallionRecord`(types/bloodline.ts), `canSireIn`·`coverYearForFoal`·`firstCoverYearOf`(world/sireWindow.ts), `TIER_FEE`·`PROFILE_DISTANCE`(config/world.ts), `buildStallionRecord(draft, horseId, year, standsIn)`(stud/stand.ts)
- 지금 부 선택: world/population.ts `liveSireRecords`·`pickSire`·`spawnRacingHorse`(사망만 거른다), sales/catalogue.ts `sireCandidatesFor`·`selectSire`·`sireTierOf`(정적 실명 레코드만, 상태 무시).

## 생성·수정할 파일 (5개 + 테스트)
1. `src/engine/world/sirePool.ts`(신규)
   - `tierFromFee(fee): 1|2|3|4|5` — TIER_FEE 와 로그 거리가 가장 가까운 등급(spawnRacingHorse 의 sireHorseId 경로와 같은 규칙, 그 코드를 이 함수로 바꿔도 된다).
   - `aiSireRecords(state): RealStallionRecord[]` — `aiEntrant` 종마마다 합성 레코드: key = horseId, foaled = 출생 연도, countryOfBirth·standsIn = stallion.standsIn, sireKey·damsireKey = null, sireLineId, status 'active', distanceProfile = 말 aptitude.distanceOptimum 에 가장 가까운 PROFILE_DISTANCE 키, surfaceProfile = 'turf', marketTier = tierFromFee(fee), confidence 'low', firstCoverYear = firstSeasonYear, lastCoverYear = lastSeasonYear(있으면). id 오름차순.
   - `standingInCoverYear(state, stallionKey, coverYear): boolean` — 말이 있고, diedYear 가 있으면 coverYear ≤ diedYear, lastSeasonYear 가 있으면 coverYear ≤ lastSeasonYear.
   - `sirePoolFor(state, records, coverYear): RealStallionRecord[]` — (정적 records ∪ aiSireRecords) 중 standingInCoverYear 인 것. 정적 records 순서를 유지하고 AI 를 뒤에 붙인다. 아무도 은퇴·사망하지 않았고 AI 편입도 없으면 records 를 그대로(같은 참조) 돌려준다 — 기존 결과가 바이트 단위로 같게.
2. `src/engine/world/population.ts` — liveSireRecords 를 sirePoolFor(state, records, coverYearForFoal(birthYear)) 로 바꾼다. AI 편입 부가 뽑히면 sireDistance 는 그 말의 aptitude.distanceOptimum(지정 종마 경로와 같게), tier 는 레코드의 marketTier.
3. `src/engine/sales/catalogue.ts` — sireCandidatesFor 가 sirePoolFor(ctx.state, ctx.activeRecords, coverYear) 를 쓰고(기존 filterSiresForCover 조건 유지), sireTierOf 는 정적 레코드가 없고 state.stallions 에 있으면 tierFromFee(fee).
4. `src/engine/world/populationSystem.ts` + `src/engine/config/population.ts`
   - config: `POPULATION_AI_STALLION_ENTRY_PER_YEAR = 10`, `POPULATION_AI_STALLION_MIN_VALUE = 100`(선발 기준값, OR 척도).
   - 연간 교체에서 조기 은퇴(종마 밴드)로 'retired' 가 된 수말 중 그해 은퇴한 거세 안 한 수말을 선발 기준값 내림차순(같으면 id 오름차순)으로 최대 ENTRY_PER_YEAR 두, 값 ≥ MIN_VALUE 만 종마로 편입: `draft.stallions[id] = { ...buildStallionRecord(draft, id, year, 경주 나라), aiEntrant: true }`, status 'stud', ownerId null, 마주 horseIds 에서 뺀다, trainerId null. 이벤트는 남기지 않는다(AI 말 은퇴 이벤트는 기존대로). 공용 난수 소비 순서는 바꾸지 않는다(편입은 난수를 쓰지 않음; buildStallionRecord 는 독립 스트림).
5. `tests/engine/sirePool.test.ts`(신규)

## 수용 기준
1. sirePoolFor: 2030 년에 lastSeasonYear 2028 인 종마는 coverYear 2029 후보에서 빠지고 2028 에는 남는다; diedYear 2027 이면 2028 부터 빠진다; 아무 변화 없으면 같은 참조를 돌려준다.
2. aiSireRecords: fee 30,000 → marketTier 3, 거리 프로필이 aptitude 와 맞고, firstCoverYear = firstSeasonYear.
3. 연간 교체: 시드 20261011 새 게임 1년(52주) 진행 뒤 aiEntrant 종마가 1~10두 생기고, 모두 status 'stud'·ownerId null·Stallion 레코드 있음. 2년 진행 뒤 신규 2세 중 부가 aiEntrant 인 말이 0두 이상(측정·보고), 세일 카탈로그 부 후보에 aiEntrant 가 들어갈 수 있다(단위 테스트로 sireCandidatesFor 경로 확인 가능하면).
4. 은퇴(status 'retired' + lastSeasonYear) 종마는 그 뒤 교배 연도의 신규 현역마·세일 생산마 부로 뽑히지 않는다(테스트에서 종마 하나를 은퇴 처리한 뒤 확인).
5. 같은 시드 2회 동일. `npm test && npm run typecheck && npm run lint` 통과. 깨지는 고정 해시 테스트(breeders·playerSireCrops·starterStrength·stallionTradeIntegration·sales 관련)가 있으면 원인이 이 티켓의 의도된 변화(AI 편입·은퇴 제외)뿐인지 확인한 뒤 값만 바꾸고, 바꾼 테스트와 이유를 보고한다.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 병행 파일(config/stud.ts, stud/rotation.ts, stud/fertility.ts, stud/trade.ts)과 state/systems.ts 수정 금지. git commit 금지. 새 의존성 금지. 매직 넘버는 config 로.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (3번은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/sirePool.test.ts && npm test && npm run typecheck && npm run lint
