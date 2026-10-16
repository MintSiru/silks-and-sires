# M5-C 부계 확립 · 명문 모계

담당: Codex(gpt-6.1-sol, high) · 설계: docs/m5-plan.md (설계 결정 1~3) · M5-B 와 병렬(파일 겹침 없음)

목적: 게임 안에서 태어난 종마가 아들 종마들과 함께 그룹 우승마를 충분히 내면 새 부계로, 게임 안 암말의 모계가 블랙타입 우승마를 충분히 내면 명문 모계로 인정해 기록한다. 혈통 계산(sireLineId·니크)은 바꾸지 않는 칭호·기록 층이다.

## 사용할 타입·함수 (수정 금지, 이미 있음)
- types/legacy.ts: `EstablishedLine`, `FemaleFamily`, `LegacyState`; `GameState.legacy?`; 이벤트 `sire_line_established { horseId; lineId; date }`, `female_family_established { horseId; date }`(text.ts 문구 있음)
- legacy/chronicle.ts: `appendChronicle`, `hasChronicle` — kind 'sire_line_established'(lineId, count=그룹 우승마 수, player=플레이어 생산), 'female_family_established'
- config/legacy.ts 에 상수 추가(근거 주석): `LINE_MIN_STUD_SONS = 3`, `LINE_MIN_FOUNDER_GROUP_WINNERS = 3`, `LINE_MIN_TOTAL_GROUP_WINNERS = 8`, `FAMILY_GENERATIONS = 3`, `FAMILY_MIN_BLACK_TYPE_WINNERS = 5`, `FAMILY_MIN_GROUP_WINNERS = 1`
- 기존: `sireStats`(groupWinners 등 — 아비별 누적), Horse.sireId·damId·realKey(실명 종마 판정)·breederId, Stallion 레코드(종마가 된 아들 = 그 말을 부로 둔 Horse 중 stallions 에 있었던 말 — 은퇴·사망 뒤에도 셀 수 있게 status 'stud' 이력 판정 방법을 기존 코드에서 찾는다; 없으면 Stallion 레코드 존재 또는 firstSeasonYear 로), Mare.blackTypeProduce·foals, 레이스 결과의 그룹·리스티드 우승(블랙타입 우승마 판정 — 말 기록에서 판정할 수 있는 필드가 없으면 sireStats 처럼 누적하는 방법을 [질문]으로), 플레이어 생산 판정(breederId)

## 범위
1. `src/engine/legacy/lines.ts`(순수 판정 + 연말 시스템):
   - `lineCandidates(state)`: 게임 안 종마(실명 종마 제외)별 근거(종마가 된 아들 수, 시조 그룹 우승 자마 수, 시조+아들들의 그룹 우승 자마 합).
   - `familyCandidates(state)`: 게임 안 번식 암말(은퇴·사망 포함, 기초 암말)별 모계 3대 안 블랙타입·그룹 우승마 수.
   - 주간 시스템 `createLegacySystem()`(id 'legacy', 등록은 Opus — 연말 시상 확정 뒤를 제안): 해마다 한 번(연도 전환 주) 조건을 넘은 시조·기초 암말을 `state.legacy` 에 추가(이미 있으면 건너뜀), 이벤트·연대기 기록. 이미 확립된 부계의 아들이 다시 조건을 넘으면 그 아들도 새 부계(parentLineId = 아버지의 확립 계통 id)가 될 수 있다.
   - 조회: `establishedLineOf(state, horseId)`(부계 조상 중 가장 가까운 확립 계통), `lineLabel(state, line)`('{시조 이름} 계통', 원래 계통 이름은 기존 SireLine label), `familyOf(state, horseId)`(모계 조상 중 명문 모계).
2. 성능: 해마다 한 번만 계산. 세계 말 수천 두에서 연말 판정 1회 50ms 이하 목표(측정 보고). 자식 목록 색인이 필요하면 판정 함수 안에서 한 번 만든다.
3. 화면은 이 티켓에서 만들지 않는다(M5-E). 단 말 상세 혈통 탭이 쓰도록 조회 함수만 export.
4. 테스트 `tests/engine/legacyLines.test.ts`: 조건 경계(아들 2·3, 그룹 우승마 7·8 등)를 만든 상태로 확인, 실명 종마 제외, 재확립 없음, 아들의 분지 확립, 명문 모계 경계, 결정성·공용 rng 불변, 저장·불러오기 왕복.

## 수용 기준
1. 경계 조건 단위 테스트 통과(위 4).
2. 고정 시드 30년 측정은 M5-G 에서 하므로 여기서는 시드 20261011 5년 진행에서 예외 없음·legacy 상태 유효(측정 보고: 후보 상위 5두 근거 수치 — 확립이 0 이어도 괜찮다).
3. 연말 판정 1회 시간 측정 보고.
4. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 시스템 없는 게임 결과 불변.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). state/systems.ts 수정 금지. 공용 rng 사용 금지. 실명 문구 금지. 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2·3 은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용 (시스템 등록 위치 제안 포함)
```

## 테스트 명령
npx vitest run tests/engine/legacyLines.test.ts && npm test && npm run typecheck && npm run lint && npm run build
