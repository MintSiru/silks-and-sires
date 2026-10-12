# M3-C5a 말의 성격: 생성·유전·각질 결정·코멘트 단서

담당: haiku-coder · 선행: 7691859(Personality·Coat 타입, horse/traits.ts 중립값, 저장 v4)

## 목적
말마다 성격 5축(기세·침착·투쟁심·겁·고집)을 만들고 자식에게 약하게 물려준다. 선호 각질(preferredStyle)을 부모 각질 복사 대신 **성격 + 능력에서 결정**한다("성격에 따라 각질이 달라진다"). 조교사 코멘트용 성격 단서 키를 만든다. 레이스 반영은 C5b.

## 사용할 것 (수정 금지)
- 타입: `Personality`, `Horse`, `RunningStyle`, `Abilities`(src/engine/types/horse.ts), `Rng`(normal, next, fork …)
- `NEUTRAL_TRAIT`, `neutralPersonality()`(src/engine/horse/traits.ts) — 중립값 함수는 남겨 둔다(저장 변환이 쓴다)
- 기존 각질 목표 분포 `STYLE_WEIGHTS`(config/horse.ts): front 0.15, prominent 0.30, midfield 0.35, held_up 0.20

## 생성·수정할 파일
1. `src/engine/config/personality.ts` (신규) — 상수 전부
   - 생성: 각 축 N(`PERSONALITY_MEAN 50`, `PERSONALITY_SD 15`), clamp 0~100
   - 유전: 자식 = 50 + `PERSONALITY_HERITABILITY 0.35` × (부모 평균 − 50) + N(0, `PERSONALITY_INHERIT_SD 14`), clamp 0~100
   - 각질 점수 가중치·문턱값(아래 3번), 단서 임계값(아래 4번)
2. `src/engine/horse/personality.ts` (신규, 순수 함수)
   - `generatePersonality(rng): Personality`
   - `inheritPersonality(rng, sire: Personality, dam: Personality): Personality`
   - `deriveStyle(p: Personality, ability: Abilities, rng): RunningStyle` — 앞으로 나가는 정도 점수
     f = w_drive·(drive−50)/50 − w_comp·(composure−50)/50 × 0.5 − w_timid·(timidity−50)/50 + w_speed·(speed − stamina)/50 + N(0, σ).
     문턱값 3개로 front / prominent / midfield / held_up. 가중치·σ·문턱값은 config 에 두고, **무작위 생성마 5,000두에서 각질 비율이 STYLE_WEIGHTS ±0.04** 가 되도록 맞춘다(테스트로 고정).
   - `personalityClues(p): PersonalityClueKey[]` — `export type PersonalityClueKey = 'gate_nervous' | 'keen_going' | 'genuine' | 'quirky' | 'laid_back'`.
     gate_nervous: timidity ≥ 70, keen_going: drive ≥ 70 이고 composure ≤ 40, genuine: fight ≥ 70, quirky: stubbornness ≥ 70, laid_back: drive ≤ 30 이고 composure ≥ 60. 50 에서 가장 많이 벗어난 순으로 최대 2개. 해당 없으면 빈 배열.
3. `src/engine/horse/generate.ts` — `neutralPersonality()` 대신 `generatePersonality(rng.fork('personality'))`, preferredStyle 은 `deriveStyle(personality, ability, rng.fork('style'))`(기존 sampleStyle 대체). 기존 rng 소비 순서가 바뀌면 안 되는 테스트가 있으면 fork 로 분리해 기존 값이 최대한 유지되게 한다.
4. `src/engine/breeding/genetics.ts` — 망아지: `inheritPersonality(...)`, preferredStyle = `deriveStyle(망아지 성격, 망아지 능력(ability), rng.fork('style'))`. 기존 inheritStyle 과 STYLE_FROM_SIRE_P·STYLE_FROM_DAM_P 는 삭제한다.
5. `tests/engine/personality.test.ts` (신규)

## 수용 기준
1. 같은 시드 → 같은 성격·각질(generateHorse, 망아지 생성 둘 다).
2. 생성 5,000두: 축별 평균 50±2, 표준편차 15±2, 범위 0~100. 각질 비율이 STYLE_WEIGHTS ±0.04.
3. 유전: 부모 모두 기세 90 인 망아지 2,000두 평균이 60~68(약한 유전), 부모 모두 10 이면 32~40. 자식 표준편차 ≥ 12.
4. 같은 능력에서 기세 85·겁 20 인 말은 front+prominent 비율 ≥ 0.7, 기세 20·겁 80 인 말은 midfield+held_up 비율 ≥ 0.7(각 1,000회).
5. personalityClues: 5개 키 각각 나오는 사례, 최대 2개, 중립 성격은 빈 배열.
6. 기존 테스트 통과. 각질 유전 방식이 바뀌어 기존 테스트(부모 각질 복사를 가정한 것)가 깨지면 그 테스트만 새 규칙에 맞게 고치고 [명세와 다르게 한 점]에 적는다. 골든·재현성 테스트(tests/engine/golden*, raceday, seasonSystem)의 기대값은 고치지 말고, 깨지면 원인을 보고한다.
7. 엔진에 Math.random/Date.now 없음, 매직 넘버는 config/personality.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 레이스 시뮬레이션(src/engine/race/*) 수정 금지(C5b). data/ 수정 금지. git commit 금지.

## 테스트 명령
`npx vitest run tests/engine/personality.test.ts tests/engine/genetics.test.ts && npm run typecheck && npm run lint`, 마지막에 `npm test`
