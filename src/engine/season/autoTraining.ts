import { RETAINER_EXTRA_BOXES } from '../config/economy';
import { PLAYER_TRAINING_START_AGE } from '../config/season';
import { contractFor } from '../economy/contractQuery';
import { ageInYear } from '../time/calendar';
import type { GameEvent, GameState, Horse, WeeklySystem } from '../types';
import { assignTrainerInPlace } from './player';

/** 자동 입사 대상. 위탁 신청·아직 판매되지 않은 카탈로그 로트는 판매를 우선한다. */
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

/** 전속 → 목장 소재국 → 다른 나라, 각 단계는 실력 내림차순·id 오름차순. 난수를 쓰지 않는다. */
export function createAutoTrainingSystem(): WeeklySystem {
  return {
    id: 'auto_training',
    run(draft) {
      if (draft.settings.autoSendToTraining === false) return [];
      const candidates = autoTrainingCandidates(draft);
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
      const events: GameEvent[] = [];
      for (const horse of candidates) {
        const trainer = trainers.find((t) => (loads.get(t.id) ?? 0) < t.capacity
          + (contractFor(draft, 'trainer', t.id) === undefined ? 0 : RETAINER_EXTRA_BOXES));
        if (trainer === undefined) break;
        const assigned = assignTrainerInPlace(draft, horse.id, trainer.id);
        if (assigned.ok) {
          events.push(...assigned.events);
          loads.set(trainer.id, (loads.get(trainer.id) ?? 0) + 1);
        }
      }
      return events;
    },
  };
}
