# M3-C5b 성격의 레이스 반영

담당: haiku-coder · 선행: M3-C5a 승인, Opus 가 RunnerInput.horse Pick 에 'personality' 추가(이 명세 위임 직전 커밋)

## 목적
성격 5축을 레이스 시뮬레이션에 반영한다. 기세↑·침착↓ = 초반 과열(앞으로 나가며 스태미나 손실), 겁↑ = 출발 늦음·바깥 선호, 투쟁심↑ = 경합 근성, 고집↑ = 기수 작전 무시. **모든 효과는 성격값 50 에서 정확히 0** 이어야 한다(기존 골든 결과 보존).

## 사용할 것 (수정 금지)
- `Personality`(types/horse.ts), `RunnerInput.horse.personality`(Opus 추가), `PreparedRunner`·`prepareRunner`(race/runnerModel.ts), `simulateRace`(race/simulate.ts), 전술 함수(race/tactics.ts), `createRng`(rng)

## 난수 규칙 (중요)
레이스의 기존 rng 는 **한 번도 더 소비하지 않는다**(fork 도 부모를 1회 소비하므로 금지). 성격 난수가 필요하면 `createRng(\`persona:${seed}:${horseId}\`)` 처럼 레이스 시드와 말 id 로 따로 만든다. 레이스 시드가 시뮬레이터 입력에 없으면 [질문]으로 보고한다.

## 생성·수정할 파일
1. `src/engine/config/sim.ts` — 성격 상수 추가(모두 여기)
   - 정규화: 축별 d = (값 − 50) / 50 (−1~+1)
   - 과열도 x = clamp((d_drive − d_composure) / 2, −1, 1). x > 0 이면 초반 구간(earlyPhaseLimit) 목표 속도 × (1 + `KEEN_EARLY_SPEED 0.015` × x), 초반 스태미나 소모 × (1 + `KEEN_EARLY_DRAIN 0.25` × x). x < 0 이면 초반 목표 속도 × (1 + `CALM_EARLY_SPEED 0.008` × x)(느긋하게 출발, 소모 변화 없음)
   - 겁 t = max(0, d_timidity): 출발 지연 + `TIMID_START_DELAY_S 0.35` × t, 선호 레인 바깥쪽 + `TIMID_LANE_OFFSET_M 1.5` × t
   - 투쟁심 f = d_fight: 경합 근성 보너스 GUTS_BATTLE_BONUS × (1 + `FIGHT_BATTLE_K 0.8` × f)
   - 고집 s = max(0, d_stubbornness): 레이스 시작 시 확률 `STUBBORN_IGNORE_MAX_P 0.3` × s 로 작전(entry.tactic)을 무시하고 말의 preferredStyle 로 달린다(이미 같으면 효과 없음)
2. `src/engine/race/runnerModel.ts` — PreparedRunner 에 성격 파생값(과열도, 겁, 투쟁심 배수, 실제 적용 작전) 추가, prepareRunner 에서 계산. 출발 지연·작전 교체는 여기서
3. `src/engine/race/simulate.ts`·`src/engine/race/tactics.ts` — 초반 속도·소모, 레인 오프셋, 경합 근성 반영(최소 변경)
4. `src/engine/race/sampleField.ts`·`src/engine/season/field.ts` — RunnerInput.horse 에 personality 전달(sampleField 는 중립 성격 `neutralPersonality()`, field.ts 는 horse.personality)
5. `tests/engine/personalityRace.test.ts` (신규)

## 수용 기준
1. 중립 성격(전부 50)이면 기존 결과와 완전히 같다: 기존 골든·재현성 테스트(tests/engine/golden*, simulate, runRace, raceday, seasonSystem) 기대값 변경 없이 통과.
2. 과열: 같은 능력의 말 2두(기세 90·침착 10 vs 중립), 2,400m, 300회 — 과열마가 400m 지점 선두 비율이 더 높고, 평균 착순은 더 나쁘다.
3. 겁: 겁 95 말의 평균 출발 지연이 중립보다 크고(300회), 평균 레인 위치가 바깥쪽이다.
4. 투쟁심: 능력이 같은 2두가 결승 직선에서 붙는 설정(1,600m, 500회)에서 투쟁심 95 쪽 승률 ≥ 0.55, 투쟁심 5 쪽 ≤ 0.45.
5. 고집: 고집 100·preferredStyle 'front'·작전 'held_up' 말 1,000회 중 front 로 달린 비율 0.25~0.35, 고집 50 이면 0.
6. 성능: tests/verify/performance 기준 시간이 5% 넘게 늘지 않는다(측정값 보고).
7. 엔진에 Math.random/Date.now 없음, 매직 넘버는 config. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(Pick 추가는 Opus 가 한다). 골든 기대값 수정 금지. data/ 수정 금지. git commit 금지.
