/** 새 게임 시작 화면의 순수 함수·선택지 상수(M4-E0ui, M6-U10 시작 화면 L). 엔진 수치는 config 에서 읽고 여기서는 문구만 만든다. */
import { DEFAULT_ECONOMY_MODE, LEGACY_BANKRUPT_WEEKS } from '../../engine/config/economy';
import { DEFAULT_GAME_SETTINGS, STARTING_PACKAGES, STARTING_RACEHORSE_AGES } from '../../engine/config/farm';
import { CATASTROPHIC_FRACTURE_SHARE } from '../../engine/config/injury';
import type { Difficulty, EconomyMode, HomeCountry, StartType } from '../../engine/types';
import { countryKo, FARM_SIZE_KO, feeKo } from '../game/text';

/** 선택지 한 줄: 고르면 생기는 결과를 짧게 적는다(L2). */
export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** 결과 중심 한 줄 */
  line: string;
}

/** 시작 유형 선택지. 기본값은 오너브리더(DEFAULT_GAME_SETTINGS.startType). */
export const START_TYPE_OPTIONS: readonly ChoiceOption<StartType>[] = [
  { value: 'owner_breeder', label: '오너브리더', line: '목장·번식 암말로 생산과 경주를 함께합니다' },
  { value: 'owner', label: '마주', line: '목장 없이 현역마로 시작합니다' },
];

/** 난이도 선택지. 자금·지급 두수·시설·규모의 실제 수치는 요약 목록에 나온다. */
export const DIFFICULTY_OPTIONS: readonly ChoiceOption<Difficulty>[] = [
  { value: 'easy', label: '쉬움', line: '자금과 지급 말이 가장 넉넉하고 시설이 한 단계 높습니다' },
  { value: 'normal', label: '보통', line: '표준 자금과 규모로 시작합니다' },
  { value: 'hard', label: '어려움', line: '자금이 적고 목장이 작으며 지급 현역마가 줄어듭니다' },
];

/** 경제 모드 선택지(고급 설정). 파산 주 수는 config 값을 그대로 쓴다. */
export const ECONOMY_MODE_OPTIONS: readonly ChoiceOption<EconomyMode>[] = [
  {
    value: 'casual',
    label: '캐주얼',
    line: '파산 없음 · 적자는 빚으로 쌓입니다. 빚이 있으면 유료 지출(경매·시설)이 막히고 교배는 저가(4~5티어) 종마만 됩니다',
  },
  { value: 'legacy', label: '레거시', line: `자금이 ${LEGACY_BANKRUPT_WEEKS}주 연속 음수면 파산합니다` },
];

/** 추천 소재국. 같은 나라의 종마가 초기 혈통에 더 자주 나온다. */
export const RECOMMENDED_HOME_COUNTRY: HomeCountry = 'GB';

/** 소재국 선택 안내(목장·마주 소재국). 실제 나라 이름은 text.ts 의 countryKo 로 붙인다. */
export const HOME_COUNTRY_HINT_KO = '목장과 마주의 나라입니다. 같은 나라 종마가 초기 혈통에 더 자주 나옵니다.';

/** 목장 이름 안내: 빈칸이면 자동 */
export const FARM_NAME_HINT_KO = '빈칸이면 자동으로 정합니다. 2~30자, 글자·공백·하이픈·아포스트로피·마침표.';

/** 예후불량(경주 중 치명적 부상) 설명. 비율은 엔진 config 값에서 만든다. */
export const CATASTROPHIC_INJURY_HINT_KO =
  `경주 중 중증 골절의 약 ${Math.round(CATASTROPHIC_FRACTURE_SHARE * 100)}%가 사망합니다. 끄면 경주 중 중증 골절이 사망으로 이어지지 않습니다.`;

/** 지급 현역마 체크 설명(오너브리더에서만 보인다). */
export const GRANT_RACEHORSES_HINT_KO = '끄면 현역마 없이 번식 암말과 목장만으로 시작합니다.';

/** 시작 조건 한 묶음(추천 판정용) */
export interface StartChoice {
  startType: StartType;
  difficulty: Difficulty;
  homeCountry: HomeCountry;
  economyMode: EconomyMode;
  grantRacehorses: boolean;
  catastrophicInjuries: boolean;
}

/** 추천 조건: 엔진 기본 설정과 같은 값(오너브리더·보통·영국·캐주얼·현역마 지급·예후불량 켬). */
export const RECOMMENDED_START: StartChoice = {
  startType: DEFAULT_GAME_SETTINGS.startType,
  difficulty: DEFAULT_GAME_SETTINGS.difficulty,
  homeCountry: RECOMMENDED_HOME_COUNTRY,
  economyMode: DEFAULT_ECONOMY_MODE,
  grantRacehorses: true,
  catastrophicInjuries: DEFAULT_GAME_SETTINGS.catastrophicInjuries,
};

/**
 * 고른 조건이 추천 조건과 같은지. 마주 시작은 현역마 지급 선택과 무관하다(엔진이 현역마를 준다).
 */
export function isRecommendedStart(choice: StartChoice): boolean {
  const r = RECOMMENDED_START;
  return choice.startType === r.startType &&
    choice.difficulty === r.difficulty &&
    choice.homeCountry === r.homeCountry &&
    choice.economyMode === r.economyMode &&
    choice.catastrophicInjuries === r.catastrophicInjuries &&
    (choice.startType === 'owner' || choice.grantRacehorses === r.grantRacehorses);
}

/** 값 → 선택지 이름. 목록에 없으면 값 그대로 돌려준다. */
function labelOf<T extends string>(options: readonly ChoiceOption<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** 추천 조건 문구: "오너브리더 · 보통 · 영국 · 캐주얼" */
export function recommendedStartKo(): string {
  const r = RECOMMENDED_START;
  return [
    labelOf(START_TYPE_OPTIONS, r.startType),
    labelOf(DIFFICULTY_OPTIONS, r.difficulty),
    countryKo(r.homeCountry),
    labelOf(ECONOMY_MODE_OPTIONS, r.economyMode),
  ].join(' · ');
}

/** 나이 목록 → "3세·2세" */
function agesKo(ages: readonly number[]): string {
  return ages.map((age) => `${age}세`).join('·');
}

/**
 * 고른 시작 조건을 요약 줄 목록으로 만든다.
 * 오너브리더는 번식 암말·현역마(grantRacehorses 가 false 면 0두)·목장 줄을, 마주는 현역마·목장 없음 줄을 준다.
 */
export function startSummaryKo(startType: StartType, difficulty: Difficulty, grantRacehorses: boolean): string[] {
  const pkg = STARTING_PACKAGES[difficulty];
  const lines: string[] = [`시작 자금 ${feeKo(pkg.funds)}`];

  if (startType === 'owner') {
    lines.push(`현역마 ${pkg.ownerRacehorses}두(${agesKo(STARTING_RACEHORSE_AGES.slice(0, pkg.ownerRacehorses))})`);
    lines.push('목장 없음 — 목장을 사면 오너브리더');
    return lines;
  }

  lines.push(`번식 암말 ${pkg.mares}두`);
  const racehorses = grantRacehorses ? pkg.breederRacehorses : 0;
  lines.push(
    racehorses === 0
      ? '현역마 없음'
      : `현역마 ${racehorses}두(${agesKo(STARTING_RACEHORSE_AGES.slice(0, racehorses))})`,
  );
  lines.push(`${FARM_SIZE_KO[pkg.farmSize]} 목장 · 시설 ${pkg.facilityLevel}단계`);
  return lines;
}
