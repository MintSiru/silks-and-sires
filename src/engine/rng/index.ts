import type { Rng, RngState } from '../types';
import { cyrb128 } from './hash';

/** 2^32. 부호 없는 32비트 정수를 [0,1) 로 나눌 때 쓴다. */
const UINT32_RANGE = 4294967296;
/** 시드 직후 버리는 출력 수 (초기 상태 편향 완화). */
const WARMUP_STEPS = 12;

type Quad = [number, number, number, number];

/**
 * sfc32 클로저. 상태는 a,b,c,d 네 변수뿐이며 getState() 가 전부를 노출한다.
 * 입력 배열은 복사해서 쓰므로 호출자의 객체를 변형하지 않는다.
 */
function makeRng(init: Quad): Rng {
  let a = init[0] >>> 0;
  let b = init[1] >>> 0;
  let c = init[2] >>> 0;
  let d = init[3] >>> 0;

  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / UINT32_RANGE;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`int(${min}, ${max}): 정수 범위가 아니다`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const rng: Rng = {
    next,
    int,
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
    normal(mean = 0, sd = 1): number {
      // Box–Muller. 호출마다 균등 난수 2개를 소비하고 여분 값은 캐시하지 않는다.
      const u1 = next();
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
      return mean + sd * z;
    },
    chance(p: number): boolean {
      return next() < p;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('pick: 빈 배열에서 고를 수 없다');
      }
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = items.slice();
      for (let i = copy.length - 1; i >= 1; i--) {
        const j = int(0, i);
        const tmp = copy[i] as T;
        copy[i] = copy[j] as T;
        copy[j] = tmp;
      }
      return copy;
    },
    fork(label: string): Rng {
      const v = Math.floor(next() * UINT32_RANGE);
      return createRng(label + ':' + v);
    },
    getState(): RngState {
      return { algo: 'sfc32', s: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] };
    },
  };

  return rng;
}

/** 숫자 또는 문자열 시드로 Rng 를 만든다. 같은 시드 = 같은 수열. */
export function createRng(seed: number | string): Rng {
  const rng = makeRng(cyrb128(String(seed)));
  for (let i = 0; i < WARMUP_STEPS; i++) {
    rng.next();
  }
  return rng;
}

/** 저장된 상태에서 Rng 를 복원한다. 입력 객체는 변형하지 않는다. */
export function rngFromState(state: RngState): Rng {
  return makeRng(state.s);
}
