# M4-D3b 내 종마의 외부 자마를 세계 현역마로 편입

담당: Codex(한도 소진 시 haiku-coder) · 설계: docs/m4-stud-design.md D3 · 선행: D3a-2(StudState.seasons 정산 기록, 커밋)

목적: AI 암말이 내 종마에게 받은 자마가 실제 2세 현역마로 세계에 들어오게 해서, 자마 성적(sireStats)이 쌓이고 다음 해 종부료 재평가(D8)가 가능하게 한다.

## 배경(측정, decisions.md 2026-10-15)
세계 현역마는 실제 규모의 표본이다(연간 2세 유입 ≈ 635두). 1티어 실명 종마는 세계 자마가 연 약 10~18두, 3티어는 약 3~4두다. 내 종마 자마 수 = 외부 수태 수 × PLAYER_SIRE_CROP_PER_CONCEPTION(0.06) — 수태 150 → 약 9두, 69 → 약 4두.

## 사용할 타입·함수 (수정 금지)
- `StudSeasonRecord { stallionId; year; conceptions; ... }`(types/stud.ts), `Stallion { fee; sireLineId; standsIn }`, `Horse.aptitude.distanceOptimum`.
- world/population.ts: `spawnRacingHorse`, `drawSexAndGelding`, `RacingHorseSpec`, `POPULATION_COUNTRY_ORDER`. config/world.ts `TIER_FEE`, config/population.ts `POPULATION_TIER_LEVEL`·`POPULATION_ENTRY_AGE`·`POPULATION_DISTANCE_SIRE_WEIGHT`·`POPULATION_DISTANCE_DEFAULT_MEDIAN`.
- `createRng(label)`.

## 생성·수정할 파일 (4개)
1. `src/engine/config/stud.ts` — 추가: `PLAYER_SIRE_CROP_PER_CONCEPTION = 0.06`(주석: 위 측정 근거).
2. `src/engine/world/population.ts`
   - `RacingHorseSpec` 에 선택 필드 `sireHorseId?: HorseId` 추가(이 파일의 인터페이스, types 아님).
   - spawnRacingHorse: sireHorseId 가 있으면 pickSire 를 부르지 않는다(rng 미소비). 그 종마의 Stallion·Horse 로 — 부 id = sireHorseId, sireLineId = stallion.sireLineId, level = POPULATION_TIER_LEVEL[티어] (티어 = TIER_FEE 중 fee 와 로그 거리가 가장 가까운 등급, 동률은 번호 작은 쪽), distanceBias = POPULATION_DISTANCE_SIRE_WEIGHT × 부 말의 aptitude.distanceOptimum + (1 − 가중) × DEFAULT_MEDIAN. 나머지(마주·조교사·이름·생산자) 순서와 규칙은 그대로.
   - sireHorseId 가 없으면 지금과 바이트 단위로 같은 동작.
3. `src/engine/world/populationSystem.ts` — 6단계(신규 2세 투입) 바로 앞에 '내 종마 자마 편입':
   - year 의 2세 = 출생 year−2, 교배 연도 year−3. StudState.seasons 중 year === (year − 3) 인 기록마다(stallionId 오름차순): 기대 두수 x = conceptions × PLAYER_SIRE_CROP_PER_CONCEPTION. 두수 n = floor(x) + (rng.next() < x − floor(x) ? 1 : 0), rng = `createRng(\`${draft.initialSeed}:player-sire-crop:${stallionId}:${year}\`)`(독립 스트림).
   - 나라: 종마 standsIn 이 POPULATION_COUNTRY_ORDER 에 있으면 그 나라, 아니면 'GB'.
   - 그 종마가 세계에 없거나(horses·stallions 에 없음) n = 0 이면 건너뜀.
   - 이 말들은 그 나라 신규 2세 투입 수에서 빼고(0 미만 안 됨) 같은 ctx.rng 로 spawnRacingHorse(sireHorseId 지정) — 성별·거세는 drawSexAndGelding(ctx.rng, POPULATION_ENTRY_AGE). 그래서 나라별 현역 두수 합은 지금과 같다.
4. `tests/engine/playerSireCrops.test.ts`(신규)

## 수용 기준
1. 플레이어 종마가 없거나 StudState.seasons 가 비면 인구 시스템 결과가 지금과 완전히 같다(시드 20261011, 2년 진행 후 horses JSON 동일 — 기존 테스트로 보장되면 근거 제시).
2. 테스트 상태: 플레이어 종마(종부료 €17,000, standsIn IE) + seasons 에 { year: Y−3, conceptions: 69 } 를 넣고 Y년 1주 인구 시스템 실행 → 부가 그 종마인 새 2세가 3~5두, 모두 AI 마주 소유·조교사 배정·IE, sireLineId = 종마 계통. IE 신규 2세 합(내 종마 자마 포함) = 그 기록이 없을 때의 IE 신규 2세 수.
3. 같은 시드 2회 동일. 기록 conceptions 150 이면 기대 약 9두(7~11).
4. `npm test && npm run typecheck && npm run lint` 통과. Math.random·Date.now 없음.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. sireHorseId 없는 경로의 rng 소비 순서 변경 금지. git commit 금지. 새 의존성 금지.

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
npx vitest run tests/engine/playerSireCrops.test.ts && npm test && npm run typecheck && npm run lint
