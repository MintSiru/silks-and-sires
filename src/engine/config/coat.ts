import type { AgoutiAllele, CoatColour, ExtensionAllele, FaceMarking, GreyAllele, RoanAllele } from '../types';

/** 털색 밸런스 상수 (M3-C6a). 값은 명세 기준. 엔진 코드에 숫자를 직접 쓰지 않는다. */

/** 무작위 생성 대립유전자 빈도 (각 좌위 합 1) */
export const COAT_FREQ_EXTENSION: Record<ExtensionAllele, number> = { E: 0.6, e: 0.4 };
export const COAT_FREQ_AGOUTI: Record<AgoutiAllele, number> = { A: 0.45, At: 0.3, a: 0.25 };
export const COAT_FREQ_GREY: Record<GreyAllele, number> = { G: 0.04, g: 0.96 };
export const COAT_FREQ_ROAN: Record<RoanAllele, number> = { Rn: 0.005, rn: 0.995 };

/** 얼굴 반점 가중치 (합 1). 밤색(chestnut)이면 CHESTNUT_FACE_BOOST_FACES 의 가중치에 CHESTNUT_FACE_BOOST 를 곱한다 */
export const COAT_FACE_WEIGHTS: Record<FaceMarking, number> = {
  none: 0.4,
  star: 0.25,
  snip: 0.05,
  stripe: 0.1,
  blaze: 0.2,
};
export const COAT_CHESTNUT_FACE_BOOST = 1.5;
export const COAT_CHESTNUT_FACE_BOOST_FACES: readonly FaceMarking[] = ['blaze', 'stripe'];

/** 흰 양말 다리 수별 가중치. 인덱스 = 다리 수(0~4). 합 1 */
export const COAT_SOCK_WEIGHTS: readonly number[] = [0.45, 0.25, 0.18, 0.07, 0.05];
/** 밤색(chestnut)이면 1개 이상(인덱스 1 이상) 가중치에 곱한다 */
export const COAT_CHESTNUT_SOCK_BOOST = 1.3;

/** 반점 유전: 부 또는 모 한쪽의 값을 그대로 물려받을 확률. 나머지는 가중치로 새로 추첨 */
export const COAT_MARKING_INHERIT_P = 0.4;

/** 회색 밝기(0~1): 출생 시 값, 1년마다 더하는 양, 상한. 나이 = 연도 − 출생연도(음수는 0 으로 본다) */
export const COAT_GREY_BIRTH_LIGHTNESS = 0.1;
export const COAT_GREY_LIGHTNESS_PER_YEAR = 0.12;
export const COAT_GREY_LIGHTNESS_MAX = 1;

/** 실명 종마 털색 미지정 시 쓰는 색 */
export const COAT_DEFAULT_COLOUR: CoatColour = 'bay';
