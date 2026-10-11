/** 인물(기수·조교사·마주) 생성·초기화 밸런스 상수. 초기값이며 Opus 가 조정한다. */
import type { OwnerTier, SilksPattern } from '../types';

/** 인원 설정이 있는 국가 */
export type PeopleCountry = 'GB' | 'IE' | 'FR' | 'DE' | 'IT' | 'US';

export interface PeopleCount {
  jockeys: number;
  trainers: number;
  owners: number;
}

/** 국가별 AI 인물 수 */
export const PEOPLE_PER_COUNTRY: Readonly<Record<PeopleCountry, PeopleCount>> = {
  GB: { jockeys: 40, trainers: 45, owners: 70 },
  IE: { jockeys: 30, trainers: 35, owners: 50 },
  FR: { jockeys: 35, trainers: 40, owners: 60 },
  DE: { jockeys: 12, trainers: 14, owners: 22 },
  IT: { jockeys: 12, trainers: 14, owners: 22 },
  US: { jockeys: 30, trainers: 30, owners: 50 },
};

/** 초기화 순서(결정적 생성을 위해 고정) */
export const PEOPLE_COUNTRY_ORDER: readonly PeopleCountry[] = ['GB', 'IE', 'FR', 'DE', 'IT', 'US'];

/** ID 형식: 접두어 + 0 패딩 일련번호 (예: jk-000001) */
export const JOCKEY_ID_PREFIX = 'jk-';
export const TRAINER_ID_PREFIX = 'tr-';
export const OWNER_ID_PREFIX = 'ow-';
export const PEOPLE_ID_DIGITS = 6;

/** 이름 뽑기 최대 시도 횟수(중복·차단 조합이면 다시 뽑는다) */
export const NAME_MAX_ATTEMPTS = 50;
/** 여성 이름 비율(모든 역할 공통) */
export const PERSON_FEMALE_CHANCE = 0.2;

/** 인물 능력 0~100 (숨김). 기수 세부 능력·조교사 skill 에 공통으로 쓴다 */
export const PERSON_ABILITY_MIN = 0;
export const PERSON_ABILITY_MAX = 100;

/** 기수 */
export const JOCKEY_SKILL_MEAN = 55;
export const JOCKEY_SKILL_SD = 12;
export const JOCKEY_AGE_MIN = 18;
export const JOCKEY_AGE_MAX = 45;
/** 견습 기수 나이 상한. 견습은 [JOCKEY_AGE_MIN, JOCKEY_APPRENTICE_AGE_MAX], 정식 기수는 그 다음 해부터 */
export const JOCKEY_APPRENTICE_AGE_MAX = 21;
/** 견습 비율 */
export const JOCKEY_APPRENTICE_CHANCE = 0.2;
/** 견습 감량(lb) 후보. 정식 기수는 0 */
export const APPRENTICE_ALLOWANCE_LB: readonly number[] = [3, 5, 7];
export const JOCKEY_RIDING_WEIGHT_MIN_LB = 112;
export const JOCKEY_RIDING_WEIGHT_MAX_LB = 130;
/** 자국 이름 풀 대신 다른 국가 이름 풀을 쓸 확률(국적 표시는 자국 그대로) */
export const JOCKEY_FOREIGN_NAME_CHANCE = 0.2;
/** 잘 맞는 작전이 없는 기수 비율 */
export const JOCKEY_PREFERRED_STYLE_NONE_CHANCE = 0.25;

/** 조교사 */
export const TRAINER_AGE_MIN = 30;
export const TRAINER_AGE_MAX = 75;
export const TRAINER_SKILL_MEAN = 55;
export const TRAINER_SKILL_SD = 12;
/** 수용 두수: skill 을 [MIN, MAX] 로 선형 매핑 */
export const TRAINER_CAPACITY_MIN = 20;
export const TRAINER_CAPACITY_MAX = 180;
export const FACILITY_GRADE_MIN = 1;
export const FACILITY_GRADE_MAX = 5;
/** staminaBias ~ N(0, SD), ±LIMIT 로 자른다 */
export const TRAINER_STAMINA_BIAS_SD = 0.4;
export const TRAINER_STAMINA_BIAS_LIMIT = 1;
/** 주당 조교료 = 시설 등급 × 이 값(€) */
export const WEEKLY_FEE_PER_FACILITY_GRADE = 1500;
/** 조교사 성향 판정 기준: juvenileFocus ≥ 이 값 → early_juveniles */
export const TRAINER_JUVENILE_STYLE_MIN = 0.7;
/** staminaBias ≥ 이 값 → stayers, ≤ −이 값 → sprinters */
export const TRAINER_BIAS_STYLE_THRESHOLD = 0.3;
/** 나머지 중 patient 가 될 확률(아니면 all_round) */
export const TRAINER_PATIENT_CHANCE = 0.5;

/** 마주 */
export const OWNER_TIER_ORDER: readonly OwnerTier[] = ['major', 'mid', 'small'];
export const OWNER_TIER_WEIGHTS: Readonly<Record<OwnerTier, number>> = { major: 0.08, mid: 0.3, small: 0.62 };
/** 자금 범위(€, 정수) */
export const OWNER_FUNDS_RANGE: Readonly<Record<OwnerTier, { min: number; max: number }>> = {
  major: { min: 20_000_000, max: 80_000_000 },
  mid: { min: 2_000_000, max: 10_000_000 },
  small: { min: 200_000, max: 1_500_000 },
};
/** 생산목장(studName) 보유 확률 */
export const OWNER_STUD_CHANCE: Readonly<Record<OwnerTier, number>> = { major: 0.6, mid: 0.3, small: 0 };
/** 관명 접두어(namePrefix) 보유 확률 */
export const OWNER_NAME_PREFIX_CHANCE: Readonly<Record<OwnerTier, number>> = { major: 0.4, mid: 0, small: 0 };
/** 접두어 단어 길이 범위(자, 양끝 포함) */
export const NAME_PREFIX_MIN_LENGTH = 2;
export const NAME_PREFIX_MAX_LENGTH = 8;

/** 승부복 */
export const SILK_PALETTE: readonly string[] = [
  '#d62828',
  '#1d4e89',
  '#ffd23f',
  '#ffffff',
  '#111111',
  '#2a9d8f',
  '#f4a261',
  '#6a4c93',
  '#8ac926',
  '#e76f51',
  '#00b4d8',
  '#ff9ff3',
  '#7f5539',
  '#adb5bd',
  '#0b6e4f',
  '#fbc4ab',
];
/** 두 색의 RGB 유클리드 거리 최소값(이 미만이면 '대비'가 아니다) */
export const SILK_CONTRAST_MIN = 150;
export const SILK_PATTERNS: readonly SilksPattern[] = [
  'plain',
  'hoops',
  'stripes',
  'quartered',
  'sash',
  'chevrons',
  'spots',
  'star',
];
/** 중복 조합(primary, secondary, pattern) 회피 최대 시도 횟수 */
export const SILK_MAX_ATTEMPTS = 50;

/** 목장 이름에서 지명 앞에 오는 단어(프·독·이·포어식). 그 밖의 단어는 지명 뒤("Wendlesham Stud") */
export const STUD_WORDS_BEFORE_NAME: ReadonlySet<string> = new Set([
  'Haras',
  'Haras de',
  'Domaine',
  'Gestüt',
  'Stall',
  'Allevamento',
  'Tenuta',
  'Razza',
  'Coudelaria',
  'Fazenda',
]);
