# M1-10 M1 검증: 재현성 · 성능 · 밸런스 리포트

담당: haiku-tester · 선행: M1-09 (runRace, staticData)

## 목적
M1 완료 기준(같은 시드 재현 100%, 레이스 1회 50ms 이하)을 자동 검증하고, 레이스 밸런스 지표를 리포트로 남긴다. **구현 코드는 고치지 않는다.**

## 생성·수정할 파일
1. `tests/verify/reproducibility.test.ts`
2. `tests/verify/performance.test.ts`
3. `tests/verify/balance.test.ts` (리포트 파일을 쓴다)
4. `package.json` — scripts 에 `"test:verify": "vitest run tests/verify"` **한 줄만** 추가
5. `docs/reports/2026-10-11-m1-race-balance.md` (balance 테스트가 생성; 커밋 대상)

## 공통
- 레이스 1회 = `staticData` 의 레이스 하나 + `generateSampleField(createRng(seed).fork('field'), …)` + `runRace(…)`. 레이스 i 의 설정은 시드 `s = 1000 + i` 에서 결정: 레이스 = `getRaces()[s % 12]`, 두수 = `4 + (s % (maxRunners - 3))`, 마장 = 그 코스 surface 의 마장 목록에서 `s % 길이` 번째, level = 60.
- 무거운 반복은 환경변수 `VERIFY` 로 켠다: `const FULL = !!process.env.VERIFY;` 일반 `npm test` 에서는 작은 횟수, `VERIFY=1 npm run test:verify` 에서는 전체 횟수.

## 1) reproducibility.test.ts
- 레이스 N 개(FULL 1000 / 기본 30)를 각각 **두 번** 실행해 `sim.result` 깊은 비교 100% 일치. 그중 앞 50개(기본 10개)는 replay 까지 깊은 비교.
- 추가: 같은 시드를 다른 순서로 실행(역순)해도 결과가 같다(전역 상태 누수 없음).
- 추가: `JSON.parse(JSON.stringify(result))` 가 원본과 같다(직렬화 가능).

## 2) performance.test.ts
- saint_ourens 3000m 를 쓰는 레이스가 없으므로 race 객체를 복사해 `distance: 3000` 으로 바꾼 것을 사용, 20두, replay 포함. 워밍업 5회 후 N회(FULL 200 / 기본 20) 측정.
- 기준: 평균 < 50ms, p95 < 80ms. 측정값(평균·p95·최대)을 console.log 로 출력.

## 3) balance.test.ts (FULL 에서만 리포트 작성. 기본 모드는 200 레이스로 지표 계산만, 단언은 느슨하게)
레이스 N 개(FULL 3000 / 기본 200)를 replay 없이 실행해 아래 지표를 집계:
1. **인기 1위 승률** (odds 의 소수 오즈가 가장 낮은 말; 같으면 마번 작은 말) + 인기 2·3위 승률. 목표 25~35%.
2. **예상 전력(strength) 1위의 승률** (시장 노이즈 제외 능력 지표 확인용).
3. **게이트별 승률**: 각 레이스를 내측 1/3·중간·외측 1/3 로 나눠 "승리 비율 / 출주 비율" (1.0 = 중립). 코스별로 표.
4. **작전별 승률**: front / prominent / midfield / held_up 각 "승리 수 / 출주 수", 그리고 승리 비율 / 출주 비율.
5. **우승 시간**: 코스·거리·마장별 평균 우승 시간(s) 표.
6. **착차**: 1·2착 착차 라벨 분포(동착·코·짧은머리·머리·목·마신 구간).
7. **이변**: 오즈 10/1 이상 말의 우승 비율.
- 리포트 형식(docs/reports/2026-10-11-m1-race-balance.md): 맨 위 "목표 범위 이탈 지표" 섹션(없으면 "없음"), 이어서 각 지표 표. 실행 조건(N, 시드 범위, 소요 시간) 기재.
- 단언(FULL): 모든 레이스 완주, 리포트 파일 생성. 목표 이탈은 실패로 만들지 말고 리포트 맨 위에 적는다(튜닝은 Opus 가 판단).
- 단언(기본): 모든 레이스 완주, 인기 1위 승률이 10~60% 안.

## 수용 기준
1. `npm test` (기본 모드) 전체 통과, 소요 시간 증가 30초 이내.
2. `VERIFY=1 npm run test:verify` 통과, 재현성 1000/1000, 성능 기준 충족 여부가 출력된다.
3. 리포트가 위 7개 지표를 모두 포함하고, 목표 이탈 지표가 맨 위에 있다.
4. 구현 코드(src/) 수정 없음. 버그를 찾으면 재현 시드와 함께 [발견한 문제]에 적는다.

## 테스트 명령
`npm test && VERIFY=1 npm run test:verify && npm run typecheck && npm run lint`
