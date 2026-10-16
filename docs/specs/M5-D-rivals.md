# M5-D 라이벌 마주

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/m5-plan.md 설계 결정 4·5 · 선행: M5-B(연대기)·M5-C 커밋됨

목적: 플레이어와 경쟁하는 AI 마주를 지정해 세계에 긴장감을 준다. 맞대결 기록과 연대기 항목이 남고, 라이벌은 세일·대레이스에서 조금 더 공격적으로 움직인다.

## 사용할 타입·함수 (수정 금지, 이미 있음)
- types/legacy.ts: `Rival { ownerId; since; reason; playerAhead; rivalAhead; intensity; active }`, `RivalReason`('same_tier' | 'big_race' | 'sale_battle'), `GameState.rivals?`; 이벤트 `rival_declared { ownerId; reason; date }`, `rival_clash { ownerId; raceId; playerAhead; date }`(text.ts 문구 있음 — eventKo 의 ownerNameOf 인자)
- legacy/chronicle.ts: `appendChronicle`(kind 'rival_declared'·'rival_clash' — label 에 레이스 이름, ownerId, count = 누적 맞대결)
- 기존: Owner.tier('major'|'mid'|'small')·persona·funds, relations.reputation, sales/auction.ts(`computeAiBids`·`collectBidders`·`resolveLot` — AI 입찰 상한 계산), 세일 결과·이벤트 `sale_lot_result`(role 'underbidder' = 플레이어가 지고 다른 마주가 낙찰), season/declarations.ts `declareAiRunners`(AI 출주 신청), raceResults(그룹 레이스·플레이어 말 출주 결과), Race.grade, RaceTemplate.tags('classic')

## 범위
1. `src/engine/config/rivals.ts`(근거 주석): `RIVAL_MAX_ACTIVE = 2`, `RIVAL_SALE_BATTLE_MIN = 50_000`, `RIVAL_INTENSITY_START = 40`, `RIVAL_INTENSITY_CLASH = 8`(맞대결마다), `RIVAL_INTENSITY_DECAY = 15`(해마다), `RIVAL_BID_BOOST = 0.25`, `RIVAL_BIG_RACE_ENTRY_WEIGHT`(대레이스 출주 가중, 작게) 등.
2. `src/engine/legacy/rivals.ts`:
   - 선정(연초 1주, 플레이어 현역마나 번식 사업이 있을 때만): 활성 라이벌이 RIVAL_MAX_ACTIVE 보다 적으면 'same_tier' 후보 — 플레이어와 같은 나라 우선, 마주 등급·보유 현역마 수·최근 상금이 비슷한 AI 마주 중 결정적으로(독립 스트림 `${initialSeed}:rival:${year}`) 1명.
   - 시즌 중 계기: 플레이어 말이 출주한 G1·클래식에서 플레이어 말보다 앞선 우승 마주 → 'big_race' 후보, 세일에서 플레이어가 RIVAL_SALE_BATTLE_MIN 이상 입찰했다가 진 로트의 낙찰 마주 → 'sale_battle' 후보. 후보가 이미 라이벌이면 경쟁심 +, 아니고 자리가 있으면 새 라이벌(이벤트·연대기).
   - 맞대결: 그룹 레이스에 플레이어 말과 라이벌 말이 함께 나오면 착순 비교로 playerAhead/rivalAhead 를 더하고 이벤트 `rival_clash`·연대기(그 레이스 첫 맞대결만, 같은 레이스 여러 두는 최상위끼리 한 번)·경쟁심 +.
   - 해마다 경쟁심 감소, 0 이하면 active=false(기록은 남김). 라이벌 마주가 사라지면(파산·정리) 비활성.
   - 효과(작게, 독립 스트림 — 공용 rng 소비 순서 불변): (a) 세일: 플레이어가 최대 입찰을 건 로트에서 라이벌 마주의 AI 입찰 상한 × (1 + intensity/100 × RIVAL_BID_BOOST). (b) 대레이스: 플레이어 말이 신청한 G1 에 라이벌의 상위 말이 자격이 되면 출주 확률 가중(기존 AI 출주 판단에 곱하는 작은 계수). 둘 다 라이벌이 없으면 기존 결과와 완전히 같다.
   - 주간 시스템 `createRivalsSystem()`(id 'rivals', 등록은 Opus — 위치 제안).
3. useGame: `rivals()`(활성·지난 라이벌 + 마주 이름·맞대결 기록).
4. 화면은 M5-E. text.ts 의 기존 문구 사용.
5. 테스트 `tests/engine/rivals.test.ts`: 선정 결정성·자리 제한, big_race·sale_battle 계기, 맞대결 집계(동착·여러 두), 감소·비활성, 세일 입찰 가중이 라이벌 있을 때만, 라이벌 없는 게임 결과 불변(공용 rng 동일), 저장 왕복.

## 수용 기준
1. 위 테스트 통과.
2. 시드 20261011 5년 진행(기본 무입력 플레이어 — 출주 계획 기본 진행): 라이벌 지정 수·맞대결 수·세일 경합 수 측정 보고, 예외 없음.
3. 라이벌 없는 상태와 레이스 결과·공용 rng 동일(라이벌 0명으로 강제한 비교).
4. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 바뀐 고정 해시는 이유 보고 후 값만 갱신.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). state/systems.ts 수정 금지. 공용 rng 소비 순서 변경 금지. 실명 문구 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용 (시스템 등록 위치 제안 포함)
```

## 테스트 명령
npx vitest run tests/engine/rivals.test.ts && npm test && npm run typecheck && npm run lint && npm run build
