# M4-D6a 비공개(프라이빗) 종마 — 엔진

담당: Codex(gpt-6.1-sol, high) · 사용자 결정(2026-10-15): 단순형 — AI 오너브리더의 비공개 종마는 관계가 높으면 교배 허가, 내 종마도 비공개(외부 북 닫힘, 내 암말 전용)로 돌릴 수 있다.

목적: 비공개 종마를 만들고, 예약·AI 수요·화면용 조회에 반영한다.

## 사용할 타입·함수 (수정 금지)
- `Stallion.privateTo?: OwnerId | null` — 값이 있으면 그 마주의 비공개 종마. 플레이어 비공개는 값 = state.playerOwnerId.
- `Owner { id; studName: string | null; tier: 'major' | 'mid' | 'small'; isPlayer }`, `relationOf(state, relationKey('owner', ownerId))`(economy/relations.ts), 관계 등급 상수 `RELATION_TIER_WARM = 40`(config/economy.ts)
- `bookCovering`·`BookingError`(breeding/season.ts), `createStudBooksSystem`(stud/books.ts), `buildStallionRecord`(stud/stand.ts), 거래 창 `STUD_DEAL_FIRST_WEEK`·`STUD_DEAL_LAST_WEEK`, `createRng`

## 생성·수정할 파일 (5개 + 테스트, 예외 1줄)
1. `src/engine/config/stud.ts` — 추가: `PRIVATE_STALLION_CHANCE = 0.3`(대형 오너브리더 출신 AI 편입 종마가 비공개가 될 확률), `PRIVATE_DEMAND_SHARE = 0.3`(AI 비공개 종마의 AI 수요 = 평소 × 이 값, 자기 목장 암말 몫), `PRIVATE_RELATION_MIN = RELATION_TIER_WARM`(config/economy.ts 에서 가져온다).
2. `src/engine/stud/private.ts`(신규)
   - `privateAccess(state, stallionId, ownerId): 'public' | 'own' | 'allowed' | 'denied'` — privateTo 가 없으면 'public', ownerId 와 같으면 'own', 관계 relationOf(owner:privateTo) ≥ PRIVATE_RELATION_MIN 이면 'allowed', 아니면 'denied'. 순수 함수.
   - `setStallionPrivate(state, horseId, makePrivate: boolean): { ok: true; state; events: [] } | { ok: false; error: 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased' | 'no_change' }` — 플레이어 종마(status 'stud', 플레이어 소유)만, 거래 창(28~43주)에서만, 임대 중(state.stud.leases)이면 'leased', 이미 그 상태면 'no_change'. 적용: privateTo = makePrivate ? playerOwnerId : null. structuredClone, 원본 불변.
3. `src/engine/breeding/season.ts` — BookingError 에 `'private_stallion'` 추가. bookCovering 에서 자기 종마가 아니고 privateAccess 가 'denied' 면 이 오류(시즌·북 검사 뒤, 자금 검사 전). `src/ui/game/text.ts` 의 BOOKING_ERROR_KO 에 `private_stallion: '비공개 종마입니다. 그 마주와 관계가 더 가까워야 예약할 수 있습니다.'` 한 줄만 추가(화면 파일 수정은 이 한 줄만 허용).
4. `src/engine/stud/books.ts` — AI 수요 누적:
   - 플레이어 비공개(privateTo === playerOwnerId): aiDemand·aiBooked 0(누적 안 함). 27주 정산은 지금처럼(외부 0 → 수입 0, 기록은 outsideCovers 0).
   - AI 비공개(privateTo 가 플레이어가 아님): aiDemand 를 정할 때 seasonDemand × PRIVATE_DEMAND_SHARE(내림, 최소 1).
5. `src/engine/world/populationSystem.ts` — D7b 의 AI 종마 편입에서, 그 말의 마주가 studName 이 있고 tier 'major' 면 `createRng(\`${initialSeed}:private-stallion:${id}\`)` 로 chance(PRIVATE_STALLION_CHANCE) 일 때 비공개: ownerId 를 그 마주로 남기고(마주 horseIds 에서 빼지 않음) privateTo = 그 마주 id. 아니면 지금처럼 ownerId null. 공용 난수 소비 순서 불변.
6. `tests/engine/privateStallion.test.ts`(신규)

## 수용 기준
1. privateAccess: 공개 → public, 자기 → own, 관계 40 → allowed, 39 → denied.
2. bookCovering: AI 비공개 종마에 관계 0 인 플레이어 예약 → 'private_stallion', 관계 40 → 성공(종부료 지불). 플레이어 비공개 종마에 자기 암말 → 성공(무료).
3. books: 플레이어 비공개 종마는 예약 창 동안 aiBooked 0, 27주 정산 income 0. AI 비공개 종마의 aiDemand 는 같은 조건의 공개 종마 × 0.3(내림, ≥1).
4. setStallionPrivate: 30주 성공(privateTo 설정/해제), 10주 outside_deal_window, 임대 중 leased, 같은 상태 no_change, 남의 종마 not_player_stallion. 원본 불변.
5. 편입: 시드 20261011 새 게임 2년 진행에서 AI 편입 종마 중 privateTo 가 있는 종마 수(0 이상)를 측정·보고하고, 그 종마는 ownerId = privateTo 이며 마주 horseIds 에 있다. 같은 시드 2회 동일.
6. `npm test && npm run typecheck && npm run lint` 통과. 깨지는 고정 해시 테스트가 있으면 원인이 이 티켓의 의도된 변화(비공개 편입·비공개 수요)뿐인지 확인한 뒤 값만 바꾸고 보고한다.

## 금지
src/engine/types 수정 금지. 화면 파일은 위 text.ts 한 줄 외 수정 금지. src/engine/state/systems.ts 수정 금지. 공용 난수 사용 금지(편입 판정은 말별 스트림). git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (5번은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/privateStallion.test.ts && npm test && npm run typecheck && npm run lint
