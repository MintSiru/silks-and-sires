/** 공용 기본 타입. 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지. */

export type HorseId = string;
export type OwnerId = string;
export type TrainerId = string;
export type JockeyId = string;
export type RacecourseId = string;
export type RaceId = string;
/** 부계(sire line) 식별자. M2 에서 사용. */
export type SireLineId = string;

/** ISO 3166-1 alpha-2 기반. 실명 허용 대상(국가). */
export type CountryCode = 'GB' | 'IE' | 'FR' | 'DE' | 'IT' | 'JP' | 'US' | 'AU' | 'HK' | 'AE';

/** 유로 정수. 소수 금지. */
export type Money = number;

/** '#rrggbb' 소문자 6자리. */
export type HexColor = string;

export type SilksPattern = 'plain' | 'hoops' | 'stripes' | 'quartered' | 'sash' | 'chevrons' | 'spots' | 'star';

/** 마주 승부복. 띠 뷰어의 원판 색은 primary. */
export interface Silks {
  primary: HexColor;
  secondary: HexColor;
  pattern: SilksPattern;
}
