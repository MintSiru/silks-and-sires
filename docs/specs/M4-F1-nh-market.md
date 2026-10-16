# M4-F1 NH 시장 추상화: 종마 역할(평지·겸용·NH)·NH 스토어 세일·NH 평판

담당: Codex(gpt-6.1-sol, high — 기능 단위) · 설계: docs/stamina-and-nh.md 4~6장, docs/m4-plan.md F1, docs/plan.md M4 완료 기준(30년 진행 시 컵 프로필 종마 70% 이상 NH·겸용).

목적: 장거리 혈통의 수말이 평지 대신 NH(장애) 시장으로 가는 흐름을 추상화한다. 장애 레이스 화면은 만들지 않는다.

## 사용할 타입 (수정 금지, 이미 추가됨)
- `Stallion.studRole?: StudRole`('flat' | 'dual' | 'nh', 없으면 flat), `Stallion.nhReputation?: number`(0~100)
- `YearEndHorseDecision.studRole?: StudRole`(choice 'stud' 일 때만, 없으면 flat)
- `Horse.nhSoldYear?: number`(NH 스토어로 팔려 평지에서 빠진 해, status 'retired')
- GameEvent `'nh_store_sold' { horseId; price; date }`, LedgerCategory `'nh_store_sale'` (text.ts 문구 있음)
- 데이터: `RealStallionRecord.studRole`(실명 NH 종마 3두 'nh'), `distanceProfile`
- 기존: world/populationSystem.ts(AI 종마 편입 D7b: studEntrants·buildStallionRecord·aiEntrant), state/stallionHorses.ts(실명 종마 → Stallion), stud/market.ts(D8 종부료 재산정 fee_review), stud/value.ts(estimateStudFee), stud/yearEnd.ts(submitYearEnd 'stud'), world/sirePool.ts, 말의 거리 적성(distanceBias 등 — 말 한 마리의 '거리 프로필'을 구하는 기존 함수가 있으면 쓰고, 없으면 config 경계값으로 speed/classic/middle/cup 을 정하는 함수를 만든다)

## 범위
1. `src/engine/config/nh.ts`(신규, 근거 주석: docs/stamina-and-nh.md 6장):
   - `FLAT_VALUE_BY_PROFILE = { speed: 1, classic: 1, middle: 0.6, cup: 0.25 }`, `NH_VALUE_BY_PROFILE = { speed: 0.15, classic: 0.4, middle: 0.8, cup: 1 }`
   - `NH_FEE_RATIO = 0.22`(같은 등급 평지 종부료 대비, 0.15~0.30 안), `DUAL_FEE_RATIO = 0.6`, `NH_BOOK_MULT = 1.5`, `DUAL_BOOK_MULT = 1.2`
   - 스토어 세일: 주차(8월 둘째 주, 기존 세일 캘린더와 겹치지 않게), 대상 나이 3세 수말(거세 포함), 기준가 `NH_STORE_BASE_PRICE = 11_000`(€, 문서 2장 평균), 가격 배수(부의 NH 가치·NH 평판·잠재력), 흔들림 ±25%
