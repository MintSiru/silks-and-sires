/** 성격 5축 밸런스 상수 (M3-C5a). 값은 명세 기준. 엔진 코드에 숫자를 직접 쓰지 않는다. */

/** 성격 축 값 범위(0~100). 중심값 50 = 보통 */
export const PERSONALITY_MIN = 0;
export const PERSONALITY_MAX = 100;
export const PERSONALITY_MEAN = 50;
/** 생성: 각 축 N(PERSONALITY_MEAN, PERSONALITY_SD), 범위 밖은 자른다 */
export const PERSONALITY_SD = 15;
/** 축 편차를 −1~+1 로 정규화하는 분모(= 중심에서 끝까지 거리) */
export const PERSONALITY_SCALE = 50;

/** 유전: 자식 = MEAN + HERITABILITY × (부모 평균 − MEAN) + N(0, INHERIT_SD), 범위 밖은 자른다. 유전력은 낮다 */
export const PERSONALITY_HERITABILITY = 0.35;
export const PERSONALITY_INHERIT_SD = 14;

/**
 * 각질 점수 f = W_DRIVE·(drive−50)/50 − W_COMPOSURE·(composure−50)/50 − W_TIMIDITY·(timidity−50)/50
 *             + W_SPEED·(speed − stamina)/50 + N(0, NOISE_SD)
 * W_COMPOSURE 는 명세의 "w_comp × 0.5" 를 계수 하나로 적은 값이다.
 * 문턱값은 무작위 생성마 5,000두에서 각질 비율이 STYLE_WEIGHTS ±0.04 가 되도록 맞춘 값이다(테스트로 고정).
 */
export const STYLE_SCORE_W_DRIVE = 1.0;
export const STYLE_SCORE_W_COMPOSURE = 0.3;
export const STYLE_SCORE_W_TIMIDITY = 1.0;
export const STYLE_SCORE_W_SPEED = 0.5;
export const STYLE_SCORE_NOISE_SD = 0.6;
/** f ≥ FRONT_MIN → front, f ≥ PROMINENT_MIN → prominent, f ≥ MIDFIELD_MIN → midfield, 그 외 held_up */
export const STYLE_SCORE_FRONT_MIN = 0.77;
export const STYLE_SCORE_PROMINENT_MIN = 0.09;
export const STYLE_SCORE_MIDFIELD_MIN = -0.63;

/** 조교사 코멘트 단서 임계값 */
export const CLUE_HIGH = 70;
export const CLUE_LOW = 30;
export const CLUE_COMPOSURE_LOW = 40;
export const CLUE_COMPOSURE_HIGH = 60;
/** 단서는 50 에서 가장 많이 벗어난 순으로 최대 개수 */
export const CLUE_MAX_COUNT = 2;
