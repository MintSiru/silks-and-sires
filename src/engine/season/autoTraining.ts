import {
  AUTO_SELL_KEEP_RACERS, AUTO_SELL_KEEP_RACERS_IN_DEBT, AUTO_TRAINING_MIN_GRADE, AUTO_TRAINING_MIN_RACERS,
} from '../config/autoSell';
import { RETAINER_EXTRA_BOXES } from '../config/economy';
import { PLAYER_TRAINING_START_AGE } from '../config/season';
import { contractFor } from '../economy/contractQuery';
import { assessForPlayer } from '../horse/playerView';
import { ageInYear } from '../time/calendar';
import { GRADE_ORDER, type GameEvent, type GameState, type Grade, type Horse, type WeeklySystem } from '../types';
import { assignTrainerInPlace } from './player';

/** 자동 입사 대상(기준 무관). 위탁 신청·아직 판매되지 않은 카탈로그 로트는 판매를 우선한다. 수동 모드 홈 할 일도 이 목록을 쓴다. */
export function autoTrainingCandidates(state: GameState): Horse[] {
  const forSale = new Set(state.sales.consignments.map((entry) => entry.horseId));
  for (const catalogue of state.sales.catalogues) {
    if (catalogue.status !== 'catalogued') continue;
    for (const lot of catalogue.lots) {
      if (lot.result === null) forSale.add(lot.horseId);
    }
  }
  return Object.values(state.horses).filter((horse) => horse.ownerId === state.playerOwnerId
    && horse.status === 'yearling' && horse.trainerId === null
    && ageInYear(horse.birthYear, state.date.year) >= PLAYER_TRAINING_START_AGE
    && !forSale.has(horse.id))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 플레이어에게 보이는 종합 등급(assessForPlayer, 조교사 없으면 기본 평가자). 난수는 평가 전용 스트림을 쓴다 */
export function playerGradeOf(state: GameState, horse: Horse): Grade {
  return assessForPlayer(state, horse.id).conformation.overall;
}

/** 자동 조교 기준 충족: 등급 순서(GRADE_ORDER, S 가 최상)에서 AUTO_TRAINING_MIN_GRADE 와 같거나 더 높다 */
export function meetsAutoTrainingGrade(grade: Grade): boolean {
  return GRADE_ORDER.indexOf(grade) <= GRADE_ORDER.indexOf(AUTO_TRAINING_MIN_GRADE);
}

/** 현역 두수(조교 중·휴양 중 플레이어 말). 판매 담당의 현역 집단과 같은 기준 */
export function playerRacerCount(state: GameState): number {
  return Object.values(state.horses).filter((horse) => horse.ownerId === state.playerOwnerId
    && (horse.status === 'in_training' || horse.status === 'resting')).length;
}

/** 자동으로 더 보내지 않는 현역 두수 상한: 빚이 있으면 AUTO_SELL_KEEP_RACERS_IN_DEBT, 아니면 AUTO_SELL_KEEP_RACERS */
export function autoTrainingRacerCap(state: GameState): number {
  return state.economy.debt > 0 ? AUTO_SELL_KEEP_RACERS_IN_DEBT : AUTO_SELL_KEEP_RACERS;
}

/**
 * 자동 입사 실제 대상: 자동 입사 후보 중 기준 등급 이상인 말, 등급 높은 순·같으면 id 오름차순.
 * 단 현역이 AUTO_TRAINING_MIN_RACERS 보다 적으면 기준 미달 2세도 등급 높은 순으로 그 두수까지 채운다(M6-B4 최소 현역).
 * 나머지 기준 미달 2세는 판매 담당이 브리즈업 세일 판매 제안으로 낸다.
 */
export function autoTrainingPicks(state: GameState): Horse[] {
  const ranked = autoTrainingCandidates(state)
    .map((horse) => ({ horse, grade: playerGradeOf(state, horse) }))
    .sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)
      || (a.horse.id < b.horse.id ? -1 : a.horse.id > b.horse.id ? 1 : 0));
  const picks = ranked.filter((row) => meetsAutoTrainingGrade(row.grade));
  const shortfall = AUTO_TRAINING_MIN_RACERS - playerRacerCount(state) - picks.length;
  if (shortfall > 0) picks.push(...ranked.filter((row) => !meetsAutoTrainingGrade(row.grade)).slice(0, shortfall));
  return picks.map((row) => row.horse);
}

/**
 * 전속 → 목장 소재국 → 다른 나라, 각 단계는 실력 내림차순·id 오름차순. 난수를 쓰지 않는다.
 * 기준 등급 이상 2세만(최소 현역 예외는 autoTrainingPicks), 현역 두수가 상한(autoTrainingRacerCap)에 닿으면 멈춘다. 남은 2세는 플레이어가 직접 보낼 수 있다.
 */
export function createAutoTrainingSystem(): WeeklySystem {
  return {
    id: 'auto_training',
    run(draft) {
      if (draft.settings.autoSendToTraining === false) return [];
      const candidates = autoTrainingPicks(draft);
      if (candidates.length === 0) return [];
      const country = draft.farm.country ?? draft.owners[draft.playerOwnerId]?.country;
      const trainers = Object.values(draft.trainers);
      const contracted = new Set(draft.relations.contracts
        .filter((contract) => contract.kind === 'trainer').map((contract) => contract.personId));
      const priority = (id: string, home: boolean): number => contracted.has(id) ? 0 : home ? 1 : 2;
      trainers.sort((a, b) => priority(a.id, a.country === country) - priority(b.id, b.country === country)
        || b.skill - a.skill || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const loads = new Map<string, number>();
      for (const horse of Object.values(draft.horses)) {
        if (horse.trainerId !== null) loads.set(horse.trainerId, (loads.get(horse.trainerId) ?? 0) + 1);
      }
      const cap = autoTrainingRacerCap(draft);
      let racers = playerRacerCount(draft);
      const events: GameEvent[] = [];
      for (const horse of candidates) {
        if (racers >= cap) break;
        const trainer = trainers.find((t) => (loads.get(t.id) ?? 0) < t.capacity
          + (contractFor(draft, 'trainer', t.id) === undefined ? 0 : RETAINER_EXTRA_BOXES));
        if (trainer === undefined) break;
        const assigned = assignTrainerInPlace(draft, horse.id, trainer.id);
        if (assigned.ok) {
          events.push(...assigned.events);
          loads.set(trainer.id, (loads.get(trainer.id) ?? 0) + 1);
          racers += 1;
        }
      }
      return events;
    },
  };
}
