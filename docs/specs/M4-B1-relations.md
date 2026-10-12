# M4-B1 관계값·명성

담당: haiku-coder · 선행: M4-A3(7acddad) · 근거: 사용자 결정(2026-10-12) — 개별 관계 + 전체 명성

## 사용할 것 (수정 금지)
`RelationsState`(values: Partial<Record<RelationKey, number>>, reputation), `RelationKey`(`owner:${id}`·`trainer:${id}`·`jockey:${id}`), `GameState.relations`, `WeeklySystem`

## 규칙 (상수는 전부 config/economy.ts — 아래 값은 초기값)
1. 관계값 범위 −100 ~ 100(정수 아님 허용, 저장은 소수 둘째 자리 반올림). 없는 키 = 0.
2. 레이스 결과(플레이어 말이 나온 레이스, 결과 반영 시):
   - 그 말의 조교사: 1착 +3, 그룹 1착 +6, G1 1착 +10, 2~3착 +1.
   - 그 말의 기수: 1착 +4, G1 1착 +8, 2~3착 +1.
3. 위탁 지속: 매주 플레이어 현역마(in_training·resting)를 맡은 조교사마다 +0.1, 단 위탁으로 쌓는 관계는 `TENURE_RELATION_CAP`(40)까지.
4. 시간 감소: 매주 모든 관계값이 0 쪽으로 `RELATION_DECAY_WEEKLY`(0.15)만큼 이동(0 을 넘지 않음). 0 이 되면 키를 지운다(저장 크기).
5. 명성(0 ~ 100): 플레이어 말 그룹 1착 +2, G1 +5, 클래식(태그 classic) 1착 추가 +3, 시리즈 달성 +5. 연말 리딩 마주(유럽 합산) 10위 안 +5, 3위 안 +10. 매주 `REPUTATION_BASE`(10) 쪽으로 0.03 씩 이동.
6. 다른 단계가 쓸 공개 함수(이 티켓에서 만든다, 호출은 나중 티켓): `relationOf(state, key)`, `adjustRelation(draft, key, delta)`, `adjustReputation(draft, delta)`, `relationKey(kind, id)`, `relationTierKo(value)`(UI 용 문구: 냉랭 ≤ −40, 서먹 < −10, 보통 ≤ 10, 우호 ≤ 40, 친밀 ≤ 70, 신뢰 > 70 — 문구는 src/ui/game/text.ts 에 두고 엔진은 등급 id 만 반환: `relationTier(value): 'cold'|'cool'|'neutral'|'warm'|'close'|'trusted'`).

## 생성·수정할 파일
- src/engine/economy/relations.ts(신규): 위 함수 + `createRelationsSystem(): WeeklySystem`(위탁 +0.1, 감소, 명성 회귀)
- src/engine/season/apply.ts: 플레이어 말 레이스 결과 → 조교사·기수 관계, 명성(그룹·G1·클래식)
- src/engine/season/system.ts: 연말 리딩 마주 순위 → 명성(시상 계산 뒤), 시리즈 달성 → 명성(apply.ts·system.ts 의 보너스 지점)
- src/engine/state/systems.ts: relations 시스템 추가(solvency 뒤)
- src/engine/config/economy.ts, src/ui/game/text.ts(relationTierKo)
- tests/engine/relations.test.ts(신규): 범위 clamp, 감소가 0 을 넘지 않음·키 삭제, 위탁 상한, 레이스 결과 반영(1착·G1·2착), 명성 증감·회귀, 같은 시드 재현·저장 왕복.

## 수용 기준
1. 위 테스트 통과. 기존 테스트 통과(시스템 순서 기대값만 고치고 보고).
2. AI 끼리의 관계는 저장하지 않는다(플레이어 기준만). 3시즌 무행동 진행 후 values 키 수 보고(저장 크기).
3. 엔진에 Math.random·Date.now 없음, 상수는 config. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면(관계 목록 UI) 구현 금지 — 문구 함수만. 세일·전속·종마 관련 호출 추가 금지(해당 티켓에서). git commit 금지.
