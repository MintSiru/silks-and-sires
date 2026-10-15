# M4-D5b 종마 관측 수태율·저수태 판명·저수태 은퇴

담당: haiku-coder · 설계: m4-plan.md D5 · 사용자 결정(2026-10-15): 현실형 — 18세부터 연 −2%p, 첫 시즌 저수태 판명 약 2%, 관측 수태율 60% 미만 2시즌 연속이면 AI·실명·국내 판매 종마는 은퇴, 내 종마는 경고 후 플레이어 선택.

목적: 모든 종마의 시즌별 관측 수태 기록을 남기고(공개 수태율), 저수태 종마가 시장에서 빠지게 한다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- `Stallion.fertilityHistory?: StallionFertilitySeason[]`, `StallionFertilitySeason { year; covers; conceptions }`
- GameEvent `'stallion_subfertile' { stallionId; fertility; date }`, `'stallion_fertility_warning' { stallionId; rate; date }`, `'stallion_pensioned' { stallionId; reason: 'fertility' | 'player'; date }`, 기존 `'horse_status_changed'`
- 기존: `StudSeasonRecord`(state.stud.seasons — 플레이어·국내 판매 종마의 27주 정산 기록, outsideCovers·conceptions), `Stallion.bookedThisSeason`·`bookingSeason`·`fertility`·`firstSeasonYear`·`leasedAwayUntil`, `createRng`, `recordMoney` 불필요.

## 생성·수정할 파일 (4개 + 테스트)
1. `src/engine/config/stud.ts`
   - 바꿈: `FERTILITY_DECLINE_FROM_AGE = 18`, `FERTILITY_DECLINE_PER_YEAR = 0.02`(사용자 결정 2026-10-15 현실형). 주석 갱신.
   - 추가: `SUBFERTILE_CHANCE = 0.02`, `SUBFERTILE_MIN = 0.35`, `SUBFERTILE_MAX = 0.55`, `SUBFERTILE_CHECK_WEEK = 7`(번식 시즌 첫 주), `FERTILITY_RECORD_WEEK = 28`(27주 정산 다음 주), `FERTILITY_HISTORY_LIMIT = 5`, `FERTILITY_RETIRE_RATE = 0.6`, `FERTILITY_RETIRE_SEASONS = 2`, `FERTILITY_MIN_SAMPLE = 10`(이보다 적은 교배 시즌은 은퇴 판정에서 제외), `PUBLIC_FERTILITY_SEASONS = 3`, `PUBLIC_FERTILITY_FULL_SAMPLE = 40`, `PUBLIC_FERTILITY_STEP = 0.05`.
