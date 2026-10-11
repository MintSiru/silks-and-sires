# M1-07d 시뮬레이션 성능 2차 (결과 불변)

담당: haiku-coder · 선행: M1-07c 승인(커밋됨)

## 목적
무리 동역학 도입 후 최악 조건(20두·3,000m·리플레이) 계산이 단독 중앙값 약 40ms, 부하 시 50ms 를 넘는다(일반 12두 1,600m 는 약 12ms).
**결과를 비트 단위로 바꾸지 않고** 최악 조건 단독 중앙값을 28ms 이하로 줄인다. 또 성능 테스트를 부하에 덜 흔들리게 만든다.

## 수정·생성할 파일
1. `src/engine/race/simulate.ts`
2. `src/engine/race/tactics.ts` (기존 export 시그니처 유지, 함수 추가 가능)
3. `src/engine/course/path.ts` — `sampleInto` 구현 추가
4. `tests/engine/simulate.test.ts` — 성능 테스트 1개만 수정(아래)
5. `tests/engine/simGolden.test.ts` — 성능 테스트 1개만 수정(아래)

## Opus 가 이미 바꾼 공용 타입
`RacePath` 에 메서드 추가(아래). path.ts 에 구현하라.
```ts
/** sample(s) 와 같은 값을 out 에 써서 반환(새 객체 할당 없음). out.point 객체도 재사용한다 */
sampleInto(s: number, out: RacePathSample): RacePathSample;
```

## 허용 기법
- simulate 에서 러너별로 미리 만든 RacePathSample 객체에 `path.sampleInto` 로 받기(틱당 할당 제거).
- 한 러너의 이웃 관련 판정(막힘, 레인 비었는지 바깥/안쪽, 레일 붙기, 경합, 드래프팅)을 **정렬 순서에서 이웃 창을 한 번만 훑어** 필요한 정보를 모으는 단일 패스로 합치기. 판정 결과는 기존 함수와 정확히 같아야 한다(가장 가까운 막힘 말 + 같으면 작은 index 규칙 포함).
- 무리 보정의 감당 판단 등 러너별 상수 사전 계산, 루프 안 클로저·스프레드·`Math.max(...arr)` 제거.
- 리플레이 프레임 복사는 `slice()` 유지 가능.

## 성능 테스트 수정 (부하 내성)
- 두 성능 테스트 모두 "평균" 대신 **워밍업 5회 후 31회 실행의 중앙값**으로 판정.
- simulate.test.ts: 20두 3000m 리플레이 포함 중앙값 < 50ms (M1 기준).
- simGolden.test.ts: 같은 조건 중앙값 < 35ms.

## 금지
- 시뮬레이션 규칙·config 값 변경 금지. 골든 재생성 금지 — **현재 커밋된 sim-golden.json 과 일치해야 한다**(GENERATE 사용 금지).
- 목록 외 파일, 다른 테스트 수정 금지.

## 수용 기준
1. simGolden 골든 비교 8개 모두 통과(현재 커밋된 골든 그대로).
2. 단독 실행에서 20두 3000m 리플레이 포함 중앙값 ≤ 28ms (보고서에 전/후 중앙값 기재).
3. path 테스트에 sampleInto 가 sample 과 같은 값을 주는지 확인하는 단언을 **simGolden.test.ts 안에** 추가(s = 0, 500, 1000, distance, distance+50).
4. `npm test`, typecheck, lint 통과.

## 테스트 명령
`npx vitest run tests/engine/simGolden.test.ts tests/engine/simulate.test.ts && npm test && npm run typecheck && npm run lint`
