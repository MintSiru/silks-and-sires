import * as config from '../config/stud';
import { createRng } from '../rng';
import type { GameEvent, Stallion, WeeklySystem } from '../types';

/** 나이 계단과 AI 편입 종마의 저종부료 은퇴 확률 중 큰 값을 쓴다. */
export function pensionChance(stallion: Stallion, age: number): number {
  let chance = 0;
  for (const [minAge, probability] of config.STUD_PENSION_BY_AGE) {
    if (age >= minAge) chance = probability;
  }
  if (stallion.aiEntrant && age >= config.STUD_PENSION_LOW_FEE_MIN_AGE
    && stallion.fee <= config.STUD_PENSION_LOW_FEE) {
    chance = Math.max(chance, config.STUD_PENSION_LOW_FEE_CHANCE);
  }
  return chance;
}

/** 시즌 정산 뒤 비플레이어 종마를 말별 독립 스트림으로 은퇴시킨다. */
export function createStudRotationSystem(): WeeklySystem {
  return {
    id: 'stud_rotation',
    run(draft, { date }): GameEvent[] {
      if (date.week !== config.STUD_PENSION_CHECK_WEEK) return [];
      const events: GameEvent[] = [];
      for (const id of Object.keys(draft.stallions).sort()) {
        const stallion = draft.stallions[id]!;
        const horse = draft.horses[id];
        if (horse?.status !== 'stud' || horse.ownerId === draft.playerOwnerId) continue;
        const rng = createRng(`${draft.initialSeed}:stud-pension:${id}:${date.year}`);
        if (!rng.chance(pensionChance(stallion, date.year - horse.birthYear))) continue;
        horse.status = 'retired';
        stallion.lastSeasonYear = date.year;
        const notable = stallion.realKey !== null
          || draft.stud.sales.some((sale) => sale.stallionId === id && sale.mode === 'domestic');
        if (notable) {
          events.push({ type: 'horse_status_changed', horseId: id,
            from: 'stud', to: 'retired', date: { ...date } });
          events.push({ type: 'stallion_pensioned', stallionId: id, reason: 'age', date: { ...date } });
        }
      }
      return events;
    },
  };
}
