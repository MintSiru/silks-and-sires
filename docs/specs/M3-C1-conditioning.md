# M3-C1 조교·컨디션 주간 루프 (준비도·피로·정신·부상, 조교사 코멘트 키)

담당: haiku-coder · 선행: M3-A6c 승인, 공용 타입 7671e39(InjuryKind, GameEvent 'horse_injured')

## 목적
A6c 의 임시 휴식 회복(recoverResting)을 실제 주간 조교 루프로 바꾼다. 조교사 능력·시설·2세 성향에 따라 준비도가 오르고, 피로가 풀리고, 부상이 난다. 플레이어에게 숫자 대신 보여 줄 조교사 코멘트 키를 만든다(문구는 D3).

## 사용할 것 (수정 금지)
- 타입: `Horse.condition`(fitness·fatigue·mental 0~100, injury: Injury | null), `Injury { kind: InjuryKind; weeksOut }`, `Horse.soundness`(0~100), `Trainer.skill`·`facilityGrade`(1~5)·`juvenileFocus`(0~1), `GameEvent` 'horse_injured', `GameState.playerOwnerId`, `SeasonState.lastRun`
- `ageInYear`(time/calendar.ts), `Rng`(fork, next 등 기존 API)

## 생성·수정할 파일
1. `src/engine/config/conditioning.ts` (신규) — 아래 상수 전부. config/season.ts 의 `REST_FATIGUE_RECOVERY`·`REST_FITNESS_GAIN`·`REST_FITNESS_CAP` 은 삭제한다(쓰는 곳은 system.ts 뿐).
   - 조교(in_training, 부상 없음): 준비도 증가 = `TRAIN_FITNESS_GAIN 6` × (`0.75 + 0.5 × skill/100`) × (fitness ≥ `FITNESS_PEAK_ZONE 85` 이면 `PEAK_ZONE_GAIN_MULT 0.4`), 상한 100.
     2세는 여기에 × (`0.6 + 0.8 × juvenileFocus`).
   - 피로 회복 = `TRAIN_FATIGUE_RECOVERY 12` + (facilityGrade − 3) × `FACILITY_RECOVERY_PER_GRADE 1`, 하한 0.
   - 정신: 매주 +`MENTAL_RECOVERY 2`(상한 100). 회복 전 fatigue > `HIGH_FATIGUE 60` 이면 대신 −`MENTAL_FATIGUE_LOSS 3`. 출주한 주에는 −`MENTAL_RACE_LOSS 4` 추가.
   - 휴양(resting): 준비도 −`REST_DETRAIN 3`(하한 `REST_FITNESS_FLOOR 40`), 피로 −`REST_FATIGUE_RECOVERY 20`, 정신 +`REST_MENTAL_GAIN 5`.
   - 부상 중: 준비도 −`INJURED_DETRAIN 5`(하한 `INJURED_FITNESS_FLOOR 30`), 피로는 휴양과 같이 회복, weeksOut −1, 0 이 되면 injury = null. 부상 중에는 새 부상 판정을 하지 않는다.
   - 조교사가 없는 말(trainerId null 또는 없는 id)은 skill `NO_TRAINER_SKILL 50`, facilityGrade 3 으로 본다.
   - 주간 부상 확률(in_training, 부상 없음) = `WEEKLY_INJURY_BASE 0.0015` × (1 + fatigue / `INJURY_FATIGUE_SCALE 40`) × 체질 계수.
     체질 계수 = clamp((100 − soundness) / `SOUNDNESS_SCALE 50`, `SOUNDNESS_FACTOR_MIN 0.5`, `SOUNDNESS_FACTOR_MAX 2`).
   - 출주 부상 확률(이번 주 출주한 말) = `RACE_INJURY_BASE 0.01` × 체질 계수.
   - 부상 종류 가중치·기간(주, 정수 균등): knock 0.55 (1~3), sore_shins 0.25 (3~6), tendon 0.14 (20~40), fracture 0.06 (26~52). sore_shins 는 4세 이상이면 knock 으로 바꾼다.
   - 출주 가능 피로 상한 `MAX_FATIGUE_TO_RUN 45`.
   - 조교사 코멘트 임계값(아래 trainerReport).
