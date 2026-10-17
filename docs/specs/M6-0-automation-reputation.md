# M6-0 자동 입厩 · 연말 진로 추천 · 명성 누적 바닥 · 명문 모계 도달성

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 근거: docs/reports/M5-G-30year.md '해석' 1~3, 사용자 지시 2026-10-17 "1-3번 고치고 M6 들어가자"

목적: 무입력·저입력 플레이에서도 내 생산마가 경주하고, 좋은 암말이 번식으로 돌아가 모계가 이어지며, 큰 업적의 명성이 남게 한다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- farm.ts `GameSettings.autoSendToTraining?: boolean` — 없거나 true = 자동(기본, '그대로 진행'), false = 수동
- 기존: season/player.ts `assignTrainer`(yearling 이고 나이 ≥ PLAYER_TRAINING_START_AGE 면 in_training·이름 자동 등록·시설 보너스), 조교사 수용 한도(trainerLoad·capacity·RETAINER_EXTRA_BOXES), 전속 계약(relations.contracts), stud/yearEnd.ts 추천 진로(`recommended`), economy/relations.ts `regressReputation`(REPUTATION_BASE 쪽 주간 회귀)·명성 가산 함수들, 연대기(state.chronicle), legacy(state.legacy)

## 범위
1. **2세 자동 입厩**(주간 시스템 `createAutoTrainingSystem()` id 'auto_training' — 30년 측정에 필요하므로 이 티켓에서 state/systems.ts 에 등록까지 한다. 위치는 race_plans 앞 권장, tests/engine/playerView.test.ts 순서 목록도 갱신): settings.autoSendToTraining !== false 일 때, 플레이어 소유 yearling 중 나이 ≥ PLAYER_TRAINING_START_AGE 이고 조교사가 없는 말을 조교사에게 맡긴다. 조교사 고르기(결정적, 난수 미사용): 플레이어 전속 조교사(자리 있으면) → 같은 나라(목장 소재국) 조교사 중 여유 자리가 있고 skill 이 높은 순 → 다른 나라. 모두 꽉 차면 그 주는 건너뛴다(이벤트 없음). assignTrainer 와 같은 효과(상태·이름 등록·이벤트)를 쓴다(복제 비용이 크면 in-place 변형을 만들어 공유). 세일 위탁 중인 말·세일 예정 말은 제외.
   - 화면: 설정 메뉴에 '2세 자동 조교 보내기' 체크(기본 켬). 홈 '이번 주 할 일'의 '조교사에게 맡기기' 항목은 수동일 때만.
2. **연말 진로 추천**: stud/yearEnd.ts 추천을 바꾼다 — 암말은 새 나이 ≥ config `YEAR_END_MARE_BREED_AGE`(5) 이고 broodmare 가 허용되면 'broodmare' 추천(목장 암말 수용 한도를 넘으면 'continue' 또는 'retire' — 기존 수용 한도 규칙을 찾아 따른다). 수말은 지금 규칙 유지. 플레이어가 고르면 그대로(추천만 바뀜).
3. **명성 누적 바닥**: 큰 업적이 기준값까지 다 빠지지 않게, 연대기 플레이어 항목으로 계산하는 `reputationFloor(state)`(config: G1 우승 +1, 클래식 +2, Laurel +2(올해의 말 +4), 유럽 리딩 1위 +3, 부계 확립 +4, 명문 모계 +3, 상한 `REPUTATION_FLOOR_MAX` 40 — 근거 주석). `regressReputation` 은 max(REPUTATION_BASE, floor) 쪽으로 회귀한다. 바닥은 매주 다시 계산하지 말고 연대기 항목이 늘 때만(또는 주 1회 가볍게) — 성능 주의.
4. **명문 모계 문구**: 기록 › 부계·모계의 명문 모계 조건 안내(src/ui/legacy/legacyView.ts familyConditionText)에 '내 번식 암말의 모계' 를 명시.
5. 테스트: `tests/engine/autoTraining.test.ts`(자동 입厩 — 수동 설정이면 안 함, 전속 우선, 꽉 차면 건너뜀, 결정성·공용 rng 불변), yearEnd 추천 테스트 갱신, reputation 바닥 테스트.
6. 측정: `G1_OUT=<파일> npx vitest run tests/verify/g1ThirtyYears.test.ts`(30년, 15~30분 — 백그라운드로 돌리고 결과 파일을 기다린다) → 플레이어 현역마 수·플레이어 그룹 우승·명성·명문 모계 후보 근거(familyPool·상위 후보)·M4/M5 판정을 docs/reports/M6-0-30year.json 과 .md 에 이전(M5-G) 값과 비교해 적는다.

## 수용 기준
1. 30년 무입력에서 플레이어 현역마가 해마다 1두 이상(시작 3년 제외 가능), 명성이 연초 측정에서 업적이 있으면 10 보다 높게 남는다(측정 보고).
2. 명문 모계 후보 풀이 30년 동안 늘어난다(플레이어 생산 암말이 번식 전환) — 확립 0 이면 가장 가까운 후보 근거 보고.
3. M4 판정(인플레·낙찰률·승률·기록 수)·M5 판정 유지.
4. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 바뀐 고정 해시는 이유 보고 후 값만 갱신.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). state/systems.ts 는 auto_training 등록 한 줄과 순서 주석만. 공용 rng 소비 순서 변경 금지. 실명 문구 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거(측정값, M5-G 와 비교)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용 (시스템 등록 위치 제안 포함)
```