2. `src/engine/stud/market.ts` — reviewFee 의 수태율 감소: 지금 fertility 가 FERTILITY_FLOOR 이하면 그대로 두고(저수태 종마를 바닥값으로 올리지 않는다), 아니면 지금처럼 max(FLOOR, fertility − PER_YEAR). 그 밖은 그대로.
3. `src/engine/stud/fertility.ts`(신규)
   - `observedRate(history, seasons): { covers: number; conceptions: number }` — 마지막 seasons 개 시즌 합.
   - `publicFertility(stallion): { kind: 'none' } | { kind: 'estimate'; rate: number } | { kind: 'range'; low: number; high: number } | { kind: 'exact'; rate: number }` — 기록이 없으면 `estimate`(실제 fertility 를 STEP 단위 반올림, '약 n%' 표시용). 최근 PUBLIC_FERTILITY_SEASONS 시즌 합 covers ≥ FULL_SAMPLE 이면 `exact`(conceptions/covers, 소수 2자리), 0 < covers < FULL_SAMPLE 이면 `range`: p = conceptions/covers, 반폭 = sqrt(p(1−p)/covers) 와 STEP 중 큰 값, low/high 를 STEP 단위로 내림/올림하고 [0,1] 로 자른다. covers 0 이면 estimate. 순수 함수.
   - `retirePlayerStallion(state, horseId): { ok: true; state; events } | { ok: false; error: 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased' }` — 플레이어 종마(status 'stud', 플레이어 소유)를 STUD_DEAL_FIRST_WEEK~STUD_DEAL_LAST_WEEK 에 은퇴시킨다. 임대 중(state.stud.leases)이면 'leased'. 적용: status 'retired', ownerId null, 플레이어 horseIds 에서 뺀다(종마사 칸이 빈다). 이벤트 horse_status_changed + stallion_pensioned(reason 'player'). 원본 불변(structuredClone).
   - `createStudFertilitySystem(): WeeklySystem`(id 'stud_fertility'), 난수는 말마다 독립 스트림만:
     a. week === SUBFERTILE_CHECK_WEEK: status 'stud' 이고 firstSeasonYear === year 인 종마마다 `createRng(\`${initialSeed}:subfertile:${id}\`)` 로 chance(SUBFERTILE_CHANCE) 면 fertility = 소수 3자리 반올림 uniform(MIN, MAX)(rng.next() 사용). 플레이어 소유 또는 realKey 있는 종마면 'stallion_subfertile' 이벤트.
     b. week === FERTILITY_RECORD_WEEK: status 'stud' 이고 그 시즌(year)에 북반구에서 교배한 종마(bookingSeason === year 이고 leasedAwayUntil 이 없거나 year ≥ leasedAwayUntil)마다 기록을 남긴다. 그해 state.stud.seasons 에 그 종마 기록이 있으면 covers = outsideCovers, conceptions = 그 기록의 conceptions. 없으면 covers = bookedThisSeason, conceptions = `createRng(\`${initialSeed}:fert-obs:${id}:${year}\`)` 로 covers 번 chance(fertility) 센 값. covers 0 이면 기록하지 않는다. fertilityHistory 끝에 붙이고 최근 FERTILITY_HISTORY_LIMIT 개만 둔다.
     c. 같은 주에 b 뒤 판정: 마지막 FERTILITY_RETIRE_SEASONS 개 기록이 모두 covers ≥ MIN_SAMPLE 이고 conceptions/covers < RETIRE_RATE 이며 그 기록들이 연속 연도(마지막이 그해)면 — 플레이어 소유면 'stallion_fertility_warning'(rate = 그 시즌들 합 비율, 소수 2자리) 만, 아니면 status 'retired'(ownerId 는 그대로), 'horse_status_changed' 와 'stallion_pensioned'(reason 'fertility') — 이벤트는 realKey 있는 종마·국내 판매 종마(state.stud.sales 의 domestic)만.
4. `tests/engine/studFertility.test.ts`(신규) + 기존 `tests/engine/feeReview.test.ts` 의 나이·수태율 기대값이 새 상수 때문에 바뀌면 새 식으로 다시 계산해 고친다(바꾼 줄 보고).

## 수용 기준
1. publicFertility: 기록 없음 → estimate(0.85 → 0.85, 0.83 → 0.85), 합 covers 100·conceptions 84 → exact 0.84, covers 20·conceptions 14 → range(low ≤ 0.7 ≤ high, STEP 배수).
2. 저수태 판명: 테스트에서 SUBFERTILE_CHANCE 를 대신해 같은 스트림으로 판명되는 종마를 찾거나 시드를 골라, 판명된 종마 fertility 가 0.35~0.55, 판명 안 된 종마는 불변임을 확인. firstSeasonYear ≠ year 인 종마는 판정하지 않는다.
3. 기록: 28주에 status 'stud' 종마에 그해 기록이 생기고, 플레이어 종마는 stud.seasons 의 수와 같다. 장기 임대 중 시즌은 기록 없음. 같은 시드 2회 동일.
4. 은퇴: 두 시즌 연속 0.5 관측인 AI 종마는 28주에 status 'retired', 플레이어 종마는 경고 이벤트만 나오고 status 유지. 한 시즌만 미달이거나 covers < 10 인 시즌이 끼면 은퇴하지 않는다.
5. retirePlayerStallion: 30주 성공(종마사 빈 칸 +1, ownerId null), 10주 outside_deal_window, 임대 중 leased.
6. reviewFee: fertility 0.4(바닥 아래)인 20세 종마는 0.4 유지, 0.8 인 20세는 0.78.
7. 이 시스템을 넣어도 52주 진행 raceResults 가 넣기 전과 같다(공용 난수 미사용). `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면(src/ui) 수정 금지. src/engine/state/systems.ts 수정 금지(등록은 Opus — 테스트에서는 시스템 목록에 직접 넣어 확인). 공용 난수(ctx.rng) 사용 금지. git commit 금지. 새 의존성 금지. 매직 넘버는 config/stud.ts 로.

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
npx vitest run tests/engine/studFertility.test.ts tests/engine/feeReview.test.ts && npm test && npm run typecheck && npm run lint
