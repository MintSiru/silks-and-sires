/** M5 장기 목표·서사 밸런스 상수. 설계 docs/m5-plan.md */

/** 세계 연대기 항목(player=false)을 남기는 연수. 플레이어 항목은 영구 보존 */
export const CHRONICLE_WORLD_YEARS = 30;

/** 시상식 명성 보상(기존 레이스·시리즈·연말 리딩 명성에 추가되는 시상식 보상). */
export const CEREMONY_REPUTATION = {
  horseOfTheYear: 8,
  laurel: 4,
  europeFirst: 6,
  europePlaced: 3,
  countryFirst: 3,
  series: 3,
  annualCap: 15,
} as const;

export const CEREMONY_EUROPE_TOP = 3;

/** 목표 id·목표치. 진행 상태는 저장하지 않고 매번 계산한다. */
export const DYNASTY_GOALS = [
  { id: 'first_win', target: 1 },
  { id: 'first_group_win', target: 1 },
  { id: 'first_g1_win', target: 1 },
  { id: 'first_classic_win', target: 1 },
  { id: 'five_classics', target: 5 },
  { id: 'horse_of_the_year', target: 1 },
  { id: 'leading_owner', target: 1 },
  { id: 'leading_breeder', target: 1 },
  { id: 'sire_line_established', target: 1 },
  { id: 'female_family_established', target: 1 },
  { id: 'ten_g1_wins', target: 10 },
  { id: 'thirty_year_dynasty', target: 30 },
] as const;

/** 가상 지명과 결합된 클래식 템플릿 id의 유형 접미사. */
export const CLASSIC_TYPES = ['2000_guineas', '1000_guineas', 'derby', 'oaks', 'st_leger'] as const;

/** M5-C · docs/m5-plan.md 결정 2: 부계 시조의 종마 아들·직계 그룹 우승 자마·합산 우승마 하한 */
export const LINE_MIN_STUD_SONS = 3;
export const LINE_MIN_FOUNDER_GROUP_WINNERS = 3;
export const LINE_MIN_TOTAL_GROUP_WINNERS = 8;
/** M5-C · 결정 3: 딸·외손녀를 통한 3대 안 우승마를 세며, 입상·우승 횟수는 세지 않는다 */
export const FAMILY_GENERATIONS = 3;
export const FAMILY_MIN_BLACK_TYPE_WINNERS = 5;
export const FAMILY_MIN_GROUP_WINNERS = 1;
