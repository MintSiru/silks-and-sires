# M4-H12 부상 14종 발생 모델·재발·영구 영향·진단·치료 선택 (엔진)

담당: Codex(gpt-6.1-sol, high — 기능 단위 티켓) · 설계: docs/m4-plan.md M4-H, 사용자 결정 2026-10-16(14종 목록 그대로)
병행: 다른 Codex 가 M4-H3(stud/mortality.ts, breeding/season.ts, 새 stud/health.ts, config/mortality.ts)을 별도 작업 트리에서 진행 — 그 파일과 src/engine/state/systems.ts 는 건드리지 말 것. 다른 작업자가 src/ui 를 만질 수 있다 — 화면 파일 수정 금지.

목적: 부상을 14종으로 넓히고(부위·기간·재발·영구 영향), 플레이어 말은 확진 전 단서 → 검사 → 치료 선택(휴양·치료·수술)을 거치게 한다.

## 사용할 타입 (수정 금지, 이미 추가됨 — src/engine/types)
- `InjuryKind`(14종), `InjuryRegion`, `InjuryTreatment = 'rest' | 'medical' | 'surgery'`
- `Injury { kind; weeksOut; diagnosed?; treatment?; since? }` — diagnosed 없음 = 확진, treatment 없음/null = 미선택(휴양으로 진행)
- `PermanentInjuryEffect { speed?; stamina?; formVariance? }`, `InjuryRecord { kind; since; weeks; treatment; permanent? }`
- `Horse.injuryHistory?: InjuryRecord[]`, `Horse.formVariance?: number`
- GameEvent `'horse_injured'`(기존), `'injury_suspected' { horseId; region; date }`, `'injury_diagnosed' { horseId; kind; weeksOut; date }`, `'injury_treated' { horseId; treatment; cost; weeksOut; date }`, `'horse_died'`(cause 'accident' | 'illness'), `'horse_status_changed'`
- LedgerCategory `'vet_fee'`, `recordMoney`(economy/ledger.ts), `canSpendDiscretionary`(자금 검사, 기존 예약 코드 참고)
- 지금 코드: horse/conditioning.ts(rollInjury·INJURY_TABLE·주간/출주 부상·회복), config/conditioning.ts(INJURY_TABLE 등), season/system.ts(플레이어 말 horse_injured 이벤트), race/runnerModel.ts(레이스 능력·난수)

## 범위(파일은 필요한 만큼, 10개 내외)
1. `src/engine/config/injury.ts`(신규) — 종류별 표 `INJURY_KINDS: Record<InjuryKind, InjuryKindDef>`(인터페이스도 이 파일에): region, 발생 가중치(훈련 중·출주 중 따로), 기간 minWeeks~maxWeeks, 재발 배수(같은 부위 병력이 최근 INJURY_RECUR_YEARS 안에 있으면 그 종류 가중치 × recurMult), 영구 영향 확률과 크기, 확진 전 숨김 여부(subtle), 치료 선택지(medical/surgery 각각 비용·기간 배수·재발/영구 영향 감소·성공률). 아래 기준표를 따르고, 수치는 주석에 근거 1줄:

   | 종류 | 부위 | 빈도 | 기간(주) | 재발 | 영구 영향 | 숨김 | 치료 |
   |---|---|---|---|---|---|---|---|
   | knock | general | 아주 흔함 | 1~3 | 낮음 | 없음 | 아니오 | rest |
   | sore_shins | bone | 흔함(2~3세만, 4세 이상은 knock) | 3~6 | 낮음 | 없음 | 아니오 | rest |
   | stress_fracture | bone | 보통 | 8~16 | 보통 | 없음 | 예 | rest·medical |
   | chip_fracture | joint | 보통 | 10~20 | 보통 | 스피드 소폭 | 예 | rest·surgery(관절경: 기간↓·영구 영향↓) |
   | fracture | bone | 드묾 | 30~52 | 높음 | 큼, AI 말은 은퇴 확률 | 아니오 | rest·surgery |
   | joint | joint | 보통 | 4~10 | 높음(만성) | 성적 기복 | 예 | rest·medical(주사: 기간↓) |
   | tendon | tendon | 보통(무른 마장↑) | 26~52 | 매우 높음 | 스피드·스태미나 큼 | 예 | rest·medical(줄기세포: 재발↓) |
   | suspensory | tendon | 보통 | 12~30 | 높음 | 소폭 | 예 | rest·medical |
   | foot | foot | 흔함(단단한 마장↑) | 1~6 | 보통 | 없음 | 아니오 | rest·medical(장제: 기간↓) |
   | bleeding | respiratory | 보통(출주 중만) | 2~6 | 높음 | 성적 기복 | 아니오 | rest |
   | respiratory | respiratory | 흔함(11~3월↑) | 2~4 | 낮음 | 없음 | 아니오 | rest·medical(투약: 기간↓) |
   | laryngeal | respiratory | 드묾 | 1~2 | 지속 | 스태미나↓(수술 안 하면) | 예 | rest(그대로)·surgery(타이백: 8~12주, 성공률) |
   | colic | digestive | 드묾 | 1~4 | 낮음 | 드물게 사망 | 아니오 | medical·surgery(비용, 사망↓) |
   | tying_up | muscle | 보통 | 1~3 | 높음 | 없음 | 아니오 | rest·medical(관리 조정: 재발↓) |

   그 밖의 상수: 마장 배수(Firm·Good to Firm 은 bone·joint·foot ↑, Soft·Heavy 는 tendon·muscle ↑), 병력 상한 `INJURY_HISTORY_LIMIT = 20`, 검사 비용 `VET_EXAM_COST`, 자동 확진까지 주 `INJURY_AUTO_DIAGNOSE_WEEKS = 3`(그동안 검사를 안 하면 확진 때 남은 기간 × `INJURY_LATE_DIAGNOSIS_MULT` 1.25), 산통 사망 확률(치료 방식별), 전체 발생 빈도는 지금 수준(주간 WEEKLY_INJURY_BASE·출주 RACE_INJURY_BASE)을 유지한다.
