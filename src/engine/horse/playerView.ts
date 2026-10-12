import { RETAINER_EYE_BONUS } from '../config/economy';
import {
  PLAYER_ASSESSOR_SKILL,
  STAGE_ADULT_MIN_AGE,
  STAGE_FOAL_MAX_AGE,
  STAGE_YEARLING_MAX_AGE,
} from '../config/playerView';
import { contractFor } from '../economy/contractQuery';
import { createRng } from '../rng';
import type {
  Assessment,
  AssessmentStage,
  GameDate,
  GameState,
  Horse,
  HorseId,
  Stallion,
  TrainerId,
} from '../types';
import { assessHorse } from './assessment';
import { ageInYearsAt } from './growth';

/** 상마안(eye) 척도 상한. 전속 가산 뒤에도 이 값을 넘지 않는다 */
const EYE_SCALE_MAX = 100;

/** 문자열 오름차순 비교(localeCompare 미사용: 환경 독립 정렬). */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * 평가 단계. status 'in_training' 이면 in_training, 그 외 나이 < STAGE_FOAL_MAX_AGE 이면 foal,
 * < STAGE_YEARLING_MAX_AGE 이면 yearling, < STAGE_ADULT_MIN_AGE 이면 two_year_old,
 * 그 이상(성마)은 in_training(현재 능력 반영 단계).
 */
export function stageFor(horse: Horse, date: GameDate): AssessmentStage {
  if (horse.status === 'in_training') return 'in_training';
  const age = ageInYearsAt(horse.birthYear, date);
  if (age < STAGE_FOAL_MAX_AGE) return 'foal';
  if (age < STAGE_YEARLING_MAX_AGE) return 'yearling';
  if (age < STAGE_ADULT_MIN_AGE) return 'two_year_old';
  return 'in_training';
}

/**
 * 조교사의 평가자 능력(0~100, M4-C6): 상마안(eye), 전속 계약 중이면 RETAINER_EYE_BONUS 가산(최대 100).
 * 세일 동행 검사(sales/inspection)와 내 말 소견(assessorSkillFor)이 함께 쓴다. 없는 조교사면 throw.
 */
export function trainerAssessorSkill(state: GameState, trainerId: TrainerId): number {
  const trainer = state.trainers[trainerId];
  if (trainer === undefined) {
    throw new Error(`조교사가 없음: ${trainerId}`);
  }
  const bonus = contractFor(state, 'trainer', trainerId) === undefined ? 0 : RETAINER_EYE_BONUS;
  return Math.min(EYE_SCALE_MAX, trainer.eye + bonus);
}

/**
 * 말의 소견 평가자 능력. 조교사가 있으면 trainerAssessorSkill, 없으면 PLAYER_ASSESSOR_SKILL.
 */
export function assessorSkillFor(state: GameState, horse: Horse): number {
  if (horse.trainerId === null) return PLAYER_ASSESSOR_SKILL;
  return trainerAssessorSkill(state, horse.trainerId);
}

/**
 * 플레이어 시점 평가. 현재 주(state.date) 기준 단서를 만든다.
 * assessorSkill 을 주지 않으면 assessorSkillFor(state, horse) 를 쓴다(주면 그 값).
 * rng 는 `assess:${horseId}:${year}:${week}` 로 새로 만들며 state.rng 를 소비하지 않는다.
 * 같은 주에 다시 보면 같은 결과, 주가 바뀌면 달라질 수 있다.
 */
export function assessForPlayer(
  state: GameState,
  horseId: HorseId,
  assessorSkill?: number,
): Assessment {
  const horse = state.horses[horseId];
  if (horse === undefined) {
    throw new Error(`assessForPlayer: 말이 없음: ${horseId}`);
  }
  const date = state.date;
  const skill = assessorSkill ?? assessorSkillFor(state, horse);
  const rng = createRng(`assess:${horseId}:${date.year}:${date.week}`);
  return assessHorse(horse, stageFor(horse, date), skill, date, rng);
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
  // 아직 교배 시작 전(첫 시즌·임대 복귀 전)인 종마는 목록에서 뺀다
  const rows = Object.values(state.stallions)
    .filter((stallion) => stallion.firstSeasonYear <= state.date.year)
    .map((stallion) => {
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
