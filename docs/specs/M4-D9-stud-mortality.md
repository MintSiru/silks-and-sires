# M4-D9 종마·번식 암말의 이른 사망

담당: haiku-coder · 설계: m4-plan.md D9(사용자 결정: 항상 켬, 실명 현역 종마도 사망 가능) · 병행: Codex 가 D8(stud/market.ts, config/stud.ts 의 FEE_* 상수) 작업 중 — 그 파일과 src/engine/state/systems.ts 는 건드리지 말 것(시스템 등록은 Opus)

목적: 종마와 번식 암말이 나이에 따라(고령일수록 높게) 또는 드문 사고·질병으로 죽을 수 있게 한다. 죽은 종마는 그 뒤 교배 연도의 부가 될 수 없고, 혈통에는 남는다.

## 사용할 타입·함수 (수정 금지)
- `Horse.status`('dead'), `Horse.diedYear?: number`(types/horse.ts, 이미 있음), `Mare { coveredBy; pregnant; bookedFor? }`, GameEvent `'horse_died'`(cause: 'age' | 'accident' | 'illness').
- `recordMoney`(장부 'stud_fee_paid' 환불), `createRng(label)`.
- world/population.ts 의 `spawnRacingHorse`(부 후보 records 를 넘긴다).

## 생성·수정할 파일 (4개)
1. `src/engine/config/mortality.ts`(신규) — 주석 근거 1줄씩:
   - `MORTALITY_CHECK_WEEK = 30`(번식 시즌이 끝난 뒤 한 번 판정)
   - 나이별 연간 사망 확률 `MORTALITY_BY_AGE`: [[0, 0.004], [15, 0.02], [20, 0.06], [25, 0.15], [28, 0.3]] — 그 나이 이상이면 해당 값(계단식).
   - `MORTALITY_AGE_CAUSE_FROM = 20`(20세 이상 사망은 'age', 미만은 accident/illness 반반)
2. `src/engine/stud/mortality.ts`(신규)
   - `annualDeathChance(age: number): number`
   - `createMortalitySystem(): WeeklySystem`(id 'mortality') — week === MORTALITY_CHECK_WEEK 에만. 대상: status 'stud' 또는 'broodmare' 인 말, id 오름차순. rng = `createRng(\`${state.initialSeed}:mortality:${horseId}:${year}\`)`: chance(annualDeathChance(나이)) 이면 사망. 원인: 나이 ≥ CAUSE_FROM 이면 'age', 아니면 rng.next() < 0.5 ? 'accident' : 'illness'.
   - 사망 처리: status 'dead', diedYear = year, trainerId null.
     - 종마였으면: 그 종마에 걸린 미수태 교배(mare.coveredBy === id 이고 임신 아님)와 사전 예약(bookedFor.stallionId === id)을 지우고, 소유자가 종마 소유자와 다르면 종부료 환불(장부 'stud_fee_paid' +fee).
     - 번식 암말이었으면: 임신 중이면 유산(pregnant false, dueWeek null), 사전 예약·미수태 교배는 지우고 환불(같은 규칙).
   - 이벤트 'horse_died' 는 플레이어 소유 말 또는 실명 종마(state.stallions[id].realKey !== null)만.
3. `src/engine/world/population.ts` — spawnRacingHorse 가 pickSire 에 넘기는 records 에서, state.horses[r.key]?.diedYear 가 있고 교배 연도(출생 − 1) > diedYear 인 기록을 뺀다. 죽은 종마가 없으면 records 그대로(지금과 같은 결과).
4. `tests/engine/mortality.test.ts`(신규)

## 수용 기준
1. annualDeathChance: 10세 0.004, 16세 0.02, 22세 0.06, 26세 0.15, 30세 0.3.
2. 시드 20261011 새 게임 10년(테스트 안에서 기존 시스템 + 이 시스템) 진행 후 보고: 현역 실명 종마 중 사망 두수, 사망 나이 중앙값. 기준: 사망 두수 5~60, 사망 나이 중앙값 ≥ 18.
3. 종마 사망 시 그 종마의 미수태 교배·사전 예약 환불(장부 합 확인), 그 종마는 사망 다음 해 교배 연도의 부로 쓰이지 않는다(테스트로 강제 사망 후 인구 투입 확인).
4. 같은 시드 2회 동일. 사망이 없으면(테스트에서 확률 0 으로 만든 경우) 결과가 지금과 같다.
5. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. src/engine/state/systems.ts·stud/market.ts·config/stud.ts 수정 금지. 기존 rng 소비 순서 변경 금지. git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2번은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/mortality.test.ts && npm test && npm run typecheck && npm run lint