2. `src/engine/stud/nh.ts`(신규, 순수): `horseProfile(horse)`, `sireNhValue(state, sireId)`(실명 종마는 데이터 프로필·studRole, 게임 종마는 studRole·프로필), `chooseStudRole(state, horse, rng?)`(AI 진로: 평지 가치 대 NH 가치 비교 — 컵 프로필은 대부분 NH/겸용, 중장거리는 일부 겸용), `nhStoreQuote(state, horseId)`(플레이어 화면 견적), `applyStudRole(stallion, role)`(종부료 × 비율·북 상한 × 배수).
3. AI 종마 편입(populationSystem D7b) 때 `chooseStudRole` 로 studRole 을 정하고 applyStudRole. 판정은 독립 스트림(`${initialSeed}:stud-role:${horseId}`) — 공용 rng 소비 순서 그대로. 실명 종마(stallionHorses)는 데이터 studRole 을 Stallion.studRole 로 옮긴다.
4. NH 스토어 세일 주간 시스템 `createNhStoreSystem()`(id 'nh_store', 등록은 Opus — 이 티켓은 등록하지 않고 테스트에서 넣어 확인):
   - 그해 스토어 주에 AI 소유 3세 수말 중 'NH 행' 판정(부의 NH 가치가 높고 평지 선발 가치가 낮을수록 확률↑, 독립 스트림)인 말을 판매: status 'retired', trainerId null, nhSoldYear, 마주 자금 += 가격(AI 는 장부 없이 funds 만, 기존 AI 판매 처리와 같은 방식), 출주 신청 제거.
   - 부(종마)별 그해 판매 두수·평균가를 모아 NH·겸용 종마의 nhReputation 을 갱신(지수 이동 평균, 0~100).
5. 플레이어:
   - `sellToNhStore(state, horseId)` — 스토어 주(±1주 허용, config) 에 플레이어 3~4세 수말(종마·번식 제외)만, 가격 = nhStoreQuote, 장부 'nh_store_sale' +, 이벤트 'nh_store_sold', 말은 위와 같이 빠진다. 원본 불변, eventLog 는 호출자.
   - 연말 정산 'stud' 제출에 studRole 반영(submitYearEnd → standPlayerStallion 후 applyStudRole). 프로필이 speed 면 nh 선택 불가(오류 'role_not_allowed' — YearEndError 에 추가, 화면 문구 포함).
6. 종부료 재산정(stud/market.ts fee_review): NH·겸용 종마는 nhReputation 을 수요 계수에 반영(평판 50 = 지금과 같음). 평지 종마 결과는 바뀌지 않게.
7. 화면(최소): 연말 정산 화면의 'stud' 선택 옆 역할 select(평지/겸용/NH, 프로필에 따라 허용) + 예상 종부료; 세일 화면 또는 시즌 화면에 'NH 스토어 세일' 칸(스토어 주에만): 대상 플레이어 말 목록·견적·판매 버튼. 번식·배합 종마 목록에 역할 표시. useGame 에 sellToNhStore 추가.
8. 테스트: `tests/engine/nhMarket.test.ts`.

## 수용 기준
1. config 값·근거 주석. horseProfile·sireNhValue 단위 테스트.
2. 시드 20261011 로 10년 진행(nh_store 시스템을 넣은 목록): AI 편입 종마 중 cup 프로필의 NH·겸용 비율 ≥ 70%, speed 프로필의 NH 비율 ≤ 10%(측정값 보고). 같은 시드 2회 동일.
3. NH 스토어: 해마다 판매 두수 > 0, 평균가가 기준가 근처(€5,000~€30,000 안, 측정 보고), 팔린 말은 이후 레이스에 나오지 않는다. nhReputation 이 0~100 안에서 움직인다.
4. 플레이어 판매: 스토어 주가 아니면 거절, 나이·성별·소유 검사, 장부·이벤트·원본 불변.
5. 연말 'stud' + studRole 'nh' → 종부료가 평지 추정 × NH_FEE_RATIO, 북 상한 × NH_BOOK_MULT. speed 프로필 + nh → 'role_not_allowed'.
6. 시스템을 등록하지 않은 기존 게임 진행(고정 해시)은 3번(AI 편입 studRole)·실명 종마 studRole 반영으로 바뀔 수 있다 — 바뀐 테스트와 이유를 보고하고, 의도된 변화면 값만 갱신. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 공용 rng 소비 순서 변경 금지(새 판정은 독립 스트림). 실명 기관·세일 회사 이름 금지(문구는 'NH 스토어 세일' 같은 일반어). state/systems.ts 수정 금지(등록은 Opus). 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (2·3 은 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/nhMarket.test.ts && npm test && npm run typecheck && npm run lint && npm run build
