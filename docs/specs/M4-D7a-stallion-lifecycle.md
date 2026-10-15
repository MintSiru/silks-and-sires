# M4-D7a 종마 계류 종료 연도 기록·고령 은퇴

담당: Codex(gpt-6.1-sol, high) · 설계: m4-plan.md D7 · 병행: 다른 작업자가 M4-D7b(world/sirePool.ts, world/population.ts, world/populationSystem.ts, sales/catalogue.ts, config/population.ts)를 수정 중 — 그 파일과 src/engine/state/systems.ts 는 건드리지 말 것(시스템 등록은 Opus)

목적: 종마가 계류를 끝내는 모든 경로에서 마지막 시즌(`Stallion.lastSeasonYear`)을 남기고, 실명·AI 종마가 나이에 따라 은퇴하게 해 시장이 늙지 않게 한다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- `Stallion.lastSeasonYear?: number` — 북반구에서 마지막으로 교배한 시즌. 이 시즌 뒤로는 자마의 부 후보가 아니다.
- `Stallion.aiEntrant?: boolean` — AI 현역마에서 편입된 종마(D7b 가 만든다).
- GameEvent `'stallion_pensioned' { stallionId; reason: 'fertility' | 'player' | 'age'; date }`, `'horse_status_changed'`.

## 생성·수정할 파일 (4개 + 테스트)
1. `src/engine/config/stud.ts` — 추가(주석 근거 1줄씩):
   - `STUD_PENSION_CHECK_WEEK = 28`(시즌 정산 다음 주, 관측 수태 기록과 같은 주)
   - `STUD_PENSION_BY_AGE: readonly (readonly [minAge: number, chance: number])[] = [[20, 0.15], [23, 0.3], [26, 0.6]]`(계단식, 나이 = 그해 − 출생 연도)
   - `STUD_PENSION_LOW_FEE = 2_000`, `STUD_PENSION_LOW_FEE_MIN_AGE = 12`, `STUD_PENSION_LOW_FEE_CHANCE = 0.3`(AI 편입 종마 중 종부료가 이 값 이하로 내려간 노장은 시장에서 빠진다)
2. `src/engine/stud/rotation.ts`(신규)
   - `pensionChance(stallion, age): number` — 나이 계단 확률과(AI 편입 종마면) 저종부료 확률 중 큰 값.
   - `createStudRotationSystem(): WeeklySystem`(id 'stud_rotation') — week === STUD_PENSION_CHECK_WEEK 에만. 대상: horse.status 'stud' 이고 플레이어 소유가 아닌 종마(실명·AI 편입·국내 판매 종마), id 오름차순. `createRng(\`${initialSeed}:stud-pension:${id}:${year}\`)` 로 chance(pensionChance) 면 status 'retired', `lastSeasonYear = year`. 장기 임대 중(leasedAwayUntil > year)인 종마도 같은 규칙(임대는 플레이어 종마만이라 해당 없음). 이벤트는 realKey 있는 종마·국내 판매 종마(state.stud.sales domestic)만 'horse_status_changed' + 'stallion_pensioned'(reason 'age'). 공용 난수 미사용.
3. `src/engine/stud/fertility.ts` — judgeRetirement 의 AI·실명 은퇴와 retirePlayerStallion 에서 `lastSeasonYear = year`(그 은퇴의 연도)를 남긴다.
4. `src/engine/stud/trade.ts` — 해외 판매(applyStallionSale mode 'overseas')로 Stallion 레코드가 있는 종마가 빠질 때 `lastSeasonYear = date.year`. 장기 임대가 끝나지 않은 채 말이 은퇴·사망하는 경우는 바꾸지 않는다.
5. `tests/engine/studRotation.test.ts`(신규)

## 수용 기준
1. pensionChance: 19세 0, 20세 0.15, 24세 0.3, 27세 0.6; AI 편입 종마 fee 2,000·13세 → 0.3, 실명 종마 같은 조건 → 0.
2. 시스템: 28주가 아니면 상태 불변. 28주에 플레이어 종마는 대상이 아니다. 은퇴한 종마는 status 'retired'·lastSeasonYear = 그해, 실명 종마만 이벤트 2개. 같은 시드 2회 동일, 공용 rng 상태 불변.
3. 저수태 은퇴·플레이어 직접 은퇴·해외 판매에 lastSeasonYear 가 남는다(기존 테스트 파일 studFertility·stallionTrade 에 단언 추가 가능).
4. 시드 20261011 새 게임 10년(520주, 이 시스템을 넣은 createGameSystems 목록 — 테스트 안에서 구성, `it.skipIf(!process.env.VERIFY)`)에서 실명 현역 종마(시작 때 status 'stud') 중 10년 뒤에도 계류 중인 비율과 은퇴·사망 수를 측정해 보고한다(기준 없음, 보고만).
5. `npm test && npm run typecheck && npm run lint` 통과. 이 시스템을 넣지 않은 기존 고정 해시 테스트는 바뀌지 않아야 한다(등록은 Opus 가 하므로).

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 병행 파일(world/sirePool.ts, world/population.ts, world/populationSystem.ts, sales/catalogue.ts, config/population.ts)과 state/systems.ts 수정 금지. 공용 난수 사용 금지. git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (4번은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/studRotation.test.ts && VERIFY=1 npx vitest run tests/engine/studRotation.test.ts && npm test && npm run typecheck && npm run lint
