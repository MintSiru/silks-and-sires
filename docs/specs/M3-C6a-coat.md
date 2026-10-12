# M3-C6a 털색: 유전·생성·실명 종마 반영·표시 문구

담당: haiku-coder · 선행: 7691859(Coat 타입·기본값), 1518589(RealStallionRecord.coatColour), **M3-C5a 승인 후 시작**(같은 파일 수정)

## 목적
말의 털색을 단순화한 멘델 유전(Extension·Agouti·Grey·Roan)으로 만들고 물려준다. 실명 종마는 데이터의 털색에서 유전자형을 정한다. 흰 반점(얼굴·다리)을 붙인다. 표시용 한국어 문구를 만든다.

## 사용할 것 (수정 금지)
- 타입: `Coat`, `CoatGenes`, `CoatColour`, `FaceMarking`, 대립유전자 타입들(src/engine/types/horse.ts), `RealStallionRecord.coatColour?`
- `defaultCoat()`(horse/traits.ts) — 저장 변환이 쓰므로 남겨 둔다

## 생성·수정할 파일
1. `src/engine/config/coat.ts` (신규) — 상수 전부
   - 무작위 생성 대립유전자 빈도: E 0.60 / e 0.40, A 0.45 / At 0.30 / a 0.25, G 0.04 / g 0.96, Rn 0.005 / rn 0.995
   - 얼굴 반점 가중치(none 0.40, star 0.25, snip 0.05, stripe 0.10, blaze 0.20), 밤색이면 blaze·stripe 가중 ×1.5
   - 흰 양말 다리 수 가중치(0: 0.45, 1: 0.25, 2: 0.18, 3: 0.07, 4: 0.05), 밤색이면 1 이상 쪽 ×1.3
   - 반점 유전: 부모 중 한쪽 값을 그대로 물려받을 확률 0.4, 아니면 위 가중치로 새로 추첨
   - 회색 밝기: 출생 시 0.1, 매년 +0.12, 최대 1.0
2. `src/engine/horse/coat.ts` (신규, 순수 함수)
   - `coatColour(genes): CoatColour` — 우선순위: G 하나 이상 → 'grey', Rn 하나 이상 → 'roan', ee → 'chestnut', 그 외 Agouti 최상위 대립유전자로 A → 'bay', At → 'brown', aa → 'black'(우성 순서 A > At > a)
   - `greyLightness(birthYear, year): number` — 회색 말의 밝기 0~1(표시용, 회색이 아니어도 계산은 한다)
   - `generateCoat(rng): Coat` — 빈도로 유전자형, 반점·양말 추첨
   - `inheritCoat(rng, sire: Coat, dam: Coat): Coat` — 좌위마다 부·모에서 대립유전자 하나씩 무작위. 결과가 RnRn 이면 한쪽을 rn 으로. 반점 규칙은 config
   - `coatFromColour(colour: CoatColour | undefined, rng): Coat` — 실명 종마용. chestnut → ee + Agouti 빈도 추첨, bay → E 하나 이상(나머지 빈도) + A 하나 이상, brown → E 하나 이상 + At 하나 이상 + A 없음, black → E 하나 이상 + aa, grey → Gg + 나머지 빈도, roan → Rn rn + 나머지 빈도, undefined → bay 와 같다. 결과의 coatColour(genes) 가 입력 colour(undefined 면 'bay')와 같아야 한다
3. `src/engine/horse/generate.ts` — `defaultCoat()` 대신 `generateCoat(rng.fork('coat'))`
4. `src/engine/breeding/genetics.ts` — 망아지 `inheritCoat(rng.fork('coat'), sire.coat, dam.coat)`
5. `src/engine/state/stallionHorses.ts` — 실명 종마 Horse 의 coat = `coatFromColour(rec.coatColour, rng.fork('coat:' + rec.key))`(rng 이 없으면 시드 기반 fork 를 받을 수 있게 시그니처를 최소한으로 고친다)
6. `src/ui/game/text.ts` — `coatColourKo(c)`: bay 갈색(베이), brown 흑갈색, black 흑색, chestnut 밤색, grey 회색, roan 조모. `faceMarkingKo(f)`: none 없음, star 별, snip 코끝 흰 점, stripe 가는 줄, blaze 넓은 흰 줄
7. `tests/engine/coat.test.ts` (신규)

## 수용 기준
1. 같은 시드 → 같은 털색(생성·유전·실명 종마).
2. 무작위 생성 10,000두 표시 털색 비율: bay 0.42~0.56, chestnut 0.12~0.20, brown 0.10~0.20, grey 0.05~0.11, black 0.02~0.07, roan ≤ 0.02.
3. 유전: 밤색 × 밤색 → 망아지 100% 밤색(회색·조모 유전자가 없을 때). 회색(Gg) × 비회색 → 망아지 회색 비율 0.45~0.55(2,000두). RnRn 망아지 0두.
4. coatFromColour: 6가지 색 + undefined 각각 200회, coatColour 결과가 입력과 100% 일치.
5. 실명 종마로 만든 Horse 의 털색이 데이터 coatColour 와 같다(데이터에 값이 있는 종마 대상, 데이터는 아직 일부만 있을 수 있다).
6. coatColourKo·faceMarkingKo 가 모든 값에 문구를 낸다(UI 테스트 1개).
7. 기존 테스트 통과(골든·재현성 기대값은 고치지 말고, 깨지면 원인 보고). 엔진에 Math.random/Date.now 없음, 매직 넘버는 config/coat.ts. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 레이스 시뮬레이션 수정 금지. data/ 수정 금지(털색 데이터는 별도 데이터 티켓). git commit 금지.
