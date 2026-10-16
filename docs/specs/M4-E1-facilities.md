# M4-E1 목장 시설 9종: 공사·유지비·효과 (엔진)

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 사용자 승인 2026-10-16(시설 확장 9종, 수치안 그대로)
병행: haiku-coder 가 M4-E0b(목장 매물·구매·수용 한도: 새 파일 economy/farm.ts 또는 farm/purchase.ts, stud/yearEnd.ts, sales 구매 경로)를 다른 작업 트리에서 진행 — 그 파일과 src/ui, src/engine/types, src/engine/state/systems.ts 는 건드리지 말 것(시스템 등록은 Opus).

목적: 플레이어 목장 시설을 공사(비용·4주)로 올리고, 유지비를 내고, 각 시설 효과를 기존 시스템에 곱하는 보정으로 넣는다.

## 사용할 타입·상수 (수정 금지)
- types/farm.ts: `FacilityKind`(9종), `FarmState { owned; country; size; name; facilities: Record<FacilityKind, number>; acquiredYear; construction?: { facility; level; readyWeekKey } | null }`, `GameSettings`
- GameEvent `'facility_upgraded' { facility; level; cost; date }`, LedgerCategory `'facility'`
- config/farm.ts: `FACILITY_KINDS`, `FACILITY_MAX_LEVEL`, `FACILITY_UPGRADE_COST`(인덱스 = 목표 단계), `FACILITY_COST_MULT`, `FACILITY_UPKEEP_PER_LEVEL_YEAR`, `FACILITY_BUILD_WEEKS`, `STABLE_BLOCK_CAPACITY_BONUS`(E0b 가 수용 한도에 씀 — 이 티켓은 값만 둔다)
- `recordMoney`, `canSpendDiscretionary`, `weekKey`, 기존 시스템: 성장(growth), 컨디션(horse/conditioning.ts), 부상(horse/injury.ts·config/injury.ts — VET_EXAM_COST, INJURY_AUTO_DIAGNOSE_WEEKS, 계절 가중), 번식 질환(stud/health.ts 유산), 종마 칸(state.stud.slots·stud/stand.ts freeStudSlots), 정기 비용 시스템(costs)

## 범위
1. `src/engine/farm/facilities.ts`(신규)
   - `facilityLevel(state, kind): number` — 목장이 없으면 0, 공사 중인 목표 단계는 아직 반영 안 됨.
   - `upgradeCost(kind, targetLevel): Money` — FACILITY_UPGRADE_COST[target] × (FACILITY_COST_MULT[kind] ?? 1).
   - `startFacilityUpgrade(state, kind): { ok: true; state; events } | { ok: false; error: 'no_farm' | 'max_level' | 'under_construction' | 'insufficient_funds' }` — 한 번에 하나, 비용 즉시 지불(장부 'facility'), construction = { facility, level: 현재+1, readyWeekKey: 지금 + FACILITY_BUILD_WEEKS }. 이벤트는 돌려주기만(eventLog 는 호출자 몫). 원본 불변.
   - `createFacilitiesSystem(): WeeklySystem`(id 'facilities') — readyWeekKey 주가 되면 facilities 반영 + 'facility_upgraded'(cost 0 = 완공 알림; 착공 이벤트와 구분해 cost 를 착공 때 비용으로 남겨도 된다 — 하나로 정해 보고), 매주 유지비 = 단계 합 × FACILITY_UPKEEP_PER_LEVEL_YEAR / 52(정수 반올림, 장부 'facility'). 종마사 단계 변경 시 state.stud.slots = max(1, 종마사 단계)(단계 0·목장 없음이면 1 유지 — 기존 기본 1칸).
2. 효과(모두 플레이어 소유 말만, 단계 L = facilityLevel, L=0 이면 지금과 같은 결과):
   | 시설 | 효과 |
   |---|---|
   | paddock 방목지 | 망아지·1세 능력 성장 × (1 + 0.04L) |
   | pool 수영장 | 휴양(status 'resting') 말 피로 회복 × (1 + 0.2L), 부상 회복 주마다 확률 0.1L 로 weeksOut 1 추가 감소(독립 스트림) |
   | hill_gallop 언덕 코스 | 1세·조교 전 2세 스태미나 성장 × (1 + 0.05L) |
   | indoor_school 실내 마장 | 겨울(11~2월 주) 휴양마·어린 말의 컨디션 저하 × (1 − 0.25L)(겨울 저하가 없으면 이 줄은 생략하고 보고), 호흡기 감염(respiratory) 가중치 × (1 − 0.15L) |
   | vet_clinic 검사 설비 | 검사비 × (1 − 0.25L), 숨김 부상 자동 확진 주 −L(최소 1), 부상 발생 확률 × (1 − 0.05L) |
   | stallion_barn 종마사 | 종마 칸 = L(위 1번) |
   | stable_block 마방 증축 | (E0b 가 수용 한도에 씀) |
   | yearling_complex 육성 시설 | 1·2세(조교 전) 스피드·순발력 성장 × (1 + 0.03L), 처음 조교에 들어갈 때 fitness + 10L(상한 지킴) |
   | foaling_unit 산실 | 번식 암말 유산(stud/health.ts) 확률 × (1 − 0.2L), 출산 사고가 있으면 같은 배수 |
   보정 계수는 config/farm.ts 에 상수로(근거 주석: 사용자 승인 수치안).
3. 시스템 등록은 하지 않는다(Opus). 테스트에서는 시스템 목록에 직접 넣어 확인.
4. 테스트 `tests/engine/facilities.test.ts`(신규).

## 수용 기준
1. 공사: 비용·오류 4종·한 번에 하나·4주 뒤 완공·원본 불변. 종마사 2단계 완공 → stud.slots 2.
2. 유지비: 단계 합 6 이면 52주 동안 장부 'facility' 합이 €48,000 ± 52(반올림 오차).
3. 효과 단위 테스트: 각 시설 L=0 과 L=3 의 차이가 표의 배수와 맞는다(대표 1개씩). L=0 이면 기존 결과와 같다.
4. 시드 20261011 새 게임 52주를 시스템 포함/미포함으로 돌려 레이스 결과가 같다(시설은 플레이어 말·플레이어 장부만 바꾼다 — 단, 플레이어 말 부상 확률 변화로 플레이어 말 출주가 달라질 수 있으면 그 차이를 보고). 같은 시드 2회 동일.
5. `npm test && npm run typecheck && npm run lint` 통과. 기존 고정 해시는 시스템을 등록하지 않으므로 바뀌지 않아야 한다(효과 함수가 기본 목장 시설 1단계에서 이미 값을 바꾸면 — 지금 기본 목장은 시설 1단계다 — 그 영향과 바뀐 테스트를 보고하고, 의도된 변화면 값만 갱신).

## 금지
src/engine/types 수정 금지. 화면 수정 금지. E0b 병행 파일과 state/systems.ts 수정 금지. Math.random·Date.now 금지. 공용 rng 소비 순서 변경 금지(새 확률 판정은 독립 스트림). git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/facilities.test.ts && npm test && npm run typecheck && npm run lint
