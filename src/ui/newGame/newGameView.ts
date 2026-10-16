/** 새 게임 설정 화면의 순수 함수·선택지 상수(M4-E0ui). 엔진 수치는 config 에서 읽고 여기서는 문구만 만든다. */
import { STARTING_PACKAGES, STARTING_RACEHORSE_AGES } from '../../engine/config/farm';
import { CATASTROPHIC_FRACTURE_SHARE } from '../../engine/config/injury';
import type { Difficulty, StartType } from '../../engine/types';
import { FARM_SIZE_KO, feeKo } from '../game/text';

/** 시작 유형 선택지. 기본값은 오너브리더(DEFAULT_GAME_SETTINGS.startType). */
export const START_TYPE_OPTIONS: readonly { value: StartType; label: string; description: string }[] = [
  {
    value: 'owner_breeder',
    label: '오너브리더',
    description: '목장과 번식 암말을 갖고 시작합니다. 교배와 생산이 중심입니다.',
  },
  {
    value: 'owner',
    label: '마주',
    description: '목장 없이 현역마만 갖고 시작합니다. 목장을 사면 오너브리더가 됩니다.',
  },
];

/** 난이도 선택지. 자금·지급 두수·시설·규모의 실제 수치는 요약 목록에 나온다. */
export const DIFFICULTY_OPTIONS: readonly { value: Difficulty; label: string; description: string }[] = [
  { value: 'easy', label: '쉬움', description: '시작 자금과 지급 두수가 가장 넉넉하고 시설이 한 단계 높습니다.' },
  { value: 'normal', label: '보통', description: '표준 시작입니다.' },
  { value: 'hard', label: '어려움', description: '시작 자금이 적고 목장이 작으며 지급 현역마가 줄어듭니다.' },
];

/** 소재국 선택지 안내(목장·마주 소재국). 실제 나라 이름은 text.ts 의 countryKo 로 붙인다. */
export const HOME_COUNTRY_HINT_KO = '목장과 마주의 소재국입니다. 같은 나라의 종마가 초기 혈통에 더 자주 나옵니다.';

/** 예후불량(경주 중 치명적 부상) 설명. 비율은 엔진 config 값에서 만든다. */
export const CATASTROPHIC_INJURY_HINT_KO =
  `경주 중 중증 골절의 약 ${Math.round(CATASTROPHIC_FRACTURE_SHARE * 100)}%가 사망합니다. 끄면 경주 중 중증 골절이 사망으로 이어지지 않습니다.`;

/** 지급 현역마 체크 설명(오너브리더에서만 보인다). */
export const GRANT_RACEHORSES_HINT_KO = '끄면 현역마 없이 번식 암말과 목장만으로 시작합니다.';

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
