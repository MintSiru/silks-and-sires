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
