/** 공용 기본 타입. 이 디렉터리(src/engine/types)는 Opus 소유 — 명세 없이 수정 금지. */

export type HorseId = string;
export type OwnerId = string;
export type TrainerId = string;
export type JockeyId = string;
/** 상업 생산자(경주에 출주하지 않는 생산·판매 목장, M4-C0). 'brd_' 로 시작 */
export type BreederId = string;
export type RacecourseId = string;
export type RaceId = string;
/** 부계(sire line) 식별자. M2 에서 사용. */
export type SireLineId = string;

/** ISO 3166-1 alpha-2 기반. 실명 허용 대상(국가). */
export type CountryCode = 'GB' | 'IE' | 'FR' | 'DE' | 'IT' | 'JP' | 'US' | 'AU' | 'HK' | 'AE' | 'CA' | 'AR' | 'NZ' | 'ZA' | 'CL';

/** 유로 정수. 소수 금지. */
export type Money = number;

/** '#rrggbb' 소문자 6자리. */
export type HexColor = string;

export type SilksPattern = 'plain' | 'hoops' | 'stripes' | 'quartered' | 'sash' | 'chevrons' | 'spots' | 'star';

/** 승부복 몸통 무늬(M4-E0a, 사용자 도안 2026-10-12). large_spots = 큰 점 3개(대각), large_spots_6 = 큰 점 6개(2열 × 3행) — 사용자 결정 2026-10-16. */
export type SilksBodyPattern =
  | 'plain' | 'hoop' | 'hoops' | 'stripes' | 'braces' | 'cross_belts' | 'sash'
  | 'diamond' | 'diamonds' | 'triple_diamond' | 'chevron' | 'chevrons' | 'epaulets'
  | 'halves_vertical' | 'halves_horizontal' | 'inverted_triangle' | 'triangle'
  | 'large_spots' | 'large_spots_6' | 'small_spots' | 'quartered' | 'seams' | 'star' | 'stars' | 'check'
  | 'disc' | 'cross_of_lorraine' | 'diabolo' | 'collar' | 'border';

/** 승부복 소매 무늬. */
export type SilksSleevePattern =
  | 'plain' | 'hoops' | 'stripes' | 'armlet' | 'armlets' | 'chevrons' | 'diamonds'
  | 'spots' | 'stars' | 'seams' | 'halves' | 'check' | 'cuffs';

/** 승부복 모자 무늬. peak = 챙색, pompon = 방울색. */
export type SilksCapPattern =
  | 'plain' | 'hooped' | 'striped' | 'quartered' | 'spots' | 'star' | 'stars'
  | 'diamonds' | 'check' | 'peak' | 'pompon';

/** 무늬 층 하나(무늬 + 색). */
export interface SilksLayer<P extends string> {
  pattern: P;
  colour: HexColor;
}

/** 승부복 한 부분: 바탕색 + 무늬 층 0~2개(아래 층 → 위 층 순으로 그린다, 같은 무늬 중복 허용). */
export interface SilksPart<P extends string> {
  base: HexColor;
  layers: SilksLayer<P>[];
}

/** 몸통·소매·모자 세 부분 설계(M4-E0a). */
export interface SilksDesign {
  body: SilksPart<SilksBodyPattern>;
  sleeves: SilksPart<SilksSleevePattern>;
  cap: SilksPart<SilksCapPattern>;
}

/**
 * 마주 승부복. 띠 뷰어의 원판 색은 primary.
 * design 이 있으면 primary = design.body.base, secondary = 몸통 첫 층 색(없으면 소매 바탕), pattern = 몸통 첫 층의 원판 축약.
 * design 이 없으면(기존 저장·AI 마주) 화면은 people/silks.ts 의 유도 함수로 세 부분을 만든다 — 저장 마이그레이션 없음.
 */
export interface Silks {
  primary: HexColor;
  secondary: HexColor;
  pattern: SilksPattern;
  design?: SilksDesign;
}
