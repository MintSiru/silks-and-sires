/**
 * cyrb128 문자열 해시. 문자열 → 32비트 부호 없는 정수 4개 (sfc32 시드용).
 * 순수 함수. 같은 입력 = 같은 출력.
 */

const INIT_H1 = 1779033703;
const INIT_H2 = 3144134277;
const INIT_H3 = 1013904242;
const INIT_H4 = 2597477432;

const MIX_1 = 597399067;
const MIX_2 = 2869860233;
const MIX_3 = 951274213;
const MIX_4 = 2716044179;

/** cyrb128: 문자열 → 32비트 부호 없는 정수 4개 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = INIT_H1;
  let h2 = INIT_H2;
  let h3 = INIT_H3;
  let h4 = INIT_H4;

  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, MIX_1);
    h2 = h3 ^ Math.imul(h2 ^ k, MIX_2);
    h3 = h4 ^ Math.imul(h3 ^ k, MIX_3);
    h4 = h1 ^ Math.imul(h4 ^ k, MIX_4);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), MIX_1);
  h2 = Math.imul(h4 ^ (h2 >>> 22), MIX_2);
  h3 = Math.imul(h1 ^ (h3 >>> 17), MIX_3);
  h4 = Math.imul(h2 ^ (h4 >>> 19), MIX_4);

  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
