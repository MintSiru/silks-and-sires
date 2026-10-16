import * as config from '../config/nh';
import { recordMoney } from '../economy/ledger';
import { createRng } from '../rng';
import { nhStoreQuote, sireNhValue } from '../stud/nh';
import type { GameDate, GameEvent, GameState, Horse, HorseId, WeeklySystem } from '../types';
import { meanAbility, ratingFromAbility } from '../world/rating';

const clamp = (value: number, max = config.NH_REPUTATION_MAX) => Math.max(0, Math.min(max, value));

export function nhStoreOpen(state: GameState): boolean {
  return Math.abs(state.date.week - config.NH_STORE_WEEK) <= config.NH_STORE_PLAYER_WEEK_WINDOW;
}

export type NhStoreError = 'not_store_week' | 'not_found' | 'not_player_horse'
  | 'not_male' | 'wrong_age' | 'not_racing' | 'consigned';

export function canSellToNhStore(state: GameState, horseId: HorseId): NhStoreError | null {
  if (!nhStoreOpen(state)) return 'not_store_week';
  const horse = state.horses[horseId];
  if (!horse) return 'not_found';
  if (horse.ownerId !== state.playerOwnerId) return 'not_player_horse';
  if (horse.sex !== 'male') return 'not_male';
  const age = state.date.year - horse.birthYear;
  if (age < config.NH_STORE_PLAYER_MIN_AGE || age > config.NH_STORE_PLAYER_MAX_AGE) return 'wrong_age';
  if (!racing(horse)) return 'not_racing';
  if (state.sales.consignments.some(entry => entry.horseId === horseId)) return 'consigned';
  return null;
}

function racing(horse: Horse): boolean {
  return horse.status === 'in_training' || horse.status === 'resting';
}

/** NH 시장으로 소유를 내보내고 평지 참가 연결을 모두 끊는다. */
function removeFromFlat(state: GameState, horse: Horse, date: GameDate): void {
  const owner = horse.ownerId === null ? undefined : state.owners[horse.ownerId];
  if (owner) owner.horseIds = owner.horseIds.filter(id => id !== horse.id);
  horse.ownerId = null;
  horse.status = 'retired';
  horse.trainerId = null;
  horse.nhSoldYear = date.year;
  for (const meeting of state.seasonState.meetings) {
    for (const race of meeting.races) {
      if (race.status === 'open' || race.status === 'closed') race.declarations = race.declarations.filter(entry => entry.horseId !== horse.id);
    }
  }
}

function updateReputation(state: GameState, sales: readonly { sireId: HorseId | null; price: number }[]): void {
  const groups = new Map<HorseId, { count: number; total: number }>();
  for (const { sireId, price } of sales) {
    if (sireId === null) continue;
    const group = groups.get(sireId) ?? { count: 0, total: 0 };
    group.count++;
    group.total += price;
    groups.set(sireId, group);
  }
  for (const [id, { count, total }] of groups) {
    const stallion = state.stallions[id];
    if (!stallion || (stallion.studRole !== 'nh' && stallion.studRole !== 'dual')) continue;
    const score = clamp(config.NH_REPUTATION_NEUTRAL
      + (total / count / config.NH_STORE_BASE_PRICE - 1) * config.NH_REPUTATION_PRICE_WEIGHT
      + Math.min(count, config.NH_REPUTATION_COUNT_CAP) * config.NH_REPUTATION_COUNT_WEIGHT);
    stallion.nhReputation = clamp((stallion.nhReputation ?? config.NH_REPUTATION_NEUTRAL)
      * (1 - config.NH_REPUTATION_EMA_WEIGHT) + score * config.NH_REPUTATION_EMA_WEIGHT);
  }
}

/** 입력 불변. 이벤트 로그는 호출자가 관리한다. */
export function sellToNhStore(state: GameState, horseId: HorseId):
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: NhStoreError } {
  const error = canSellToNhStore(state, horseId);
  if (error !== null) return { ok: false, error };
  const price = nhStoreQuote(state, horseId)!;
  const draft = structuredClone(state);
  const horse = draft.horses[horseId]!;
  recordMoney(draft, draft.playerOwnerId, 'nh_store_sale', price, draft.date, horseId);
  removeFromFlat(draft, horse, draft.date);
  updateReputation(draft, [{ sireId: horse.sireId, price }]);
  return { ok: true, state: draft,
    events: [{ type: 'nh_store_sold', horseId, price, date: { ...draft.date } }] };
}

/** 등록은 통합 담당. 새 판정은 말·연도별 독립 스트림만 쓴다. */
export function createNhStoreSystem(): WeeklySystem {
  return {
    id: 'nh_store',
    run(state, { date }) {
      if (date.week !== config.NH_STORE_WEEK) return [];
      const events: GameEvent[] = [];
      const sales: { sireId: HorseId | null; price: number }[] = [];
      for (const id of Object.keys(state.horses).sort()) {
        const horse = state.horses[id]!;
        if (horse.ownerId === null || horse.ownerId === state.playerOwnerId || horse.sex !== 'male'
          || date.year - horse.birthYear !== config.NH_STORE_AI_AGE || !racing(horse)
          || state.sales.consignments.some(entry => entry.horseId === id)) continue;
        const owner = state.owners[horse.ownerId];
        if (!owner || owner.isPlayer) continue;
        const flat = clamp(((horse.officialRating ?? ratingFromAbility(meanAbility(horse.potential)))
          - config.NH_STORE_FLAT_RATING_LOW) / config.NH_STORE_FLAT_RATING_RANGE, 1);
        const chance = clamp(config.NH_STORE_CHANCE_BASE
          + sireNhValue(state, horse.sireId) * config.NH_STORE_CHANCE_SIRE_WEIGHT
          + (1 - flat) * config.NH_STORE_CHANCE_FLAT_WEIGHT, config.NH_STORE_CHANCE_MAX);
        if (!createRng(`${state.initialSeed}:nh-store:${id}:${date.year}`).chance(chance)) continue;
        const price = nhStoreQuote(state, id)!;
        owner.funds += price;
        removeFromFlat(state, horse, date);
        sales.push({ sireId: horse.sireId, price });
        events.push({ type: 'nh_store_sold', horseId: id, price, date: { ...date } });
      }
      updateReputation(state, sales);
      return events;
    },
  };
}
