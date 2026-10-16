# UX4 자동 교배: 교배 담당 제안 → 검토·승인 → 자동 예약

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/ux-plan.md UX4 · 사용자 요청 2026-10-16 "교배도 좀 자동으로 어떻게 안 되나" · 선행: UX2(번식 화면 재구성 — 맨 위에 교배 제안 자리)

목적: 번식 암말이 많아도 매번 종마 211두 표를 뒤지지 않게, 교배 담당(목장 매니저)이 암말마다 종마를 제안하고 플레이어는 한 화면에서 한 번에 검토·승인(또는 자동 승인)하게 한다. 출주 계획(UX1)과 같은 '제안 → 승인 → 자동 실행' 흐름.

## 사용할 타입 (수정 금지, 이미 추가됨)
- stud.ts: `MatingProposalStatus`('proposed' | 'approved' | 'booked' | 'skipped'), `MatingProposal { mareId; season; stallionId; alternatives; expectedFee; note; status; bookedStallionId? }`, `StudState.matingProposals?: MatingProposal[]`
- farm.ts: `GameSettings.autoApproveMatings?: boolean`, `GameSettings.matingFeeCap?: Money | null`
- game.ts: GameEvent `'mating_proposals_ready' { season; count; date }`, `'mating_proposal_skipped' { mareId; reason; date }` (text.ts 문구 있음)
- 기존: breeding/season.ts `bookCovering`(오류 유니언 BookingError, 사전 예약 bookedFor·종부료 선지급), `bookingSeasonOf`, `nominationsLeft`, `mareFertility`, `familyScore`, `damsireLineOf`; breeding/nicks.ts `nickKey`·`nickValue`·`nickLabel`, `state.revealedNicks`(플레이어가 아는 니크만 쓴다 — 정보 공정성); breeding/inbreeding.ts `findInbreeding`·`totalBloodPercent`; breeding/preview.ts `buildMatingPreview`(roles·complement·distanceHint); stud/private.ts `privateAccess`; stud/value.ts `peakOfficialRating`; stud/nh.ts `horseProfile`·`sireNhValue`; economy `canSpendDiscretionary`; config/stud.ts `BOOKING_OPEN_WEEK`(44), config/breedingSeason.ts

## 범위
1. `src/engine/config/mating.ts`(신규, 근거 주석): 암말 수준 → 종부료 예산 구간(예: 수준 점수 0~100 → €2,000 ~ €150,000 로그 보간), 플레이어 한 종마당 한 시즌 최대 제안 두수(기본 2, 자기 종마는 예외), 근친 혈량 상한(예: 18.75% 초과·3×3 이내 근친은 제외), 점수 가중치(종마 수준·니크·거리 보완·수태율·종부료 효율), 대안 수 2.
2. `src/engine/breeding/matingPlan.ts`(신규, 순수, rng 미사용·결정적):
   - `mareQuality(state, mareId): number`(0~100) — 본인 최고 OR, 블랙타입 산자(blackTypeProduce), familyScore, 나이(수태율) 조합. 설명용 한 줄 `mareQualityNote`.
   - `proposeMating(state, data, mareId, season?): MatingProposal | null` — 교배 가능 종마(그 시즌 계류·임대 중 아님·북 여유·비공개 거절 아님·firstSeasonYear ≤ season) 중 예산(settings.matingFeeCap 가 있으면 그 값, 없으면 수준 구간) 안에서 점수 순 1순위 + 대안 2두. 점수: 종마 수준(종부료·자마 성적 — 기존 값 함수 재사용) · 알려진 니크(revealedNicks 에 없는 니크는 중립) · 근친 상한 위반 제외 · 거리 보완(암말·외조부 프로필과 종마 프로필 — 예: 스태미나 모계 + 스피드 부 가점, 양쪽 cup 감점) · 관측 수태율 · 자기 종마(종부료 0) 소폭 가점. 같은 시즌 같은 종마 쏠림 방지(위 최대 두수). note 는 이유 한 줄(예: '니크 좋음 · 스피드 보완 · 예산 €20,000 안').
   - `proposeAllMatings(state, data, season?): MatingProposal[]` — 플레이어 번식 암말 전부(나이 ≥ MARE_MIN_BREEDING_AGE, 이미 그 시즌 예약·교배·임신 만삭 제외). 암말 id 순으로 정해 쏠림 제한이 결정적.
   - `approveMating(state, mareId)` / `approveAllMatings(state)` — 원본 불변. 승인 즉시 `bookCovering` 을 1순위 → 대안 순으로 시도, 성공하면 status 'booked'·bookedStallionId, 모두 실패하면 'skipped'·이벤트 mating_proposal_skipped(사유 한글: 북 마감·자금 부족 등). 이벤트는 bookCovering 의 covering_booked 를 그대로 포함해 돌려준다.
   - `changeMating(state, mareId, stallionId)`(플레이어가 대안 또는 다른 종마로 바꿈 — 'proposed' 로 둔다), `removeMating(state, mareId)`(그 시즌 자동 교배 안 함 — 'skipped', 이벤트 없음), `setMatingFeeCap(state, cap | null)`.
   - 오류 유니언(`MatingPlanError`: 'not_found' | 'not_player_mare' | 'not_booking_window' | 'invalid_status' | 'stallion_not_available' 등). 플레이어 암말만.
