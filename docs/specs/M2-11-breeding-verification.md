# M2-11 배합·유전 검증: 다세대 시뮬레이션 + 단서 정확도 리포트

담당: haiku-tester · 선행: M2-05, M2-07, M2-09

## 목적
유전 모델이 수십 세대에서 폭주·붕괴하지 않는지, 선택 교배의 효과가 "이론으로 설명되는" 크기인지, 단서(마체 평가)가 진짜 능력과 얼마나 맞는지 확인한다. **구현 코드는 고치지 않는다.**

## 생성할 파일
1. `tests/verify/breeding.test.ts`
2. `docs/reports/2026-10-11-m2-breeding.md` (FULL 모드에서 테스트가 생성)

## 공통
- `const FULL = !!process.env.VERIFY;` 기본 모드는 작게(세대 3, 집단 60), FULL 은 아래 규모.
- 말 생성: `generateHorse`(src/engine/horse/generate.ts), 교배: `breed` + `findInbreeding(buildMatingPedigree(...))` + `nickValue`, 닉스 표 `getNicks()`. 모든 말을 담은 Map 을 lookup 으로 사용. 시드 고정.

## 1) 닫힌 집단 무작위 교배 (FULL: 집단 200 = 수 100·암 100, 20세대)
- 1세대: generateHorse(level 55, spread 10), sireLineId 는 getSireLines() 의 하위 계통 id 중 무작위 배정(닉스가 작동하도록), 암말의 부 계통(damsire)도 무작위 계통.
- 매 세대 무작위 짝 200쌍 → 망아지 200두(성별 결과대로) → 다음 세대. damsireLineId = 어미의 부의 sireLineId(1세대는 배정값).
- 세대별: 잠재 평균(5능력 평균)의 평균·표준편차·최대, 인브리드 발생률(교차 ≥1), 평균 혈량, 건강도 평균.
- **기준:** 20세대 동안 잠재 평균이 1세대 ±5 안, 표준편차가 1세대의 50~150% 안.

## 2) 선택 교배 (FULL: 같은 시작, 매 세대 잠재 평균 상위 20% 수·암만 부모로 사용, 20세대)
- 세대별 같은 지표.
- **기준:** 평균이 상승하되(20세대 후 +5 이상), 회귀 덕분에 85 미만에서 포화. 인브리드 발생률과 평균 혈량 추이를 기록(근친 누적이 건강도를 깎는지 확인).

## 3) 닉스 효과 (FULL 2,000쌍)
- 같은 부모 풀에서 닉스 값 ≥ 0.5 조합 vs |값| < 0.2 조합의 망아지 잠재 평균 차이. **기준:** 차이 3~5 (NICK_EFFECT_MAX × 평균 닉스 값 근처).

## 4) 단서 정확도 (FULL 말 1,000두)
- `assessHorse` 를 단계별(foal, yearling, two_year_old, in_training)·평가자 능력 50 으로 실행, overall 등급(S=5 … E=0)과 진짜 잠재 평균의 **스피어만 상관**.
- **기준:** in_training ≥ 0.8, foal 은 in_training 보다 낮음(단조 증가).

## 리포트 (FULL)
맨 위 "기준 이탈 지표"(없으면 "없음"), 이어서 1~4 의 세대별 표(세대·평균·SD·최대·인브리드율·평균 혈량·건강도), 닉스 표, 상관 표. 실행 조건(시드·규모·소요 시간) 기재.

## 수용 기준
1. `npm test`(기본 모드) 통과, 추가 소요 10초 이내. 2. `VERIFY=1 npx vitest run tests/verify/breeding.test.ts` 통과 또는 기준 이탈을 리포트 맨 위에 적고 **테스트는 실패로 두지 말 것**(판단은 Opus). 3. 리포트 생성. 4. src/ 수정 없음.

## 테스트 명령
`npm test && VERIFY=1 npx vitest run tests/verify/breeding.test.ts && npm run typecheck && npm run lint`

---
## 개정 (2026-10-11, M2-05b 반영) — 이 절이 위 내용보다 우선한다
1. 교배 시 인브리드: `dominantCrosses(root, findInbreeding(root))` (src/engine/breeding/inbreeding.ts). `root = buildMatingPedigree(lookup, sire.id, dam.id)`. 게임 본체(season.ts, preview.ts)와 같은 방식.
2. 닉스 효과 기준: **차이 1~3.5** (설계 기대 ≈ NICK_EFFECT_MAX × 평균 닉스 값 ≈ 2.2). "3~5" 는 명세 오류였다.
3. 단서 정확도의 "진짜 값"은 단계별: foal·yearling·two_year_old = 잠재(potential) 5종 평균, in_training = 현재 능력 0.6 + 잠재 0.4 의 가중 평균. 기준: 단계가 진행될수록 상관이 커지고(단조 증가), in_training ρ ≥ 0.7.
4. 닫힌 집단 붕괴 여부 판정(2절 선택 교배): 닫힌 집단에서 인브리드율(혈량 > 0 인 말 비율)이 100% 에 가까운 것은 정상이므로 기준이 아니다. 대신 마지막 세대의 **평균 혈량 ≤ 12.5%**, **건강도 평균 ≥ 40**, **잠재 평균이 1세대보다 낮지 않음**을 본다. 하나라도 어기면 "기준 이탈 지표"에 적는다. 1절·2절의 기존 기준(±5, +5 이상·85 미만)은 그대로다.
5. 리포트 docs/reports/2026-10-11-m2-breeding.md 를 다시 생성한다(개정 후 수치로 덮어쓰기, 맨 위에 "M2-05b 반영 재실행" 한 줄).

## 개정 2 (2026-10-11, M2-05c 반영 후) — 개정 1 보다 우선
6. 선택 교배를 두 시나리오로 나눈다.
   - **회피 선택(판정 대상):** 성별별 상위 20% 풀에서 짝을 정할 때, 암말마다 풀의 수말 중 예상 혈량(totalBloodPercent(dominantCrosses(root, findInbreeding(root))), root = buildMatingPedigree(lookup, 수.id, 암.id)) 이 INBREED_EXCESS_FROM 이하인 수말 가운데에서 무작위로 고른다. 허용 수말이 없으면 풀에서 예상 혈량이 가장 낮은 수말. (미리보기 경고를 따르는 플레이어)
   - **닫힌 무회피 선택(진단):** 지금의 선택 교배. 표에는 남기되 C3·C9~C11 판정에는 쓰지 않는다.
   - C3·C4·C9·C10·C11 은 회피 선택으로 판정한다.
7. 진단 추가 "보너스만 끔": 무작위 교배를 같은 시드로, 적정 인브리드 보너스만 0 으로(과다 감점은 유지) 돌린다. 테스트 안에서 breed 결과를 바꾸려면 src 를 고치지 말고, breed 호출 전에 inbreeding 배열을 혈량 ≤ INBREED_HIGH 인 교차만 빼는 식이 아니라 — 정확히는 bp 가 INBREED_LOW~INBREED_HIGH 사이면 inbreeding 을 빈 배열로 넘기고(보너스 0, 감점 0 구간), 그 밖이면 그대로 넘긴다. 결과를 C1 원인 진단 줄에 적는다(보너스 끔에서 상승이 사라지면 원인 확정).
8. 기본 모드 소요 10초 이내 유지.
