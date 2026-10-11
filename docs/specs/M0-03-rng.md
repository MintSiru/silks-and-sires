# M0-03 시드 RNG

담당: haiku-coder · 선행: M0-01

## 목적
`Rng` 인터페이스(src/engine/types/rng.ts)를 sfc32 로 구현한다. 같은 시드 = 같은 수열, 상태 저장·복원 가능.

## 생성할 파일
1. `src/engine/rng/hash.ts`
2. `src/engine/rng/index.ts`
3. `tests/engine/rng.test.ts`

## 사용할 타입 (수정 금지)
```ts
import type { Rng, RngState } from '../types';
```

## 구현 사양
### hash.ts
```ts
/** cyrb128: 문자열 → 32비트 부호 없는 정수 4개 */
export function cyrb128(str: string): [number, number, number, number];
```
표준 cyrb128 알고리즘(h1=1779033703, h2=3144134277, h3=1013904242, h4=2597477432, Math.imul 사용). 결과는 모두 `>>> 0`.

### index.ts
```ts
export function createRng(seed: number | string): Rng;   // 상태 = cyrb128(String(seed)), 이후 next() 12회 버림(warm-up)
export function rngFromState(state: RngState): Rng;     // 상태를 복사해서 사용(입력 객체를 변형하지 않음)
```
- sfc32 한 스텝: 표준 구현 (a,b,c,d; t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11); c = c + t | 0; 반환 (t >>> 0) / 4294967296). 상태 저장 시 각 원소 `>>> 0`.
- `int(min, max)`: 두 인자가 정수가 아니거나 min > max 면 `throw new RangeError`. `min + Math.floor(next() * (max - min + 1))`.
- `range(min, max)`: `min + next() * (max - min)`.
- `normal(mean = 0, sd = 1)`: u1 = next(), u2 = next(); `z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2)`; 반환 `mean + sd * z`. 여분 값 캐시 금지.
- `chance(p)`: `next() < p`.
- `pick(items)`: 빈 배열이면 throw. `items[int(0, len-1)]`.
- `shuffle(items)`: 복사본에 대해 Fisher–Yates (i = len-1 → 1, j = int(0, i)).
- `fork(label)`: `const v = Math.floor(next() * 4294967296);` → `createRng(label + ':' + v)` 와 같은 방식(cyrb128 + warm-up 12회)으로 자식 생성. 부모는 정확히 next() 1회만 소비.
- `getState()`: `{ algo: 'sfc32', s: [a, b, c, d] }` 새 객체.
- 클래스 또는 클로저 어느 쪽이든 가능. 상태 외의 숨은 필드 금지.

## 수용 기준
1. 같은 시드(숫자·문자열 각각)로 만든 두 Rng 의 next() 10,000개가 완전히 같다. 다른 시드는 다르다.
2. 임의 시점에 `getState()` → `rngFromState()` 로 만든 Rng 가 원본과 이후 1,000개 출력이 같다. `JSON.parse(JSON.stringify(state))` 를 거쳐도 같다.
3. next() 100,000개가 모두 [0,1) 이고 평균이 0.5±0.01. `int(1,6)` 100,000회에서 각 눈 빈도가 1/6±0.01, 1과 6이 모두 나온다.
4. `normal()` 100,000개 평균 0±0.02, 표준편차 1±0.02.
5. `fork('a')` 와 `fork('b')`(같은 부모 상태에서 각각) 의 첫 100개 수열이 다르고, 같은 상태에서 `fork('a')` 를 두 번 만들면 같다. fork 전후 부모 상태 차이는 next() 1회분이다.
6. `shuffle` 은 원본 배열을 바꾸지 않고, 결과는 같은 원소의 순열이다. `int(2,1)`, `int(1.5,3)`, `pick([])` 은 throw.
7. 이 파일들에 `Math.random`, `Date` 사용이 없다(`npm run lint` 통과).

## 금지 사항
- `src/engine/types/` 수정 금지. 새 패키지 금지. 목록 외 파일 금지.
- 다른 티켓이 동시에 진행 중일 수 있다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/engine/rng.test.ts && npm run typecheck && npm run lint`