3. 주간 시스템 `createMatingPlansSystem(data)`(id 'mating_plans', 등록은 Opus — 이 티켓은 테스트에서 넣어 확인, 위치 제안):
   - 예약 창(bookingSeasonOf 가 null 아님)인 주마다: 그 시즌 제안이 없는 플레이어 번식 암말(새로 번식 전환한 말 포함)에 제안을 만든다. 예약 창 첫 주(BOOKING_OPEN_WEEK)에 새로 만든 제안이 있으면 'mating_proposals_ready' 이벤트 1건(두수). 이후 주에 늘어난 암말은 이벤트 없이 추가.
   - settings.autoApproveMatings 면 새 제안을 바로 approve(위 규칙, 예약·종부료 선지급).
   - 'proposed' 인 채 번식 단계가 끝나면(BREEDING_END_WEEK 지남) 'skipped'('검토하지 않아 지나감'), 이벤트 없음. 지난 시즌 제안은 다음 예약 창이 열릴 때 지운다(저장 크기).
   - 공용 rng 를 쓰지 않는다. 플레이어 번식 암말이 없거나 matingProposals 가 없고 예약 창이 아니면 상태 불변 — 기존 고정 해시 테스트는 예약 창 제안 생성으로 바뀔 수 있다(바뀐 테스트와 이유 보고, 의도된 변화면 값만 갱신).
4. useGame: `matingProposals()`, `proposeMatings()`(다시 짜기), `approveMating(mareId)`, `approveAllMatings()`, `changeMating(mareId, stallionId)`, `removeMating(mareId)`, `setAutoApproveMatings(boolean)`, `setMatingFeeCap(cap | null)`.
5. 화면(최소, UX2 가 번식 화면에 정리): BreedingScreen 맨 위 '교배 제안' 표 — 암말(수준 한 줄) · 1순위 종마 · 종부료 · 니크 · 근친 · 거리 보완 · 메모 · 상태 칩, 행마다 승인 / 대안으로 바꾸기(select) / 빼기, 위에 [모두 승인] · '자동 승인' 체크 · '한 두당 종부료 상한' 입력. 순수 함수는 `src/ui/breeding/matingPlanView.ts`.
6. 테스트: `tests/engine/matingPlan.test.ts`, `tests/ui/matingPlanView.test.ts`.

## 수용 기준
1. 결정성: 같은 상태 → 같은 제안, 공용 rng 불변, 원본 불변.
2. 기본 새 게임(오너브리더)을 예약 창까지 진행하면 플레이어 번식 암말 전부에 제안이 있고, 모든 1순위가 교배 가능·예산 안·근친 상한 이하이며, 한 종마에 쏠림 상한을 지킨다(자기 종마 제외).
3. 알려지지 않은 니크로 점수를 올리지 않는다(revealedNicks 를 비운 상태와 비교 테스트).
4. approveAllMatings: 예약·종부료 장부·종마 bookedThisSeason 이 bookCovering 과 같게 반영, 1순위 북이 꽉 차면 대안으로, 모두 실패하면 skipped·이벤트·사유.
5. 시스템: autoApproveMatings=true 인 시드 20261011 2시즌 진행에서 플레이어 번식 암말이 모두 교배(또는 사유 있는 skipped)되고 다음 해 망아지가 태어난다(측정 보고: 교배 두수·평균 종부료·자금 변화). false 면 승인 전까지 예약되지 않는다.
6. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 공용 rng 사용·소비 순서 변경 금지. state/systems.ts 수정 금지(등록은 Opus). 실명 문구 금지(종마 실명 표시는 기존과 같이 허용). 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (5 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용 (시스템 등록 위치 제안 포함)
```

## 테스트 명령
npx vitest run tests/engine/matingPlan.test.ts tests/ui/matingPlanView.test.ts && npm test && npm run typecheck && npm run lint && npm run build