2. `src/engine/horse/injury.ts`(신규) — 발생(종류 선택: 가중치 × 나이·마장·계절·재발 배수), 회복 종료 처리(병력 기록·영구 영향 적용: ability·potential 의 speed/stamina 를 바로 깎고 formVariance 더함, 기록에 남김), 플레이어 API:
   - `orderVetExam(state, horseId): 결과형` — 플레이어 말, 확진 전 부상일 때만, 비용 장부 'vet_fee', diagnosed = true, 'injury_diagnosed'. 오류: not_found / not_player_horse / no_injury / already_diagnosed / insufficient_funds.
   - `chooseTreatment(state, horseId, treatment): 결과형` — 플레이어 말, 확진된 부상, 그 종류가 허용하는 치료만, 이미 medical/surgery 를 골랐으면 'already_treated'. 비용 지불, weeksOut 조정(배수, 정수, ≥1), 성공률·재발·영구 영향 보정은 부상에 저장할 필요가 있으면 Injury 에 새 필드를 만들지 말고 treatment 값으로 회복 처리 때 다시 계산한다. 'injury_treated'. 오류: not_found / not_player_horse / no_injury / not_diagnosed / not_allowed / already_treated / insufficient_funds.
   - 모두 structuredClone, 원본 불변, 공용 난수 미사용(필요한 난수는 `${initialSeed}:injury-…:${horseId}:${date}` 같은 독립 스트림).
3. `src/engine/horse/conditioning.ts`·`src/engine/config/conditioning.ts` — 기존 rollInjury·INJURY_TABLE 을 새 모델로 교체(전체 빈도·호출 위치·공용 난수 사용 횟수는 가능한 한 그대로: 종류 선택에 쓰던 난수 1개 + 기간 1개를 유지하고, 추가 판정은 독립 스트림). 부상 시작 때 since 기록, 플레이어 말이고 숨김 종류면 diagnosed false. 미확진 주가 INJURY_AUTO_DIAGNOSE_WEEKS 를 넘으면 자동 확진(남은 기간 × 배수). 회복(weeksOut 0) 때 injury.ts 의 종료 처리.
   - AI 말: 항상 확진, 치료는 휴양. fracture 는 은퇴 확률(status 'retired'), colic 은 사망 확률(status 'dead', diedYear, 'horse_died' 는 플레이어 말·실명 종마만 — 기존 규칙).
   - 플레이어 말: 자동 은퇴하지 않는다(은퇴는 연말 정산·직접 선택). colic 사망은 플레이어 말도 같다(치료에 따라 확률 다름).
4. `src/engine/season/system.ts` — 플레이어 말 새 부상: 숨김이면 'injury_suspected'(region), 아니면 기존 'horse_injured'. 자동 확진 때 'injury_diagnosed'.
5. `src/engine/race/runnerModel.ts`(또는 레이스 컨디션 난수를 정하는 곳) — 말의 그날 컨디션 난수 폭에 horse.formVariance 를 더한다(없으면 0 → 지금과 같은 결과).
6. 테스트: `tests/engine/injuryModel.test.ts`(신규) 등.

## 수용 기준
1. 10만 회 표본(시드 고정)에서 종류별 발생 비율이 표의 빈도 순서와 맞고(아주 흔함 > 흔함 > 보통 > 드묾), sore_shins 는 4세 이상에서 0, bleeding 은 출주 중에만, respiratory 는 11~3월이 4~10월보다 많다. 결과를 표로 보고.
2. 재발: 같은 부위 병력이 있으면 그 종류 비율이 recurMult 배 근처로 오른다(표본 측정).
3. 진단·치료: 숨김 부상은 플레이어 말에서 diagnosed false 로 시작하고, orderVetExam 으로 확진·비용 지출, 3주 동안 검사 안 하면 자동 확진(기간 × 1.25). chooseTreatment 는 허용 목록·중복·자금·확진 조건을 지킨다. 원본 불변.
4. 회복 종료: 병력에 1줄, 영구 영향이 나면 ability·potential 감소와 formVariance 가산이 기록과 일치. laryngeal 은 수술 성공 시 스태미나 감소 없음.
5. 레이스: formVariance 0 이면 레이스 결과가 바뀌지 않는다(같은 입력 단위 테스트). 
6. 시드 20261011 새 게임 52주에서 전체 부상 수가 바꾸기 전과 ±20% 안(같은 주간·출주 기본 확률). 측정 보고.
7. `npm test && npm run typecheck && npm run lint` 통과. 고정 해시 테스트(레이스 결과·말 JSON)가 이 티켓의 의도된 변화(부상 종류·기간 변경)로 바뀌면 원인을 확인하고 값만 바꾼 뒤 목록 보고. 같은 시드 2회 동일.

## 금지
src/engine/types 수정 금지(필요한 타입이 없으면 [질문]). 화면 파일 수정 금지. 병행 파일(stud/mortality.ts, breeding/season.ts, stud/health.ts, config/mortality.ts)과 state/systems.ts 수정 금지. Math.random·Date.now 금지. git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (1·2·6 은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/injuryModel.test.ts && npm test && npm run typecheck && npm run lint
