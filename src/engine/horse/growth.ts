import { WEEKS_PER_YEAR } from '../config/game';
import { GROWING_STATUSES, WEANING_WEEK } from '../config/growth';
import { HILL_GALLOP_STAMINA_PER_LEVEL, PADDOCK_GROWTH_PER_LEVEL, YEARLING_COMPLEX_GROWTH_PER_LEVEL } from '../config/farm';
import { facilityLevel } from '../farm/facilities';
import type {
  GameDate,
  GameEvent,
  GameState,
  Horse,
  HorseStatus,
  WeeklySystem,
} from '../types';
import { abilityAtAge } from './growthCurve';

/** 출생 연도 기준 실수 나이. (year - birthYear) + (week - 1) / WEEKS_PER_YEAR */
export function ageInYearsAt(birthYear: number, date: GameDate): number {
  return date.year - birthYear + (date.week - 1) / WEEKS_PER_YEAR;
}

/** 상태를 바꾸고 horse_status_changed 이벤트를 기록한다. */
function changeStatus(
  horse: Horse,
  to: HorseStatus,
  date: GameDate,
  events: GameEvent[],
): void {
  const from = horse.status;
  horse.status = to;
  events.push({ type: 'horse_status_changed', horseId: horse.id, from, to, date });
}

/**
 * 생애 단계 전환.
 * - foal → weanling: 출생 다음 해이거나 WEANING_WEEK 이후
 * - weanling → yearling: 출생 다음 해 이후
 * 'yearling' → 'in_training' 은 M3(조교사 입사)에서 처리한다.
 */
function advanceStatus(horse: Horse, date: GameDate, events: GameEvent[]): void {
  if (horse.status === 'foal' && (date.year > horse.birthYear || date.week >= WEANING_WEEK)) {
    changeStatus(horse, 'weanling', date, events);
  }
  if (horse.status === 'weanling' && date.year >= horse.birthYear + 1) {
    changeStatus(horse, 'yearling', date, events);
  }
}

/**
 * 매주 성장 시스템. GROWING_STATUSES 인 말의 현재 능력을 잠재 × 성숙도로 갱신하고
 * 생애 단계를 전환한다. horseId 오름차순으로 순회하며 rng 는 쓰지 않는다.
 */
export const growthSystem: WeeklySystem = {
  id: 'growth',
  run(draft: GameState, ctx) {
    const events: GameEvent[] = [];
    const ids = Object.keys(draft.horses).sort();

    for (const id of ids) {
      const horse = draft.horses[id];
      if (!horse || !GROWING_STATUSES.includes(horse.status)) continue;

      horse.ability = abilityAtAge(
        horse.potential,
        ageInYearsAt(horse.birthYear, ctx.date),
        horse.growth,
      );
      if (horse.ownerId === draft.playerOwnerId) {
        const age = ctx.date.year - horse.birthYear;
        const untrained = horse.status === 'foal' || horse.status === 'weanling' || horse.status === 'yearling';
        const paddock = age >= 0 && age <= 1
          ? 1 + PADDOCK_GROWTH_PER_LEVEL * facilityLevel(draft, 'paddock') : 1;
        const hill = age === 1 || (age === 2 && untrained)
          ? 1 + HILL_GALLOP_STAMINA_PER_LEVEL * facilityLevel(draft, 'hill_gallop') : 1;
        const complex = (age === 1 || age === 2) && untrained
          ? 1 + YEARLING_COMPLEX_GROWTH_PER_LEVEL * facilityLevel(draft, 'yearling_complex') : 1;
        for (const key of Object.keys(horse.ability) as (keyof Horse['ability'])[]) {
          const multiplier = paddock * (key === 'stamina' ? hill
            : key === 'speed' || key === 'acceleration' ? complex : 1);
          if (multiplier !== 1) horse.ability[key] = Math.min(horse.potential[key], horse.ability[key] * multiplier);
        }
      }
      advanceStatus(horse, ctx.date, events);
    }
    return events;
  },
};