2. `src/engine/horse/conditioning.ts` (신규, 순수 함수)
   - `weeklyConditionInPlace(horse: Horse, trainer: Trainer | undefined, age: number, ranThisWeek: boolean, rng: Rng): Injury | null` — 위 규칙을 한 말에 적용. 새 부상이 나면 그 Injury 를 돌려준다. 판정 순서: (1) 이미 부상 중이면 부상 중 규칙만 적용하고 null, (2) 출주했으면 출주 부상 판정, (3) 조교/휴양 변화, (4) 출주 부상이 없었으면 주간 부상 판정.
   - `rollInjury(age: number, rng: Rng): Injury` — 종류·기간 추첨.
   - `trainerReport(horse: Horse): TrainerReportKey` — `export type TrainerReportKey = 'injured' | 'tired' | 'flat' | 'backward' | 'needs_run' | 'nearly_ready' | 'peak'`. 판정 순서: 부상 → 'injured', fatigue > MAX_FATIGUE_TO_RUN → 'tired', mental < `FLAT_MENTAL 35` → 'flat', fitness < `BACKWARD_FITNESS 55` → 'backward', < `NEEDS_RUN_FITNESS 70` → 'needs_run', < FITNESS_PEAK_ZONE → 'nearly_ready', 그 외 'peak'. (TrainerReportKey 는 이 파일에 둔다. 공용 타입 파일은 수정하지 않는다)
3. `src/engine/season/system.ts` — recoverResting 을 컨디션 단계로 바꾼다. in_training·resting 말을 id 정렬 순으로 돌며 weeklyConditionInPlace(rng = 시즌 rng.fork('condition') 하나를 순서대로 사용). ranThisWeek = seasonState.lastRun[id] 이 이번 주 날짜와 같음. 새 부상이 났고 horse.ownerId === playerOwnerId 이면 'horse_injured' 이벤트.
4. `src/engine/season/eligibility.ts` — 조건 하나 추가: fatigue ≤ MAX_FATIGUE_TO_RUN.
5. `tests/engine/conditioning.test.ts`

## 수용 기준
1. 같은 시드 → 같은 결과(weeklyConditionInPlace 단위, 시즌 8주 통합 둘 다).
2. fitness 40 인 4세 말이 부상 없이 조교하면 skill 50 조교사에서 8주 안에 85 이상이 된다. 같은 기간 skill 90 조교사 쪽이 skill 10 쪽보다 높다. 2세는 juvenileFocus 0.9 조교사 쪽이 0.1 쪽보다 빨리 오른다.
3. 부상률(몬테카를로, 시드 고정): soundness 60, 32주, 3주마다 출주하는 말 2,000두 → 시즌 중 1회 이상 부상한 비율 6~15%. 그 부상 중 tendon+fracture 비율 ≤ 25%. soundness 30 집단의 부상률 > soundness 85 집단.
4. 부상 중인 말은 isEligible false, weeksOut 이 매주 1 줄고 0 이 되면 injury null. 부상 기간에 fitness 가 내려간다(하한 30).
5. fatigue 46 인 말은 isEligible false, 45 는 true(다른 조건 충족 시).
6. trainerReport 가 7개 키를 각각 낸다(합성 말로 7개 사례).
7. 통합: bootstrapGame + 테스트 템플릿으로 16주 진행 → 'horse_injured' 이벤트는 플레이어 말에만, AI 말 중 부상한 말이 1두 이상 있다. 기존 seasonSystem·declarations·raceday 테스트 통과. 52주 진행 시간을 보고(A6c 기준 3.2초, +20% 이내 목표).
8. 엔진에 Math.random/Date.now 없음, 매직 넘버는 config/conditioning.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). src/engine/season/apply.ts 수정 금지(다른 에이전트가 수정 중). data/ 수정 금지. git commit 금지.

## 테스트 명령
`npx vitest run tests/engine/conditioning.test.ts tests/engine/seasonSystem.test.ts tests/engine/declarations.test.ts && npm run typecheck && npm run lint`, 마지막에 `npm test`
