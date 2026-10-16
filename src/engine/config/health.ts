/** 번식마 질환(M4-H3)의 초기 게임 밸런스. 임상 통계가 아닌 명세의 연간·임신당 확률이다. */
export const MARE_LOSS_PER_PREGNANCY = 0.06;
/** 고령 암말은 임신 전체의 유산 위험을 1.5배로 잡는다. */
export const MARE_LOSS_OLDER_AGE = 18;
export const MARE_LOSS_OLDER_MULTIPLIER = 1.5;

/** 제엽염은 나이가 들수록 늘어난다. [최소 나이, 연간 확률] 계단식. */
export const LAMINITIS_BY_AGE: readonly (readonly [number, number])[] = [
  [0, 0.005],
  [15, 0.015],
  [20, 0.03],
];
/** 제엽염 발병 후 결과 비율: 회복 50%, 번식 은퇴 30%, 사망 20%. */
export const LAMINITIS_RECOVERY_SHARE = 0.5;
export const LAMINITIS_RETIREMENT_SHARE = 0.3;
export const LAMINITIS_DEATH_SHARE = 0.2;
/** 회복해도 종마의 수태율은 5%p 감소한다(하한 0). */
export const LAMINITIS_FERTILITY_LOSS = 0.05;

/** 산통은 나이와 무관하게 연 2%, 발병 후 회복 85%·사망 15%로 잡는다. */
export const COLIC_ANNUAL_CHANCE = 0.02;
export const COLIC_RECOVERY_SHARE = 0.85;
export const COLIC_DEATH_SHARE = 0.15;
