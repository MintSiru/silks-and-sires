import { PLAYER_ASSESSOR_SKILL, STAGE_FOAL_MAX_AGE, STAGE_YEARLING_MAX_AGE } from '../config/playerView';
import { createRng } from '../rng';
import type {
  Assessment,
  AssessmentStage,
  GameDate,
  GameState,
  Horse,
  HorseId,
  Stallion,
} from '../types';
import { assessHorse } from './assessment';
import { ageInYearsAt } from './growth';

/** 문자열 오름차순 비교(localeCompare 미사용: 환경 독립 정렬). */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * 평가 단계. status 'in_training' 이면 in_training, 그 외 나이 < STAGE_FOAL_MAX_AGE 이면 foal,
 * < STAGE_YEARLING_MAX_AGE 이면 yearling, 그 외 two_year_old.
 */
export function stageFor(horse: Horse, date: GameDate): AssessmentStage {
  if (horse.status === 'in_training') return 'in_training';
  const age = ageInYearsAt(horse.birthYear, date);
  if (age < STAGE_FOAL_MAX_AGE) return 'foal';
  if (age < STAGE_YEARLING_MAX_AGE) return 'yearling';
  return 'two_year_old';
}

/**
 * 플레이어 시점 평가. 현재 주(state.date) 기준 단서를 만든다.
 * rng 는 `assess:${horseId}:${year}:${week}` 로 새로 만들며 state.rng 를 소비하지 않는다.
 * 같은 주에 다시 보면 같은 결과, 주가 바뀌면 달라질 수 있다.
 */
export function assessForPlayer(
  state: GameState,
  horseId: HorseId,
  assessorSkill = PLAYER_ASSESSOR_SKILL,
): Assessment {
  const horse = state.horses[horseId];
  if (horse === undefined) {
    throw new Error(`assessForPlayer: 말이 없음: ${horseId}`);
  }
  const date = state.date;
  const rng = createRng(`assess:${horseId}:${date.year}:${date.week}`);
  return assessHorse(horse, stageFor(horse, date), assessorSkill, date, rng);
}

/** 플레이어 마주가 보유한 말(owner.horseIds 기준), id 오름차순. */
export function playerHorses(state: GameState): Horse[] {
  const owner = state.owners[state.playerOwnerId];
  if (owner === undefined) {
    throw new Error(`플레이어 마주가 없음: ${state.playerOwnerId}`);
  }
  const ids = [...owner.horseIds].sort(compareText);
  return ids.map((id) => {
    const horse = state.horses[id];
    if (horse === undefined) {
      throw new Error(`플레이어 보유 말이 없음: ${id}`);
    }
    return horse;
  });
}

/**
 * 교배 가능한 종마 목록. stallions 전체를 종부료 내림차순, 같으면 말 이름 오름차순으로 정렬한다.
 * 이름도 같으면 horseId 오름차순(전순서 보장).
 */
export function availableStallions(state: GameState): { horse: Horse; stallion: Stallion }[] {
  const rows = Object.values(state.stallions).map((stallion) => {
    const horse = state.horses[stallion.horseId];
    if (horse === undefined) {
      throw new Error(`종마 Horse 레코드가 없음: ${stallion.horseId}`);
    }
    return { horse, stallion };
  });
  rows.sort(
    (a, b) =>
      b.stallion.fee - a.stallion.fee ||
      compareText(a.horse.name, b.horse.name) ||
      compareText(a.horse.id, b.horse.id),
  );
  return rows;
}
