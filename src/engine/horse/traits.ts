import type { Coat, Personality } from '../types';

/** 성격 중립값(모든 축 50). 레이스 보정이 0 이 되는 값. 생성·유전 규칙은 M3-C5 가 채운다 */
export const NEUTRAL_TRAIT = 50;

export function neutralPersonality(): Personality {
  return {
    drive: NEUTRAL_TRAIT,
    composure: NEUTRAL_TRAIT,
    fight: NEUTRAL_TRAIT,
    timidity: NEUTRAL_TRAIT,
    stubbornness: NEUTRAL_TRAIT,
  };
}

/** 기본 털색(갈색 bay, 반점 없음). 생성·유전 규칙은 M3-C6 가 채운다 */
export function defaultCoat(): Coat {
  return {
    genes: { extension: ['E', 'e'], agouti: ['A', 'a'], grey: ['g', 'g'], roan: ['rn', 'rn'] },
    face: 'none',
    whiteLegs: 0,
  };
}
