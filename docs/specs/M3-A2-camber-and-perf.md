# M3-A2 캠버(횡경사) 반영 + 레이스 계산 성능 회귀 조사

담당: haiku-coder · 선행: M3-A1

## 목적
(1) 코스 구간의 캠버를 시뮬레이션에 반영한다(Epsom 형 기운 직선, 기울어진 코너). (2) M1 완료 시점 대비 레이스 계산이 느려진 원인을 찾아 보고한다(수정은 원인이 명확하고 골든 불변일 때만).

## 공용 타입 (Opus 가 이미 수정 — 수정 금지)
- `TrackSegment.camber?: number` (−1~+1, 생략 = 0. + = 안쪽 레일 쪽으로 기움)
- `RacePathSample.camber: number` (현재 구간의 캠버, 생략 시 0)
- 지금 typecheck 오류 3건(path.ts 1, tests/ui 2)은 RacePathSample.camber 누락 때문이다. 고쳐라.

## 생성·수정할 파일
1. `src/engine/course/path.ts` — sample/sampleInto 가 camber 를 채운다(구간 값 ?? 0). 결승선 너머 연장 구간은 마지막 구간 값.
2. `src/engine/course/load.ts` — camber 검증: 숫자이고 −1~+1, 아니면 오류.
3. `src/engine/race/simulate.ts` — 레인 갱신에 캠버 드리프트 추가: 이번 틱 레인 변화량에 `−camber × CAMBER_DRIFT_MPS × dt` (+ 면 안쪽(레인 감소), − 면 바깥쪽). 기존 레일 드리프트·추월 로직 뒤에 더하고 기존 clamp 를 그대로 적용. **camber = 0 이면 계산 결과가 비트 단위로 같아야 한다**(0 일 때는 더하지 않는 분기로).
4. `src/engine/config/sim.ts` — `CAMBER_DRIFT_MPS = 0.25` 와 설명 주석.
5. 테스트: `tests/engine/simulate.test.ts`(또는 새 파일 `tests/engine/camber.test.ts`) — 수용 기준 2~3. tests/ui 의 두 목(mock) 객체에 `camber: 0` 추가.

## 성능 조사 (코드 수정 없이 먼저 보고)
- 기준: M1 완료 커밋 `3dc9684` 에서 `npx vitest run tests/verify/performance.test.ts` 평균 23.7ms. 현재 HEAD 평균 약 33ms.
- `git worktree add <scratchpad>/m1 3dc9684` 로 옛 코드를 따로 받아 같은 머신에서 두 번씩 측정한다(worktree 는 끝나고 `git worktree remove`).
- 차이가 나는 단계를 좁힌다: 필드 생성(sampleField/generateHorse) / prepareRunner / simulate / results / replay. 각 단계 시간을 측정하는 임시 스크립트는 scratchpad 에 둔다(저장소에 남기지 말 것).
- 보고서에 단계별 ms(옛/새)와 원인 추정을 적는다. 원인이 한 함수로 좁혀지고 고쳐도 골든이 그대로면 고쳐도 된다. 아니면 고치지 말고 보고만.

## 수용 기준
1. typecheck·lint·npm test 통과. 골든(tests/engine/simGolden.test.ts) 그대로 통과(픽스처 재생성 금지).
2. 같은 코스·시드에서 마지막 코너 구간 camber +1 로 바꾼 경우, 그 구간에서 주자 평균 레인이 camber 0 보다 작다(안쪽). −1 이면 크다.
3. camber 범위 밖(1.5) 데이터는 loadRacecourses 가 오류를 낸다.
4. 성능 조사 결과(단계별 표)가 보고서에 있다.

## 금지
src/engine/types 수정 금지. data/ 수정 금지(다른 티켓이 data/racecourses.json 작업 중). git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
